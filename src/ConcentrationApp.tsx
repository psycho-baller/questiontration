import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import Home from './components/Home';
import Lobby from './components/Lobby';
import CollectPhase from './components/CollectPhase';
import Board from './components/Board';
import Results from './components/Results';

type GamePhase = 'home' | 'lobby' | 'collecting' | 'playing' | 'ended';

export default function ConcentrationApp() {
  const [roomCode, setRoomCode] = useState<string>('');
  const [currentRoomId, setCurrentRoomId] = useState<Id<"rooms"> | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('home');

  // Get room state if we have a room code
  const roomState = useQuery(
    api.queries.roomState.roomState,
    roomCode ? { code: roomCode } : 'skip'
  );

  // Get game state if we have a room
  const gameState = useQuery(
    api.queries.gameState.gameState,
    currentRoomId ? { roomId: currentRoomId } : 'skip'
  );

  // Update game phase based on room/game state
  useEffect(() => {
    if (!roomState) {
      setGamePhase('home');
      return;
    }

    if (roomState.room.status === 'lobby') {
      setGamePhase('lobby');
    } else if (roomState.room.status === 'collecting') {
      setGamePhase('collecting');
    } else if (roomState.room.status === 'playing') {
      setGamePhase('playing');
    } else if (roomState.room.status === 'ended') {
      setGamePhase('ended');
    }
  }, [roomState]);

  // Handle room code from URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash && hash.length === 4) {
        setRoomCode(hash.toUpperCase());
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update current room ID when room state changes
  useEffect(() => {
    if (roomState?.room) {
      setCurrentRoomId(roomState.room._id);
    }
  }, [roomState]);

  const handleJoinRoom = (code: string) => {
    setRoomCode(code.toUpperCase());
    window.location.hash = code.toUpperCase();
  };

  const handleLeaveRoom = () => {
    setRoomCode('');
    setCurrentRoomId(null);
    setGamePhase('home');
    window.location.hash = '';
  };

  // Render appropriate component based on game phase
  switch (gamePhase) {
    case 'home':
      return <Home onJoinRoom={handleJoinRoom} />;

    case 'lobby':
      return roomState ? (
        <Lobby
          roomState={roomState}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading lobby...</div>
        </div>
      );

    case 'collecting':
      return roomState && currentRoomId ? (
        <CollectPhase
          roomState={roomState}
          roomId={currentRoomId}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading collection phase...</div>
        </div>
      );

    case 'playing':
      return roomState && gameState && currentRoomId ? (
        <Board
          roomState={roomState}
          gameState={gameState}
          roomId={currentRoomId}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading game board...</div>
        </div>
      );

    case 'ended':
      return roomState && gameState && currentRoomId ? (
        <Results
          roomState={roomState}
          gameState={gameState}
          roomId={currentRoomId}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading results...</div>
        </div>
      );

    default:
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      );
  }
}

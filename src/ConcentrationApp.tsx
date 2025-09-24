import React, { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import Home from './components/Home';
import Lobby from './components/Lobby';

type GameState = 
  | { screen: 'home' }
  | { screen: 'lobby'; roomCode: string }
  | { screen: 'collecting'; roomCode: string }
  | { screen: 'playing'; roomCode: string }
  | { screen: 'results'; roomCode: string };

export default function ConcentrationApp() {
  const [gameState, setGameState] = useState<GameState>(() => {
    // Check URL for room code on initial load
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
      return { screen: 'lobby', roomCode };
    }
    return { screen: 'home' };
  });

  // Update URL when game state changes
  useEffect(() => {
    if (gameState.screen === 'home') {
      window.history.replaceState({}, '', window.location.pathname);
    } else if ('roomCode' in gameState) {
      window.history.replaceState({}, '', `?room=${gameState.roomCode}`);
    }
  }, [gameState]);

  // Query room state to determine current screen
  const roomState = useQuery(
    api.concentrationGame.getRoomState,
    gameState.screen !== 'home' ? { code: gameState.roomCode } : 'skip'
  );

  // Auto-navigate based on room status
  useEffect(() => {
    if (roomState && gameState.screen !== 'home') {
      const roomStatus = roomState.room.status;
      const currentScreen = gameState.screen;

      // Navigate to appropriate screen based on room status
      if (roomStatus === 'lobby' && currentScreen !== 'lobby') {
        setGameState({ screen: 'lobby', roomCode: gameState.roomCode });
      } else if (roomStatus === 'collecting' && currentScreen !== 'collecting') {
        setGameState({ screen: 'collecting', roomCode: gameState.roomCode });
      } else if (roomStatus === 'playing' && currentScreen !== 'playing') {
        setGameState({ screen: 'playing', roomCode: gameState.roomCode });
      } else if (roomStatus === 'ended' && currentScreen !== 'results') {
        setGameState({ screen: 'results', roomCode: gameState.roomCode });
      }
    }
  }, [roomState, gameState]);

  const handleRoomJoined = (roomCode: string) => {
    setGameState({ screen: 'lobby', roomCode });
  };

  const handleGameStart = () => {
    if (gameState.screen !== 'home') {
      setGameState({ screen: 'collecting', roomCode: gameState.roomCode });
    }
  };

  const handleBackToHome = () => {
    setGameState({ screen: 'home' });
  };

  // Render current screen
  switch (gameState.screen) {
    case 'home':
      return <Home onRoomJoined={handleRoomJoined} />;
    
    case 'lobby':
      return (
        <div>
          <div className="fixed top-4 left-4">
            <button
              onClick={handleBackToHome}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              ← Back to Home
            </button>
          </div>
          <Lobby roomCode={gameState.roomCode} onGameStart={handleGameStart} />
        </div>
      );
    
    case 'collecting':
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📝</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Question & Answer Collection
            </h1>
            <p className="text-gray-600 mb-8 max-w-md">
              Players are currently answering questions. This will create the cards for the memory game.
            </p>
            <div className="animate-pulse">
              <div className="bg-blue-200 rounded-full h-2 w-64 mx-auto"></div>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Collection phase in progress...
            </p>
          </div>
        </div>
      );
    
    case 'playing':
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🎮</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Game in Progress
            </h1>
            <p className="text-gray-600 mb-8 max-w-md">
              The memory game is currently being played. Players are taking turns flipping cards to find matching pairs.
            </p>
            <div className="animate-bounce">
              <div className="bg-green-500 rounded-full h-4 w-4 mx-auto"></div>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Game board coming soon...
            </p>
          </div>
        </div>
      );
    
    case 'results':
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🏆</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Game Complete!
            </h1>
            <p className="text-gray-600 mb-8 max-w-md">
              The game has ended. Check out the final scores and see who won!
            </p>
            <button
              onClick={handleBackToHome}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Play Again
            </button>
          </div>
        </div>
      );
    
    default:
      return <Home onRoomJoined={handleRoomJoined} />;
  }
}

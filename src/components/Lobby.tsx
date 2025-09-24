import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSessionMutation } from '../hooks/useServerSession';

interface LobbyProps {
  roomCode: string;
  onGameStart: () => void;
}

export default function Lobby({ roomCode, onGameStart }: LobbyProps) {
  const [gameMode, setGameMode] = useState<'curated' | 'player'>('curated');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [isStarting, setIsStarting] = useState(false);

  const roomState = useQuery(api.concentrationGame.getRoomState, { code: roomCode });
  const startCollection = useSessionMutation(api.concentrationGame.startCollection);

  if (!roomState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading room...</p>
        </div>
      </div>
    );
  }

  const isHost = roomState.currentUserRole === 'host';
  const players = roomState.members.filter(m => m.role === 'player');
  const spectators = roomState.members.filter(m => m.role === 'spectator');

  const handleStartGame = async () => {
    if (!isHost || players.length < 2) return;
    
    setIsStarting(true);
    try {
      await startCollection({
        roomId: roomState.room._id,
        mode: gameMode,
        settings: {
          extraTurnOnMatch: true,
          turnSeconds: 30,
          collectSeconds: 180,
          contentRating: 'PG',
        },
      });
      onGameStart();
    } catch (error) {
      console.error('Failed to start game:', error);
      alert('Failed to start game. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    // You could add a toast notification here
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Concentration Q&A
        </h1>
        <p className="text-gray-600 mb-4">
          Match answers to the same question to score points!
        </p>
        
        {/* Room Code */}
        <div className="inline-flex items-center bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-700 mr-2">Room Code:</span>
          <span className="text-xl font-bold text-blue-900 mr-3">{roomCode}</span>
          <button
            onClick={copyRoomCode}
            className="text-blue-600 hover:text-blue-800 text-sm underline"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Players List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">
            Players ({players.length}/{maxPlayers})
          </h2>
          
          <div className="space-y-3 mb-6">
            {players.map((member) => (
              <div key={member._id} className="flex items-center space-x-3">
                <img
                  src={member.user.avatarUrl || '/default-avatar.png'}
                  alt={member.user.handle}
                  className="w-8 h-8 rounded-full"
                />
                <span className="font-medium">{member.user.handle}</span>
                {member.role === 'host' && (
                  <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                    Host
                  </span>
                )}
              </div>
            ))}
          </div>

          {spectators.length > 0 && (
            <>
              <h3 className="text-lg font-medium mb-3">
                Spectators ({spectators.length})
              </h3>
              <div className="space-y-2">
                {spectators.map((member) => (
                  <div key={member._id} className="flex items-center space-x-3 opacity-75">
                    <img
                      src={member.user.avatarUrl || '/default-avatar.png'}
                      alt={member.user.handle}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-sm">{member.user.handle}</span>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                      Spectator
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Game Settings */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Game Settings</h2>
          
          {isHost ? (
            <div className="space-y-4">
              {/* Game Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Mode
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="gameMode"
                      value="curated"
                      checked={gameMode === 'curated'}
                      onChange={(e) => setGameMode(e.target.value as 'curated')}
                      className="mr-2"
                    />
                    <span>Curated Questions</span>
                    <span className="text-sm text-gray-500 ml-2">
                      (Pre-selected fun questions)
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="gameMode"
                      value="player"
                      checked={gameMode === 'player'}
                      onChange={(e) => setGameMode(e.target.value as 'player')}
                      className="mr-2"
                    />
                    <span>Player Questions</span>
                    <span className="text-sm text-gray-500 ml-2">
                      (Players submit their own questions)
                    </span>
                  </label>
                </div>
              </div>

              {/* Max Players */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Players: {maxPlayers}
                </label>
                <input
                  type="range"
                  min="2"
                  max="8"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Start Game Button */}
              <button
                onClick={handleStartGame}
                disabled={players.length < 2 || isStarting}
                className={`w-full py-3 px-4 rounded-lg font-medium ${
                  players.length >= 2 && !isStarting
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isStarting ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Starting Game...
                  </div>
                ) : (
                  `Start Game (${players.length}/2+ players)`
                )}
              </button>

              {players.length < 2 && (
                <p className="text-sm text-gray-500 text-center">
                  Need at least 2 players to start
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                Waiting for the host to start the game...
              </p>
              <div className="text-sm text-gray-500">
                <p>Mode: {gameMode === 'curated' ? 'Curated Questions' : 'Player Questions'}</p>
                <p>Max Players: {maxPlayers}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Game Rules */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3">How to Play</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <h4 className="font-medium mb-2">🎯 Objective</h4>
            <p>Match pairs of answers that belong to the same question to score points.</p>
          </div>
          <div>
            <h4 className="font-medium mb-2">🎮 Gameplay</h4>
            <p>Take turns flipping two cards. If they match (same question), you get a point and another turn.</p>
          </div>
          <div>
            <h4 className="font-medium mb-2">📝 Questions</h4>
            <p>
              {gameMode === 'curated' 
                ? 'Answer pre-selected questions about preferences and fun topics.'
                : 'Submit your own questions and answer questions from other players.'
              }
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">🏆 Winning</h4>
            <p>The player with the most matched pairs when all cards are revealed wins!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

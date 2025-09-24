import React, { useState } from 'react';
import { useSessionMutation } from '../hooks/useServerSession';
import { api } from '../../convex/_generated/api';

interface HomeProps {
  onRoomJoined: (roomCode: string) => void;
}

export default function Home({ onRoomJoined }: HomeProps) {
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const createRoom = useSessionMutation(api.concentrationGame.createRoom);
  const joinRoom = useSessionMutation(api.concentrationGame.joinRoom);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    
    try {
      const result = await createRoom({
        visibility: 'private',
        maxPlayers: 6,
      });
      onRoomJoined(result.code);
    } catch (err) {
      setError('Failed to create room. Please try again.');
      console.error('Create room error:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;

    setIsJoining(true);
    setError('');

    try {
      const result = await joinRoom({
        code: roomCode.toUpperCase().trim(),
      });
      onRoomJoined(result.code);
    } catch (err) {
      setError('Room not found. Please check the code and try again.');
      console.error('Join room error:', err);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🧠</div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Concentration Q&A
          </h1>
          <p className="text-gray-600">
            A memory game where you match answers to questions!
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Create Room */}
          <div className="mb-6">
            <button
              onClick={handleCreateRoom}
              disabled={isCreating}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 px-6 rounded-lg transition-colors"
            >
              {isCreating ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Creating Room...
                </div>
              ) : (
                'Create New Room'
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* Join Room */}
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-2">
                Enter Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg font-mono tracking-wider"
              />
            </div>
            
            <button
              type="submit"
              disabled={!roomCode.trim() || isJoining}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isJoining ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Joining...
                </div>
              ) : (
                'Join Room'
              )}
            </button>
          </form>
        </div>

        {/* How to Play */}
        <div className="mt-8 text-center">
          <details className="bg-white rounded-lg shadow p-4">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              How to Play 📖
            </summary>
            <div className="mt-4 text-left text-sm text-gray-600 space-y-2">
              <p><strong>1. Setup:</strong> Players answer questions to create a pool of responses.</p>
              <p><strong>2. Game Board:</strong> Answers are placed face-down on a 4×4 grid (16 cards total).</p>
              <p><strong>3. Turns:</strong> Players take turns flipping two cards to find matching pairs.</p>
              <p><strong>4. Matching:</strong> Cards match if they're both answers to the same question.</p>
              <p><strong>5. Scoring:</strong> Each match earns 1 point. Most points wins!</p>
              <p><strong>6. Bonus:</strong> Get an extra turn when you find a match.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

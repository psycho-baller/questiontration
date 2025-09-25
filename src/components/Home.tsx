import React, { useState } from 'react';
import { useSessionMutation } from '../hooks/useServerSession';
import { api } from '../../convex/_generated/api';

interface HomeProps {
  onJoinRoom: (code: string) => void;
}

export default function Home({ onJoinRoom }: HomeProps) {
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const createRoom = useSessionMutation(api.mutations.rooms.createRoom);
  const joinRoom = useSessionMutation(api.mutations.rooms.joinRoom);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      const result = await createRoom({
        visibility: 'private',
        maxPlayers: 8,
      });
      onJoinRoom(result.code);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsJoining(true);
    try {
      await joinRoom({ code: joinCode.toUpperCase() });
      onJoinRoom(joinCode);
    } catch (error) {
      console.error('Failed to join room:', error);
      alert('Failed to join room. Please check the code and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-4 tracking-tight">
            Questiontration
          </h1>
          <p className="text-xl md:text-2xl text-blue-200 mb-2">
            The Memory Game with a Twist
          </p>
          <p className="text-lg text-blue-300 max-w-2xl mx-auto">
            Match answers to the same question in this multiplayer concentration game.
            Create questions together, then test your memory!
          </p>
        </div>

        {/* Game Actions */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Create Room */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-4">Host a Game</h2>
              <p className="text-blue-200 mb-6">
                Create a new room and invite friends to play
              </p>
              <button
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-200 transform hover:scale-105 disabled:scale-100 shadow-lg"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </span>
                ) : (
                  'Create Room'
                )}
              </button>
            </div>

            {/* Join Room */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-4">Join a Game</h2>
              <p className="text-blue-200 mb-6">
                Enter a room code to join an existing game
              </p>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="Enter room code"
                  className="w-full px-4 py-3 text-center text-lg font-mono bg-white/20 border border-white/30 rounded-xl text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  maxLength={6}
                />
                <button
                  type="submit"
                  disabled={isJoining || !joinCode.trim()}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-500 disabled:to-gray-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-200 transform hover:scale-105 disabled:scale-100 shadow-lg"
                >
                  {isJoining ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Joining...
                    </span>
                  ) : (
                    'Join Room'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* How to Play */}
        <div className="mt-12 bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
          <h3 className="text-xl font-bold text-white mb-4 text-center">How to Play</h3>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-blue-200">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 text-white font-bold text-lg">1</div>
              <p><strong className="text-white">Create Questions:</strong> Players submit questions and answers during the collection phase.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-3 text-white font-bold text-lg">2</div>
              <p><strong className="text-white">Memory Game:</strong> Flip cards to find matching answers to the same question.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3 text-white font-bold text-lg">3</div>
              <p><strong className="text-white">Score Points:</strong> Match pairs to earn points. Most points wins!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

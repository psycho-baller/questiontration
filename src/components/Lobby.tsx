import React, { useState } from 'react';
import { useSessionMutation, useSessionQuery } from '../hooks/useServerSession';
import { api } from '../../convex/_generated/api';

interface LobbyProps {
  roomState: {
    room: {
      _id: string;
      code: string;
      hostUserId: string;
      visibility: 'private' | 'public';
      status: 'lobby' | 'collecting' | 'playing' | 'ended';
      maxPlayers: number;
      _creationTime: number;
    };
    host: {
      _id: string;
      handle: string;
      avatarUrl?: string;
    };
    members: Array<{
      _id: string;
      userId: string;
      role: 'host' | 'player' | 'spectator';
      joinedAt: number;
      lastSeenAt: number;
      ready?: boolean;
      user: {
        _id: string;
        handle: string;
        avatarUrl?: string;
      };
    }>;
  };
  onLeaveRoom: () => void;
}

const CURATED_CATEGORIES = {
  'Getting to Know You': ['Icebreaker', 'Personal', 'Deep'],
  'Favorites': ['Superficial', 'Considered', 'Deep'],
  'Hypotheticals': ['Silly', 'Serious', 'Profound'],
  'University Life': ['Campus Life', 'Academics', 'Future'],
  'Dreams and Aspirations': ['Goals', 'Ambition', 'Legacy'],
  'Last Time I...': ['Quick Hits', 'Adventures', 'Vulnerable'],
  'Storytime': ['Lighthearted', 'Wild Tales', 'Reflective'],
  'All bout books': ['Favorites', 'Deep Cuts', 'Perspective'],
  'All bout movies & TV': ['Favorites', 'Recent Watches', 'Emotional'],
  'All bout music': ['Favorites', 'Recent Plays', 'Emotional'],
  'All bout games': ['Favorites', 'Habits', 'Nostalgia'],
  'All bout food': ['Favorites', 'Cravings', 'Comfort'],
  'All bout travel': ['Favorites', 'Memories', 'Transformative'],
};

export default function Lobby({ roomState, onLeaveRoom }: LobbyProps) {
  const [gameMode, setGameMode] = useState<'curated' | 'player'>('curated');
  const [category, setCategory] = useState(Object.keys(CURATED_CATEGORIES)[0]);
  const [level, setLevel] = useState(1);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [collectSeconds, setCollectSeconds] = useState(120);
  const [isStarting, setIsStarting] = useState(false);

  const setReady = useSessionMutation(api.mutations.rooms.setReady);
  const leaveRoom = useSessionMutation(api.mutations.rooms.leaveRoom);
  const kickMember = useSessionMutation(api.mutations.rooms.kickMember);
  const startCollection = useSessionMutation(api.mutations.games.startCollection);

  // Get current user's profile to identify them in the members list
  const myProfile = useSessionQuery(api.users.getMyProfile);

  // Get current user from members using their profile
  const currentUser = myProfile ? roomState.members.find(m => m.user._id === myProfile._id) : null;
  const isHost = currentUser?.role === 'host';
  const isReady = currentUser?.ready || false;

  // Count ready players
  const players = roomState.members.filter(m => m.role === 'player' || m.role === 'host');
  const readyPlayers = players.filter(m => m.ready).length;
  const canStart = players.length >= 2 && readyPlayers === players.length;

  const handleToggleReady = async () => {
    try {
      console.log('Toggling ready state for room:', roomState.room._id);
      await setReady({
        roomId: roomState.room._id as any,
        ready: !isReady,
      });
    } catch (error) {
      console.error('Failed to toggle ready:', error);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom({ roomId: roomState.room._id as any });
      onLeaveRoom();
    } catch (error) {
      console.error('Failed to leave room:', error);
      onLeaveRoom(); // Leave anyway
    }
  };

  const handleKickMember = async (userId: string) => {
    if (!isHost) return;
    try {
      await kickMember({
        roomId: roomState.room._id as any,
        userId: userId as any,
      });
    } catch (error) {
      console.error('Failed to kick member:', error);
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !canStart) return;

    setIsStarting(true);
    try {
      await startCollection({
        roomId: roomState.room._id as any,
        mode: gameMode,
        settings: {
          extraTurnOnMatch: true,
          turnSeconds,
          collectSeconds,
          contentRating: 'PG',
          category: gameMode === 'curated' ? category : undefined,
          level: gameMode === 'curated' ? level : undefined,
        },
      });
    } catch (error) {
      console.error('Failed to start game:', error);
      alert('Failed to start game. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const copyRoomCode = () => {
    const url = `${window.location.origin}${window.location.pathname}#${roomState.room.code}`;
    navigator.clipboard.writeText(url);
    // Could add a toast notification here
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 shadow-2xl border border-white/20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Game Lobby</h1>
              <div className="flex items-center gap-4">
                <span className="text-2xl font-mono bg-white/20 px-4 py-2 rounded-lg text-white">
                  {roomState.room.code}
                </span>
                <button
                  onClick={copyRoomCode}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Copy Link
                </button>
              </div>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Players List */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">
                Players ({players.length}/{roomState.room.maxPlayers})
              </h2>
              <div className="space-y-3">
                {roomState.members.map((member) => (
                  <div
                    key={member._id}
                    className="flex items-center justify-between bg-white/10 rounded-lg p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                        {member.user.handle.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{member.user.handle}</span>
                          {member.role === 'host' && (
                            <span className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
                              HOST
                            </span>
                          )}
                          {member.role === 'spectator' && (
                            <span className="bg-gray-500 text-white px-2 py-1 rounded text-xs">
                              SPECTATOR
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-blue-200">
                          {member.ready ? (
                            <span className="text-green-400">✓ Ready</span>
                          ) : (
                            <span className="text-yellow-400">⏳ Not Ready</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isHost && member.role !== 'host' && (
                      <button
                        onClick={() => handleKickMember(member.userId)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        Kick
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Ready Button */}
              <div className="mt-6 pt-6 border-t border-white/20">
                <button
                  onClick={handleToggleReady}
                  className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                    isReady
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-yellow-500 hover:bg-yellow-600 text-black'
                  }`}
                >
                  {isReady ? '✓ Ready' : 'Mark as Ready'}
                </button>
              </div>
            </div>
          </div>

          {/* Game Settings */}
          <div className="space-y-6">
            {isHost && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-4">Game Settings</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-white font-medium mb-2">Game Mode</label>
                    <select
                      value={gameMode}
                      onChange={(e) => setGameMode(e.target.value as 'curated' | 'player')}
                      className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="curated">Curated Questions</option>
                      <option value="player">Player Questions</option>
                    </select>
                    <p className="text-sm text-blue-200 mt-1">
                      {gameMode === 'player'
                        ? 'Players create their own questions'
                        : 'Use pre-made questions'
                      }
                    </p>
                  </div>

                  {gameMode === 'curated' && (
                    <>
                      <div>
                        <label className="block text-white font-medium mb-2">Category</label>
                        <select
                          value={category}
                          onChange={(e) => {
                            setCategory(e.target.value);
                            setLevel(1); // Reset level when category changes
                          }}
                          className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white"
                        >
                          {Object.keys(CURATED_CATEGORIES).map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-white font-medium mb-2">Depth</label>
                        <select
                          value={level}
                          onChange={(e) => setLevel(Number(e.target.value))}
                          className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white"
                        >
                          {(CURATED_CATEGORIES[category as keyof typeof CURATED_CATEGORIES] || []).map((levelName, index) => (
                            <option key={index} value={index + 1}>
                              {`Level ${index + 1}: ${levelName}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-white font-medium mb-2">
                      Turn Time: {turnSeconds}s
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      value={turnSeconds}
                      onChange={(e) => setTurnSeconds(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-medium mb-2">
                      Collection Time: {Math.floor(collectSeconds / 60)}m {collectSeconds % 60}s
                    </label>
                    <input
                      type="range"
                      min="60"
                      max="300"
                      step="30"
                      value={collectSeconds}
                      onChange={(e) => setCollectSeconds(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Start Game */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Ready to Start?</h2>

              <div className="mb-4">
                <div className="text-white mb-2">
                  Ready: {readyPlayers}/{players.length} players
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(readyPlayers / Math.max(players.length, 1)) * 100}%` }}
                  />
                </div>
              </div>

              {isHost ? (
                <button
                  onClick={handleStartGame}
                  disabled={!canStart || isStarting}
                  className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                    canStart && !isStarting
                      ? 'bg-green-500 hover:bg-green-600 text-white transform hover:scale-105'
                      : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {isStarting ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Starting...
                    </span>
                  ) : canStart ? (
                    'Start Game!'
                  ) : (
                    `Waiting for ${players.length - readyPlayers} more players`
                  )}
                </button>
              ) : (
                <div className="text-center text-blue-200">
                  Waiting for host to start the game...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

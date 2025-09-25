import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSessionMutation } from '../hooks/useServerSession';

interface ResultsProps {
  roomState: {
    room: {
      _id: string;
      code: string;
      hostUserId: string;
    };
    host: {
      _id: string;
      handle: string;
    };
    members: Array<{
      userId: string;
      role: string;
      user: {
        _id: string;
        handle: string;
      };
    }>;
  };
  gameState: {
    game: {
      _id: string;
      status: string;
      completedAt?: number;
      settings: {
        mode: 'curated' | 'player';
      };
    };
    cards: Array<{
      _id: string;
      position: number;
      state: 'faceDown' | 'faceUp' | 'matched';
      answerText?: string;
      questionText?: string;
      questionId: string;
    }>;
    scores: Array<{
      playerId: string;
      points: number;
      playerHandle: string;
    }>;
  };
  roomId: Id<"rooms">;
  onLeaveRoom: () => void;
}

export default function Results({ roomState, gameState, roomId, onLeaveRoom }: ResultsProps) {
  const [isRematchLoading, setIsRematchLoading] = useState(false);
  const [reuseQuestions, setReuseQuestions] = useState(true);

  const rematch = useSessionMutation(api.mutations.games.rematch);
  const leaveRoom = useSessionMutation(api.mutations.rooms.leaveRoom);
  const resetGame = useSessionMutation(api.mutations.games.resetGameProgress);

  const isHost = roomState.members.find(m => m.userId === roomState.host._id)?.role === 'host';

  // Sort scores by points (descending)
  const sortedScores = [...gameState.scores].sort((a, b) => b.points - a.points);
  const winner = sortedScores[0];
  const isTie = sortedScores.length > 1 && sortedScores[0].points === sortedScores[1].points;

  // Group cards by question for display
  const cardsByQuestion = gameState.cards.reduce((acc, card) => {
    if (card.state === 'matched' && card.questionText) {
      if (!acc[card.questionId]) {
        acc[card.questionId] = {
          question: card.questionText,
          answers: [],
        };
      }
      if (card.answerText) {
        acc[card.questionId].answers.push(card.answerText);
      }
    }
    return acc;
  }, {} as Record<string, { question: string; answers: string[] }>);

  const handleRematch = async () => {
    if (!isHost) return;

    setIsRematchLoading(true);
    try {
      await rematch({
        roomId,
        reuseQuestions,
      });
    } catch (error) {
      console.error('Failed to start rematch:', error);
      alert('Failed to start rematch. Please try again.');
    } finally {
      setIsRematchLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom({ roomId });
      onLeaveRoom();
    } catch (error) {
      console.error('Failed to leave room:', error);
      onLeaveRoom();
    }
  };

  const handleResetGame = async () => {
    if (!isHost) return;
    
    const confirmed = window.confirm(
      'Are you sure you want to reset the board? This will clear all progress but keep the same questions and answers, allowing you to replay immediately.'
    );
    
    if (!confirmed) return;

    try {
      await resetGame({ roomId });
    } catch (error) {
      console.error('Failed to reset game:', error);
      alert('Failed to reset game. Please try again.');
    }
  };

  const shareResults = () => {
    const resultsText = `🎉 Questiontration Results!\n\n${
      isTie ? 'It\'s a tie!' : `🏆 ${winner.playerHandle} wins!`
    }\n\nFinal Scores:\n${sortedScores
      .map((score, i) => `${i + 1}. ${score.playerHandle}: ${score.points} points`)
      .join('\n')}\n\nPlay at: ${window.location.origin}${window.location.pathname}`;

    if (navigator.share) {
      navigator.share({
        title: 'Questiontration Results',
        text: resultsText,
      });
    } else {
      navigator.clipboard.writeText(resultsText);
      // Could show a toast here
    }
  };

  const formatGameDuration = () => {
    if (!gameState.game.completedAt) return '';
    // This would need the start time from the game state
    return 'Game completed';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header with Winner Announcement */}
        <div className="text-center mb-8">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/20">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
              🎉 Game Complete! 🎉
            </h1>
            {isTie ? (
              <div className="text-2xl md:text-3xl text-yellow-400 font-bold">
                It's a Tie!
              </div>
            ) : (
              <div className="text-2xl md:text-3xl text-green-400 font-bold">
                🏆 {winner.playerHandle} Wins! 🏆
              </div>
            )}
            <div className="text-blue-200 mt-2">{formatGameDuration()}</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Final Scores */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">Final Scores</h2>
              <div className="space-y-4">
                {sortedScores.map((score, index) => (
                  <div
                    key={score.playerId}
                    className={`flex justify-between items-center p-4 rounded-lg ${
                      index === 0 && !isTie
                        ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50'
                        : 'bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                        index === 0 ? 'bg-yellow-500' :
                        index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                      }`}>
                        {index === 0 && !isTie ? '👑' : index + 1}
                      </div>
                      <span className="text-white font-medium text-lg">{score.playerHandle}</span>
                    </div>
                    <span className="text-white font-bold text-xl">{score.points}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={shareResults}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-bold transition-colors"
                >
                  Share Results
                </button>

                {isHost && (
                  <>
                    <button
                      onClick={handleResetGame}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-bold transition-colors"
                    >
                      Reset Board Only
                    </button>

                    <div className="flex items-center gap-2 text-white">
                      <input
                        type="checkbox"
                        id="reuseQuestions"
                        checked={reuseQuestions}
                        onChange={(e) => setReuseQuestions(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="reuseQuestions" className="text-sm">
                        Reuse questions for rematch
                      </label>
                    </div>
                    <button
                      onClick={handleRematch}
                      disabled={isRematchLoading}
                      className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white py-3 rounded-lg font-bold transition-colors"
                    >
                      {isRematchLoading ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Starting Rematch...
                        </span>
                      ) : (
                        'Start Rematch'
                      )}
                    </button>
                  </>
                )}

                <button
                  onClick={handleLeaveRoom}
                  className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-bold transition-colors"
                >
                  Leave Room
                </button>
              </div>
            </div>
          </div>

          {/* Matched Pairs Review */}
          <div className="lg:col-span-2">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-6">Matched Pairs</h2>
              <div className="grid gap-4 max-h-96 overflow-y-auto">
                {Object.entries(cardsByQuestion).map(([questionId, data], index) => (
                  <div
                    key={questionId}
                    className="bg-white/10 rounded-lg p-4 border border-white/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-bold mb-3">{data.question}</h3>
                        <div className="grid md:grid-cols-2 gap-3">
                          {data.answers.map((answer, answerIndex) => (
                            <div
                              key={answerIndex}
                              className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg p-3 text-white text-center font-medium"
                            >
                              {answer}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Game Stats */}
        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">Game Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-white">{gameState.cards.length}</div>
              <div className="text-blue-200">Total Cards</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{Object.keys(cardsByQuestion).length}</div>
              <div className="text-blue-200">Questions Used</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{sortedScores.reduce((sum, s) => sum + s.points, 0)}</div>
              <div className="text-blue-200">Total Matches</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{roomState.members.length}</div>
              <div className="text-blue-200">Players</div>
            </div>
          </div>
        </div>

        {/* Thank You Message */}
        <div className="mt-6 text-center">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <p className="text-blue-200">
              Thanks for playing Questiontration! 🎮
            </p>
            <p className="text-blue-300 text-sm mt-1">
              Share the room code <span className="font-mono bg-white/20 px-2 py-1 rounded">{roomState.room.code}</span> with friends to play again!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

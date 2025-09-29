import React, { useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSessionMutation, useSessionQuery } from '../hooks/useServerSession';

interface BoardProps {
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
      currentPlayerId?: string;
      turnIndex: number;
      settings: {
        turnSeconds: number;
        extraTurnOnMatch: boolean;
      };
    };
    cards: Array<{
      _id: string;
      position: number;
      state: 'faceDown' | 'faceUp' | 'matched';
      answerText?: string;
      questionText?: string;
    }>;
    scores: Array<{
      playerId: string;
      points: number;
      playerHandle: string;
    }>;
    currentTurn?: {
      _id: string;
      playerId: string;
      picks: string[];
      resolved: boolean;
    };
  };
  roomId: Id<"rooms">;
  onLeaveRoom: () => void;
}

export default function Board({ roomState, gameState, roomId, onLeaveRoom }: BoardProps) {
  const [flippingCards, setFlippingCards] = useState<Set<string>>(new Set());
  const [turnTimeLeft, setTurnTimeLeft] = useState(gameState.game.settings.turnSeconds);
  const [reportingCard, setReportingCard] = useState<string | null>(null);

  const flipCard = useSessionMutation(api.mutations.flips.flipCard);
  const leaveRoom = useSessionMutation(api.mutations.rooms.leaveRoom);
  const reportContent = useSessionMutation(api.mutations.moderation.reportContent);
  const resetGame = useSessionMutation(api.mutations.games.resetGameProgress);
  const myProfile = useSessionQuery(api.users.getMyProfile);

  // Get current user
  const currentUser = roomState.members.find(m =>
    m.user._id === gameState.game.currentPlayerId
  );
  const isCurrentPlayer = gameState.game.currentPlayerId === currentUser?.user._id;
  const isHost = myProfile ? roomState.room.hostUserId === myProfile._id : false;

  // Turn timer
  useEffect(() => {
    if (gameState.currentTurn && !gameState.currentTurn.resolved) {
      setTurnTimeLeft(gameState.game.settings.turnSeconds);
      const timer = setInterval(() => {
        setTurnTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState.currentTurn, gameState.game.settings.turnSeconds]);

  // Sort cards by position for consistent 4x4 grid
  const sortedCards = [...gameState.cards].sort((a, b) => a.position - b.position);

  const handleCardClick = async (cardId: string) => {
    if (!isCurrentPlayer || flippingCards.has(cardId)) return;

    const card = gameState.cards.find(c => c._id === cardId);
    if (!card || card.state !== 'faceDown') return;

    // Check if we already have 2 picks
    if (gameState.currentTurn && gameState.currentTurn.picks.length >= 2) return;

    setFlippingCards(prev => new Set(prev).add(cardId));

    try {
      await flipCard({
        roomId,
        cardId: cardId as Id<"cards">,
      });
    } catch (error) {
      console.error('Failed to flip card:', error);
    } finally {
      // Remove from flipping set after animation
      setTimeout(() => {
        setFlippingCards(prev => {
          const newSet = new Set(prev);
          newSet.delete(cardId);
          return newSet;
        });
      }, 300);
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
      'Are you sure you want to reset the game? This will clear all progress but keep the same questions and answers.'
    );
    
    if (!confirmed) return;

    try {
      await resetGame({ roomId });
    } catch (error) {
      console.error('Failed to reset game:', error);
      alert('Failed to reset game. Please try again.');
    }
  };

  const handleReportCard = async (cardId: string, reason: string) => {
    const card = gameState.cards.find(c => c._id === cardId);
    if (!card || !card.answerText) return;

    try {
      await reportContent({
        roomId,
        targetType: 'answer',
        targetId: card._id,
        reason,
      });
      setReportingCard(null);
    } catch (error) {
      console.error('Failed to report content:', error);
    }
  };

  const getCardContent = (card: typeof sortedCards[0]) => {
    if (card.state === 'faceDown') {
      // Face down cards show the ANSWERS (what players see initially)
      return (
        <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-700 rounded-lg flex items-center justify-center p-2 shadow-lg">
          <div className="text-white text-sm font-medium text-center leading-tight">
            {card.answerText || '?'}
          </div>
        </div>
      );
    }

    // Face up cards show the QUESTIONS (what players see when flipped)
    return (
      <div className={`w-full h-full rounded-lg flex flex-col items-center justify-center p-2 shadow-lg ${
        card.state === 'matched'
          ? 'bg-gradient-to-br from-green-500 to-emerald-600'
          : 'bg-gradient-to-br from-yellow-400 to-orange-500'
      }`}>
        <div className="text-white text-sm font-medium text-center leading-tight">
          {card.questionText || 'Question not found'}
        </div>
        {card.state === 'matched' && (
          <div className="text-white/80 text-xs text-center mt-1 italic">
            A: {card.answerText}
          </div>
        )}
      </div>
    );
  };

  // Sort scores by points (descending)
  const sortedScores = [...gameState.scores].sort((a, b) => b.points - a.points);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 mb-6 shadow-2xl border border-white/20">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">Questiontration</h1>
              <div className="flex items-center gap-4 text-blue-200">
                <span>Room: {roomState.room.code}</span>
                <span>Turn: {gameState.game.turnIndex + 1}</span>
              </div>
            </div>

            {/* Current Turn Info */}
            <div className="flex items-center gap-4">
              {gameState.game.currentPlayerId && (
                <div className="text-center">
                  <div className="text-white font-bold">
                    {currentUser?.user.handle || 'Unknown'}'s Turn
                  </div>
                  <div className="text-blue-200 text-sm">
                    {turnTimeLeft}s remaining
                  </div>
                  <div className="w-24 bg-white/20 rounded-full h-2 mt-1">
                    <div
                      className="bg-yellow-500 h-2 rounded-full transition-all duration-1000"
                      style={{
                        width: `${(turnTimeLeft / gameState.game.settings.turnSeconds) * 100}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {isHost && (
                <button
                  onClick={handleResetGame}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Reset Game
                </button>
              )}
              
              <button
                onClick={handleLeaveRoom}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Game Board */}
          <div className="lg:col-span-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <div className="grid grid-cols-4 gap-3 aspect-square max-w-2xl mx-auto">
                {sortedCards.map((card) => (
                  <div
                    key={card._id}
                    className={`aspect-square cursor-pointer transition-all duration-300 transform ${
                      flippingCards.has(card._id) ? 'scale-95' : 'hover:scale-105'
                    } ${
                      isCurrentPlayer && card.state === 'faceDown'
                        ? 'hover:shadow-lg'
                        : card.state === 'faceDown'
                        ? 'opacity-75 cursor-not-allowed'
                        : ''
                    }`}
                    onClick={() => handleCardClick(card._id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (card.state !== 'faceDown') {
                        setReportingCard(card._id);
                      }
                    }}
                  >
                    {getCardContent(card)}
                  </div>
                ))}
              </div>

              {/* Turn Status */}
              <div className="mt-6 text-center">
                {isCurrentPlayer ? (
                  <div className="text-green-400 font-bold text-lg">
                    Your turn! Click answers to reveal their questions and find matches.
                  </div>
                ) : (
                  <div className="text-blue-200">
                    Waiting for {currentUser?.user.handle || 'player'} to make their move...
                  </div>
                )}

                {gameState.currentTurn && gameState.currentTurn.picks.length > 0 && (
                  <div className="text-yellow-300 mt-2">
                    {gameState.currentTurn.picks.length}/2 cards selected
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scoreboard */}
          <div className="space-y-6">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Scores</h2>
              <div className="space-y-3">
                {sortedScores.map((score, index) => (
                  <div
                    key={score.playerId}
                    className={`flex justify-between items-center p-3 rounded-lg ${
                      score.playerId === gameState.game.currentPlayerId
                        ? 'bg-yellow-500/20 border border-yellow-500/50'
                        : 'bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-yellow-500' :
                        index === 1 ? 'bg-gray-400' :
                        index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="text-white font-medium">{score.playerHandle}</span>
                    </div>
                    <span className="text-white font-bold text-lg">{score.points}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Game Info */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-xl font-bold text-white mb-4">Game Info</h2>
              <div className="space-y-2 text-blue-200">
                <div>Cards matched: {gameState.cards.filter(c => c.state === 'matched').length}/16</div>
                <div>Pairs found: {gameState.cards.filter(c => c.state === 'matched').length / 2}/8</div>
                <div>Extra turn on match: {gameState.game.settings.extraTurnOnMatch ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-xl font-bold text-white mb-4">How to Play</h2>
              <div className="space-y-2 text-sm text-blue-200">
                <p>1. <span className="text-white font-medium">Answer Questions</span> – Everyone secretly writes their answers to the same set of questions.</p>
                <p>2. <span className="text-white font-medium">Shuffle & Lay Out</span> – Mix all the answers together and place them face down.</p>
                <p>3. <span className="text-white font-medium">Take Turns</span> – On your turn, flip two cards. If both answers belong to the same question, keep them and try for more.</p>
                <p>4. <span className="text-white font-medium">Complete Sets</span> – The goal is to collect full sets of answers for each question. Each completed set earns points.</p>
                <p>5. <span className="text-white font-medium">Win Together</span> – The player with the most points at the end wins—but the real prize is discovering surprising truths about each other.</p>
                <p className="pt-2 text-blue-300">Tip: Right-click a revealed card to report inappropriate content.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Report Modal */}
        {reportingCard && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-4">Report Content</h3>
              <p className="text-gray-600 mb-4">
                Why are you reporting this content?
              </p>
              <div className="space-y-2">
                {['Inappropriate language', 'Offensive content', 'Spam', 'Other'].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => handleReportCard(reportingCard, reason)}
                    className="w-full text-left p-3 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setReportingCard(null)}
                className="mt-4 w-full bg-gray-500 hover:bg-gray-600 text-white py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

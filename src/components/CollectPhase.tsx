import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSessionMutation } from '../hooks/useServerSession';

interface CollectPhaseProps {
  roomState: {
    room: {
      _id: string;
      code: string;
      hostUserId: string;
      status: string;
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
  roomId: Id<"rooms">;
  onLeaveRoom: () => void;
}

export default function CollectPhase({ roomState, roomId, onLeaveRoom }: CollectPhaseProps) {
  const [newQuestion, setNewQuestion] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes default

  const questionPool = useQuery(api.questionPool, { roomId });
  const gameState = useQuery(api.gameState, { roomId });

  const submitQuestion = useSessionMutation(api.mutations.questions.submitQuestion);
  const submitAnswer = useSessionMutation(api.mutations.questions.submitAnswer);
  const approveQuestion = useSessionMutation(api.mutations.questions.approveQuestion);
  const assembleBoard = useSessionMutation(api.mutations.games.assembleBoard);
  const leaveRoom = useSessionMutation(api.mutations.rooms.leaveRoom);

  const isHost = roomState.members.find(m => m.userId === roomState.host._id)?.role === 'host';
  const gameMode = gameState?.game?.settings?.mode || 'player';

  // Countdown timer
  useEffect(() => {
    if (gameState?.game?.settings?.collectSeconds) {
      setTimeLeft(gameState.game.settings.collectSeconds);
    }
  }, [gameState?.game?.settings?.collectSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;

    try {
      await submitQuestion({
        roomId,
        text: newQuestion.trim(),
      });
      setNewQuestion('');
    } catch (error) {
      console.error('Failed to submit question:', error);
      alert('Failed to submit question. Please try again.');
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerText.trim() || !selectedQuestionId) return;

    try {
      await submitAnswer({
        roomId,
        questionId: selectedQuestionId as Id<"questions">,
        text: answerText.trim(),
      });
      setAnswerText('');
      setSelectedQuestionId('');
    } catch (error) {
      console.error('Failed to submit answer:', error);
      alert('Failed to submit answer. Please try again.');
    }
  };

  const handleApproveQuestion = async (questionId: string, approved: boolean) => {
    if (!isHost) return;

    try {
      await approveQuestion({
        roomId,
        questionId: questionId as Id<"questions">,
        approved,
      });
    } catch (error) {
      console.error('Failed to approve question:', error);
    }
  };

  const handleAssembleBoard = async () => {
    if (!isHost) return;

    try {
      await assembleBoard({ roomId });
    } catch (error) {
      console.error('Failed to assemble board:', error);
      alert('Failed to assemble board. Please ensure you have enough questions with answers.');
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!questionPool) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 shadow-2xl border border-white/20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Question Collection</h1>
              <p className="text-blue-200">
                {gameMode === 'curated' ? 'Using curated questions' : 'Create questions and answers together'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-mono text-white">{formatTime(timeLeft)}</div>
                <div className="text-sm text-blue-200">Time Left</div>
              </div>
              <button
                onClick={handleLeaveRoom}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6 shadow-2xl border border-white/20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Progress</h2>
            {isHost && questionPool.progress.readyForBoard && (
              <button
                onClick={handleAssembleBoard}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold transition-colors transform hover:scale-105"
              >
                Start Game!
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{questionPool.questions.length}</div>
              <div className="text-blue-200">Total Questions</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{questionPool.progress.questionsWithTwoAnswers}</div>
              <div className="text-blue-200">Ready Questions</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{questionPool.progress.targetQuestions}</div>
              <div className="text-blue-200">Target</div>
            </div>
          </div>

          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${
                questionPool.progress.readyForBoard ? 'bg-green-500' : 'bg-yellow-500'
              }`}
              style={{
                width: `${Math.min(100, (questionPool.progress.questionsWithTwoAnswers / questionPool.progress.targetQuestions) * 100)}%`
              }}
            />
          </div>
          <div className="text-center mt-2 text-blue-200">
            {questionPool.progress.readyForBoard
              ? '✓ Ready to start game!'
              : `Need ${questionPool.progress.targetQuestions - questionPool.progress.questionsWithTwoAnswers} more questions with 2+ answers`
            }
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Submit Forms */}
          <div className="space-y-6">
            {gameMode === 'player' && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-4">Submit a Question</h2>
                <form onSubmit={handleSubmitQuestion} className="space-y-4">
                  <div>
                    <textarea
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      placeholder="Enter your question (20-120 characters)..."
                      className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      rows={3}
                      minLength={20}
                      maxLength={120}
                    />
                    <div className="text-right text-sm text-blue-200 mt-1">
                      {newQuestion.length}/120
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={newQuestion.length < 20}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white py-3 rounded-lg font-bold transition-colors"
                  >
                    Submit Question
                  </button>
                </form>
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Submit an Answer</h2>
              <form onSubmit={handleSubmitAnswer} className="space-y-4">
                <div>
                  <select
                    value={selectedQuestionId}
                    onChange={(e) => setSelectedQuestionId(e.target.value)}
                    className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-white"
                    required
                  >
                    <option value="">Select a question to answer...</option>
                    {questionPool.questions
                      .filter(q => gameMode === 'curated' || q.approved !== false)
                      .map((question) => (
                        <option key={question._id} value={question._id}>
                          {question.text} ({question.answerCount} answers)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Enter your answer (5-200 characters)..."
                    className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    rows={2}
                    minLength={5}
                    maxLength={200}
                  />
                  <div className="text-right text-sm text-blue-200 mt-1">
                    {answerText.length}/200
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!selectedQuestionId || answerText.length < 5}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-500 text-white py-3 rounded-lg font-bold transition-colors"
                >
                  Submit Answer
                </button>
              </form>
            </div>
          </div>

          {/* Questions List */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">Questions & Answers</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {questionPool.questions.map((question) => (
                <div
                  key={question._id}
                  className={`bg-white/10 rounded-lg p-4 border ${
                    question.answerCount >= 2 ? 'border-green-500/50' : 'border-yellow-500/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-white font-medium">{question.text}</p>
                      <p className="text-sm text-blue-200">
                        by {question.creatorHandle} • {question.answerCount} answers
                      </p>
                    </div>
                    {isHost && gameMode === 'player' && question.approved === undefined && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleApproveQuestion(question._id, true)}
                          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => handleApproveQuestion(question._id, false)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                        >
                          ✗
                        </button>
                      </div>
                    )}
                  </div>

                  {question.answers.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm text-blue-200 font-medium">Answers:</div>
                      {question.answers.map((answer) => (
                        <div key={answer._id} className="bg-white/10 rounded px-3 py-2">
                          <p className="text-white text-sm">{answer.text}</p>
                          <p className="text-xs text-blue-200">by {answer.creatorHandle}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useSessionMutation, useSessionQuery } from '../hooks/useServerSession';
import IsolatedAnswerInput from './IsolatedAnswerInput';

const isDev = process.env.NODE_ENV === 'development';

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes default
  const [isFilling, setIsFilling] = useState(false);

  const questionPool = useQuery(api.questionPool.questionPool, { roomId });
  const gameState = useQuery(api.gameState.gameState, { roomId });
  const myProfile = useSessionQuery(api.users.getMyProfile);

  const submitQuestion = useSessionMutation(api.mutations.questions.submitQuestion);
  const submitAnswer = useSessionMutation(api.mutations.questions.submitAnswer);
  const approveQuestion = useSessionMutation(api.mutations.questions.approveQuestion);
  const assembleBoard = useSessionMutation(api.mutations.games.assembleBoard);
  const leaveRoom = useSessionMutation(api.mutations.rooms.leaveRoom);
  const fillAll = useMutation(api.mutations.dev.fillAllSubmissions);

  const isHost = roomState.members.find(m => m.userId === roomState.host._id)?.role === 'host';
  const gameMode = gameState?.game?.settings?.mode || 'player';

  // Countdown timer
  useEffect(() => {
    if (gameState?.game?.settings?.collectSeconds) {
      setTimeLeft(gameState.game.settings.collectSeconds);
    }
  }, [gameState?.game?.settings?.collectSeconds]);

  // Note: Auto-loading existing answers is now handled by IsolatedAnswerInput component

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleSubmitQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

  const handleQuestionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (newQuestion.length >= 20) {
        handleSubmitQuestion();
      }
    }
  };

  // Stable callback for isolated answer input
  const handleSubmitAnswer = useCallback(async (answerText: string) => {
    const availableQuestions = questionPool?.questions.filter(q => 
      gameMode === 'curated' || q.approved !== false
    ) || [];
    
    const currentQuestion = availableQuestions[currentQuestionIndex];
    if (!currentQuestion) return;

    await submitAnswer({
      roomId,
      questionId: currentQuestion._id,
      text: answerText,
    });
    
    // Move to next question if available
    if (currentQuestionIndex < availableQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  }, [submitAnswer, roomId, questionPool, gameMode, currentQuestionIndex]);

  // Navigation callbacks for isolated input
  const handlePrevious = useCallback(() => {
    setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1));
  }, [currentQuestionIndex]);

  const handleNext = useCallback(() => {
    const availableQuestions = questionPool?.questions.filter(q => 
      gameMode === 'curated' || q.approved !== false
    ) || [];
    setCurrentQuestionIndex(Math.min(availableQuestions.length - 1, currentQuestionIndex + 1));
  }, [questionPool, gameMode, currentQuestionIndex]);

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

  const handleFillAll = async () => {
    if (!isDev) return;
    setIsFilling(true);
    try {
      await fillAll({ roomId });
    } catch (error) { 
      console.error("Failed to fill all submissions:", error);
      alert("Failed to fill all submissions.");
    } finally {
      setIsFilling(false);
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
              <h1 className="text-3xl font-bold text-white mb-2">
                Question Collection
                {isDev && (
                  <button 
                    onClick={handleFillAll}
                    disabled={isFilling}
                    className="ml-4 text-sm bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded-lg disabled:bg-gray-500 align-middle"
                  >
                    {isFilling ? 'Filling...' : 'Fill All'}
                  </button>
                )}
              </h1>
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
                      onKeyDown={handleQuestionKeyDown}
                      placeholder="Enter your question (20-120 characters)..."
                      className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      rows={3}
                      minLength={20}
                      maxLength={120}
                    />
                    <div className="flex justify-between text-sm text-blue-200 mt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-white/10 px-2 py-1 rounded border border-white/20">
                          ⌘ + Enter
                        </span>
                        <span className="text-xs">to submit</span>
                      </div>
                      <div>{newQuestion.length}/120</div>
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

{(() => {
              const availableQuestions = questionPool.questions.filter(q => 
                gameMode === 'curated' || q.approved !== false
              );
              const currentQuestion = availableQuestions[currentQuestionIndex];
              
              if (!currentQuestion) {
                return (
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
                    <div className="text-center py-8">
                      <div className="text-white text-lg mb-2">No questions available yet</div>
                      <div className="text-blue-200">Wait for questions to be submitted and approved</div>
                    </div>
                  </div>
                );
              }

              // Check if user has already answered this question
              const currentUser = myProfile ? roomState.members.find(m => m.user._id === myProfile._id) : null;
              const userHasAnswered = currentUser ? currentQuestion.answers.some(answer => 
                answer.creatorHandle === currentUser.user.handle
              ) : false;

              const answeredCount = currentUser ? availableQuestions.filter(q => 
                q.answers.some(answer => answer.creatorHandle === currentUser.user.handle)
              ).length : 0;

              const existingAnswer = currentUser ? currentQuestion.answers.find(answer => 
                answer.creatorHandle === currentUser.user.handle
              ) : null;

              return (
                <IsolatedAnswerInput
                  roomId={roomId}
                  currentQuestion={currentQuestion}
                  currentQuestionIndex={currentQuestionIndex}
                  totalQuestions={availableQuestions.length}
                  answeredCount={answeredCount}
                  userHasAnswered={userHasAnswered}
                  existingAnswerText={existingAnswer?.text || ''}
                  onSubmit={handleSubmitAnswer}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  canGoPrevious={currentQuestionIndex > 0}
                  canGoNext={currentQuestionIndex < availableQuestions.length - 1}
                />
              );
            })()}
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

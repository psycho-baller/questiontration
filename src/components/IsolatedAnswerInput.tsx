import React, { useRef, useCallback, useState, useEffect } from "react";
import { Id } from "../../convex/_generated/dataModel";

interface Question {
  _id: string;
  text: string;
  creatorHandle: string;
  answerCount: number;
  answers: Array<{
    _id: string;
    text: string;
    creatorHandle: string;
  }>;
}

interface IsolatedAnswerInputProps {
  roomId: Id<"rooms">;
  currentQuestion: Question;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  userHasAnswered: boolean;
  existingAnswerText: string;
  onSubmit: (answerText: string) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

const IsolatedAnswerInput = React.memo<IsolatedAnswerInputProps>(({
  roomId,
  currentQuestion,
  currentQuestionIndex,
  totalQuestions,
  answeredCount,
  userHasAnswered,
  existingAnswerText,
  onSubmit,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [charCount, setCharCount] = useState(0);

  // Load existing answer when question changes and focus textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.value = existingAnswerText;
      setCharCount(existingAnswerText.length);
      // Focus the textarea when question changes
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [existingAnswerText, currentQuestion._id]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textareaRef.current || isSubmitting) return;

    const answerText = textareaRef.current.value.trim();
    if (answerText.length < 5) return;

    setIsSubmitting(true);

    try {
      await onSubmit(answerText);
      // Clear input after successful submission
      textareaRef.current.value = "";
      setCharCount(0);
      // Refocus the textarea after submission
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error('Failed to submit answer:', error);
      alert('Failed to submit answer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [onSubmit, isSubmitting]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (textareaRef.current && textareaRef.current.value.trim().length >= 5) {
        handleSubmit();
      }
    }
  }, [handleSubmit]);

  const handleSkip = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.value = "";
      setCharCount(0);
    }
    onNext();
    // Refocus the textarea after navigation
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, [onNext]);

  const handleInputChange = useCallback(() => {
    if (textareaRef.current) {
      setCharCount(textareaRef.current.value.length);
    }
  }, []);

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-white">Answer Questions</h2>
        <div className="text-blue-200 text-sm">
          <div className="text-right">
            <div>{currentQuestionIndex + 1} of {totalQuestions}</div>
            <div className="text-xs text-green-300">{answeredCount} answered</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Question Display */}
        <div className="bg-white/10 rounded-lg p-4 border border-white/20">
          <div className="text-white font-medium text-lg mb-2">
            {currentQuestion.text}
          </div>
          <div className="text-blue-200 text-sm">
            by {currentQuestion.creatorHandle} • {currentQuestion.answerCount} answers
          </div>
        </div>

        {/* Answer Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <textarea
              ref={textareaRef}
              onKeyDown={handleKeyDown}
              onChange={handleInputChange}
              placeholder="Enter your answer (5-200 characters)..."
              className="w-full bg-white/20 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              rows={3}
              minLength={5}
              maxLength={200}
              disabled={isSubmitting}
            />
            <div className="flex justify-between text-sm mt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-white/10 px-2 py-1 rounded border border-white/20 text-blue-200">
                  ⌘ + Enter
                </span>
                <span className="text-xs text-blue-200">to submit & continue</span>
              </div>
              <div className={`${
                charCount < 5 && charCount > 0
                  ? 'text-red-400'
                  : charCount >= 200
                  ? 'text-yellow-400'
                  : charCount >= 5
                  ? 'text-green-400'
                  : 'text-blue-200'
              }`}>
                {charCount}/200
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              Previous
            </button>

            <button
              type="submit"
              disabled={isSubmitting || charCount < 5}
              className={`flex-1 py-3 rounded-lg font-bold transition-colors ${
                charCount < 5
                  ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                  : isSubmitting
                  ? 'bg-gray-500 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {isSubmitting
                ? 'Submitting...'
                : (userHasAnswered ? 'Update Answer' : 'Submit Answer')
              }
            </button>

            <button
              type="button"
              onClick={handleSkip}
              disabled={!canGoNext}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              Skip
            </button>
          </div>
        </form>

        {/* Progress Bar */}
        <div className="w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props change
  // This prevents re-renders when parent component updates due to Convex queries
  return (
    prevProps.roomId === nextProps.roomId &&
    prevProps.currentQuestion._id === nextProps.currentQuestion._id &&
    prevProps.currentQuestionIndex === nextProps.currentQuestionIndex &&
    prevProps.totalQuestions === nextProps.totalQuestions &&
    prevProps.answeredCount === nextProps.answeredCount &&
    prevProps.userHasAnswered === nextProps.userHasAnswered &&
    prevProps.existingAnswerText === nextProps.existingAnswerText &&
    prevProps.canGoPrevious === nextProps.canGoPrevious &&
    prevProps.canGoNext === nextProps.canGoNext
    // Note: callback functions are not compared because they should be stable (useCallback)
  );
});

IsolatedAnswerInput.displayName = 'IsolatedAnswerInput';

export default IsolatedAnswerInput;

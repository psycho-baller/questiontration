import React, { useRef, useCallback, useState } from "react";
import { Id } from "../../convex/_generated/dataModel";

interface IsolatedPromptInputProps {
  roundId: Id<"rounds">;
  gameId?: Id<"games">;
  disabled: boolean;
  onSubmit: (prompt: string) => Promise<{ success: boolean; reason?: string }>;
  placeholder?: string;
}

const IsolatedPromptInput = React.memo<IsolatedPromptInputProps>(({
  roundId,
  gameId,
  disabled,
  onSubmit,
  placeholder = ""
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRef.current || disabled || isSubmitting) return;
    
    const prompt = inputRef.current.value.trim();
    if (!prompt) return;

    setIsSubmitting(true);
    setError(undefined);
    
    try {
      const result = await onSubmit(prompt);
      if (!result.success) {
        setError(result.reason);
      } else {
        // Clear input on successful submission
        inputRef.current.value = "";
      }
    } catch (err) {
      setError("An error occurred while submitting");
    } finally {
      setIsSubmitting(false);
    }
  }, [onSubmit, disabled, isSubmitting]);

  const handleInputChange = useCallback(() => {
    // Clear error when user starts typing
    if (error) {
      setError(undefined);
    }
  }, [error]);

  return (
    <fieldset disabled={disabled}>
      <legend className="text-2xl mb-2">
        What prompt was responsible for this image?
      </legend>
      <span className="text-orange-300">{error}</span>
      <form
        onSubmit={handleSubmit}
        className="flex"
        aria-errormessage={error}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          onChange={handleInputChange}
          disabled={disabled || isSubmitting}
          className="bg-transparent border border-neutral-400 p-2 focus:outline-none placeholder:text-neutral-400 text-blue-400 focus:border-blue-400 h-12 basis-0 grow"
        />
        <label className="basis-0">
          <input
            type="submit"
            value={isSubmitting ? "Submitting..." : "Submit prompt"}
            disabled={disabled || isSubmitting}
            aria-invalid={!!error}
            className="h-12 border border-blue-200 bg-blue-200 py-2 px-4 text-neutral-black hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
      </form>
      <p className="text-lg m-2">
        (You&rsquo;ll get points if someone thinks yours was the real one)
      </p>
    </fieldset>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props change
  // This prevents re-renders when parent component updates due to Convex queries
  return (
    prevProps.roundId === nextProps.roundId &&
    prevProps.gameId === nextProps.gameId &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.placeholder === nextProps.placeholder
    // Note: onSubmit is not compared because it should be stable (useCallback)
  );
});

IsolatedPromptInput.displayName = 'IsolatedPromptInput';

export default IsolatedPromptInput;

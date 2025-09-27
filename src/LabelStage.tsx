import { useState, useEffect } from "react";
import { LabelState } from "../convex/shared";
import { Id } from "../convex/_generated/dataModel";
import { useSessionAction } from "./hooks/useServerSession";
import { Submissions } from "./Submissions";
import { api } from "../convex/_generated/api";
import { useOptimisticInput } from "./hooks/useOptimisticInput";

export function LabelStage({
  round,
  roundId,
  gameId,
}: {
  round: LabelState;
  roundId: Id<"rounds">;
  gameId?: Id<"games">;
}) {
  const [error, setError] = useState<string>();
  const addPrompt = useSessionAction(api.openai.addOption);
  
  // Check if user has already submitted
  const userSubmission = round.submitted.find((submission) => submission.me);
  const hasSubmitted = !!userSubmission;
  
  // Get the user's existing submission text (if any) to use as initial value
  // Note: userSubmission might not have a 'text' property, so we'll use empty string
  const existingSubmissionText = "";
  
  // Use optimistic input that ignores server updates once user starts typing
  const input = useOptimisticInput(existingSubmissionText);
  
  // Only sync with server if user hasn't modified the input locally
  useEffect(() => {
    input.syncWithServer(existingSubmissionText);
  }, [existingSubmissionText, input]);
  
  // Debug: Track when round data changes and component re-renders
  useEffect(() => {
    console.log("🔄 LabelStage re-render - roundId:", roundId, "submissions:", round.submitted.length, "hasSubmitted:", hasSubmitted);
    console.log("📝 Input state - value:", input.value, "isModified:", input.isLocallyModified, "hasInteracted:", input.hasUserInteracted);
  }, [round.submitted, hasSubmitted, roundId, input.value, input.isLocallyModified, input.hasUserInteracted]);
  return (
    <div className="max-w-lg">
      <img
        src={round.imageUrl}
        alt=""
        className="w-full max-w-lg border border-neutral-600 rounded overflow-hidden my-4"
      />
      
      {/* Always render both sections but hide one with CSS to prevent unmounting */}
      <div className={hasSubmitted || round.mine ? "block" : "hidden"}>
        <Submissions
          submitted={round.submitted}
          title={
            round.mine
              ? "This was your image. Submissions:"
              : "Waiting for everyone to finish..."
          }
        />
      </div>
      
      <fieldset className={hasSubmitted || round.mine ? "hidden" : "block"}>
        <legend className="text-2xl mb-2">
          {round.mine
            ? "This was your image. Just relax 🏝️"
            : "What prompt was responsible for this image?"}
        </legend>
        <span className="text-orange-300">{error}</span>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            // Use optimistic input value for submission
            const currentValue = input.value;
            console.log("📤 Submitting value:", currentValue, "isModified:", input.isLocallyModified);
            
            const result = await addPrompt({ roundId, prompt: currentValue, gameId });
            if (!result.success) {
              setError(result.reason);
            } else {
              // Clear the optimistic input after successful submission
              input.clearValue();
            }
          }}
          className="flex"
          aria-errormessage={error}
        >
          <input
            type="text"
            value={input.value}
            onChange={(e) => {
              console.log("📝 Input change:", e.target.value, "length:", e.target.value.length);
              input.updateValue(e.target.value);
            }}
            onFocus={() => console.log("🎯 Input focused")}
            onBlur={() => console.log("😵 Input lost focus")}
            placeholder="Enter your prompt"
            className="bg-transparent border border-neutral-400 p-2 focus:outline-none placeholder:text-neutral-400 text-blue-400 focus:border-blue-400 h-12 basis-0 grow"
          />
          <label className="basis-0">
            <input
              type="submit"
              value="Submit prompt"
              aria-invalid={!!error}
              className="h-12 border border-blue-200 bg-blue-200 py-2 px-4 text-neutral-black hover:bg-blue-400"
            />
          </label>
        </form>
        <p className="text-lg m-2">
          (You&rsquo;ll get points if someone thinks yours was the real one)
        </p>
      </fieldset>
    </div>
  );
}

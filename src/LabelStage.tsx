import { useCallback } from "react";
import { LabelState } from "../convex/shared";
import { Id } from "../convex/_generated/dataModel";
import { useSessionAction } from "./hooks/useServerSession";
import { Submissions } from "./Submissions";
import { api } from "../convex/_generated/api";
import IsolatedPromptInput from "./components/IsolatedPromptInput";

export function LabelStage({
  round,
  roundId,
  gameId,
}: {
  round: LabelState;
  roundId: Id<"rounds">;
  gameId?: Id<"games">;
}) {
  const addPrompt = useSessionAction(api.openai.addOption);
  
  // Stable callback that won't cause IsolatedPromptInput to re-render
  const handleSubmit = useCallback(async (prompt: string) => {
    const result = await addPrompt({ roundId, prompt, gameId });
    return {
      success: result.success,
      reason: result.success ? undefined : result.reason
    };
  }, [addPrompt, roundId, gameId]);

  const hasSubmitted = round.mine || round.submitted.find((submission) => submission.me);
  const isDisabled = !!round.submitted.find((submission) => submission.me);

  return (
    <div className="max-w-lg">
      <img
        src={round.imageUrl}
        alt=""
        className="w-full max-w-lg border border-neutral-600 rounded overflow-hidden my-4"
      />
      
      {/* Always render both sections but hide one with CSS to prevent unmounting */}
      <div className={hasSubmitted ? "block" : "hidden"}>
        <Submissions
          submitted={round.submitted}
          title={
            round.mine
              ? "This was your image. Submissions:"
              : "Waiting for everyone to finish..."
          }
        />
      </div>

      <div className={hasSubmitted ? "hidden" : "block"}>
        {round.mine ? (
          <fieldset>
            <legend className="text-2xl mb-2">
              This was your image. Just relax 🏝️
            </legend>
          </fieldset>
        ) : (
          <IsolatedPromptInput
            roundId={roundId}
            gameId={gameId}
            disabled={isDisabled}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}

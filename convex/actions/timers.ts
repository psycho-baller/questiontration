import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Internal mutations for scheduled operations
export const internalFlipCardsBack = internalMutation({
  args: {
    roomId: v.id("rooms"),
    cardIds: v.array(v.id("cards")),
  },
  handler: async (ctx, args) => {
    // Flip specified cards back to face down
    for (const cardId of args.cardIds) {
      const card = await ctx.db.get(cardId);
      if (card && card.state === "faceUp") {
        await ctx.db.patch(cardId, { state: "faceDown" });
      }
    }

    return { success: true };
  },
});

export const internalTimeoutTurn = internalMutation({
  args: {
    roomId: v.id("rooms"),
    gameId: v.id("games"),
    turnId: v.id("turns"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get the turn
    const turn = await ctx.db.get(args.turnId);
    if (!turn || turn.resolved) {
      // Turn already resolved, nothing to do
      return { success: true };
    }

    // Get the game
    const game = await ctx.db.get(args.gameId);
    if (!game || game.state.stage !== "rounds") {
      return { success: true };
    }

    // If turn has picks, flip them back and resolve
    if (turn.picks.length > 0) {
      // Flip cards back to face down
      for (const cardId of turn.picks) {
        const card = await ctx.db.get(cardId);
        if (card && card.state === "faceUp") {
          await ctx.db.patch(cardId, { state: "faceDown" });
        }
      }

      // Mark turn as resolved (timeout)
      await ctx.db.patch(args.turnId, {
        resolved: true,
        correct: false,
        resolvedAt: now,
      });

      // Log the timeout
      await ctx.db.insert("audit", {
        type: "turn_timeout",
        gameId: args.gameId,
        roomId: args.roomId,
        userId: turn.playerId,
        payload: {
          pickCount: turn.picks.length,
          cardIds: turn.picks,
        },
        ts: now,
      });

      // Advance to next player - simplified version
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_room", (q: any) => q.eq("roomId", args.roomId))
        .filter((q: any) => q.eq(q.field("role"), "player"))
        .collect();

      if (memberships.length > 0) {
        const currentIndex = memberships.findIndex((m: any) => m.userId === game.currentPlayerId);
        const nextIndex = (currentIndex + 1) % memberships.length;
        const nextPlayer = memberships[nextIndex];

        await ctx.db.patch(args.gameId, {
          currentPlayerId: nextPlayer.userId,
          turnIndex: game.turnIndex + 1,
        });
      }
    }

    return { success: true };
  },
});

// Public actions that schedule the internal mutations
export const scheduleFlipBack = action({
  args: {
    roomId: v.id("rooms"),
    cardIds: v.array(v.id("cards")),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    // TODO: Once the API is regenerated, use:
    // await ctx.scheduler.runAfter(args.delayMs, internal.actions.timers.internalFlipCardsBack, {
    //   roomId: args.roomId,
    //   cardIds: args.cardIds,
    // });

    // For now, just return success - the flip back will be handled in the UI
    return { success: true };
  },
});

export const tickTurnTimer = action({
  args: {
    roomId: v.id("rooms"),
    gameId: v.id("games"),
    turnId: v.id("turns"),
    timeoutSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    // TODO: Once the API is regenerated, use:
    // await ctx.scheduler.runAfter(args.timeoutSeconds * 1000, internal.actions.timers.internalTimeoutTurn, {
    //   roomId: args.roomId,
    //   gameId: args.gameId,
    //   turnId: args.turnId,
    // });

    // For now, just return success - timeouts will be handled in the UI
    return { success: true };
  },
});

"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";


export const scheduleFlipBack = action({
  args: {
    roomId: v.id("rooms"),
    turnId: v.id("turns"),
    delayMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Schedule the flip back after the specified delay
    await ctx.scheduler.runAfter(args.delayMs, api.actions.timers.executeFlipBack, {
      roomId: args.roomId,
      turnId: args.turnId,
    });

    return null;
  },
});

export const executeFlipBack = action({
  args: {
    roomId: v.id("rooms"),
    turnId: v.id("turns"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Call the mutation to resolve the turn and flip cards back if needed
    await ctx.runMutation(api.mutations.flips.resolveTurnManual, {
      roomId: args.roomId,
      sessionId: (await ctx.auth.getUserIdentity())?.tokenIdentifier as Id<"sessions">,
    });

    return null;
  },
});

export const tickTurnTimer = action({
  args: {
    roomId: v.id("rooms"),
    timeoutSeconds: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const timeoutMs = (args.timeoutSeconds || 20) * 1000; // Default 20 seconds

    // Schedule turn timeout
    await ctx.scheduler.runAfter(timeoutMs, api.actions.timers.executeTurnTimeout, {
      roomId: args.roomId,
    });

    return null;
  },
});

export const executeTurnTimeout = action({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get current game state
    const gameState = await ctx.runQuery(api.queries.gameState.gameState, {
      roomId: args.roomId,
    });

    if (!gameState || gameState.game.status !== "active") {
      return null; // Game no longer active
    }

    // Check if there's an unresolved turn
    if (gameState.currentTurn && !gameState.currentTurn.resolved) {
      // Check if turn has been going on too long
      const turnAge = Date.now() - gameState.currentTurn.startedAt;
      const maxTurnTime = gameState.game.settings.turnSeconds * 1000;

      if (turnAge > maxTurnTime) {
        // Force resolve the turn
        if (gameState.currentTurn.picks.length === 1) {
          // Player only flipped one card - flip it back and advance turn
          await ctx.runMutation(api.mutations.flips.resolveTurnManual, {
            roomId: args.roomId,
            sessionId: (await ctx.auth.getUserIdentity())?.tokenIdentifier as Id<"sessions">,
          });
        } else if (gameState.currentTurn.picks.length === 2) {
          // Player flipped two cards but turn wasn't resolved - resolve it now
          await ctx.runMutation(api.mutations.flips.resolveTurnManual, {
            roomId: args.roomId,
            sessionId: (await ctx.auth.getUserIdentity())?.tokenIdentifier as Id<"sessions">,
          });
        }
      }
    }

    return null;
  },
});

export const scheduleCollectionTimeout = action({
  args: {
    roomId: v.id("rooms"),
    timeoutSeconds: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const timeoutMs = args.timeoutSeconds * 1000;

    // Schedule collection phase timeout
    await ctx.scheduler.runAfter(timeoutMs, api.actions.timers.executeCollectionTimeout, {
      roomId: args.roomId,
    });

    return null;
  },
});

export const executeCollectionTimeout = action({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get current game state
    const gameState = await ctx.runQuery(api.queries.gameState.gameState, {
      roomId: args.roomId,
    });

    if (!gameState || gameState.game.status !== "collecting") {
      return null; // Game no longer in collecting phase
    }

    // Get question pool to check readiness
    const questionPool = await ctx.runQuery(api.queries.questionPool.questionPool, {
      roomId: args.roomId,
    });

    if (questionPool.progress.readyForBoard) {
      // Automatically assemble board if we have enough questions
      await ctx.runMutation(api.mutations.games.assembleBoard, {
        roomId: args.roomId,
        sessionId: (await ctx.auth.getUserIdentity())?.tokenIdentifier as Id<"sessions">,
      });
    } else {
      // Not enough questions - could implement fallback logic here
      // For now, just log the timeout
      console.log(`Collection timeout for room ${args.roomId} - insufficient questions`);
    }

    return null;
  },
});

// Helper action to start turn timer when a new turn begins
export const startTurnTimer = action({
  args: {
    roomId: v.id("rooms"),
    playerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get game settings for turn timeout
    const gameState = await ctx.runQuery(api.queries.gameState.gameState, {
      roomId: args.roomId,
    });

    if (!gameState || gameState.game.status !== "active") {
      return null;
    }

    // Start the turn timer
    await ctx.runAction(api.actions.timers.tickTurnTimer, {
      roomId: args.roomId,
      timeoutSeconds: gameState.game.settings.turnSeconds,
    });

    return null;
  },
});

// Action to handle player disconnection during their turn
export const handlePlayerDisconnect = action({
  args: {
    roomId: v.id("rooms"),
    playerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get current game state
    const gameState = await ctx.runQuery(api.queries.gameState.gameState, {
      roomId: args.roomId,
    });

    if (!gameState || gameState.game.status !== "active") {
      return null;
    }

    // Check if the disconnected player is the current player
    if (gameState.game.currentPlayerId === args.playerId) {
      // If there's an unresolved turn, resolve it immediately
      if (gameState.currentTurn && !gameState.currentTurn.resolved) {
        await ctx.runMutation(api.mutations.flips.resolveTurnManual, {
          roomId: args.roomId,
          sessionId: (await ctx.auth.getUserIdentity())?.tokenIdentifier as Id<"sessions">,
        });
      }

      // Could also implement logic to skip the player's turn or pause the game
    }

    return null;
  },
});

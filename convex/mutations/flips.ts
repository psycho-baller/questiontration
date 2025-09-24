import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const flipCard = mutation({
  args: {
    roomId: v.id("rooms"),
    cardId: v.id("cards"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get the game
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game || game.state.stage !== "rounds") {
      throw new Error("No active game found");
    }

    // Verify it's the current player's turn
    if (game.currentPlayerId !== args.userId) {
      throw new Error("It's not your turn");
    }

    // Get the card
    const card = await ctx.db.get(args.cardId);
    if (!card || card.gameId !== game._id) {
      throw new Error("Invalid card");
    }

    if (card.state !== "faceDown") {
      throw new Error("Card is already face up or matched");
    }

    // Get current turn or create new one
    let currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    if (!currentTurn) {
      // Create new turn
      const turnId = await ctx.db.insert("turns", {
        gameId: game._id,
        playerId: args.userId,
        picks: [],
        resolved: false,
        correct: false,
        startedAt: now,
      });
      currentTurn = await ctx.db.get(turnId);
      if (!currentTurn) {
        throw new Error("Failed to create turn");
      }
    }

    // Check if this is the first or second pick
    if (currentTurn.picks.length >= 2) {
      throw new Error("Turn already has 2 picks");
    }

    // Flip the card
    await ctx.db.patch(args.cardId, { state: "faceUp" });

    // Add card to turn picks
    const newPicks = [...currentTurn.picks, args.cardId];
    await ctx.db.patch(currentTurn._id, { picks: newPicks });

    // Log the action
    await ctx.db.insert("audit", {
      type: "card_flipped",
      gameId: game._id,
      roomId: args.roomId,
      userId: args.userId,
      payload: {
        cardId: args.cardId,
        position: card.position,
        pickNumber: newPicks.length,
      },
      ts: now,
    });

    // If this is the second pick, resolve the turn
    if (newPicks.length === 2) {
      return await resolveTurn(ctx, {
        gameId: game._id,
        turnId: currentTurn._id,
        roomId: args.roomId,
      });
    }

    return { success: true, pickCount: newPicks.length };
  },
});

async function resolveTurn(
  ctx: any,
  args: {
    gameId: string;
    turnId: string;
    roomId: string;
  }
) {
  const now = Date.now();

  const turn = await ctx.db.get(args.turnId);
  if (!turn || turn.picks.length !== 2) {
    throw new Error("Invalid turn state");
  }

  // Get both cards
  const [card1, card2] = await Promise.all([
    ctx.db.get(turn.picks[0]),
    ctx.db.get(turn.picks[1]),
  ]);

  if (!card1 || !card2) {
    throw new Error("Cards not found");
  }

  // Check if it's a match (same question)
  const isMatch = card1.questionId === card2.questionId;

  if (isMatch) {
    // Mark cards as matched
    await ctx.db.patch(card1._id, { state: "matched" });
    await ctx.db.patch(card2._id, { state: "matched" });

    // Update player score
    const score = await ctx.db
      .query("scores")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .filter((q: any) => q.eq(q.field("playerId"), turn.playerId))
      .first();

    if (score) {
      await ctx.db.patch(score._id, { points: score.points + 1 });
    }

    // Mark turn as resolved and correct
    await ctx.db.patch(turn._id, {
      resolved: true,
      correct: true,
      resolvedAt: now,
    });

    // Check if game is complete (all cards matched)
    const allCards = await ctx.db
      .query("cards")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .collect();

    const matchedCards = allCards.filter((c: any) => c.state === "matched");
    const isGameComplete = matchedCards.length === allCards.length;

    if (isGameComplete) {
      // End the game
      const game = await ctx.db.get(args.gameId);
      if (game) {
        await ctx.db.patch(args.gameId, {
          status: "complete",
          completedAt: now,
        });

        // Update room status
        await ctx.db.patch(args.roomId, { status: "ended" });

        // Log game completion
        await ctx.db.insert("audit", {
          type: "game_completed",
          gameId: args.gameId,
          roomId: args.roomId,
          payload: { duration: now - (game.startedAt || now) },
          ts: now,
        });
      }
    } else {
      // Check game settings for extra turn on match
      const game = await ctx.db.get(args.gameId);
      if (game && !game.settings.extraTurnOnMatch) {
        // Advance to next player
        await advanceToNextPlayer(ctx, args.gameId, args.roomId);
      }
      // If extraTurnOnMatch is true, current player keeps their turn
    }

    // Log the match
    await ctx.db.insert("audit", {
      type: "match_found",
      gameId: args.gameId,
      roomId: args.roomId,
      userId: turn.playerId,
      payload: {
        cardIds: [card1._id, card2._id],
        questionId: card1.questionId,
      },
      ts: now,
    });

    return {
      success: true,
      match: true,
      gameComplete: isGameComplete,
      extraTurn: isGameComplete ? false : (await ctx.db.get(args.gameId))?.settings.extraTurnOnMatch ?? true,
    };
  } else {
    // Not a match - mark turn as resolved
    await ctx.db.patch(turn._id, {
      resolved: true,
      correct: false,
      resolvedAt: now,
    });

    // Schedule cards to flip back after delay
    // Note: In a real implementation, you'd use Convex actions with scheduler
    // For now, we'll flip them back immediately in a separate mutation call

    // Log the mismatch
    await ctx.db.insert("audit", {
      type: "mismatch",
      gameId: args.gameId,
      roomId: args.roomId,
      userId: turn.playerId,
      payload: {
        cardIds: [card1._id, card2._id],
        questionIds: [card1.questionId, card2.questionId],
      },
      ts: now,
    });

    // Advance to next player
    await advanceToNextPlayer(ctx, args.gameId, args.roomId);

    return {
      success: true,
      match: false,
      gameComplete: false,
      flipBackDelay: 1500, // milliseconds
    };
  }
}

async function advanceToNextPlayer(ctx: any, gameId: string, roomId: string) {
  const game = await ctx.db.get(gameId);
  if (!game) return;

  // Get all players
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_room", (q: any) => q.eq("roomId", roomId))
    .filter((q: any) => q.eq(q.field("role"), "player"))
    .collect();

  if (memberships.length === 0) return;

  // Find current player index
  const currentIndex = memberships.findIndex((m: any) => m.userId === game.currentPlayerId);
  const nextIndex = (currentIndex + 1) % memberships.length;
  const nextPlayer = memberships[nextIndex];

  // Update game
  await ctx.db.patch(gameId, {
    currentPlayerId: nextPlayer.userId,
    turnIndex: game.turnIndex + 1,
  });
}

export const flipCardsBack = mutation({
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

export const timeoutTurn = mutation({
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
    if (!game || game.status !== "active") {
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

      // Advance to next player
      await advanceToNextPlayer(ctx, args.gameId, args.roomId);
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
    if (!game || game.status !== "active") {
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

      // Advance to next player
      await advanceToNextPlayer(ctx, args.gameId, args.roomId);
    }

    return { success: true };
  },
});

import { sessionMutation } from "../lib/myFunctions";
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const flipCard = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    cardId: v.id("cards"),
  },
  returns: v.object({
    turnResolved: v.boolean(),
    isMatch: v.optional(v.boolean()),
    turnId: v.id("turns"),
  }),
  handler: async (ctx, args) => {
    // Get current game
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game) {
      throw new Error("No active game found");
    }

    // if (game.status !== "active") {
    //   throw new Error("Game is not active");
    // }

    // Verify it's the current player's turn
    if (game.currentPlayerId !== ctx.session.userId) {
      throw new Error("It's not your turn");
    }

    // Get the card
    const card = await ctx.db.get(args.cardId);
    if (!card || card.gameId !== game._id) {
      throw new Error("Card not found in this game");
    }

    if (card.state !== "faceDown") {
      throw new Error("Card is not face down");
    }

    // Get current unresolved turn or create new one
    let currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    if (!currentTurn) {
      // Create new turn
      const turnId = await ctx.db.insert("turns", {
        gameId: game._id,
        playerId: ctx.session.userId,
        picks: [],
        resolved: false,
        correct: false,
        startedAt: Date.now(),
      });
      currentTurn = await ctx.db.get(turnId);
      if (!currentTurn) throw new Error("Failed to create turn");
    }

    // Verify turn belongs to current player
    if (currentTurn.playerId !== ctx.session.userId) {
      throw new Error("Turn belongs to different player");
    }

    // Check if card is already picked in this turn
    if (currentTurn.picks.includes(args.cardId)) {
      throw new Error("Card already picked in this turn");
    }

    // Check turn hasn't exceeded 2 picks
    if (currentTurn.picks.length >= 2) {
      throw new Error("Turn already has 2 picks");
    }

    // Flip the card
    await ctx.db.patch(args.cardId, {
      state: "faceUp" as const,
    });

    // Add card to turn picks
    const newPicks = [...currentTurn.picks, args.cardId];
    await ctx.db.patch(currentTurn._id, {
      picks: newPicks,
    });

    // Log flip event
    await ctx.db.insert("audit", {
      type: "card_flipped",
      gameId: game._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: { cardId: args.cardId, position: card.position, turnId: currentTurn._id },
      ts: Date.now(),
    });

    // If this is the second pick, resolve the turn
    if (newPicks.length === 2) {
      const isMatch = await resolveTurn(ctx, currentTurn._id, newPicks, game, args.roomId);
      return {
        turnResolved: true,
        isMatch,
        turnId: currentTurn._id,
      };
    }

    return {
      turnResolved: false,
      turnId: currentTurn._id,
    };
  },
});

// Helper function to resolve a turn after 2 cards are picked
async function resolveTurn(
  ctx: any,
  turnId: Id<"turns">,
  cardIds: Id<"cards">[],
  game: Doc<"games">,
  roomId: Id<"rooms">
): Promise<boolean> {
  // Get both cards
  const [card1, card2] = await Promise.all([
    ctx.db.get(cardIds[0]),
    ctx.db.get(cardIds[1]),
  ]);

  if (!card1 || !card2) {
    throw new Error("Cards not found");
  }

  // Check if it's a match (same question)
  const isMatch = card1.questionId === card2.questionId;

  // Update turn as resolved
  await ctx.db.patch(turnId, {
    resolved: true,
    correct: isMatch,
    resolvedAt: Date.now(),
  });

  if (isMatch) {
    // Mark both cards as matched
    await ctx.db.patch(card1._id, { state: "matched" as const });
    await ctx.db.patch(card2._id, { state: "matched" as const });

    // Award point to current player
    const score = await ctx.db
      .query("scores")
      .withIndex("by_game_and_player", (q: any) =>
        q.eq("gameId", game._id).eq("playerId", game.currentPlayerId!)
      )
      .unique();

    if (score) {
      await ctx.db.patch(score._id, {
        points: score.points + 1,
      });
    }

    // Log match event
    await ctx.db.insert("audit", {
      type: "match_found",
      gameId: game._id,
      roomId,
      userId: game.currentPlayerId!,
      payload: {
        turnId,
        cardIds,
        questionId: card1.questionId,
        newScore: score ? score.points + 1 : 1,
      },
      ts: Date.now(),
    });

    // Check if game is complete (all cards matched)
    const remainingCards = await ctx.db
      .query("cards")
      .withIndex("by_game_id", (q: any) => q.eq("gameId", game._id))
      .filter((q: any) => q.neq(q.field("state"), "matched"))
      .collect();

    if (remainingCards.length === 0) {
      // Game complete!
      await ctx.db.patch(game._id, {
        status: "complete" as const,
        completedAt: Date.now(),
      });

      // Update room status
      await ctx.db.patch(roomId, {
        status: "ended" as const,
      });

      // Log game completion
      await ctx.db.insert("audit", {
        type: "game_completed",
        gameId: game._id,
        roomId,
        userId: game.currentPlayerId!,
        payload: { completedAt: Date.now() },
        ts: Date.now(),
      });
    } else if (game.settings.extraTurnOnMatch) {
      // Current player gets another turn - don't advance
      // Log extra turn
      await ctx.db.insert("audit", {
        type: "extra_turn_awarded",
        gameId: game._id,
        roomId,
        userId: game.currentPlayerId!,
        payload: { turnId },
        ts: Date.now(),
      });
    } else {
      // Advance to next player even on match
      await advanceToNextPlayer(ctx, game, roomId);
    }
  } else {
    // Not a match - schedule cards to be flipped back after a brief delay
    // This allows players to see both cards before they flip back
    await ctx.scheduler.runAfter(2000, "actions/timers:executeFlipBack", {
      roomId,
      cardIds,
    });

    // Advance to next player
    await advanceToNextPlayer(ctx, game, roomId);

    // Log mismatch event
    await ctx.db.insert("audit", {
      type: "mismatch",
      gameId: game._id,
      roomId,
      userId: game.currentPlayerId!,
      payload: { turnId, cardIds },
      ts: Date.now(),
    });
  }

  return isMatch;
}

// Helper function to advance to the next player
async function advanceToNextPlayer(ctx: any, game: Doc<"games">, roomId: Id<"rooms">) {
  // Get all players in turn order
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_room_id", (q: any) => q.eq("roomId", roomId))
    .collect();

  const players = memberships
    .filter((m: any) => m.role === "player" || m.role === "host")
    .sort((a: any, b: any) => a.joinedAt - b.joinedAt); // Consistent turn order

  if (players.length === 0) {
    throw new Error("No players found");
  }

  // Find current player index
  const currentIndex = players.findIndex((p: any) => p.userId === game.currentPlayerId);
  if (currentIndex === -1) {
    throw new Error("Current player not found");
  }

  // Get next player (wrap around)
  const nextIndex = (currentIndex + 1) % players.length;
  const nextPlayer = players[nextIndex];

  // Update game with next player
  await ctx.db.patch(game._id, {
    currentPlayerId: nextPlayer.userId,
    turnIndex: game.turnIndex + 1,
  });

  // Log turn advance
  await ctx.db.insert("audit", {
    type: "turn_advanced",
    gameId: game._id,
    roomId,
    userId: game.currentPlayerId!,
    payload: {
      previousPlayerId: game.currentPlayerId,
      nextPlayerId: nextPlayer.userId,
      turnIndex: game.turnIndex + 1,
    },
    ts: Date.now(),
  });
}

export const resolveTurnManual = sessionMutation({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // This mutation can be called by actions or manually to resolve turns
    // Get current game
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game || game.status !== "active") {
      return null;
    }

    // Get current unresolved turn
    const currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    if (!currentTurn || currentTurn.picks.length !== 2) {
      return null;
    }

    // Get the cards that were picked
    const [card1, card2] = await Promise.all([
      ctx.db.get(currentTurn.picks[0]),
      ctx.db.get(currentTurn.picks[1]),
    ]);

    if (!card1 || !card2) {
      return null;
    }

    // If cards are face up and it's not a match, flip them back
    if (card1.state === "faceUp" && card2.state === "faceUp") {
      const isMatch = card1.questionId === card2.questionId;

      if (!isMatch) {
        // Flip cards back to face down
        await ctx.db.patch(card1._id, { state: "faceDown" as const });
        await ctx.db.patch(card2._id, { state: "faceDown" as const });

        // Log flip back event
        await ctx.db.insert("audit", {
          type: "cards_flipped_back",
          gameId: game._id,
          roomId: args.roomId,
          payload: { turnId: currentTurn._id, cardIds: [card1._id, card2._id] },
          ts: Date.now(),
        });
      }
    }

    return null;
  },
});

// Simple mutation to flip a card back to face down
export const flipCardBack = mutation({
  args: {
    cardId: v.id("cards"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found");
    }

    // Only flip back if card is currently face up
    if (card.state === "faceUp") {
      await ctx.db.patch(args.cardId, {
        state: "faceDown" as const,
      });

      // Get the game to find the roomId
      const game = await ctx.db.get(card.gameId);
      if (game) {
        // Log flip back event
        await ctx.db.insert("audit", {
          type: "card_flipped_back",
          gameId: card.gameId,
          roomId: game.roomId,
          payload: { cardId: args.cardId },
          ts: Date.now(),
        });
      }
    }

    return null;
  },
});

// Regular mutation version for calling from actions
export const resolveTurnManualFromAction = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get current game
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game) {
      throw new Error("No active game found");
    }

    // Get current unresolved turn
    const currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    if (!currentTurn) {
      return null; // No turn to resolve
    }

    // Resolve the turn
    await resolveTurn(ctx, currentTurn._id, currentTurn.picks, game, args.roomId);

    return null;
  },
});

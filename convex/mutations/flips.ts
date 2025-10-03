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

    // Award point to current player immediately for the match
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

    // Set turn to await author guessing for potential extra turn
    await ctx.db.patch(turnId, {
      awaitingAuthorGuess: true,
    });

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
    }

    // Don't advance turn yet - wait for author guesses to determine if player gets extra turn
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
    await ctx.db.patch(args.cardId, {
      state: "faceDown" as const,
    });
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

export const submitAuthorGuess = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    guesses: v.array(v.object({
      answerId: v.id("answers"),
      guessedAuthorId: v.id("users"),
    })),
  },
  returns: v.object({
    correct: v.boolean(),
    earnedPoint: v.boolean(),
    continuesTurn: v.boolean(),
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

    // Verify it's the current player's turn
    if (game.currentPlayerId !== ctx.session.userId) {
      throw new Error("Not your turn");
    }

    // Get the current turn that's awaiting author guess
    const currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), true))
      .filter((q) => q.eq(q.field("awaitingAuthorGuess"), true))
      .filter((q) => q.eq(q.field("playerId"), ctx.session.userId))
      .first();

    if (!currentTurn) {
      throw new Error("No turn awaiting author guess found");
    }

    // Verify the guesses match the cards in the turn
    if (args.guesses.length !== 2) {
      throw new Error("Must provide exactly 2 author guesses");
    }

    // Get the matched cards to verify the answers
    const [card1, card2] = await Promise.all([
      ctx.db.get(currentTurn.picks[0]),
      ctx.db.get(currentTurn.picks[1]),
    ]);

    if (!card1 || !card2) {
      throw new Error("Cards not found");
    }

    // Get the actual answers to check correctness
    const [answer1, answer2] = await Promise.all([
      ctx.db.get(card1.answerId),
      ctx.db.get(card2.answerId),
    ]);

    if (!answer1 || !answer2) {
      throw new Error("Answers not found");
    }

    // The guesses should be for the two matched cards in order
    if (args.guesses.length !== 2) {
      throw new Error("Must provide exactly 2 author guesses");
    }

    // Match guesses to cards by position (first guess for first card, second for second)
    const guess1 = args.guesses[0];
    const guess2 = args.guesses[1];

    const correct1 = guess1.guessedAuthorId === answer1.createdByUserId;
    const correct2 = guess2.guessedAuthorId === answer2.createdByUserId;
    const allCorrect = correct1 && correct2;

    // Update the turn with the guesses and result
    await ctx.db.patch(currentTurn._id, {
      authorGuesses: args.guesses,
      authorGuessCorrect: allCorrect,
      awaitingAuthorGuess: false,
    });

    let continuesTurn = false;

    if (allCorrect) {
      // Log successful author guess
      await ctx.db.insert("audit", {
        type: "author_guess_correct",
        gameId: game._id,
        roomId: args.roomId,
        userId: ctx.session.userId,
        payload: {
          turnId: currentTurn._id,
          guesses: args.guesses,
        },
        ts: Date.now(),
      });

      // Player gets extra turn for correct author guess (regardless of extraTurnOnMatch setting)
      continuesTurn = true;

      // Log extra turn
      await ctx.db.insert("audit", {
        type: "extra_turn_awarded_author_guess",
        gameId: game._id,
        roomId: args.roomId,
        userId: ctx.session.userId,
        payload: { turnId: currentTurn._id },
        ts: Date.now(),
      });
    } else {
      // Incorrect guess - advance to next player
      await advanceToNextPlayer(ctx, game, args.roomId);

      // Log incorrect author guess
      await ctx.db.insert("audit", {
        type: "author_guess_incorrect",
        gameId: game._id,
        roomId: args.roomId,
        userId: ctx.session.userId,
        payload: {
          turnId: currentTurn._id,
          guesses: args.guesses,
          correctAuthors: [answer1.createdByUserId, answer2.createdByUserId],
        },
        ts: Date.now(),
      });
    }

    return {
      correct: allCorrect,
      earnedPoint: true, // Always true since points were already awarded for the match
      continuesTurn,
    };
  },
});

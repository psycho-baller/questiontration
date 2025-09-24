import { query } from "../_generated/server";
import { v } from "convex/values";

export const gameState = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    // Get the current game for this room
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game) {
      return null;
    }

    // Get all cards for this game
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    // Get card details with questions and answers (only for face-up or matched cards)
    const cardsWithDetails = await Promise.all(
      cards.map(async (card) => {
        let question = null;
        let answer = null;

        // Only reveal question/answer details for face-up or matched cards
        if (card.state === "faceUp" || card.state === "matched") {
          question = await ctx.db.get(card.questionId);
          answer = await ctx.db.get(card.answerId);
        }

        return {
          ...card,
          question: question ? { text: question.text } : null,
          answer: answer ? { text: answer.text } : null,
        };
      })
    );

    // Get all scores for this game
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    // Get user details for scores
    const scoresWithUsers = await Promise.all(
      scores.map(async (score) => {
        const user = await ctx.db.get(score.playerId);
        return {
          ...score,
          user: user ? {
            _id: user._id,
            handle: user.handle,
            avatarUrl: user.avatarUrl,
          } : null,
        };
      })
    );

    // Get current turn
    const currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    // Get current player details
    let currentPlayer = null;
    if (game.currentPlayerId) {
      const user = await ctx.db.get(game.currentPlayerId);
      if (user) {
        currentPlayer = {
          _id: user._id,
          handle: user.handle,
          avatarUrl: user.avatarUrl,
        };
      }
    }

    return {
      game,
      cards: cardsWithDetails.sort((a, b) => a.position - b.position),
      scores: scoresWithUsers.filter(s => s.user !== null),
      currentTurn,
      currentPlayer,
    };
  },
});

export const gameById = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return null;
    }

    // Get all cards for this game
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    // Get card details with questions and answers (only for face-up or matched cards)
    const cardsWithDetails = await Promise.all(
      cards.map(async (card) => {
        let question = null;
        let answer = null;

        // Only reveal question/answer details for face-up or matched cards
        if (card.state === "faceUp" || card.state === "matched") {
          question = await ctx.db.get(card.questionId);
          answer = await ctx.db.get(card.answerId);
        }

        return {
          ...card,
          question: question ? { text: question.text } : null,
          answer: answer ? { text: answer.text } : null,
        };
      })
    );

    // Get all scores for this game
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    // Get user details for scores
    const scoresWithUsers = await Promise.all(
      scores.map(async (score) => {
        const user = await ctx.db.get(score.playerId);
        return {
          ...score,
          user: user ? {
            _id: user._id,
            handle: user.handle,
            avatarUrl: user.avatarUrl,
          } : null,
        };
      })
    );

    // Get current turn
    const currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    // Get current player details
    let currentPlayer = null;
    if (game.currentPlayerId) {
      const user = await ctx.db.get(game.currentPlayerId);
      if (user) {
        currentPlayer = {
          _id: user._id,
          handle: user.handle,
          avatarUrl: user.avatarUrl,
        };
      }
    }

    return {
      game,
      cards: cardsWithDetails.sort((a, b) => a.position - b.position),
      scores: scoresWithUsers.filter(s => s.user !== null),
      currentTurn,
      currentPlayer,
    };
  },
});

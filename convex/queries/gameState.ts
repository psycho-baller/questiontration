import { query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const gameState = query({
  args: {
    roomId: v.id("rooms")
  },
  returns: v.union(
    v.null(),
    v.object({
      game: v.object({
        _id: v.id("games"),
        roomId: v.id("rooms"),
        boardSize: v.number(),
        pairCount: v.number(),
        status: v.union(
          v.literal("collecting"),
          v.literal("ready"),
          v.literal("active"),
          v.literal("complete")
        ),
        turnIndex: v.number(),
        currentPlayerId: v.optional(v.id("users")),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        settings: v.object({
          mode: v.union(v.literal("curated"), v.literal("player")),
          extraTurnOnMatch: v.boolean(),
          turnSeconds: v.number(),
          collectSeconds: v.number(),
          contentRating: v.union(v.literal("PG"), v.literal("PG13")),
        }),
        _creationTime: v.number(),
      }),
      cards: v.array(v.object({
        _id: v.id("cards"),
        gameId: v.id("games"),
        questionId: v.id("questions"),
        answerId: v.id("answers"),
        position: v.number(),
        state: v.union(v.literal("faceDown"), v.literal("faceUp"), v.literal("matched")),
        // Only include answer text if card is face up or matched
        answerText: v.optional(v.string()),
        // Only include question text if both cards of pair are matched
        questionText: v.optional(v.string()),
      })),
      scores: v.array(v.object({
        _id: v.id("scores"),
        gameId: v.id("games"),
        playerId: v.id("users"),
        points: v.number(),
        playerHandle: v.string(),
      })),
      currentTurn: v.optional(v.object({
        _id: v.id("turns"),
        gameId: v.id("games"),
        playerId: v.id("users"),
        picks: v.array(v.id("cards")),
        resolved: v.boolean(),
        correct: v.boolean(),
        startedAt: v.number(),
        resolvedAt: v.optional(v.number()),
      })),
    })
  ),
  handler: async (ctx, args) => {
    // Get the current game for this room
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc") // Get the most recent game
      .first();

    if (!game) {
      return null;
    }

    // Get all cards for this game
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .collect();

    // Get card details with conditional text inclusion
    const cardsWithDetails = await Promise.all(
      cards.map(async (card) => {
        let answerText: string | undefined;
        let questionText: string | undefined;

        // Only include answer text if card is face up or matched
        if (card.state === "faceUp" || card.state === "matched") {
          const answer = await ctx.db.get(card.answerId);
          answerText = answer?.text;
        }

        // Only include question text if card is matched
        if (card.state === "matched") {
          const question = await ctx.db.get(card.questionId);
          questionText = question?.text;
        }

        return {
          _id: card._id,
          gameId: card.gameId,
          questionId: card.questionId,
          answerId: card.answerId,
          position: card.position,
          state: card.state,
          answerText,
          questionText,
        };
      })
    );

    // Sort cards by position for consistent rendering
    cardsWithDetails.sort((a, b) => a.position - b.position);

    // Get all scores for this game
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .collect();

    // Get player handles for scores
    const scoresWithHandles = await Promise.all(
      scores.map(async (score) => {
        const player = await ctx.db.get(score.playerId);
        return {
          _id: score._id,
          gameId: score.gameId,
          playerId: score.playerId,
          points: score.points,
          playerHandle: player?.handle || "Unknown Player",
        };
      })
    );

    // Get current unresolved turn if any
    const currentTurn = await ctx.db
      .query("turns")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("resolved"), false))
      .first();

    return {
      game: {
        _id: game._id,
        roomId: game.roomId,
        boardSize: game.boardSize,
        pairCount: game.pairCount,
        status: game.status,
        turnIndex: game.turnIndex,
        currentPlayerId: game.currentPlayerId,
        startedAt: game.startedAt,
        completedAt: game.completedAt,
        settings: game.settings,
        _creationTime: game._creationTime,
      },
      cards: cardsWithDetails,
      scores: scoresWithHandles,
      currentTurn: currentTurn || undefined,
    };
  },
});

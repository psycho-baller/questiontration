import { sessionMutation } from "../lib/myFunctions";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { randomSlug } from "../lib/randomSlug";
import { getUserById } from "../users";
import { mutation } from "../_generated/server";

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const startCollection = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    mode: v.union(v.literal("curated"), v.literal("player")),
    settings: v.optional(v.object({
      extraTurnOnMatch: v.optional(v.boolean()),
      turnSeconds: v.optional(v.number()),
      collectSeconds: v.optional(v.number()),
      contentRating: v.optional(v.union(v.literal("PG"), v.literal("PG13"))),
    })),
  },
  returns: v.id("games"),
  handler: async (ctx, args) => {
    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can start collection");
    }

    if (room.status !== "lobby") {
      throw new Error("Room must be in lobby status to start collection");
    }

    // Update room status
    await ctx.db.patch(args.roomId, {
      status: "collecting" as const,
    });

    // Create game instance
    const gameId = await ctx.db.insert("games", {
      roomId: args.roomId,
      boardSize: 16, // 4x4 board
      pairCount: 8, // 8 pairs
      status: "collecting" as const,
      turnIndex: 0,
      currentPlayerId: ctx.session.userId,
      startedAt: Date.now(),
      settings: {
        mode: args.mode,
        extraTurnOnMatch: args.settings?.extraTurnOnMatch ?? true,
        turnSeconds: args.settings?.turnSeconds ?? 20,
        collectSeconds: args.settings?.collectSeconds ?? 120,
        contentRating: args.settings?.contentRating ?? "PG",
        boardSize: 16,
        pairCount: 8
      },
      hostId: ctx.session.userId,
      playerIds: [],
      roundIds: [],
      slug: randomSlug(),
      state: { stage: "lobby" },
    });

    // Initialize scores for all players
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    const players = memberships.filter(m => m.role === "player" || m.role === "host");

    for (const player of players) {
      await ctx.db.insert("scores", {
        gameId,
        playerId: player.userId,
        points: 0,
      });
    }

    // If curated mode, add preset questions
    if (args.mode === "curated") {
      await addCuratedQuestions(ctx, args.roomId, ctx.session.userId);
    }

    // Log audit event
    await ctx.db.insert("audit", {
      type: "collection_started",
      gameId,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: { mode: args.mode, settings: args.settings },
      ts: Date.now(),
    });

    return gameId;
  },
});

// Helper function to add curated questions
async function addCuratedQuestions(ctx: any, roomId: Id<"rooms">, userId: Id<"users">) {
  // Load curated questions from JSON file
  const curatedQuestions = [
    "What's your favorite childhood memory?",
    "If you could have dinner with anyone, who would it be?",
    "What's the best advice you've ever received?",
    "What's your biggest fear?",
    "What's your dream vacation destination?",
    "What's the most interesting thing about you?",
    "What's your favorite book or movie?",
    "What would you do with a million dollars?",
    "What's your biggest accomplishment?",
    "What's something you've always wanted to learn?",
    "What's your favorite way to spend a weekend?",
    "What's the best gift you've ever received?",
  ];

  // Shuffle and take 8 questions
  const selectedQuestions = shuffleArray(curatedQuestions).slice(0, 8);

  // Insert questions
  for (const questionText of selectedQuestions) {
    await ctx.db.insert("questions", {
      text: questionText,
      createdByUserId: userId,
      roomId,
      usedCount: 0,
      approved: true,
    });
  }
}

export const assembleBoard = sessionMutation({
  args: {
    roomId: v.id("rooms"),
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

    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can assemble the board");
    }

    if (game.status !== "collecting") {
      throw new Error("Game must be in collecting status");
    }

    // Get all questions with at least 2 answers
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question_id", (q) => q.eq("questionId", question._id))
          .collect();
        return { question, answers };
      })
    );

    // Filter questions that have at least 2 answers
    const validQuestions = questionsWithAnswers.filter(qa => qa.answers.length >= 2);

    if (validQuestions.length < 8) {
      throw new Error(`Need at least 8 questions with 2+ answers. Currently have ${validQuestions.length}`);
    }

    // Take first 8 questions (could be randomized)
    const selectedQuestions = validQuestions.slice(0, 8);

    // Create cards for each question (2 cards per question)
    const cards: Array<{
      questionId: Id<"questions">;
      answerId: Id<"answers">;
      position: number;
    }> = [];

    for (const { question, answers } of selectedQuestions) {
      // Pick 2 answers, preferring different authors
      const selectedAnswers = selectTwoAnswers(answers);

      for (const answer of selectedAnswers) {
        cards.push({
          questionId: question._id,
          answerId: answer._id,
          position: 0, // Will be set after shuffling
        });
      }
    }

    // Shuffle positions
    const positions = Array.from({ length: 16 }, (_, i) => i);
    const shuffledPositions = shuffleArray(positions);

    // Insert cards with shuffled positions
    for (let i = 0; i < cards.length; i++) {
      await ctx.db.insert("cards", {
        gameId: game._id,
        questionId: cards[i].questionId,
        answerId: cards[i].answerId,
        position: shuffledPositions[i],
        state: "faceDown" as const,
      });
    }

    // Update game status
    await ctx.db.patch(game._id, {
      status: "ready" as const,
    });

    // Update room status
    await ctx.db.patch(args.roomId, {
      status: "playing" as const,
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "board_assembled",
      gameId: game._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: { questionCount: selectedQuestions.length, cardCount: cards.length },
      ts: Date.now(),
    });

    return null;
  },
});

// Helper function to select 2 answers, preferring different authors
function selectTwoAnswers(answers: Doc<"answers">[]): Doc<"answers">[] {
  if (answers.length < 2) {
    throw new Error("Need at least 2 answers");
  }

  // Try to find answers from different users
  const userIds = new Set(answers.map(a => a.createdByUserId));

  if (userIds.size >= 2) {
    // Pick one answer from each of the first two different users
    const firstUserId = answers[0].createdByUserId;
    const secondAnswer = answers.find(a => a.createdByUserId !== firstUserId);
    return [answers[0], secondAnswer!];
  } else {
    // All answers from same user, just take first two
    return answers.slice(0, 2);
  }
}

export const startGame = sessionMutation({
  args: {
    roomId: v.id("rooms"),
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

    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can start the game");
    }

    if (game.status !== "ready") {
      throw new Error("Game must be ready to start");
    }

    // Get players for turn order
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    const players = memberships.filter(m => m.role === "player" || m.role === "host");

    if (players.length < 2) {
      throw new Error("Need at least 2 players to start");
    }

    // Set first player
    const firstPlayer = players[0];

    // Update game status
    await ctx.db.patch(game._id, {
      status: "active" as const,
      currentPlayerId: firstPlayer.userId,
      startedAt: Date.now(),
      turnIndex: 0,
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "game_started",
      gameId: game._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: { playerCount: players.length, firstPlayerId: firstPlayer.userId },
      ts: Date.now(),
    });

    return null;
  },
});

export const endGame = sessionMutation({
  args: {
    roomId: v.id("rooms"),
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

    // Update game status
    await ctx.db.patch(game._id, {
      status: "complete" as const,
      completedAt: Date.now(),
    });

    // Update room status
    await ctx.db.patch(args.roomId, {
      status: "ended" as const,
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "game_ended",
      gameId: game._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: {},
      ts: Date.now(),
    });

    return null;
  },
});

export const rematch = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    reuseQuestions: v.optional(v.boolean()),
  },
  returns: v.id("games"),
  handler: async (ctx, args) => {
    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can start a rematch");
    }

    // Get previous game for settings
    const previousGame = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!previousGame) {
      throw new Error("No previous game found");
    }

    // Verify user is host
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can start a rematch");
    }

    // Reset room status
    await ctx.db.patch(args.roomId, {
      status: "lobby" as const,
    });

    // Reset member ready states
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    for (const membership of memberships) {
      await ctx.db.patch(membership._id, {
        ready: false,
      });
    }

    // If not reusing questions, clear old questions and answers
    if (!args.reuseQuestions) {
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
        .collect();

      for (const question of questions) {
        // Delete answers first
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question_id", (q) => q.eq("questionId", question._id))
          .collect();

        for (const answer of answers) {
          await ctx.db.delete(answer._id);
        }

        // Delete question
        await ctx.db.delete(question._id);
      }
    }

    // Log audit event
    await ctx.db.insert("audit", {
      type: "rematch_started",
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: { reuseQuestions: args.reuseQuestions ?? false },
      ts: Date.now(),
    });

    return previousGame._id; // Return previous game ID for reference
  },
});

// Regular mutation version for calling from actions
export const assembleBoardFromAction = mutation({
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

    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== args.userId) {
      throw new Error("Only the host can assemble the board");
    }

    if (game.status !== "collecting") {
      throw new Error("Game must be in collecting phase to assemble board");
    }

    // Get approved questions with at least 2 answers
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    const approvedQuestions = questions.filter(q =>
      (game.settings.mode === "curated" || q.approved !== false)
    );

    const questionsWithAnswers = await Promise.all(
      approvedQuestions.map(async (question) => {
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question_id", (q) => q.eq("questionId", question._id))
          .collect();
        return { question, answers };
      })
    );

    const validQuestions = questionsWithAnswers.filter(
      ({ answers }) => answers.length >= 2
    );

    if (validQuestions.length < game.pairCount) {
      throw new Error(`Need at least ${game.pairCount} questions with 2+ answers. Currently have ${validQuestions.length}.`);
    }

    // Select questions and create cards
    const selectedQuestions = shuffleArray(validQuestions).slice(0, game.pairCount);
    const cards: Array<{ questionId: Id<"questions">; answerId: Id<"answers">; position: number }> = [];

    selectedQuestions.forEach((questionData, questionIndex) => {
      const selectedAnswers = shuffleArray(questionData.answers).slice(0, 2);
      selectedAnswers.forEach((answer, answerIndex) => {
        cards.push({
          questionId: questionData.question._id,
          answerId: answer._id,
          position: questionIndex * 2 + answerIndex,
        });
      });
    });

    // Shuffle card positions
    const shuffledCards = shuffleArray(cards);
    shuffledCards.forEach((card, index) => {
      card.position = index;
    });

    // Insert cards into database
    for (const card of shuffledCards) {
      await ctx.db.insert("cards", {
        gameId: game._id,
        questionId: card.questionId,
        answerId: card.answerId,
        position: card.position,
        state: "faceDown" as const,
      });
    }

    // Update game status to ready
    await ctx.db.patch(game._id, {
      status: "ready" as const,
    });

    // Update room status
    await ctx.db.patch(args.roomId, {
      status: "playing" as const,
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "board_assembled",
      gameId: game._id,
      roomId: args.roomId,
      userId: args.userId,
      payload: { questionCount: selectedQuestions.length, cardCount: cards.length },
      ts: Date.now(),
    });

    return null;
  },
});

// Reset game progress while keeping the same questions and answers
export const resetGameProgress = sessionMutation({
  args: {
    roomId: v.id("rooms"),
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

    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can reset the game");
    }

    // if (game.status !== "active") {
    //   throw new Error("Can only reset active games");
    // }

    // Reset all cards to face down
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .collect();

    for (const card of cards) {
      await ctx.db.patch(card._id, {
        state: "faceDown" as const,
      });
    }

    // Reset all scores to 0
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .collect();

    for (const score of scores) {
      await ctx.db.patch(score._id, {
        points: 0,
      });
    }

    // Delete all turns
    const turns = await ctx.db
      .query("turns")
      .withIndex("by_game_id", (q) => q.eq("gameId", game._id))
      .collect();

    for (const turn of turns) {
      await ctx.db.delete(turn._id);
    }

    // Reset game state
    const players = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    const activePlayers = players.filter(p => p.role === "player" || p.role === "host");
    const firstPlayer = activePlayers.sort((a, b) => a.joinedAt - b.joinedAt)[0];

    await ctx.db.patch(game._id, {
      turnIndex: 0,
      currentPlayerId: firstPlayer?.userId,
      status: "active" as const,
    });

    // Log reset event
    await ctx.db.insert("audit", {
      type: "game_reset",
      gameId: game._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: {
        cardsReset: cards.length,
        scoresReset: scores.length,
        turnsDeleted: turns.length,
      },
      ts: Date.now(),
    });

    return null;
  },
});

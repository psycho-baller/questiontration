import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Curated questions data
const curatedQuestions = [
  { text: "What's your favorite pizza topping?", category: "food" },
  { text: "What superpower would you choose?", category: "fun" },
  { text: "What's your dream vacation destination?", category: "travel" },
  { text: "What's your favorite movie genre?", category: "entertainment" },
  { text: "What's your go-to comfort food?", category: "food" },
  { text: "What animal would you want as a pet?", category: "animals" },
  { text: "What's your favorite season?", category: "general" },
  { text: "What's your ideal way to spend a weekend?", category: "lifestyle" },
  { text: "What's your favorite type of music?", category: "entertainment" },
  { text: "What's your biggest fear?", category: "personal" },
  { text: "What's your favorite childhood memory?", category: "personal" },
  { text: "What's your dream job?", category: "career" },
  { text: "What's your favorite color?", category: "general" },
  { text: "What's your favorite board game?", category: "games" },
  { text: "What's your favorite ice cream flavor?", category: "food" },
  { text: "What's your favorite book or book genre?", category: "entertainment" },
  { text: "What's your favorite way to exercise?", category: "health" },
  { text: "What's your favorite holiday?", category: "general" },
  { text: "What's your favorite app on your phone?", category: "technology" },
  { text: "What's your biggest accomplishment?", category: "personal" },
  { text: "What's your favorite type of weather?", category: "general" },
  { text: "What's your favorite way to relax?", category: "lifestyle" },
  { text: "What's your favorite childhood cartoon?", category: "entertainment" },
  { text: "What's your favorite type of cuisine?", category: "food" },
  { text: "What's your biggest pet peeve?", category: "personal" },
  { text: "What's your favorite social media platform?", category: "technology" },
  { text: "What's your favorite time of day?", category: "general" },
  { text: "What's your favorite sport to watch or play?", category: "sports" },
  { text: "What's your favorite type of art?", category: "culture" },
  { text: "What's your favorite way to learn new things?", category: "education" },
];

export const startCollection = mutation({
  args: {
    roomId: v.id("rooms"),
    hostUserId: v.id("users"),
    mode: v.union(v.literal("curated"), v.literal("player")),
    settings: v.optional(v.object({
      extraTurnOnMatch: v.optional(v.boolean()),
      turnSeconds: v.optional(v.number()),
      collectSeconds: v.optional(v.number()),
      contentRating: v.optional(v.union(v.literal("PG"), v.literal("PG13"))),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify host permissions
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.hostUserId !== args.hostUserId) {
      throw new Error("Only the host can start the game");
    }

    if (room.status !== "lobby") {
      throw new Error("Game can only be started from lobby");
    }

    // Update room status
    await ctx.db.patch(args.roomId, { status: "collecting" });

    // Create game instance
    const gameSettings = {
      mode: args.mode,
      extraTurnOnMatch: args.settings?.extraTurnOnMatch ?? true,
      turnSeconds: args.settings?.turnSeconds ?? 20,
      collectSeconds: args.settings?.collectSeconds ?? 120,
      contentRating: args.settings?.contentRating ?? "PG",
    };

    const gameId = await ctx.db.insert("concentrationGames", {
      roomId: args.roomId,
      boardSize: 16,
      pairCount: 8,
      status: "collecting",
      turnIndex: 0,
      settings: gameSettings,
    });

    // If curated mode, select 8 random questions and add them
    if (args.mode === "curated") {
      const shuffled = [...curatedQuestions].sort(() => Math.random() - 0.5);
      const selectedQuestions = shuffled.slice(0, 8);

      for (const curatedQ of selectedQuestions) {
        await ctx.db.insert("questions", {
          text: curatedQ.text,
          createdByUserId: undefined,
          roomId: args.roomId,
          usedCount: 0,
          createdAt: now,
        });
      }
    }

    // Log the action
    await ctx.db.insert("audit", {
      type: "collection_started",
      gameId,
      roomId: args.roomId,
      userId: args.hostUserId,
      payload: { mode: args.mode, settings: gameSettings },
      ts: now,
    });

    return { gameId };
  },
});

export const submitAnswer = mutation({
  args: {
    roomId: v.id("rooms"),
    questionId: v.id("questions"),
    userId: v.id("users"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate answer length
    if (args.text.length < 1 || args.text.length > 200) {
      throw new Error("Answer must be between 1 and 200 characters");
    }

    // Check if user is a member of the room
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this room");
    }

    // Check if user already answered this question
    const existingAnswer = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .filter((q) => q.eq(q.field("createdByUserId"), args.userId))
      .first();

    if (existingAnswer) {
      // Update existing answer
      await ctx.db.patch(existingAnswer._id, {
        text: args.text.trim(),
      });

      return { answerId: existingAnswer._id, updated: true };
    } else {
      // Create new answer
      const answerId = await ctx.db.insert("answers", {
        questionId: args.questionId,
        text: args.text.trim(),
        createdByUserId: args.userId,
        roomId: args.roomId,
        createdAt: now,
      });

      // Log the action
      await ctx.db.insert("audit", {
        type: "answer_submitted",
        roomId: args.roomId,
        userId: args.userId,
        payload: { questionId: args.questionId, answerId },
        ts: now,
      });

      return { answerId, updated: false };
    }
  },
});

export const assembleBoard = mutation({
  args: {
    roomId: v.id("rooms"),
    hostUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify host permissions
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.hostUserId !== args.hostUserId) {
      throw new Error("Only the host can assemble the board");
    }

    // Get current game
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game || game.status !== "collecting") {
      throw new Error("No active collection phase found");
    }

    // Get all questions for this room
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    if (questions.length < 8) {
      throw new Error("Need at least 8 questions to start the game");
    }

    // Select 8 questions (prioritize those with 2+ answers)
    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question", (q) => q.eq("questionId", question._id))
          .collect();
        return { question, answers };
      })
    );

    // Sort by answer count (descending) and take first 8
    questionsWithAnswers.sort((a, b) => b.answers.length - a.answers.length);
    const selectedQuestions = questionsWithAnswers.slice(0, 8);

    // Validate we have enough answers
    for (const { question, answers } of selectedQuestions) {
      if (answers.length < 2) {
        throw new Error(`Question "${question.text}" needs at least 2 answers`);
      }
    }

    // Create cards (2 per question = 16 total)
    const cards: Array<{
      questionId: string;
      answerId: string;
      position: number;
    }> = [];

    for (const { question, answers } of selectedQuestions) {
      // Pick 2 answers, preferring different authors
      let selectedAnswers = answers.slice(0, 2);
      
      if (answers.length > 2) {
        // Try to find 2 answers from different users
        const uniqueAuthors = new Set();
        selectedAnswers = [];
        
        for (const answer of answers) {
          if (selectedAnswers.length < 2) {
            if (!uniqueAuthors.has(answer.createdByUserId) || selectedAnswers.length === 0) {
              selectedAnswers.push(answer);
              uniqueAuthors.add(answer.createdByUserId);
            }
          }
        }
        
        // If we still need more answers, add any remaining
        if (selectedAnswers.length < 2) {
          for (const answer of answers) {
            if (selectedAnswers.length < 2 && !selectedAnswers.includes(answer)) {
              selectedAnswers.push(answer);
            }
          }
        }
      }

      // Add cards for this question
      for (const answer of selectedAnswers) {
        cards.push({
          questionId: question._id,
          answerId: answer._id,
          position: 0, // Will be set after shuffling
        });
      }
    }

    // Shuffle positions using Fisher-Yates
    const positions = Array.from({ length: 16 }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Assign positions and create cards
    for (let i = 0; i < cards.length; i++) {
      await ctx.db.insert("cards", {
        gameId: game._id,
        questionId: cards[i].questionId as any,
        answerId: cards[i].answerId as any,
        position: positions[i],
        state: "faceDown",
      });
    }

    // Update game status
    await ctx.db.patch(game._id, { 
      status: "ready",
      startedAt: now,
    });

    // Log the action
    await ctx.db.insert("audit", {
      type: "board_assembled",
      gameId: game._id,
      roomId: args.roomId,
      userId: args.hostUserId,
      payload: { cardCount: cards.length },
      ts: now,
    });

    return { success: true };
  },
});

export const startGame = mutation({
  args: {
    roomId: v.id("rooms"),
    hostUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify host permissions
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.hostUserId !== args.hostUserId) {
      throw new Error("Only the host can start the game");
    }

    // Get current game
    const game = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game || game.status !== "ready") {
      throw new Error("Game is not ready to start");
    }

    // Get players
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("role"), "player"))
      .collect();

    if (memberships.length === 0) {
      throw new Error("No players in the room");
    }

    // Initialize scores for all players
    for (const membership of memberships) {
      await ctx.db.insert("scores", {
        gameId: game._id,
        playerId: membership.userId,
        points: 0,
      });
    }

    // Set first player
    const firstPlayer = memberships[0];
    
    // Update game status and room status
    await ctx.db.patch(game._id, {
      status: "active",
      currentPlayerId: firstPlayer.userId,
      turnIndex: 0,
    });

    await ctx.db.patch(args.roomId, { status: "playing" });

    // Log the action
    await ctx.db.insert("audit", {
      type: "game_started",
      gameId: game._id,
      roomId: args.roomId,
      userId: args.hostUserId,
      payload: { 
        playerCount: memberships.length,
        firstPlayerId: firstPlayer.userId,
      },
      ts: now,
    });

    return { success: true };
  },
});

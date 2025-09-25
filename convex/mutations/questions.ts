import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

// Basic profanity filter - in production, use a more sophisticated solution
const PROFANITY_WORDS = [
  "damn", "hell", "crap", "stupid", "idiot", "hate", "kill", "die", "death"
  // Add more words as needed - this is a minimal list for demo
];

function containsProfanity(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PROFANITY_WORDS.some(word => lowerText.includes(word));
}

function validateQuestionText(text: string): void {
  if (text.length < 20) {
    throw new Error("Question must be at least 20 characters long");
  }
  if (text.length > 120) {
    throw new Error("Question must be no more than 120 characters long");
  }
  if (containsProfanity(text)) {
    throw new Error("Question contains inappropriate content");
  }
}

function validateAnswerText(text: string): void {
  if (text.length < 5) {
    throw new Error("Answer must be at least 5 characters long");
  }
  if (text.length > 200) {
    throw new Error("Answer must be no more than 200 characters long");
  }
  if (containsProfanity(text)) {
    throw new Error("Answer contains inappropriate content");
  }
}

export const submitQuestion = mutation({
  args: {
    roomId: v.id("rooms"),
    text: v.string(),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated to submit questions");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate question text
    validateQuestionText(args.text);

    // Check if user is a member of the room
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", user._id)
      )
      .unique();

    if (!membership) {
      throw new Error("Must be a member of the room to submit questions");
    }

    // Check if room is in collecting phase
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "collecting") {
      throw new Error("Room must be in collecting phase to submit questions");
    }

    // Get current game to check mode
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    if (!game) {
      throw new Error("No active game found");
    }

    // In curated mode, only host can add questions (though this shouldn't happen in UI)
    if (game.settings.mode === "curated" && membership.role !== "host") {
      throw new Error("Only host can add questions in curated mode");
    }

    // Check for duplicate questions in this room
    const existingQuestion = await ctx.db
      .query("questions")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("text"), args.text))
      .first();

    if (existingQuestion) {
      throw new Error("This question has already been submitted");
    }

    // Rate limiting: check how many questions this user has submitted recently
    const recentQuestions = await ctx.db
      .query("questions")
      .withIndex("by_room_and_creator", (q) => 
        q.eq("roomId", args.roomId).eq("createdByUserId", user._id)
      )
      .collect();

    if (recentQuestions.length >= 5) { // Max 5 questions per user per game
      throw new Error("You have reached the maximum number of questions for this game");
    }

    // Create the question
    const questionId = await ctx.db.insert("questions", {
      text: args.text,
      createdByUserId: user._id,
      roomId: args.roomId,
      usedCount: 0,
      approved: game.settings.mode === "player" ? undefined : true, // Auto-approve in curated mode
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "question_submitted",
      gameId: game._id,
      roomId: args.roomId,
      userId: user._id,
      payload: { questionId, text: args.text },
      ts: Date.now(),
    });

    return questionId;
  },
});

export const submitAnswer = mutation({
  args: {
    roomId: v.id("rooms"),
    questionId: v.id("questions"),
    text: v.string(),
  },
  returns: v.id("answers"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated to submit answers");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Validate answer text
    validateAnswerText(args.text);

    // Check if user is a member of the room
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", user._id)
      )
      .unique();

    if (!membership) {
      throw new Error("Must be a member of the room to submit answers");
    }

    // Check if room is in collecting phase
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "collecting") {
      throw new Error("Room must be in collecting phase to submit answers");
    }

    // Verify question exists and belongs to this room
    const question = await ctx.db.get(args.questionId);
    if (!question || question.roomId !== args.roomId) {
      throw new Error("Question not found in this room");
    }

    // Check if user has already answered this question
    const existingAnswer = await ctx.db
      .query("answers")
      .withIndex("by_question_and_user", (q) => 
        q.eq("questionId", args.questionId).eq("createdByUserId", user._id)
      )
      .first();

    if (existingAnswer) {
      throw new Error("You have already answered this question");
    }

    // Check for duplicate answer text for this question
    const duplicateAnswer = await ctx.db
      .query("answers")
      .withIndex("by_question_id", (q) => q.eq("questionId", args.questionId))
      .filter((q) => q.eq(q.field("text"), args.text))
      .first();

    if (duplicateAnswer) {
      throw new Error("This answer has already been submitted for this question");
    }

    // Create the answer
    const answerId = await ctx.db.insert("answers", {
      questionId: args.questionId,
      text: args.text,
      createdByUserId: user._id,
      roomId: args.roomId,
    });

    // Get current game for audit log
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    // Log audit event
    await ctx.db.insert("audit", {
      type: "answer_submitted",
      gameId: game?._id,
      roomId: args.roomId,
      userId: user._id,
      payload: { questionId: args.questionId, answerId, text: args.text },
      ts: Date.now(),
    });

    return answerId;
  },
});

export const approveQuestion = mutation({
  args: {
    roomId: v.id("rooms"),
    questionId: v.id("questions"),
    approved: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== user._id) {
      throw new Error("Only the host can approve questions");
    }

    // Verify question exists and belongs to this room
    const question = await ctx.db.get(args.questionId);
    if (!question || question.roomId !== args.roomId) {
      throw new Error("Question not found in this room");
    }

    // Update question approval status
    await ctx.db.patch(args.questionId, {
      approved: args.approved,
    });

    // If disapproving, also remove any answers to this question
    if (!args.approved) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_question_id", (q) => q.eq("questionId", args.questionId))
        .collect();

      for (const answer of answers) {
        await ctx.db.delete(answer._id);
      }
    }

    // Get current game for audit log
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    // Log audit event
    await ctx.db.insert("audit", {
      type: args.approved ? "question_approved" : "question_rejected",
      gameId: game?._id,
      roomId: args.roomId,
      userId: user._id,
      payload: { questionId: args.questionId, questionText: question.text },
      ts: Date.now(),
    });

    return null;
  },
});

export const removeQuestion = mutation({
  args: {
    roomId: v.id("rooms"),
    questionId: v.id("questions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Verify question exists and belongs to this room
    const question = await ctx.db.get(args.questionId);
    if (!question || question.roomId !== args.roomId) {
      throw new Error("Question not found in this room");
    }

    // Check permissions: host can remove any question, users can remove their own
    const room = await ctx.db.get(args.roomId);
    const isHost = room?.hostUserId === user._id;
    const isOwner = question.createdByUserId === user._id;

    if (!isHost && !isOwner) {
      throw new Error("You can only remove your own questions, or be the host");
    }

    // Remove all answers to this question first
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question_id", (q) => q.eq("questionId", args.questionId))
      .collect();

    for (const answer of answers) {
      await ctx.db.delete(answer._id);
    }

    // Remove the question
    await ctx.db.delete(args.questionId);

    // Get current game for audit log
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    // Log audit event
    await ctx.db.insert("audit", {
      type: "question_removed",
      gameId: game?._id,
      roomId: args.roomId,
      userId: user._id,
      payload: { questionId: args.questionId, questionText: question.text, removedBy: isHost ? "host" : "owner" },
      ts: Date.now(),
    });

    return null;
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const questionPool = query({
  args: { 
    roomId: v.id("rooms") 
  },
  returns: v.object({
    questions: v.array(v.object({
      _id: v.id("questions"),
      text: v.string(),
      createdByUserId: v.id("users"),
      roomId: v.id("rooms"),
      usedCount: v.number(),
      approved: v.optional(v.boolean()),
      creatorHandle: v.string(),
      answerCount: v.number(),
      answers: v.array(v.object({
        _id: v.id("answers"),
        text: v.string(),
        createdByUserId: v.id("users"),
        creatorHandle: v.string(),
      })),
    })),
    progress: v.object({
      totalQuestions: v.number(),
      questionsWithTwoAnswers: v.number(),
      targetQuestions: v.number(), // 8 for the game
      readyForBoard: v.boolean(),
    }),
  }),
  handler: async (ctx, args) => {
    // Get all questions for this room
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Get question details with answers and creator info
    const questionsWithDetails = await Promise.all(
      questions.map(async (question) => {
        // Get creator handle
        const creator = await ctx.db.get(question.createdByUserId);
        const creatorHandle = creator?.handle || "Unknown User";

        // Get all answers for this question
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question_id", (q) => q.eq("questionId", question._id))
          .collect();

        // Get answer details with creator handles
        const answersWithDetails = await Promise.all(
          answers.map(async (answer) => {
            const answerCreator = await ctx.db.get(answer.createdByUserId);
            return {
              _id: answer._id,
              text: answer.text,
              createdByUserId: answer.createdByUserId,
              creatorHandle: answerCreator?.handle || "Unknown User",
            };
          })
        );

        return {
          _id: question._id,
          text: question.text,
          createdByUserId: question.createdByUserId,
          roomId: question.roomId,
          usedCount: question.usedCount,
          approved: question.approved,
          creatorHandle,
          answerCount: answers.length,
          answers: answersWithDetails,
        };
      })
    );

    // Calculate progress metrics
    const totalQuestions = questionsWithDetails.length;
    const questionsWithTwoAnswers = questionsWithDetails.filter(
      (q) => q.answerCount >= 2
    ).length;
    const targetQuestions = 8; // Fixed for v1
    const readyForBoard = questionsWithTwoAnswers >= targetQuestions;

    // Sort questions by creation time for consistent ordering
    questionsWithDetails.sort((a, b) => a._id.localeCompare(b._id));

    return {
      questions: questionsWithDetails,
      progress: {
        totalQuestions,
        questionsWithTwoAnswers,
        targetQuestions,
        readyForBoard,
      },
    };
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";

export const questionPool = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    // Get all questions for this room
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Get answer counts for each question
    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question", (q) => q.eq("questionId", question._id))
          .collect();

        // Get user details for answers
        const answersWithUsers = await Promise.all(
          answers.map(async (answer) => {
            const user = await ctx.db.get(answer.createdByUserId);
            return {
              ...answer,
              user: user ? {
                _id: user._id,
                handle: user.name,
                avatarUrl: user.pictureUrl,
              } : null,
            };
          })
        );

        return {
          ...question,
          answers: answersWithUsers.filter(a => a.user !== null),
          answerCount: answers.length,
        };
      })
    );

    // Calculate progress
    const totalQuestions = questionsWithAnswers.length;
    const questionsWithEnoughAnswers = questionsWithAnswers.filter(
      q => q.answerCount >= 2
    ).length;

    return {
      questions: questionsWithAnswers,
      progress: {
        total: totalQuestions,
        completed: questionsWithEnoughAnswers,
        percentage: totalQuestions > 0 ? (questionsWithEnoughAnswers / totalQuestions) * 100 : 0,
      },
    };
  },
});

export const userAnswerProgress = query({
  args: { 
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get all questions for this room
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Get user's answers for this room
    const userAnswers = await ctx.db
      .query("answers")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("createdByUserId"), args.userId))
      .collect();

    // Create a set of question IDs the user has answered
    const answeredQuestionIds = new Set(userAnswers.map(a => a.questionId));

    // Find questions the user still needs to answer
    const unansweredQuestions = questions.filter(
      q => !answeredQuestionIds.has(q._id)
    );

    return {
      totalQuestions: questions.length,
      answeredCount: userAnswers.length,
      unansweredQuestions,
      isComplete: unansweredQuestions.length === 0,
    };
  },
});

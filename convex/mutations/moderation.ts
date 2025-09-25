import { sessionMutation } from "../lib/myFunctions";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const reportContent = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    targetType: v.union(v.literal("question"), v.literal("answer")),
    targetId: v.string(),
    reason: v.string(),
  },
  returns: v.id("reports"),
  handler: async (ctx, args) => {
    // Check if user is a member of the room
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) =>
        q.eq("roomId", args.roomId).eq("userId", ctx.session.userId)
      )
      .unique();

    if (!membership) {
      throw new Error("Must be a member of the room to report content");
    }

    // Validate reason
    if (args.reason.length < 5 || args.reason.length > 200) {
      throw new Error("Reason must be between 5 and 200 characters");
    }

    // Verify target exists
    let targetExists = false;
    if (args.targetType === "question") {
      const question = await ctx.db.get(args.targetId as Id<"questions">);
      targetExists = question !== null && question.roomId === args.roomId;
    } else if (args.targetType === "answer") {
      const answer = await ctx.db.get(args.targetId as Id<"answers">);
      targetExists = answer !== null && answer.roomId === args.roomId;
    }

    if (!targetExists) {
      throw new Error("Target content not found in this room");
    }

    // Check if user has already reported this content
    const existingReport = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .filter((q) => q.eq(q.field("reporterUserId"), ctx.session.userId))
      .first();

    if (existingReport) {
      throw new Error("You have already reported this content");
    }

    // Create the report
    const reportId = await ctx.db.insert("reports", {
      roomId: args.roomId,
      reporterUserId: ctx.session.userId,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason,
    });

    // Get current game for audit log
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    // Log audit event
    await ctx.db.insert("audit", {
      type: "content_reported",
      gameId: game?._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: {
        reportId,
        targetType: args.targetType,
        targetId: args.targetId,
        reason: args.reason,
      },
      ts: Date.now(),
    });

    // Check if this content has received multiple reports (auto-moderation threshold)
    const reportCount = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .collect();

    // If 3 or more reports, auto-hide the content
    if (reportCount.length >= 3) {
      await autoModerateContent(ctx, args.targetType, args.targetId, args.roomId);
    }

    return reportId;
  },
});

// Helper function to auto-moderate content with multiple reports
async function autoModerateContent(
  ctx: any,
  targetType: "question" | "answer",
  targetId: string,
  roomId: Id<"rooms">
) {
  if (targetType === "question") {
    const question = await ctx.db.get(targetId as Id<"questions">);
    if (question) {
      // Mark question as disapproved
      await ctx.db.patch(question._id, {
        approved: false,
      });

      // Remove associated answers
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_question_id", (q: any) => q.eq("questionId", question._id))
        .collect();

      for (const answer of answers) {
        await ctx.db.delete(answer._id);
      }

      // Log auto-moderation
      await ctx.db.insert("audit", {
        type: "content_auto_moderated",
        roomId,
        payload: {
          targetType,
          targetId,
          action: "question_disapproved",
          reason: "multiple_reports",
        },
        ts: Date.now(),
      });
    }
  } else if (targetType === "answer") {
    const answer = await ctx.db.get(targetId as Id<"answers">);
    if (answer) {
      // Delete the answer
      await ctx.db.delete(answer._id);

      // Log auto-moderation
      await ctx.db.insert("audit", {
        type: "content_auto_moderated",
        roomId,
        payload: {
          targetType,
          targetId,
          action: "answer_deleted",
          reason: "multiple_reports",
        },
        ts: Date.now(),
      });
    }
  }
}

export const removeReportedContent = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    targetType: v.union(v.literal("question"), v.literal("answer")),
    targetId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can remove reported content");
    }

    // Remove the content
    if (args.targetType === "question") {
      const question = await ctx.db.get(args.targetId as Id<"questions">);
      if (question && question.roomId === args.roomId) {
        // Remove associated answers first
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question_id", (q) => q.eq("questionId", question._id))
          .collect();

        for (const answer of answers) {
          await ctx.db.delete(answer._id);
        }

        // Remove question
        await ctx.db.delete(question._id);
      }
    } else if (args.targetType === "answer") {
      const answer = await ctx.db.get(args.targetId as Id<"answers">);
      if (answer && answer.roomId === args.roomId) {
        await ctx.db.delete(answer._id);
      }
    }

    // Remove all reports for this content
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .collect();

    for (const report of reports) {
      await ctx.db.delete(report._id);
    }

    // Remove the content
    // if (args.targetType === "question") {
    //   const question = await ctx.db.get(args.targetId as Id<"questions">);
    //   if (question && question.roomId === args.roomId) {
    //     // Remove associated answers first
    //     const answers = await ctx.db
    //       .query("answers")
    //       .withIndex("by_question_id", (q) => q.eq("questionId", question._id))
    //       .collect();

    //     for (const answer of answers) {
    //       await ctx.db.delete(answer._id);
    //     }

    //     // Remove question
    //     await ctx.db.delete(question._id);
    //   }
    // } else if (args.targetType === "answer") {
    //   const answer = await ctx.db.get(args.targetId as Id<"answers">);
    //   if (answer && answer.roomId === args.roomId) {
    //     await ctx.db.delete(answer._id);
    //   }
    // }

    // Get current game for audit log
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    // Log audit event
    await ctx.db.insert("audit", {
      type: "reported_content_removed",
      gameId: game?._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: {
        targetType: args.targetType,
        targetId: args.targetId,
        reportCount: reports.length,
      },
      ts: Date.now(),
    });

    return null;
  },
});

export const dismissReports = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    targetType: v.union(v.literal("question"), v.literal("answer")),
    targetId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can dismiss reports");
    }

    // Remove all reports for this content without removing the content
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .collect();

    for (const report of reports) {
      await ctx.db.delete(report._id);
    }

    // Get current game for audit log
    const game = await ctx.db
      .query("games")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .first();

    // Log audit event
    await ctx.db.insert("audit", {
      type: "reports_dismissed",
      gameId: game?._id,
      roomId: args.roomId,
      userId: ctx.session.userId,
      payload: {
        targetType: args.targetType,
        targetId: args.targetId,
        reportCount: reports.length,
      },
      ts: Date.now(),
    });

    return null;
  },
});

export const getReports = sessionMutation({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.array(v.object({
    _id: v.id("reports"),
    targetType: v.union(v.literal("question"), v.literal("answer")),
    targetId: v.string(),
    reason: v.string(),
    reporterHandle: v.string(),
    targetText: v.string(),
    reportCount: v.number(),
    _creationTime: v.number(),
  })),
  handler: async (ctx, args) => {

    // Verify user is host
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostUserId !== ctx.session.userId) {
      throw new Error("Only the host can view reports");
    }

    // Get all reports for this room
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_room_id", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Group reports by target and get details
    const reportsByTarget = new Map<string, typeof reports>();
    for (const report of reports) {
      const key = `${report.targetType}:${report.targetId}`;
      if (!reportsByTarget.has(key)) {
        reportsByTarget.set(key, []);
      }
      reportsByTarget.get(key)!.push(report);
    }

    // Build response with target details
    const result = [];
    for (const [key, targetReports] of reportsByTarget) {
      const firstReport = targetReports[0];

      // Get target text
      let targetText = "Content not found";
      if (firstReport.targetType === "question") {
        const question = await ctx.db.get(firstReport.targetId as Id<"questions">);
        targetText = question?.text || "Question deleted";
      } else if (firstReport.targetType === "answer") {
        const answer = await ctx.db.get(firstReport.targetId as Id<"answers">);
        targetText = answer?.text || "Answer deleted";
      }

      // Get reporter handle
      const reporter = await ctx.db.get(firstReport.reporterUserId);
      const reporterHandle = reporter?.handle || "Unknown User";

      result.push({
        _id: firstReport._id,
        targetType: firstReport.targetType,
        targetId: firstReport.targetId,
        reason: firstReport.reason,
        reporterHandle,
        targetText,
        reportCount: targetReports.length,
        _creationTime: firstReport._creationTime,
      });
    }

    // Sort by creation time (newest first)
    result.sort((a, b) => b._creationTime - a._creationTime);

    return result;
  },
});

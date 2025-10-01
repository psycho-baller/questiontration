import { mutation } from "../_generated/server";
import { v } from "convex/values";

// A few random words for auto-filling answers in development
const randomWords = [
  "Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape", "Honeydew",
  "Kiwi", "Lemon", "Mango", "Nectarine", "Orange", "Papaya", "Quince", "Raspberry",
  "Strawberry", "Tangerine", "Ugli", "Vanilla", "Watermelon", "Xigua", "Yuzu", "Zucchini"
];

function getRandomWords() {
  const word1 = randomWords[Math.floor(Math.random() * randomWords.length)];
  const word2 = randomWords[Math.floor(Math.random() * randomWords.length)];
  return `${word1} ${word2}`;
}

export const fillAllSubmissions = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {


    const room = await ctx.db.get(roomId);
    if (!room) {
      console.error("Room not found for auto-fill");
      return;
    }

    // Get all approved questions for this room
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_room_id", (q) => q.eq("roomId", roomId))
      .filter(q => q.eq(q.field("approved"), true))
      .collect();

    if (questions.length === 0) {
      console.warn("No approved questions to fill in.");
      return;
    }

    const members = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", roomId))
      .collect();

    const players = members.filter(m => m.role === 'player' || m.role === 'host');

    for (const player of players) {
      for (const question of questions) {
        const existingAnswer = await ctx.db
          .query("answers")
          .withIndex("by_question_and_user", (q) =>
            q
              .eq("questionId", question._id)
              .eq("createdByUserId", player.userId)
          )
          .unique();

        if (!existingAnswer) {
          await ctx.db.insert("answers", {
            questionId: question._id,
            createdByUserId: player.userId,
            roomId: roomId,
            text: getRandomWords(),
          });
        }
      }
    }
  },
});

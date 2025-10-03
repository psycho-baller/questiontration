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

    // Get player handles for including in answers
    const playerHandles = new Map<string, string>();
    for (const player of players) {
      const user = await ctx.db.get(player.userId);
      playerHandles.set(player.userId, user?.handle || "Unknown");
    }

    // Generate diverse answers for each question-player combination
    const questionAnswers = new Map<string, Map<string, string>>();
    
    for (const question of questions) {
      const playerAnswers = new Map<string, string>();
      
      for (const player of players) {
        // Use question ID + player ID as seed for consistent randomness per player
        const combinedSeed = question._id.slice(-4) + player.userId.slice(-4);
        const seedNumber = parseInt(combinedSeed, 16) || 0;
        
        // Generate more diverse answers based on question + player
        const word1Index = seedNumber % randomWords.length;
        // Ensure second word is different from first word
        let word2Index = Math.floor(seedNumber / randomWords.length) % randomWords.length;
        if (word2Index === word1Index) {
          word2Index = (word2Index + 1) % randomWords.length;
        }
        
        const playerHandle = playerHandles.get(player.userId) || "Unknown";
        
        // Add diverse variations that include the current player's handle
        const variations = [
          `${randomWords[word1Index]} ${randomWords[word2Index]} (by ${playerHandle})`,
          `${playerHandle} says: ${randomWords[word1Index]} and ${randomWords[word2Index]}`,
          `${playerHandle}'s choice: ${randomWords[word1Index]} or ${randomWords[word2Index]}`,
          `${playerHandle} answers: Definitely ${randomWords[word1Index]}`,
          `${playerHandle} thinks: Maybe ${randomWords[word2Index]}`,
          `${randomWords[word1Index]} (but not ${randomWords[word2Index]}) - ${playerHandle}`,
          `${playerHandle}: ${randomWords[word1Index]}, obviously`,
          `${randomWords[word2Index]} for sure! (${playerHandle})`,
          `${playerHandle}'s take: ${randomWords[word1Index]} with ${randomWords[word2Index]}`,
          `From ${playerHandle}: ${randomWords[word1Index]} ${randomWords[word2Index]}`,
          `${playerHandle} wants: ${randomWords[word1Index]} not ${randomWords[word2Index]}`,
          `${playerHandle}'s answer: ${randomWords[word1Index]}`,
        ];
        
        const variationIndex = (seedNumber * 13) % variations.length;
        const playerAnswer = variations[variationIndex];
        
        playerAnswers.set(player.userId, playerAnswer);
      }
      
      questionAnswers.set(question._id, playerAnswers);
    }

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
          const playerAnswers = questionAnswers.get(question._id);
          const answerText = playerAnswers?.get(player.userId);
          
          if (answerText) {
            await ctx.db.insert("answers", {
              questionId: question._id,
              createdByUserId: player.userId,
              roomId: roomId,
              text: answerText,
            });
          }
        }
      }
    }
  },
});

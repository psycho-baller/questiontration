import { internalMutation } from "../_generated/server";

export const updateReadyToActive = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all games with status "ready"
    const gamesToUpdate = await ctx.db
      .query("games")
      .filter(q => q.eq(q.field("status"), "ready"))
      .collect();
    
    let migratedCount = 0;
    
    for (const game of gamesToUpdate) {
      await ctx.db.patch(game._id, { status: "active" });
      migratedCount++;
    }
    
    console.log(`Migrated ${migratedCount} games from 'ready' to 'active' status.`);
    return { migratedCount };
  },
});

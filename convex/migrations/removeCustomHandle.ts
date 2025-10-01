import { internalMutation } from "../_generated/server";

export const removeCustomHandleField = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all users with customHandle field
    const users = await ctx.db.query("users").collect();
    
    let migratedCount = 0;
    
    for (const user of users) {
      if ("customHandle" in user) {
        // Remove the customHandle field by replacing the document
        const { customHandle, ...userWithoutCustomHandle } = user;
        await ctx.db.replace(user._id, userWithoutCustomHandle);
        migratedCount++;
      }
    }
    
    console.log(`Migrated ${migratedCount} users by removing customHandle field`);
    return { migratedCount };
  },
});

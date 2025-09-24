import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Generate a random handle
function generateRandomHandle(): string {
  const adjectives = [
    "Happy", "Clever", "Bright", "Swift", "Calm", "Bold", "Kind", "Wise",
    "Cool", "Quick", "Smart", "Brave", "Funny", "Lucky", "Sharp", "Witty"
  ];
  
  const nouns = [
    "Panda", "Tiger", "Eagle", "Dolphin", "Fox", "Wolf", "Bear", "Lion",
    "Owl", "Hawk", "Shark", "Whale", "Cat", "Dog", "Bird", "Fish"
  ];
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 1000);
  
  return `${adjective}${noun}${number}`;
}

export const createUser = mutation({
  args: {
    handle: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // If tokenIdentifier provided, check if user already exists
    if (args.tokenIdentifier) {
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
        .first();
      
      if (existingUser) {
        return { userId: existingUser._id, existing: true };
      }
    }
    
    // Generate handle if not provided
    let handle = args.handle || generateRandomHandle();
    
    // Ensure handle is unique
    let existingUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("handle"), handle))
      .first();
    
    let attempts = 0;
    while (existingUser && attempts < 10) {
      handle = args.handle ? `${args.handle}${Math.floor(Math.random() * 1000)}` : generateRandomHandle();
      existingUser = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("handle"), handle))
        .first();
      attempts++;
    }
    
    if (existingUser) {
      throw new Error("Unable to generate unique handle");
    }
    
    // Create user
    const userId = await ctx.db.insert("users", {
      handle,
      avatarUrl: args.avatarUrl,
      tokenIdentifier: args.tokenIdentifier,
      createdAt: now,
    });
    
    return { userId, existing: false };
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    handle: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    
    const updates: any = {};
    
    if (args.handle !== undefined) {
      // Check if handle is unique
      const existingUser = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("handle"), args.handle))
        .first();
      
      if (existingUser && existingUser._id !== args.userId) {
        throw new Error("Handle already taken");
      }
      
      updates.handle = args.handle;
    }
    
    if (args.avatarUrl !== undefined) {
      updates.avatarUrl = args.avatarUrl;
    }
    
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.userId, updates);
    }
    
    return { success: true };
  },
});

export const getUserByToken = mutation({
  args: {
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .first();
    
    return user;
  },
});

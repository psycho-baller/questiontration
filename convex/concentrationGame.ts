// Session-based functions for the Concentration Q&A game
// Integrates with the existing session system

import { sessionMutation, sessionQuery } from "./lib/myFunctions";
import { v } from "convex/values";
import { getUserById } from "./users";

// Generate a random room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create a new game room
export const createRoom = sessionMutation({
  args: {
    visibility: v.optional(v.union(v.literal("private"), v.literal("public"))),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!ctx.session) {
      throw new Error("No session found");
    }
    
    const now = Date.now();
    
    // Generate unique room code
    let code: string;
    let existingRoom;
    do {
      code = generateRoomCode();
      existingRoom = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    } while (existingRoom);

    // Create the room
    const roomId = await ctx.db.insert("rooms", {
      code,
      hostUserId: ctx.session.userId,
      visibility: args.visibility ?? "private",
      status: "lobby",
      maxPlayers: args.maxPlayers ?? 8,
      createdAt: now,
    });

    // Add host as a member
    await ctx.db.insert("memberships", {
      roomId,
      userId: ctx.session.userId,
      role: "host",
      joinedAt: now,
      lastSeenAt: now,
    });

    // Log the action
    await ctx.db.insert("audit", {
      type: "room_created",
      roomId,
      userId: ctx.session.userId,
      payload: { code, visibility: args.visibility ?? "private" },
      ts: now,
    });

    return { roomId, code };
  },
});

// Join a room by code
export const joinRoom = sessionMutation({
  args: {
    code: v.string(),
    role: v.optional(v.union(v.literal("player"), v.literal("spectator"))),
  },
  handler: async (ctx, args) => {
    if (!ctx.session) {
      throw new Error("No session found");
    }
    
    const now = Date.now();

    // Find room by code
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status === "ended") {
      throw new Error("This room has ended");
    }

    // Check if user is already a member
    const existingMembership = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) => 
        q.eq("roomId", room._id).eq("userId", ctx.session.userId)
      )
      .first();

    if (existingMembership) {
      // Update last seen time
      await ctx.db.patch(existingMembership._id, {
        lastSeenAt: now,
      });
      return { roomId: room._id, code: room.code };
    }

    // Count current players
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    const playerCount = memberships.filter(m => m.role === "player").length;
    
    // Determine role
    let role = args.role ?? "player";
    if (role === "player" && playerCount >= room.maxPlayers) {
      role = "spectator";
    }

    // Add user as member
    await ctx.db.insert("memberships", {
      roomId: room._id,
      userId: ctx.session.userId,
      role,
      joinedAt: now,
      lastSeenAt: now,
    });

    // Log the action
    await ctx.db.insert("audit", {
      type: "user_joined",
      roomId: room._id,
      userId: ctx.session.userId,
      payload: { role },
      ts: now,
    });

    return { roomId: room._id, code: room.code };
  },
});

// Get room state by code
export const getRoomState = sessionQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    // Find room by code
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!room) {
      return null;
    }

    // Get host user
    const host = await getUserById(ctx.db, room.hostUserId);

    // Get all memberships for this room
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    // Get user details for all members
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await getUserById(ctx.db, membership.userId);
        return {
          ...membership,
          user: {
            _id: user._id,
            handle: user.name, // Map name to handle for compatibility
            avatarUrl: user.pictureUrl,
          },
        };
      })
    );

    // Check if current user is a member
    const currentUserMembership = ctx.session ? 
      memberships.find(m => m.userId === ctx.session.userId) : null;

    return {
      room,
      host: {
        _id: host._id,
        handle: host.name,
        avatarUrl: host.pictureUrl,
      },
      members,
      currentUserRole: currentUserMembership?.role || null,
    };
  },
});

// Start the collection phase
export const startCollection = sessionMutation({
  args: {
    roomId: v.id("rooms"),
    mode: v.union(v.literal("curated"), v.literal("player")),
    settings: v.optional(v.object({
      extraTurnOnMatch: v.optional(v.boolean()),
      turnSeconds: v.optional(v.number()),
      collectSeconds: v.optional(v.number()),
      contentRating: v.optional(v.union(v.literal("PG"), v.literal("PG13"))),
    })),
  },
  handler: async (ctx, args) => {
    if (!ctx.session) {
      throw new Error("No session found");
    }
    
    const now = Date.now();

    // Verify host permissions
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.hostUserId !== ctx.session.userId) {
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

    const gameId = await ctx.db.insert("games", {
      roomId: args.roomId,
      boardSize: 16,
      pairCount: 8,
      status: "collecting",
      turnIndex: 0,
      settings: gameSettings,
    });

    // If curated mode, select 8 random questions and add them
    if (args.mode === "curated") {
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
      ];

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
      userId: ctx.session.userId,
      payload: { mode: args.mode, settings: gameSettings },
      ts: now,
    });

    return { gameId };
  },
});

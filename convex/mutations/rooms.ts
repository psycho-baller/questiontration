import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

// Generate a random room code (4-6 alphanumeric characters)
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const createRoom = mutation({
  args: {
    visibility: v.union(v.literal("private"), v.literal("public")),
    maxPlayers: v.optional(v.number()),
  },
  returns: v.object({
    roomId: v.id("rooms"),
    code: v.string(),
  }),
  handler: async (ctx, args) => {
    // Get or create user identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated to create a room");
    }

    // Find or create user
    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      // Create new user with a default handle
      const userId = await ctx.db.insert("users", {
        handle: identity.name || `Player${Math.floor(Math.random() * 1000)}`,
        avatarUrl: identity.pictureUrl,
        tokenIdentifier: identity.tokenIdentifier,
      });
      user = await ctx.db.get(userId);
      if (!user) throw new Error("Failed to create user");
    }

    // Generate unique room code
    let code: string;
    let attempts = 0;
    do {
      code = generateRoomCode();
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new Error("Failed to generate unique room code");
    }

    // Create the room
    const roomId = await ctx.db.insert("rooms", {
      code,
      hostUserId: user._id,
      visibility: args.visibility,
      status: "lobby" as const,
      maxPlayers: args.maxPlayers || 8,
    });

    // Add host as a member
    await ctx.db.insert("memberships", {
      roomId,
      userId: user._id,
      role: "host" as const,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      ready: false,
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "room_created",
      roomId,
      userId: user._id,
      payload: { visibility: args.visibility, maxPlayers: args.maxPlayers || 8 },
      ts: Date.now(),
    });

    return { roomId, code };
  },
});

export const joinRoom = mutation({
  args: {
    code: v.string(),
    role: v.optional(v.union(v.literal("player"), v.literal("spectator"))),
  },
  returns: v.object({
    roomId: v.id("rooms"),
    membershipId: v.id("memberships"),
  }),
  handler: async (ctx, args) => {
    // Get or create user identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated to join a room");
    }

    // Find or create user
    let user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        handle: identity.name || `Player${Math.floor(Math.random() * 1000)}`,
        avatarUrl: identity.pictureUrl,
        tokenIdentifier: identity.tokenIdentifier,
      });
      user = await ctx.db.get(userId);
      if (!user) throw new Error("Failed to create user");
    }

    // Find the room
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status === "ended") {
      throw new Error("This room has ended");
    }

    // Check if user is already a member
    const existingMembership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", room._id).eq("userId", user._id)
      )
      .unique();

    if (existingMembership) {
      // Update last seen time
      await ctx.db.patch(existingMembership._id, {
        lastSeenAt: Date.now(),
      });
      return { roomId: room._id, membershipId: existingMembership._id };
    }

    // Count current players
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", room._id))
      .collect();

    const playerCount = memberships.filter(m => m.role === "player").length;
    const hostCount = memberships.filter(m => m.role === "host").length;

    // Determine role
    let role = args.role || "player";
    if (role === "player" && (playerCount + hostCount) >= room.maxPlayers) {
      role = "spectator";
    }

    // Create membership
    const membershipId = await ctx.db.insert("memberships", {
      roomId: room._id,
      userId: user._id,
      role: role as "player" | "spectator",
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      ready: false,
    });

    // Log audit event
    await ctx.db.insert("audit", {
      type: "player_joined",
      roomId: room._id,
      userId: user._id,
      payload: { role },
      ts: Date.now(),
    });

    return { roomId: room._id, membershipId };
  },
});

export const leaveRoom = mutation({
  args: {
    roomId: v.id("rooms"),
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

    // Find membership
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", user._id)
      )
      .unique();

    if (!membership) {
      return null; // Already not a member
    }

    // Remove membership
    await ctx.db.delete(membership._id);

    // Log audit event
    await ctx.db.insert("audit", {
      type: "player_left",
      roomId: args.roomId,
      userId: user._id,
      payload: { role: membership.role },
      ts: Date.now(),
    });

    // If this was the host leaving, we might need to handle host transfer
    // For now, we'll leave the room orphaned - could be enhanced later
    
    return null;
  },
});

export const setReady = mutation({
  args: {
    roomId: v.id("rooms"),
    ready: v.boolean(),
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

    // Find membership
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", user._id)
      )
      .unique();

    if (!membership) {
      throw new Error("Not a member of this room");
    }

    // Update ready status
    await ctx.db.patch(membership._id, {
      ready: args.ready,
      lastSeenAt: Date.now(),
    });

    return null;
  },
});

export const kickMember = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
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
    const hostMembership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", user._id)
      )
      .unique();

    if (!hostMembership || hostMembership.role !== "host") {
      throw new Error("Only the host can kick members");
    }

    // Find target membership
    const targetMembership = await ctx.db
      .query("memberships")
      .withIndex("by_room_and_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", args.userId)
      )
      .unique();

    if (!targetMembership) {
      throw new Error("User is not a member of this room");
    }

    if (targetMembership.role === "host") {
      throw new Error("Cannot kick the host");
    }

    // Remove membership
    await ctx.db.delete(targetMembership._id);

    // Log audit event
    await ctx.db.insert("audit", {
      type: "player_kicked",
      roomId: args.roomId,
      userId: user._id,
      payload: { kickedUserId: args.userId, kickedRole: targetMembership.role },
      ts: Date.now(),
    });

    return null;
  },
});

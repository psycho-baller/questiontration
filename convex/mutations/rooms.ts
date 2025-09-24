import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Generate a random room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const createRoom = mutation({
  args: {
    userId: v.id("users"),
    visibility: v.optional(v.union(v.literal("private"), v.literal("public"))),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
      hostUserId: args.userId,
      visibility: args.visibility ?? "private",
      status: "lobby",
      maxPlayers: args.maxPlayers ?? 8,
      createdAt: now,
    });

    // Add host as a member
    await ctx.db.insert("memberships", {
      roomId,
      userId: args.userId,
      role: "host",
      joinedAt: now,
      lastSeenAt: now,
    });

    // Log the action
    await ctx.db.insert("audit", {
      type: "room_created",
      roomId,
      userId: args.userId,
      payload: { code, visibility: args.visibility ?? "private" },
      ts: now,
    });

    return { roomId, code };
  },
});

export const joinRoom = mutation({
  args: {
    code: v.string(),
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("player"), v.literal("spectator"))),
  },
  handler: async (ctx, args) => {
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
        q.eq("roomId", room._id).eq("userId", args.userId)
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
      userId: args.userId,
      role,
      joinedAt: now,
      lastSeenAt: now,
    });

    // Log the action
    await ctx.db.insert("audit", {
      type: "user_joined",
      roomId: room._id,
      userId: args.userId,
      payload: { role },
      ts: now,
    });

    return { roomId: room._id, code: room.code };
  },
});

export const leaveRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find membership
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this room");
    }

    // Remove membership
    await ctx.db.delete(membership._id);

    // Log the action
    await ctx.db.insert("audit", {
      type: "user_left",
      roomId: args.roomId,
      userId: args.userId,
      payload: { role: membership.role },
      ts: now,
    });

    // If this was the host, we might need to handle host transfer
    if (membership.role === "host") {
      const remainingMembers = await ctx.db
        .query("memberships")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();

      if (remainingMembers.length > 0) {
        // Transfer host to the next player
        const newHost = remainingMembers.find(m => m.role === "player") || remainingMembers[0];
        await ctx.db.patch(newHost._id, { role: "host" });
        
        const room = await ctx.db.get(args.roomId);
        if (room) {
          await ctx.db.patch(args.roomId, { hostUserId: newHost.userId });
        }

        // Log host transfer
        await ctx.db.insert("audit", {
          type: "host_transferred",
          roomId: args.roomId,
          userId: newHost.userId,
          payload: { previousHostId: args.userId },
          ts: now,
        });
      } else {
        // No members left, end the room
        await ctx.db.patch(args.roomId, { status: "ended" });
      }
    }

    return { success: true };
  },
});

export const kickMember = mutation({
  args: {
    roomId: v.id("rooms"),
    hostUserId: v.id("users"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify host permissions
    const hostMembership = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", args.hostUserId)
      )
      .first();

    if (!hostMembership || hostMembership.role !== "host") {
      throw new Error("Only the host can kick members");
    }

    // Find target membership
    const targetMembership = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", args.targetUserId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this room");
    }

    if (targetMembership.role === "host") {
      throw new Error("Cannot kick the host");
    }

    // Remove membership
    await ctx.db.delete(targetMembership._id);

    // Log the action
    await ctx.db.insert("audit", {
      type: "user_kicked",
      roomId: args.roomId,
      userId: args.hostUserId,
      payload: { 
        targetUserId: args.targetUserId,
        targetRole: targetMembership.role 
      },
      ts: now,
    });

    return { success: true };
  },
});

export const updateLastSeen = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) => 
        q.eq("roomId", args.roomId).eq("userId", args.userId)
      )
      .first();

    if (membership) {
      await ctx.db.patch(membership._id, {
        lastSeenAt: Date.now(),
      });
    }

    return { success: true };
  },
});

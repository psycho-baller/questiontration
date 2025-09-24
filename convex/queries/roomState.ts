import { query } from "../_generated/server";
import { v } from "convex/values";

export const roomState = query({
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
    const host = await ctx.db.get(room.hostUserId);
    if (!host) {
      throw new Error("Host not found");
    }

    // Get all memberships for this room
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    // Get user details for all members
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return {
          ...membership,
          user: user ? {
            _id: user._id,
            handle: user.name,
            avatarUrl: user.pictureUrl,
          } : null,
        };
      })
    );

    // Filter out members where user lookup failed
    const validMembers = members.filter(m => m.user !== null);

    return {
      room,
      host: {
        _id: host._id,
        handle: host.name,
        avatarUrl: host.pictureUrl,
      },
      members: validMembers,
    };
  },
});

export const roomById = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      return null;
    }

    // Get host user
    const host = await ctx.db.get(room.hostUserId);
    if (!host) {
      throw new Error("Host not found");
    }

    // Get all memberships for this room
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    // Get user details for all members
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return {
          ...membership,
          user: user ? {
            _id: user._id,
            handle: user.name,
            avatarUrl: user.pictureUrl,
          } : null,
        };
      })
    );

    // Filter out members where user lookup failed
    const validMembers = members.filter(m => m.user !== null);

    return {
      room,
      host: {
        _id: host._id,
        handle: host.name,
        avatarUrl: host.pictureUrl,
      },
      members: validMembers,
    };
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const roomState = query({
  args: { 
    code: v.string() 
  },
  returns: v.union(
    v.null(),
    v.object({
      room: v.object({
        _id: v.id("rooms"),
        code: v.string(),
        hostUserId: v.id("users"),
        visibility: v.union(v.literal("private"), v.literal("public")),
        status: v.union(
          v.literal("lobby"),
          v.literal("collecting"),
          v.literal("playing"),
          v.literal("ended")
        ),
        maxPlayers: v.number(),
        _creationTime: v.number(),
      }),
      host: v.object({
        _id: v.id("users"),
        handle: v.string(),
        avatarUrl: v.optional(v.string()),
      }),
      members: v.array(v.object({
        _id: v.id("memberships"),
        userId: v.id("users"),
        role: v.union(v.literal("host"), v.literal("player"), v.literal("spectator")),
        joinedAt: v.number(),
        lastSeenAt: v.number(),
        ready: v.optional(v.boolean()),
        user: v.object({
          _id: v.id("users"),
          handle: v.string(),
          avatarUrl: v.optional(v.string()),
        }),
      })),
    })
  ),
  handler: async (ctx, args) => {
    // Find room by code
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();

    if (!room) {
      return null;
    }

    // Get host user
    const host = await ctx.db.get(room.hostUserId);
    if (!host) {
      return null;
    }

    // Get all memberships for this room
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_room_id", (q) => q.eq("roomId", room._id))
      .collect();

    // Get user details for each membership
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        if (!user) return null;
        
        return {
          _id: membership._id,
          userId: membership.userId,
          role: membership.role,
          joinedAt: membership.joinedAt,
          lastSeenAt: membership.lastSeenAt,
          ready: membership.ready,
          user: {
            _id: user._id,
            handle: user.handle,
            avatarUrl: user.avatarUrl,
          },
        };
      })
    );

    // Filter out any null members (shouldn't happen but safety first)
    const validMembers = members.filter((member): member is NonNullable<typeof member> => member !== null);

    return {
      room: {
        _id: room._id,
        code: room.code,
        hostUserId: room.hostUserId,
        visibility: room.visibility,
        status: room.status,
        maxPlayers: room.maxPlayers,
        _creationTime: room._creationTime,
      },
      host: {
        _id: host._id,
        handle: host.handle,
        avatarUrl: host.avatarUrl,
      },
      members: validMembers,
    };
  },
});

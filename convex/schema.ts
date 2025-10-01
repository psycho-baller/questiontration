import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // User accounts with display info
  users: defineTable({
    handle: v.string(),
    avatarUrl: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    claimedByUserId: v.optional(v.id("users")),
  }).index("by_token", ["tokenIdentifier"]),

  // Game rooms - the main container for a game session
  rooms: defineTable({
    code: v.string(), // 4-character alphanumeric code for joining
    hostUserId: v.id("users"),
    visibility: v.union(v.literal("private"), v.literal("public")),
    status: v.union(
      v.literal("lobby"),
      v.literal("collecting"),
      v.literal("playing"),
      v.literal("ended")
    ),
    maxPlayers: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_host_and_status", ["hostUserId", "status"])
    .index("by_visibility_and_status", ["visibility", "status"]),

  // Player membership in rooms
  memberships: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
    role: v.union(v.literal("host"), v.literal("player"), v.literal("spectator")),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
    connectionId: v.optional(v.string()),
    ready: v.optional(v.boolean()), // for lobby ready state
  })
    .index("by_room_id", ["roomId"])
    .index("by_user_id", ["userId"])
    .index("by_room_and_user", ["roomId", "userId"]),

  // Questions for the game
  questions: defineTable({
    text: v.string(),
    createdByUserId: v.id("users"),
    roomId: v.id("rooms"),
    usedCount: v.number(),
    approved: v.optional(v.boolean()), // for host approval in player-submitted mode
  })
    .index("by_room_id", ["roomId"])
    .index("by_room_and_creator", ["roomId", "createdByUserId"]),

  // Answers to questions
  answers: defineTable({
    questionId: v.id("questions"),
    text: v.string(),
    createdByUserId: v.id("users"),
    roomId: v.id("rooms"),
  })
    .index("by_question_id", ["questionId"])
    .index("by_room_id", ["roomId"])
    .index("by_question_and_user", ["questionId", "createdByUserId"]),

  // Legacy games table (keeping for backward compatibility during migration)
  games: defineTable({
    roomId: v.id("rooms"),
    boardSize: v.number(),
    pairCount: v.number(),
    status: v.union(
      v.literal("collecting"),
      // v.literal("ready"),
      v.literal("active"),
      v.literal("complete")
    ),
    turnIndex: v.number(),
    currentPlayerId: v.id("users"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    settings: v.object({
      boardSize: v.number(),
      pairCount: v.number(),
      mode: v.union(v.literal("curated"), v.literal("player")),
      extraTurnOnMatch: v.boolean(),
      turnSeconds: v.number(),
      collectSeconds: v.number(),
      contentRating: v.union(v.literal("PG"), v.literal("PG13")),
    }),
    hostId: v.id("users"),
    playerIds: v.array(v.id("users")),
    roundIds: v.array(v.id("rounds")),
    slug: v.string(),
    state: v.union(
      v.object({
        stage: v.union(v.literal("lobby"), v.literal("generate"), v.literal("recap")),
      }),
      v.object({
        stage: v.literal("rounds"),
        roundId: v.id("rounds"),
      })
    ),
    nextGameId: v.optional(v.id("games")),
  }).index("s", ["slug"])
    .index("by_room_id", ["roomId"])
    .index("by_status", ["status"]),

  // Cards on the game board
  cards: defineTable({
    gameId: v.id("games"),
    questionId: v.id("questions"),
    answerId: v.id("answers"),
    position: v.number(), // 0-15 for 4x4 board
    state: v.union(v.literal("faceDown"), v.literal("faceUp"), v.literal("matched")),
  })
    .index("by_game_id", ["gameId"])
    .index("by_game_and_position", ["gameId", "position"]),

  // Individual turns/moves
  turns: defineTable({
    gameId: v.id("games"),
    playerId: v.id("users"),
    picks: v.array(v.id("cards")), // up to 2 card IDs
    resolved: v.boolean(),
    correct: v.boolean(),
    startedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_game_id", ["gameId"])
    .index("by_game_and_player", ["gameId", "playerId"]),

  // Player scores per game
  scores: defineTable({
    gameId: v.id("games"),
    playerId: v.id("users"),
    points: v.number(),
  })
    .index("by_game_id", ["gameId"])
    .index("by_game_and_player", ["gameId", "playerId"]),

  // Content reporting system
  reports: defineTable({
    roomId: v.id("rooms"),
    reporterUserId: v.id("users"),
    targetType: v.union(v.literal("question"), v.literal("answer")),
    targetId: v.string(), // ID of the reported content
    reason: v.string(),
  })
    .index("by_room_id", ["roomId"])
    .index("by_target", ["targetType", "targetId"]),

  // Audit log for key events
  audit: defineTable({
    type: v.string(), // event type like "room_created", "turn_flip", etc.
    gameId: v.optional(v.id("games")),
    roomId: v.optional(v.id("rooms")),
    userId: v.optional(v.id("users")),
    payload: v.any(), // flexible event data
    ts: v.number(),
  })
    .index("by_room_id", ["roomId"])
    .index("by_game_id", ["gameId"])
    .index("by_type_and_ts", ["type", "ts"]),

  // Legacy tables (keeping for backward compatibility during migration)
  sessions: defineTable({
    userId: v.id("users"),
    submissionIds: v.array(v.id("submissions")),
    gameIds: v.array(v.id("games")), // Array of game IDs
  }),

  publicGame: defineTable({
    roundId: v.optional(v.id("rounds")), // Made optional for migration
  }),

  submissions: defineTable({
    prompt: v.string(),
    authorId: v.id("users"),
    result: v.union(
      v.object({
        status: v.literal("generating"),
        details: v.string(),
      }),
      v.object({
        status: v.literal("failed"),
        reason: v.string(),
        elapsedMs: v.number(),
      }),
      v.object({
        status: v.literal("saved"),
        imageStorageId: v.string(),
        elapsedMs: v.number(),
      })
    ),
  }),

  rounds: defineTable({
    authorId: v.id("users"),
    imageStorageId: v.string(),
    stageStart: v.number(),
    stageEnd: v.number(),
    stage: v.union(v.literal("label"), v.literal("guess"), v.literal("reveal")),
    options: v.array(
      v.object({
        authorId: v.id("users"),
        prompt: v.string(),
        votes: v.array(v.id("users")),
        likes: v.array(v.id("users")),
      })
    ),
    lastUsed: v.optional(v.number()),
    publicRound: v.optional(v.boolean()),
  }).index("public_game", ["publicRound", "stage", "lastUsed"]),
});

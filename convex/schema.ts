import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // User profiles (keeping compatibility with existing code)
  users: defineTable({
    name: v.string(), // Keep existing field name
    pictureUrl: v.string(), // Keep existing field name
    tokenIdentifier: v.optional(v.string()),
    claimedByUserId: v.optional(v.id("users")), // Keep existing field
  }).index("by_token", ["tokenIdentifier"]),

  // For sessions (keeping existing structure):
  sessions: defineTable({
    userId: v.id("users"),
    submissionIds: v.array(v.id("submissions")),
    gameIds: v.array(v.id("games")),
  }),

  // Legacy prompt games (keeping existing structure)
  games: defineTable({
    hostId: v.id("users"),
    playerIds: v.array(v.id("users")),
    slug: v.string(),
    roundIds: v.array(v.id("rounds")),
    state: v.union(
      v.object({
        stage: v.union(
          v.literal("lobby"),
          v.literal("generate"),
          v.literal("recap")
        ),
      }),
      v.object({
        stage: v.literal("rounds"),
        roundId: v.id("rounds"),
      })
    ),
    nextGameId: v.optional(v.id("games")),
  }).index("s", ["slug"]),

  publicGame: defineTable({
    roundId: v.id("rounds"),
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
    // For public games
    lastUsed: v.optional(v.number()),
    publicRound: v.optional(v.boolean()),
  }).index("public_game", ["publicRound", "stage", "lastUsed"]),

  // Game rooms
  rooms: defineTable({
    code: v.string(), // 4-6 alphanumeric code
    hostUserId: v.id("users"),
    visibility: v.union(v.literal("private"), v.literal("public")),
    status: v.union(
      v.literal("lobby"),
      v.literal("collecting"), 
      v.literal("playing"),
      v.literal("ended")
    ),
    maxPlayers: v.number(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Room memberships and presence
  memberships: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
    role: v.union(v.literal("host"), v.literal("player"), v.literal("spectator")),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
    connectionId: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_room_user", ["roomId", "userId"]),

  // Questions for the game
  questions: defineTable({
    text: v.string(),
    createdByUserId: v.optional(v.id("users")), // null for curated questions
    roomId: v.optional(v.id("rooms")), // null for curated questions
    usedCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_creator", ["createdByUserId"]),

  // Answers to questions
  answers: defineTable({
    questionId: v.id("questions"),
    text: v.string(),
    createdByUserId: v.id("users"),
    roomId: v.id("rooms"),
    createdAt: v.number(),
  })
    .index("by_question", ["questionId"])
    .index("by_room", ["roomId"])
    .index("by_creator", ["createdByUserId"]),

  // Concentration game instances
  concentrationGames: defineTable({
    roomId: v.id("rooms"),
    boardSize: v.number(), // 16 for 4x4
    pairCount: v.number(), // 8 pairs
    status: v.union(
      v.literal("collecting"),
      v.literal("ready"),
      v.literal("active"),
      v.literal("complete")
    ),
    turnIndex: v.number(),
    currentPlayerId: v.optional(v.id("users")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    settings: v.object({
      mode: v.union(v.literal("curated"), v.literal("player")),
      extraTurnOnMatch: v.boolean(),
      turnSeconds: v.number(),
      collectSeconds: v.number(),
      contentRating: v.union(v.literal("PG"), v.literal("PG13")),
    }),
  }).index("by_room", ["roomId"]),

  // Game board cards
  cards: defineTable({
    gameId: v.id("games"),
    questionId: v.id("questions"),
    answerId: v.id("answers"),
    position: v.number(), // 0-15 for 4x4 board
    state: v.union(v.literal("faceDown"), v.literal("faceUp"), v.literal("matched")),
  })
    .index("by_game", ["gameId"])
    .index("by_position", ["gameId", "position"]),

  // Player turns
  turns: defineTable({
    gameId: v.id("games"),
    playerId: v.id("users"),
    picks: v.array(v.id("cards")), // up to 2 card IDs
    resolved: v.boolean(),
    correct: v.boolean(),
    startedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_game", ["gameId"]),

  // Player scores
  scores: defineTable({
    gameId: v.id("games"),
    playerId: v.id("users"),
    points: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),

  // Content reports
  reports: defineTable({
    roomId: v.id("rooms"),
    reporterUserId: v.id("users"),
    targetType: v.union(v.literal("question"), v.literal("answer")),
    targetId: v.string(), // ID of the reported content
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),

  // Audit log
  audit: defineTable({
    type: v.string(),
    gameId: v.optional(v.id("games")),
    roomId: v.optional(v.id("rooms")),
    userId: v.optional(v.id("users")),
    payload: v.any(),
    ts: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_game", ["gameId"])
    .index("by_type", ["type"]),
});

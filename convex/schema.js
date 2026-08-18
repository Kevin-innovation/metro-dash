import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Two tables: who is playing, and what they scored.
 *
 * Accounts are a nickname and a four-digit PIN — no name, no email — so the
 * service holds nothing about a student beyond what the leaderboard shows.
 */
export default defineSchema({
  players: defineTable({
    /** Display name, exactly as the player typed it. */
    handle: v.string(),
    /** Folded form of the handle. Uniqueness and lookups go through this. */
    handleKey: v.string(),
    /** Four-digit PIN, stored as given: see the note in players.js. */
    pin: v.string(),
    /** Rotated on every sign-in; the client sends it back to prove who it is. */
    token: v.string(),

    /** The whole save file — coins, upgrades, missions, rank, characters. */
    profile: v.any(),
    best: v.number(),

    /**
     * School, chosen at most once by the player and thereafter only by staff.
     * Absent on every account created before schools existed, and on anyone who
     * has not picked one — those players simply sit outside the school ranking.
     */
    school: v.optional(
      v.object({
        region: v.string(),
        level: v.string(),
        name: v.string(),
        /** Display form, decided at validation time. Optional for older rows. */
        label: v.optional(v.string()),
      }),
    ),
    schoolKey: v.optional(v.string()),

    /**
     * "admin" on the staff account, absent on everyone else.
     *
     * Set only by `admin:createStaff`, never by registration — the nickname
     * filter reserves the obvious staff names, so no player can reach this.
     */
    role: v.optional(v.string()),

    /** Which browser created the account, used only to cap account farming. */
    deviceId: v.string(),

    /** Sign-in throttling. Reset the moment a correct PIN arrives. */
    failedAttempts: v.number(),
    lockedUntil: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_handleKey", ["handleKey"])
    .index("by_token", ["token"])
    .index("by_device", ["deviceId"])
    .index("by_best", ["best"])
    .index("by_school", ["schoolKey"]),

  /**
   * School standings, kept as a running total rather than computed on read.
   *
   * The obvious version — add up every player's best when the board is opened —
   * would have to read every player document, and a player document carries the
   * whole save file. A few hundred accounts would blow the query's read limit.
   * So the total moves by deltas, and `admin:recomputeSchools` exists to rebuild
   * it from the players if the two ever disagree.
   */
  schools: defineTable({
    key: v.string(),
    region: v.string(),
    level: v.string(),
    name: v.string(),
    /** Rendered once at write time so the board is a single read. */
    label: v.string(),
    members: v.number(),
    /** Sum of every member's best score. */
    total: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_total", ["total"]),

  /**
   * Nickname reports.
   *
   * The word list cannot catch a name with characters inserted mid-word, so the
   * players who can see the board are the ones who will spot those. One report
   * per reporter per target, so a group cannot pile onto someone.
   */
  reports: defineTable({
    targetId: v.id("players"),
    targetHandle: v.string(),
    reporterId: v.id("players"),
    reporterHandle: v.string(),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_target", ["targetId"])
    .index("by_reporter_target", ["reporterId", "targetId"])
    .index("by_status", ["status", "createdAt"]),

  scores: defineTable({
    playerId: v.id("players"),
    /** Denormalised so the leaderboard is a single read. */
    handle: v.string(),
    score: v.number(),
    distance: v.number(),
    coins: v.number(),
    comboMax: v.number(),
    seconds: v.number(),
    character: v.string(),
    createdAt: v.number(),
  })
    .index("by_score", ["score"])
    .index("by_player", ["playerId"]),
});

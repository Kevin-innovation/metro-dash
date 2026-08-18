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
    .index("by_best", ["best"]),

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

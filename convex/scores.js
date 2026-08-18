import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateRun } from "../src/leaderboard-rules.js";
import { adjustSchool } from "./schools.js";
import { requirePlayer } from "./session.js";

/**
 * The leaderboard.
 *
 * Every number here was computed by the browser, so none of it can be taken at
 * face value. `validateRun` checks a submission against what the speed curve
 * makes physically reachable before it is allowed onto the board.
 */

export const LEADERBOARD_LIMIT = 50;

export const submit = mutation({
  args: {
    token: v.string(),
    score: v.number(),
    distance: v.number(),
    coins: v.number(),
    comboMax: v.number(),
    seconds: v.number(),
    character: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx, args.token);

    const check = validateRun(args);
    if (!check.ok) {
      // Rejected quietly: the run simply does not reach the board. Telling the
      // client which bound it broke would only help someone tune around it.
      return { ok: false, reason: check.reason };
    }

    const score = Math.floor(args.score);
    const now = Date.now();

    await ctx.db.insert("scores", {
      playerId: player._id,
      handle: player.handle,
      score,
      distance: Math.floor(args.distance),
      coins: Math.floor(args.coins),
      comboMax: Math.floor(args.comboMax),
      seconds: Math.floor(args.seconds),
      character: args.character,
      createdAt: now,
    });

    if (score > player.best) {
      await ctx.db.patch(player._id, { best: score, updatedAt: now });
      // The school total is the sum of its members' bests, so it moves by the
      // same amount this player's best just moved by.
      await adjustSchool(ctx, player.schoolKey, { total: score - player.best });
    }

    return { ok: true, best: Math.max(score, player.best) };
  },
});

/**
 * Top players, one row each.
 *
 * Ranked on the player's best rather than on individual runs, so a single
 * player cannot fill the board with their own attempts.
 */
export const top = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(LEADERBOARD_LIMIT, Math.max(1, Math.floor(limit ?? 20)));
    const players = await ctx.db
      .query("players")
      .withIndex("by_best")
      .order("desc")
      .take(take);

    return players
      // Staff never play, so this is belt and braces — but a 0-point 「admin」
      // row appearing on a class leaderboard would be its own problem.
      .filter((player) => player.best > 0 && player.role !== "admin")
      .map((player, index) => ({
        rank: index + 1,
        handle: player.handle,
        best: player.best,
        character: player.profile?.character ?? "runner",
      }));
  },
});

/** Where the signed-in player sits, even when they are off the visible board. */
export const standing = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    if (player.best <= 0) return { rank: null, best: 0, handle: player.handle };

    // Counting only those above keeps this cheap for everyone but the leaders.
    const above = await ctx.db
      .query("players")
      .withIndex("by_best", (q) => q.gt("best", player.best))
      .collect();

    return { rank: above.length + 1, best: player.best, handle: player.handle };
  },
});

/** A player's own recent runs, for their profile card. */
export const mine = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const player = await requirePlayer(ctx, token);
    const runs = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .order("desc")
      .take(Math.min(20, Math.max(1, Math.floor(limit ?? 10))));
    return runs.map((run) => ({
      score: run.score,
      distance: run.distance,
      coins: run.coins,
      createdAt: run.createdAt,
    }));
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateRun } from "../src/leaderboard-rules.js";
import { weekKey } from "../src/week.js";
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

/**
 * Coins one run may add to the ledger beyond the ones it picked up.
 *
 * Everything the client is allowed to pay out around a run has to fit under
 * this, or an honest save gets refused: three missions at up to 190, a streak
 * bonus of up to 420, and a rank-up worth up to 2000. Loose on purpose — the
 * ledger exists to stop a save claiming a million coins, not to audit a run.
 */
export const CLIENT_COINS_PER_RUN = 3000;

/** Rows read beyond the page, so filtered-out accounts do not shorten it. */
const FILTER_MARGIN = 16;

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

    // This week's column resets by being written for a new key rather than by a
    // sweep: an account that has not played since Monday simply is not in the
    // week's index, so there is nothing to clear and nothing to schedule.
    const week = weekKey(now);
    const weekBest = player.weekKey === week ? (player.weekBest ?? 0) : 0;

    const patch = { updatedAt: now };
    if (score > player.best) patch.best = score;
    if (score > weekBest || player.weekKey !== week) {
      patch.weekKey = week;
      patch.weekBest = Math.max(score, weekBest);
    }
    // A validated run is the only thing that can pay coins out, so it is the
    // only thing that lifts the ceiling on what a save may be worth.
    patch.coinLedger = (player.coinLedger ?? 0) + Math.floor(args.coins) + CLIENT_COINS_PER_RUN;
    await ctx.db.patch(player._id, patch);

    if (score > player.best) {
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
  args: { limit: v.optional(v.number()), range: v.optional(v.string()) },
  handler: async (ctx, { limit, range }) => {
    const take = Math.min(LEADERBOARD_LIMIT, Math.max(1, Math.floor(limit ?? 20)));
    const weekly = range === "week";
    const week = weekKey(Date.now());
    // Read past the page: the staff account and anyone yet to score are dropped
    // below, and dropping them after the cut would hand back a short page — a
    // board with ten places and nine names on it.
    const window = take + FILTER_MARGIN;
    const players = weekly
      ? await ctx.db
          .query("players")
          .withIndex("by_week_best", (q) => q.eq("weekKey", week))
          .order("desc")
          .take(window)
      : await ctx.db.query("players").withIndex("by_best").order("desc").take(window);

    return players
      // Staff never play, so this is belt and braces — but a 0-point 「admin」
      // row appearing on a class leaderboard would be its own problem.
      .filter((player) => scoreOf(player, weekly) > 0 && player.role !== "admin")
      .slice(0, take)
      .map((player, index) => ({
        rank: index + 1,
        handle: player.handle,
        best: scoreOf(player, weekly),
        character: player.profile?.character ?? "runner",
        // Shown under the name. Already rendered on the player document, so the
        // board stays a single read.
        school: player.school?.label ?? "",
      }));
  },
});

/** The figure a board ranks on: this week's best, or the all-time one. */
function scoreOf(player, weekly) {
  if (!weekly) return player.best;
  return player.weekKey === weekKey(Date.now()) ? (player.weekBest ?? 0) : 0;
}

/** Where the signed-in player sits, even when they are off the visible board. */
export const standing = query({
  args: { token: v.string(), range: v.optional(v.string()) },
  handler: async (ctx, { token, range }) => {
    const player = await requirePlayer(ctx, token);
    const weekly = range === "week";
    const week = weekKey(Date.now());
    const best = scoreOf(player, weekly);
    if (best <= 0) return { rank: null, best: 0, handle: player.handle };

    // Counting only those above keeps this cheap for everyone but the leaders.
    const above = weekly
      ? await ctx.db
          .query("players")
          .withIndex("by_week_best", (q) => q.eq("weekKey", week).gt("weekBest", best))
          .collect()
      : await ctx.db
          .query("players")
          .withIndex("by_best", (q) => q.gt("best", best))
          .collect();

    return { rank: above.length + 1, best, handle: player.handle };
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

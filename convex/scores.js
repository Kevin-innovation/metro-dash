import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateRun } from "../src/leaderboard-rules.js";
import { weekKey } from "../src/week.js";
import { adjustSchool, adjustSchoolWeek } from "./schools.js";
import { requirePlayer } from "./session.js";
import { levelOf, xpOf } from "./players.js";

/**
 * The leaderboard.
 *
 * Every number here was computed by the browser, so none of it can be taken at
 * face value. `validateRun` checks a submission against what the speed curve
 * makes physically reachable before it is allowed onto the board.
 */

export const LEADERBOARD_LIMIT = 50;

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
      // Stored with the run so a closed week can be ranked by school from this
      // table alone, without reading a save file per run.
      school: player.school?.label ?? "",
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
    // The ledger is not touched here.
    //
    // It used to grow by this run's coins plus a flat three thousand, meant to
    // cover the missions, streak and rank-up a run can also pay out. Two things
    // were wrong with that. The allowance was granted whether or not anything
    // was actually earned, so a hundred quiet runs lifted the ceiling by three
    // hundred thousand coins and the ledger stopped bounding anything; and it
    // was still too small for the run that finishes all three missions at the
    // top step, takes the daily bonus and levels up, which comes to over six
    // thousand — so it was simultaneously useless and capable of refusing the
    // best day a player ever has.
    //
    // players:save now reports what the client actually credited itself and the
    // ledger grows by exactly that, which is both tighter and correct. Coins
    // picked up in this run reach it the same way, so adding them here as well
    // would count them twice.
    await ctx.db.patch(player._id, patch);

    if (score > player.best) {
      // The school total is the sum of its members' bests, so it moves by the
      // same amount this player's best just moved by.
      await adjustSchool(ctx, player.schoolKey, { total: score - player.best });
    }
    // And the same again for the week, which has its own bests and its own
    // membership: a school's weekly figure counts only who actually played.
    if (score > weekBest) {
      await adjustSchoolWeek(ctx, player.schoolKey, week, {
        total: score - weekBest,
        newMember: weekBest === 0,
      });
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
        level: levelOf(player),
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

    return { rank: above.length + 1, best, handle: player.handle, level: levelOf(player) };
  },
});

/**
 * The ladder, ranked by experience rather than by a single run.
 *
 * A different question from the score board: that one asks who had the best
 * afternoon, this asks who has put the most in. Somebody who never tops a week
 * can still be climbing here, which is the point of having both.
 */
export const levelTop = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(LEADERBOARD_LIMIT, Math.max(1, Math.floor(limit ?? 10)));
    const players = await ctx.db
      .query("players")
      .withIndex("by_xp")
      .order("desc")
      .take(take + FILTER_MARGIN);

    return players
      .filter((player) => xpOf(player) > 0 && player.role !== "admin")
      .slice(0, take)
      .map((player, index) => ({
        rank: index + 1,
        handle: player.handle,
        level: levelOf(player),
        xp: xpOf(player),
        school: player.school?.label ?? "",
      }));
  },
});

/** Where the signed-in player sits on the ladder. */
export const levelStanding = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    const xp = xpOf(player);
    if (xp <= 0) return { rank: null, xp: 0, level: levelOf(player), handle: player.handle };

    const above = await ctx.db
      .query("players")
      .withIndex("by_xp", (q) => q.gt("xp", xp))
      .collect();

    return {
      rank: above.filter((other) => other.role !== "admin").length + 1,
      xp,
      level: levelOf(player),
      handle: player.handle,
    };
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

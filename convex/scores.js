import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { perkFor } from "../src/characters.js";
import { REJECT_RUN, runThrottle, validateRun } from "../src/leaderboard-rules.js";
import { rankAt, rankUpBetween, runXp } from "../src/progression.js";
import { dayKey } from "../src/daily.js";
import { weekKey } from "../src/week.js";
import { adjustSchool, adjustSchoolWeek } from "./schools.js";
import { requirePlayer } from "./session.js";
import { coinsOf, levelOf, xpOf } from "./players.js";
import { schoolLabel } from "../src/school.js";

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

/**
 * Coins the browser may be paid in one day for things the server cannot check.
 *
 * Missions and the streak are worked out in the browser — mission progress
 * reads counters no run submission carries, and moving that whole table up here
 * is a migration of its own. So they stay a claim, and the claim is bounded by
 * what a day can actually pay: three missions at the hardest step with the
 * mission character equipped (2,090), the all-clear bonus on top (1,394), and a
 * seventh-day streak with the streak character (350).
 *
 * Per day rather than per run, which is the point. A per-run allowance is
 * farmed by submitting runs; a day's missions can only be finished once.
 */
export const CLIENT_COINS_PER_DAY = 3900;
/** The same, for experience. Mission XP at the hardest step, plus the bonus. */
export const CLIENT_XP_PER_DAY = 3000;

/** A claim, taken at face value up to what is left and never below zero. */
function clampClaim(claimed, remaining) {
  const asked = Math.trunc(Number(claimed) || 0);
  return Math.max(0, Math.min(asked, Math.max(0, remaining)));
}

export const submit = mutation({
  args: {
    token: v.string(),
    score: v.number(),
    distance: v.number(),
    coins: v.number(),
    comboMax: v.number(),
    seconds: v.number(),
    character: v.string(),
    /**
     * Coins and experience the browser paid itself around this run for things
     * this mutation cannot verify: missions finished, the day's all-clear
     * bonus, the attendance streak. A claim, capped per day — see
     * CLIENT_COINS_PER_DAY.
     */
    claimedCoins: v.optional(v.number()),
    claimedXp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const player = await requirePlayer(ctx, args.token);

    // Before the plausibility check, because it costs two field reads and the
    // check walks the speed curve.
    const throttle = runThrottle(player, Date.now());
    if (!throttle.ok) return { ok: false, reason: REJECT_RUN.TOO_MANY };

    const check = validateRun(args);
    if (!check.ok) {
      // Rejected quietly: the run simply does not reach the board. Telling the
      // client which bound it broke would only help someone tune around it.
      // Nothing is paid for a run that did not happen.
      return { ok: false, reason: check.reason };
    }

    const score = Math.floor(args.score);
    const now = Date.now();

    await ctx.db.insert("scores", {
      playerId: player._id,
      handle: player.handle,
      // Stored with the run so a closed week can be ranked by school from this
      // table alone, without reading a save file per run.
      school: player.school ? schoolLabel(player.school) : "",
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

    const patch = {
      updatedAt: now,
      runWindowStart: throttle.runWindowStart,
      runsInWindow: throttle.runsInWindow,
    };
    if (score > player.best) patch.best = score;
    if (score > weekBest || player.weekKey !== week) {
      patch.weekKey = week;
      patch.weekBest = Math.max(score, weekBest);
    }
    // --- what this run pays -------------------------------------------------
    //
    // This is the only place a run can pay anything. It used to be
    // players:save, which took the browser's word for how much it had earned
    // and granted up to five thousand coins per call — no run required, and a
    // call is a line of JavaScript. Everything below is either checked against
    // the run just validated or worked out from a column the server owns.
    const perk = perkFor(args.character);

    // Picked up during the run. `validateRun` has already bounded this against
    // the distance the speed curve allows, so it is as true as the run is.
    const runCoins = Math.round(Math.floor(args.coins) * (perk.coinBonus ?? 1));

    // Experience is a fixed fraction of the score, and the score is bounded by
    // the same check. Nothing is taken from the client here at all.
    const earnedXp = Math.round(runXp(score) * (perk.xpBonus ?? 1));

    // Reaching a rank pays, and the server owns the experience that decides it,
    // so it can work the payment out exactly rather than be told.
    const heldXp = xpOf(player);
    const rankCoins = rankUpBetween(rankAt(heldXp).level, rankAt(heldXp + earnedXp).level).coins;

    // Missions and the streak are the browser's to compute; see
    // CLIENT_COINS_PER_DAY. Whatever is left of today's allowance is honoured
    // and the rest is dropped — quietly, because an honest player never reaches
    // it and telling anyone else where the line is only helps them.
    const today = dayKey(now);
    const spentToday = player.payoutDay === today ? (player.payoutCoinsToday ?? 0) : 0;
    const spentXpToday = player.payoutDay === today ? (player.payoutXpToday ?? 0) : 0;
    const claimCoins = clampClaim(args.claimedCoins, CLIENT_COINS_PER_DAY - spentToday);
    const claimXp = clampClaim(args.claimedXp, CLIENT_XP_PER_DAY - spentXpToday);

    patch.coins = Math.max(0, coinsOf(player) + runCoins + rankCoins + claimCoins);
    patch.xp = Math.max(0, heldXp + earnedXp + claimXp);
    patch.pendingCoins = 0;
    patch.payoutDay = today;
    patch.payoutCoinsToday = spentToday + claimCoins;
    patch.payoutXpToday = spentXpToday + claimXp;

    // The ledger bounds what a save may claim to have *bought*, so it grows by
    // everything just paid out.
    patch.coinLedger = (player.coinLedger ?? 0) + runCoins + rankCoins + claimCoins;

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

    // The balance and the experience go back with the record, so the card the
    // player is looking at can show what the server actually paid rather than
    // what the browser hoped it would.
    return {
      ok: true,
      best: Math.max(score, player.best),
      coins: patch.coins,
      xp: patch.xp,
    };
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
        school: player.school ? schoolLabel(player.school) : "",
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
        school: player.school ? schoolLabel(player.school) : "",
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

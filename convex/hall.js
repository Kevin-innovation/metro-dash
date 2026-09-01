import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { weekKey, weekLabel, weekStart } from "../src/week.js";
import { GENERAL, TEACHER, schoolLabel } from "../src/school.js";

/**
 * The hall of fame: who won each week, kept for good.
 *
 * A weekly board resets on Monday, and without this that is all it does —
 * whoever spent the week at the top has nothing at all to show for it on
 * Tuesday. One row per closed week, written once.
 *
 * Both rankings are worked out from the `scores` table rather than from the
 * running weekly figures on the player and school rows. Those are correct only
 * until somebody plays again in the new week and overwrites them, which makes
 * closing a week a race against the first Monday morning run. A week's runs, on
 * the other hand, are still there next month — so this can be run late, run
 * twice, or run for a week that was missed entirely, and give the same answer.
 */

/** How many places are remembered. Three is a podium; ten is a list. */
export const HALL_PLACES = 3;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rank a week from the runs recorded during it.
 *
 * @returns {{ players: Array, schools: Array }}
 */
async function rankWeek(ctx, from, to) {
  /** Best single run per player, and which school it counted for. */
  const best = new Map();
  for await (const run of ctx.db.query("scores")) {
    if (run.createdAt < from || run.createdAt >= to) continue;
    const id = String(run.playerId);
    const held = best.get(id);
    if (!held || run.score > held.score) {
      best.set(id, {
        playerId: run.playerId,
        handle: run.handle,
        score: run.score,
        school: run.school ?? "",
      });
    }
  }

  // Runs recorded before the school was written onto them have to be asked
  // about. Only those, and only one lookup per player — a save file is a large
  // thing to read and there is no reason to read one twice.
  for (const entry of best.values()) {
    if (entry.school) continue;
    const player = await ctx.db.get(entry.playerId);
    entry.school = player?.school ? schoolLabel(player.school) : "";
  }

  const players = [...best.values()]
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, HALL_PLACES)
    .map((entry, index) => ({
      rank: index + 1,
      handle: entry.handle,
      score: entry.score,
      school: entry.school,
    }));

  // A school's week is the sum of its members' best runs that week, counting
  // each member once — the same rule the live board uses.
  const totals = new Map();
  for (const entry of best.values()) {
    // 일반부 is an affiliation rather than a school and never ranks as one.
    if (!entry.school || entry.school === GENERAL.label || entry.school === TEACHER.label || entry.score <= 0) continue;
    const held = totals.get(entry.school) ?? { total: 0, members: 0 };
    held.total += entry.score;
    held.members += 1;
    totals.set(entry.school, held);
  }

  const schools = [...totals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, HALL_PLACES)
    .map(([label, held], index) => ({
      rank: index + 1,
      label,
      total: held.total,
      members: held.members,
    }));

  return { players, schools };
}

/**
 * Write one week into the hall.
 *
 * Idempotent: a week already closed is rewritten rather than duplicated, so a
 * cron that fires twice, or a hand-run backfill over a week that has already
 * been done, costs nothing.
 *
 * @param {number} ms any moment inside the week to close
 */
async function close(ctx, ms, { force = false } = {}) {
  const from = weekStart(ms);
  const key = weekKey(ms);

  // A week still being played has no winner yet. Closing one would put the
  // current standings in the hall beside the live board showing the same
  // names, and then be wrong the moment somebody plays.
  if (!force && from + WEEK_MS > Date.now()) {
    return { ok: false, week: key, reason: "아직 끝나지 않은 주입니다" };
  }

  const result = await rankWeek(ctx, from, from + WEEK_MS);

  // A week nobody played is not a week worth remembering.
  if (!result.players.length) return { ok: true, week: key, skipped: "empty" };

  const existing = await ctx.db
    .query("halls")
    .withIndex("by_week", (q) => q.eq("weekKey", key))
    .unique();

  const row = {
    weekKey: key,
    label: weekLabel(ms),
    startedAt: from,
    closedAt: Date.now(),
    players: result.players,
    schools: result.schools,
  };
  if (existing) await ctx.db.patch(existing._id, row);
  else await ctx.db.insert("halls", row);

  return { ok: true, week: key, players: result.players.length, schools: result.schools.length };
}

/**
 * Close the week that has just ended.
 *
 * Run by the Monday cron. It reads a moment inside the previous week rather
 * than "now", because at the time it fires the new week has already started.
 */
export const closeLastWeek = internalMutation({
  args: {},
  handler: async (ctx) => await close(ctx, Date.now() - WEEK_MS / 7),
});

/** Close a week by hand — for a week the cron missed, or to backfill. */
export const closeWeek = mutation({
  args: { adminKey: v.string(), weeksAgo: v.optional(v.number()), force: v.optional(v.boolean()) },
  handler: async (ctx, { adminKey, weeksAgo, force }) => {
    const expected = process.env.ADMIN_KEY;
    if (!expected || adminKey !== expected) throw new ConvexError("관리자 키가 올바르지 않습니다");
    const back = Math.max(0, Math.floor(weeksAgo ?? 1));
    return await close(ctx, Date.now() - back * WEEK_MS, { force: force === true });
  },
});

/** Remove a week from the hall — for one closed by mistake. */
export const dropWeek = mutation({
  args: { adminKey: v.string(), weekKey: v.string() },
  handler: async (ctx, { adminKey, weekKey: key }) => {
    const expected = process.env.ADMIN_KEY;
    if (!expected || adminKey !== expected) throw new ConvexError("관리자 키가 올바르지 않습니다");
    const row = await ctx.db
      .query("halls")
      .withIndex("by_week", (q) => q.eq("weekKey", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { ok: true, removed: Boolean(row) };
  },
});

/** Closed weeks, newest first. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(30, Math.max(1, Math.floor(limit ?? 8)));
    const rows = await ctx.db.query("halls").withIndex("by_week").order("desc").take(take);
    return rows
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((row) => ({
        weekKey: row.weekKey,
        label: row.label,
        players: row.players,
        schools: row.schools,
      }));
  },
});

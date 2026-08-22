import { v } from "convex/values";
import { query } from "./_generated/server";
import { isGeneral, schoolKey, schoolLabel } from "../src/school.js";
import { weekKey } from "../src/week.js";
import { requirePlayer } from "./session.js";

/**
 * The school ranking.
 *
 * A school's score is the sum of its members' best scores, kept as a running
 * total (see the note in schema.js for why it is not computed on read). Every
 * place that can change a player's best or their school has to move the total
 * with it, and all of those go through the helpers here.
 */

/** Matches LEADERBOARD_LIMIT: both columns page ten at a time up to fifty. */
export const SCHOOL_LIMIT = 50;

/** Find a school row, creating it the first time someone joins. */
export async function ensureSchool(ctx, school) {
  const key = schoolKey(school);
  const existing = await ctx.db
    .query("schools")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) return existing;

  const id = await ctx.db.insert("schools", {
    key,
    region: school.region,
    level: school.level,
    name: school.name,
    label: schoolLabel(school),
    members: 0,
    total: 0,
    updatedAt: Date.now(),
  });
  return await ctx.db.get(id);
}

/**
 * Move a school's running total.
 *
 * Clamped at zero on both counts: a negative membership or total would be a bug
 * showing up as a nonsense leaderboard, and clamping keeps the board readable
 * until `recomputeSchools` puts it right.
 */
export async function adjustSchool(ctx, key, { members = 0, total = 0 }) {
  if (!key || (members === 0 && total === 0)) return;
  const row = await ctx.db
    .query("schools")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) return;

  await ctx.db.patch(row._id, {
    members: Math.max(0, row.members + members),
    total: Math.max(0, row.total + total),
    updatedAt: Date.now(),
  });
}

/**
 * Move a school's weekly total.
 *
 * A row whose week has passed is read as empty and started again rather than
 * being cleared on a schedule: nothing has to run on Monday for the ranking to
 * be right, and a school that does not play that week simply never appears.
 *
 * @param {number} total points to add
 * @param {boolean} newMember true when this is the member's first score of the week
 */
export async function adjustSchoolWeek(ctx, key, week, { total = 0, newMember = false }) {
  if (!key || (total === 0 && !newMember)) return;
  const row = await ctx.db
    .query("schools")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) return;

  const carry = row.weekKey === week;
  await ctx.db.patch(row._id, {
    weekKey: week,
    weekTotal: Math.max(0, (carry ? (row.weekTotal ?? 0) : 0) + total),
    weekMembers: Math.max(0, (carry ? (row.weekMembers ?? 0) : 0) + (newMember ? 1 : 0)),
    updatedAt: Date.now(),
  });
}

/** This week's figures for a row, or zeroes when it has not played since Monday. */
function weekOf(row, week) {
  if (row.weekKey !== week) return { total: 0, members: 0 };
  return { total: row.weekTotal ?? 0, members: row.weekMembers ?? 0 };
}

/** Attach a player to a school and carry their current best into its total. */
export async function joinSchool(ctx, player, school) {
  const row = await ensureSchool(ctx, school);
  await ctx.db.patch(player._id, { school, schoolKey: row.key, updatedAt: Date.now() });
  await adjustSchool(ctx, row.key, { members: 1, total: player.best });
  return row;
}

/**
 * Detach a player, taking their best back out of the total.
 *
 * The school row goes with the last member. Left behind it would sit in the
 * staff list at 「0명 · 0점」 forever, and every deleted account would add
 * another one.
 */
export async function leaveSchool(ctx, player) {
  if (!player.schoolKey) return;
  const key = player.schoolKey;
  await adjustSchool(ctx, key, { members: -1, total: -player.best });
  await ctx.db.patch(player._id, { school: undefined, schoolKey: undefined, updatedAt: Date.now() });

  const row = await ctx.db
    .query("schools")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row && row.members <= 0) await ctx.db.delete(row._id);
}

// --- reads ------------------------------------------------------------------

/**
 * Rows read beyond the ones asked for, so the excluded ones do not eat the page.
 *
 * 일반부 sits near the top of `by_total` — its members are real players with
 * real scores — and dropping it after taking ten left nine schools on a board
 * with ten places. Anything filtered has to be filtered before the page is
 * cut, which means fetching past it first. The table has a row per school, so
 * reading a few extra costs nothing.
 */
const FILTER_MARGIN = 16;

export const top = query({
  args: { limit: v.optional(v.number()), range: v.optional(v.string()) },
  handler: async (ctx, { limit, range }) => {
    const take = Math.min(SCHOOL_LIMIT, Math.max(1, Math.floor(limit ?? 10)));
    const weekly = range === "week";
    const week = weekKey(Date.now());
    const window = take + FILTER_MARGIN;

    const rows = weekly
      ? await ctx.db
          .query("schools")
          .withIndex("by_week_total", (q) => q.eq("weekKey", week))
          .order("desc")
          .take(window)
      : await ctx.db.query("schools").withIndex("by_total").order("desc").take(window);

    return rows
      // 일반부 is an affiliation, not a school: it belongs under a player's name
      // on the individual board, not in a ranking of schools.
      .map((row) => ({ row, figures: weekly ? weekOf(row, week) : { total: row.total, members: row.members } }))
      .filter(({ row, figures }) => figures.total > 0 && !isGeneral(row))
      .slice(0, take)
      .map(({ row, figures }, index) => ({
        rank: index + 1,
        key: row.key,
        label: row.label,
        total: figures.total,
        members: figures.members,
      }));
  },
});

/** Where the signed-in player's school sits, even when it is off the board. */
export const standing = query({
  args: { token: v.string(), range: v.optional(v.string()) },
  handler: async (ctx, { token, range }) => {
    const player = await requirePlayer(ctx, token);
    // Nothing to stand in for 일반부, which the board above leaves out.
    if (!player.schoolKey || isGeneral(player.school)) return null;

    const weekly = range === "week";
    const week = weekKey(Date.now());
    const row = await ctx.db
      .query("schools")
      .withIndex("by_key", (q) => q.eq("key", player.schoolKey))
      .unique();
    if (!row) return { rank: null, label: "", total: 0, members: 0 };

    const mine = weekly ? weekOf(row, week) : { total: row.total, members: row.members };
    if (mine.total <= 0) return { rank: null, label: row.label, total: 0, members: mine.members };

    const above = weekly
      ? await ctx.db
          .query("schools")
          .withIndex("by_week_total", (q) => q.eq("weekKey", week).gt("weekTotal", mine.total))
          .collect()
      : await ctx.db
          .query("schools")
          .withIndex("by_total", (q) => q.gt("total", mine.total))
          .collect();

    // Counted the same way the board is, or a 일반부 total above this one would
    // push every school below it down a place that does not exist on screen.
    const ahead = above.filter((other) => !isGeneral(other)).length;
    return { rank: ahead + 1, label: row.label, total: mine.total, members: mine.members };
  },
});

import { v } from "convex/values";
import { query } from "./_generated/server";
import { schoolKey, schoolLabel } from "../src/school.js";
import { requirePlayer } from "./session.js";

/**
 * The school ranking.
 *
 * A school's score is the sum of its members' best scores, kept as a running
 * total (see the note in schema.js for why it is not computed on read). Every
 * place that can change a player's best or their school has to move the total
 * with it, and all of those go through the helpers here.
 */

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

export const top = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(SCHOOL_LIMIT, Math.max(1, Math.floor(limit ?? 10)));
    const rows = await ctx.db.query("schools").withIndex("by_total").order("desc").take(take);

    return rows
      .filter((row) => row.total > 0)
      .map((row, index) => ({
        rank: index + 1,
        key: row.key,
        label: row.label,
        total: row.total,
        members: row.members,
      }));
  },
});

/** Where the signed-in player's school sits, even when it is off the board. */
export const standing = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    if (!player.schoolKey) return null;

    const row = await ctx.db
      .query("schools")
      .withIndex("by_key", (q) => q.eq("key", player.schoolKey))
      .unique();
    if (!row || row.total <= 0) return { rank: null, label: row?.label ?? "", total: 0, members: row?.members ?? 0 };

    const above = await ctx.db
      .query("schools")
      .withIndex("by_total", (q) => q.gt("total", row.total))
      .collect();

    return { rank: above.length + 1, label: row.label, total: row.total, members: row.members };
  },
});

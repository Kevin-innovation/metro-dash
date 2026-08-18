import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { handleKey, validateHandle } from "../src/nickname.js";
import { schoolKey, schoolLabel, validateSchool } from "../src/school.js";
import { ensureSchool, joinSchool, leaveSchool } from "./schools.js";

/**
 * Teacher tools.
 *
 * Gated on an ADMIN_KEY set in the Convex dashboard rather than on a player
 * account, so there is no admin login to guess and nothing in the client build
 * that grants access.
 *
 * Forced rename is the important one. The nickname filter blocks the obvious
 * cases, but no word list catches a name with characters inserted mid-word —
 * so someone has to be able to change it after the fact.
 */

function requireAdmin(adminKey) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) throw new ConvexError("서버에 ADMIN_KEY가 설정되지 않았습니다");
  // Length check first so a wrong-length guess cannot be told apart by timing.
  if (typeof adminKey !== "string" || adminKey.length !== expected.length) {
    throw new ConvexError("관리자 키가 올바르지 않습니다");
  }
  let same = 0;
  for (let i = 0; i < expected.length; i++) same |= adminKey.charCodeAt(i) ^ expected.charCodeAt(i);
  if (same !== 0) throw new ConvexError("관리자 키가 올바르지 않습니다");
}

async function byHandle(ctx, handle) {
  return await ctx.db
    .query("players")
    .withIndex("by_handleKey", (q) => q.eq("handleKey", handleKey(handle)))
    .unique();
}

export const list = query({
  args: { adminKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { adminKey, limit }) => {
    requireAdmin(adminKey);
    const players = await ctx.db
      .query("players")
      .withIndex("by_best")
      .order("desc")
      .take(Math.min(200, Math.max(1, Math.floor(limit ?? 100))));

    // No PIN or token in the response: staff need to find an account, not to
    // sign in as one.
    return players.map((player) => ({
      handle: player.handle,
      best: player.best,
      school: player.school ? schoolLabel(player.school) : "",
      lockedUntil: player.lockedUntil,
      failedAttempts: player.failedAttempts,
      createdAt: player.createdAt,
    }));
  },
});

/**
 * Open reports, newest first, grouped by who was reported.
 *
 * Grouped rather than listed one per row: five reports about one nickname is
 * one thing to look at, not five.
 */
export const reports = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    const open = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(200);

    const byTarget = new Map();
    for (const row of open) {
      const entry = byTarget.get(row.targetHandle) ?? {
        handle: row.targetHandle,
        count: 0,
        reporters: [],
        latest: 0,
      };
      entry.count += 1;
      if (entry.reporters.length < 5) entry.reporters.push(row.reporterHandle);
      entry.latest = Math.max(entry.latest, row.createdAt);
      byTarget.set(row.targetHandle, entry);
    }

    return [...byTarget.values()].sort((a, b) => b.count - a.count || b.latest - a.latest);
  },
});

/** Mark every open report about a nickname as dealt with. */
export const resolveReports = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    const open = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) => q.eq("targetId", player._id))
      .collect();
    let resolved = 0;
    for (const row of open) {
      if (row.status === "open") {
        await ctx.db.patch(row._id, { status: "resolved" });
        resolved += 1;
      }
    }
    return { ok: true, resolved };
  },
});

export const resetPin = mutation({
  args: { adminKey: v.string(), handle: v.string(), newPin: v.string() },
  handler: async (ctx, { adminKey, handle, newPin }) => {
    requireAdmin(adminKey);
    if (!/^\d{4}$/.test(newPin)) throw new ConvexError("새 비밀번호는 숫자 4자리여야 합니다");

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Clearing the lock too, since a forgotten PIN usually arrives with one.
    await ctx.db.patch(player._id, {
      pin: newPin,
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: Date.now(),
    });
    return { ok: true, handle: player.handle };
  },
});

/** Change an abusive nickname. Their scores follow the new name. */
export const rename = mutation({
  args: { adminKey: v.string(), handle: v.string(), newHandle: v.string() },
  handler: async (ctx, { adminKey, handle, newHandle }) => {
    requireAdmin(adminKey);

    const check = validateHandle(newHandle);
    if (!check.ok) throw new ConvexError(check.message);

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    const clash = await byHandle(ctx, check.handle);
    if (clash && clash._id !== player._id) throw new ConvexError("이미 쓰고 있는 닉네임입니다");

    await ctx.db.patch(player._id, {
      handle: check.handle,
      handleKey: handleKey(check.handle),
      updatedAt: Date.now(),
    });

    // Score rows carry a copy of the name so the board is a single read; they
    // have to be brought along or the old name stays on display.
    const runs = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    for (const run of runs) await ctx.db.patch(run._id, { handle: check.handle });

    // The reports that prompted this are answered by the rename itself.
    const open = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) => q.eq("targetId", player._id))
      .collect();
    for (const row of open) {
      if (row.status === "open") await ctx.db.patch(row._id, { status: "resolved" });
    }

    return { ok: true, from: player.handle, to: check.handle, runsUpdated: runs.length };
  },
});

/**
 * Create or update the staff account.
 *
 * Deliberately not reachable from the sign-up form: the nickname filter
 * reserves 「admin」 and every other staff-sounding name, so this is the only
 * way such an account can exist, and it needs the admin key to run.
 *
 * Signing in with it returns the admin key to that browser, which is what opens
 * the tools page. That makes a four-digit PIN the thing standing in front of
 * every teacher action — so this account gets one free wrong guess and then
 * five-minute lockouts that double, and it is kept off the leaderboard.
 */
export const createStaff = mutation({
  args: { adminKey: v.string(), handle: v.string(), pin: v.string() },
  handler: async (ctx, { adminKey, handle, pin }) => {
    requireAdmin(adminKey);
    if (!/^\d{4}$/.test(pin)) throw new ConvexError("비밀번호는 숫자 4자리여야 합니다");

    const now = Date.now();
    const existing = await byHandle(ctx, handle);
    if (existing) {
      await ctx.db.patch(existing._id, {
        pin,
        role: "admin",
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: now,
      });
      return { ok: true, created: false, handle: existing.handle };
    }

    await ctx.db.insert("players", {
      handle,
      handleKey: handleKey(handle),
      pin,
      token: crypto.randomUUID(),
      profile: null,
      best: 0,
      role: "admin",
      // Not a real browser, so it does not consume anyone's device allowance.
      deviceId: "staff",
      failedAttempts: 0,
      lockedUntil: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, created: true, handle };
  },
});

// --- schools ----------------------------------------------------------------

/**
 * Set or move a player's school.
 *
 * Students get one choice and cannot change it, so this is where a mistyped or
 * wrongly-picked school gets fixed. Their best score moves with them, which is
 * what keeps the two rankings agreeing.
 */
export const setSchool = mutation({
  args: {
    adminKey: v.string(),
    handle: v.string(),
    region: v.string(),
    level: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { adminKey, handle, region, level, name }) => {
    requireAdmin(adminKey);
    const check = validateSchool({ region, level, name });
    if (!check.ok) throw new ConvexError(check.message);

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Out of the old school first, so a move between two schools cannot leave
    // the player counted in both.
    await leaveSchool(ctx, player);
    await joinSchool(ctx, { ...player, school: undefined, schoolKey: undefined }, check.school);
    return { ok: true, handle: player.handle, schoolLabel: check.label };
  },
});

/** Unset a school so the player can choose again themselves. */
export const clearSchool = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");
    await leaveSchool(ctx, player);
    return { ok: true };
  },
});

export const schools = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    const rows = await ctx.db.query("schools").withIndex("by_total").order("desc").take(300);
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      region: row.region,
      level: row.level,
      name: row.name,
      members: row.members,
      total: row.total,
    }));
  },
});

/**
 * Fold one school into another.
 *
 * The form makes a split unlikely — region and level are picked from lists and
 * the suffix is normalised — but a typo in the name still produces two rows,
 * and this is the one action that puts them back together.
 */
export const mergeSchools = mutation({
  args: { adminKey: v.string(), fromKey: v.string(), toKey: v.string() },
  handler: async (ctx, { adminKey, fromKey, toKey }) => {
    requireAdmin(adminKey);
    if (fromKey === toKey) throw new ConvexError("같은 학교입니다");

    const find = async (key) =>
      await ctx.db
        .query("schools")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

    const from = await find(fromKey);
    const to = await find(toKey);
    if (!from) throw new ConvexError("합칠 학교를 찾을 수 없습니다");
    if (!to) throw new ConvexError("합쳐질 학교를 찾을 수 없습니다");

    const members = await ctx.db
      .query("players")
      .withIndex("by_school", (q) => q.eq("schoolKey", fromKey))
      .collect();

    // Carrying the label too, since it cannot be rebuilt from the parts alone.
    const school = { region: to.region, level: to.level, name: to.name, label: to.label };
    for (const player of members) {
      await ctx.db.patch(player._id, { school, schoolKey: to.key, updatedAt: Date.now() });
    }

    await ctx.db.patch(to._id, {
      members: to.members + members.length,
      total: to.total + members.reduce((sum, player) => sum + player.best, 0),
      updatedAt: Date.now(),
    });
    await ctx.db.delete(from._id);

    return { ok: true, moved: members.length, from: from.label, to: to.label };
  },
});

/**
 * Rebuild every school total from the players.
 *
 * The totals are maintained by deltas, which is fast but can only ever be as
 * right as the code that moves them. This is the way back to the truth if they
 * ever drift, and it is safe to run at any time.
 */
export const recomputeSchools = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);

    const tally = new Map();
    for await (const player of ctx.db.query("players")) {
      if (!player.school) continue;
      // Recomputed from the stored school rather than the stored key, so a key
      // written by an older version of the rules is corrected too.
      const key = schoolKey(player.school);
      const entry = tally.get(key) ?? { school: player.school, members: 0, total: 0, ids: [] };
      entry.members += 1;
      entry.total += player.best;
      entry.ids.push(player._id);
      tally.set(key, entry);
    }

    for (const [key, entry] of tally) {
      const row = await ensureSchool(ctx, entry.school);
      await ctx.db.patch(row._id, {
        members: entry.members,
        total: entry.total,
        updatedAt: Date.now(),
      });
      for (const id of entry.ids) {
        const player = await ctx.db.get(id);
        if (player.schoolKey !== key) await ctx.db.patch(id, { schoolKey: key });
      }
    }

    // Schools nobody is in any more go away rather than sitting at zero.
    let removed = 0;
    for await (const row of ctx.db.query("schools")) {
      if (!tally.has(row.key)) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    return { ok: true, schools: tally.size, removed };
  },
});

/** Lift a lockout without changing the PIN. */
export const unlock = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");
    await ctx.db.patch(player._id, { failedAttempts: 0, lockedUntil: 0 });
    return { ok: true };
  },
});

/** Remove an account and every run it recorded. */
export const remove = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Out of their school first, while their best score is still there to
    // subtract — afterwards there would be nothing left to take out.
    await leaveSchool(ctx, player);

    const runs = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    for (const run of runs) await ctx.db.delete(run._id);

    const filed = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) => q.eq("targetId", player._id))
      .collect();
    for (const row of filed) await ctx.db.delete(row._id);

    await ctx.db.delete(player._id);
    return { ok: true, runsRemoved: runs.length, reportsRemoved: filed.length };
  },
});

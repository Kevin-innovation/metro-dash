import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { handleKey, validateHandle } from "../src/nickname.js";

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

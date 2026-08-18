import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { handleKey } from "../src/nickname.js";
import { requirePlayer } from "./players.js";

/**
 * Reporting a nickname.
 *
 * The filter in nickname.js stops the obvious cases but cannot see a banned
 * word with characters inserted through it, so the players reading the board
 * are the ones who will notice. This is the path from "someone noticed" to
 * "staff can act", and it is why forced rename exists.
 */

export const REPORT_STATUS = { OPEN: "open", RESOLVED: "resolved" };

export const report = mutation({
  args: { token: v.string(), handle: v.string() },
  handler: async (ctx, { token, handle }) => {
    const reporter = await requirePlayer(ctx, token);

    const target = await ctx.db
      .query("players")
      .withIndex("by_handleKey", (q) => q.eq("handleKey", handleKey(handle)))
      .unique();
    if (!target) throw new ConvexError("그런 닉네임이 없어요");
    if (target._id === reporter._id) throw new ConvexError("자기 자신은 신고할 수 없어요");

    // One report per reporter per target: a report is a signal that someone
    // should look, not a vote, and repeats would let a group gang up.
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_reporter_target", (q) =>
        q.eq("reporterId", reporter._id).eq("targetId", target._id),
      )
      .unique();
    if (existing) return { ok: true, alreadyReported: true };

    await ctx.db.insert("reports", {
      targetId: target._id,
      targetHandle: target.handle,
      reporterId: reporter._id,
      reporterHandle: reporter.handle,
      status: REPORT_STATUS.OPEN,
      createdAt: Date.now(),
    });

    return { ok: true, alreadyReported: false };
  },
});

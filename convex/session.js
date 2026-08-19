import { ConvexError } from "convex/values";

/**
 * Turning a token into the player it belongs to, and handing tokens out.
 *
 * Lives on its own rather than in players.js because schools.js needs it too,
 * and players.js needs schools.js — importing it from there would make the two
 * modules depend on each other.
 */

/**
 * How many devices one account can be signed in on at once.
 *
 * A cap, not a feature: without one the table grows a row per sign-in forever.
 * Eight is more devices than anyone actually plays on, so hitting it means the
 * oldest of them has long since been forgotten about.
 */
export const MAX_SESSIONS = 8;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function requirePlayer(ctx, token) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (session) {
    const player = await ctx.db.get(session.playerId);
    if (player) return player;
  }

  // Tokens handed out before sessions existed are still on the player document.
  // Honoured rather than rejected, or shipping this would have signed out
  // everyone who was signed in at the time.
  const legacy = await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!legacy) throw new ConvexError("세션이 만료되었어요. 다시 로그인해 주세요");
  return legacy;
}

/**
 * Issue a token for one device.
 *
 * Signing in again from the same browser replaces that browser's row instead of
 * adding another, so a player who signs in and out all day keeps one session.
 *
 * @returns {Promise<string>} the token to hand back to that browser
 */
export async function startSession(ctx, playerId, deviceId) {
  const device = deviceId || "unknown";
  const mine = await ctx.db
    .query("sessions")
    .withIndex("by_player_device", (q) => q.eq("playerId", playerId).eq("deviceId", device))
    .collect();
  for (const row of mine) await ctx.db.delete(row._id);

  const token = newToken();
  await ctx.db.insert("sessions", { playerId, token, deviceId: device, createdAt: Date.now() });

  // Oldest first, so what is dropped at the cap is the least recently signed in.
  const all = await ctx.db
    .query("sessions")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  const over = all.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, all.length - MAX_SESSIONS));
  for (const row of over) await ctx.db.delete(row._id);

  return token;
}

/** Sign one device out, leaving every other device alone. */
export async function endSession(ctx, token) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (session) await ctx.db.delete(session._id);
}

/** Sign every device out. Used when an account is deleted or taken over. */
export async function endAllSessions(ctx, playerId) {
  const rows = await ctx.db
    .query("sessions")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

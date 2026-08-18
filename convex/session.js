import { ConvexError } from "convex/values";

/**
 * Turning a token into the player it belongs to.
 *
 * Lives on its own rather than in players.js because schools.js needs it too,
 * and players.js needs schools.js — importing it from there would make the two
 * modules depend on each other.
 */
export async function requirePlayer(ctx, token) {
  const player = await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!player) throw new ConvexError("세션이 만료되었어요. 다시 로그인해 주세요");
  return player;
}

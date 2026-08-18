import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  FREE_ATTEMPTS,
  MAX_ACCOUNTS_PER_DEVICE,
  lockState,
  lockoutSeconds,
} from "../src/leaderboard-rules.js";
import { handleKey, validateHandle } from "../src/nickname.js";

/**
 * Accounts.
 *
 * A nickname and a four-digit PIN, deliberately nothing else — no name, no
 * email — so there is no personal data here to leak in the first place.
 *
 * The PIN is stored as given. Hashing four digits buys very little: an attacker
 * holding the table can walk all 10,000 values regardless. What actually
 * protects an account is the lockout below, because the leaderboard publishes
 * every valid nickname and hands an attacker the usernames for free.
 */

const PIN_PATTERN = /^\d{4}$/;

/** Client-visible shape. Never includes the PIN or another player's token. */
function publicProfile(player) {
  return {
    handle: player.handle,
    profile: player.profile,
    best: player.best,
  };
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function byHandle(ctx, handle) {
  return await ctx.db
    .query("players")
    .withIndex("by_handleKey", (q) => q.eq("handleKey", handleKey(handle)))
    .unique();
}

export async function requirePlayer(ctx, token) {
  const player = await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!player) throw new ConvexError("세션이 만료되었어요. 다시 로그인해 주세요");
  return player;
}

/** Is this nickname free? Used to give feedback before the form is submitted. */
export const available = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const check = validateHandle(handle);
    if (!check.ok) return { ok: false, reason: check.reason, message: check.message };
    const existing = await byHandle(ctx, check.handle);
    return existing
      ? { ok: false, reason: "taken", message: "이미 쓰고 있는 닉네임이에요" }
      : { ok: true };
  },
});

export const register = mutation({
  args: {
    handle: v.string(),
    pin: v.string(),
    deviceId: v.string(),
    profile: v.any(),
  },
  handler: async (ctx, { handle, pin, deviceId, profile }) => {
    // Re-validated here even though the browser already checked: the client
    // copy is for feedback, this one is the rule.
    const check = validateHandle(handle);
    if (!check.ok) throw new ConvexError(check.message);
    if (!PIN_PATTERN.test(pin)) throw new ConvexError("비밀번호는 숫자 4자리로 정해 주세요");

    if (await byHandle(ctx, check.handle)) {
      throw new ConvexError("이미 쓰고 있는 닉네임이에요");
    }

    const fromDevice = await ctx.db
      .query("players")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    if (fromDevice.length >= MAX_ACCOUNTS_PER_DEVICE) {
      throw new ConvexError(`이 기기에서는 계정을 ${MAX_ACCOUNTS_PER_DEVICE}개까지 만들 수 있어요`);
    }

    const now = Date.now();
    const token = newToken();
    const id = await ctx.db.insert("players", {
      handle: check.handle,
      handleKey: handleKey(check.handle),
      pin,
      token,
      profile: profile ?? null,
      best: Math.max(0, Math.floor(profile?.best ?? 0)),
      deviceId,
      failedAttempts: 0,
      lockedUntil: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { token, ...publicProfile(await ctx.db.get(id)) };
  },
});

/**
 * Sign in.
 *
 * Failures are *returned*, never thrown. A mutation that throws is rolled back
 * in full, which would undo the very counter that makes the lockout work — and
 * with a four-digit PIN that counter is the only thing standing between a
 * published nickname and someone else's account.
 */
export const signIn = mutation({
  args: { handle: v.string(), pin: v.string() },
  handler: async (ctx, { handle, pin }) => {
    const player = await byHandle(ctx, handle);
    // Same message either way, so the form cannot be used to enumerate names.
    const rejection = "닉네임이나 비밀번호가 맞지 않아요";
    if (!player) return { ok: false, message: rejection };

    const now = Date.now();
    const lock = lockState(player, now);
    if (lock.locked) {
      return {
        ok: false,
        message: `너무 많이 틀렸어요. ${lock.retryInSeconds}초 뒤에 다시 시도해 주세요`,
      };
    }

    if (player.pin !== pin) {
      const failedAttempts = player.failedAttempts + 1;
      const wait = lockoutSeconds(failedAttempts);
      await ctx.db.patch(player._id, {
        failedAttempts,
        lockedUntil: wait > 0 ? now + wait * 1000 : 0,
      });
      const left = FREE_ATTEMPTS - failedAttempts;
      return {
        ok: false,
        message: left > 0 ? `${rejection} (${left}번 더 틀리면 잠깁니다)` : rejection,
      };
    }

    // A fresh token on every sign-in, so an old one stops working.
    const token = newToken();
    await ctx.db.patch(player._id, {
      token,
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: now,
    });

    return { ok: true, token, ...publicProfile({ ...player, token }) };
  },
});

/** Pull the cloud save, e.g. after signing in on another device. */
export const load = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => publicProfile(await requirePlayer(ctx, token)),
});

/** Push the whole save file up. Last write wins; one player, one device at a time. */
export const save = mutation({
  args: { token: v.string(), profile: v.any(), best: v.number() },
  handler: async (ctx, { token, profile, best }) => {
    const player = await requirePlayer(ctx, token);
    await ctx.db.patch(player._id, {
      profile,
      // Never let a sync walk the best score backwards.
      best: Math.max(player.best, Math.floor(best) || 0),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const signOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    await ctx.db.patch(player._id, { token: newToken() });
    return { ok: true };
  },
});

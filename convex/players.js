import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  FREE_ATTEMPTS,
  MAX_ACCOUNTS_PER_DEVICE,
  STAFF_FREE_ATTEMPTS,
  lockState,
  lockoutSeconds,
} from "../src/leaderboard-rules.js";
import { handleKey, validateHandle } from "../src/nickname.js";
import { schoolLabel, validateSchool } from "../src/school.js";
import { profileWorth } from "../src/shop.js";
import { joinSchool } from "./schools.js";
import { endSession, requirePlayer, startSession } from "./session.js";

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

/** Refuse to store a save blob big enough to be an attack rather than a game. */
const MAX_PROFILE_BYTES = 24 * 1024;

/**
 * Keep a client save honest before it is stored.
 *
 * The profile is opaque game state and is trusted as such, with one exception:
 * the `best` inside it is displayed as a personal record, so it is pinned to
 * the server's own figure rather than whatever the client sent.
 */
function sanitizeProfile(profile, serverBest) {
  if (profile === null || typeof profile !== "object") return null;
  const encoded = JSON.stringify(profile);
  if (encoded.length > MAX_PROFILE_BYTES) {
    throw new ConvexError("저장 데이터가 너무 큽니다");
  }
  return { ...profile, best: serverBest };
}

/** Client-visible shape. Never includes the PIN or another player's token. */
function publicProfile(player) {
  return {
    handle: player.handle,
    profile: player.profile,
    best: player.best,
    school: player.school ?? null,
    schoolLabel: player.school ? schoolLabel(player.school) : "",
    /** The balance the server holds; see the note in schema.js. */
    coins: coinsOf(player),
    staff: player.role === "admin",
  };
}

/**
 * The account's balance.
 *
 * Accounts that predate the column are read from the profile they already had,
 * plus anything staff queued under the old pending-grant mechanism, so nobody
 * loses coins to the move.
 */
function coinsOf(player) {
  if (typeof player.coins === "number") return Math.max(0, Math.floor(player.coins));
  const stored = Math.max(0, Math.floor(player.profile?.coins ?? 0));
  return stored + Math.max(0, Math.floor(player.pendingCoins ?? 0));
}

/** Most a single sync may add. A run pays tens of coins; this is a wall. */
const MAX_COIN_GAIN_PER_SYNC = 5000;

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
    // Still written to the player document so the by_token index has a value to
    // hold; the token actually handed out belongs to a session row.
    const id = await ctx.db.insert("players", {
      handle: check.handle,
      handleKey: handleKey(check.handle),
      pin,
      token: newToken(),
      profile: sanitizeProfile(profile, 0),
      coins: Math.max(0, Math.floor(profile?.coins ?? 0)),
      // A guest who played offline arrives with coins they really did earn, so
      // the ledger opens where they are rather than at zero.
      coinLedger: profileWorth(profile),
      // A new account starts at zero however good the local save claims to be;
      // the board is only ever climbed through a validated run.
      best: 0,
      deviceId,
      failedAttempts: 0,
      lockedUntil: 0,
      createdAt: now,
      updatedAt: now,
    });

    const token = await startSession(ctx, id, deviceId);
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
  // deviceId is optional so a client from before sessions existed still works.
  args: { handle: v.string(), pin: v.string(), deviceId: v.optional(v.string()) },
  handler: async (ctx, { handle, pin, deviceId }) => {
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

    const staff = player.role === "admin";

    if (player.pin !== pin) {
      const failedAttempts = player.failedAttempts + 1;
      const wait = lockoutSeconds(failedAttempts, staff);
      await ctx.db.patch(player._id, {
        failedAttempts,
        lockedUntil: wait > 0 ? now + wait * 1000 : 0,
      });
      const left = (staff ? STAFF_FREE_ATTEMPTS : FREE_ATTEMPTS) - failedAttempts;
      return {
        ok: false,
        message: left > 0 ? `${rejection} (${left}번 더 틀리면 잠깁니다)` : rejection,
      };
    }

    // A token for this device, and only this device. Rotating one token per
    // account — which is what this used to do — signed out every other browser
    // the player was already using, with no message and no way to tell why.
    const token = await startSession(ctx, player._id, deviceId ?? "unknown");
    await ctx.db.patch(player._id, {
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: now,
    });

    // The staff account carries the admin key back so the browser can open the
    // tools page. It is handed out only after the PIN has been accepted, and
    // only to the one account that has this role.
    const adminKey = staff ? (process.env.ADMIN_KEY ?? null) : undefined;
    return { ok: true, token, ...publicProfile({ ...player, token }), adminKey, staff };
  },
});

/** Pull the cloud save, e.g. after signing in on another device. */
export const load = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => publicProfile(await requirePlayer(ctx, token)),
});

/**
 * Push the save file up.
 *
 * Deliberately cannot touch `best`. The leaderboard ranks on that field, and a
 * save is unvalidated client state — accepting a score here would hand every
 * player a way around the run checks in scores.js. `best` moves only when
 * `scores:submit` has approved a run.
 */
export const save = mutation({
  args: {
    token: v.string(),
    profile: v.any(),
    /** Coins earned minus coins spent since this browser last synced. */
    coinsDelta: v.optional(v.number()),
    /**
     * Take the profile's balance as the truth instead of applying a delta.
     *
     * Sent once, right after signing in, when the player has chosen which of
     * two saves to keep. That is the one moment a browser is allowed to state a
     * balance rather than a change to one.
     */
    coinsAbsolute: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, profile, coinsDelta, coinsAbsolute }) => {
    const player = await requirePlayer(ctx, token);

    // The ledger no longer has to police the balance — the server owns that
    // now, and a client can only report what changed. What it still catches is
    // upgrades and characters appearing without having been paid for.
    const spent = profileWorth(profile) - Math.max(0, Math.floor(profile?.coins ?? 0));
    const ledger = player.coinLedger ?? Math.max(spent, profileWorth(player.profile));

    if (spent > ledger) {
      // Kept out of the cloud copy rather than argued with: the browser goes on
      // playing from its own save, and staff get a name to look at. Whatever is
      // stored here is what a new device restores, and that stays honest.
      await ctx.db.patch(player._id, { coinLedger: ledger, flagged: true });
      return { ok: false, reason: "ledger" };
    }

    const held = coinsOf(player);
    const delta = Math.trunc(coinsDelta ?? 0);
    const coins = coinsAbsolute
      ? Math.max(0, Math.floor(profile?.coins ?? 0))
      : Math.max(0, held + Math.min(delta, MAX_COIN_GAIN_PER_SYNC));

    await ctx.db.patch(player._id, {
      // The blob keeps a copy so a fresh device restoring it starts correct,
      // but the column above is what decides.
      profile: { ...sanitizeProfile(profile, player.best), coins },
      coins,
      // Folded into `coins` by coinsOf; nothing left to hold.
      pendingCoins: 0,
      coinLedger: ledger,
      // Cleared on a save that passes. The flag means "this account is claiming
      // more than it could have earned", which is a condition, not a permanent
      // mark — left set it would still be accusing an account long after the
      // save came back inside the ledger, and staff would have no way to tell
      // an ongoing problem from a moment last month.
      flagged: false,
      updatedAt: Date.now(),
    });
    return { ok: true, coins };
  },
});

/**
 * Choose a school. Once only.
 *
 * A player who could switch schools freely could carry their score to whichever
 * one is winning, and the ranking would mean nothing — so the second attempt is
 * refused and staff have to make the change. It is stated plainly in the form
 * before anyone submits it.
 */
export const setSchool = mutation({
  args: { token: v.string(), region: v.string(), level: v.string(), name: v.string() },
  handler: async (ctx, { token, region, level, name }) => {
    const player = await requirePlayer(ctx, token);
    if (player.schoolKey) {
      throw new ConvexError("학교는 한 번만 정할 수 있어요. 바꾸려면 선생님께 말씀해 주세요");
    }

    const check = validateSchool({ region, level, name });
    if (!check.ok) throw new ConvexError(check.message);

    await joinSchool(ctx, player, check.school);
    return { ok: true, school: check.school, schoolLabel: check.label };
  },
});

export const signOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await requirePlayer(ctx, token);
    await endSession(ctx, token);
    // Signing out is the one place worth being blunt: the pre-sessions token on
    // the player document is retired here too, so a browser still holding one
    // cannot keep the account open after someone has asked to be signed out.
    if (player.token === token) await ctx.db.patch(player._id, { token: newToken() });
    return { ok: true };
  },
});

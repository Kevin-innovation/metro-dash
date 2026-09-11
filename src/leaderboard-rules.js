import { MAX_SPEED } from "./config.js";
import { MAX_CHARACTER_SCORE_BONUS } from "./characters.js";
import { MAX_EVENT_MULTIPLIER } from "./events.js";
import { speedAt } from "./pace.js";

import { SLOT_TOP_MULTIPLIER } from "./slots.js";
import {
  COIN_BASE,
  COIN_COMBO_CAP,
  DIST_SCORE_RATE,
  JUMP_BONUS,
  MAX_COMBO_MULTIPLIER,
  MOUNT_BONUS,
  ROOF_RIDE_RATE,
  SLIDE_BONUS,
} from "./scoring.js";

/**
 * Rules the leaderboard enforces on the server.
 *
 * Pure so they can be unit tested here and imported by the Convex functions —
 * the client computes every score itself, so nothing it reports can be trusted
 * on its own.
 */

// --- sign-in throttling -----------------------------------------------------
//
// A four-digit PIN is only 10,000 possibilities, and the leaderboard publishes
// every valid nickname — so an attacker starts out knowing the usernames. The
// lockout, not the PIN, is what actually protects an account.

/** Failures allowed before the account starts locking. */
export const FREE_ATTEMPTS = 5;
/** First lockout, in seconds. Doubles with each further failure. */
export const LOCKOUT_BASE_SECONDS = 30;
export const LOCKOUT_MAX_SECONDS = 60 * 60;

/**
 * The staff account is the one place a four-digit PIN guards something worth
 * taking, and its nickname is fixed and guessable. So it gets almost no free
 * attempts and starts an order of magnitude higher — 10,000 possibilities is
 * only a real defence if each guess is expensive.
 */
export const STAFF_FREE_ATTEMPTS = 1;
export const STAFF_LOCKOUT_BASE_SECONDS = 300;

export function lockoutSeconds(failedAttempts, staff = false) {
  const free = staff ? STAFF_FREE_ATTEMPTS : FREE_ATTEMPTS;
  const base = staff ? STAFF_LOCKOUT_BASE_SECONDS : LOCKOUT_BASE_SECONDS;
  // `free` failures cost nothing; the one after that is the first lock.
  const over = Math.floor(failedAttempts) - free - 1;
  if (over < 0) return 0;
  return Math.min(LOCKOUT_MAX_SECONDS, base * 2 ** over);
}

/**
 * @param {{ failedAttempts?: number, lockedUntil?: number }} player
 * @param {number} now epoch millis
 */
export function lockState(player, now) {
  const until = player?.lockedUntil ?? 0;
  if (until > now) return { locked: true, retryInSeconds: Math.ceil((until - now) / 1000) };
  return { locked: false, retryInSeconds: 0 };
}

/** How many accounts one device may create, so a PIN game cannot be farmed. */
export const MAX_ACCOUNTS_PER_DEVICE = 3;

// --- run plausibility -------------------------------------------------------

/** Numeric integral of the speed curve: the furthest a run can legitimately go. */
export function maxDistanceIn(seconds) {
  if (!(seconds > 0)) return 0;
  const step = 0.5;
  let distance = 0;
  for (let t = 0; t < seconds; t += step) {
    distance += speedAt(t + step * 0.5) * Math.min(step, seconds - t);
  }
  return distance;
}

/**
 * Ceilings on what one metre and one coin can possibly be worth.
 *
 * Four multipliers stack, and Run.multiplier() is the list: the combo tier
 * (×2.5), the section running at the time (×2 during 코인 러시), the diamond
 * wheel (×10 on its best face) and the equipped runner. 점수 2배는 빠졌다.
 *
 * Derived from the pieces rather than written as a number, so a multiplier
 * added to the game cannot fail to be added here.
 */
export const MAX_MULTIPLIER =
  MAX_COMBO_MULTIPLIER *
  MAX_EVENT_MULTIPLIER *
  SLOT_TOP_MULTIPLIER *
  MAX_CHARACTER_SCORE_BONUS;
const MAX_PER_METRE = (DIST_SCORE_RATE + ROOF_RIDE_RATE) * MAX_MULTIPLIER;
const MAX_PER_COIN = (COIN_BASE + COIN_COMBO_CAP) * MAX_MULTIPLIER;
/**
 * The verbs — slides, jumps, mounts — generously bounded per second of running.
 *
 * Scales with the multiplier for the same reason the two above do: a bonus is
 * worth its face value times whatever is running, and the old flat 90 was
 * written when that could only reach four.
 *
 * The figure itself was 22.5, set when the near-miss bonus was the only thing
 * in here. Slides and jumps pay now, and the tightest stretch of the run deals
 * an obstacle roughly every quarter second, so the old number was a bound the
 * game could actually cross. Derived from the pieces rather than written down,
 * for the same reason MAX_MULTIPLIER is.
 */
const MAX_CLEARS_PER_SECOND = 4;
const MAX_BONUS_PER_SECOND =
  MAX_CLEARS_PER_SECOND * Math.max(SLIDE_BONUS, JUMP_BONUS, MOUNT_BONUS) * MAX_MULTIPLIER;

/** Coins are spaced ~1.35m apart at the tightest, magnet pulls included. */
const MAX_COINS_PER_METRE = 1 / 1.2;

/** Slack so ordinary rounding never rejects an honest run. */
const SLACK = 1.25;

export const REJECT_RUN = {
  SHAPE: "shape",
  DURATION: "duration",
  DISTANCE: "distance",
  COINS: "coins",
  SCORE: "score",
};

/** Longest run accepted, so a tab left running forever cannot bank a number. */
export const MAX_RUN_SECONDS = 60 * 60 * 3;

/**
 * Reject runs that could not have happened.
 *
 * Deliberately loose: the job is to keep impossible numbers off the board, not
 * to catch a player who squeezed out an extra few percent. A tight bound would
 * reject honest runs, which is the worse failure.
 *
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateRun(run) {
  const nums = ["score", "distance", "coins", "seconds"];
  for (const key of nums) {
    const value = run?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { ok: false, reason: REJECT_RUN.SHAPE };
    }
  }

  const { score, distance, coins, seconds } = run;
  if (seconds > MAX_RUN_SECONDS) return { ok: false, reason: REJECT_RUN.DURATION };

  // Distance is the anchor: it is bounded by the speed curve alone, and every
  // other quantity is bounded by distance.
  if (distance > maxDistanceIn(seconds) * SLACK) {
    return { ok: false, reason: REJECT_RUN.DISTANCE };
  }
  if (coins > distance * MAX_COINS_PER_METRE * SLACK + 10) {
    return { ok: false, reason: REJECT_RUN.COINS };
  }

  const ceiling =
    (distance * MAX_PER_METRE + coins * MAX_PER_COIN + seconds * MAX_BONUS_PER_SECOND) * SLACK;
  if (score > ceiling) return { ok: false, reason: REJECT_RUN.SCORE };

  return { ok: true };
}

export { MAX_SPEED };

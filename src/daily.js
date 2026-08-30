import { KST_OFFSET_MS } from "./week.js";

/**
 * Coming back tomorrow.
 *
 * A run that is only ever compared against itself gives nobody a reason to open
 * the game on a Tuesday. The streak is the cheapest thing that does: it is
 * visible before you play, it costs nothing to earn beyond showing up, and
 * losing it is the player's own doing rather than the game's.
 *
 * The reward is deliberately small next to a good run. It is an invitation, not
 * a wage — a streak worth more than playing well would turn the shop into an
 * attendance sheet.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The day a moment belongs to, on the clock the players live on. */
export function dayKey(ms) {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

/** Days are counted, not compared as dates, so this is just the day before. */
export function isConsecutive(lastDay, today) {
  return Number.isFinite(lastDay) && today - lastDay === 1;
}

/** Longest streak the reward keeps growing for. Beyond it the bonus is flat. */
export const STREAK_REWARD_CAP = 7;

/**
 * Coins per day of streak.
 *
 * The note above says the reward is deliberately small next to a good run. At
 * sixty it was not: a seventh day paid 420, and a good run pays something like
 * 300, so the best-paying thing a player could do was open the game. Doubled
 * again by 기관사, showing up beat playing outright. At twenty-five a full week
 * is 175 — noticeable, worth keeping, and still less than going and running.
 *
 * The character's doubling applies on top of this, which is what its card says
 * and is left alone: 350 a day is a strong perk for a fourteen-thousand-coin
 * runner and still under what a good run pays.
 */
export const STREAK_COIN_STEP = 25;

/** Coins for showing up on day `streak` of a run of days. */
export function streakReward(streak) {
  return STREAK_COIN_STEP * Math.min(Math.max(1, Math.floor(streak)), STREAK_REWARD_CAP);
}

/**
 * Work out the day's attendance from the save's last visit.
 *
 * @param {{ lastDay?: number, streak?: number }} save
 * @param {number} now epoch millis
 * @returns {{ first: boolean, streak: number, reward: number, continued: boolean }}
 *   `first` is false when the player has already been here today, in which case
 *   nothing is paid and the streak is left exactly as it was.
 */
export function attendance(save, now) {
  const today = dayKey(now);
  const lastDay = Number.isFinite(save?.lastDay) ? save.lastDay : null;
  const previous = Math.max(0, Math.floor(save?.streak ?? 0));

  if (lastDay === today) {
    return { first: false, streak: previous || 1, reward: 0, continued: false };
  }

  const continued = isConsecutive(lastDay, today);
  const streak = continued ? previous + 1 : 1;
  return { first: true, streak, reward: streakReward(streak), continued };
}

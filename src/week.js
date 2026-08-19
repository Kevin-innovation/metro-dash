/**
 * Which week a moment belongs to.
 *
 * The board is played in a school, where a term is the unit that matters: an
 * all-time ranking rewards whoever started first and tells everyone who joins
 * later that the top is out of reach. A weekly board gives every Monday its own
 * first place.
 *
 * Pure and free of both Three.js and Convex, so the browser and the backend
 * agree on where the line falls — a key computed differently on the two sides
 * would quietly split one week into two boards.
 */

/** The game is played in one country; the week turns over on its clock. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 1970-01-01 fell on a Thursday, so Monday is three days along. */
const EPOCH_TO_MONDAY = 3;

/**
 * A stable id for the week containing `ms`, e.g. "w2953".
 *
 * Opaque on purpose: it is a database key, and anything that looks like a date
 * invites code that parses it back.
 */
export function weekKey(ms) {
  const days = Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
  return `w${Math.floor((days + EPOCH_TO_MONDAY) / 7)}`;
}

/** Monday 00:00 KST of the week containing `ms`, as epoch millis. */
export function weekStart(ms) {
  const days = Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
  const monday = Math.floor((days + EPOCH_TO_MONDAY) / 7) * 7 - EPOCH_TO_MONDAY;
  return monday * DAY_MS - KST_OFFSET_MS;
}

/** When the current week's board is wiped and started again. */
export function weekEnd(ms) {
  return weekStart(ms) + 7 * DAY_MS;
}

/**
 * How long is left in the week, in the shape a player reads.
 * @returns {string} e.g. "3일 20시간 남음"
 */
export function weekRemainingLabel(ms) {
  const left = Math.max(0, weekEnd(ms) - ms);
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / (60 * 60 * 1000));
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  const minutes = Math.floor((left % (60 * 60 * 1000)) / 60000);
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
}

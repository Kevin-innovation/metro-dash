/**
 * Which week a moment belongs to.
 *
 * The board is played in a school, where a term is the unit that matters: an
 * all-time ranking rewards whoever started first and tells everyone who joins
 * later that the top is out of reach. A weekly board gives every week its own
 * first place.
 *
 * It turns over on Saturday rather than Monday. A school week ends on Friday,
 * and a board that resets on Monday morning throws away the weekend — the two
 * days the people playing it actually have time to play. Saturday midnight
 * starts the week where the players' week starts.
 *
 * Pure and free of both Three.js and Convex, so the browser and the backend
 * agree on where the line falls — a key computed differently on the two sides
 * would quietly split one week into two boards.
 */

/** The game is played in one country; the week turns over on its clock. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * 1970-01-01 fell on a Thursday, so the Saturday after it is two days along —
 * and the offset that lands a week boundary there is the five that completes
 * it. Written as the number the arithmetic wants rather than the number of days
 * to Saturday, because those are not the same and confusing them moves the
 * whole board by a day.
 */
const EPOCH_TO_SATURDAY = 5;

/**
 * A stable id for the week containing `ms`, e.g. "w2953".
 *
 * Opaque on purpose: it is a database key, and anything that looks like a date
 * invites code that parses it back.
 */
export function weekKey(ms) {
  const days = Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
  return `w${Math.floor((days + EPOCH_TO_SATURDAY) / 7)}`;
}

/** Saturday 00:00 KST of the week containing `ms`, as epoch millis. */
export function weekStart(ms) {
  const days = Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
  const saturday = Math.floor((days + EPOCH_TO_SATURDAY) / 7) * 7 - EPOCH_TO_SATURDAY;
  return saturday * DAY_MS - KST_OFFSET_MS;
}

/** When the current week's board is wiped and started again. */
export function weekEnd(ms) {
  return weekStart(ms) + 7 * DAY_MS;
}

/**
 * What a week is called: 「8월 3주차」.
 *
 * Named after the month its Saturday falls in, so a week that straddles the
 * turn of a month belongs to one of them rather than being split. The number is
 * which Saturday of that month it is.
 */
export function weekLabel(ms) {
  const saturday = new Date(weekStart(ms) + KST_OFFSET_MS);
  const nth = Math.floor((saturday.getUTCDate() - 1) / 7) + 1;
  return `${saturday.getUTCMonth() + 1}월 ${nth}주차`;
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

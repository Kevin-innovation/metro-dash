/**
 * The Christmas edition.
 *
 * Kept pure, for the same reason chuseok.js is: the browser, the spawner, the
 * score validator and the tests all need the same dates and wheel.
 *
 * November 7 through December 31, 2026, KST. Midnight KST is 15:00 UTC on the
 * day before. Outside those dates, `npm run dev` with `?christmas` in the URL
 * turns it on locally; see main.js. That switch is compiled out of a production
 * build.
 */

export const CHRISTMAS_TITLE = "MetDash · Christmas Edition";
export const CHRISTMAS_EVENT_FROM = Date.UTC(2026, 10, 6, 15, 0, 0);
export const CHRISTMAS_EVENT_TO = Date.UTC(2026, 11, 31, 15, 0, 0);

let preview = false;

/** Dev-server only. See main.js. */
export function setChristmasPreview(on) {
  preview = on;
}

/**
 * Whether the event is running at `ms`. Start inclusive, end exclusive.
 *
 * Read when a run starts and when the title comes back, never during a run, so
 * a run that crosses a boundary finishes under the rules it started with.
 */
export function christmasAt(ms = Date.now(), from = CHRISTMAS_EVENT_FROM, to = CHRISTMAS_EVENT_TO) {
  if (preview) return true;
  return ms >= from && ms < to;
}

/**
 * What the crow is during the event: the same trap on the same clock, with the
 * same antidote and 허수아비 perk, but weather rather than a bird. Only how it
 * looks and what it is called changes, so the difficulty stays where it was.
 */
export const BLIZZARD = { name: "눈보라", icon: "🌨️", colour: "#7dd3fc" };

export const GIFT_FIRST_MIN = 25;
export const GIFT_FIRST_MAX = 35;
export const GIFT_GAP_MIN = 40;
export const GIFT_GAP_MAX = 55;

/**
 * The Santa raid: a line, the sleigh, a countdown, then one golden parcel.
 *
 * Paid as ordinary run coins, which the server checks against distance. The
 * daily allowance for client claims is already spent in full by a good day's
 * missions, so paying this from it would quietly cost someone their mission coins.
 */
export const RAID_FIRST_MIN = 50;
export const RAID_FIRST_MAX = 70;
export const RAID_GAP_MIN = 70;
export const RAID_GAP_MAX = 100;
export const RAID_MAX_PER_RUN = 3;
export const SANTA_DROP_COINS = 1500;
/** How long the line stands before the count starts, and where the count starts. */
export const RAID_ANNOUNCE_SECONDS = 2;
export const RAID_COUNT_FROM = 3;

const between = (rng, low, high) => low + Math.floor(rng() * (high - low + 1));

/** Seconds of play before a run's first gift. */
export function firstGiftAt(rng = Math.random) {
  return between(rng, GIFT_FIRST_MIN, GIFT_FIRST_MAX);
}

/** Seconds of play until the next gift after one has appeared. */
export function nextGiftGap(rng = Math.random) {
  return between(rng, GIFT_GAP_MIN, GIFT_GAP_MAX);
}

/** Seconds of play before a run's first raid. */
export function firstRaidAt(rng = Math.random) {
  return between(rng, RAID_FIRST_MIN, RAID_FIRST_MAX);
}

/** Seconds of play until the next raid after one has come. */
export function nextRaidGap(rng = Math.random) {
  return between(rng, RAID_GAP_MIN, RAID_GAP_MAX);
}

/**
 * The raid's clock: waiting, then the line, then the count, then waiting for the
 * parcel to be placed. Ticks on play time alone, so a pause or a wheel holds it.
 */
export class SantaRaid {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.phase = "waiting";
    this.at = firstRaidAt(rng);
    this.t = 0;
    this.count = 0;
    this.raids = 0;
  }

  /**
   * @param {number} dt seconds of play
   * @param {number} runTime
   * @param {boolean} canStart whether there is open sky long enough for all of it.
   *   Only asked before it starts: a count already running is not called off.
   * @returns {{ type: "announce" } | { type: "count", value: number } | { type: "drop" } | null}
   */
  update(dt, runTime, canStart) {
    if (this.phase === "waiting") {
      if (this.raids >= RAID_MAX_PER_RUN || runTime < this.at || !canStart) return null;
      this.raids += 1;
      this.phase = "announce";
      this.t = RAID_ANNOUNCE_SECONDS;
      return { type: "announce" };
    }
    if (this.phase === "dropping") return null;

    this.t -= dt;
    if (this.t > 0) return null;
    this.t += 1;
    this.count = this.phase === "announce" ? RAID_COUNT_FROM : this.count - 1;
    this.phase = "count";
    if (this.count > 0) return { type: "count", value: this.count };
    this.phase = "dropping";
    return { type: "drop" };
  }

  /** The parcel is on the track, so the next raid can be scheduled. */
  dropped(runTime) {
    this.phase = "waiting";
    this.at = runTime + nextRaidGap(this.rng);
  }
}

const multiplier = (value, seconds, weight, extra = {}) => ({
  id: `gift-x${value}`,
  tone: "good",
  theme: "christmas",
  icon: "🎁",
  label: `점수 ×${value}`,
  detail: `${seconds}초`,
  weight,
  effect: { type: "multiplier", value, seconds },
  ...extra,
});

const GIFT_SECONDS = 8;

/**
 * One hundred tickets, and every result that pays lasts the same eight seconds,
 * so the number on the face is the whole of what was won.
 *
 * In reel order, which has no effect on the odds. ×99 sits between the two most
 * common outcomes on purpose: about half of all spins come to rest with it right
 * beside the pointer, or crawl past it on the way, and that near thing is the
 * whole of the tease. The other big faces are spaced between small ones so a
 * slowing reel is always creeping up on something.
 */
export const CHRISTMAS_SLOT_FACES = [
  {
    id: "gift-miss",
    tone: "none",
    theme: "christmas",
    icon: "🧦",
    label: "꽝",
    detail: "다음 선물을 노려보세요!",
    weight: 10,
    effect: { type: "none" },
  },
  multiplier(12, GIFT_SECONDS, 5),
  multiplier(3, GIFT_SECONDS, 22),
  multiplier(99, GIFT_SECONDS, 1, { icon: "👑", jackpot: true }),
  multiplier(2, GIFT_SECONDS, 30),
  multiplier(20, GIFT_SECONDS, 3, { icon: "🌟" }),
  multiplier(5, GIFT_SECONDS, 15),
  multiplier(15, GIFT_SECONDS, 4),
  multiplier(10, GIFT_SECONDS, 10),
];

const isExtreme = (face) => face.jackpot || face.effect.type === "none";
const EXTREME_TICKETS = CHRISTMAS_SLOT_FACES.filter(isExtreme).reduce((sum, face) => sum + face.weight, 0);

/**
 * A face's tickets out of one hundred.
 *
 * `risk` is the 블랙 산타's perk: it multiplies the odds of both a miss and ×99,
 * and the faces in between shrink to make room, so "double" is exactly double.
 */
export function christmasTickets(face, risk = 1) {
  if (isExtreme(face)) return face.weight * risk;
  return (face.weight * (100 - EXTREME_TICKETS * risk)) / (100 - EXTREME_TICKETS);
}

/**
 * @param {() => number} rng
 * @param {number} [risk] see christmasTickets
 */
export function spinChristmas(rng = Math.random, risk = 1) {
  let ticket = rng() * 100;
  for (let index = 0; index < CHRISTMAS_SLOT_FACES.length; index++) {
    ticket -= christmasTickets(CHRISTMAS_SLOT_FACES[index], risk);
    if (ticket < 0) return { face: CHRISTMAS_SLOT_FACES[index], index };
  }
  const index = CHRISTMAS_SLOT_FACES.length - 1;
  return { face: CHRISTMAS_SLOT_FACES[index], index };
}

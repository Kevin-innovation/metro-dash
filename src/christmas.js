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

export const CHRISTMAS_TITLE = "메트로 대시 · 크리스마스 에디션";
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

const between = (rng, low, high) => low + Math.floor(rng() * (high - low + 1));

/** Seconds of play before a run's first gift. */
export function firstGiftAt(rng = Math.random) {
  return between(rng, GIFT_FIRST_MIN, GIFT_FIRST_MAX);
}

/** Seconds of play until the next gift after one has appeared. */
export function nextGiftGap(rng = Math.random) {
  return between(rng, GIFT_GAP_MIN, GIFT_GAP_MAX);
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

/** @param {() => number} rng */
export function spinChristmas(rng = Math.random) {
  const total = CHRISTMAS_SLOT_FACES.reduce((sum, face) => sum + face.weight, 0);
  let ticket = rng() * total;
  for (let index = 0; index < CHRISTMAS_SLOT_FACES.length; index++) {
    ticket -= CHRISTMAS_SLOT_FACES[index].weight;
    if (ticket < 0) return { face: CHRISTMAS_SLOT_FACES[index], index };
  }
  const index = CHRISTMAS_SLOT_FACES.length - 1;
  return { face: CHRISTMAS_SLOT_FACES[index], index };
}

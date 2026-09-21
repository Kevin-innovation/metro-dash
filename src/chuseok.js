/**
 * The 2026 Chuseok event.
 *
 * Kept pure: the browser, the spawner, the score validator and the tests all
 * need the same dates and wheel. Midnight KST is 15:00 UTC on the day before.
 */

export const CHUSEOK_EVENT_NAME = "한가위 달빛 축제";
export const CHUSEOK_EVENT_FROM = Date.UTC(2026, 8, 20, 15, 0, 0);
export const CHUSEOK_EVENT_TO = Date.UTC(2026, 9, 11, 15, 0, 0);

export function chuseokAt(ms = Date.now()) {
  return ms >= CHUSEOK_EVENT_FROM && ms < CHUSEOK_EVENT_TO;
}

export const CHUSEOK_MOON_FIRST_AT = 40;
export const CHUSEOK_MOON_GAP_MIN = 55;
export const CHUSEOK_MOON_GAP_MAX = 70;
export const CHUSEOK_MOON_MAX_PER_RUN = 2;

const multiplier = (value, seconds, weight) => ({
  id: `moon-x${value}`,
  tone: "good",
  theme: "chuseok",
  icon: "🌕",
  label: `점수 ×${value}`,
  detail: `${seconds}초`,
  weight,
  effect: { type: "multiplier", value, seconds },
});

/**
 * One hundred tickets exactly. The list contains every visible face once;
 * weights decide the draw, just like the diamond wheel.
 */
export const CHUSEOK_SLOT_FACES = [
  {
    id: "moon-miss",
    tone: "none",
    theme: "chuseok",
    icon: "🌙",
    label: "꽝",
    detail: "다음 보름달을 노려보세요!",
    weight: 15,
    effect: { type: "none" },
  },
  multiplier(10, 15, 30),
  multiplier(12, 14, 22),
  multiplier(15, 13, 15),
  multiplier(20, 12, 10),
  multiplier(25, 11, 5),
  multiplier(30, 10, 3),
];

export const CHUSEOK_TOP_MULTIPLIER = CHUSEOK_SLOT_FACES.reduce(
  (best, face) => Math.max(best, face.effect.value ?? 1),
  1,
);

export function chuseokTableTotal() {
  return CHUSEOK_SLOT_FACES.reduce((sum, face) => sum + face.weight, 0);
}

/** @param {() => number} rng */
export function spinChuseok(rng = Math.random) {
  let ticket = rng() * chuseokTableTotal();
  for (let index = 0; index < CHUSEOK_SLOT_FACES.length; index++) {
    ticket -= CHUSEOK_SLOT_FACES[index].weight;
    if (ticket < 0) return { face: CHUSEOK_SLOT_FACES[index], index };
  }
  const index = CHUSEOK_SLOT_FACES.length - 1;
  return { face: CHUSEOK_SLOT_FACES[index], index };
}

/** Seconds until the next moon after one has appeared. */
export function nextMoonGap(rng = Math.random) {
  return (
    CHUSEOK_MOON_GAP_MIN +
    Math.floor(rng() * (CHUSEOK_MOON_GAP_MAX - CHUSEOK_MOON_GAP_MIN + 1))
  );
}

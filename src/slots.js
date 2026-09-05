/**
 * The diamond wheel.
 *
 * Three diamonds stop the run and spin a wheel of thirty faces. It is the one
 * thing in the game that is not earned — every other reward is paid for by a
 * move the player made, and this one is paid for by having picked up three
 * things and is then decided by chance.
 *
 * That is the reason a fifth of the faces are bad. A wheel that can only help
 * is not a wheel, it is a delayed present: the player would take the third
 * diamond without a thought and watch an animation. Making the stop matter
 * both ways is what turns "collect three" into a decision — the third diamond
 * in front of a wall of buses is worth leaving where it is.
 *
 * Pure data and one draw. Everything that *happens* is interpreted by Game,
 * which owns the run, the store and the screen; this file only says what the
 * wheel landed on. That split is what lets the whole table be unit tested
 * without a renderer, and it is why the effects are descriptions rather than
 * callbacks.
 */

/** Diamonds that make a spin. */
export const DIAMOND_GOAL = 3;

/**
 * The largest score multiplier the wheel can grant.
 *
 * Exported because the server's run validator has to know it. Every multiplier
 * in the game is folded into one ceiling in leaderboard-rules.js, and a face
 * worth ten times that nothing told the validator about would put the best runs
 * in the game past the bound and off the board.
 */
export const SLOT_MAX_MULTIPLIER = 10;

/**
 * The wheel, in the order it is drawn.
 *
 * Ordered so the strip reads as a wheel rather than as a sorted list: the big
 * multipliers are spread out and every bad face has good ones either side of
 * it. A wheel with all the bad faces in a block is a wheel where the player
 * watches a pointer approach a danger zone, which is a different and much
 * worse feeling than a stop that could have been anything.
 *
 * `weight` is relative, not a percentage. Good faces come to about three
 * quarters of the wheel, bad to a fifth, and the blank to the rest.
 */
export const SLOT_FACES = [
  { id: "x2-20", tone: "good", icon: "✦", label: "점수 ×2", detail: "20초", weight: 10,
    effect: { type: "multiplier", value: 2, seconds: 20 } },
  { id: "magnet", tone: "good", icon: "🧲", label: "자석", detail: "25초", weight: 5,
    effect: { type: "powerup", id: "magnet", seconds: 25 } },
  { id: "crow", tone: "bad", icon: "🐦‍⬛", label: "까마귀", detail: "달라붙는다", weight: 4,
    effect: { type: "crow" } },
  { id: "coins-500", tone: "good", icon: "🪙", label: "코인 +500", detail: "즉시", weight: 5,
    effect: { type: "coins", amount: 500 } },
  { id: "x3-15", tone: "good", icon: "✦", label: "점수 ×3", detail: "15초", weight: 6,
    effect: { type: "multiplier", value: 3, seconds: 15 } },
  { id: "combo-40", tone: "good", icon: "🔥", label: "콤보 +40", detail: "즉시", weight: 4,
    effect: { type: "combo", amount: 40 } },
  { id: "half-12", tone: "bad", icon: "💧", label: "점수 ×0.5", detail: "12초", weight: 3,
    effect: { type: "multiplier", value: 0.5, seconds: 12 } },
  { id: "jetpack", tone: "good", icon: "🚀", label: "제트팩", detail: "15초", weight: 4,
    effect: { type: "powerup", id: "jetpack", seconds: 15 } },
  { id: "x5-10", tone: "good", icon: "✦", label: "점수 ×5", detail: "10초", weight: 3,
    effect: { type: "multiplier", value: 5, seconds: 10 } },
  { id: "board", tone: "good", icon: "🛹", label: "호버보드", detail: "1개", weight: 3,
    effect: { type: "item", id: "hoverboard" } },
  { id: "combo-reset", tone: "bad", icon: "💔", label: "콤보 초기화", detail: "", weight: 3,
    effect: { type: "comboReset" } },
  { id: "x2-30", tone: "good", icon: "✦", label: "점수 ×2", detail: "30초", weight: 7,
    effect: { type: "multiplier", value: 2, seconds: 30 } },
  { id: "sneakers", tone: "good", icon: "👟", label: "슈퍼 스니커즈", detail: "25초", weight: 4,
    effect: { type: "powerup", id: "sneakers", seconds: 25 } },
  { id: "blank", tone: "none", icon: "·", label: "꽝", detail: "아무 일도 없다", weight: 5,
    effect: { type: "none" } },
  { id: "coins-1500", tone: "good", icon: "🪙", label: "코인 +1,500", detail: "즉시", weight: 3,
    effect: { type: "coins", amount: 1500 } },
  { id: "x10-5", tone: "good", icon: "★", label: "점수 ×10", detail: "5초", weight: 2,
    effect: { type: "multiplier", value: 10, seconds: 5 } },
  { id: "strip", tone: "bad", icon: "🚫", label: "파워업 해제", detail: "전부", weight: 3,
    effect: { type: "clearPowerups" } },
  { id: "antidote", tone: "good", icon: "💊", label: "해독제", detail: "1개", weight: 3,
    effect: { type: "item", id: "antidote" } },
  { id: "double", tone: "good", icon: "✦", label: "점수 2배 파워업", detail: "25초", weight: 4,
    effect: { type: "powerup", id: "double", seconds: 25 } },
  { id: "coins-lose", tone: "bad", icon: "💸", label: "코인 -800", detail: "즉시", weight: 3,
    effect: { type: "coins", amount: -800 } },
  { id: "x3-20", tone: "good", icon: "✦", label: "점수 ×3", detail: "20초", weight: 4,
    effect: { type: "multiplier", value: 3, seconds: 20 } },
  { id: "cure", tone: "good", icon: "🕊️", label: "까마귀 면역", detail: "15초", weight: 3,
    effect: { type: "cure", seconds: 15 } },
  { id: "rush", tone: "bad", icon: "💨", label: "속도 급상승", detail: "12초", weight: 2,
    effect: { type: "speed", value: 1.18, seconds: 12 } },
  { id: "all-powerups", tone: "good", icon: "🎁", label: "파워업 전부", detail: "12초", weight: 2,
    effect: { type: "powerups", seconds: 12 } },
  { id: "x5-15", tone: "good", icon: "★", label: "점수 ×5", detail: "15초", weight: 2,
    effect: { type: "multiplier", value: 5, seconds: 15 } },
  { id: "blind", tone: "bad", icon: "🌫️", label: "시야 흐림", detail: "8초", weight: 2,
    effect: { type: "blind", seconds: 8 } },
  { id: "diamonds-2", tone: "good", icon: "💎", label: "다이아 2개", detail: "즉시", weight: 2,
    effect: { type: "diamonds", amount: 2 } },
  { id: "coins-3000", tone: "good", icon: "🪙", label: "코인 +3,000", detail: "즉시", weight: 1,
    effect: { type: "coins", amount: 3000 } },
  { id: "lose-item", tone: "bad", icon: "🕳️", label: "아이템 1개 분실", detail: "", weight: 1,
    effect: { type: "loseItem" } },
  { id: "x10-8", tone: "good", icon: "★", label: "점수 ×10", detail: "8초 · 잭팟", weight: 1,
    effect: { type: "multiplier", value: 10, seconds: 8 } },
];

/** Guards the one invariant the wheel has: the validator's ceiling is real. */
export const SLOT_TOP_MULTIPLIER = SLOT_FACES.reduce(
  (best, face) => (face.effect.type === "multiplier" ? Math.max(best, face.effect.value) : best),
  1,
);

const TOTAL_WEIGHT = SLOT_FACES.reduce((sum, face) => sum + face.weight, 0);

/**
 * Draw a face.
 *
 * Takes the run's own rng so a spin is part of the seeded run rather than a
 * separate roll — the same seed replays the same wheel, which is what lets the
 * fairness audit and the tests reason about a run at all.
 *
 * @param {() => number} rng
 * @returns {{ face: typeof SLOT_FACES[number], index: number }}
 */
export function spinSlots(rng = Math.random) {
  let ticket = rng() * TOTAL_WEIGHT;
  for (let index = 0; index < SLOT_FACES.length; index++) {
    ticket -= SLOT_FACES[index].weight;
    if (ticket < 0) return { face: SLOT_FACES[index], index };
  }
  // Only reachable on a floating-point edge; the last face is as good an
  // answer as any and is better than returning nothing.
  const index = SLOT_FACES.length - 1;
  return { face: SLOT_FACES[index], index };
}

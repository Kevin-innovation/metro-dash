/**
 * The diamond wheel.
 *
 * Three diamonds stop the run and spin a wheel of thirty faces. Every face is
 * a score multiplier: ×0 through ×10, plus ×0.5. Nothing else — no coins, no
 * crow, no hoverboard. The wheel is a score bet, and only a score bet.
 *
 * Two weight tables sit on each face. `weight` is what the weekly #1 draws
 * from (70% good, 10% ×1, 20% bad). `chase` is everyone else (95% good, 5%
 * bad). Same strip on screen; the pointer is what changes.
 */

export const DIAMOND_GOAL = 3;

export const SLOT_MAX_MULTIPLIER = 10;

const M = (id, value, seconds, tone, weight, chase) => ({
  id,
  tone,
  icon: value === 0 ? "⏹" : value < 1 ? "💧" : value === 1 ? "·" : "✦",
  label: value === 0 ? "점수 ×0" : `점수 ×${value}`,
  detail: value === 1 ? "그대로" : `${seconds}초`,
  weight,
  chase,
  effect: { type: "multiplier", value, seconds },
});

export const SLOT_FACES = [
  M("x2-20", 2, 20, "good", 8, 11),
  M("half-30", 0.5, 30, "bad", 6, 2),
  M("x3-15", 3, 15, "good", 6, 9),
  M("x1-a", 1, 1, "none", 3, 0),
  M("x4-12", 4, 12, "good", 4, 6),
  M("x10-5", 10, 5, "good", 2, 1),
  M("x2-25", 2, 25, "good", 7, 11),
  M("zero-12", 0, 12, "bad", 3, 1),
  M("x5-10", 5, 10, "good", 3, 4),
  M("x3-18", 3, 18, "good", 5, 8),
  M("x1-b", 1, 1, "none", 3, 0),
  M("x6-8", 6, 8, "good", 2, 3),
  M("half-20", 0.5, 20, "bad", 4, 1),
  M("x8-6", 8, 6, "good", 2, 1),
  M("x4-15", 4, 15, "good", 4, 5),
  M("x2-15", 2, 15, "good", 6, 10),
  M("zero-8", 0, 8, "bad", 2, 0),
  M("x7-8", 7, 8, "good", 2, 2),
  M("x5-12", 5, 12, "good", 3, 4),
  M("x1-c", 1, 1, "none", 2, 0),
  M("x9-6", 9, 6, "good", 1, 1),
  M("x3-12", 3, 12, "good", 5, 7),
  M("half-15", 0.5, 15, "bad", 3, 1),
  M("x4-10", 4, 10, "good", 3, 5),
  M("x8-8", 8, 8, "good", 1, 1),
  M("x5-8", 5, 8, "good", 3, 3),
  M("zero-10", 0, 10, "bad", 2, 0),
  M("x6-10", 6, 10, "good", 2, 2),
  M("x1-d", 1, 1, "none", 2, 0),
  M("x10-8", 10, 8, "good", 1, 1),
];

export const SLOT_TOP_MULTIPLIER = SLOT_FACES.reduce(
  (best, face) => (face.effect.type === "multiplier" ? Math.max(best, face.effect.value) : best),
  1,
);

function tableTotal(chase) {
  const key = chase ? "chase" : "weight";
  return SLOT_FACES.reduce((sum, face) => sum + (face[key] ?? 0), 0);
}

/**
 * Draw a face.
 *
 * `chase` is everyone who is not weekly #1. Their table is 95% good.
 *
 * @param {() => number} rng
 * @param {{ chase?: boolean }} [opts]
 */
export function spinSlots(rng = Math.random, opts = {}) {
  const chase = !!opts.chase;
  const key = chase ? "chase" : "weight";
  const total = tableTotal(chase);
  let ticket = rng() * total;
  for (let index = 0; index < SLOT_FACES.length; index++) {
    ticket -= SLOT_FACES[index][key] ?? 0;
    if (ticket < 0) return { face: SLOT_FACES[index], index };
  }
  const index = SLOT_FACES.length - 1;
  return { face: SLOT_FACES[index], index };
}

export function slotTableTotal(chase = false) {
  return tableTotal(chase);
}

/**
 * The diamond wheel.
 *
 * Three diamonds stop the run and spin a wheel of thirty faces. Every face is
 * a score multiplier: ×0 through ×10, plus ×0.5. Nothing else — no coins, no
 * crow, no hoverboard. The wheel is a score bet, and only a score bet.
 *
 * One table, the same for everyone, and every face on it reachable.
 *
 * There used to be two: whoever was top of the weekly board drew from a
 * harsher one — 70% good against 95%, and ×0 seven times in a hundred spins
 * against one. The intent was to keep a board from running away from the rest
 * of the school, and it does not do that. It cannot: a score already posted is
 * not touched, so the penalty never pulls anyone back. All it does is tax the
 * person who is winning, in the game, while they are playing it, on a roll they
 * cannot see the odds of — and 「점수 ×0」 at the top of a good run is the
 * harshest thing in the game to be handed for having done well.
 *
 * If the board ever needs flattening, it gets flattened in the board — with a
 * weekly reset, a season, a per-school ranking. All three exist. None of them
 * take the game away from a player mid-run.
 *
 * Six faces went with the second table. They were the ones only the leader's
 * wheel could land on — four 「그대로」 and two more 「점수 ×0」 — and with that
 * wheel gone they were slots nobody could ever stop at. A reel that shows an
 * outcome it cannot produce is telling the player something untrue about the
 * bet they are taking, and the odds for everyone who was not leading are
 * exactly what they were.
 */

export const DIAMOND_GOAL = 3;

export const SLOT_MAX_MULTIPLIER = 10;

const M = (id, value, seconds, tone, weight) => ({
  id,
  tone,
  icon: value === 0 ? "⏹" : value < 1 ? "💧" : value === 1 ? "·" : "✦",
  label: value === 0 ? "점수 ×0" : `점수 ×${value}`,
  detail: value === 1 ? "그대로" : `${seconds}초`,
  weight,
  effect: { type: "multiplier", value, seconds },
});

export const SLOT_FACES = [
  M("x2-20", 2, 20, "good", 11),
  M("half-30", 0.5, 30, "bad", 2),
  M("x3-15", 3, 15, "good", 9),
  M("x4-12", 4, 12, "good", 6),
  M("x10-5", 10, 5, "good", 1),
  M("x2-25", 2, 25, "good", 11),
  M("zero-12", 0, 12, "bad", 1),
  M("x5-10", 5, 10, "good", 4),
  M("x3-18", 3, 18, "good", 8),
  M("x6-8", 6, 8, "good", 3),
  M("half-20", 0.5, 20, "bad", 1),
  M("x8-6", 8, 6, "good", 1),
  M("x4-15", 4, 15, "good", 5),
  M("x2-15", 2, 15, "good", 10),
  M("x7-8", 7, 8, "good", 2),
  M("x5-12", 5, 12, "good", 4),
  M("x9-6", 9, 6, "good", 1),
  M("x3-12", 3, 12, "good", 7),
  M("half-15", 0.5, 15, "bad", 1),
  M("x4-10", 4, 10, "good", 5),
  M("x8-8", 8, 8, "good", 1),
  M("x5-8", 5, 8, "good", 3),
  M("x6-10", 6, 10, "good", 2),
  M("x10-8", 10, 8, "good", 1),
];

export const SLOT_TOP_MULTIPLIER = SLOT_FACES.reduce(
  (best, face) => (face.effect.type === "multiplier" ? Math.max(best, face.effect.value) : best),
  1,
);

function tableTotal() {
  return SLOT_FACES.reduce((sum, face) => sum + (face.weight ?? 0), 0);
}

/**
 * Draw a face.
 *
 * @param {() => number} rng
 */
export function spinSlots(rng = Math.random) {
  const total = tableTotal();
  let ticket = rng() * total;
  for (let index = 0; index < SLOT_FACES.length; index++) {
    ticket -= SLOT_FACES[index].weight ?? 0;
    if (ticket < 0) return { face: SLOT_FACES[index], index };
  }
  const index = SLOT_FACES.length - 1;
  return { face: SLOT_FACES[index], index };
}

export function slotTableTotal() {
  return tableTotal();
}

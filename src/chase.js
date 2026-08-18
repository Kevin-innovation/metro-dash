/**
 * The pursuer.
 *
 * Until now a run had exactly one failure: you touched something and it ended.
 * There was no state between "fine" and "over", so nothing could build, and
 * nothing the player did well had any consequence beyond the score.
 *
 * The chaser is a second, *recoverable* failure. It drifts closer the longer a
 * run goes on, and the only way to push it back is to take risks — squeezing
 * past obstacles and riding roofs. That deliberately reuses the near-miss
 * system, which already rewards cutting it fine but only ever paid out points.
 * Now it pays out survival.
 *
 * Pure: metres and seconds, no meshes. game.js renders whatever `gap` says.
 */

/** How far back the pursuer sits when the player is doing everything right. */
export const GAP_MAX = 30;

/** Under this it is close enough to see clearly and worth warning about. */
export const GAP_WARN = 14;

/** Metres per second the gap recovers when nothing has gone wrong. */
export const RECOVER_RATE = 1.9;

/**
 * Metres per second the gap closes at full pressure.
 *
 * Below the recovery rate on purpose: clean running always gains ground, so the
 * chaser is a consequence of mistakes rather than a timer nobody can beat.
 */
export const DRIFT_RATE = 3.1;

/** Ground lost to a hit the hoverboard absorbed. */
export const STUMBLE_COST = 13;

/** Ground regained by a single near miss. */
export const NEAR_MISS_GAIN = 3.4;

/** Metres per second regained while riding a roof, which is its own risk. */
export const ROOF_RATE = 2.6;

/**
 * Where the pursuer is, as a plain object so the caller owns the state.
 *
 * `gap` is metres behind the player. Zero means caught.
 */
export function createChase() {
  return { gap: GAP_MAX, caught: false, closest: GAP_MAX };
}

/**
 * Advance one step.
 *
 * @param {object} chase        state from createChase
 * @param {number} dt           seconds
 * @param {object} input
 * @param {number} input.pressure  0..1, how wound up the run is
 * @param {boolean} input.onRoof   riding a train or bus roof
 * @returns {object} the same object, mutated
 */
export function stepChase(chase, dt, { pressure = 0, onRoof = false } = {}) {
  if (chase.caught || !(dt > 0)) return chase;

  // Pressure is what makes a long run dangerous rather than merely fast: early
  // on the chaser cannot gain at all, and it only ever gains on a player who is
  // not earning ground back.
  const closing = DRIFT_RATE * clamp01(pressure);
  const opening = RECOVER_RATE + (onRoof ? ROOF_RATE : 0);

  chase.gap = Math.min(GAP_MAX, chase.gap + (opening - closing) * dt);
  if (chase.gap <= 0) {
    chase.gap = 0;
    chase.caught = true;
  }
  chase.closest = Math.min(chase.closest, chase.gap);
  return chase;
}

/** A hit the board absorbed: survived, but it cost ground. */
export function stumble(chase) {
  if (chase.caught) return chase;
  chase.gap = Math.max(0, chase.gap - STUMBLE_COST);
  if (chase.gap <= 0) chase.caught = true;
  chase.closest = Math.min(chase.closest, chase.gap);
  return chase;
}

/** A near miss: the reward for cutting it fine is breathing room. */
export function evade(chase, count = 1) {
  if (chase.caught) return chase;
  chase.gap = Math.min(GAP_MAX, chase.gap + NEAR_MISS_GAIN * count);
  return chase;
}

/** 0 when safely ahead, 1 the moment before being caught. */
export function threat(chase) {
  return clamp01(1 - chase.gap / GAP_WARN);
}

export function isWarning(chase) {
  return chase.gap < GAP_WARN;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

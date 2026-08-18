/**
 * Continuous (swept) collision helpers.
 *
 * The runner covers up to ~0.8 units per simulation step at top speed, while a
 * barrier is only 0.55 units deep. Sampling a single end-of-step position lets
 * the player skip straight over thin obstacles, so every test below works on the
 * interval a body sweeps during the step rather than on where it ended up.
 *
 * All functions are pure and take plain numbers so they can be unit tested
 * without a renderer.
 */

/** Half-width of the lane window an obstacle occupies. */
export const LANE_TOLERANCE = 0.95;

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Portion of a step (t in 0..1) during which the relative Z gap sits inside
 * ±depth. `dPrev` / `dCur` are `player.z - item.z` at the start and end of the
 * step, so obstacles that move during the step are handled too.
 *
 * @returns {{ hit: boolean, t0: number, t1: number }}
 */
export function sweepWindow(dPrev, dCur, depth) {
  const delta = dCur - dPrev;

  if (Math.abs(delta) < 1e-9) {
    const inside = Math.abs(dPrev) <= depth;
    return { hit: inside, t0: 0, t1: inside ? 1 : 0 };
  }

  const ta = (-depth - dPrev) / delta;
  const tb = (depth - dPrev) / delta;
  const t0 = Math.max(0, Math.min(ta, tb));
  const t1 = Math.min(1, Math.max(ta, tb));

  if (t0 > t1) return { hit: false, t0: 0, t1: 0 };
  return { hit: true, t0, t1 };
}

/** Inclusive overlap between a body's vertical span and an obstacle band. */
export function bandsOverlap(low, high, minY, maxY) {
  return high >= minY && low <= maxY;
}

/**
 * @typedef {{ x: number, y: number, z: number, height: number }} Body
 * @typedef {{ x: number, z: number, prevZ: number, depth: number,
 *             minY: number, maxY: number }} Obstacle
 */

/**
 * Swept test between a player capsule and an obstacle over one step.
 *
 * The Z axis is solved analytically; lane and height are then sampled at a few
 * points inside the resulting window, which keeps a rising jump from being
 * counted as a hit just because the step *started* below the obstacle.
 *
 * @param {Body} prev player state at the start of the step
 * @param {Body} cur player state at the end of the step
 * @param {Obstacle} item
 * @param {{ laneTolerance?: number, padY?: number, samples?: number }} [opts]
 * @returns {{ hit: boolean, t: number }}
 */
export function sweptHit(prev, cur, item, opts = {}) {
  const tolerance = opts.laneTolerance ?? LANE_TOLERANCE;
  const padY = opts.padY ?? 0;
  const samples = Math.max(2, opts.samples ?? 3);

  const window = sweepWindow(prev.z - item.prevZ, cur.z - item.z, item.depth);
  if (!window.hit) return { hit: false, t: 0 };

  for (let i = 0; i < samples; i++) {
    const t = window.t0 + ((window.t1 - window.t0) * i) / (samples - 1);
    const x = lerp(prev.x, cur.x, t);
    if (Math.abs(x - item.x) >= tolerance) continue;

    const y = lerp(prev.y, cur.y, t);
    const height = lerp(prev.height, cur.height, t);
    if (!bandsOverlap(y + padY, y + height - padY, item.minY, item.maxY)) continue;

    return { hit: true, t };
  }

  return { hit: false, t: 0 };
}

/**
 * Classify how the runner got past an obstacle, once its Z has been crossed.
 *
 * A clean dodge into a far lane is not interesting; squeaking past the edge of
 * an obstacle, or clearing one by a hair, is what earns the bonus.
 *
 * @param {Body} player
 * @param {Obstacle & { minY: number, maxY: number }} item
 * `lateDodge` covers the case a lateral measurement cannot: a lane change
 * settles in under 0.2s, so by the time an obstacle is crossed the runner is
 * already fully in the next lane. Whether the swerve was late is the only thing
 * that distinguishes a hair's-breadth escape from a lazy early dodge.
 *
 * @param {{ laneRange: number, heightRange: number, laneTolerance?: number,
 *           padY?: number, lateDodge?: boolean }} opts
 * @returns {"lane" | "over" | "under" | null}
 */
export function nearMiss(player, item, opts) {
  const tolerance = opts.laneTolerance ?? LANE_TOLERANCE;
  // Must match the padding used by sweptHit, or the tightest clearances land in
  // a dead zone: survived the collision test, but too low to count as a miss.
  const padY = opts.padY ?? 0;
  const lateral = Math.abs(player.x - item.x);

  if (lateral >= tolerance) {
    if (lateral < opts.laneRange) return "lane";
    return opts.lateDodge ? "lane" : null;
  }

  // Same lane, so it must have been cleared vertically.
  const above = player.y + padY - item.maxY;
  if (above >= 0 && above < opts.heightRange) return "over";

  const below = item.minY - (player.y + player.height - padY);
  if (below >= 0 && below < opts.heightRange) return "under";

  return null;
}

/**
 * Frame-rate independent smoothing factor.
 *
 * `value += (target - value) * approach(rate, dt)` converges at the same real
 * time rate regardless of step size, unlike the `rate * dt` shorthand.
 */
export function approach(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Per-run randomness, seeded.
 *
 * The run used to be the same run every time: the tunnel at 34 seconds, the
 * coin rush at 42, the jetpack on the fifth power-up drop, a crow egg every
 * seventeenth pattern. None of that was a bug — it was written that way so two
 * players' scores measured the same thing — but a schedule that never moves is
 * a schedule that can be learned, and once it is learned the run stops being
 * played and starts being recited.
 *
 * Seeded rather than free: `Math.random()` scattered through the schedule would
 * make a run impossible to reproduce, and the fairness audit, the tests and any
 * bug report all need to be able to replay one exactly. One number describes a
 * whole run's layout.
 */

/**
 * mulberry32. Small, fast, and good enough for deciding which minute the
 * tunnel starts — this is not cryptography and does not pretend to be.
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a fresh run. */
export function randomSeed() {
  return (Math.random() * 0x100000000) >>> 0;
}

/**
 * Fisher-Yates, on a copy.
 *
 * Shuffling rather than sampling is the whole trick behind keeping this fair:
 * a shuffled deck still deals every card exactly once per pass, so over a run
 * everyone meets the same sections and the same power-ups the same number of
 * times. Only the order moves.
 */
export function shuffled(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** A number in ±spread. */
export function jitter(rng, spread) {
  return (rng() * 2 - 1) * spread;
}

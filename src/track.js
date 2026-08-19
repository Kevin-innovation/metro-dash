/**
 * The shape of the line.
 *
 * The simulation is one-dimensional: the runner moves along Z and picks one of
 * three fixed lane positions in X. Nothing here changes that. What this does is
 * decide where a given point on the track is *drawn*, as a pure function of its
 * distance down the line — so the world can sweep left and right while every
 * collision, lane change and jump behaves exactly as it did on a straight track.
 *
 * That separation is the whole design. A curve that altered the physics would
 * mean re-deriving swept collision on a curved frame; a curve that is only a
 * drawing offset cannot break a single existing test.
 *
 * Kept free of Three.js so the shape can be checked on its own.
 */

/**
 * Two waves whose periods share no common factor, so the line never visibly
 * repeats over a run. The long one carries the sweep; the short one keeps it
 * from reading as a single lazy S.
 *
 * The periods are deliberately shorter than the distance the player can see.
 * A gentler curve is invisible: with a period much longer than the sight line
 * the track ahead barely moves across the frame, and the whole thing reads as
 * straight however far it has actually wandered.
 */
const WAVES = [
  { amplitude: 11, period: 78 },
  { amplitude: 3.5, period: 37 },
];

/**
 * Metres of dead-straight track at the start of a run.
 *
 * The opening seconds teach the controls, and a line that is already leaning
 * makes it harder to tell a lane change from the track moving. The bend eases
 * in over the following stretch rather than switching on.
 */
export const STRAIGHT_FOR = 70;
const EASE_OVER = 90;

/** 0 while the track is straight, 1 once the bend is at full strength. */
export function bendStrength(z) {
  if (z <= STRAIGHT_FOR) return 0;
  const k = Math.min(1, (z - STRAIGHT_FOR) / EASE_OVER);
  // Smoothstep: starts and ends flat, so there is no crease where it begins.
  return k * k * (3 - 2 * k);
}

/**
 * How far the track has swung sideways at this distance down the line.
 *
 * @param {number} z metres along the track
 * @returns {number} metres to add to the drawn X of anything at that Z
 */
export function bendX(z) {
  const strength = bendStrength(z);
  if (strength === 0) return 0;
  let x = 0;
  for (const wave of WAVES) x += wave.amplitude * Math.sin(z / wave.period);
  return x * strength;
}

/**
 * Rate of change of the sideways offset — the tangent of the line's heading.
 *
 * Used to turn objects to face along the track. Differentiated analytically
 * rather than sampled, so it stays exact at any speed and never chatters.
 */
export function bendSlope(z) {
  const strength = bendStrength(z);
  if (strength === 0) return 0;

  let x = 0;
  let dx = 0;
  for (const wave of WAVES) {
    x += wave.amplitude * Math.sin(z / wave.period);
    dx += (wave.amplitude / wave.period) * Math.cos(z / wave.period);
  }

  // Product rule: the ease-in is itself a function of z.
  const dStrength = bendStrengthSlope(z);
  return dx * strength + x * dStrength;
}

function bendStrengthSlope(z) {
  if (z <= STRAIGHT_FOR || z >= STRAIGHT_FOR + EASE_OVER) return 0;
  const k = (z - STRAIGHT_FOR) / EASE_OVER;
  return (6 * k * (1 - k)) / EASE_OVER;
}

/** Heading of the track at this point, in radians. */
export function bendYaw(z) {
  return Math.atan(bendSlope(z));
}

/**
 * How far the drawn track can stray from the straight line it is simulated on.
 *
 * Everything is offset by the same amount at the same Z, so the runner stays
 * centred no matter how large this is — but the scenery either side is placed
 * in world space, so a bend far wider than the corridor would walk the track
 * out through the buildings.
 */
export const MAX_BEND = WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);

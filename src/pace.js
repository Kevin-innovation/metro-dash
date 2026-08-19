import {
  CRUISE_SPEED,
  LATE_PRESSURE_AT,
  MAX_SPEED,
  PRESSURE_FULL_AT,
  PRESSURE_STARTS_AT,
  REACTION_EASY,
  REACTION_HARD,
  REACTION_LATE,
  START_SPEED,
} from "./config.js";

/**
 * Run pacing.
 *
 * Speed and *pressure* are deliberately separate. Speed tops out, because past
 * a point the runner outruns its own sight lines and obstacles arrive before
 * they can be read. Pressure — how much time the player gets to decide — keeps
 * tightening for far longer, and that is what actually makes a run hard.
 */
export const PHASES = [
  { id: 0, t: 0, name: "START", toast: null },
  { id: 1, t: 16, name: "WARM UP", toast: "속도 상승!" },
  { id: 2, t: 34, name: "RUSH", toast: "더 빠르게!" },
  { id: 3, t: 56, name: "INTENSE", toast: "정신 집중!" },
  { id: 4, t: 84, name: "MAX", toast: "MAX SPEED" },
  { id: 5, t: 130, name: "OVERDRIVE", toast: "밀도 상승!" },
  { id: 6, t: 190, name: "CHAOS", toast: "쉴 틈 없다!" },
  // Past this point speed and pressure have both topped out, so the run used to
  // become the same minute repeating forever — hardest on the players who got
  // there, which is backwards. These bring new layouts rather than new numbers:
  // `weightAt` keeps handing more of the pile to the gauntlets, and the two
  // rows below unlock the sections built for exactly this stretch.
  { id: 7, t: 250, name: "SURGE", toast: "한계 돌파!" },
  { id: 8, t: 330, name: "MAYHEM", toast: "여기서부터는 기록이다" },
];

export function phaseAt(t) {
  let current = PHASES[0];
  for (const phase of PHASES) if (t >= phase.t) current = phase;
  return current;
}

export function speedAt(t) {
  if (t <= 0) return START_SPEED;
  // Steep to begin with and easing off, rather than the old even climb: the
  // first ten seconds are where a player decides whether this is a game about
  // running, and 16m/s does not answer that question.
  if (t < 12) return START_SPEED + t * 0.75;
  if (t < 30) return 29 + (t - 12) * 0.4;
  if (t < 60) return 36.2 + (t - 30) * 0.24;
  const cruise = Math.min(CRUISE_SPEED, 43.4 + (t - 60) * 0.14);
  if (t <= LATE_PRESSURE_AT) return cruise;
  // A creep rather than a climb — 50 to 56 over four minutes. Small enough that
  // the sight lines still work, large enough that the layouts a player has
  // learned start arriving before they are ready for them.
  return Math.min(MAX_SPEED, CRUISE_SPEED + (t - LATE_PRESSURE_AT) * 0.025);
}

/**
 * How wound up the run is, 0..1.
 *
 * Runs past PRESSURE_FULL_AT stay at 1 rather than continuing to tighten —
 * beyond that the layouts would stop being clearable at all.
 */
export function pressureAt(t) {
  const span = PRESSURE_FULL_AT - PRESSURE_STARTS_AT;
  if (span <= 0) return 1;
  const linear = Math.min(1, Math.max(0, (t - PRESSURE_STARTS_AT) / span));
  // Front-loaded. A straight line spent its first minute barely moving, which
  // is the minute that decides whether anyone plays a second run.
  return linear ** 0.72;
}

/** Seconds of track the spawner leaves between patterns at time `t`. */
export function reactionAt(t) {
  const base = REACTION_EASY + (REACTION_HARD - REACTION_EASY) * pressureAt(t);
  if (t <= LATE_PRESSURE_AT) return base;
  // Past the first ramp the gap keeps closing, just far more slowly. Without
  // this the run stopped getting harder at exactly the point most players stop
  // improving, which is the wrong way round.
  const late = Math.min(1, (t - LATE_PRESSURE_AT) / 240);
  return REACTION_HARD + (REACTION_LATE - REACTION_HARD) * late;
}

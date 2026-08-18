import {
  MAX_SPEED,
  PRESSURE_FULL_AT,
  PRESSURE_STARTS_AT,
  REACTION_EASY,
  REACTION_HARD,
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
];

export function phaseAt(t) {
  let current = PHASES[0];
  for (const phase of PHASES) if (t >= phase.t) current = phase;
  return current;
}

export function speedAt(t) {
  if (t <= 0) return START_SPEED;
  if (t < 16) return START_SPEED + t * 0.28;
  if (t < 34) return 20.5 + (t - 16) * 0.36;
  if (t < 56) return 27 + (t - 34) * 0.36;
  if (t < 84) return 35 + (t - 56) * 0.29;
  return Math.min(MAX_SPEED, 43 + (t - 84) * 0.16);
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
  return Math.min(1, Math.max(0, (t - PRESSURE_STARTS_AT) / span));
}

/** Seconds of track the spawner leaves between patterns at time `t`. */
export function reactionAt(t) {
  return REACTION_EASY + (REACTION_HARD - REACTION_EASY) * pressureAt(t);
}

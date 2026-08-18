import { MAX_SPEED, START_SPEED } from "./config.js";

/**
 * Run pacing: how fast the world scrolls and how much reaction time the spawner
 * grants, as a function of elapsed run time.
 *
 * `reaction` is the number of seconds of travel the spawner leaves between
 * patterns at the current speed.
 */
export const PHASES = [
  { id: 0, t: 0, name: "START", toast: null, reaction: 1.36 },
  { id: 1, t: 16, name: "WARM UP", toast: "속도 상승!", reaction: 1.12 },
  { id: 2, t: 34, name: "RUSH", toast: "더 빠르게!", reaction: 0.94 },
  { id: 3, t: 56, name: "INTENSE", toast: "정신 집중!", reaction: 0.8 },
  { id: 4, t: 84, name: "MAX", toast: "MAX SPEED", reaction: 0.68 },
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

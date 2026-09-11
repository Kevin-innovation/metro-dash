import {
  CRUISE_SPEED,
  ONCOMING_SPEED,
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
/**
 * The phases, and the score each one lands on.
 *
 * The run is built around four numbers now — 20만 · 30만 · 40만 · 50만 — and
 * the seconds below are where a run that is going well crosses them. The tail
 * used to run to five and a half minutes, which put 50만 barely past the middle
 * of the ramp: a player was told the game had topped out and then spent three
 * more minutes on the same minute. The whole ladder is climbed inside two and a
 * half minutes now, so the milestones and the difficulty land together.
 *
 * The scores in the comments are an ordinary run. Somebody riding every roof
 * gets there sooner, which is the intended shape: play better and the game
 * comes at you harder, rather than paying you to survive the same track.
 */
export const PHASES = [
  { id: 0, t: 0, name: "START", toast: null },
  { id: 1, t: 16, name: "WARM UP", toast: "속도 상승!" },
  { id: 2, t: 34, name: "RUSH", toast: "더 빠르게!" },
  // 20만 is crossed in here, around a minute in.
  { id: 3, t: 56, name: "INTENSE", toast: "정신 집중!" },
  // 30만. Speed has topped out; from here only the spacing tightens.
  { id: 4, t: 78, name: "MAX", toast: "MAX SPEED" },
  // 40만.
  { id: 5, t: 90, name: "OVERDRIVE", toast: "밀도 상승!" },
  // 50만. The wall.
  { id: 6, t: 102, name: "CHAOS", toast: "쉴 틈 없다!" },
  // Past this point speed and pressure have both topped out, so the run used to
  // become the same minute repeating forever — hardest on the players who got
  // there, which is backwards. These bring new layouts rather than new numbers:
  // `weightAt` keeps handing more of the pile to the gauntlets, and the two
  // rows below unlock the sections built for exactly this stretch.
  { id: 7, t: 120, name: "SURGE", toast: "한계 돌파!" },
  { id: 8, t: 142, name: "MAYHEM", toast: "여기서부터는 기록이다" },
];

export function phaseAt(t) {
  let current = PHASES[0];
  for (const phase of PHASES) if (t >= phase.t) current = phase;
  return current;
}

/**
 * How long the runner holds one speed before the next step up.
 *
 * The curve below was drawn as a continuous ramp, and a continuous ramp is a
 * thing nobody can feel: the runner is a hair faster every frame and there is
 * never a moment where anything happened. Cut into ten-second steps it is the
 * same curve — every step reads it at the second that step begins — but now
 * getting faster is an event. The gauge over the score ticks, the world lurches
 * and the player knows a new speed arrived rather than suspecting one did.
 *
 * Ten seconds is short enough that the first minute has six of them and long
 * enough that a step is a stretch of track rather than a flicker.
 */
export const SPEED_STEP_SECONDS = 10;

/** Which step of the run `t` falls in. 0 is the first ten seconds. */
export function speedStepAt(t) {
  return Math.max(0, Math.floor((Number(t) || 0) / SPEED_STEP_SECONDS));
}

/** Seconds until the next step up, for the gauge. */
export function nextStepIn(t) {
  const elapsed = Math.max(0, Number(t) || 0);
  return SPEED_STEP_SECONDS - (elapsed % SPEED_STEP_SECONDS);
}

/**
 * The ramp the steps are cut from.
 *
 * Kept continuous and kept private: everything in the game reads speedAt, so
 * there is exactly one place that decides the runner is between steps and it
 * is not spread across the spawner, the validator and three callers in Game.
 */
function speedCurve(t) {
  if (t <= 0) return START_SPEED;
  // Steep to begin with and easing off, rather than the old even climb: the
  // first ten seconds are where a player decides whether this is a game about
  // running, and 16m/s does not answer that question.
  if (t < 20) return START_SPEED + t * 0.45;
  if (t < 50) return 29 + (t - 20) * 0.28;
  // The back two segments were drawn to reach cruise at three minutes. They
  // reach it just before 50만 now, which is the same curve read against the
  // compressed ramp rather than a steeper one bolted onto the old timings —
  // the shape, and every metre of sight line it was drawn for, is unchanged.
  if (t < 80) return 37.4 + (t - 50) * 0.2133;
  const cruise = Math.min(CRUISE_SPEED, 43.8 + (t - 80) * 0.248);
  if (t <= LATE_PRESSURE_AT) return cruise;
  // A creep rather than a climb — 50 to 56. Small enough that the sight lines
  // still work, large enough that the layouts a player has learned start
  // arriving before they are ready for them.
  return Math.min(MAX_SPEED, CRUISE_SPEED + (t - LATE_PRESSURE_AT) * 0.05);
}

/**
 * The speed the run is asking for at time `t`, on the step it is standing on.
 *
 * Everything reads this: Game drives the runner towards it, the spawner spaces
 * layouts by it, and the leaderboard integrates it to bound how far a run could
 * possibly have gone. One stepped curve, so none of them can disagree about
 * how fast the track was moving.
 */
export function speedAt(t) {
  return speedCurve(speedStepAt(t) * SPEED_STEP_SECONDS);
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

/**
 * How fast a bus coming the other way travels at a given phase.
 *
 * Lives here rather than in Game because the spawner has to know it to work out
 * where the runner will meet one, and the fairness audit has to know it to
 * check the answer. Three readers, one number.
 */
export function oncomingSpeedAt(phaseId) {
  return ONCOMING_SPEED + (9 + Math.max(0, phaseId) * 1.4) * 0.2;
}

/** Seconds of track the spawner leaves between patterns at time `t`. */
export function reactionAt(t) {
  const base = REACTION_EASY + (REACTION_HARD - REACTION_EASY) * pressureAt(t);
  if (t <= LATE_PRESSURE_AT) return base;
  // Past the first ramp the gap keeps closing, just far more slowly. Without
  // this the run stopped getting harder at exactly the point most players stop
  // improving, which is the wrong way round.
  const late = Math.min(1, (t - LATE_PRESSURE_AT) / 120);
  return REACTION_HARD + (REACTION_LATE - REACTION_HARD) * late;
}

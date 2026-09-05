/**
 * Difficulty tiers, driven by the score rather than by the clock.
 *
 * The phases in pace.js ask "how long has this run been going", and that turned
 * out to be the wrong question. Speed tops out at 420 seconds and the pattern
 * mix stopped moving at 190, so past the seven minute mark the run was the same
 * minute repeating — hardest on nobody, and unbounded in score for anyone with
 * the patience to sit in it. The board stopped measuring skill and started
 * measuring attention span.
 *
 * A tier asks the better question: how well is this run going? A strong player
 * banks points quickly and meets the wall early; a beginner running the same
 * four minutes never reaches the first tier at all and is left alone. The
 * difficulty follows the player rather than the stopwatch.
 *
 * It is also a brake on the score itself. Every tier makes the next tier more
 * expensive to reach, so the top of the board compresses towards the players
 * rather than running away with whoever had the longest afternoon.
 */

/** Points before the first tier bites. Below this the run is untouched. */
export const TIER_STARTS_AT = 50000;
/** Points between tiers after the first. */
export const TIER_STEP = 25000;
/**
 * Where the ladder stops.
 *
 * Not because the score does — a run is still endless and a good enough player
 * still climbs past this — but because the pattern table has a hardest layout
 * and pretending otherwise would only keep re-weighting a pile that has already
 * given everything it has.
 */
export const MAX_TIER = 12;

/**
 * How much of the pile each tier hands to the demanding layouts.
 *
 * Applied per tier, so the mix keeps moving rather than saturating the way
 * `weightAt` did at phase six.
 */
export const TIER_HARD_GAIN = 0.35;
/** And how much it takes away from the layouts that ask for one input. */
export const TIER_EASY_FADE = 0.12;
/** Easy layouts never disappear entirely: a run with no let-up is unreadable. */
export const TIER_EASY_FLOOR = 0.3;

/**
 * The extra pull the tier layouts get, on top of the generic hard scaling.
 *
 * Without it they were capped around a fifth of the pile however far a run
 * climbed: five layouts of weight one against twenty-nine others, all scaled by
 * the same number. The whole difference between tier six and tier twelve came
 * out to a 1.46x change in how demanding the average draw was, when the design
 * called for something closer to three. These are the layouts the tiers exist
 * to deal, so they are the ones the tier actually moves.
 */
export const TIER_PATTERN_GAIN = 0.85;

/**
 * How far the clock alone may push the mix towards the demanding layouts.
 *
 * The phases used to carry the drift the whole way, which put the pile at 72%
 * gauntlets by seven minutes no matter how the run was actually going — and
 * left the tiers nothing to add. It also had it backwards: a player who has
 * been running for seven minutes on thirty thousand points is having a hard
 * time already, and the clock was answering that by handing them the hardest
 * pile in the game. The clock now carries roughly half, and the score carries
 * the rest.
 */
export const PHASE_LATE_REACH = 0.55;

/**
 * The tier a run has reached.
 *
 * @param {number} baseScore points *before* any multiplier — see `Run.baseScore`
 */
export function tierAt(baseScore) {
  const score = Number(baseScore) || 0;
  if (score < TIER_STARTS_AT) return 0;
  return Math.min(MAX_TIER, 1 + Math.floor((score - TIER_STARTS_AT) / TIER_STEP));
}

/** Points at which `tier` begins, for the HUD and the tests. */
export function tierThreshold(tier) {
  if (tier <= 0) return 0;
  return TIER_STARTS_AT + TIER_STEP * (tier - 1);
}

/** How far into the current tier a run is, 0..1. For the HUD meter. */
export function tierProgress(baseScore) {
  const score = Number(baseScore) || 0;
  const tier = tierAt(score);
  if (tier >= MAX_TIER) return 1;
  const from = tier === 0 ? 0 : tierThreshold(tier);
  const to = tierThreshold(tier + 1);
  return Math.min(1, Math.max(0, (score - from) / (to - from)));
}

/** Copies a demanding layout gets in the draw pile at this tier. */
export function hardWeightScale(tier) {
  return 1 + TIER_HARD_GAIN * Math.max(0, Math.min(MAX_TIER, tier));
}

/** And what is left of an undemanding one. */
export function easyWeightScale(tier) {
  const faded = 1 - TIER_EASY_FADE * Math.max(0, Math.min(MAX_TIER, tier));
  return Math.max(TIER_EASY_FLOOR, faded);
}

/**
 * Copies a layout written for the tiers gets, once its own tier has arrived.
 *
 * Counted from the tier it unlocks at rather than from zero, so the newest
 * layout in the pile is always the one still climbing and the ones unlocked
 * five tiers ago do not drown it out.
 */
export function tierPatternScale(tier, minTier) {
  const reached = Math.min(MAX_TIER, tier) - minTier;
  if (reached < 0) return 0;
  return 1 + TIER_PATTERN_GAIN * (reached + 1);
}

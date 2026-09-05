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
 * How much of a point's value each tier takes back.
 *
 * The layouts alone could not do this job. Measured against the pattern table,
 * shifting the whole pile from its easiest mix to its hardest changes how
 * demanding the average draw is by about 1.6x — because the spacing floors are
 * already at the geometric minimum (`CLEARANCE_SECONDS_HARD` is six hundredths
 * of a second above what a jump physically needs) and because the late pile was
 * mostly gauntlets to begin with. A run that survives twice as long still
 * scores about twice as much, so the top of the board stayed an order of
 * magnitude above the middle of it.
 *
 * So the tiers take the other route as well: the further a run has climbed, the
 * less each metre and each coin is worth. It is the one lever whose effect is
 * arithmetic rather than a guess about how often a player will misread a row,
 * and it is what actually brings the top of the board back towards the players
 * on it.
 *
 * Applied to what is banked and shown, never to `Run.baseScore` — the tiers are
 * spaced in raw points so that reaching the next one always costs the same
 * amount of *play*. Feeding the decay back into the thing that measures it
 * would make each tier slower to reach than the last for no reason anybody
 * could see.
 */
export const TIER_SCORE_DECAY = 0.07;
/**
 * What a point is worth once the ladder has run out.
 *
 * Not zero, and not near it: a run that has climbed this far is the best run
 * anybody is having, and a game that stops paying is a game that has ended
 * without saying so. A third still rewards going further — it just stops one
 * exceptional afternoon from outscoring every other player put together.
 *
 * These two together are what actually compressed the board. Simulated over
 * four skill profiles and forty thousand runs each, and read the way a board is
 * actually read — every player's *best* run rather than their median one — the
 * spread between the weakest player's board figure and the strongest goes from
 * roughly forty-two times to fourteen. The layouts alone got it to thirty.
 */
export const TIER_SCORE_FLOOR = 0.28;

/**
 * What a point earned at this tier is actually worth.
 *
 * @param {number} tier
 */
export function tierScoreScale(tier) {
  const step = Math.max(0, Math.min(MAX_TIER, tier));
  return Math.max(TIER_SCORE_FLOOR, 1 - TIER_SCORE_DECAY * step);
}

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

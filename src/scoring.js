/** Score points earned per metre travelled. */
export const DIST_SCORE_RATE = 2.6;
/** Base points for a coin, before the combo bonus. */
export const COIN_BASE = 10;
/** Combo bonus is capped so a long chain cannot run away with the score. */
export const COIN_COMBO_CAP = 20;
/** Seconds a combo survives without a coin, near miss or roof mount. */
export const COMBO_WINDOW = 1.6;
/** Bonus for climbing onto a vehicle roof from the ground. */
export const MOUNT_BONUS = 22;
/** Bonus for hopping straight from one roof to the next. */
export const HOP_BONUS = 8;
/** Bonus for squeezing past an obstacle instead of taking the safe line. */
export const NEAR_MISS_BONUS = 15;
/** Points per metre while riding a vehicle roof, on top of the distance score. */
export const ROOF_RIDE_RATE = 3.2;

/**
 * Combo tiers. Keeping a chain alive raises a run-wide multiplier, which is
 * what makes near misses and roof rides worth the risk.
 */
export const COMBO_TIERS = [
  { at: 0, multiplier: 1, label: "" },
  { at: 5, multiplier: 1.25, label: "HOT" },
  { at: 15, multiplier: 1.5, label: "BLAZING" },
  { at: 30, multiplier: 2, label: "UNREAL" },
];

/** The best a combo alone can multiply by. Read by the run validator. */
export const MAX_COMBO_MULTIPLIER = COMBO_TIERS.reduce(
  (best, tier) => Math.max(best, tier.multiplier),
  1,
);

export function comboTier(combo) {
  let tier = COMBO_TIERS[0];
  for (const candidate of COMBO_TIERS) if (combo >= candidate.at) tier = candidate;
  return tier;
}

export function comboMultiplier(combo) {
  return comboTier(combo).multiplier;
}

/** Everything that scales score: combo tier times any power-up bonus. */
export function scoreMultiplier(combo, powerupMultiplier = 1) {
  return comboMultiplier(combo) * powerupMultiplier;
}

export function coinGain(combo) {
  return COIN_BASE + Math.min(COIN_COMBO_CAP, Math.max(0, combo));
}

export function distanceGain(metres) {
  return metres * DIST_SCORE_RATE;
}

export function roofRideGain(metres) {
  return metres * ROOF_RIDE_RATE;
}

export function mountBonus(isHop) {
  return isHop ? HOP_BONUS : MOUNT_BONUS;
}

export function totalScore(distScore, coinScore, bonusScore) {
  return distScore + coinScore + bonusScore;
}

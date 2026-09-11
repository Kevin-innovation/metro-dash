/**
 * The scale everything below is written on.
 *
 * A run is meant to read as 20만 in the first minute, 30만 where it turns hard,
 * and 40만 · 50만 as the wall — numbers a player can hold in their head and
 * aim at. Before any of this a minute was worth about 29,000, so the whole
 * ladder lived in five figures and nothing on it was a landmark.
 *
 * Applied to every score source at once, so nothing's worth relative to
 * anything else moves: a metre, a coin, a slide and a mount are in exactly the
 * proportions they were. It is the unit that changed, not the balance.
 *
 * It was seven, and it is 4.3 now for a reason that has nothing to do with
 * scoring: the run's opening speed doubled, so a minute covers three quarters
 * again as many metres as it used to, and metres are most of the score. The
 * milestones are the fixed point here — they are what the difficulty curve is
 * pinned to — so the scale is what moves to keep a minute worth 20만.
 *
 * Scores banked on an older scale are left alone rather than migrated; see the
 * release notes. Experience is not on this scale at all — see SCORE_PER_XP.
 */
export const SCORE_SCALE = 4.3;

/**
 * Score for staying alive, per second.
 *
 * Per second, not per metre, and that is the whole shape of the run.
 *
 * Per metre, the score accelerated twice over: the track speeds up through the
 * run and the combo multiplier climbs on top of it, so a minute at the end was
 * worth four minutes at the start. Measured, an ordinary run scored 2,367 a
 * second over its first minute and 9,467 a second over its third. That is why a
 * five-minute run reached 1.7 million and why no single scale factor could give
 * 20만 in the first minute *and* keep a three-minute run near the wall — raise
 * it for the opening and the end runs away, lower it for the end and the
 * opening is worth nothing.
 *
 * Time is the thing every player spends at the same rate, so the rate is
 * written as the answer rather than tuned towards it: a minute of staying alive
 * is 20만, by construction, at the start of a run and at the end of it. Three
 * minutes of it is 60만, and everything a player earns on top — the coins, the
 * slides, the mounts, the roofs — is what separates one run from another.
 *
 * Speed is not left without a job. It is what decides how many coins, gates and
 * roofs go past in each of those seconds, and those are the other half of the
 * score — so 질주 still pays, and still pays for the reason it should: it puts
 * more of the game in front of you, not more metres behind you.
 */
export const TARGET_SCORE_PER_MINUTE = 200_000;
export const SURVIVAL_RATE = TARGET_SCORE_PER_MINUTE / 60;

/**
 * Kept so the run validator and the game-over card still have the figure they
 * were written against. Nothing scores per metre any more.
 */
export const DIST_SCORE_RATE = 26;
/** Base points for a coin, before the combo bonus. */
export const COIN_BASE = 78;
/** Combo bonus is capped so a long chain cannot run away with the score. */
export const COIN_COMBO_CAP = 86;
/**
 * Seconds a combo survives without a clear, once the track is dense.
 *
 * A chain dies to the gap between two things to do, and how long that gap is
 * changes enormously over a run. At speed, with a gauntlet every second and a
 * pattern carrying half a dozen obstacles, 2.2 seconds is a real deadline that
 * a careless lane change can miss. In the opening it is not a deadline at all —
 * it is simply longer than the track is willing to hand anything over.
 */
export const COMBO_WINDOW = 2.2;

/**
 * The window the first seconds run on.
 *
 * Measured rather than guessed. The opening pool deals about 0.94 clearable
 * obstacles per pattern and a third of it — the coin lines, the lone bus, the
 * lone train — carries none at all, so two of those back to back is a gap of
 * around three seconds with nothing in it. Under a 2.2 second window the chain
 * broke there every time, and the opening ran at an average multiplier of
 * 1.05: a player spent the first twenty seconds of every run being paid the
 * base rate for distance and nothing else, which is the stretch that decides
 * whether they play a second one.
 *
 * This is not a difficulty change and deliberately not a scoring change: the
 * tiers, the obstacles and what each is worth are all exactly as they were. It
 * only stops the combo from being cut by track the game has not laid yet.
 */
export const COMBO_WINDOW_OPEN = 3.6;

/**
 * Seconds over which the window closes to COMBO_WINDOW.
 *
 * Ends before RUSH, where the pool is dense enough to carry a chain on its own
 * — by then the average clear rate has passed one per second and the wide
 * window would be giving away a chain rather than protecting one.
 */
export const COMBO_WINDOW_TIGHTENS_BY = 60;

/**
 * How long a combo survives a quiet stretch at time `t` into the run.
 *
 * Straight line: this is compensation for a thin opening, and the opening
 * thickens evenly.
 */
export function comboWindowAt(t) {
  const k = Math.min(1, Math.max(0, (Number(t) || 0) / COMBO_WINDOW_TIGHTENS_BY));
  return COMBO_WINDOW_OPEN + (COMBO_WINDOW - COMBO_WINDOW_OPEN) * k;
}
/**
 * Bonus for the two verbs that are not a mount: sliding a gate, jumping a
 * crate or barrier.
 *
 * These paid nothing at all. 2.80 took the near-miss bonus out and put SLIDE ·
 * JUMP · ROOF in its place, and only the third of those was ever wired to a
 * score — so the game flashed a word for the thing it had just asked the
 * player to do and the number underneath it did not move. A gate is the one
 * obstacle with no way around it, which is why it is worth more than a crate
 * you could have changed lane to avoid.
 */
/**
 * What a verb is worth, against the clock it is competing with.
 *
 * These were sized when the score was paid per metre and every one of them was
 * multiplied by a combo that climbed all run. Priced per second, they became
 * rounding errors: a mount was worth four hundredths of a second of simply
 * being alive, a roof-to-roof hop one hundredth. The riskiest line in the game
 * paid less than standing still for a fifth of a second.
 *
 * Written as fractions of a second of survival so the comparison is the one
 * the player is actually making — is doing this worth the risk against just
 * not dying? A mount is a fifth of a second, a hop a little less because the
 * mount that set it up has already been paid, a gate a tenth. They add up over
 * a run without ever competing with the clock itself.
 */
const perSecond = (fraction) => Math.round(SURVIVAL_RATE * fraction);

export const SLIDE_BONUS = perSecond(0.04);
export const JUMP_BONUS = perSecond(0.03);

/** Bonus for climbing onto a vehicle roof from the ground. */
export const MOUNT_BONUS = perSecond(0.06);
/** Bonus for hopping straight from one roof to the next. */
export const HOP_BONUS = perSecond(0.05);
/** Bonus for squeezing past an obstacle instead of taking the safe line. */
export const NEAR_MISS_BONUS = perSecond(0.08);
/** Points per metre while riding a vehicle roof, on top of the distance score. */
export const ROOF_RIDE_RATE = 20.6;

/**
 * Combo tiers. Keeping a chain alive raises a run-wide multiplier, which is
 * what makes near misses and roof rides worth the risk.
 */
export const COMBO_TIERS = [
  { at: 0, multiplier: 1, label: "" },
  // Three, not five. The rungs were set when a coin fed the combo and a chain
  // ran to a hundred and thirty; 2.80 took the coins out and the opening now
  // deals about 0.7 clearable obstacles a second, so five was seven unbroken
  // seconds of running before the first rung paid anything — and the opening
  // is exactly where a chain is most likely to be cut before it gets there.
  // Only this rung moves. The ones above it are reachable by anyone riding
  // roofs, and lowering those would raise the top of the board rather than the
  // bottom of a run.
  { at: 3, multiplier: 1.25, label: "HOT" },
  { at: 15, multiplier: 1.5, label: "BLAZING" },
  { at: 30, multiplier: 2, label: "UNREAL" },
  // Above thirty the chain used to pay nothing at all. A player holding a
  // hundred and thirty was taking the same risk on every near miss and roof
  // hop as one holding thirty-one and being paid the same for it, which makes
  // the back half of a good run a formality. The steps are deliberately
  // smaller than the ones below: this is the stretch where a chain is already
  // worth a great deal, and doubling it again would make the top of the board
  // a single lucky run rather than a good one.
  { at: 60, multiplier: 2.25, label: "GODLIKE" },
  { at: 100, multiplier: 2.5, label: "IMMORTAL" },
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

/** Points for `seconds` of running, before any multiplier. */
export function survivalGain(seconds) {
  return seconds * SURVIVAL_RATE;
}

/**
 * And for `seconds` spent on a roof, on top of it.
 *
 * Held at the same share of the base it always had — a roof was worth an extra
 * 79% of the ground under it per metre, and it is worth an extra 79% per second
 * now. The line pays what it always paid; only the unit moved.
 */
export function roofRideGain(seconds) {
  return seconds * SURVIVAL_RATE * (ROOF_RIDE_RATE / DIST_SCORE_RATE);
}

export function mountBonus(isHop) {
  return isHop ? HOP_BONUS : MOUNT_BONUS;
}

/** What clearing one obstacle with the right move is worth, before multipliers. */
export function clearBonus(kind) {
  return kind === "slide" ? SLIDE_BONUS : JUMP_BONUS;
}

export function totalScore(distScore, coinScore, bonusScore) {
  return distScore + coinScore + bonusScore;
}

import { jitter, makeRng, pickFrom, randomSeed, shuffled } from "./rng.js";
import { speedAt } from "./pace.js";
import {
  CLEARANCE_SECONDS_EASY,
  CLEARANCE_SECONDS_HARD,
  PATTERN_CLEARANCE,
} from "./config.js";
import {
  POWERUP_PATTERNS,
  SLIDE_DEAD_BAND,
  candidatesFor,
  crowEggPattern,
  describePattern,
  diamondPattern,
  inSlideDeadBand,
  patternById,
  requiredGapSeconds,
} from "./patterns.js";

/**
 * How close the lead correction below has to get before it stops.
 *
 * Named and exported because the fairness test has to check its leads against
 * the same figure. A centimetre of runway is three tenths of a millisecond at
 * running speed — under the correction loop's own resolution and far under
 * anything a player could meet — but a test that demanded exactness was really
 * testing whether a particular run happened to converge cleanly.
 */
export const LEAD_CONVERGENCE_METRES = 0.01;

/**
 * How far ahead of the runner a layout is placed, in seconds of travel.
 *
 * Named and exported because Game has to know it: a pattern is laid out in
 * *metres*, from a speed, and it is met this long afterwards — so the speed it
 * should be built for is the speed at arrival, not the speed now.
 *
 * That distinction used to cost nothing, because the curve moved by a hair a
 * second and two and a bit seconds of it rounded away. It stopped being free
 * the moment the curve was cut into ten-second steps: a layout placed a
 * fraction before a step is met a fraction after one, at a speed up to ten per
 * cent higher, and every gap authored inside it is short by that ratio. The
 * fairness audit went from sixteen unclearable layouts to fifty.
 */
export const PLACEMENT_LEAD_SECONDS = 2.35;

/** Opening layouts, one per move, so the first obstacles teach the controls. */
const TUTORIAL = ["coins", "train", "barrier", "sign", "bus"];

/**
 * What follows a section, whatever the phase.
 *
 * A section trains one motion for ten seconds — slide, slide, slide — and the
 * draw that comes after it used to be anything at all, including a wall of
 * buses that has to be jumped onto within a tenth of a second. One ordinary
 * layout in between is the difference between a hard game and a cheat.
 */
const AFTER_EVENT = ["coins", "weave", "bus", "train", "lane-shift"];

/**
 * Power-ups are dealt on a cadence; the jetpack stays the rare one.
 *
 * Shuffled per run rather than dealt in the order written here. Written order
 * meant the jetpack was always the fifth drop of a run and always the twelfth,
 * which is a thing to be counted rather than met. Shuffling a deck still deals
 * one jetpack per seven drops, so what a run contains has not changed — only
 * when it turns up.
 */
/**
 * The order power-ups are dealt in, shuffled per pass.
 *
 * A deck rather than a roll, so a run cannot go four minutes without a magnet.
 *
 * 질주 takes four of the ten. It used to take one, and one in seven drops on
 * a six-layout cadence is a sprint about every seventy seconds — met once or
 * twice in a whole run, which for the pickup that most changes how a run feels
 * is barely meeting it at all. At four in ten a sprint is a regular part of
 * the run rather than an event, which is what the speed steps want: the track
 * climbs a rung every ten seconds on its own, and 질주 is the player's own
 * handle on the same dial.
 *
 * The jetpack keeps its single slot for the reason its duration is capped —
 * flying is a pause from the game, and a pause you get every thirty seconds is
 * most of the game.
 */
const POWERUP_DECK = [
  "focus",
  "magnet",
  "focus",
  "sneakers",
  "magnet",
  "focus",
  "jetpack",
  "magnet",
  "focus",
  "sneakers",
];
const POWERUP_EVERY = 6;

/**
 * When the crow egg starts appearing at all, and how often once it does.
 *
 * It used to be dealt from the fourteenth layout of every run, one in
 * seventeen, and to speed up past a hundred thousand. Both numbers were wrong,
 * in opposite directions.
 *
 * The frenzy was far worse than it read on paper. One egg every five layouts
 * is one every six seconds against a crow that lasts four and a half, so a
 * five-minute run past the threshold spent 77% of itself unable to see. That is
 * not "the bird takes over from the speed curve", it is the lights going out.
 *
 * And at the other end it was arriving far too early. A player still learning
 * which lane to be in was meeting a trap that takes their sight away — and
 * since the magnet now drags the egg in, the power-up that beginners like best
 * was the one delivering it. "Collect everything" is the first thing this game
 * teaches and the crow is the first thing that punishes it, which is a fine
 * lesson deep into a run and a reason to stop playing in the first ten seconds.
 *
 * So the bird is an endgame animal now. Nothing below the threshold, one in
 * nine above it — about eleven seconds apart, which is a real and constant
 * pressure without being a blindfold. One threshold and one cadence: a run
 * either has crows in it or does not, and a player knows which.
 *
 * Keyed to score rather than to the clock, as it always was. Time is what the
 * player survived; score is how well, and the run that should get hard is the
 * one going well.
 *
 * Five hundred thousand, because that is the number the run is built around:
 * 50만 is where the game is supposed to turn brutal, and the bird is the
 * strongest thing it has to turn brutal with.
 *
 * It was seven hundred thousand, carried over from a scale that no longer
 * exists and never re-anchored when the scoring moved to seconds. Measured
 * against the curve that shipped, that put the first egg at 147 seconds of a
 * 180-second run for an ordinary player and past the finish line entirely for a
 * new one — the bird had effectively been removed from the game and nothing
 * said so. At 50만 it arrives around 115 seconds, which is the last minute of a
 * good run and the stretch the whole difficulty ladder was compressed to reach.
 */
export const HAZARD_FROM_SCORE = 500_000;
const HAZARD_EVERY = 9;
/** How far either side of that cadence an egg may fall. */
const HAZARD_SPREAD = 3;

/**
 * How often a diamond is dealt, and how long the run waits for the first.
 *
 * It was one layout in eleven starting from the twentieth, which is a spin
 * roughly every two and a half minutes — for a wheel that needs three diamonds
 * to turn, that is most runs ending having seen the thing twice and spun it
 * never. The wheel is the most interesting object in the game and it was
 * effectively optional content.
 *
 * One in eight from the fourteenth puts the first spin inside the opening
 * minute and a second within reach of an ordinary run, which is the cadence
 * the ×0 and ×0.5 faces were priced for: a gamble taken several times is a
 * gamble, a gamble taken once is a coin flip that ends a run. One in seven was
 * the first attempt and it was a touch too eager — the wheel started
 * interrupting the run rather than punctuating it.
 */
const DIAMOND_EVERY = 8;
const DIAMOND_AFTER = 14;
const DIAMOND_SPREAD = 2;

/**
 * How far a pattern's own spacing may open up, as a share of itself.
 *
 * Upward only, and that is not a detail. The gap a layout asks for already
 * eases towards a floor as the run winds up — that floor is the tightest a
 * jump can finish in — so a wobble that multiplies the whole figure takes the
 * floor with it. Wobbling both ways cost 231 unclearable placements in the
 * fairness audit at the first attempt: rows 0.02 seconds apart that needed
 * 0.22. Opening a gap can never make a layout unclearable; closing one can.
 */
const GAP_WOBBLE = 0.3;

/**
 * Metres two patterns' hazards must keep between them, whatever the timing
 * rules say.
 *
 * Rows closer than the collision test's own grouping distance stop being two
 * layouts and become one: a gate wall with a bus arriving beside it is no
 * longer a wall you slide under, it is a wall you have to be on top of. Neither
 * pattern ever declared that, so nothing checked it.
 *
 * Twice the widest grouping distance (a train's 5.28m) rather than merely more
 * than it: where a vehicle coming the other way is met is worked out from its
 * speed and the runner's, and a metre of disagreement between two ways of
 * computing that must not be able to turn two layouts into one. At fifty metres
 * a second this costs a quarter of a second, which the gap between patterns
 * already exceeds several times over.
 */
const MIN_PATTERN_SEPARATION = 12;


/**
 * Turns the pattern table into live entities and decides when the next layout
 * may start.
 *
 * The scheduler inspects a pattern's metadata before committing to it, so two
 * layouts can never overlap and a full-lane wall never lands right on top of a
 * vehicle the player might still be riding.
 */
/**
 * Everything a pattern's `build` is handed.
 *
 * Exported because the tests and the fairness audit have to build the same
 * context the spawner does. They each used to write their own copy of it, and a
 * copy is a thing that drifts: the moment the spawner grew `rng`, `count` and
 * `either`, every test that had copied the old shape started calling undefined.
 *
 * @param {{ z: number, speed: number, pressure: number, rng: () => number }} of
 */
export function patternContext({ z, speed, pressure = 0, rng }) {
  /** This pattern's own gap wobbles, keyed by what was asked for. */
  const wobbles = {};
  const context = {
    z,
    rng,
    lane: pickFrom(rng, [-1, 0, 1]),
    lanes: shuffled(rng, [-1, 0, 1]),
    /**
     * Spacing, with a wobble.
     *
     * Every gap in the table is drawn through this one call, so one wobble
     * here varies all thirty layouts. Without it a zigzag was always three
     * vehicles at exactly the same spacing, and the only thing that changed
     * between two draws of a pattern was which lane was which — a layout you
     * meet once and solve forever.
     *
     * One wobble per distinct gap, not per call: patterns lean on two calls
     * with the same arguments coming back with the same number, which is how a
     * row that spans lanes is placed. Drawing fresh each time turned a single
     * row into two rows two hundredths of a second apart with no lane through
     * both, which the fairness audit caught 75 times.
     */
    gap: (seconds, min, floor) => {
      const key = `${seconds}|${min}|${floor}`;
      if (!(key in wobbles)) wobbles[key] = 1 + rng() * GAP_WOBBLE;
      return Spawner.gapFor(speed, pressure, seconds, min, floor, wobbles[key]);
    },
    /** A count that varies, for coin runs and rows of the same thing. */
    count: (base, spread = 1) => base + Math.round(jitter(rng, spread)),
    /** One of two, so a row is not always made of the same thing. */
    either: (a, b) => (rng() < 0.5 ? a : b),
  };
  context.others = [-1, 0, 1].filter((l) => l !== context.lane);
  return context;
}

export class Spawner {
  /**
   * @param {import("./entities.js").EntityPool} pool
   * @param {{ onOncoming?: (item) => void }} [hooks]
   */
  constructor(pool, hooks = {}) {
    this.pool = pool;
    this.hooks = hooks;
    this.reset();
  }

  /** @param {number} [seed] so a run's draws can be replayed exactly */
  reset(seed = randomSeed()) {
    this.rng = makeRng(seed);
    this.powerupDeck = [];
    this.hazardIn = HAZARD_EVERY;
    this.diamondIn = DIAMOND_EVERY;
    this.patternCount = 0;
    /**
     * The last hazard actually placed, wherever it came from. Tracked across
     * patterns rather than per pattern, because a layout with no obstacles at
     * all — a coin run, a power-up drop — would otherwise erase the memory of
     * the jump the runner is still in the air from.
     */
    this.lastHazard = null;
    this.nextSpawn = 0;
    this.inEvent = false;
    this.leavingEvent = false;
  }

  /**
   * Metres covered by `seconds` of running, floored so slow layouts stay
   * readable.
   *
   * `floorSeconds` is the tightest the gap may become once the run is fully
   * wound up. Each caller sets its own floor because the physical minimum
   * differs — a jump has to finish before a slide wall arrives, a lane change
   * does not.
   */
  static gapFor(speed, pressure, seconds, minMetres, floorSeconds = seconds, wobble = 1) {
    const eased = seconds + (floorSeconds - seconds) * pressure;
    return Math.max(minMetres, speed * eased * wobble);
  }

  /** Fill the track ahead before a run or a title-screen preview starts. */
  seed(startZ, count, minSpacing, options) {
    let z = startZ;
    for (let i = 0; i < count; i++) {
      const meta = this.place(z, options);
      z += Math.max(minSpacing, meta.span + PATTERN_CLEARANCE);
    }
    this.nextSpawn = options.nextSpawn ?? startZ;
    return z;
  }

  /**
   * Spawn the next pattern if the runner has travelled far enough.
   *
   * @returns {object|null} the pattern metadata, when one was placed
   */
  update(playerZ, options) {
    if (playerZ <= this.nextSpawn) return null;

    const { reaction, pressure = 0, runTime = null } = options;
    // The speed this layout will be *met* at, which is not the speed it is
    // placed at. See PLACEMENT_LEAD_SECONDS. Falls back to the caller's figure
    // for the title-screen preview, which has no clock.
    const speed =
      runTime === null ? options.speed : speedAt(runTime + PLACEMENT_LEAD_SECONDS);
    const ahead = Math.max(46, speed * PLACEMENT_LEAD_SECONDS);
    // Where the runner is standing when this is placed, so a vehicle coming the
    // other way can be resolved to where the two actually meet.
    const meta = this.place(playerZ + ahead, { ...options, speed, fromZ: playerZ });

    // The next pattern starts however far the runner travels before the timer
    // fires, so it must not fire until this one is cleared plus a margin. Both
    // terms tighten with pressure, which is what stops the run settling into a
    // constant amount of thinking time no matter how fast the world moves.
    const reactionGap = speed * reaction;
    const clearSeconds =
      CLEARANCE_SECONDS_EASY + (CLEARANCE_SECONDS_HARD - CLEARANCE_SECONDS_EASY) * pressure;
    const clearance = Math.max(PATTERN_CLEARANCE, speed * clearSeconds);
    this.nextSpawn = playerZ + Math.max(reactionGap, meta.span + clearance);
    return meta;
  }

  /**
   * Where the runner meets a placement.
   *
   * A vehicle coming the other way closes at its own speed plus the runner's,
   * so it is met far short of where it was put — at fifty metres a second a bus
   * parked eighty metres ahead is reached in under a second, not in one and a
   * half. Everything that reasons about spacing has to use the meeting point,
   * or the fair-looking gap in front of an oncoming bus is not there at all.
   */
  static meetingPoint(placement, { fromZ, speed, oncomingSpeed }) {
    if (!placement.oncoming || fromZ == null || !(speed > 0) || !(oncomingSpeed > 0)) {
      return placement;
    }
    const closing = speed + oncomingSpeed;
    const meetIn = Math.max(0, (placement.z - fromZ) / closing);
    return { ...placement, z: fromZ + speed * meetIn };
  }

  /** Materialise one pattern at `z` and report what it occupies. */
  place(z, options = {}) {
    this.patternCount += 1;
    const speed = options.speed ?? 20;
    const met = (list) => list.map((placement) => Spawner.meetingPoint(placement, { ...options, speed }));

    let placements = this.choose(z, options);
    let described = describePattern(z, met(placements));

    // How much room this layout needs from the one before it depends on what it
    // opens with, which is only knowable once it has been built. So build it,
    // measure the gap it actually landed with, and push it downtrack only by
    // the shortfall — applying the margin to the *following* gap instead would
    // protect the wrong pattern.
    //
    // Repeated rather than applied once, because of the vehicles coming the
    // other way: moving one a metre downtrack only moves the point where it is
    // met by about eight tenths of that, so a single correction always lands
    // short of what it was asked for.
    let shift = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const extra = this.leadShortfall(described, speed);
      if (extra <= LEAD_CONVERGENCE_METRES) break;
      shift += extra;
      placements = placements.map((placement) => ({ ...placement, z: placement.z + extra }));
      described = describePattern(z + shift, met(placements));
    }

    for (const placement of placements) {
      const item = this.pool.spawn(
        placement.type,
        placement.lane,
        placement.z,
        placement.y ?? 0.55,
      );
      if (placement.oncoming) this.hooks.onOncoming?.(item);
    }

    this.rememberHazard(described);
    // Reported span covers the shift too, so the scheduler still knows how far
    // down the track this pattern actually reaches.
    return { ...described, span: described.span + shift, shift };
  }

  /**
   * Metres this pattern must move downtrack to give the runner a fair lead.
   *
   * Applied to every pattern rather than only to walls. A layout with a free
   * lane is still unclearable if that lane is not the one the previous row left
   * the runner in and there is no time to move — which is most of what the
   * fairness audit was finding.
   */
  leadShortfall(described, speed) {
    const entry = described.entryRow;
    if (!entry || !this.lastHazard || !(speed > 0)) return 0;

    const metres = entry.z - this.lastHazard.z;
    const gap = metres / speed;
    let target = Math.max(gap, requiredGapSeconds(this.lastHazard, entry));
    // The dead band is a hole, not a floor: a gap inside it is pushed past it
    // rather than merely widened.
    if (inSlideDeadBand(this.lastHazard, entry, target)) target = SLIDE_DEAD_BAND[1];
    return Math.max(0, Math.max(target * speed, MIN_PATTERN_SEPARATION) - metres);
  }

  rememberHazard(described) {
    const last = described.rows[described.rows.length - 1];
    if (!last) return;
    // The furthest downtrack, not simply the most recent. Vehicles coming the
    // other way are met well before where they were put, so a pattern can end
    // *behind* the one before it — and measuring the next pattern from that
    // leaves it free to land on top of the older row.
    if (!this.lastHazard || last.z >= this.lastHazard.z) this.lastHazard = last;
  }

  choose(z, {
    speed = 20,
    phaseId = 1,
    tutorial = false,
    pressure = 0,
    slideBias = 0,
    eventPatterns = null,
    score = 0,
  }) {
    const context = patternContext({ z, speed, pressure, rng: this.rng });

    if (tutorial && this.patternCount <= TUTORIAL.length) {
      const wanted = TUTORIAL[this.patternCount - 1];
      const pattern = candidatesFor(9).find((p) => p.id === wanted);
      if (pattern) return pattern.build(context);
    }

    const inEvent = Boolean(eventPatterns?.length);
    if (this.inEvent && !inEvent) this.leavingEvent = true;
    this.inEvent = inEvent;

    // The handover out of a section gets one ordinary layout before the game
    // is allowed to ask for anything difficult again.
    if (this.leavingEvent && !inEvent) {
      this.leavingEvent = false;
      const breather = AFTER_EVENT.map((id) => patternById(id)).filter(Boolean);
      if (breather.length) return pickFrom(this.rng, breather).build(context);
    }

    // A section overrides the draw entirely, including the phase gate: its
    // layouts are chosen for what the section is asking the player to do, and
    // a coin rush interrupted by a power-up drop is not a coin rush.
    if (eventPatterns?.length) {
      const chosen = eventPatterns
        .map((id) => patternById(id))
        .filter((pattern) => pattern && typeof pattern.build === "function");
      if (chosen.length) return pickFrom(this.rng, chosen).build(context);
    }

    if (this.patternCount % POWERUP_EVERY === 0) {
      if (!this.powerupDeck.length) this.powerupDeck = shuffled(this.rng, POWERUP_DECK);
      return POWERUP_PATTERNS[this.powerupDeck.shift()](z, context.lane);
    }

    // Both hazard clocks tick here, before either is allowed to claim the
    // layout, and that ordering matters more than it looks.
    //
    // The diamond used to be counted first and to return on the spot, which
    // left the crow's countdown untouched on every layout the wheel took. That
    // was harmless while a diamond came one layout in eleven. At one in seven
    // it stretched the bird from an egg every ten and a half layouts to one
    // every thirteen — the wheel quietly bought the player out of a third of
    // the crows, and nothing in either number said so. Ticking both and then
    // deciding means each cadence is what it says it is, and the only thing
    // the collision costs is which of the two lands on this particular layout.
    const diamondDue = this.patternCount >= DIAMOND_AFTER && --this.diamondIn <= 0;
    const hazardDue = --this.hazardIn <= 0;

    // The wheel wins the tie. It is the better thing to meet, and the egg it
    // displaces comes back on the next layout rather than being skipped.
    if (diamondDue) {
      this.diamondIn = DIAMOND_EVERY + Math.floor(this.rng() * DIAMOND_SPREAD * 2) - DIAMOND_SPREAD;
      if (hazardDue) this.hazardIn = 1;
      return diamondPattern(z, context);
    }

    // Checked after the power-ups, so on the rare draw where both cadences land
    // on the same layout the player gets the good one. Counted down with a
    // jitter rather than tested against a fixed multiple, so an egg cannot be
    // predicted by counting layouts.
    //
    // The countdown runs the whole run and the score decides only what lands in
    // the slot. Gating the countdown itself was the first attempt, and it made
    // the early game *harder*: the egg pattern is a coin line with a trap in it
    // and a free lane beside it, which is one of the few genuine rests in the
    // table. Skipping the slot handed those layouts back to the ordinary draw
    // and tightened the opening minutes by a couple of percent — the opposite
    // of the point, since the reason the bird was moved out of the early game
    // is that the early game is where people are still learning.
    //
    // So below the threshold the same slot deals the coin line without the
    // trap. The rhythm of the run is identical either side of two hundred
    // thousand; what changes is whether there is something in the line.
    if (hazardDue) {
      this.hazardIn = HAZARD_EVERY + Math.floor(this.rng() * HAZARD_SPREAD * 2) - HAZARD_SPREAD;
      if (score >= HAZARD_FROM_SCORE) return crowEggPattern(z, context);
      const rest = patternById("coins");
      if (rest) return rest.build(context);
    }

    return pickFrom(this.rng, candidatesFor(phaseId, slideBias)).build(context);
  }
}

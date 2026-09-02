import { makeRng, randomSeed, shuffled } from "./rng.js";
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
  inSlideDeadBand,
  patternById,
  requiredGapSeconds,
} from "./patterns.js";

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
const POWERUP_DECK = ["magnet", "double", "sneakers", "magnet", "jetpack", "double", "sneakers"];
const POWERUP_EVERY = 6;

/**
 * How often the crow egg is dealt, and how long the run gets before the first
 * one.
 *
 * Rarer than the power-ups by a wide margin, and coprime with their cadence so
 * the two do not lock into a rhythm the player can count. The grace period is
 * so a new player meets the four pickups that help before meeting the one that
 * does not — a trap only reads as a trap once there is something for it to be
 * the opposite of.
 */
const HAZARD_EVERY = 17;
const HAZARD_AFTER = 14;
/** How far either side of that cadence an egg may fall. */
const HAZARD_SPREAD = 6;

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

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * Turns the pattern table into live entities and decides when the next layout
 * may start.
 *
 * The scheduler inspects a pattern's metadata before committing to it, so two
 * layouts can never overlap and a full-lane wall never lands right on top of a
 * vehicle the player might still be riding.
 */
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
  static gapFor(speed, pressure, seconds, minMetres, floorSeconds = seconds) {
    const eased = seconds + (floorSeconds - seconds) * pressure;
    return Math.max(minMetres, speed * eased);
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

    const { speed, reaction, pressure = 0 } = options;
    const ahead = Math.max(46, speed * 2.35);
    // Where the runner is standing when this is placed, so a vehicle coming the
    // other way can be resolved to where the two actually meet.
    const meta = this.place(playerZ + ahead, { ...options, fromZ: playerZ });

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
      if (extra <= 0.01) break;
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
  }) {
    const context = {
      z,
      lane: pick([-1, 0, 1]),
      lanes: shuffle([-1, 0, 1]),
      gap: (seconds, min, floor) => Spawner.gapFor(speed, pressure, seconds, min, floor),
    };
    context.others = [-1, 0, 1].filter((l) => l !== context.lane);

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
      if (breather.length) return pick(breather).build(context);
    }

    // A section overrides the draw entirely, including the phase gate: its
    // layouts are chosen for what the section is asking the player to do, and
    // a coin rush interrupted by a power-up drop is not a coin rush.
    if (eventPatterns?.length) {
      const chosen = eventPatterns
        .map((id) => patternById(id))
        .filter((pattern) => pattern && typeof pattern.build === "function");
      if (chosen.length) return pick(chosen).build(context);
    }

    if (this.patternCount % POWERUP_EVERY === 0) {
      if (!this.powerupDeck.length) this.powerupDeck = shuffled(this.rng, POWERUP_DECK);
      return POWERUP_PATTERNS[this.powerupDeck.shift()](z, context.lane);
    }

    // Checked after the power-ups, so on the rare draw where both cadences
    // land on the same pattern the player gets the good one. Counted down with
    // a jitter rather than tested against a fixed multiple, so an egg cannot be
    // predicted by counting layouts.
    if (this.patternCount >= HAZARD_AFTER && --this.hazardIn <= 0) {
      this.hazardIn = HAZARD_EVERY + Math.floor(this.rng() * HAZARD_SPREAD * 2) - HAZARD_SPREAD;
      return crowEggPattern(z, context);
    }

    return pick(candidatesFor(phaseId, slideBias)).build(context);
  }
}

import {
  CLEARANCE_SECONDS_EASY,
  CLEARANCE_SECONDS_HARD,
  PATTERN_CLEARANCE,
} from "./config.js";
import {
  POWERUP_PATTERNS,
  candidatesFor,
  describePattern,
  patternById,
  requiredLeadSeconds,
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

/** Power-ups are dealt on a cadence; the jetpack stays the rare one. */
const POWERUP_DECK = ["magnet", "double", "sneakers", "magnet", "jetpack", "double", "sneakers"];
const POWERUP_EVERY = 6;

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

  reset() {
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
    const meta = this.place(playerZ + ahead, options);

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

  /** Materialise one pattern at `z` and report what it occupies. */
  place(z, options = {}) {
    this.patternCount += 1;
    const speed = options.speed ?? 20;
    let placements = this.choose(z, options);
    let described = describePattern(z, placements);

    // How much room this layout needs from the one before it depends on what it
    // opens with, which is only knowable once it has been built. So build it,
    // measure the gap it actually landed with, and push it downtrack only by
    // the shortfall — applying the margin to the *following* gap instead would
    // protect the wrong pattern.
    const shift = this.leadShortfall(described, speed);
    if (shift > 0) {
      placements = placements.map((placement) => ({ ...placement, z: placement.z + shift }));
      described = describePattern(z + shift, placements);
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

  /** Metres this pattern must move downtrack to give the runner a fair lead. */
  leadShortfall(described, speed) {
    const entry = described.entryRow;
    if (!entry?.isWall || !this.lastHazard) return 0;
    const needed = speed * requiredLeadSeconds(this.lastHazard, entry);
    return Math.max(0, needed - (entry.z - this.lastHazard.z));
  }

  rememberHazard(described) {
    const last = described.rows[described.rows.length - 1];
    if (last) this.lastHazard = last;
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
      const index = ((this.patternCount / POWERUP_EVERY) | 0) % POWERUP_DECK.length;
      return POWERUP_PATTERNS[POWERUP_DECK[index]](z, context.lane);
    }

    return pick(candidatesFor(phaseId, slideBias)).build(context);
  }
}

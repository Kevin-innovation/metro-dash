import { PATTERN_CLEARANCE } from "./config.js";
import { POWERUP_PATTERNS, candidatesFor, describePattern, fairnessClearance } from "./patterns.js";

/** Opening layouts, one per move, so the first obstacles teach the controls. */
const TUTORIAL = ["coins", "train", "barrier", "sign", "bus"];

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
    this.lastPattern = null;
    this.nextSpawn = 0;
  }

  /** Metres covered by `seconds` of running, floored so slow layouts stay readable. */
  static gapFor(speed, seconds, minMetres) {
    return Math.max(minMetres, speed * seconds);
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

    const { speed, reaction } = options;
    const ahead = Math.max(46, speed * 2.35);
    const meta = this.place(playerZ + ahead, options);

    // The next pattern starts however far the runner travels before the timer
    // fires, so it must not fire until this one is cleared plus a margin.
    const reactionGap = speed * reaction;
    const clearance = Math.max(PATTERN_CLEARANCE, speed * 0.5) + meta.fairness;
    this.nextSpawn = playerZ + Math.max(reactionGap, meta.span + clearance);
    return meta;
  }

  /** Materialise one pattern at `z` and report what it occupies. */
  place(z, options = {}) {
    this.patternCount += 1;
    const placements = this.choose(z, options);

    for (const placement of placements) {
      const item = this.pool.spawn(
        placement.type,
        placement.lane,
        placement.z,
        placement.y ?? 0.55,
      );
      if (placement.oncoming) this.hooks.onOncoming?.(item);
    }

    const described = describePattern(z, placements);
    const meta = {
      ...described,
      fairness: fairnessClearance(this.lastPattern, described, options.speed ?? 20),
    };
    this.lastPattern = described;
    return meta;
  }

  choose(z, { speed = 20, phaseId = 1, tutorial = false }) {
    const context = {
      z,
      lane: pick([-1, 0, 1]),
      lanes: shuffle([-1, 0, 1]),
      gap: (seconds, min) => Spawner.gapFor(speed, seconds, min),
    };
    context.others = [-1, 0, 1].filter((l) => l !== context.lane);

    if (tutorial && this.patternCount <= TUTORIAL.length) {
      const wanted = TUTORIAL[this.patternCount - 1];
      const pattern = candidatesFor(9).find((p) => p.id === wanted);
      if (pattern) return pattern.build(context);
    }

    if (this.patternCount % POWERUP_EVERY === 0) {
      const index = ((this.patternCount / POWERUP_EVERY) | 0) % POWERUP_DECK.length;
      return POWERUP_PATTERNS[POWERUP_DECK[index]](z, context.lane);
    }

    return pick(candidatesFor(phaseId)).build(context);
  }
}

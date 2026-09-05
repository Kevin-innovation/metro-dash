import { GRAVITY, JETPACK_ALTITUDE, JUMP_V, SLIDE_TIME, SNEAKER_JUMP_MULT } from "./config.js";

/** Seconds a jump spends off the deck: up and back down again. */
const JUMP_AIRTIME = (2 * JUMP_V) / -GRAVITY;
import { shuffled } from "./rng.js";
import { SPEC } from "./specs.js";

export const ALL_LANES = [-1, 0, 1];

/**
 * Pattern table.
 *
 * `build` returns placements — plain `{ type, lane, z, y }` records — so a
 * layout can be inspected (span, which lanes it blocks, what it demands of the
 * player) without spawning a single mesh. The scheduler uses that metadata to
 * refuse anything unclearable.
 *
 * Build context:
 *   z       start of the pattern
 *   lane    a random lane
 *   lanes   the three lanes in random order
 *   others  lanes other than `lane`
 *   gap(seconds, minMetres, floorSeconds)
 *           metres covered in that much running time. `floorSeconds` is the
 *           tightest this gap may become at full pressure; omit it and the
 *           spacing never compresses.
 */
export const PATTERNS = [
  {
    // Section-only: three lanes of coins and nothing that can kill you. Never
    // dealt by the ordinary draw — `section` keeps it out of the pile — because
    // as a random pattern it would just be a gap in the run.
    id: "rush-coins",
    section: true,
    minPhase: 0,
    weight: 1,
    build: ({ z }) => [
      ...coinLine(-1, z, 8, 1.5, 0.7),
      ...coinLine(0, z + 0.75, 8, 1.5, 1.95),
      ...coinLine(1, z, 8, 1.5, 0.7),
    ],
  },
  {
    id: "coins",
    minPhase: 0,
    weight: 2,
    late: 1,
    build: ({ z, lane }) => coinLine(lane, z, 7, 1.6, 0.7),
  },
  {
    id: "train",
    minPhase: 0,
    weight: 2,
    late: 1,
    // Two lines: a short one in the clear lane for anyone who just wants
    // through, and a long one on the roof for anyone willing to get up there.
    build: ({ z, lane, others }) => [
      { type: "train", lane, z },
      ...roofLine("train", lane, z - 4, 6),
      ...coinLine(others[0], z - 3, 2),
    ],
  },
  {
    id: "bus",
    minPhase: 0,
    weight: 2,
    late: 1,
    build: ({ z, lane }) => [{ type: "bus", lane, z }, ...coinLine(lane, z - 3, 6, 1.35, 2.55)],
  },
  {
    id: "barrier",
    minPhase: 0,
    weight: 2,
    late: 1,
    build: ({ z, lane }) => [
      { type: "barrier", lane, z },
      ...Array.from({ length: 4 }, (_, i) => ({
        type: "coin",
        lane,
        z: z + (i - 1.2) * 0.7,
        y: 1.55 + Math.sin(i) * 0.15,
      })),
    ],
  },
  {
    id: "crate",
    minPhase: 0,
    weight: 2,
    late: 1,
    build: ({ z, lane }) => [{ type: "crate", lane, z }],
  },
  {
    // Two obstacles, two lanes, close enough that the second is read while the
    // first is still being dodged. The early pile was single objects with empty
    // track between them: one trivial decision every two seconds, which is not
    // an easy game so much as an idle one.
    id: "weave",
    minPhase: 0,
    weight: 3,
    late: 2,
    build: ({ z, lanes, gap }) => [
      { type: "barrier", lane: lanes[0], z },
      { type: "crate", lane: lanes[1], z: z + gap(0.55, 11, 0.42) },
      ...jumpArc(lanes[0], z, 5),
      ...coinLine(lanes[2], z - 1, 2),
    ],
  },
  {
    // The lane a player naturally swerves into is the one that is blocked next.
    id: "lane-shift",
    minPhase: 0,
    weight: 3,
    late: 2,
    build: ({ z, lanes, gap }) => [
      { type: "train", lane: lanes[0], z },
      { type: "barrier", lane: lanes[1], z: z + gap(0.75, 16, 0.55) },
      ...roofLine("train", lanes[0], z - 3, 5),
      ...coinLine(lanes[2], z - 2, 2),
    ],
  },
  {
    // Coins arc over the barrier, so the jump pays rather than merely survives.
    id: "hop-coins",
    minPhase: 0,
    weight: 2,
    late: 1,
    build: ({ z, lane, gap }) => [
      { type: "barrier", lane, z },
      ...Array.from({ length: 5 }, (_, i) => ({
        type: "coin",
        lane,
        z: z + (i - 2) * 0.85,
        y: 1.45 + Math.sin(i * 0.85) * 0.4,
      })),
      { type: "crate", lane, z: z + gap(0.7, 14, 0.5) },
    ],
  },
  {
    id: "sign",
    /** Can only be cleared by sliding: the tunnel leans on these. */
    slide: true,
    minPhase: 1,
    weight: 3,
    late: 1,
    build: ({ z, lane }) => [
      { type: "sign", lane, z },
      { type: "coin", lane, z, y: 0.42 },
    ],
  },
  {
    id: "two-trains",
    minPhase: 1,
    weight: 2,
    late: 2,
    build: ({ z, lanes }) => [
      { type: "train", lane: lanes[0], z },
      { type: "train", lane: lanes[1], z },
      ...roofLine("train", lanes[0], z - 3, 5),
      ...coinLine(lanes[2], z - 2, 2),
    ],
  },
  {
    id: "bus-roof",
    minPhase: 1,
    weight: 2,
    late: 2,
    build: ({ z, lane }) => [
      { type: "bus", lane, z },
      ...coinLine(lane, z - 3.2, 7, 1.35, 2.55),
    ],
  },
  {
    id: "mixed",
    minPhase: 1,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap }) => [
      { type: "bus", lane: lanes[0], z },
      { type: "barrier", lane: lanes[1], z: z + gap(0.2, 4) },
      ...roofLine("bus", lanes[0], z - 3, 5),
      ...coinLine(lanes[2], z - 1, 2),
    ],
  },
  {
    id: "oncoming-bus",
    minPhase: 1,
    weight: 2,
    late: 3,
    build: ({ z, lane, others, gap }) => [
      { type: "bus", lane, z: z + gap(0.6, 16), oncoming: true },
      ...coinLine(others[0], z - 2, 4),
    ],
  },
  {
    id: "triple-barrier",
    minPhase: 2,
    weight: 2,
    late: 3,
    build: ({ z }) => [
      ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z })),
      ...ALL_LANES.map((lane) => ({ type: "coin", lane, z, y: 1.6 })),
    ],
  },
  {
    id: "triple-sign",
    /** Can only be cleared by sliding: the tunnel leans on these. */
    slide: true,
    minPhase: 2,
    weight: 2,
    late: 2,
    build: ({ z }) => [
      ...ALL_LANES.map((lane) => ({ type: "sign", lane, z })),
      ...ALL_LANES.map((lane) => ({ type: "coin", lane, z, y: 0.42 })),
    ],
  },
  {
    id: "two-bus",
    minPhase: 2,
    weight: 2,
    late: 2,
    build: ({ z, lanes, either, count }) => [
      { type: either("bus", "train"), lane: lanes[0], z },
      { type: "bus", lane: lanes[1], z },
      ...coinLine(lanes[0], z - 2, count(4), 1.35, 2.55),
    ],
  },
  {
    id: "bus-hop",
    minPhase: 2,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap, either, count }) => {
      const step = gap(0.6, 12, 0.42);
      return [
        { type: "bus", lane: lanes[0], z },
        { type: either("bus", "train"), lane: lanes[1], z: z + step },
        ...coinLine(lanes[0], z - 2, count(4), 1.35, 2.55),
        ...coinLine(lanes[1], z + step - 2, count(4), 1.35, 2.55),
      ];
    },
  },
  {
    id: "oncoming-two",
    minPhase: 2,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap }) => {
      const lead = gap(0.6, 16);
      return [
        { type: "bus", lane: lanes[0], z: z + lead, oncoming: true },
        { type: "bus", lane: lanes[1], z: z + lead + gap(0.5, 10, 0.36), oncoming: true },
        ...coinLine(lanes[2], z - 1, 3),
      ];
    },
  },
  {
    id: "zigzag",
    minPhase: 3,
    weight: 2,
    late: 3,
    build: ({ z, gap, rng, either }) => {
      // Each rung its own gap and its own vehicle. It used to be train, bus,
      // train at one spacing, in that order, every single time.
      const first = gap(0.62, 14, 0.44);
      const second = gap(0.62, 14, 0.44);
      const order = shuffled(rng, ALL_LANES);
      return [
        { type: either("train", "bus"), lane: order[0], z },
        { type: either("bus", "train"), lane: order[1], z: z + first },
        { type: either("train", "bus"), lane: order[2], z: z + first + second },
      ];
    },
  },
  {
    id: "jump-slide",
    /** Can only be cleared by sliding: the tunnel leans on these. */
    slide: true,
    minPhase: 3,
    weight: 2,
    late: 2,
    // The gate wall has to sit beyond the runner's airtime, and super sneakers
    // stretch that to ~0.96s — so this gap is sized for the boosted jump and is
    // deliberately left out of the pressure compression. Compressing it would
    // make the pattern unclearable while the power-up happens to be running.
    build: ({ z, gap }) => {
      const step = gap(1.06, 20);
      return [
        ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z })),
        ...ALL_LANES.map((lane) => ({ type: "sign", lane, z: z + step })),
      ];
    },
  },
  {
    id: "slide-jump",
    /** Can only be cleared by sliding: the tunnel leans on these. */
    slide: true,
    minPhase: 3,
    weight: 2,
    late: 2,
    build: ({ z, gap }) => {
      const step = gap(0.75, 14, 0.52);
      return [
        ...ALL_LANES.map((lane) => ({ type: "sign", lane, z })),
        ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z: z + step })),
      ];
    },
  },
  {
    id: "train-hop",
    minPhase: 3,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap }) => [
      { type: "train", lane: lanes[0], z },
      { type: "bus", lane: lanes[1], z: z + gap(0.7, 14, 0.5) },
      ...coinLine(lanes[0], z - 3, 5, 1.35, 2.8),
    ],
  },
  {
    id: "oncoming-mix",
    minPhase: 3,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap }) => [
      { type: "bus", lane: lanes[0], z },
      { type: "bus", lane: lanes[1], z: z + gap(0.8, 20, 0.58), oncoming: true },
      ...coinLine(lanes[2], z - 2, 4),
    ],
  },
  {
    id: "gauntlet",
    minPhase: 4,
    weight: 2,
    late: 4,
    build: ({ z, lanes, gap }) => {
      const first = gap(0.8, 16, 0.6);
      const second = first + gap(0.6, 12, 0.45);
      return [
        { type: "train", lane: lanes[0], z },
        ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z: z + first })),
        { type: "bus", lane: lanes[1], z: z + second },
      ];
    },
  },
  {
    id: "roof-weave",
    minPhase: 4,
    weight: 2,
    late: 4,
    build: ({ z, gap }) => {
      const step = gap(0.6, 12, 0.45);
      return [
        { type: "bus", lane: -1, z },
        { type: "bus", lane: 0, z: z + step },
        { type: "bus", lane: 1, z: z + step * 2 },
        ...coinLine(-1, z - 2, 3, 1.35, 2.55),
        ...coinLine(0, z + step - 2, 3, 1.35, 2.55),
      ];
    },
  },
  {
    // Three gates back to back. Slide, stand, slide again — the spacing is the
    // whole pattern, so it is measured from SLIDE_TIME rather than guessed.
    id: "gate-run",
    slide: true,
    minPhase: 5,
    weight: 1,
    late: 2,
    // A slide lasts SLIDE_TIME (0.7s) and cannot be renewed until it ends, so
    // the gap between two gates has to be longer than that plus a moment to
    // react — otherwise clearing the third gate means hitting the key inside a
    // window of a few hundredths of a second. The floor is set from the slide,
    // not from what looked hard on paper.
    build: ({ z, gap }) => {
      const step = gap(1.2, 26, 1.0);
      return [0, 1, 2].flatMap((i) =>
        ALL_LANES.map((lane) => ({ type: "sign", lane, z: z + step * i })),
      );
    },
  },
  {
    // Up onto the roofs, then straight back down for a jump. Both rows are
    // full-width, and both have a way through: the buses are ridden, the
    // barriers are jumped.
    id: "roof-drop",
    minPhase: 6,
    weight: 2,
    late: 4,
    build: ({ z, gap }) => [
      ...ALL_LANES.map((lane) => ({ type: "bus", lane, z })),
      ...coinLine(0, z - 2, 4, 1.35, 2.55),
      ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z: z + gap(1.15, 24) })),
    ],
  },
  {
    // Two lanes coming at you and a container parked in the third, far enough
    // apart that the lane you are pushed into is not the lane it sits in.
    id: "oncoming-storm",
    minPhase: 6,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap }) => {
      const lead = gap(0.6, 16);
      return [
        { type: "bus", lane: lanes[0], z: z + lead, oncoming: true },
        { type: "bus", lane: lanes[1], z: z + lead + gap(0.45, 10, 0.34), oncoming: true },
        { type: "crate", lane: lanes[2], z: z + lead + gap(0.9, 20, 0.66) },
        ...coinLine(lanes[2], z - 1, 4),
      ];
    },
  },
  {
    id: "triple-bus",
    minPhase: 4,
    weight: 1,
    late: 3,
    build: ({ z }) => [
      ...ALL_LANES.map((lane) => ({ type: "bus", lane, z })),
      ...coinLine(0, z - 2, 5, 1.35, 2.55),
    ],
  },
];

/** Power-up patterns are dealt on a fixed cadence rather than by weight. */
export const POWERUP_PATTERNS = {
  magnet: (z, lane) => [{ type: "magnet", lane, z, y: 1.1 }, ...coinLine(lane, z + 3, 8)],
  // The trail climbs, so where the power-up is about to take you is visible
  // before you touch it.
  jetpack: (z, lane) => [{ type: "jetpack", lane, z, y: 1.15 }, ...jetpackClimb(z + 4, lane)],
  double: (z, lane) => [{ type: "double", lane, z, y: 1.1 }, ...coinLine(lane, z + 3, 6)],
  sneakers: (z, lane) => [{ type: "sneakers", lane, z, y: 1.05 }, ...coinLine(lane, z + 3, 6)],
};

/**
 * The crow egg, dropped into a coin line.
 *
 * A trap needs a reason to be walked into, or nobody ever walks into it and it
 * may as well not exist. So the egg sits in the middle of a run of coins, at
 * coin height, where the line the player is already following goes — and the
 * neighbouring lane is given its own coins over exactly the stretch the egg
 * occupies, so bailing out is a decision with an upside rather than a penalty
 * for having been greedy.
 *
 * Both outs are moves the game has already taught: change lane, or jump it
 * (a 2.9m apex clears a coin-height pickup comfortably).
 */
export function crowEggPattern(z, context) {
  const lane = context.lane;
  const detour = lane === 0 ? context.either(-1, 1) : 0;
  const eggZ = z + 6.6;
  // Where a jump taken at the egg puts the runner back on the deck. Measured in
  // seconds of travel rather than metres, because a jump covers twelve metres
  // at the start of a run and forty-one at the end — a fixed number would make
  // this pattern a different pattern at either end of the same run.
  const landing = context.gap(JUMP_AIRTIME * 1.06, 14);

  return [
    ...coinLine(lane, z, 4),
    { type: "crowEgg", lane, z: eggZ, y: 0.75 },

    // Three coins arcing over the egg, at the height an ordinary jump reaches
    // and just above what can be taken from the ground. This is what makes the
    // egg a decision rather than a spot check: the line can be kept, if you can
    // clear the thing sitting in it.
    { type: "coin", lane, z: eggZ - 2.2, y: 2.2 },
    { type: "coin", lane, z: eggZ, y: 2.6 },
    { type: "coin", lane, z: eggZ + 2.2, y: 2.2 },

    // The line resumes where that jump lands. It used to resume 2.8m past the
    // egg, which at speed is still mid-air — so clearing the trap cost you the
    // whole rest of the line, and the only play the pattern actually had was to
    // leave the lane.
    ...coinLine(lane, eggZ + landing, 4),

    // The cautious line, and it pays about the same. Starts before the egg so
    // it is visible as an alternative while there is still time to take it.
    ...coinLine(detour, z + 4.2, 7),
  ];
}

/**
 * A diamond, put somewhere it has to be gone and got.
 *
 * The crow egg sits in the coin line because a trap has to be walked into. A
 * diamond is the opposite problem: it is worth taking, so putting it in the
 * line the player is already running would make it a free pickup on a timer
 * and the wheel would spin itself.
 *
 * So it goes in a lane of its own, with the coins in a different one. Taking it
 * costs the coin line for a moment and a lane change at speed; leaving it costs
 * a third of a spin. That is the decision, and it is the same decision each of
 * the three times.
 *
 * Nothing lethal is added: the wheel is already a gamble, and a diamond that
 * also had to be threaded between two buses would be asking a player to risk
 * the run for a coin flip. The cost is the coins and the lane, and that is all.
 */
export function diamondPattern(z, context) {
  const lane = context.lane;
  const line = context.others[0] ?? (lane === 1 ? 0 : 1);
  const stoneZ = z + 7.4;

  return [
    // The line the player is on, running past the diamond rather than through
    // it — so the choice is visible for the whole approach.
    ...coinLine(line, z, 12),

    { type: "diamond", lane, z: stoneZ, y: 0.95 },

    // Three coins on the diamond's own lane, tight around it. Not a reward for
    // going — a signpost. A lone pickup in an empty lane at fifty metres a
    // second reads as track furniture; a short line pointing at it reads as
    // somewhere to be.
    { type: "coin", lane, z: stoneZ - 3.4, y: 0.7 },
    { type: "coin", lane, z: stoneZ - 1.7, y: 0.7 },
    { type: "coin", lane, z: stoneZ + 1.7, y: 0.7 },
  ];
}

/**
 * The trail that shows where the jetpack is about to take you.
 *
 * The steps grow as the line recedes. Evenly spaced in metres they were not
 * evenly spaced on screen — a gap 1.7m further away is a smaller gap to look
 * at, so the trail closed up as it climbed and the last four coins overlapped
 * each other. Measured on a 640px frame the gaps ran 5.7, 5.4, 5.1, 4.8, 4.5,
 * 4.3 pixels against coins 5px across, so the last four sat inside each other.
 * Growing each step by the ratio the distance grows by holds them steady: five
 * coins now measure 7.7, 7.9, 7.9, 7.8.
 *
 * Five rather than seven for the same reason. Widening the spacing on its own
 * made it worse — the trail simply reached further away, and the extra distance
 * shrank the gaps faster than the extra spacing opened them.
 *
 * Height follows the distance covered rather than the coin count, so the climb
 * stays a straight line at a constant angle and finishes at the altitude the
 * power-up actually flies at.
 */
const CLIMB_COINS = 7;
const CLIMB_STEP = 3;
const CLIMB_GROWTH = 1.16;
const CLIMB_LOW = 1.8;

function jetpackClimb(z, lane) {
  const offsets = [0];
  let step = CLIMB_STEP;
  for (let i = 1; i < CLIMB_COINS; i++) {
    offsets.push(offsets[i - 1] + step);
    step *= CLIMB_GROWTH;
  }
  const span = offsets[offsets.length - 1];
  const rise = JETPACK_ALTITUDE - CLIMB_LOW;
  return offsets.map((along) => ({
    type: "coin",
    lane,
    z: z + along,
    y: CLIMB_LOW + (along / span) * rise,
  }));
}

function coinLine(lane, z, count, step = 1.5, y = 0.7) {
  return Array.from({ length: count }, (_, i) => ({ type: "coin", lane, z: z + i * step, y }));
}

/**
 * Coins along a vehicle roof.
 *
 * The point of these is that they cannot be taken from the ground: getting them
 * means timing a jump onto something lethal and riding it. Most of the coins in
 * this table used to sit in whichever lane the pattern had left empty — the
 * lane a player was going to pick anyway — so collecting them was not a choice
 * and taking the safe line cost nothing.
 */
function roofLine(type, lane, z, count, step = 1.35) {
  return coinLine(lane, z, count, step, type === "train" ? 2.8 : 2.55);
}

/**
 * Coins on the arc of a jump, so clearing an obstacle pays rather than merely
 * surviving it. Sits low enough at both ends to be met on the way up and again
 * on the way down.
 */
function jumpArc(lane, z, count = 5, spread = 0.85) {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({
    type: "coin",
    lane,
    z: z + (i - mid) * spread,
    y: 1.35 + Math.cos(((i - mid) / Math.max(1, mid)) * (Math.PI / 2)) * 0.85,
  }));
}

/**
 * Group lethal placements that sit at effectively the same Z into "rows", then
 * describe what each row demands. A row blocking all three lanes is a wall the
 * player must jump or slide, never dodge.
 */
export function describeRows(placements) {
  const rows = [];
  for (const placement of placements) {
    const spec = SPEC[placement.type];
    if (!spec?.lethal) continue;

    let row = rows.find((r) => Math.abs(r.z - placement.z) <= Math.max(1, spec.depth));
    if (!row) {
      row = { z: placement.z, lanes: new Set(), clears: new Set(), rideable: false };
      rows.push(row);
    }
    row.lanes.add(placement.lane);
    if (spec.clear) row.clears.add(spec.clear);
    if (spec.rideable) row.rideable = true;
  }

  return rows
    .map((row) => ({
      z: row.z,
      lanes: [...row.lanes].sort(),
      isWall: row.lanes.size >= ALL_LANES.length,
      // A wall of rideable vehicles is cleared by landing on a roof — but only
      // when riding is the *only* thing on offer. A gate wall with a train
      // standing in one of its lanes was being called a mount: you would land
      // on the roof and straight into the gate above it. The explicit move
      // wins, and the vehicle's lane is simply one nobody can use.
      requires:
        [...row.clears][0] ??
        (row.rideable && row.lanes.size >= ALL_LANES.length ? "mount" : null),
      rideable: row.rideable,
    }))
    .sort((a, b) => a.z - b.z);
}

/**
 * Full metadata for one materialised pattern.
 *
 * @param {number} z pattern start
 * @param {Array} placements
 */
export function describePattern(z, placements) {
  const rows = describeRows(placements);
  let end = z;
  let exitVehicleZ = null;

  for (const placement of placements) {
    const spec = SPEC[placement.type] ?? { length: 1, rideable: false };
    end = Math.max(end, placement.z + spec.length * 0.5);
    if (spec.rideable) exitVehicleZ = Math.max(exitVehicleZ ?? -Infinity, placement.z + spec.length * 0.5);
  }

  return {
    span: end - z,
    rows,
    entryRow: rows[0] ?? null,
    /** Downtrack edge of the last vehicle a player could still be riding. */
    exitVehicleZ,
    hasWall: rows.some((row) => row.isWall),
  };
}

/** Patterns unlocked at a given difficulty phase, expanded by weight. */
/**
 * The draw pile for a phase.
 *
 * `slideBias` (0..1) multiplies how many copies of the slide-under layouts go
 * into the pile, which is how a tunnel's low roof turns into something the
 * player has to do rather than just something they can see. At 1 they are four
 * times as likely as usual — enough to define the section, not so much that it
 * becomes the only obstacle in it.
 */
export const SLIDE_BIAS_MAX = 3;

/** The phase at which `late` weights are fully in effect. */
const FULL_PHASE = 6;

/**
 * A pattern's share of the pile at this phase.
 *
 * Unlocking harder layouts was not enough on its own: the single-obstacle
 * openers keep their weight forever, so a late run was mostly one bus at a time
 * arriving very fast — quick, but not actually harder to read. `late` is the
 * weight a pattern drifts towards as the run winds up, which thins the fillers
 * out and lets the gauntlets take the space. Never below one copy, so nothing
 * ever disappears from the run entirely.
 */
export function weightAt(pattern, phaseId) {
  const late = pattern.late ?? pattern.weight;
  const span = Math.max(1, FULL_PHASE - pattern.minPhase);
  const t = Math.min(1, Math.max(0, (phaseId - pattern.minPhase) / span));
  return Math.max(1, Math.round(pattern.weight + (late - pattern.weight) * t));
}

export function candidatesFor(phaseId, slideBias = 0) {
  const bias = Math.min(1, Math.max(0, slideBias));
  const pool = [];
  for (const pattern of PATTERNS) {
    if (pattern.section || pattern.minPhase > phaseId) continue;
    const extra = pattern.slide ? 1 + SLIDE_BIAS_MAX * bias : 1;
    const copies = Math.round(weightAt(pattern, phaseId) * extra);
    for (let i = 0; i < copies; i++) pool.push(pattern);
  }
  return pool;
}

export function patternById(id) {
  return PATTERNS.find((pattern) => pattern.id === id) ?? null;
}

/**
 * Longest a runner can be committed to the air — the boosted jump, not the base
 * one, since super sneakers can be running at any moment.
 */
export const BOOSTED_AIRTIME = (2 * JUMP_V * SNEAKER_JUMP_MULT) / -GRAVITY;

/** Bare reaction time, when the runner arrives at a wall uncommitted. */
export const BASE_LEAD_SECONDS = 0.34;
/** Dropping off a roof, which a mounted runner must do before a wall. */
export const DISMOUNT_LEAD_SECONDS = 0.6;

/**
 * A wall of vehicles asks for a jump timed to land on the roof — not just any
 * jump, which is what the old rule assumed when it handed mount walls the bare
 * reaction time. At fifty metres a second that was seventeen metres of warning
 * for a jump that has to be right to within a tenth of a second, and coming
 * straight out of a gate the runner is still on the floor when it appears.
 */
export const MOUNT_LEAD_SECONDS = 0.8;
/** Out of a slide the runner has to stand before the jump is worth anything. */
export const MOUNT_AFTER_SLIDE_SECONDS = 1.0;

/** A lane change settles in about this long, and can be started in mid-air. */
export const LANE_CHANGE_SECONDS = 0.19;
/** Time to see a hazard and answer it. */
export const REACTION_SECONDS = 0.22;

/**
 * The window in which a second gate cannot be answered.
 *
 * A slide runs for SLIDE_TIME and cannot be renewed while it is running. A gate
 * arriving inside that window is still covered by the first slide; one arriving
 * well after it can be answered with a second. In between there is nothing the
 * runner can do — the slide has just ended and there is no time to start
 * another. It is a forbidden band rather than a minimum, which is why no amount
 * of extra spacing was ever going to fix it.
 */
export const SLIDE_DEAD_BAND = [SLIDE_TIME - 0.06, SLIDE_TIME + REACTION_SECONDS];

/**
 * Lanes the runner can be in on the far side of a row.
 *
 * A wall leaves all three: it is answered by jumping, sliding or riding it
 * rather than by picking a lane, so it does not decide where the runner ends up.
 */
function passableLanes(row) {
  return row.isWall ? ALL_LANES : ALL_LANES.filter((lane) => !row.lanes.includes(lane));
}

/**
 * Seconds two consecutive rows need between them for the second to be
 * answerable at all.
 *
 * One rule with two readers: the spawner enforces it when it places a pattern,
 * and scripts/fairness-audit.mjs checks the result. Written down once because
 * the two drifting apart is how a layout nobody can clear ships.
 */
export function requiredGapSeconds(previous, next) {
  if (!previous || !next) return 0;
  if (next.isWall) return requiredLeadSeconds(previous, next);

  const runsThrough = passableLanes(previous).some((lane) => passableLanes(next).includes(lane));
  if (runsThrough) return 0;

  // No lane clears both. Either answer the second row with its own move…
  if (next.requires === "jump" || next.requires === "slide") return REACTION_SECONDS;
  // …or swerve into a free lane, which has to settle before the row arrives.
  return LANE_CHANGE_SECONDS + REACTION_SECONDS;
}

/** True when a gap lands where a slide cannot be renewed in time. */
export function inSlideDeadBand(previous, next, seconds) {
  return (
    previous?.requires === "slide" &&
    next?.requires === "slide" &&
    seconds > SLIDE_DEAD_BAND[0] &&
    seconds < SLIDE_DEAD_BAND[1]
  );
}

/**
 * How long the runner needs between the last hazard and an oncoming wall.
 *
 * A wall has exactly one way through, so it is the one obstacle that cannot be
 * answered while already committed to something else. Anything that leaves the
 * runner in the air or on a roof therefore has to finish first.
 *
 * @param {{ requires: string|null, rideable: boolean }|null} previousRow
 * @param {{ requires: string|null }} wallRow the wall being approached
 */
export function requiredLeadSeconds(previousRow, wallRow) {
  if (!previousRow) return 0;

  let seconds = BASE_LEAD_SECONDS;
  if (previousRow.rideable) seconds = Math.max(seconds, DISMOUNT_LEAD_SECONDS);
  // A jump commits the runner for its whole airtime; a slide can be cancelled
  // into a jump instantly, so it costs nothing beyond reaction.
  if (previousRow.requires === "jump") seconds = Math.max(seconds, BOOSTED_AIRTIME + 0.1);

  if (wallRow?.requires === "mount") {
    seconds = Math.max(seconds, MOUNT_LEAD_SECONDS);
    if (previousRow.requires === "slide") {
      seconds = Math.max(seconds, MOUNT_AFTER_SLIDE_SECONDS);
    }
  }
  return seconds;
}

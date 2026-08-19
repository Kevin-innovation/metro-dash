import { GRAVITY, JUMP_V, SLIDE_TIME, SNEAKER_JUMP_MULT } from "./config.js";
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
    build: ({ z, lane, others }) => [
      { type: "train", lane, z },
      ...coinLine(others[0], z - 4, 5),
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
      ...coinLine(lanes[2], z - 1, 4),
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
      ...coinLine(lanes[2], z - 2, 5),
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
      ...coinLine(lanes[2], z - 2, 4),
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
      ...coinLine(lanes[2], z - 1, 6),
    ],
  },
  {
    id: "oncoming-bus",
    minPhase: 1,
    weight: 2,
    late: 3,
    build: ({ z, lane, others, gap }) => [
      { type: "bus", lane, z: z + gap(0.6, 16), oncoming: true },
      ...coinLine(others[0], z - 2, 5),
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
    build: ({ z, lanes }) => [
      { type: "bus", lane: lanes[0], z },
      { type: "bus", lane: lanes[1], z },
      ...coinLine(lanes[0], z - 2, 4, 1.35, 2.55),
    ],
  },
  {
    id: "bus-hop",
    minPhase: 2,
    weight: 2,
    late: 3,
    build: ({ z, lanes, gap }) => {
      const step = gap(0.6, 12, 0.42);
      return [
        { type: "bus", lane: lanes[0], z },
        { type: "bus", lane: lanes[1], z: z + step },
        ...coinLine(lanes[0], z - 2, 4, 1.35, 2.55),
        ...coinLine(lanes[1], z + step - 2, 4, 1.35, 2.55),
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
        ...coinLine(lanes[2], z - 1, 5),
      ];
    },
  },
  {
    id: "zigzag",
    minPhase: 3,
    weight: 2,
    late: 3,
    build: ({ z, gap }) => {
      const step = gap(0.62, 14, 0.44);
      return [
        { type: "train", lane: -1, z },
        { type: "bus", lane: 0, z: z + step },
        { type: "train", lane: 1, z: z + step * 2 },
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
      ...coinLine(lanes[2], z - 2, 5),
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
  jetpack: (z, lane) => [{ type: "jetpack", lane, z, y: 1.15 }, ...coinLine(lane, z + 4, 6, 1.5, 2.9)],
  double: (z, lane) => [{ type: "double", lane, z, y: 1.1 }, ...coinLine(lane, z + 3, 6)],
  sneakers: (z, lane) => [{ type: "sneakers", lane, z, y: 1.05 }, ...coinLine(lane, z + 3, 6)],
};

function coinLine(lane, z, count, step = 1.5, y = 0.7) {
  return Array.from({ length: count }, (_, i) => ({ type: "coin", lane, z: z + i * step, y }));
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
      // A wall of rideable vehicles is cleared by landing on a roof.
      requires: row.rideable && row.lanes.size >= ALL_LANES.length ? "mount" : [...row.clears][0] ?? null,
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

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
 *   gap(seconds, minMetres)  metres covered in that much running time
 */
export const PATTERNS = [
  {
    id: "coins",
    minPhase: 0,
    weight: 3,
    build: ({ z, lane }) => coinLine(lane, z, 7, 1.6, 0.7),
  },
  {
    id: "train",
    minPhase: 0,
    weight: 3,
    build: ({ z, lane, others }) => [
      { type: "train", lane, z },
      ...coinLine(others[0], z - 4, 5),
    ],
  },
  {
    id: "bus",
    minPhase: 0,
    weight: 3,
    build: ({ z, lane }) => [{ type: "bus", lane, z }, ...coinLine(lane, z - 3, 6, 1.35, 2.55)],
  },
  {
    id: "barrier",
    minPhase: 0,
    weight: 3,
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
    build: ({ z, lane }) => [{ type: "crate", lane, z }],
  },
  {
    id: "sign",
    minPhase: 1,
    weight: 3,
    build: ({ z, lane }) => [
      { type: "sign", lane, z },
      { type: "coin", lane, z, y: 0.42 },
    ],
  },
  {
    id: "two-trains",
    minPhase: 1,
    weight: 2,
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
    build: ({ z, lane }) => [
      { type: "bus", lane, z },
      ...coinLine(lane, z - 3.2, 7, 1.35, 2.55),
    ],
  },
  {
    id: "mixed",
    minPhase: 1,
    weight: 2,
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
    build: ({ z, lane, others, gap }) => [
      { type: "bus", lane, z: z + gap(0.6, 16), oncoming: true },
      ...coinLine(others[0], z - 2, 5),
    ],
  },
  {
    id: "triple-barrier",
    minPhase: 2,
    weight: 2,
    build: ({ z }) => [
      ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z })),
      ...ALL_LANES.map((lane) => ({ type: "coin", lane, z, y: 1.6 })),
    ],
  },
  {
    id: "triple-sign",
    minPhase: 2,
    weight: 2,
    build: ({ z }) => [
      ...ALL_LANES.map((lane) => ({ type: "sign", lane, z })),
      ...ALL_LANES.map((lane) => ({ type: "coin", lane, z, y: 0.42 })),
    ],
  },
  {
    id: "two-bus",
    minPhase: 2,
    weight: 2,
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
    build: ({ z, lanes, gap }) => {
      const step = gap(0.6, 12);
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
    build: ({ z, lanes, gap }) => {
      const lead = gap(0.6, 16);
      return [
        { type: "bus", lane: lanes[0], z: z + lead, oncoming: true },
        { type: "bus", lane: lanes[1], z: z + lead + gap(0.5, 10), oncoming: true },
        ...coinLine(lanes[2], z - 1, 5),
      ];
    },
  },
  {
    id: "zigzag",
    minPhase: 3,
    weight: 2,
    build: ({ z, gap }) => {
      const step = gap(0.62, 14);
      return [
        { type: "train", lane: -1, z },
        { type: "bus", lane: 0, z: z + step },
        { type: "train", lane: 1, z: z + step * 2 },
      ];
    },
  },
  {
    id: "jump-slide",
    minPhase: 3,
    weight: 2,
    // Jump airtime is ~0.74s, so the gate wall has to sit at least that far
    // downtrack or the pattern cannot be cleared at speed.
    build: ({ z, gap }) => {
      const step = gap(0.95, 18);
      return [
        ...ALL_LANES.map((lane) => ({ type: "barrier", lane, z })),
        ...ALL_LANES.map((lane) => ({ type: "sign", lane, z: z + step })),
      ];
    },
  },
  {
    id: "slide-jump",
    minPhase: 3,
    weight: 2,
    build: ({ z, gap }) => {
      const step = gap(0.75, 14);
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
    build: ({ z, lanes, gap }) => [
      { type: "train", lane: lanes[0], z },
      { type: "bus", lane: lanes[1], z: z + gap(0.7, 14) },
      ...coinLine(lanes[0], z - 3, 5, 1.35, 2.8),
    ],
  },
  {
    id: "oncoming-mix",
    minPhase: 3,
    weight: 2,
    build: ({ z, lanes, gap }) => [
      { type: "bus", lane: lanes[0], z },
      { type: "bus", lane: lanes[1], z: z + gap(0.8, 20), oncoming: true },
      ...coinLine(lanes[2], z - 2, 5),
    ],
  },
  {
    id: "gauntlet",
    minPhase: 4,
    weight: 2,
    build: ({ z, lanes, gap }) => {
      const first = gap(0.8, 16);
      const second = first + gap(0.6, 12);
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
    build: ({ z, gap }) => {
      const step = gap(0.6, 12);
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
    id: "triple-bus",
    minPhase: 4,
    weight: 1,
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
export function candidatesFor(phaseId) {
  const pool = [];
  for (const pattern of PATTERNS) {
    if (pattern.minPhase > phaseId) continue;
    for (let i = 0; i < pattern.weight; i++) pool.push(pattern);
  }
  return pool;
}

export function patternById(id) {
  return PATTERNS.find((pattern) => pattern.id === id) ?? null;
}

/**
 * Extra clearance a pattern needs beyond the usual reaction gap.
 *
 * The dangerous case is riding a roof into a full-lane wall: a mounted runner
 * cannot slide, so they need room to drop off first.
 *
 * @param {ReturnType<describePattern>|null} previous
 * @param {ReturnType<describePattern>} next
 * @param {number} speed
 */
export function fairnessClearance(previous, next, speed) {
  if (!previous?.exitVehicleZ || !next.entryRow?.isWall) return 0;
  // Drop from a roof (~0.25s) plus a beat to read the wall and react.
  return speed * 0.75;
}

import { describe, expect, it } from "vitest";
import { MAX_SPEED, START_SPEED } from "../src/config.js";
import { PHASES } from "../src/pace.js";
import {
  ALL_LANES,
  PATTERNS,
  POWERUP_PATTERNS,
  candidatesFor,
  describePattern,
  describeRows,
  fairnessClearance,
} from "../src/patterns.js";
import { POWERUP_IDS } from "../src/powerups.js";
import { SPEC } from "../src/specs.js";

const contextAt = (z, speed) => ({
  z,
  lane: 0,
  lanes: [-1, 0, 1],
  others: [-1, 1],
  gap: (seconds, min) => Math.max(min, speed * seconds),
});

const buildAll = (speed) =>
  PATTERNS.map((pattern) => ({
    pattern,
    placements: pattern.build(contextAt(0, speed)),
  }));

describe("pattern table", () => {
  it("has unique ids", () => {
    const ids = PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only emits known entity types into real lanes", () => {
    for (const speed of [START_SPEED, MAX_SPEED]) {
      for (const { pattern, placements } of buildAll(speed)) {
        expect(placements.length, pattern.id).toBeGreaterThan(0);
        for (const placement of placements) {
          expect(SPEC[placement.type], `${pattern.id}: ${placement.type}`).toBeDefined();
          expect(ALL_LANES, pattern.id).toContain(placement.lane);
          expect(Number.isFinite(placement.z), pattern.id).toBe(true);
        }
      }
    }
  });

  it("unlocks progressively across the phases", () => {
    let previous = 0;
    for (const phase of PHASES) {
      const count = new Set(candidatesFor(phase.id).map((p) => p.id)).size;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
    expect(candidatesFor(0).length).toBeGreaterThan(0);
  });

  it("offers something to run at every phase", () => {
    for (const phase of PHASES) expect(candidatesFor(phase.id).length).toBeGreaterThan(2);
  });
});

describe("pattern fairness", () => {
  it("never blocks all three lanes with something that cannot be cleared", () => {
    for (const speed of [START_SPEED, 30, MAX_SPEED]) {
      for (const { pattern, placements } of buildAll(speed)) {
        for (const row of describeRows(placements)) {
          if (!row.isWall) continue;
          // A wall must state exactly one way through.
          expect(row.requires, `${pattern.id} @ z=${row.z}`).toBeTruthy();
          expect(["jump", "slide", "mount"], pattern.id).toContain(row.requires);
        }
      }
    }
  });

  it("never mixes jump-only and slide-only obstacles in the same row", () => {
    for (const speed of [START_SPEED, MAX_SPEED]) {
      for (const { pattern, placements } of buildAll(speed)) {
        const rows = new Map();
        for (const placement of placements) {
          const spec = SPEC[placement.type];
          if (!spec.clear) continue;
          const key = Math.round(placement.z * 2);
          const set = rows.get(key) ?? new Set();
          set.add(spec.clear);
          rows.set(key, set);
        }
        for (const [, kinds] of rows) {
          expect(kinds.size, `${pattern.id} demands ${[...kinds]} at once`).toBe(1);
        }
      }
    }
  });

  it("spaces consecutive walls far enough apart to land and react", () => {
    // Jump airtime is ~0.74s; a wall pair closer than that in time is a trap.
    for (const speed of [START_SPEED, 30, MAX_SPEED]) {
      for (const { pattern, placements } of buildAll(speed)) {
        const walls = describeRows(placements).filter((row) => row.isWall && row.requires !== "mount");
        for (let i = 1; i < walls.length; i++) {
          const seconds = (walls[i].z - walls[i - 1].z) / speed;
          expect(seconds, `${pattern.id} wall gap at speed ${speed}`).toBeGreaterThan(0.74);
        }
      }
    }
  });

  it("keeps layouts from stretching without bound as speed rises", () => {
    for (const { pattern, placements } of buildAll(MAX_SPEED)) {
      expect(describePattern(0, placements).span, pattern.id).toBeLessThan(250);
    }
  });
});

describe("describePattern", () => {
  it("measures the span out to the far edge of the last entity", () => {
    const meta = describePattern(0, [{ type: "train", lane: 0, z: 20 }]);
    expect(meta.span).toBeCloseTo(20 + SPEC.train.length * 0.5);
  });

  it("reports the exit edge of a rideable vehicle", () => {
    const meta = describePattern(0, [
      { type: "barrier", lane: 0, z: 4 },
      { type: "bus", lane: 1, z: 30 },
    ]);
    expect(meta.exitVehicleZ).toBeCloseTo(30 + SPEC.bus.length * 0.5);
  });

  it("has no vehicle exit when nothing is rideable", () => {
    const meta = describePattern(0, [{ type: "barrier", lane: 0, z: 4 }]);
    expect(meta.exitVehicleZ).toBe(null);
  });

  it("ignores coins and power-ups when describing hazards", () => {
    const meta = describePattern(0, [
      { type: "coin", lane: 0, z: 2 },
      { type: "magnet", lane: 1, z: 4 },
    ]);
    expect(meta.rows).toHaveLength(0);
    expect(meta.hasWall).toBe(false);
  });
});

describe("fairnessClearance", () => {
  const wall = describePattern(0, ALL_LANES.map((lane) => ({ type: "sign", lane, z: 0 })));
  const withBus = describePattern(0, [{ type: "bus", lane: 0, z: 10 }]);
  const plain = describePattern(0, [{ type: "barrier", lane: 0, z: 5 }]);

  it("adds room when a roof ride runs straight into a full-lane wall", () => {
    // A mounted runner cannot slide, so they need space to drop off first.
    expect(fairnessClearance(withBus, wall, 40)).toBeGreaterThan(0);
  });

  it("adds nothing when the previous pattern had no vehicle", () => {
    expect(fairnessClearance(plain, wall, 40)).toBe(0);
  });

  it("adds nothing when the next pattern is not a wall", () => {
    expect(fairnessClearance(withBus, plain, 40)).toBe(0);
  });

  it("handles the very first pattern of a run", () => {
    expect(fairnessClearance(null, wall, 40)).toBe(0);
  });

  it("scales with speed", () => {
    expect(fairnessClearance(withBus, wall, 50)).toBeGreaterThan(
      fairnessClearance(withBus, wall, 20),
    );
  });
});

describe("power-up patterns", () => {
  it("exist for every power-up and drop exactly one pickup", () => {
    for (const id of POWERUP_IDS) {
      const build = POWERUP_PATTERNS[id];
      expect(build, id).toBeDefined();
      const placements = build(0, 0);
      const pickups = placements.filter((p) => SPEC[p.type].powerup);
      expect(pickups, id).toHaveLength(1);
      expect(pickups[0].type).toBe(id);
    }
  });

  it("never place a lethal obstacle in the reward lane", () => {
    for (const id of POWERUP_IDS) {
      for (const placement of POWERUP_PATTERNS[id](0, 0)) {
        expect(SPEC[placement.type].lethal, `${id}: ${placement.type}`).toBe(false);
      }
    }
  });
});

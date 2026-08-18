import { describe, expect, it } from "vitest";
import { GRAVITY, JUMP_V, MAX_SPEED, SNEAKER_JUMP_MULT, START_SPEED } from "../src/config.js";
import { PHASES } from "../src/pace.js";
import {
  ALL_LANES,
  BASE_LEAD_SECONDS,
  BOOSTED_AIRTIME,
  DISMOUNT_LEAD_SECONDS,
  PATTERNS,
  POWERUP_PATTERNS,
  candidatesFor,
  describePattern,
  describeRows,
  requiredLeadSeconds,
} from "../src/patterns.js";
import { POWERUP_IDS } from "../src/powerups.js";
import { SPEC } from "../src/specs.js";

const contextAt = (z, speed, pressure = 0) => ({
  z,
  lane: 0,
  lanes: [-1, 0, 1],
  others: [-1, 1],
  // Mirrors Spawner.gapFor, including the pressure compression.
  gap: (seconds, min, floor = seconds) =>
    Math.max(min, speed * (seconds + (floor - seconds) * pressure)),
});

const buildAll = (speed, pressure = 0) =>
  PATTERNS.map((pattern) => ({
    pattern,
    placements: pattern.build(contextAt(0, speed, pressure)),
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
    // Longest airtime the game can produce — super sneakers, not the base jump.
    // Sizing to the base jump would make these patterns unclearable whenever the
    // power-up happened to be running.
    const boostedAirtime = (2 * JUMP_V * SNEAKER_JUMP_MULT) / -GRAVITY;
    // A slide can be cancelled into a jump instantly, so leaving one only costs
    // reaction time.
    const required = (previous) => (previous.requires === "jump" ? boostedAirtime : 0.34);

    // Checked at full pressure too, since that is where the gaps are tightest.
    for (const pressure of [0, 0.5, 1]) {
      for (const speed of [START_SPEED, 30, MAX_SPEED]) {
        for (const { pattern, placements } of buildAll(speed, pressure)) {
          const walls = describeRows(placements).filter(
            (row) => row.isWall && row.requires !== "mount",
          );
          for (let i = 1; i < walls.length; i++) {
            const seconds = (walls[i].z - walls[i - 1].z) / speed;
            expect(
              seconds,
              `${pattern.id} wall gap at speed ${speed}, pressure ${pressure}`,
            ).toBeGreaterThan(required(walls[i - 1]));
          }
        }
      }
    }
  });

  it("never lets pressure invert a pattern's ordering", () => {
    // A compressed gap must still be positive, or stages would spawn behind
    // each other and the layout would stop meaning anything.
    for (const speed of [START_SPEED, MAX_SPEED]) {
      for (const { pattern, placements } of buildAll(speed, 1)) {
        const zs = placements.map((p) => p.z);
        expect(Math.min(...zs), pattern.id).toBeGreaterThan(-60);
        expect(Math.max(...zs) - Math.min(...zs), pattern.id).toBeLessThan(250);
      }
    }
  });

  it("gets tighter under pressure without collapsing", () => {
    let tightened = 0;
    for (let i = 0; i < PATTERNS.length; i++) {
      const relaxed = describePattern(0, buildAll(MAX_SPEED, 0)[i].placements).span;
      const wound = describePattern(0, buildAll(MAX_SPEED, 1)[i].placements).span;
      expect(wound, PATTERNS[i].id).toBeLessThanOrEqual(relaxed + 1e-6);
      if (wound < relaxed - 1e-6) tightened += 1;
    }
    // The multi-stage layouts are the ones that carry the difficulty ramp.
    expect(tightened).toBeGreaterThanOrEqual(5);
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

describe("requiredLeadSeconds", () => {
  const wall = { requires: "slide", isWall: true };
  const vehicleWall = { requires: "mount", isWall: true };
  const jumpRow = { requires: "jump", rideable: false };
  const slideRow = { requires: "slide", rideable: false };
  const vehicleRow = { requires: null, rideable: true };

  it("asks for nothing when there is no prior hazard", () => {
    expect(requiredLeadSeconds(null, wall)).toBe(0);
  });

  it("covers the whole boosted airtime after a jump", () => {
    // Sized to super sneakers, not the base jump: the power-up can be running
    // at any moment, and a wall that only fits the base jump would be a trap.
    expect(requiredLeadSeconds(jumpRow, wall)).toBeGreaterThan(BOOSTED_AIRTIME);
  });

  it("only asks for reaction time after a slide", () => {
    // A slide can be cancelled straight into a jump.
    expect(requiredLeadSeconds(slideRow, wall)).toBe(BASE_LEAD_SECONDS);
  });

  it("leaves room to drop off a roof", () => {
    expect(requiredLeadSeconds(vehicleRow, wall)).toBe(DISMOUNT_LEAD_SECONDS);
  });

  it("does not penalise arriving airborne at a wall of vehicles", () => {
    // Being in the air is how a vehicle wall is cleared at all.
    expect(requiredLeadSeconds(jumpRow, vehicleWall)).toBe(BASE_LEAD_SECONDS);
  });

  it("never returns less than plain reaction time for a real hazard", () => {
    for (const row of [jumpRow, slideRow, vehicleRow]) {
      expect(requiredLeadSeconds(row, wall)).toBeGreaterThanOrEqual(BASE_LEAD_SECONDS);
    }
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

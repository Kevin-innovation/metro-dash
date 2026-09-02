import { describe, expect, it } from "vitest";
import { CROW_TIME } from "../src/config.js";
import { crowVeil } from "../src/crow.js";
import { crowEggPattern } from "../src/patterns.js";
import { makeRng } from "../src/rng.js";
import { patternContext } from "../src/spawner.js";
import { HAZARD_PICKUPS, SPEC } from "../src/specs.js";
import { POWERUP_IDS } from "../src/powerups.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

describe("crow veil curve", () => {
  it("is nothing before the egg is taken and nothing after it wears off", () => {
    expect(crowVeil(0)).toBe(0);
    expect(crowVeil(-1)).toBe(0);
  });

  it("ramps in, holds, and lets go", () => {
    // Ramping in: the first fraction of a second is not yet full darkness.
    expect(crowVeil(CROW_TIME, CROW_TIME)).toBe(0);
    expect(crowVeil(CROW_TIME - 0.16, CROW_TIME)).toBeCloseTo(0.5, 1);
    // Held through the middle.
    expect(crowVeil(CROW_TIME / 2, CROW_TIME)).toBe(1);
    // Lifting at the end.
    expect(crowVeil(0.35, CROW_TIME)).toBeLessThan(1);
    expect(crowVeil(0.35, CROW_TIME)).toBeGreaterThan(0);
  });

  it("never leaves the 0-1 range at any point of the run", () => {
    for (let r = 0; r <= CROW_TIME; r += 0.05) {
      const v = crowVeil(r, CROW_TIME);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("lifts faster than it falls, so vision comes back gently", () => {
    // 0.3s in versus 0.3s from the end.
    expect(crowVeil(CROW_TIME - 0.3, CROW_TIME)).toBeGreaterThan(crowVeil(0.3, CROW_TIME));
  });
});

describe("crow egg as a pickup", () => {
  it("is a hazard and not a power-up, so nothing in the shop can buy it", () => {
    expect(HAZARD_PICKUPS).toContain("crowEgg");
    expect(POWERUP_IDS).not.toContain("crowEgg");
    expect(POWERUP_IDS).not.toContain("crow");
    expect(SPEC.crowEgg.powerup).toBeUndefined();
    expect(SPEC.crowEgg.hazard).toBe("crow");
  });

  it("is never lethal — it costs sight, not the run", () => {
    expect(SPEC.crowEgg.lethal).toBe(false);
  });
});

describe("crow egg pattern", () => {
  /** The real context the spawner hands a pattern, at a mid-run speed. */
  const context = (speed = 40, seed = 1) => ({
    ...patternContext({ z: 0, speed, pressure: 0, rng: makeRng(seed) }),
    lane: 0,
  });
  const placements = () => crowEggPattern(0, context());

  it("drops exactly one egg", () => {
    const eggs = placements().filter((p) => p.type === "crowEgg");
    expect(eggs).toHaveLength(1);
  });

  it("places nothing lethal, so the trap is always survivable", () => {
    for (const p of placements()) expect(SPEC[p.type].lethal, p.type).toBe(false);
  });

  it("sits in a coin line, which is what gives it a reason to be taken", () => {
    const all = placements();
    const egg = all.find((p) => p.type === "crowEgg");
    const sameLane = all.filter((p) => p.type === "coin" && p.lane === egg.lane);
    expect(sameLane.some((c) => c.z < egg.z)).toBe(true);
    expect(sameLane.some((c) => c.z > egg.z)).toBe(true);
  });

  it("offers a paying way out in another lane, overlapping the egg", () => {
    const all = placements();
    const egg = all.find((p) => p.type === "crowEgg");
    const escape = all.filter((p) => p.type === "coin" && p.lane !== egg.lane);
    expect(escape.length).toBeGreaterThan(0);
    // Visible before the egg is reached, or it is not an alternative.
    expect(Math.min(...escape.map((c) => c.z))).toBeLessThan(egg.z);
  });

  it("keeps the egg at coin height, so an ordinary jump clears it", () => {
    const egg = placements().find((p) => p.type === "crowEgg");
    expect(egg.y).toBeLessThan(1);
  });

  it("arcs coins over the egg, so clearing it is paid rather than merely safe", () => {
    const all = placements();
    const egg = all.find((p) => p.type === "crowEgg");
    const arc = all.filter((p) => p.type === "coin" && p.lane === egg.lane && p.y > 1.5);
    expect(arc.length).toBeGreaterThan(0);
    // Above what can be reached from the deck, or the jump buys nothing.
    for (const coin of arc) expect(coin.y).toBeGreaterThan(2.1);
  });

  it("resumes the line where that jump lands, at any speed", () => {
    // It used to resume 2.8m past the egg — still mid-air at speed, so clearing
    // the trap cost the whole rest of the line and the only play was to leave.
    for (const speed of [20, 40, 56]) {
      const all = crowEggPattern(0, context(speed));
      const egg = all.find((p) => p.type === "crowEgg");
      const after = all
        .filter((p) => p.type === "coin" && p.lane === egg.lane && p.y < 1 && p.z > egg.z)
        .sort((a, b) => a.z - b.z)[0];
      const airborne = speed * ((2 * 16.2) / 44);
      expect(after.z - egg.z, `speed ${speed}`).toBeGreaterThan(airborne);
      // And not so far past it that the line reads as a separate pattern.
      expect(after.z - egg.z, `speed ${speed}`).toBeLessThan(airborne * 1.4);
    }
  });

  it("pays the cautious line about what the greedy one pays", () => {
    // Otherwise dodging is a penalty for having been careful.
    const all = placements();
    const egg = all.find((p) => p.type === "crowEgg");
    const detour = all.filter((p) => p.type === "coin" && p.lane !== egg.lane).length;
    const through = all.filter((p) => p.type === "coin" && p.lane === egg.lane).length;
    expect(detour).toBeGreaterThanOrEqual(through / 2);
  });
});

describe("run bookkeeping", () => {
  it("tracks the crow outside the power-up table", () => {
    const run = new Run(store());
    run.addHazard("crow");
    expect(run.crowActive()).toBe(true);
    for (const id of POWERUP_IDS) expect(run.powerups[id]).toBe(0);
  });

  it("refreshes rather than stacks", () => {
    const run = new Run(store());
    run.addHazard("crow");
    run.advance(1, { travelled: 0, mounted: false });
    run.addHazard("crow");
    expect(run.crowT).toBe(CROW_TIME);
  });

  it("ticks down with the run and expires", () => {
    const run = new Run(store());
    run.addHazard("crow");
    run.advance(CROW_TIME + 0.1, { travelled: 0, mounted: false });
    expect(run.crowActive()).toBe(false);
    expect(run.crowT).toBe(0);
  });

  it("counts crows taken, for missions and the breakdown", () => {
    const run = new Run(store());
    run.addHazard("crow");
    run.addHazard("crow");
    expect(run.metrics.crows).toBe(2);
  });

  it("is cleared on death, so the game-over card is never behind the veil", () => {
    const run = new Run(store());
    run.addHazard("crow");
    run.clearPowerups();
    expect(run.crowT).toBe(0);
  });

  it("ignores hazards it does not know about", () => {
    const run = new Run(store());
    run.addHazard("wasp");
    expect(run.crowT).toBe(0);
  });
});

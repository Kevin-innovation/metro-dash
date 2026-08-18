import { describe, expect, it } from "vitest";
import {
  FIXED_DT,
  MAX_SPEED,
  PRESSURE_FULL_AT,
  PRESSURE_STARTS_AT,
  REACTION_EASY,
  REACTION_HARD,
  START_SPEED,
} from "../src/config.js";
import { PHASES, phaseAt, pressureAt, reactionAt, speedAt } from "../src/pace.js";

describe("speedAt", () => {
  it("starts at the run's opening speed", () => {
    expect(speedAt(0)).toBe(START_SPEED);
  });

  it("never decreases", () => {
    let previous = -Infinity;
    for (let t = 0; t <= 400; t += 0.5) {
      const speed = speedAt(t);
      expect(speed).toBeGreaterThanOrEqual(previous);
      previous = speed;
    }
  });

  it("is continuous across every phase boundary", () => {
    for (const phase of PHASES.slice(1)) {
      const before = speedAt(phase.t - 1e-6);
      const after = speedAt(phase.t);
      expect(Math.abs(after - before)).toBeLessThan(0.5);
    }
  });

  it("is clamped to MAX_SPEED forever", () => {
    expect(speedAt(1e5)).toBeLessThanOrEqual(MAX_SPEED);
    expect(speedAt(600)).toBe(MAX_SPEED);
  });

  it("keeps per-step travel below the thinnest obstacle's depth window", () => {
    // The swept test makes this non-critical, but keeping the fixed step small
    // enough that even a point sample would land inside the band is a cheap
    // second line of defence.
    const thinnestDepth = 0.24;
    expect(MAX_SPEED * FIXED_DT).toBeLessThan(thinnestDepth * 2);
  });
});

describe("phaseAt", () => {
  it("returns the opening phase before the first threshold", () => {
    expect(phaseAt(0).id).toBe(0);
    expect(phaseAt(-5).id).toBe(0);
  });

  it("switches exactly on the threshold", () => {
    for (const phase of PHASES) {
      expect(phaseAt(phase.t).id).toBe(phase.id);
      if (phase.t > 0) expect(phaseAt(phase.t - 0.001).id).toBe(phase.id - 1);
    }
  });

  it("keeps unlocking new phases well past the speed cap", () => {
    // Speed tops out at 84s; the run has to keep escalating after that or it
    // becomes a treadmill.
    const last = PHASES[PHASES.length - 1];
    expect(last.t).toBeGreaterThan(84);
  });
});

describe("pressure", () => {
  it("stays at zero through the opening of a run", () => {
    expect(pressureAt(0)).toBe(0);
    expect(pressureAt(PRESSURE_STARTS_AT)).toBe(0);
  });

  it("rises monotonically and saturates at 1", () => {
    let previous = -1;
    for (let t = 0; t <= PRESSURE_FULL_AT * 2; t += 5) {
      const p = pressureAt(t);
      expect(p).toBeGreaterThanOrEqual(previous);
      expect(p).toBeLessThanOrEqual(1);
      previous = p;
    }
    expect(pressureAt(PRESSURE_FULL_AT)).toBe(1);
    expect(pressureAt(PRESSURE_FULL_AT * 10)).toBe(1);
  });

  it("keeps climbing after the speed cap, which is the whole point", () => {
    // At 84s the speed curve is done. Pressure must not be.
    expect(pressureAt(84)).toBeLessThan(1);
    expect(pressureAt(200)).toBeGreaterThan(pressureAt(84));
  });
});

describe("reactionAt", () => {
  it("shrinks from the easy value to the hard one", () => {
    expect(reactionAt(0)).toBeCloseTo(REACTION_EASY, 5);
    expect(reactionAt(PRESSURE_FULL_AT)).toBeCloseTo(REACTION_HARD, 5);
  });

  it("never increases", () => {
    let previous = Infinity;
    for (let t = 0; t <= 600; t += 5) {
      const r = reactionAt(t);
      expect(r).toBeLessThanOrEqual(previous + 1e-9);
      previous = r;
    }
  });

  it("still leaves the runner time to read a pattern at top speed", () => {
    // Hard, but not beyond human reaction: the obstacle must be on screen for
    // longer than it takes to see it and act.
    expect(reactionAt(1e5)).toBeGreaterThan(0.3);
    expect(reactionAt(1e5) * MAX_SPEED).toBeGreaterThan(15);
  });
});

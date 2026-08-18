import { describe, expect, it } from "vitest";
import { FIXED_DT, MAX_SPEED, START_SPEED } from "../src/config.js";
import { PHASES, phaseAt, speedAt } from "../src/pace.js";

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

  it("hands out less reaction time as the run gets faster", () => {
    for (let i = 1; i < PHASES.length; i++) {
      expect(PHASES[i].reaction).toBeLessThan(PHASES[i - 1].reaction);
    }
  });

  it("still leaves usable reaction distance at top speed", () => {
    const last = PHASES[PHASES.length - 1];
    expect(last.reaction * MAX_SPEED).toBeGreaterThan(25);
  });
});

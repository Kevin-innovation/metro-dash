import { describe, expect, it } from "vitest";
import { FIXED_DT, MAX_FRAME_DT, MAX_SIM_STEPS, MAX_SPEED } from "../src/config.js";

/**
 * Mirrors the accumulator in Game#tick. Kept in the test rather than exported
 * from game.js because game.js needs a DOM and a WebGL context to import.
 */
function drain(accumulator, frameDt) {
  let acc = accumulator + Math.min(MAX_FRAME_DT, frameDt);
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_SIM_STEPS) {
    acc -= FIXED_DT;
    steps += 1;
  }
  if (steps >= MAX_SIM_STEPS) acc = 0;
  return { acc, steps };
}

describe("fixed timestep accumulator", () => {
  it("can consume a whole capped frame without hitting the step limit", () => {
    // If the limit bit first, the game would run in slow motion on slow devices.
    expect(MAX_SIM_STEPS * FIXED_DT).toBeGreaterThanOrEqual(MAX_FRAME_DT);
  });

  it.each([1 / 144, 1 / 120, 1 / 60, 1 / 30, 1 / 15])(
    "advances real time 1:1 at %f second frames",
    (frameDt) => {
      let acc = 0;
      let simulated = 0;
      const frames = Math.round(4 / frameDt);
      for (let i = 0; i < frames; i++) {
        const out = drain(acc, frameDt);
        acc = out.acc;
        simulated += out.steps * FIXED_DT;
      }
      // Only the sub-step remainder may lag behind.
      expect(Math.abs(simulated - 4)).toBeLessThan(FIXED_DT * 2);
    },
  );

  it("discards a backgrounded-tab gap instead of replaying it", () => {
    const { steps } = drain(0, 30);
    expect(steps * FIXED_DT).toBeLessThanOrEqual(MAX_FRAME_DT + FIXED_DT);
  });

  it("keeps each step's travel small enough that motion stays continuous", () => {
    expect(MAX_SPEED * FIXED_DT).toBeLessThan(0.5);
  });

  it("never leaves a full step unconsumed", () => {
    const { acc } = drain(0, 1 / 30);
    expect(acc).toBeLessThan(FIXED_DT);
  });
});

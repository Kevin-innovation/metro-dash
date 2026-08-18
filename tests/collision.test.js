import { describe, expect, it } from "vitest";
import { approach, bandsOverlap, nearMiss, sweepWindow, sweptHit } from "../src/collision.js";
import {
  COLLIDE_PAD_Y,
  FIXED_DT,
  JETPACK_ALTITUDE,
  JUMP_APEX,
  MAX_SPEED,
  NEAR_MISS_HEIGHT,
  NEAR_MISS_RANGE,
  PLAYER_HEIGHT,
  SLIDE_HEIGHT,
  SNEAKER_APEX,
} from "../src/config.js";
import { SPEC } from "../src/specs.js";

const BARRIER = { x: 0, ...SPEC.barrier };
const SIGN = { x: 0, ...SPEC.sign };

/** Player capsule travelling straight down a lane at `speed` for one step. */
function step(speed, { z, y = 0, height = PLAYER_HEIGHT, x = 0, dt = FIXED_DT }) {
  const travelled = speed * dt;
  return [
    { x, y, z: z - travelled, height },
    { x, y, z, height },
  ];
}

/**
 * Walk the player past a static obstacle in fixed steps and report whether the
 * swept test ever fires. Starts far enough back that the obstacle is always
 * approached from outside its depth window.
 */
function runPast(obstacle, { speed, y = 0, height = PLAYER_HEIGHT, dt = FIXED_DT }) {
  const item = { ...obstacle, z: 0, prevZ: 0 };
  let z = -8;
  while (z < 8) {
    const prevZ = z;
    z += speed * dt;
    const prev = { x: 0, y, z: prevZ, height };
    const cur = { x: 0, y, z, height };
    if (sweptHit(prev, cur, item, { padY: COLLIDE_PAD_Y }).hit) return true;
  }
  return false;
}

describe("sweepWindow", () => {
  it("reports no overlap when the whole step stays outside the depth band", () => {
    expect(sweepWindow(-5, -3, 0.28).hit).toBe(false);
    expect(sweepWindow(3, 5, 0.28).hit).toBe(false);
  });

  it("catches a step that jumps clean over the depth band", () => {
    // 1.65 units of travel versus a 0.56-unit-wide band: a point sample misses.
    const window = sweepWindow(-1.0, 0.65, 0.28);
    expect(window.hit).toBe(true);
    expect(window.t0).toBeGreaterThanOrEqual(0);
    expect(window.t1).toBeLessThanOrEqual(1);
    expect(window.t0).toBeLessThanOrEqual(window.t1);
  });

  it("handles a stationary overlap", () => {
    expect(sweepWindow(0.1, 0.1, 0.28)).toEqual({ hit: true, t0: 0, t1: 1 });
    expect(sweepWindow(4, 4, 0.28).hit).toBe(false);
  });

  it("resolves relative motion, so an oncoming obstacle is still caught", () => {
    // Player +0.4/step, bus -0.5/step: the gap closes by 0.9 in one step.
    expect(sweepWindow(-0.6, 0.3, 0.28).hit).toBe(true);
  });
});

describe("bandsOverlap", () => {
  it("is inclusive at the edges", () => {
    expect(bandsOverlap(0.92, 1.5, 0, 0.92)).toBe(true);
    expect(bandsOverlap(0.93, 1.5, 0, 0.92)).toBe(false);
  });
});

describe("swept collision does not tunnel", () => {
  // Regression: at speed 45 the old point-sampled test let the player run
  // straight through a barrier every single time.
  const speeds = [16, 25, 35, 45, MAX_SPEED];

  it.each(speeds)("a standing runner always hits a barrier at speed %i", (speed) => {
    expect(runPast(BARRIER, { speed })).toBe(true);
  });

  it.each(speeds)("a standing runner always hits a sign at speed %i", (speed) => {
    expect(runPast(SIGN, { speed })).toBe(true);
  });

  it("still hits at a 30fps step, where travel per step is largest", () => {
    expect(runPast(BARRIER, { speed: MAX_SPEED, dt: 1 / 30 })).toBe(true);
    expect(runPast(SIGN, { speed: MAX_SPEED, dt: 1 / 30 })).toBe(true);
  });

  it("point sampling would have missed the same case", () => {
    // Sanity check on the premise: end-of-step position alone clears the band.
    const [prev, cur] = step(MAX_SPEED, { z: 0.4, dt: 1 / 60 });
    expect(Math.abs(cur.z)).toBeGreaterThan(BARRIER.depth);
    expect(Math.abs(prev.z)).toBeGreaterThan(BARRIER.depth);
    expect(sweptHit(prev, cur, { ...BARRIER, z: 0, prevZ: 0 }, { padY: COLLIDE_PAD_Y }).hit).toBe(
      true,
    );
  });
});

describe("obstacle semantics", () => {
  it("a jump clears a barrier", () => {
    expect(runPast(BARRIER, { speed: 30, y: JUMP_APEX })).toBe(false);
  });

  it("a slide clears a gate", () => {
    expect(runPast(SIGN, { speed: 30, y: 0, height: SLIDE_HEIGHT })).toBe(false);
  });

  it("a jump can NOT clear a gate — gates are slide-only", () => {
    expect(runPast(SIGN, { speed: 30, y: JUMP_APEX })).toBe(true);
  });

  it("super sneakers still can NOT clear a gate", () => {
    // The whole point of the tall gate: a power-up must not invalidate the
    // obstacle it was never meant to beat.
    expect(SNEAKER_APEX).toBeGreaterThan(JUMP_APEX);
    expect(runPast(SIGN, { speed: 30, y: SNEAKER_APEX })).toBe(true);
    expect(SNEAKER_APEX + COLLIDE_PAD_Y).toBeLessThan(SIGN.maxY);
  });

  it("the jetpack flies over everything, gates included", () => {
    for (const type of ["barrier", "sign", "crate", "train", "bus"]) {
      expect(runPast({ x: 0, ...SPEC[type] }, { speed: MAX_SPEED, y: JETPACK_ALTITUDE })).toBe(
        false,
      );
    }
    expect(JETPACK_ALTITUDE + COLLIDE_PAD_Y).toBeGreaterThan(SIGN.maxY);
  });

  it("a slide fits under the gate with clearance to spare", () => {
    expect(SLIDE_HEIGHT - COLLIDE_PAD_Y).toBeLessThan(SIGN.minY);
  });

  it("a standing runner does not fit under the gate", () => {
    expect(PLAYER_HEIGHT - COLLIDE_PAD_Y).toBeGreaterThan(SIGN.minY);
  });
});

describe("nearMiss", () => {
  const opts = {
    laneRange: NEAR_MISS_RANGE,
    heightRange: NEAR_MISS_HEIGHT,
    padY: COLLIDE_PAD_Y,
  };
  const runner = (over) => ({ x: 0, y: over, z: 0, height: PLAYER_HEIGHT });

  it("ignores a clean dodge a full lane away", () => {
    expect(nearMiss({ x: 2.2, y: 0, z: 0, height: PLAYER_HEIGHT }, BARRIER, opts)).toBe(null);
  });

  it("rewards clipping the edge of an obstacle's lane", () => {
    expect(nearMiss({ x: 1.3, y: 0, z: 0, height: PLAYER_HEIGHT }, BARRIER, opts)).toBe("lane");
  });

  it("rewards a last-moment swerve even once the lerp has finished", () => {
    // Lane changes settle in ~0.19s, so a late dodge is always a full lane
    // clear by the time the obstacle is crossed. Distance alone cannot see it.
    const clear = { x: 2.2, y: 0, z: 0, height: PLAYER_HEIGHT };
    expect(nearMiss(clear, BARRIER, opts)).toBe(null);
    expect(nearMiss(clear, BARRIER, { ...opts, lateDodge: true })).toBe("lane");
  });

  it("does not treat a late dodge as an excuse to skip the height check", () => {
    // Same lane, ran straight into it: still not a miss of any kind.
    const inside = { x: 0, y: 0, z: 0, height: PLAYER_HEIGHT };
    expect(nearMiss(inside, BARRIER, { ...opts, lateDodge: true })).toBe(null);
  });

  it("rewards barely clearing a barrier", () => {
    expect(nearMiss(runner(BARRIER.maxY + 0.2), BARRIER, opts)).toBe("over");
  });

  it("does not reward a lazy sky-high jump", () => {
    expect(nearMiss(runner(JUMP_APEX), BARRIER, opts)).toBe(null);
  });

  it("rewards sliding under a gate", () => {
    const sliding = { x: 0, y: 0, z: 0, height: SLIDE_HEIGHT };
    expect(nearMiss(sliding, SIGN, opts)).toBe("under");
  });

  it("never fires when the runner is actually inside the obstacle", () => {
    expect(nearMiss(runner(0), BARRIER, opts)).toBe(null);
  });

  it("leaves no dead zone between surviving and scoring", () => {
    // Every height that clears the swept collision test must also be classified
    // by nearMiss — otherwise the tightest jump of all scores nothing.
    for (let y = 0; y <= JUMP_APEX; y += 0.01) {
      const survived = !runPast(BARRIER, { speed: 24, y });
      if (!survived) continue;
      const scored = nearMiss(runner(y), BARRIER, opts) !== null;
      const comfortablyClear = y + COLLIDE_PAD_Y - BARRIER.maxY >= NEAR_MISS_HEIGHT;
      expect(scored || comfortablyClear, `y=${y.toFixed(2)}`).toBe(true);
    }
  });
});

describe("lane separation", () => {
  it("ignores an obstacle sitting in another lane", () => {
    const item = { ...BARRIER, x: 2.2, z: 0, prevZ: 0 };
    const [prev, cur] = step(30, { z: 0, x: 0 });
    expect(sweptHit(prev, cur, item, { padY: COLLIDE_PAD_Y }).hit).toBe(false);
  });

  it("catches the obstacle once the player has slid into its lane", () => {
    const item = { ...BARRIER, x: 2.2, z: 0, prevZ: 0 };
    const [prev, cur] = step(30, { z: 0, x: 2.2 });
    expect(sweptHit(prev, cur, item, { padY: COLLIDE_PAD_Y }).hit).toBe(true);
  });
});

describe("approach", () => {
  it("is frame-rate independent over the same elapsed time", () => {
    const settle = (rate, dt, seconds) => {
      let v = 0;
      for (let t = 0; t < seconds; t += dt) v += (1 - v) * approach(rate, dt);
      return v;
    };
    const at120 = settle(16, 1 / 120, 1);
    const at30 = settle(16, 1 / 30, 1);
    expect(Math.abs(at120 - at30)).toBeLessThan(0.01);
  });

  it("never overshoots", () => {
    expect(approach(16, 10)).toBeLessThanOrEqual(1);
    expect(approach(16, 0)).toBe(0);
  });
});

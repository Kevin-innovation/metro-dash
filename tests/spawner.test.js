import { describe, expect, it } from "vitest";
import { MAX_SPEED, START_SPEED } from "../src/config.js";
import { LEAD_CONVERGENCE_METRES } from "../src/spawner.js";
import { pressureAt, reactionAt, speedAt } from "../src/pace.js";
import { BOOSTED_AIRTIME, BASE_LEAD_SECONDS, DISMOUNT_LEAD_SECONDS } from "../src/patterns.js";
import { SPEC } from "../src/specs.js";
import { Spawner } from "../src/spawner.js";

/** Stand-in for EntityPool that just records what was asked for. */
function fakePool() {
  return {
    live: [],
    spawn(type, lane, z, y) {
      const item = { type, lane, z, y, length: SPEC[type].length, taken: false };
      this.live.push(item);
      return item;
    },
    prune(behindZ) {
      this.live = this.live.filter((item) => item.z >= behindZ);
    },
    clear() {
      this.live = [];
    },
  };
}

/**
 * Run the real scheduler down a stretch of track and collect every hazard row
 * it placed, in the order the runner would meet them.
 */
function runTrack({ runTime, metres = 6000 }) {
  const spawner = new Spawner(fakePool());
  const speed = speedAt(runTime);
  const rows = [];

  const place = spawner.place.bind(spawner);
  spawner.place = (z, options) => {
    const meta = place(z, options);
    rows.push(...meta.rows);
    return meta;
  };

  let playerZ = 0;
  const step = speed / 120;
  while (playerZ < metres) {
    playerZ += step;
    spawner.update(playerZ, {
      speed,
      phaseId: 4,
      reaction: reactionAt(runTime),
      pressure: pressureAt(runTime),
    });
  }

  rows.sort((a, b) => a.z - b.z);
  return { rows, speed };
}

/** Mirrors requiredLeadSeconds, restated here so the test is its own check. */
function leadNeededFor(previous, wall) {
  if (wall.requires === "mount") return BASE_LEAD_SECONDS;
  if (previous.requires === "jump") return BOOSTED_AIRTIME;
  if (previous.rideable) return DISMOUNT_LEAD_SECONDS;
  return BASE_LEAD_SECONDS;
}

const RUN_TIMES = [20, 60, 100, 160, 220, 320, 600];

describe("spawner scheduling", () => {
  it("places hazards at every stage of a run", () => {
    for (const runTime of RUN_TIMES) {
      expect(runTrack({ runTime }).rows.length, `t=${runTime}`).toBeGreaterThan(20);
    }
  });

  it("never lets a wall arrive while the runner is still committed", () => {
    // The core fairness guarantee. A wall has exactly one way through, so it
    // must never land on a runner who is mid-jump or stuck on a roof — at any
    // point in the run, including once the pacing is fully wound up.
    //
    // Tolerance comes from the scheduler rather than being a number typed in
    // here. It pushes a pattern downtrack until the shortfall is under a
    // centimetre and then stops, so a lead may legitimately land that far
    // short — at 29 m/s, three tenths of a millisecond. The old flat 2e-5
    // seconds was tighter than the loop the test is checking, so whether it
    // passed was down to whether a run happened to leave a residue inside the
    // band, which is how it came to fail only after the pacing moved.
    for (const runTime of RUN_TIMES) {
      const { rows, speed } = runTrack({ runTime });
      const slack = LEAD_CONVERGENCE_METRES / speed + 2e-5;
      for (let i = 1; i < rows.length; i++) {
        const previous = rows[i - 1];
        const wall = rows[i];
        if (!wall.isWall) continue;
        const seconds = (wall.z - previous.z) / speed;
        expect(
          seconds,
          `t=${runTime}: ${previous.requires ?? "lane"} -> ${wall.requires} wall`,
        ).toBeGreaterThanOrEqual(leadNeededFor(previous, wall) - slack);
      }
    }
  });

  it("never overlaps two patterns", () => {
    for (const runTime of RUN_TIMES) {
      const { rows } = runTrack({ runTime });
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].z, `t=${runTime}`).toBeGreaterThanOrEqual(rows[i - 1].z);
      }
    }
  });

  it("gets harder as the run goes on", () => {
    // The whole point of the pressure model: without it, gaps grow with speed
    // and the player gets the same thinking time from start to finish.
    const spacing = RUN_TIMES.map((runTime) => {
      const { rows, speed } = runTrack({ runTime });
      const gaps = [];
      for (let i = 1; i < rows.length; i++) {
        const seconds = (rows[i].z - rows[i - 1].z) / speed;
        if (seconds > 0.01) gaps.push(seconds);
      }
      return gaps.reduce((a, b) => a + b, 0) / gaps.length;
    });

    expect(spacing[0]).toBeGreaterThan(1);
    expect(spacing[spacing.length - 1]).toBeLessThan(0.7);
    // Broadly monotonic — sampling noise aside, late runs must be tighter.
    expect(spacing[spacing.length - 1]).toBeLessThan(spacing[0] * 0.6);
  });

  it("still fills the track after the first ramp", () => {
    expect(runTrack({ runTime: 360 }).rows.length).toBeGreaterThan(50);
  });

  it("stays clearable at the slowest and fastest speeds alike", () => {
    for (const speed of [START_SPEED, MAX_SPEED]) {
      const spawner = new Spawner(fakePool());
      let playerZ = 0;
      for (let i = 0; i < 4000; i++) {
        playerZ += speed / 120;
        expect(() =>
          spawner.update(playerZ, { speed, phaseId: 4, reaction: 0.45, pressure: 1 }),
        ).not.toThrow();
      }
    }
  });
});

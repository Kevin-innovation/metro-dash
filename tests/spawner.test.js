import { describe, expect, it } from "vitest";
import { MAX_SPEED, START_SPEED } from "../src/config.js";
import {
  BREATH_EVERY,
  BREATH_SECONDS,
  LEAD_CONVERGENCE_METRES,
  PLACEMENT_LEAD_SECONDS,
} from "../src/spawner.js";
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
function runTrack({ runTime, metres = 6000, seed = 7 }) {
  const spawner = new Spawner(fakePool());
  // Seeded, or every assertion below is a coin toss that usually lands right.
  spawner.reset(seed);
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

  /** Gaps between rows, in seconds, smallest first. */
  const gapsAt = (runTime, seed = 7) => {
    const { rows, speed } = runTrack({ runTime, metres: 12000, seed });
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      const seconds = (rows[i].z - rows[i - 1].z) / speed;
      if (seconds > 0.01) gaps.push(seconds);
    }
    return gaps.sort((a, b) => a - b);
  };

  /**
   * Average gap, with the deliberate rests held out.
   *
   * A plain average used to be the measure of pressure, and it was a good one
   * while every gap was much of a muchness. The track now opens up on purpose
   * once in BREATH_EVERY layouts, and those few wide gaps pull an average up
   * without a single row in between having moved — so the average stopped
   * meaning "the player is under pressure" and started meaning "the player is
   * under pressure, or is not, sometimes".
   *
   * The share to drop comes from BREATH_EVERY rather than a number typed here,
   * with a little room over it, so tuning the rhythm cannot quietly stop this
   * measuring difficulty. Layouts average barely over one row, so the share of
   * *gaps* that are rests is close enough to the share of layouts.
   */
  const BREATH_SHARE = 1 / BREATH_EVERY + 0.01;
  const pressureGap = (sorted) => {
    const kept = sorted.slice(0, Math.floor(sorted.length * (1 - BREATH_SHARE)));
    return kept.reduce((a, b) => a + b, 0) / kept.length;
  };

  it("gets harder as the run goes on", () => {
    // The whole point of the pressure model: without it, gaps grow with speed
    // and the player gets the same thinking time from start to finish.
    const spacing = RUN_TIMES.map((runTime) => pressureGap(gapsAt(runTime)));

    expect(spacing[0]).toBeGreaterThan(1);
    expect(spacing[spacing.length - 1]).toBeLessThan(0.7);
    // Broadly monotonic — sampling noise aside, late runs must be tighter.
    expect(spacing[spacing.length - 1]).toBeLessThan(spacing[0] * 0.6);
  });

  it("still lets the player breathe once a run is wound up", () => {
    // The other half of that, and the reason difficulty is now measured with
    // the widest gaps held out: a run made only of pressure has no decisions
    // left in it.
    //
    // Density was doing all of the difficulty work, and density is the one dial
    // that removes choices instead of creating them. Measured across six whole
    // runs, the longest gap anywhere in the last minute was 1.57 seconds — so
    // there was never a moment with attention going spare, and everything that
    // asks the player to *choose* something (the diamond off the line, holding
    // a roof, the tight line past a crate) collapsed into "dodge".
    //
    // So room is a guarantee now rather than a by-product: however wound up the
    // run gets, a wide gap still comes back round.
    for (const runTime of [160, 320, 600]) {
      for (const seed of [1, 7, 29]) {
        const gaps = gapsAt(runTime, seed);
        const where = `t=${runTime} seed=${seed}`;
        expect(pressureGap(gaps), `${where} still tight`).toBeLessThan(0.7);
        expect(gaps[gaps.length - 1], `${where} still breathes`).toBeGreaterThan(
          BREATH_SECONDS,
        );
      }
    }
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

describe("배치는 만날 때의 속도로 지어진다", () => {
  it("놓는 순간이 아니라 도착 시점의 속도를 쓴다", () => {
    // 배치는 미터로 지어지고 주자는 2.35초 뒤에 만난다. 속도 곡선이 한 프레임에
    // 머리카락만큼 움직이던 시절엔 그 차이가 반올림돼 사라졌다. 10초 계단으로
    // 끊은 뒤로는 아니다 — 계단 직전에 놓인 배치는 계단 직후에 만나고, 그 안의
    // 모든 간격이 속도가 오른 비율만큼 짧아진다. 공정성 감사가 잡아낸 값으로
    // 「피할 수 없는 배치」가 16건에서 50건으로 뛰었다.
    const before = 39.5;
    const after = before + PLACEMENT_LEAD_SECONDS;
    // 계단을 사이에 두고 있어야 의미가 있는 테스트다.
    expect(speedAt(after)).toBeGreaterThan(speedAt(before));

    // 시드는 두 번째 인자가 아니라 reset 으로 준다. 생성자의 두 번째 인자는
    // hooks 라, 숫자를 넘기면 둘 다 무작위 시드를 받아 비교가 흔들린다.
    const near = new Spawner(fakePool());
    const far = new Spawner(fakePool());
    near.reset(7);
    far.reset(7);
    const opts = { phaseId: 4, reaction: reactionAt(before), pressure: pressureAt(before) };
    // 같은 씨앗, 같은 위치 — 다른 건 스포너가 어느 속도로 짓느냐뿐이다.
    const placed = near.update(1000, { ...opts, speed: speedAt(before), runTime: before });
    const arrival = far.update(1000, { ...opts, speed: speedAt(before) });
    expect(placed).not.toBeNull();
    expect(arrival).not.toBeNull();
    // 도착 속도로 지은 쪽이 더 길게 펼쳐진다 — 같은 초를 더 많은 미터로 산다.
    expect(placed.span).toBeGreaterThan(arrival.span);
  });
});

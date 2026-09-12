import { describe, expect, it } from "vitest";
import { LANES } from "../src/config.js";
import {
  LANES_EVERY,
  LANES_FROM_SCORE,
  LANE_GAP,
  LANE_WIDTHS,
  closestLane,
  laneCountAt,
  laneSet,
  laneX,
  lanesAt,
} from "../src/lanes.js";

describe("도로 폭", () => {
  it("50만 전에는 三차선이다", () => {
    for (const score of [0, 1, 200_000, LANES_FROM_SCORE - 1]) {
      expect(laneCountAt(score), `${score}`).toBe(3);
      expect(lanesAt(score)).toEqual([-1, 0, 1]);
    }
  });

  it("50만부터 넓어졌다 좁아졌다 한다", () => {
    // 4 → 3 → 4 → 5 → 4 → 3 → …
    const at = (step) => laneCountAt(LANES_FROM_SCORE + LANES_EVERY * step);
    expect(at(0)).toBe(4);
    expect(at(1)).toBe(3);
    expect(at(2)).toBe(4);
    expect(at(3)).toBe(5);
    expect(at(4)).toBe(4); // 그리고 다시 돈다
    expect(at(5)).toBe(3);
  });

  it("한 번에 한 차선씩만 바뀐다", () => {
    // A road that jumped from three to five would take a lane the runner could
    // be standing in and put another one somewhere they were not looking, in
    // the same frame.
    for (let i = 1; i < LANE_WIDTHS.length; i++) {
      expect(Math.abs(LANE_WIDTHS[i] - LANE_WIDTHS[i - 1]), `${i}`).toBe(1);
    }
    // Including the wrap back to the start, and the step up from the three
    // lanes the run begins on.
    expect(Math.abs(LANE_WIDTHS[0] - LANE_WIDTHS[LANE_WIDTHS.length - 1])).toBe(1);
    expect(Math.abs(LANE_WIDTHS[0] - 3)).toBe(1);
  });

  it("세 차선 아래로는 안 내려간다", () => {
    // Every pattern in the table was drawn for three, and the fairness audit is
    // an argument about what the runner can reach. Narrower is a different
    // game, not a harder one.
    expect(Math.min(...LANE_WIDTHS)).toBe(3);
  });
});

describe("차선이 늘어나도 있던 차선은 안 움직인다", () => {
  it("넓어질 때 기존 차선이 그대로다", () => {
    // The whole reason these are a contiguous range rather than a centred fan.
    // A widening that moved every lane would slide the runner sideways and
    // leave every obstacle already on the track pointing at the wrong place.
    let previous = laneSet(3);
    for (const n of [4, 5]) {
      const next = laneSet(n);
      for (const lane of previous) expect(next, `${n}`).toContain(lane);
      expect(next.length - previous.length).toBe(1);
      previous = next;
    }
  });

  it("좁아질 때도 남은 차선은 그대로다", () => {
    let previous = laneSet(5);
    for (const n of [4, 3]) {
      const next = laneSet(n);
      for (const lane of next) expect(previous, `${n}`).toContain(lane);
      previous = next;
    }
  });

  it("언제나 가운데 차선을 포함하고 이어져 있다", () => {
    for (const n of [3, 4, 5]) {
      const lanes = laneSet(n);
      expect(lanes, `${n}`).toContain(0);
      for (let i = 1; i < lanes.length; i++) {
        expect(lanes[i] - lanes[i - 1], `${n}`).toBe(1);
      }
    }
  });

  it("세 차선일 때 좌표가 예전 그대로다", () => {
    // The road the whole game was built and tuned on. If this moves, every
    // pattern gap, every collision tolerance and every camera number that was
    // ever eyeballed against it moves with it.
    expect(laneSet(3).map(laneX)).toEqual(LANES);
    expect(LANE_GAP).toBe(LANES[2] - LANES[1]);
  });
});

describe("사라지는 차선 위에 서 있을 때", () => {
  it("가장 가까운 남은 차선으로 옮겨진다", () => {
    // Nothing the player did caused the road to narrow and nothing they could
    // have done would have avoided it, so this is the forgiving answer.
    expect(closestLane(2, laneSet(3))).toBe(1);
    expect(closestLane(-2, laneSet(4))).toBe(-1);
  });

  it("남아 있는 차선이면 안 옮긴다", () => {
    for (const lane of laneSet(5)) {
      expect(closestLane(lane, laneSet(5))).toBe(lane);
    }
  });
});

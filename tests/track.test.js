import { describe, expect, it } from "vitest";
import { MAX_BEND, STRAIGHT_FOR, bendSlope, bendStrength, bendX, bendYaw } from "../src/track.js";

describe("시작 구간", () => {
  it("초반은 완전히 직선이다", () => {
    // The opening teaches the controls. A track already leaning makes a lane
    // change indistinguishable from the world moving.
    for (let z = 0; z <= STRAIGHT_FOR; z += 5) {
      expect(bendX(z), `z=${z}`).toBe(0);
      expect(bendSlope(z), `z=${z}`).toBe(0);
    }
  });

  it("휘기 시작하는 지점에 꺾임이 없다", () => {
    // Smoothstep in, so the first bend has no crease where it starts.
    expect(bendStrength(STRAIGHT_FOR)).toBe(0);
    // Under a centimetre of sideways movement across the first metre of bend:
    // far below anything the eye can pick out as a corner.
    expect(Math.abs(bendX(STRAIGHT_FOR + 1))).toBeLessThan(0.01);
    expect(Math.abs(bendX(STRAIGHT_FOR + 5))).toBeLessThan(0.2);
  });

  it("결국 최대 세기에 도달한다", () => {
    expect(bendStrength(400)).toBe(1);
  });
});

describe("곡선의 모양", () => {
  it("어떤 지점에서도 같은 값을 준다", () => {
    // Drawn every frame from the same z; a wobble here would be a shaking
    // world rather than a curving one.
    for (const z of [0, 55, 137.5, 400, 1234.567]) {
      expect(bendX(z)).toBe(bendX(z));
      expect(bendSlope(z)).toBe(bendSlope(z));
    }
  });

  it("정해진 폭을 넘지 않는다", () => {
    for (let z = 0; z <= 4000; z += 1) {
      expect(Math.abs(bendX(z)), `z=${z}`).toBeLessThanOrEqual(MAX_BEND);
    }
  });

  it("끊기지 않고 이어진다", () => {
    // A jump between adjacent metres would show as a tear across the track.
    let previous = bendX(0);
    for (let z = 0.5; z <= 3000; z += 0.5) {
      const now = bendX(z);
      expect(Math.abs(now - previous), `z=${z}`).toBeLessThan(0.35);
      previous = now;
    }
  });

  it("기울기가 실제 변화량과 일치한다", () => {
    // The slope turns objects to face along the line, so it has to be the real
    // derivative and not an approximation that drifts.
    const h = 0.001;
    for (const z of [90, 150, 260, 400, 733]) {
      const numeric = (bendX(z + h) - bendX(z - h)) / (2 * h);
      expect(bendSlope(z), `z=${z}`).toBeCloseTo(numeric, 4);
    }
  });

  it("실제로 눈에 보일 만큼 휜다", () => {
    // A curve nobody notices is not worth the work. Over the distance the
    // player can see, the line has to move by more than a lane width.
    let widest = 0;
    for (let z = 100; z < 2000; z += 5) {
      widest = Math.max(widest, Math.abs(bendX(z + 120) - bendX(z)));
    }
    expect(widest).toBeGreaterThan(4.4);
  });

  it("한 방향으로만 휘지 않는다", () => {
    let left = false;
    let right = false;
    for (let z = 100; z < 1200; z += 5) {
      if (bendX(z) < -2) left = true;
      if (bendX(z) > 2) right = true;
    }
    expect(left && right).toBe(true);
  });

  it("고개 각도가 감당할 범위 안에 있다", () => {
    // Steeper than this and the track leaves the frame faster than the camera
    // can follow it.
    for (let z = 0; z <= 3000; z += 1) {
      expect(Math.abs(bendYaw(z)), `z=${z}`).toBeLessThan(0.28);
    }
  });
});

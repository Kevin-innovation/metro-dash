import { describe, expect, it } from "vitest";
import { runTimeLabel } from "../src/ui.js";
import { TYPICAL_RUN_SECONDS } from "../src/config.js";
import {
  COIN_BASE,
  COIN_COMBO_CAP,
  DIST_SCORE_RATE,
  HOP_BONUS,
  MOUNT_BONUS,
  coinGain,
  survivalGain,
  roofRideGain,
  TARGET_SCORE_PER_MINUTE,
  ROOF_RIDE_RATE,
  mountBonus,
  totalScore,
} from "../src/scoring.js";

describe("coinGain", () => {
  it("pays the base amount for the first coin", () => {
    expect(coinGain(0)).toBe(COIN_BASE);
  });

  it("grows with the combo", () => {
    expect(coinGain(5)).toBe(COIN_BASE + 5);
    expect(coinGain(5)).toBeGreaterThan(coinGain(4));
  });

  it("caps the combo bonus", () => {
    expect(coinGain(COIN_COMBO_CAP)).toBe(COIN_BASE + COIN_COMBO_CAP);
    expect(coinGain(9999)).toBe(COIN_BASE + COIN_COMBO_CAP);
  });

  it("never pays less than the base, even on a broken combo", () => {
    expect(coinGain(-3)).toBe(COIN_BASE);
  });
});

describe("survivalGain", () => {
  it("한 판의 1분은 정확히 20만이다", () => {
    // 이 게임의 점수는 달린 거리가 아니라 버틴 시간으로 쌓인다. 거리로 매기면
    // 트랙이 빨라지는 만큼 점수도 빨라져서, 세 번째 1분이 첫 1분의 네 배가
    // 됐다 — 그래서 「1분 20만」과 「3분이 최대」를 동시에 만족하는 배율이
    // 존재하지 않았다. 시간으로 매기면 그 둘이 같은 숫자의 앞뒤가 된다.
    expect(survivalGain(60)).toBe(TARGET_SCORE_PER_MINUTE);
    expect(survivalGain(180)).toBe(TARGET_SCORE_PER_MINUTE * 3);
    expect(survivalGain(0)).toBe(0);
  });

  it("쪼개서 더해도 같다", () => {
    const steps = 240;
    let total = 0;
    for (let i = 0; i < steps; i++) total += survivalGain(60 / steps);
    expect(total).toBeCloseTo(TARGET_SCORE_PER_MINUTE, 6);
  });

  it("지붕은 땅 위보다 79% 더 준다 — 단위만 옮겼을 뿐이다", () => {
    expect(roofRideGain(1) / survivalGain(1)).toBeCloseTo(ROOF_RIDE_RATE / DIST_SCORE_RATE, 10);
  });
});

describe("mountBonus", () => {
  it("pays more for climbing up than for hopping across", () => {
    expect(mountBonus(false)).toBe(MOUNT_BONUS);
    expect(mountBonus(true)).toBe(HOP_BONUS);
    expect(mountBonus(false)).toBeGreaterThan(mountBonus(true));
  });
});

describe("totalScore", () => {
  it("is the sum of the three breakdown rows shown on the game-over card", () => {
    expect(totalScore(260, 101, 30)).toBe(391);
  });
});

describe("버틴 시간 표시", () => {
  it("1분 미만은 초만 말한다", () => {
    expect(runTimeLabel(0)).toBe("0초");
    expect(runTimeLabel(47.8)).toBe("47초");
    expect(runTimeLabel(59.99)).toBe("59초");
  });

  it("1분부터는 분과 초다", () => {
    expect(runTimeLabel(60)).toBe("1분 00초");
    expect(runTimeLabel(134)).toBe("2분 14초");
    expect(runTimeLabel(TYPICAL_RUN_SECONDS)).toBe("3분 00초");
  });

  it("이상한 값에도 화면이 깨지지 않는다", () => {
    expect(runTimeLabel(-5)).toBe("0초");
    expect(runTimeLabel(NaN)).toBe("0초");
    expect(runTimeLabel(undefined)).toBe("0초");
  });
});


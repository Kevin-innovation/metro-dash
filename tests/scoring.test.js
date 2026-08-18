import { describe, expect, it } from "vitest";
import {
  COIN_BASE,
  COIN_COMBO_CAP,
  DIST_SCORE_RATE,
  HOP_BONUS,
  MOUNT_BONUS,
  coinGain,
  distanceGain,
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

describe("distanceGain", () => {
  it("scales linearly with metres travelled", () => {
    expect(distanceGain(10)).toBeCloseTo(10 * DIST_SCORE_RATE);
    expect(distanceGain(0)).toBe(0);
  });

  it("accumulates identically regardless of step size", () => {
    const sum = (steps) => {
      let total = 0;
      for (let i = 0; i < steps; i++) total += distanceGain(100 / steps);
      return total;
    };
    expect(sum(120)).toBeCloseTo(sum(30), 6);
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

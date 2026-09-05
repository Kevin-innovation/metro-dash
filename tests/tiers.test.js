import { describe, expect, it } from "vitest";
import {
  MAX_TIER,
  TIER_EASY_FLOOR,
  TIER_STARTS_AT,
  TIER_STEP,
  TIER_SCORE_DECAY,
  TIER_SCORE_FLOOR,
  easyWeightScale,
  hardWeightScale,
  tierAt,
  tierPatternScale,
  tierScoreScale,
  tierProgress,
  tierThreshold,
} from "../src/tiers.js";
import { candidatesFor } from "../src/patterns.js";

describe("tierAt", () => {
  it("leaves a run alone until the first threshold", () => {
    expect(tierAt(0)).toBe(0);
    expect(tierAt(TIER_STARTS_AT - 1)).toBe(0);
    expect(tierAt(TIER_STARTS_AT)).toBe(1);
  });

  it("steps once per TIER_STEP after that", () => {
    expect(tierAt(TIER_STARTS_AT + TIER_STEP)).toBe(2);
    expect(tierAt(TIER_STARTS_AT + TIER_STEP * 5)).toBe(6);
  });

  it("stops at MAX_TIER however far the run goes", () => {
    expect(tierAt(1e9)).toBe(MAX_TIER);
    expect(tierAt(Number.MAX_SAFE_INTEGER)).toBe(MAX_TIER);
  });

  it("never goes backwards as the score climbs", () => {
    let previous = -1;
    for (let score = 0; score <= 600000; score += 2500) {
      const tier = tierAt(score);
      expect(tier).toBeGreaterThanOrEqual(previous);
      previous = tier;
    }
  });

  it("treats rubbish as the bottom of the ladder rather than throwing", () => {
    expect(tierAt(undefined)).toBe(0);
    expect(tierAt(NaN)).toBe(0);
    expect(tierAt(-5000)).toBe(0);
  });

  it("agrees with tierThreshold in both directions", () => {
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      const at = tierThreshold(tier);
      expect(tierAt(at)).toBe(tier);
      expect(tierAt(at - 1)).toBe(tier - 1);
    }
  });
});

describe("tierProgress", () => {
  it("runs 0..1 inside a tier", () => {
    expect(tierProgress(0)).toBeCloseTo(0, 5);
    expect(tierProgress(TIER_STARTS_AT / 2)).toBeCloseTo(0.5, 5);
    expect(tierProgress(TIER_STARTS_AT)).toBeCloseTo(0, 5);
    expect(tierProgress(TIER_STARTS_AT + TIER_STEP / 2)).toBeCloseTo(0.5, 5);
  });

  it("sits at the top once the ladder has run out", () => {
    expect(tierProgress(tierThreshold(MAX_TIER))).toBe(1);
    expect(tierProgress(1e9)).toBe(1);
  });
});

describe("weight scaling", () => {
  it("hands more of the pile to the demanding layouts as the tier climbs", () => {
    let previous = 0;
    for (let tier = 0; tier <= MAX_TIER; tier++) {
      const scale = hardWeightScale(tier);
      expect(scale).toBeGreaterThan(previous);
      previous = scale;
    }
  });

  it("thins the fillers out but never removes them", () => {
    expect(easyWeightScale(0)).toBeCloseTo(1, 5);
    for (let tier = 0; tier <= MAX_TIER + 5; tier++) {
      expect(easyWeightScale(tier)).toBeGreaterThanOrEqual(TIER_EASY_FLOOR);
    }
  });

  it("clamps past the top of the ladder rather than running away", () => {
    expect(hardWeightScale(MAX_TIER + 50)).toBe(hardWeightScale(MAX_TIER));
    expect(easyWeightScale(MAX_TIER + 50)).toBe(easyWeightScale(MAX_TIER));
    expect(hardWeightScale(-3)).toBe(hardWeightScale(0));
  });

  it("deals a tier layout nothing until its own tier arrives", () => {
    expect(tierPatternScale(1, 3)).toBe(0);
    expect(tierPatternScale(3, 3)).toBeGreaterThan(0);
    expect(tierPatternScale(6, 3)).toBeGreaterThan(tierPatternScale(4, 3));
  });
});

describe("tierScoreScale", () => {
  it("pays a run in full until the first tier bites", () => {
    expect(tierScoreScale(0)).toBe(1);
  });

  it("takes a little more back at every tier", () => {
    let previous = Infinity;
    for (let tier = 0; tier <= MAX_TIER; tier++) {
      const scale = tierScoreScale(tier);
      expect(scale).toBeLessThanOrEqual(previous);
      previous = scale;
    }
    expect(tierScoreScale(MAX_TIER)).toBeLessThan(tierScoreScale(0));
  });

  it("never stops paying, however far the run climbs", () => {
    // A game that pays nothing has ended without saying so.
    for (const tier of [MAX_TIER, MAX_TIER + 50, 10_000]) {
      expect(tierScoreScale(tier)).toBeGreaterThanOrEqual(TIER_SCORE_FLOOR);
      expect(tierScoreScale(tier)).toBeGreaterThan(0);
    }
  });

  it("clamps below zero rather than paying a bonus", () => {
    expect(tierScoreScale(-5)).toBe(1);
  });

  it("follows the decay it documents", () => {
    expect(tierScoreScale(2)).toBeCloseTo(1 - TIER_SCORE_DECAY * 2, 10);
  });
});

describe("candidatesFor with a tier", () => {
  it("keeps the tier layouts out of the pile until they are unlocked", () => {
    const ids = (tier) => new Set(candidatesFor(10, 0, tier).map((p) => p.id));
    expect(ids(0).has("needle")).toBe(false);
    expect(ids(2).has("needle")).toBe(true);
    expect(ids(2).has("roof-needle")).toBe(false);
    expect(ids(6).has("roof-needle")).toBe(true);
  });

  it("shifts the mix towards the demanding layouts as the tier climbs", () => {
    const hardShare = (tier) => {
      const pool = candidatesFor(10, 0, tier);
      return pool.filter((p) => p.hard).length / pool.length;
    };
    expect(hardShare(MAX_TIER)).toBeGreaterThan(hardShare(0));
    // And monotonically, so no tier is a reprieve from the one before it.
    let previous = 0;
    for (let tier = 0; tier <= MAX_TIER; tier++) {
      const share = hardShare(tier);
      expect(share).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = share;
    }
  });

  it("still leaves something in the pile that is not a gauntlet", () => {
    // A run with no let-up stops being readable; the floor is what guarantees
    // the player still gets a beat between the hard layouts.
    const pool = candidatesFor(10, 0, MAX_TIER);
    expect(pool.some((p) => !p.hard)).toBe(true);
  });

  it("never returns an empty pile, at any phase or tier", () => {
    for (let phase = 0; phase <= 10; phase++) {
      for (let tier = 0; tier <= MAX_TIER; tier++) {
        expect(candidatesFor(phase, 0, tier).length).toBeGreaterThan(0);
      }
    }
  });

  it("behaves like the old two-argument call when no tier is given", () => {
    expect(candidatesFor(6, 0).length).toBe(candidatesFor(6, 0, 0).length);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DOWNGRADE_AFTER,
  DOWNGRADE_FPS,
  QUALITY_PROFILES,
  QUALITY_TIERS,
  QualityGovernor,
  UPGRADE_AFTER,
  UPGRADE_FPS,
  guessStartTier,
  normalizeSettings,
  qualityProfile,
} from "../src/settings.js";

const feed = (governor, fps, seconds) => {
  const dt = 1 / fps;
  const changes = [];
  for (let t = 0; t < seconds; t += dt) {
    const changed = governor.sample(dt);
    if (changed) changes.push(changed);
  }
  return changes;
};

describe("normalizeSettings", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and rejects invalid ones", () => {
    const settings = normalizeSettings({ sfx: false, music: "yes", quality: "ultra" });
    expect(settings.sfx).toBe(false);
    expect(settings.music).toBe(DEFAULT_SETTINGS.music);
    expect(settings.quality).toBe(DEFAULT_SETTINGS.quality);
  });

  it("accepts every real tier plus auto", () => {
    for (const tier of ["auto", ...QUALITY_TIERS]) {
      expect(normalizeSettings({ quality: tier }).quality).toBe(tier);
    }
  });
});

describe("quality profiles", () => {
  it("get heavier as the tier rises", () => {
    let previous = null;
    for (const tier of QUALITY_TIERS) {
      const profile = QUALITY_PROFILES[tier];
      if (previous) {
        expect(profile.pixelRatio).toBeGreaterThanOrEqual(previous.pixelRatio);
        expect(profile.particleBudget).toBeGreaterThan(previous.particleBudget);
        expect(profile.drawDistance).toBeGreaterThan(previous.drawDistance);
      }
      previous = profile;
    }
  });

  it("keeps fog inside the draw distance so nothing pops in unfogged", () => {
    for (const tier of QUALITY_TIERS) {
      const profile = QUALITY_PROFILES[tier];
      expect(profile.fog[0]).toBeLessThan(profile.fog[1]);
      expect(profile.fog[1]).toBeLessThanOrEqual(profile.drawDistance);
    }
  });

  it("falls back to a real profile for an unknown tier", () => {
    expect(qualityProfile("nonsense")).toBe(QUALITY_PROFILES.medium);
  });

  it("drops shadows only at the lowest tier", () => {
    expect(QUALITY_PROFILES.low.shadows).toBe(false);
    expect(QUALITY_PROFILES.medium.shadows).toBe(true);
  });
});

describe("QualityGovernor", () => {
  it("holds steady at a healthy frame rate", () => {
    const governor = new QualityGovernor("high");
    expect(feed(governor, 60, 30)).toEqual([]);
    expect(governor.tier).toBe("high");
  });

  it("steps down when frames are consistently slow", () => {
    const governor = new QualityGovernor("high");
    const changes = feed(governor, 30, DOWNGRADE_AFTER + 1);
    expect(changes[0]).toBe("medium");
  });

  it("keeps stepping down but never past the lowest tier", () => {
    const governor = new QualityGovernor("high");
    feed(governor, 20, 30);
    expect(governor.tier).toBe(QUALITY_TIERS[0]);
  });

  it("never climbs back into a tier that already failed", () => {
    const governor = new QualityGovernor("high");
    feed(governor, 25, DOWNGRADE_AFTER + 1); // high -> medium
    const failed = governor.tier;
    // Now the device runs great — but "high" already proved too heavy.
    feed(governor, 120, UPGRADE_AFTER * 4);
    expect(governor.tier).toBe(failed);
  });

  it("does not oscillate around the thresholds", () => {
    const governor = new QualityGovernor("medium");
    let changes = 0;
    // Alternate just-below and just-above the trigger points.
    for (let i = 0; i < 4000; i++) {
      const fps = i % 2 === 0 ? DOWNGRADE_FPS + 1 : UPGRADE_FPS - 1;
      if (governor.sample(1 / fps)) changes += 1;
    }
    expect(changes).toBe(0);
  });

  it("ignores non-positive deltas", () => {
    const governor = new QualityGovernor("high");
    expect(governor.sample(0)).toBe(null);
    expect(governor.sample(-1)).toBe(null);
    expect(governor.tier).toBe("high");
  });

  it("starts from a valid tier even if handed nonsense", () => {
    expect(QUALITY_TIERS).toContain(new QualityGovernor("ultra").tier);
  });
});

describe("guessStartTier", () => {
  it("is conservative on mobile and low-spec machines", () => {
    expect(guessStartTier({ isMobile: true })).toBe("medium");
    expect(guessStartTier({ deviceMemory: 4 })).toBe("medium");
    expect(guessStartTier({ hardwareConcurrency: 2 })).toBe("medium");
  });

  it("starts high on a capable desktop", () => {
    expect(guessStartTier({ deviceMemory: 16, hardwareConcurrency: 12 })).toBe("high");
  });

  it("handles a browser that reports nothing", () => {
    expect(QUALITY_TIERS).toContain(guessStartTier({}));
    expect(QUALITY_TIERS).toContain(guessStartTier());
  });
});

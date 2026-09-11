import { describe, expect, it } from "vitest";
import { PAUSES_PER_RUN, REACTION_EASY, REACTION_HARD } from "../src/config.js";
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
  isBindableKey,
  keyLabel,
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
        expect(profile.drawSeconds).toBeGreaterThan(previous.drawSeconds);
      }
      previous = profile;
    }
  });

  it("keeps fog inside the draw distance so nothing pops in unfogged", () => {
    for (const tier of QUALITY_TIERS) {
      const profile = QUALITY_PROFILES[tier];
      expect(profile.fogSeconds[0]).toBeLessThan(profile.fogSeconds[1]);
      expect(profile.fogSeconds[1]).toBeLessThanOrEqual(profile.drawSeconds);
    }
  });

  it("sees a layout coming for longer than the gap it was given", () => {
    // The one that actually matters, and the reason these are seconds rather
    // than metres.
    //
    // Not "further than the spawner places". A layout goes down 2.35 seconds up
    // the track and the lowest tier only clears 2.14, so the last fifth of a
    // second of its life it is inside the murk — but fog fades, it does not
    // cut, and what the player needs is to have seen the thing well before they
    // have to act on it. The gap the spawner leaves between layouts is the
    // measure of that: REACTION_EASY at the start of a run, REACTION_HARD once
    // it is wound up.
    //
    // A tunnel is the tightest case in the game — it multiplies the fog by 0.42
    // — and it still has to clear the gap the run is being dealt at that point.
    //
    // Checked here rather than trusted, because the numbers that used to make
    // this work were metres, and metres stopped being true the moment the speed
    // ceiling moved.
    const tunnel = 0.42;
    for (const tier of QUALITY_TIERS) {
      const seen = QUALITY_PROFILES[tier].fogSeconds[1];
      expect(seen, tier).toBeGreaterThan(REACTION_EASY * 1.5);
      expect(seen * tunnel, `${tier} tunnel`).toBeGreaterThan(REACTION_HARD);
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

describe("호버보드 키 바인딩", () => {
  it("기본은 점프 두 번이다", () => {
    // 제스처가 사라지는 게 아니라 대안이 생기는 것이다. 설정을 한 번도 안
    // 연 사람에게는 아무것도 안 바뀐다.
    expect(DEFAULT_SETTINGS.boardKey).toBe(null);
    expect(normalizeSettings({}).boardKey).toBe(null);
    expect(keyLabel(null)).toBe("점프 두 번");
  });

  it("게임이 이미 쓰는 키는 못 뺏는다", () => {
    for (const code of ["Space", "ArrowUp", "KeyW", "KeyS", "Escape", "Enter"]) {
      expect(isBindableKey(code), code).toBe(false);
    }
  });

  it("평범한 키는 받는다", () => {
    for (const code of ["KeyF", "KeyJ", "Digit1", "ShiftLeft"]) {
      expect(isBindableKey(code), code).toBe(true);
    }
  });

  it("읽을 수 있는 이름으로 보여준다", () => {
    expect(keyLabel("KeyF")).toBe("F");
    expect(keyLabel("Digit3")).toBe("3");
    expect(keyLabel("Numpad5")).toBe("숫자패드 5");
  });

  it("더 이상 허용되지 않는 바인딩은 제스처로 되돌아간다", () => {
    // 게임이 나중에 가져간 키가 세이브에 남아 있을 수 있다. 아무것도 아닌
    // 상태가 아니라 원래 동작으로 떨어져야 한다.
    expect(normalizeSettings({ boardKey: "Space" }).boardKey).toBe(null);
    expect(normalizeSettings({ boardKey: 42 }).boardKey).toBe(null);
    expect(normalizeSettings({ boardKey: "KeyF" }).boardKey).toBe("KeyF");
  });
});

describe("일시정지 횟수", () => {
  it("한 판에 한 번이다", () => {
    // 일시정지는 그림이 아니라 트랙을 멈춘다 — 80m/s에서 못 읽는 벽을
    // 정지 상태에서는 읽을 수 있다. 무제한이면 편의가 아니라 남들은 안 쓰는
    // 느린 속도 설정이 된다.
    expect(PAUSES_PER_RUN).toBe(1);
  });
});

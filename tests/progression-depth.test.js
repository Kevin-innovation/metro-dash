import { describe, expect, it } from "vitest";
import { MISSION_DEFS, MISSION_TIERS, missionPay, tierStep } from "../src/missions.js";
import { RANKS, missionTier } from "../src/progression.js";
import {
  POWERUP_BASE_LEVELS,
  POWERUP_IDS,
  POWERUP_MAX_LEVEL,
  powerupDuration,
} from "../src/powerups.js";
import { COMBO_TIERS, comboMultiplier } from "../src/scoring.js";
import { UPGRADE_COSTS, profileWorth, upgradeCost } from "../src/shop.js";
import { MAX_MULTIPLIER, maxDistanceIn, validateRun } from "../src/leaderboard-rules.js";

const xpFor = (level) => RANKS.find((r) => r.level === level).xp;

describe("a combo keeps paying past thirty", () => {
  it("still rewards a chain a good player can actually hold", () => {
    // The screenshots show combos of 138. Everything above 30 used to pay the
    // same, so the back half of a great run was a formality.
    expect(comboMultiplier(138)).toBeGreaterThan(comboMultiplier(30));
  });

  it("climbs at every tier and never falls back", () => {
    let previous = 0;
    for (let combo = 0; combo <= 200; combo++) {
      const now = comboMultiplier(combo);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });

  it("adds smaller steps than the ones below, not larger", () => {
    // A chain this long is already worth a lot; doubling it again would make
    // the board a lucky run rather than a good one.
    const steps = COMBO_TIERS.slice(1).map((tier, i) => tier.multiplier - COMBO_TIERS[i].multiplier);
    const early = Math.max(...steps.slice(0, 3));
    const late = Math.max(...steps.slice(3));
    expect(late).toBeLessThanOrEqual(early);
  });

  it("gives every tier a name of its own", () => {
    const labels = COMBO_TIERS.slice(1).map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });

  it("is known to the run validator, so the best runs still reach the board", () => {
    const seconds = 240;
    const distance = Math.floor(maxDistanceIn(seconds) * 0.85);
    const coins = Math.floor(distance / 3);
    // Every multiplier at once, which is now ten rather than eight.
    const score = Math.floor(distance * 5.8 * MAX_MULTIPLIER * 0.5 + coins * 30 * MAX_MULTIPLIER);
    expect(validateRun({ score, distance, coins, seconds })).toEqual({ ok: true });
  });
});

describe("missions keep growing with the ladder", () => {
  it("no longer stops at rank seven", () => {
    // Lv.8 and Lv.99 used to be handed identical targets for identical pay.
    expect(missionTier(xpFor(99), MISSION_TIERS)).toBeGreaterThan(
      missionTier(xpFor(8), MISSION_TIERS),
    );
  });

  it("gives the first ranks a step each, as it always did", () => {
    for (let level = 1; level <= 7; level++) {
      expect(missionTier(xpFor(level), MISSION_TIERS)).toBe(level - 1);
    }
  });

  it("only ever climbs", () => {
    let previous = -1;
    for (let level = 1; level <= 99; level++) {
      const tier = missionTier(xpFor(level), MISSION_TIERS);
      expect(tier, `level ${level}`).toBeGreaterThanOrEqual(previous);
      previous = tier;
    }
  });

  it("reaches the hardest step well up the ladder, not at rank eight", () => {
    const top = MISSION_TIERS - 1;
    const first = [...Array(99)].map((_, i) => i + 1).find(
      (level) => missionTier(xpFor(level), MISSION_TIERS) === top,
    );
    expect(first).toBeGreaterThan(40);
  });

  it("never deals a step the table has no target for", () => {
    for (let level = 1; level <= 99; level++) {
      const tier = missionTier(xpFor(level), MISSION_TIERS);
      for (const def of MISSION_DEFS) {
        expect(def.targets[tier], `${def.id} @ tier ${tier}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("the generated mission targets", () => {
  it("gives every mission one target per step", () => {
    for (const def of MISSION_DEFS) {
      expect(def.targets, def.id).toHaveLength(MISSION_TIERS);
    }
  });

  it("only ever climbs, so a higher step is never easier", () => {
    for (const def of MISSION_DEFS) {
      for (let i = 1; i < def.targets.length; i++) {
        expect(def.targets[i], `${def.id} step ${i}`).toBeGreaterThan(def.targets[i - 1]);
      }
    }
  });

  it("keeps the seven that were written by hand exactly as they were", () => {
    // Existing saves hold a target and read the step back from it; changing an
    // authored number would repay a mission somebody is halfway through.
    const coinsRun = MISSION_DEFS.find((d) => d.id === "coins-run");
    expect(coinsRun.targets.slice(0, 7)).toEqual([15, 25, 40, 60, 85, 115, 150]);
  });

  it("rounds to numbers somebody could have chosen", () => {
    for (const def of MISSION_DEFS) {
      for (const target of def.targets) {
        const unit = target >= 10000 ? 1000 : target >= 1000 ? 100 : target >= 100 ? 5 : 1;
        expect(target % unit, `${def.id}: ${target}`).toBe(0);
      }
    }
  });

  it("pays more for the harder steps", () => {
    const def = MISSION_DEFS[0];
    for (let tier = 1; tier < MISSION_TIERS; tier++) {
      expect(missionPay(def, tier).coins).toBeGreaterThan(missionPay(def, tier - 1).coins);
    }
  });

  it("keeps the payout growing more slowly than the target does", () => {
    // Otherwise the top steps would be the best-paying place to be rather than
    // the hardest, which is the mistake the rank ladder had.
    const def = MISSION_DEFS[0];
    const targetGrowth = def.targets[MISSION_TIERS - 1] / def.targets[0];
    const payGrowth = tierStep(MISSION_TIERS - 1) / tierStep(0);
    expect(payGrowth).toBeLessThan(targetGrowth);
  });
});

describe("the upgrade track has a late game", () => {
  it("goes past the level everyone was finishing", () => {
    expect(POWERUP_MAX_LEVEL).toBeGreaterThan(POWERUP_BASE_LEVELS);
  });

  it("leaves the first five levels exactly as they were", () => {
    // Anyone part-way up this track paid these prices for these durations.
    expect(UPGRADE_COSTS.slice(0, 6)).toEqual([0, 0, 500, 1200, 2400, 4200]);
    expect(powerupDuration("magnet", 5)).toBe(16);
    expect(powerupDuration("jetpack", 5)).toBe(12);
    expect(powerupDuration("double", 5)).toBe(20);
    expect(powerupDuration("sneakers", 5)).toBe(20);
  });

  it("costs more per level than it did, and buys less", () => {
    for (const id of POWERUP_IDS) {
      const earlyGain = powerupDuration(id, 5) - powerupDuration(id, 4);
      const lateGain = powerupDuration(id, 8) - powerupDuration(id, 7);
      expect(lateGain, id).toBeLessThan(earlyGain);
    }
    for (let level = POWERUP_BASE_LEVELS + 1; level <= POWERUP_MAX_LEVEL; level++) {
      expect(UPGRADE_COSTS[level]).toBeGreaterThan(UPGRADE_COSTS[level - 1]);
    }
  });

  it("keeps every duration climbing, so a level is never wasted", () => {
    for (const id of POWERUP_IDS) {
      for (let level = 2; level <= POWERUP_MAX_LEVEL; level++) {
        expect(powerupDuration(id, level), `${id} @ ${level}`).toBeGreaterThan(
          powerupDuration(id, level - 1),
        );
      }
    }
  });

  it("holds the jetpack shortest of the four", () => {
    // Flying is a pause from the game rather than a better version of it, so
    // it is the one duration that must not keep climbing.
    const top = (id) => powerupDuration(id, POWERUP_MAX_LEVEL);
    for (const id of POWERUP_IDS.filter((x) => x !== "jetpack")) {
      expect(top("jetpack")).toBeLessThan(top(id));
    }
    // And it grew least of all across the new levels.
    const grew = (id) => powerupDuration(id, POWERUP_MAX_LEVEL) - powerupDuration(id, POWERUP_BASE_LEVELS);
    for (const id of POWERUP_IDS.filter((x) => x !== "jetpack")) {
      expect(grew("jetpack")).toBeLessThan(grew(id));
    }
  });

  it("stops at the cap, however high a save claims to be", () => {
    expect(powerupDuration("magnet", 99)).toBe(powerupDuration("magnet", POWERUP_MAX_LEVEL));
    expect(upgradeCost(POWERUP_MAX_LEVEL)).toBeNull();
  });

  it("gives the shop somewhere for late-game coins to go", () => {
    const perPowerup = UPGRADE_COSTS.slice(2, POWERUP_MAX_LEVEL + 1).reduce((a, b) => a + b, 0);
    expect(perPowerup * POWERUP_IDS.length).toBeGreaterThan(120_000);
  });

  it("counts the new levels toward what a profile is worth", () => {
    const maxed = {};
    for (const id of POWERUP_IDS) maxed[id] = POWERUP_MAX_LEVEL;
    const base = {};
    for (const id of POWERUP_IDS) base[id] = POWERUP_BASE_LEVELS;
    expect(profileWorth({ coins: 0, upgrades: maxed })).toBeGreaterThan(
      profileWorth({ coins: 0, upgrades: base }),
    );
  });
});

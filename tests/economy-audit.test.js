import { describe, expect, it } from "vitest";
import { perkFor } from "../src/characters.js";
import { MAX_EVENT_MULTIPLIER } from "../src/events.js";
import {
  MISSION_DEFS,
  MISSION_TIERS,
  applyMetrics,
  dealtTier,
  missionPay,
  missionReward,
} from "../src/missions.js";
import {
  MAX_MULTIPLIER,
  maxDistanceIn,
  validateRun,
} from "../src/leaderboard-rules.js";
import { DOUBLE_SCORE_MULTIPLIER } from "../src/powerups.js";
import { MAX_COMBO_MULTIPLIER } from "../src/scoring.js";
import { missionTier } from "../src/progression.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

describe("a mission pays what its card promised", () => {
  const def = MISSION_DEFS[0];

  it("uses the step it was dealt at, not the one the player reached since", () => {
    // Dealt at the easiest step, finished after climbing several ranks.
    const entry = { id: def.id, target: def.targets[0], progress: def.targets[0], def };
    const paid = missionReward([entry]);
    expect(paid).toEqual(missionPay(def, 0));
  });

  it("does not pay a hard-step price for an easy-step target", () => {
    const easy = { id: def.id, target: def.targets[0], progress: def.targets[0], def };
    const hard = missionPay(def, MISSION_TIERS - 1);
    expect(missionReward([easy]).coins).toBeLessThan(hard.coins);
  });

  it("reads the step back from the target, the way the card does", () => {
    for (let tier = 0; tier < def.targets.length; tier++) {
      expect(dealtTier({ target: def.targets[tier], def })).toBe(tier);
    }
  });

  it("still pays the hard price for a target actually dealt hard", () => {
    const top = MISSION_TIERS - 1;
    const entry = { id: def.id, target: def.targets[top], progress: def.targets[top], def };
    expect(missionReward([entry])).toEqual(missionPay(def, top));
  });

  it("cannot be farmed by holding an easy mission across a level-up", () => {
    // The exploit the current-tier lookup created: bank the same finished
    // mission as a Lv.1 player and as a Lv.8 one, and get the same money.
    const entry = { id: def.id, target: def.targets[0], progress: def.targets[0], def };
    const asBeginner = missionReward([entry]);
    expect(missionTier(50000, MISSION_TIERS)).toBeGreaterThan(0);
    expect(missionReward([entry])).toEqual(asBeginner);
  });
});

describe("the run validator knows every multiplier that exists", () => {
  it("matches what the game can actually stack", () => {
    expect(MAX_MULTIPLIER).toBe(
      MAX_COMBO_MULTIPLIER * DOUBLE_SCORE_MULTIPLIER * MAX_EVENT_MULTIPLIER,
    );
  });

  it("accepts a strong run through a coin rush with double score", () => {
    // Every multiplier at once is legal play, and it used to be rejected: the
    // ceiling assumed four, and a combo through a ×2 section with the ×2
    // power-up is eight.
    const seconds = 240;
    const distance = Math.floor(maxDistanceIn(seconds) * 0.85);
    const coins = Math.floor(distance / 3);
    const score = Math.floor(distance * 5.8 * 8 * 0.5 + coins * 30 * 8);
    expect(validateRun({ score, distance, coins, seconds })).toEqual({ ok: true });
  });

  it("still refuses a score nothing could have produced", () => {
    const seconds = 240;
    const distance = Math.floor(maxDistanceIn(seconds) * 0.85);
    const coins = Math.floor(distance / 3);
    const impossible = distance * 5.8 * MAX_MULTIPLIER * 40 + coins * 30 * MAX_MULTIPLIER * 40;
    expect(validateRun({ score: impossible, distance, coins, seconds }).ok).toBe(false);
  });

  it("still refuses more distance than the speed curve allows", () => {
    const seconds = 60;
    const result = validateRun({
      score: 1000,
      distance: maxDistanceIn(seconds) * 4,
      coins: 10,
      seconds,
    });
    expect(result).toMatchObject({ ok: false, reason: "distance" });
  });

  it("still refuses more coins than the track can hold", () => {
    const seconds = 60;
    const distance = Math.floor(maxDistanceIn(seconds) * 0.5);
    expect(validateRun({ score: 1000, distance, coins: distance * 5, seconds })).toMatchObject({
      ok: false,
      reason: "coins",
    });
  });
});

describe("the experience perk reaches all experience", () => {
  const missionXpFor = (xpScale) => {
    const s = store();
    const run = new Run(s);
    run.xpScale = xpScale;
    const def = MISSION_DEFS.find((d) => d.metric === "coins" && d.scope === "run");
    s.data.missions = [{ id: def.id, target: def.targets[0], progress: 0 }];
    s.data.missionDay = 1;
    run.coins = def.targets[0];
    run.bank(true);
    return s.data.xp;
  };

  it("pays 역무원 more experience for the same missions", () => {
    const plain = missionXpFor(1);
    const perked = missionXpFor(perkFor("attendant").xpBonus);
    expect(plain).toBeGreaterThan(0);
    expect(perked).toBeGreaterThan(plain);
  });

  it("leaves everyone else exactly where they were", () => {
    expect(perkFor("runner").xpBonus).toBeUndefined();
    expect(missionXpFor(1)).toBe(missionXpFor(undefined ?? 1));
  });
});

describe("the mission perk reaches both halves of a mission reward", () => {
  const banked = (character) => {
    const s = store();
    s.data.character = character;
    const run = new Run(s);
    const def = MISSION_DEFS.find((d) => d.metric === "coins" && d.scope === "run");
    s.data.missions = [{ id: def.id, target: def.targets[0], progress: 0 }];
    s.data.missionDay = 1;
    run.coins = def.targets[0];
    const result = run.bank(true);
    return { xp: result.reward.xp, coins: result.reward.coins };
  };

  it("pays 야근러 more of both, as the card beside it shows both", () => {
    const plain = banked("runner");
    const perked = banked("nightshift");
    expect(perked.coins).toBeGreaterThan(plain.coins);
    expect(perked.xp).toBeGreaterThan(plain.xp);
  });
});

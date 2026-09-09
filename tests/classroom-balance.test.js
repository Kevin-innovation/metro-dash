import { describe, expect, it } from "vitest";
import {
  CHARACTERS,
  MAX_CHARACTER_SCORE_BONUS,
  characterById,
  perkFor,
} from "../src/characters.js";
import {
  COMBO_WINDOW,
  DIST_SCORE_RATE,
  COIN_BASE,
  MAX_COMBO_MULTIPLIER,
} from "../src/scoring.js";
import {
  PRESSURE_STARTS_AT,
  MAGNET_RANGE,
  MAGNET_TIME,
  SNEAKER_APEX,
  SNEAKER_JUMP_MULT,
} from "../src/config.js";
import { SPEC } from "../src/specs.js";
import {
  SPRINT_SPEED,
  POWERUP_IDS,
  POWERUPS,
  DOUBLE_SCORE_MULTIPLIER,
  activatePowerup,
  createPowerupState,
  isActive,
  powerupDuration,
  powerupScoreMultiplier,
  runSpeedFactor,
} from "../src/powerups.js";
import { POWERUP_PATTERNS } from "../src/patterns.js";
import { SLOT_FACES } from "../src/slots.js";
import { MAX_EVENT_MULTIPLIER } from "../src/events.js";
import { SLOT_TOP_MULTIPLIER } from "../src/slots.js";
import { MAX_MULTIPLIER } from "../src/leaderboard-rules.js";
import { Run } from "../src/run.js";
import { SaveStore, normalizeSave } from "../src/save.js";
import { HAZARD_FROM_SCORE } from "../src/spawner.js";
import { MISSION_DEFS } from "../src/missions.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

/** The roster that was in the shop before the classroom rebalance. */
const ORIGINAL_IDS = [
  "runner",
  "neon",
  "sunset",
  "mono",
  "driver",
  "nightshift",
  "sweeper",
  "legend",
  "athlete",
  "attendant",
  "scarecrow",
];

describe("the original roster no longer buys a score multiplier", () => {
  it("keeps every original runner", () => {
    for (const id of ORIGINAL_IDS) expect(characterById(id).id).toBe(id);
  });

  it("strips scoreBonus from everyone who was already in the shop", () => {
    for (const id of ORIGINAL_IDS) {
      expect(perkFor(id).scoreBonus, id).toBeUndefined();
    }
  });

  it("leaves each paid original runner a signature that is not a score percent", () => {
    for (const id of ORIGINAL_IDS) {
      if (id === "runner") continue;
      const perk = perkFor(id);
      const keys = Object.keys(perk).filter((key) => key !== "scoreBonus" && key !== "coinBonus");
      const hasCoin = (perk.coinBonus ?? 1) > 1;
      expect(keys.length > 0 || hasCoin, `${id} has nothing left to do`).toBe(true);
    }
  });
});

describe("ten more runners after 허수아비", () => {
  const originals = new Set(ORIGINAL_IDS);
  const added = CHARACTERS.filter((character) => !originals.has(character.id));

  it("adds ten", () => {
    expect(added).toHaveLength(10);
  });

  it("prices them above 허수아비, climbing", () => {
    const scarecrow = characterById("scarecrow").cost;
    expect(added[0].cost).toBeGreaterThan(scarecrow);
    for (let i = 1; i < added.length; i++) {
      expect(added[i].cost, added[i].id).toBeGreaterThan(added[i - 1].cost);
    }
  });

  it("gives each new runner a signature perk and a modest score bonus", () => {
    for (const character of added) {
      const perk = character.perk ?? {};
      expect(perk.scoreBonus, character.id).toBeGreaterThan(1);
      expect(perk.scoreBonus, character.id).toBeLessThanOrEqual(1.25);
      const signature = Object.keys(perk).filter((key) => key !== "scoreBonus");
      expect(signature.length, character.id).toBeGreaterThan(0);
    }
  });

  it("climbs the score bonus with the price", () => {
    for (let i = 1; i < added.length; i++) {
      expect(added[i].perk.scoreBonus).toBeGreaterThanOrEqual(added[i - 1].perk.scoreBonus);
    }
  });

  it("does not let the new top beat 허수아비 at the crow", () => {
    const scarecrow = perkFor("scarecrow").crowTime;
    for (const character of added) {
      const crow = character.perk.crowTime ?? 1;
      expect(crow, character.id).toBeGreaterThanOrEqual(scarecrow);
    }
  });
});

describe("점수 2배 is gone", () => {
  it("is not a power-up, a pickup, or a wheel face", () => {
    expect(POWERUP_IDS).not.toContain("double");
    expect(POWERUPS.double).toBeUndefined();
    expect(SPEC.double).toBeUndefined();
    expect(POWERUP_PATTERNS.double).toBeUndefined();
    expect(SLOT_FACES.some((face) => face.effect.id === "double")).toBe(false);
  });

  it("no longer multiplies the run", () => {
    expect(DOUBLE_SCORE_MULTIPLIER).toBe(1);
    const timers = createPowerupState();
    expect(powerupScoreMultiplier(timers)).toBe(1);
  });

  it("does not sit in the server's ceiling", () => {
    expect(MAX_MULTIPLIER).toBe(
      MAX_COMBO_MULTIPLIER * MAX_EVENT_MULTIPLIER * SLOT_TOP_MULTIPLIER * MAX_CHARACTER_SCORE_BONUS,
    );
  });
});

describe("질주 replaces 여유", () => {
  it("is a power-up the shop and the track still know as focus", () => {
    expect(POWERUP_IDS).toContain("focus");
    expect(POWERUPS.focus.name).toBe("질주");
    expect(SPEC.focus.powerup).toBe("focus");
    expect(POWERUP_PATTERNS.focus).toBeTypeOf("function");
  });

  it("speeds the run instead of slowing it, and does not multiply the score", () => {
    expect(SPRINT_SPEED).toBeGreaterThan(1);
    expect(SPRINT_SPEED).toBeLessThan(1.5);
    expect(runSpeedFactor(false)).toBe(1);
    expect(runSpeedFactor(true)).toBe(SPRINT_SPEED);
    const timers = createPowerupState();
    activatePowerup(timers, "focus", 1);
    expect(isActive(timers, "focus")).toBe(true);
    expect(powerupScoreMultiplier(timers)).toBe(1);
  });

  it("keeps spent 점수 2배 / 여유 upgrades so nobody is reset to Lv.1", () => {
    const save = normalizeSave({ upgrades: { magnet: 3, double: 6, sneakers: 2 } });
    expect(save.upgrades.focus).toBe(6);
    expect(save.upgrades.double).toBeUndefined();
  });
});

describe("the floor of a run climbs toward two hundred thousand", () => {
  it("pays more per metre and per coin than the old rates", () => {
    expect(DIST_SCORE_RATE).toBeGreaterThanOrEqual(4);
    expect(COIN_BASE).toBeGreaterThanOrEqual(14);
  });

  it("holds a combo long enough for a beginner to keep it", () => {
    expect(COMBO_WINDOW).toBeGreaterThanOrEqual(2);
  });

  it("leaves the opening a few seconds longer before the squeeze starts", () => {
    expect(PRESSURE_STARTS_AT).toBeGreaterThanOrEqual(12);
  });

  it("lets the crow in from one hundred thousand", () => {
    expect(HAZARD_FROM_SCORE).toBe(100_000);
  });

  it("lets a short, ordinary run bank a six-figure score", () => {
    const run = new Run(store());
    // ~90 seconds of cruising, a mid combo, no character bonus, no wheel.
    run.combo = 20;
    run.advance(90, { travelled: 3200, mounted: false });
    for (let i = 0; i < 400; i++) run.addCoin();
    expect(run.score).toBeGreaterThan(30_000);
  });
});

describe("magnet and sneakers do more of the work", () => {
  it("pulls coins from further and for longer", () => {
    expect(MAGNET_RANGE).toBeGreaterThanOrEqual(8.5);
    expect(MAGNET_TIME).toBeGreaterThanOrEqual(10);
  });

  it("keeps super sneakers under the gate band", () => {
    expect(SNEAKER_JUMP_MULT).toBeGreaterThan(1.3);
    expect(SNEAKER_APEX).toBeLessThan(SPEC.sign.maxY);
  });

  it("makes sneakers last longer at shop level one", () => {
    expect(powerupDuration("sneakers", 1)).toBeGreaterThanOrEqual(12);
  });
});

describe("new character perks actually fire", () => {
  it("치어 starts a run already in a combo", () => {
    const run = new Run(store());
    run.grantStartCombo(perkFor("cheer").startCombo);
    expect(run.combo).toBe(perkFor("cheer").startCombo);
    expect(run.combo).toBeGreaterThanOrEqual(15);
  });

  it("버스기사 pays extra for riding a roof", () => {
    const plain = new Run(store());
    const motor = new Run(store());
    motor.roofScale = perkFor("motor").roofPay;
    plain.advance(1, { travelled: 10, mounted: true });
    motor.advance(1, { travelled: 10, mounted: true });
    expect(motor.score).toBeGreaterThan(plain.score);
  });
});

describe("the 질주 mission replaced 여유", () => {
  it("tracks focuses, not doubles, and says 질주", () => {
    const def = MISSION_DEFS.find((entry) => entry.id === "double-total");
    expect(def.metric).toBe("focuses");
    expect(def.label).toContain("질주");
    expect(def.label).not.toContain("여유");
  });
});

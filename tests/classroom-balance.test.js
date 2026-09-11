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
  SCORE_SCALE,
} from "../src/scoring.js";
import { PHASES } from "../src/pace.js";
import { maxDistanceIn } from "../src/leaderboard-rules.js";
import { runXp } from "../src/progression.js";
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

describe("20만 · 30만 · 40만 · 50만", () => {
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

  it("까마귀는 50만을 넘긴 뒤에 나온다", () => {
    // 옛 10만을 새 스케일로 옮긴 값. 판 안에서의 위치는 그대로다.
    expect(HAZARD_FROM_SCORE).toBe(100_000 * SCORE_SCALE);
  });

  it("1분을 달리면 20만 언저리다", () => {
    // 이 게임이 무엇을 목표로 조율됐는지 적어두는 자리다. 보통 플레이 —
    // 지붕은 절반쯤 타고, 콤보는 BLAZING 언저리에서 유지되고, 코인은
    // 눈에 보이는 것의 절반쯤 먹는 — 한 판의 첫 1분이 20만에 닿는다.
    // 지붕을 아예 안 타면 13만, 전부 타면 26만이니 폭을 넓게 잡는다.
    const run = new Run(store());
    const metres = maxDistanceIn(60);
    const hold = () => {
      run.combo = 15;
      run.comboT = 999;
    };

    hold();
    run.advance(36, { travelled: metres * 0.6, mounted: false });
    hold();
    run.advance(24, { travelled: metres * 0.4, mounted: true });
    for (let i = 0; i < 160; i++) run.addCoin();
    for (let i = 0; i < 30; i++) {
      hold();
      run.addClear("jump");
    }
    for (let i = 0; i < 15; i++) {
      hold();
      run.addClear("slide");
    }
    for (let i = 0; i < 12; i++) {
      hold();
      run.addMount(false);
    }

    expect(run.score).toBeGreaterThan(150_000);
    expect(run.score).toBeLessThan(260_000);
  });

  it("난이도 사다리가 50만 언저리에서 끝난다", () => {
    // 30만에서 엄청 어려워지고 40만 · 50만이 벽이라는 게 이 곡선의 요구다.
    // 보통 플레이가 그 넷을 지나는 시각이 대략 60 · 77 · 89 · 100초이므로,
    // 마지막 단계는 그 뒤에 바로 붙어 있어야 한다 — 5분 30초에 오던 시절엔
    // 50만이 사다리의 한중간이었다.
    const byId = Object.fromEntries(PHASES.map((phase) => [phase.name, phase.t]));
    expect(byId.MAX).toBeLessThan(85);
    expect(byId.CHAOS).toBeLessThan(110);
    expect(byId.MAYHEM).toBeLessThan(160);
    // 그러면서도 순서와 간격은 지켜야 한다.
    for (let i = 1; i < PHASES.length; i++) {
      expect(PHASES[i].t, PHASES[i].name).toBeGreaterThan(PHASES[i - 1].t + 8);
    }
  });

  it("점수 스케일이 랭크까지 밀어 올리지 않는다", () => {
    // 점수는 7배가 됐고 경험치는 그대로여야 한다. 안 그러면 같은 판으로
    // 랭크가 일곱 배 빨리 오른다.
    expect(runXp(100_000 * SCORE_SCALE)).toBe(4000);
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

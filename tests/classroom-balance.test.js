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
import { PHASES } from "../src/pace.js";
import { RUN_LIMIT_SECONDS } from "../src/config.js";
import { MAX_RUN_SECONDS, maxDistanceIn } from "../src/leaderboard-rules.js";
import { candidatesFor } from "../src/patterns.js";

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
    const timers = createPowerupState();
    expect(runSpeedFactor(timers)).toBe(1);
    activatePowerup(timers, "focus", 1);
    expect(isActive(timers, "focus")).toBe(true);
    expect(runSpeedFactor(timers)).toBe(SPRINT_SPEED);
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

  it("까마귀는 50만 — 벽이 벽인 이유의 일부다", () => {
    // 스케일에서 유도하지 않는다. 스케일은 트랙 속도를 따라 움직였고 그때마다
    // 이 값을 같이 옮기는 걸 잊었다 — 70만으로 남아 있던 동안 초보는 3분 안에
    // 까마귀를 한 번도 못 봤고 보통도 마지막 33초뿐이었다. 새가 게임에서
    // 사실상 빠져 있었고 어느 숫자도 그렇게 말하지 않았다.
    //
    // 50만은 판이 브루탈해져야 한다고 정해둔 지점이고, 까마귀는 그렇게 만들
    // 수 있는 것 중 제일 강한 물건이다. 둘을 같은 숫자에 묶는다.
    expect(HAZARD_FROM_SCORE).toBe(500_000);
  });

  it("1분을 달리면 20만이다", () => {
    // 이 게임이 무엇을 목표로 조율됐는지 적어두는 자리다. 생존 점수만으로
    // 1분이 정확히 20만이고, 코인·슬라이드·점프·지붕은 그 위에 얹힌다.
    // 거리로 매기던 시절엔 같은 1분이 초보 10만 숙련 19만이었고, 세 번째
    // 1분은 첫 1분의 네 배였다.
    const run = new Run(store());
    const metres = maxDistanceIn(60);
    run.advance(60, { travelled: metres, mounted: false });
    expect(run.scoreDist).toBeCloseTo(200_000, 6);

    // 그 위에 얹히는 몫. 잘한 판이 못한 판보다 높은 건 전적으로 이쪽이다.
    for (let i = 0; i < 160; i++) run.addCoin();
    run.combo = 15;
    run.comboT = 999;
    for (let i = 0; i < 45; i++) {
      run.addClear("jump");
      run.combo = 15;
      run.comboT = 999;
    }
    expect(run.score).toBeGreaterThan(215_000);
    expect(run.score).toBeLessThan(300_000);
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

  it("판이 끝난다", () => {
    // 이 게임은 끝날 수가 없었다. 공정성 감사가 모든 배치를 클리어 가능하게
    // 보장하고, 모든 배치를 넘기는 사람은 죽지 않고, 죽지 않으면 앉아 있는
    // 만큼 점수가 난다 — 4분 174만, 30분 1,952만. 리더보드가 재던 건 실력이
    // 아니라 인내심이었다.
    //
    // 결승선은 두 숫자 사이에 있어야 한다. 이미 올라간 기록(4분치)이 아직
    // 깨질 수 있을 만큼 멀고, 더 앉아 있는 게 전략이 아닐 만큼 가깝게.
    // 3분 내외. 난이도 사다리의 마지막 단계가 142초에 오니, 그걸 만나고
    // 겨룰 시간이 남으면서 더 앉아 있는 게 전략이 되지 않는 길이다.
    expect(RUN_LIMIT_SECONDS).toBeGreaterThan(150);
    expect(RUN_LIMIT_SECONDS).toBeLessThanOrEqual(210);
    // 서버도 그 길이만 받는다.
    expect(MAX_RUN_SECONDS).toBeGreaterThan(RUN_LIMIT_SECONDS);
    expect(MAX_RUN_SECONDS).toBeLessThan(RUN_LIMIT_SECONDS * 2);
  });

  it("마지막 두 단계가 빈 단계가 아니다", () => {
    // SURGE 와 MAYHEM 은 토스트만 뜨는 단계였다. minPhase 7·8 배치가 하나도
    // 없어서 CHAOS 의 풀을 그대로 물려받았고, FULL_PHASE 가 6이라 가중치
    // 드리프트도 102초에 멈춰 있었다.
    const size = (phase) => candidatesFor(phase).length;
    expect(size(7)).toBeGreaterThan(size(6));
    expect(size(8)).toBeGreaterThan(size(7));
  });

  it("점수 스케일이 랭크까지 밀어 올리지 않는다", () => {
    // 점수 단위는 여러 번 바뀌었고 앞으로도 바뀐다 — 트랙이 빨라지면 같은
    // 1분에 더 멀리 가고, 마일스톤을 지키려면 배율이 따라 움직여야 한다.
    // 경험치는 그 움직임을 따라가면 안 된다. 랭크 사다리도, 한 레벨의
    // 가격도, 도착 보상도 전부 「한 판이 경험치 얼마짜리인가」 위에 서 있다.
    //
    // 고정점은 마일스톤이다. 1분은 어느 스케일에서나 20만이고, 그 1분은
    // 언제나 1,150 언저리의 경험치를 줘야 한다.
    expect(runXp(200_000)).toBeGreaterThan(1050);
    expect(runXp(200_000)).toBeLessThan(1250);
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

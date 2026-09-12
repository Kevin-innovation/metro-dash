import { describe, expect, it } from "vitest";
import { RUN_LIMIT_SECONDS } from "../src/config.js";
import { MAX_EVENT_MULTIPLIER } from "../src/events.js";
import { MISSION_DEFS, MISSION_TIERS } from "../src/missions.js";
import { maxDistanceIn } from "../src/leaderboard-rules.js";
import { MAX_CHARACTER_SCORE_BONUS } from "../src/characters.js";
import { SLOT_TOP_MULTIPLIER } from "../src/slots.js";
import { HAZARD_FROM_SCORE } from "../src/spawner.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";
import {
  JUMP_BONUS,
  MAX_COMBO_MULTIPLIER,
  MOUNT_BONUS,
  NEAR_MISS_BONUS,
  SLIDE_BONUS,
  TARGET_SCORE_PER_MINUTE,
  survivalGain,
} from "../src/scoring.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

/**
 * The numbers this game is balanced around, checked against each other.
 *
 * Every balance mistake this session was the same mistake: a number was moved
 * and the things calibrated against it were not. The score scale changed three
 * times and the crow's threshold stayed where the first one had put it, so the
 * bird left the game. The run got a finish line and the mission ladder went on
 * asking for 730 seconds out of 180. A multiplier was let onto the survival
 * term without anyone multiplying it by the other multipliers, and one spin
 * became worth half a run.
 *
 * None of those are hard to see once someone looks. This is the file that
 * looks — so the next time one of those numbers moves, a test says which other
 * ones have to move with it rather than a player finding out.
 */

describe("판이 읽히는 숫자들", () => {
  it("1분은 20만이다", () => {
    // 사다리 전체가 여기에 매달려 있다. 20만 · 30만 · 50만이라는 마일스톤도,
    // 까마귀 문턱도, 미션 목표도 전부 이 한 줄에서 나온다.
    expect(survivalGain(60)).toBe(TARGET_SCORE_PER_MINUTE);
  });

  it("까마귀는 벽과 같은 숫자에 있다", () => {
    // 벽은 50만이고, 까마귀는 벽을 벽으로 만드는 물건이다. 문턱이 스케일과
    // 따로 놀면 — 실제로 그랬다 — 새가 조용히 게임에서 빠진다.
    const wall = TARGET_SCORE_PER_MINUTE * 2.5;
    expect(HAZARD_FROM_SCORE).toBe(wall);
    // 그리고 판 안에서 닿을 수 있는 곳이어야 한다.
    expect(HAZARD_FROM_SCORE).toBeLessThan(survivalGain(RUN_LIMIT_SECONDS) * 1.5);
  });
});

describe("생존 점수를 곱하는 것들", () => {
  /** 생존 점수에 걸리는 배수를 전부 켠 Run. */
  function maxed() {
    const run = new Run(store());
    run.eventMultiplier = MAX_EVENT_MULTIPLIER;
    run.scoreScale = MAX_CHARACTER_SCORE_BONUS;
    run.setSlotMultiplier(SLOT_TOP_MULTIPLIER, 30);
    run.combo = 200;
    run.comboT = 999;
    return run;
  }

  it("전부 켜도 한 판을 몇 초에 끝낼 수 없다", () => {
    // 이걸 안 재봐서 57초짜리 판이 64만으로 끝났다. 룰렛 ×10 에 구간 ×2 가
    // 곱해져 초당 66,660 점이었고 8초면 50만이었다.
    const run = maxed();
    run.advance(10, { travelled: 700, mounted: false });
    // 10초가 한 판(3분)의 5분의 1을 넘으면 안 된다.
    expect(run.scoreDist).toBeLessThan(survivalGain(RUN_LIMIT_SECONDS) * 0.2);
  });

  it("판 내내 걸려도 곡선이 달아나지 않는다", () => {
    // 판 전체에 걸 수 있는 것은 캐릭터 보너스뿐이고, 나머지는 정해진 창이다.
    const run = maxed();
    run.advance(RUN_LIMIT_SECONDS, { travelled: 11_000, mounted: false });
    expect(run.scoreDist).toBeLessThan(survivalGain(RUN_LIMIT_SECONDS) * 3);
  });
});

describe("한 판짜리 미션은 한 판 안에 끝낼 수 있어야 한다", () => {
  const runDefs = MISSION_DEFS.filter((def) => def.scope === "run");

  it("모든 단계가 판 안에서 가능하다", () => {
    // 판에 결승선을 놓으면서 이걸 안 봤다. 최상위가 730초 생존과 12,000m
    // 주행을 요구하고 있었는데, 판은 180초에 끝나고 11,496m 를 간다.
    // 어려운 미션이 아니라 깰 수 없는 미션이었고, 제일 멀리 온 사람에게
    // 주어지고 있었다.
    const limit = {
      seconds: RUN_LIMIT_SECONDS,
      distance: maxDistanceIn(RUN_LIMIT_SECONDS),
    };
    for (const def of runDefs) {
      const ceiling = limit[def.metric];
      if (ceiling === undefined) continue;
      for (const target of def.targets) {
        expect(target, `${def.id} ${target}`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("모든 미션이 단계를 끝까지 가지고 있다", () => {
    for (const def of MISSION_DEFS) {
      expect(def.targets, def.id).toHaveLength(MISSION_TIERS);
      expect(def.targets[0], def.id).toBeGreaterThan(0);
    }
  });

  it("단계가 뒤로 갈수록 어려워지거나, 최소한 물러서지는 않는다", () => {
    // 천장에 부딪히면 평평해질 수는 있다. 내려가서는 안 된다.
    for (const def of MISSION_DEFS) {
      for (let i = 1; i < def.targets.length; i++) {
        expect(def.targets[i], `${def.id} ${i}`).toBeGreaterThanOrEqual(def.targets[i - 1]);
      }
    }
  });
});

describe("아슬아슬이 곡선을 흔들지 않는다", () => {
  it("해낸 것보다 싸다", () => {
    // 피한 것은 어차피 지나가는 중에 일어난 일이고, 동작은 하러 간 것이다.
    // 이게 뒤집히면 제일 싼 점수가 아무것도 안 하고 옆으로 붙어 가는 것이 된다.
    for (const verb of [JUMP_BONUS, SLIDE_BONUS, MOUNT_BONUS]) {
      expect(NEAR_MISS_BONUS).toBeLessThan(verb);
    }
  });

  it("도배해도 동작으로 버는 것보다 적다", () => {
    // 배수와 비교하면 안 된다 — 룰렛이 ×10 일 때는 슬라이드도 마운트도 똑같이
    // 열 배라, 아슬아슬만 특별히 위험한 게 아니다. 비교 대상은 같이 곱해지는
    // 것들이어야 한다.
    //
    // 빈도는 실측이다. 레인 가장자리에 붙어 25초를 달리게 해서 초당 0.56회.
    // 레인 한가운데로 가면 0회 — 안전하게 달리는 사람에게는 아예 안 붙는다.
    const grazePerSecond = 0.7; // 실측 0.56 에 여유
    const clearPerSecond = 1.5; // 후반 배치 밀도
    expect(NEAR_MISS_BONUS * grazePerSecond).toBeLessThan(SLIDE_BONUS * clearPerSecond);
  });

  it("콤보를 올리지 않는다", () => {
    // 옆 레인에는 내려가는 내내 뭔가 서 있다. 이게 콤보를 올리면 아무것도
    // 안 하고도 배수가 유지되고, 배수가 말하는 뜻이 달라진다.
    const run = new Run(store());
    for (let i = 0; i < 30; i++) run.addNearMiss();
    expect(run.combo).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  COIN_BASE,
  COMBO_WINDOW,
  COMBO_WINDOW_OPEN,
  COMBO_WINDOW_TIGHTENS_BY,
  JUMP_BONUS,
  MOUNT_BONUS,
  HOP_BONUS,
  SLIDE_BONUS,
  comboWindowAt,
  readableGain,
  survivalGain,
} from "../src/scoring.js";
import { EVENTS, MAX_EVENT_MULTIPLIER, eventById } from "../src/events.js";
import { Run } from "../src/run.js";
import { Interactions } from "../src/interactions.js";
import { LANES } from "../src/config.js";
import { SaveStore } from "../src/save.js";
import { MISSION_DEFS } from "../src/missions.js";
import { perkFor } from "../src/characters.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

describe("coins do not feed the score engine", () => {
  it("does not raise the combo", () => {
    const run = new Run(store());
    for (let i = 0; i < 40; i++) run.addCoin();
    expect(run.combo).toBe(0);
    expect(run.coins).toBe(40);
  });

  it("pays a flat amount even with combo, rush and a ×10 wheel", () => {
    const run = new Run(store());
    run.combo = 100;
    run.eventMultiplier = 2;
    run.setSlotMultiplier(10, 8);
    const gain = run.addCoin();
    expect(gain).toBe(COIN_BASE);
    expect(run.scoreCoins).toBe(COIN_BASE);
  });
});

describe("clears feed the combo", () => {
  it("slides, jumps and roofs raise it, coins do not", () => {
    const run = new Run(store());
    run.addClear("slide");
    run.addClear("jump");
    run.addMount(false);
    expect(run.combo).toBe(3);
    run.addCoin();
    expect(run.combo).toBe(3);
  });

  it("pays the verb it just asked for, at the multiplier before the bump", () => {
    // SLIDE! and JUMP! used to flash over a score that did not move. They pay
    // now — at the tier standing when the obstacle was cleared, because the
    // clear is what earns the next one.
    const run = new Run(store());
    expect(run.addClear("slide")).toBe(SLIDE_BONUS);
    expect(run.scoreBonus).toBe(SLIDE_BONUS);
    expect(run.addClear("jump")).toBe(JUMP_BONUS);
    expect(run.scoreBonus).toBe(SLIDE_BONUS + JUMP_BONUS);
  });

  it("is still not the near-miss bonus, which is gone", () => {
    const run = new Run(store());
    expect(run.addNearMiss).toBeUndefined();
  });

  it("a gate is worth more than a crate, and a mount more than either", () => {
    expect(SLIDE_BONUS).toBeGreaterThan(JUMP_BONUS);
    expect(MOUNT_BONUS).toBeGreaterThan(SLIDE_BONUS);
  });
});

describe("콤보 유지창", () => {
  it("초반엔 넓고 트랙이 촘촘해지면 좁아진다", () => {
    expect(comboWindowAt(0)).toBe(COMBO_WINDOW_OPEN);
    expect(comboWindowAt(20)).toBeGreaterThan(COMBO_WINDOW);
    expect(comboWindowAt(20)).toBeLessThan(COMBO_WINDOW_OPEN);
    expect(comboWindowAt(COMBO_WINDOW_TIGHTENS_BY)).toBe(COMBO_WINDOW);
    expect(comboWindowAt(600)).toBe(COMBO_WINDOW);
  });

  it("런이 실제로 그 값을 쓴다", () => {
    const run = new Run(store());
    run.addClear("jump");
    expect(run.comboT).toBeCloseTo(COMBO_WINDOW_OPEN, 5);
    run.seconds = 600;
    run.addClear("jump");
    expect(run.comboT).toBeCloseTo(COMBO_WINDOW, 5);
  });
});

describe("지나가지 않은 레인은 클리어가 아니다", () => {
  /** 한 배치를 가로지르며 Z를 넘기는 최소한의 러너. */
  function crossAt(playerX, itemX) {
    const run = new Run(store());
    const item = {
      type: "crate",
      lethal: true,
      depth: 1,
      minY: 0,
      maxY: 1,
      scored: false,
      taken: false,
      z: 0,
      prevZ: 0,
      mesh: { position: { x: itemX } },
    };
    const interactions = new Interactions({ live: [item] }, run);
    const player = { x: playerX, prevX: playerX, z: 1, prevZ: -1, y: 0, prevY: 0, height: 1, prevHeight: 1, flying: false, mounted: null };
    return { tally: interactions.scoreClears(player), run, item };
  }

  it("옆 레인 상자는 JUMP! 도 점수도 아니다", () => {
    // 코인만 먹고 지나가는데 양옆 레인의 상자마다 JUMP! 가 뜨고 점수가
    // 붙던 버그. 콤보만 오르던 시절엔 안 보였고, 클리어에 값을 매기는
    // 순간 게임에서 제일 싼 점수가 됐다.
    const { tally, run } = crossAt(0, LANES[2]);
    expect(tally.tricks).toHaveLength(0);
    expect(run.scoreBonus).toBe(0);
    expect(run.combo).toBe(0);
  });

  it("실제로 지나간 레인은 인정한다", () => {
    const { tally, run } = crossAt(0, 0);
    expect(tally.tricks).toHaveLength(1);
    expect(tally.tricks[0].kind).toBe("jump");
    expect(run.scoreBonus).toBeGreaterThan(0);
    expect(run.combo).toBe(1);
  });

  it("미션이 세는 게이트 수도 같이 정직해진다", () => {
    const far = crossAt(0, LANES[2]);
    expect(far.tally.barriers + far.tally.gates).toBe(0);
    const near = crossAt(0, 0);
    expect(near.tally.barriers).toBe(0);
  });
});

describe("구간 배수는 생존 점수에도 걸린다", () => {
  it("「지붕 하이웨이 ×2」가 실제로 ×2다", () => {
    // 배너는 ×2라고 적는데 생존 점수에는 안 걸려서, 화면이 약속한 것을 점수가
    // 하지 않고 있었다. 생존 점수가 판의 대부분이라 체감상 아무 일도 안 났다.
    const plain = new Run(store());
    plain.advance(10, { travelled: 400, mounted: false });

    const section = new Run(store());
    section.eventMultiplier = 2;
    section.advance(10, { travelled: 400, mounted: false });

    expect(section.scoreDist).toBeCloseTo(plain.scoreDist * 2, 6);
  });

  it("콤보는 여전히 생존 점수를 곱하지 않는다", () => {
    // 구간과 룰렛은 정해진 창이고, 콤보는 판 내내 올라가기만 한다. 곡선을
    // 휘게 만든 건 콤보 쪽이었다.
    const run = new Run(store());
    run.combo = 100;
    run.comboT = 999;
    run.advance(10, { travelled: 400, mounted: false });
    expect(run.scoreDist).toBeCloseTo(survivalGain(10), 6);
    // 대신 해낸 것에는 그대로 걸린다.
    run.combo = 100;
    run.comboT = 999;
    const gain = run.addClear("slide");
    expect(gain).toBeGreaterThan(SLIDE_BONUS);
  });
});

describe("sections", () => {
  it("gives the score multiplier to the hard jobs, not the rest", () => {
    expect(eventById("coinrush").scoreMultiplier).toBe(1);
    expect(eventById("gates").scoreMultiplier).toBe(2);
    expect(eventById("roofs").scoreMultiplier).toBe(2);
    expect(MAX_EVENT_MULTIPLIER).toBe(2);
    expect(EVENTS).toHaveLength(3);
  });
});

describe("missions no longer ask for near misses", () => {
  it("dropped both near-miss cards", () => {
    expect(MISSION_DEFS.some((def) => def.id.includes("nearmiss"))).toBe(false);
    expect(MISSION_DEFS.some((def) => def.metric.toLowerCase().includes("nearmiss"))).toBe(false);
  });
});

describe("사진부 is not a near-miss skin", () => {
  it("keeps a signature that is not nearMissScale", () => {
    const perk = perkFor("lens");
    expect(perk.nearMissScale).toBeUndefined();
    expect(perk.slideTime).toBeGreaterThan(1);
  });
});

describe("룰렛은 시계를 곱하지 않는다", () => {
  it("×10 이 생존 점수에 걸리지 않는다", () => {
    // 한 판만 그렇게 걸어봤고 57초에 64만이 나왔다. 룰렛 최고 ×10 에 구간
    // ×2 가 곱해지면 초당 66,660 점이고, 8초면 50만이다 — 한 판을 8초에
    // 끝내는 값이다. 룰렛은 얼마나 잘하고 있는지에 거는 내기고, 시계는
    // 플레이하는 대상이 아니다.
    const run = new Run(store());
    run.setSlotMultiplier(10, 8);
    run.eventMultiplier = 2;
    run.advance(8, { travelled: 500, mounted: false });
    // 구간 ×2 만 걸린다.
    expect(run.scoreDist).toBeCloseTo(survivalGain(8) * 2, 6);
  });

  it("대신 해낸 것에는 그대로 걸린다", () => {
    const run = new Run(store());
    const plain = run.addMount(false);
    run.setSlotMultiplier(10, 8);
    const spun = run.addMount(false);
    expect(spun / plain).toBeCloseTo(10, 6);
  });

  it("구간 배수 하나로는 판이 깨지지 않는다", () => {
    // ×2 가 14초 — 생존 점수로 4.7만. 한 판이 100만대인 게임에서 감당되는 크기다.
    const gain = survivalGain(14) * 2 - survivalGain(14);
    expect(gain).toBeLessThan(60_000);
  });
});

describe("화면의 숫자가 어디서 왔는지 읽혀야 한다", () => {
  it("지급액이 고른 숫자로 떨어진다", () => {
    // 305는 참인 숫자이고 읽을 수 없는 숫자다 — 지붕 200, 콤보로 4분의 1,
    // 캐릭터로 다시 5분의 1. 자릿수에는 그 중 아무것도 안 보인다. 플레이어는
    // 그걸 보고 어디서 왔는지 못 짚고, 그러다 숫자를 아예 안 읽게 된다.
    expect(readableGain(305)).toBe(310);
    expect(readableGain(244)).toBe(240);
    expect(readableGain(87)).toBe(85);
    expect(readableGain(0)).toBe(0);
  });

  it("런이 실제로 그 고른 숫자를 준다", () => {
    const run = new Run(store());
    run.scoreScale = 1.22;
    run.combo = 3;
    run.comboT = 999;
    const gain = run.addMount(false);
    expect(gain % 10).toBe(0);
    expect(run.scoreBonus).toBe(gain);
  });

  it("기본값 자체도 고른 숫자다", () => {
    // 배수가 안 붙은 첫 지붕이 167 로 뜨면 그때부터 못 읽는다.
    for (const v of [MOUNT_BONUS, HOP_BONUS, SLIDE_BONUS, JUMP_BONUS]) {
      expect(v % 10).toBe(0);
    }
  });
});

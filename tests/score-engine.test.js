import { describe, expect, it } from "vitest";
import {
  COIN_BASE,
  COMBO_WINDOW,
  COMBO_WINDOW_OPEN,
  COMBO_WINDOW_TIGHTENS_BY,
  JUMP_BONUS,
  MOUNT_BONUS,
  SLIDE_BONUS,
  comboWindowAt,
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

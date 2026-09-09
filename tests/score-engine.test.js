import { describe, expect, it } from "vitest";
import { COIN_BASE } from "../src/scoring.js";
import { EVENTS, MAX_EVENT_MULTIPLIER, eventById } from "../src/events.js";
import { Run } from "../src/run.js";
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

  it("does not pay a near-miss bonus", () => {
    const run = new Run(store());
    expect(run.addNearMiss).toBeUndefined();
    const before = run.score;
    run.addClear("slide");
    expect(run.scoreBonus).toBe(0);
    expect(run.score).toBe(before);
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

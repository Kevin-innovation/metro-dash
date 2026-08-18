import { describe, expect, it } from "vitest";
import {
  DRIFT_RATE,
  GAP_MAX,
  GAP_WARN,
  RECOVER_RATE,
  STUMBLE_COST,
  createChase,
  evade,
  isWarning,
  stepChase,
  stumble,
  threat,
} from "../src/chase.js";
import { pressureAt } from "../src/pace.js";

/** Run `seconds` of chasing at a fixed pressure. */
function run(chase, seconds, input, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) stepChase(chase, dt, input);
  return chase;
}

describe("깨끗하게 달리면 잡히지 않는다", () => {
  it("압박이 최대여도 실수가 없으면 벌어진다", () => {
    // The chaser must never be a timer the player cannot beat — otherwise the
    // run has a fixed length and skill stops mattering.
    expect(RECOVER_RATE).toBeGreaterThan(0);
    expect(DRIFT_RATE).toBeGreaterThan(RECOVER_RATE);

    const chase = run(createChase(), 400, { pressure: 1 });
    // Drift outruns plain recovery at full pressure, so a player who never
    // takes a risk *does* eventually get caught. That is the intended pressure.
    expect(chase.caught).toBe(true);
  });

  it("아슬아슬하게 피하면 최대 압박에서도 버틴다", () => {
    // One near miss every two seconds is a realistic rate for a player who is
    // actually threading obstacles rather than sitting in an empty lane.
    const chase = createChase();
    for (let t = 0; t < 400; t += 0.5) {
      run(chase, 0.5, { pressure: 1 });
      evade(chase);
    }
    expect(chase.caught).toBe(false);
    expect(chase.gap).toBeGreaterThan(GAP_WARN);
  });

  it("지붕에 올라타면 그동안 벌어진다", () => {
    const riding = run(createChase(), 20, { pressure: 1, onRoof: true });
    const running = run(createChase(), 20, { pressure: 1, onRoof: false });
    expect(riding.gap).toBeGreaterThan(running.gap);
  });
});

describe("초반에는 존재감이 없다", () => {
  it("압박이 0이면 절대 가까워지지 않는다", () => {
    const chase = run(createChase(), 120, { pressure: 0 });
    expect(chase.gap).toBe(GAP_MAX);
    expect(isWarning(chase)).toBe(false);
  });

  it("실제 페이스 곡선으로 돌려도 초반에는 조용하다", () => {
    // Wired to the real curve so a change to pacing cannot quietly turn the
    // chaser into an opening-seconds problem.
    const chase = createChase();
    for (let t = 0; t < 30; t += 1 / 60) stepChase(chase, 1 / 60, { pressure: pressureAt(t) });
    expect(chase.gap).toBe(GAP_MAX);
  });
});

describe("실수는 회복 가능한 대가를 치른다", () => {
  it("호버보드로 버틴 충돌은 거리를 크게 깎는다", () => {
    const chase = createChase();
    stumble(chase);
    expect(chase.gap).toBe(GAP_MAX - STUMBLE_COST);
    expect(chase.caught).toBe(false);
  });

  it("연속으로 부딪히면 결국 잡힌다", () => {
    // This is the whole point: a board is no longer an infinite get-out.
    const chase = createChase();
    let hits = 0;
    while (!chase.caught && hits < 20) {
      stumble(chase);
      hits += 1;
    }
    expect(chase.caught).toBe(true);
    expect(hits).toBeLessThanOrEqual(Math.ceil(GAP_MAX / STUMBLE_COST));
  });

  it("잡힌 뒤에는 어떤 입력에도 되살아나지 않는다", () => {
    const chase = createChase();
    while (!chase.caught) stumble(chase);

    evade(chase, 10);
    stepChase(chase, 5, { pressure: 0, onRoof: true });
    expect(chase.caught).toBe(true);
    expect(chase.gap).toBe(0);
  });
});

describe("경계와 안전장치", () => {
  it("거리는 최대치를 넘지 않는다", () => {
    const chase = createChase();
    evade(chase, 50);
    expect(chase.gap).toBe(GAP_MAX);
    stepChase(chase, 10, { pressure: 0 });
    expect(chase.gap).toBe(GAP_MAX);
  });

  it("거리는 음수가 되지 않는다", () => {
    const chase = createChase();
    stumble(chase);
    stumble(chase);
    stumble(chase);
    expect(chase.gap).toBeGreaterThanOrEqual(0);
  });

  it("dt 가 0 이거나 음수면 아무 일도 없다", () => {
    const chase = createChase();
    stumble(chase);
    const before = chase.gap;
    stepChase(chase, 0, { pressure: 1 });
    stepChase(chase, -1, { pressure: 1 });
    expect(chase.gap).toBe(before);
  });

  it("빠진 입력에도 안전하다", () => {
    const chase = createChase();
    expect(() => stepChase(chase, 0.1)).not.toThrow();
    expect(chase.gap).toBe(GAP_MAX);
  });

  it("프레임 간격이 달라도 결과가 거의 같다", () => {
    // The simulation runs on a fixed step, but this is driven from presentation
    // time; a 30fps phone and a 144Hz monitor must not chase differently.
    const coarse = createChase();
    const fine = createChase();
    stumble(coarse);
    stumble(fine);
    run(coarse, 12, { pressure: 0.6 }, 1 / 30);
    run(fine, 12, { pressure: 0.6 }, 1 / 144);
    expect(Math.abs(coarse.gap - fine.gap)).toBeLessThan(0.2);
  });
});

describe("위협 표시", () => {
  it("멀면 0, 잡히기 직전이면 1이다", () => {
    const chase = createChase();
    expect(threat(chase)).toBe(0);
    chase.gap = GAP_WARN;
    expect(threat(chase)).toBe(0);
    chase.gap = GAP_WARN / 2;
    expect(threat(chase)).toBeCloseTo(0.5, 5);
    chase.gap = 0;
    expect(threat(chase)).toBe(1);
  });

  it("가장 가까웠던 거리를 기억한다", () => {
    // Shown on the results card: how close it got is a story the score alone
    // does not tell.
    const chase = createChase();
    stumble(chase);
    const worst = chase.gap;
    run(chase, 20, { pressure: 0 });
    expect(chase.gap).toBeGreaterThan(worst);
    expect(chase.closest).toBe(worst);
  });
});

describe("실제 페이스 곡선에서의 균형", () => {
  /** How long a player of a given standard lasts before being caught. */
  function survive({ missEvery = 0, stumbleEvery = 0, roofShare = 0 }) {
    const chase = createChase();
    const dt = 1 / 60;
    let t = 0;
    let nextMiss = missEvery;
    let nextStumble = stumbleEvery;
    while (!chase.caught && t < 900) {
      t += dt;
      stepChase(chase, dt, { pressure: pressureAt(t), onRoof: t % 10 < 10 * roofShare });
      if (missEvery && t >= nextMiss) {
        evade(chase);
        nextMiss += missEvery;
      }
      if (stumbleEvery && t >= nextStumble) {
        stumble(chase);
        nextStumble += stumbleEvery;
      }
    }
    return chase.caught ? t : Infinity;
  }

  // These bands are the whole design, written down. A tuning change that moves
  // them is a change to what the game asks of the player, not a detail.
  it("아무것도 하지 않으면 3분 넘게 버티다 잡힌다", () => {
    const t = survive({});
    expect(t).toBeGreaterThan(180);
    expect(t).toBeLessThan(280);
  });

  it("보통으로 피하면 8분 이상 간다", () => {
    expect(survive({ missEvery: 4, roofShare: 0.1 })).toBeGreaterThan(480);
  });

  it("능숙하게 피하면 잡히지 않는다", () => {
    // There has to be a way to outrun it, or it is just a countdown.
    expect(survive({ missEvery: 2.5, roofShare: 0.25 })).toBe(Infinity);
  });

  it("보드로 계속 버티기만 하면 오래 못 간다", () => {
    // Coins used to buy unlimited survival; now a board saves the hit but the
    // ground it costs has to be earned back.
    const careless = survive({ missEvery: 4, stumbleEvery: 20, roofShare: 0.1 });
    const careful = survive({ missEvery: 4, roofShare: 0.1 });
    expect(careless).toBeLessThan(careful * 0.6);
  });
});

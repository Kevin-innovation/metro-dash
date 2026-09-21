import { describe, expect, it } from "vitest";
import {
  CHUSEOK_EVENT_FROM,
  CHUSEOK_EVENT_TO,
  CHUSEOK_MOON_GAP_MAX,
  CHUSEOK_MOON_GAP_MIN,
  CHUSEOK_MOON_MAX_PER_RUN,
  CHUSEOK_SLOT_FACES,
  CHUSEOK_TOP_MULTIPLIER,
  chuseokAt,
  chuseokTableTotal,
  nextMoonGap,
  spinChuseok,
} from "../src/chuseok.js";
import { MAX_WHEEL_MULTIPLIER } from "../src/leaderboard-rules.js";
import { Interactions } from "../src/interactions.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";
import { SPEC } from "../src/specs.js";
import { Spawner } from "../src/spawner.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

function fakePool() {
  return {
    live: [],
    spawn(type, lane, z, y = 0.55) {
      const spec = SPEC[type];
      const item = {
        type,
        lane,
        z,
        prevZ: z,
        y,
        token: spec.token ?? null,
        powerup: spec.powerup ?? null,
        hazard: spec.hazard ?? null,
        lethal: spec.lethal,
        minY: spec.minY,
        maxY: spec.maxY,
        depth: spec.depth,
        length: spec.length,
        taken: false,
        scored: false,
        mesh: { position: { x: lane * 2.2, y, z }, visible: true },
      };
      this.live.push(item);
      return item;
    },
    prune() {},
    clear() { this.live = []; },
  };
}

describe("한가위 이벤트 기간", () => {
  it("시작은 포함하고 끝은 포함하지 않는다", () => {
    expect(chuseokAt(CHUSEOK_EVENT_FROM - 1)).toBe(false);
    expect(chuseokAt(CHUSEOK_EVENT_FROM)).toBe(true);
    expect(chuseokAt(CHUSEOK_EVENT_TO - 1)).toBe(true);
    expect(chuseokAt(CHUSEOK_EVENT_TO)).toBe(false);
  });
});

describe("보름달 룰렛", () => {
  it("확정한 100칸 확률표와 시간을 그대로 쓴다", () => {
    expect(chuseokTableTotal()).toBe(100);
    expect(new Set(CHUSEOK_SLOT_FACES.map((face) => face.id)).size).toBe(CHUSEOK_SLOT_FACES.length);
    const table = Object.fromEntries(
      CHUSEOK_SLOT_FACES.map((face) => [face.effect.value ?? 0, [face.weight, face.effect.seconds ?? 0]]),
    );
    expect(table).toEqual({
      0: [15, 0],
      10: [30, 15],
      12: [22, 14],
      15: [15, 13],
      20: [10, 12],
      25: [5, 11],
      30: [3, 10],
    });
  });

  it("×30도 10초이고 서버 최대 배율도 30을 안다", () => {
    expect(CHUSEOK_TOP_MULTIPLIER).toBe(30);
    expect(MAX_WHEEL_MULTIPLIER).toBe(30);
    const top = CHUSEOK_SLOT_FACES.find((face) => face.effect.value === 30);
    expect(top.effect.seconds).toBe(10);
  });

  it("모든 칸에 실제로 멈출 수 있다", () => {
    const seen = new Set();
    for (let i = 0; i < 10000; i++) {
      seen.add(spinChuseok(() => (i + 0.5) / 10000).face.id);
    }
    expect(seen.size).toBe(CHUSEOK_SLOT_FACES.length);
  });

  it("다음 달은 55~70초 사이에서만 온다", () => {
    expect(nextMoonGap(() => 0)).toBe(CHUSEOK_MOON_GAP_MIN);
    expect(nextMoonGap(() => 0.999999)).toBe(CHUSEOK_MOON_GAP_MAX);
  });
});

describe("보름달 스폰", () => {
  it("40초부터 나오고 한 판에 두 번까지만 나온다", () => {
    const pool = fakePool();
    const spawner = new Spawner(pool);
    spawner.reset(71);

    spawner.place(100, { speed: 50, phaseId: 4, runTime: 39.9, chuseok: true });
    expect(pool.live.some((item) => item.type === "chuseokMoon")).toBe(false);

    spawner.place(300, { speed: 50, phaseId: 4, runTime: 40, chuseok: true });
    expect(pool.live.filter((item) => item.type === "chuseokMoon")).toHaveLength(1);

    for (let i = 0; i < 4; i++) {
      spawner.place(500 + i * 200, {
        speed: 50,
        phaseId: 4,
        runTime: spawner.chuseokMoonAt + 1,
        chuseok: true,
      });
    }
    expect(pool.live.filter((item) => item.type === "chuseokMoon")).toHaveLength(
      CHUSEOK_MOON_MAX_PER_RUN,
    );
  });

  it("제트팩 중인 기회를 버리지 않고 뒤로 미룬다", () => {
    const pool = fakePool();
    const spawner = new Spawner(pool);
    spawner.reset(13);
    spawner.place(100, {
      speed: 50,
      phaseId: 4,
      runTime: 40,
      chuseok: true,
      flying: true,
    });
    expect(spawner.chuseokMoons).toBe(0);

    spawner.place(300, {
      speed: 50,
      phaseId: 4,
      runTime: 41,
      chuseok: true,
      flying: false,
    });
    expect(spawner.chuseokMoons).toBe(1);
    expect(pool.live.some((item) => item.type === "chuseokMoon")).toBe(true);
  });
});

describe("보름달 획득 높이", () => {
  const player = (y) => ({
    x: 0,
    prevX: 0,
    y,
    prevY: y,
    z: 0.4,
    prevZ: -0.4,
    height: 1.55,
    prevHeight: 1.55,
  });

  it("달리기만 해서는 못 먹고 점프 중에는 먹는다", () => {
    const pool = fakePool();
    pool.spawn("chuseokMoon", 0, 0, 4.1);
    const interactions = new Interactions(pool, new Run(store()), { burst() {} });

    expect(interactions.collectPickups(player(0), { upgradeLevel: () => 1 })).toEqual([]);
    const events = interactions.collectPickups(player(2.2), { upgradeLevel: () => 1 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "token", id: "chuseokMoon", y: 4.1 });
  });
});

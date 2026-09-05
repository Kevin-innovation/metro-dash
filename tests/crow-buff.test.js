import { describe, expect, it } from "vitest";
import { EntityPool } from "../src/entities.js";
import { Interactions } from "../src/interactions.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";
import { Spawner } from "../src/spawner.js";
import { HAZARD_FRENZY_SCORE } from "../src/spawner.js";
import { MAGNET_RANGE } from "../src/config.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

/** A pool that records what was asked for without touching a renderer. */
function fakePool() {
  return {
    live: [],
    spawn(type, lane, z, y = 0.55) {
      const item = {
        type, lane, z, prevZ: z, y,
        hazard: type === "crowEgg" ? "crow" : null,
        token: type === "diamond" ? "diamond" : null,
        mesh: { position: { x: lane * 2.6, y, z }, visible: true },
        taken: false, scored: false, lethal: false,
        minY: 0, maxY: 3.2, depth: 0.3, length: 0.6,
      };
      this.live.push(item);
      return item;
    },
    prune() {},
    clear() { this.live = []; },
  };
}

/** Deal `count` layouts and report how many carried a crow egg. */
function dealEggs(count, score) {
  const pool = fakePool();
  const spawner = new Spawner(pool, {});
  spawner.reset(12345);
  let eggs = 0;
  for (let i = 0; i < count; i++) {
    const before = pool.live.filter((item) => item.type === "crowEgg").length;
    spawner.place(i * 200, { speed: 50, phaseId: 4, score });
    if (pool.live.filter((item) => item.type === "crowEgg").length > before) eggs += 1;
  }
  return eggs;
}

describe("the crow past a hundred thousand", () => {
  it("is dealt several times more often", () => {
    const calm = dealEggs(300, 0);
    const frenzy = dealEggs(300, HAZARD_FRENZY_SCORE);
    expect(calm).toBeGreaterThan(0);
    // The speed curve has topped out by here and the phases have run out of
    // names; the bird is what is left to escalate with.
    expect(frenzy).toBeGreaterThan(calm * 2);
  });

  it("leaves the run below the threshold alone", () => {
    expect(dealEggs(300, HAZARD_FRENZY_SCORE - 1)).toBe(dealEggs(300, 0));
  });

  it("never deals the frenzy to the title screen's preview", () => {
    // Game passes 0 off a run, so the menu behind the title card cannot be
    // running the hard cadence at nobody.
    expect(dealEggs(120, undefined)).toBe(dealEggs(120, 0));
  });
});

describe("the magnet and the crow egg", () => {
  const setup = () => {
    const pool = fakePool();
    const run = new Run(store());
    const particles = { burst: () => {} };
    return { pool, run, interactions: new Interactions(pool, run, particles) };
  };

  const player = (over = {}) => ({
    x: 0, y: 0, z: 0, height: 1.7,
    prevX: 0, prevY: 0, prevZ: -0.5, prevHeight: 1.7,
    ...over,
  });

  it("drags an egg in, the way it drags a coin", () => {
    // The magnet used to be the one pickup with no downside at all, and the
    // crow the one thing that punished not looking where you were going. The
    // two never met.
    const { pool, run, interactions } = setup();
    run.powerups.magnet = 10;
    const egg = pool.spawn("crowEgg", 1, 3, 0.75);
    const startX = egg.mesh.position.x;

    interactions.pullCoins(player(), 0.05, 50);
    expect(Math.abs(egg.mesh.position.x)).toBeLessThan(Math.abs(startX));
  });

  it("absorbs one that has been dragged alongside", () => {
    const { pool, run, interactions } = setup();
    run.powerups.magnet = 10;
    const egg = pool.spawn("crowEgg", 0, 0, 0.95);
    egg.mesh.position.y = 0.95;

    const events = interactions.collectPickups(player(), { upgradeLevel: () => 1 });
    expect(events).toEqual([{ type: "hazard", id: "crow", blocked: false, reason: undefined }]);
    expect(run.crowActive()).toBe(true);
  });

  it("leaves the egg where it is when the magnet is off", () => {
    const { pool, interactions } = setup();
    const egg = pool.spawn("crowEgg", 1, 3, 0.75);
    const startX = egg.mesh.position.x;
    interactions.pullCoins(player(), 0.05, 50);
    expect(egg.mesh.position.x).toBe(startX);
  });

  it("still leaves the power-ups alone", () => {
    // Hoovering the other three power-ups is a much bigger change than this
    // one and is not the one that was asked for.
    const { pool, run, interactions } = setup();
    run.powerups.magnet = 10;
    const jetpack = pool.spawn("jetpack", 1, 3, 1.15);
    jetpack.powerup = "jetpack";
    const startX = jetpack.mesh.position.x;
    interactions.pullCoins(player(), 0.05, 50);
    expect(jetpack.mesh.position.x).toBe(startX);
  });

  it("cannot reach beyond the magnet's own range", () => {
    const { pool, run, interactions } = setup();
    run.powerups.magnet = 10;
    const egg = pool.spawn("crowEgg", 1, MAGNET_RANGE + 20, 0.75);
    const startX = egg.mesh.position.x;
    interactions.pullCoins(player(), 0.05, 50);
    expect(egg.mesh.position.x).toBe(startX);
  });
});

describe("the diamond on the track", () => {
  it("is dealt, and is collected toward a spin", () => {
    const pool = fakePool();
    const spawner = new Spawner(pool, {});
    spawner.reset(999);
    for (let i = 0; i < 120; i++) spawner.place(i * 200, { speed: 50, phaseId: 4, score: 0 });
    expect(pool.live.filter((item) => item.type === "diamond").length).toBeGreaterThan(0);
  });

  it("reports how many are held and whether the wheel is owed", () => {
    const pool = fakePool();
    const run = new Run(store());
    const interactions = new Interactions(pool, run, { burst: () => {} });
    const at = () => ({ x: 0, y: 0, z: 0, height: 1.7, prevX: 0, prevY: 0, prevZ: -0.5, prevHeight: 1.7 });

    for (const held of [1, 2, 3]) {
      const stone = pool.spawn("diamond", 0, 0, 0.95);
      stone.mesh.position.y = 0.95;
      const events = interactions.collectPickups(at(), { upgradeLevel: () => 1 });
      expect(events).toEqual([{ type: "token", id: "diamond", held, ready: held >= 3 }]);
      pool.live = [];
    }
  });
});

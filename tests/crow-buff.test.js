import { describe, expect, it } from "vitest";
import { EntityPool } from "../src/entities.js";
import { Interactions } from "../src/interactions.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";
import { Spawner } from "../src/spawner.js";
import { HAZARD_FROM_SCORE } from "../src/spawner.js";
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

/** Layouts dealt and eggs among them, for one seed at one score. */
function layoutSpacing(score) {
  const pool = fakePool();
  const spawner = new Spawner(pool, {});
  spawner.reset(31337);
  let patterns = 0;
  for (let i = 0; i < 300; i++) {
    spawner.place(i * 200, { speed: 50, phaseId: 4, score });
    patterns += 1;
  }
  return { patterns, eggs: pool.live.filter((item) => item.type === "crowEgg").length };
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

describe("when the crow is dealt at all", () => {
  it("stays off the track entirely below the threshold", () => {
    // The beginner's whole run. A player still learning which lane to be in was
    // meeting a trap that takes their sight away — and since the magnet drags
    // the egg in, the power-up beginners like best was the one delivering it.
    expect(dealEggs(400, 0)).toBe(0);
    expect(dealEggs(400, HAZARD_FROM_SCORE - 1)).toBe(0);
  });

  it("arrives once the run is past it", () => {
    expect(dealEggs(400, HAZARD_FROM_SCORE)).toBeGreaterThan(0);
  });

  it("is dealt at a rate that leaves the track readable", () => {
    // The number this replaces was one egg every five layouts, which is one
    // every six seconds against a crow that lasts four and a half: 77% of a
    // five-minute run spent unable to see. That is not pressure, it is the
    // lights going out.
    const layouts = 400;
    const eggs = dealEggs(layouts, HAZARD_FROM_SCORE);
    const every = layouts / eggs;
    expect(every).toBeGreaterThan(7);
    expect(every).toBeLessThan(12);
  });

  it("never deals one to the title screen's preview", () => {
    // Game passes 0 off a run, so the menu behind the title card cannot be
    // running the hard cadence at nobody.
    expect(dealEggs(200, undefined)).toBe(0);
  });

  it("keeps the slot below the threshold and fills it with the rest", () => {
    // The egg pattern is a coin line with a trap in it and a free lane beside
    // it — one of the few genuine rests in the table. Skipping the slot handed
    // those layouts back to the ordinary draw and tightened the opening minutes,
    // which is the opposite of the point.
    const beginner = layoutSpacing(0);
    const expert = layoutSpacing(HAZARD_FROM_SCORE);
    // The rhythm is the same either side; only what lands in the slot changes.
    expect(beginner.patterns).toBe(expert.patterns);
    expect(beginner.eggs).toBe(0);
    expect(expert.eggs).toBeGreaterThan(0);
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

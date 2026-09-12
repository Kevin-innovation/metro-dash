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

  it("is dealt often enough to be a question and not an event", () => {
    // One egg in three layouts. Deliberately far more bird than the one in nine
    // this replaces, and worth saying why it is not the one-in-five that was
    // measured at 77% of a run spent blind.
    //
    // That measurement was of a *crow*, not of an egg. The egg is a coin line
    // with something in it and a free lane beside it: a player who leaves the
    // line alone is never blinded at all, however many are dealt. What the
    // cadence sets is how often the game asks the question, and asking it every
    // three layouts is what makes the coin line a decision rather than scenery.
    const layouts = 400;
    const every = layouts / dealEggs(layouts, HAZARD_FROM_SCORE);
    expect(every).toBeGreaterThan(2.4);
    expect(every).toBeLessThan(4);
  });

  it("never collapses into an egg every single layout", () => {
    // The jitter exists so an egg cannot be predicted by counting layouts, and
    // it is written as 「cadence ± spread」 — so a spread that reaches the
    // cadence does not mean 「sometimes sooner」, it means the countdown lands
    // due on the very next layout and there is no cadence left. At the old
    // spread of three this cadence would have done exactly that.
    const layouts = 600;
    const every = layouts / dealEggs(layouts, HAZARD_FROM_SCORE);
    expect(every).toBeGreaterThan(2);
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

describe("what the track hands out", () => {
  /** Deal `layouts` mid-run layouts and count which pickup each one carried. */
  function deal(layouts = 4000) {
    const spawner = new Spawner(fakePool());
    // 두 번째 인자는 hooks 다. 시드는 reset 으로 준다.
    spawner.reset(424242);
    const tally = { diamond: 0, focus: 0, magnet: 0, jetpack: 0, sneakers: 0 };
    for (let i = 0; i < layouts; i++) {
      const items = spawner.choose(i * 30, { speed: 40, phaseId: 4, pressure: 0.6, score: 0 });
      spawner.patternCount += 1;
      for (const key of Object.keys(tally)) {
        if (items.some((item) => item && item.type === key)) {
          tally[key] += 1;
          break;
        }
      }
    }
    return tally;
  }

  it("deals 질주 more often than any other power-up", () => {
    // The speed steps climb on their own every ten seconds; 질주 is the
    // player's own handle on the same dial, so it is the one they should meet
    // regularly rather than twice a run. There was a brake on the other end of
    // it for one release — it was not fun, and this is what replaced it.
    const tally = deal();
    expect(tally.focus).toBeGreaterThan(tally.magnet);
    expect(tally.focus).toBeGreaterThan(tally.sneakers);
    expect(tally.focus).toBeGreaterThan(tally.jetpack);
  });

  it("still deals the jetpack rarest, because flying is a pause", () => {
    const tally = deal();
    for (const id of ["focus", "magnet", "sneakers"]) {
      expect(tally.jetpack, id).toBeLessThan(tally[id]);
    }
  });

  it("deals a diamond often enough to spin and seldom enough to interrupt", () => {
    // Three to a spin. Under one in twelve a run ends having seen the wheel and
    // never turned it; over one in seven the wheel starts interrupting the run
    // rather than punctuating it.
    const layouts = 4000;
    const every = layouts / deal(layouts).diamond;
    expect(every).toBeGreaterThan(7.5);
    expect(every).toBeLessThan(12);
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

import { describe, expect, it } from "vitest";
import { ParticleStore } from "../src/particles.js";

const spawnDefaults = {
  x: 0,
  y: 1,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 1,
  size: 0.3,
  colour: [1, 1, 1],
};

const fill = (store, count, patch = {}) => {
  for (let i = 0; i < count; i++) {
    store.spawn(store.allocate(), { ...spawnDefaults, ...patch });
  }
};

describe("ParticleStore", () => {
  it("tracks how many are alive", () => {
    const store = new ParticleStore(16);
    expect(store.live).toBe(0);
    fill(store, 5);
    expect(store.live).toBe(5);
  });

  it("retires particles when their life runs out", () => {
    const store = new ParticleStore(16);
    fill(store, 4, { life: 0.5 });
    store.step(0.6);
    expect(store.live).toBe(0);
  });

  it("never allocates outside the pool", () => {
    const store = new ParticleStore(8);
    for (let i = 0; i < 200; i++) {
      const index = store.allocate();
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(8);
    }
  });

  it("recycles the oldest slot when the pool is full", () => {
    const store = new ParticleStore(4);
    fill(store, 4, { life: 5 });
    expect(store.live).toBe(4);
    // A fifth burst must reuse a slot rather than grow or drop silently.
    fill(store, 1, { life: 5, x: 99 });
    expect(store.live).toBe(4);
    expect(store.px[0]).toBe(99);
  });

  it("applies gravity and drag", () => {
    const store = new ParticleStore(4);
    fill(store, 1, { vy: 0, vx: 10, gravity: -10, drag: 0 });
    store.step(0.5);
    expect(store.vy[0]).toBeCloseTo(-5, 5);
    expect(store.px[0]).toBeCloseTo(5, 5);
  });

  it("slows a particle down when drag is applied", () => {
    const store = new ParticleStore(4);
    fill(store, 1, { vx: 10, gravity: 0, drag: 4 });
    store.step(0.25);
    expect(store.vx[0]).toBeLessThan(10);
    expect(store.vx[0]).toBeGreaterThan(0);
  });

  it("leaves dead particles untouched by later steps", () => {
    const store = new ParticleStore(4);
    fill(store, 1, { life: 0.1, vx: 10, drag: 0, gravity: 0 });
    store.step(0.2);
    const restingX = store.px[0];
    store.step(1);
    expect(store.px[0]).toBe(restingX);
  });

  it("clears everything at once", () => {
    const store = new ParticleStore(8);
    fill(store, 8, { life: 10 });
    store.clear();
    expect(store.live).toBe(0);
    expect(store.cursor).toBe(0);
    store.step(0.1);
    expect(store.live).toBe(0);
  });

  it("survives a zero-length step", () => {
    const store = new ParticleStore(4);
    fill(store, 2, { life: 1 });
    store.step(0);
    expect(store.live).toBe(2);
  });
});

describe("ParticleStore budget", () => {
  it("only ever hands out slots inside the budget", () => {
    const store = new ParticleStore(64);
    store.setBudget(10);
    for (let i = 0; i < 500; i++) {
      expect(store.allocate()).toBeLessThan(10);
    }
  });

  it("still fills every slot it has when the budget is small", () => {
    // Regression: allocations used to wrap at capacity, so most indices fell
    // outside a reduced budget and the burst silently shrank to a few sparks.
    const store = new ParticleStore(260);
    store.setBudget(20);
    fill(store, 20, { life: 5 });
    store.step(0.01);
    expect(store.live).toBe(20);
  });

  it("retires particles that fall outside a shrunken budget", () => {
    const store = new ParticleStore(64);
    fill(store, 64, { life: 5 });
    store.setBudget(8);
    store.step(0.01);
    expect(store.live).toBe(8);
  });

  it("clamps a nonsense budget into range", () => {
    const store = new ParticleStore(32);
    store.setBudget(0);
    expect(store.budget).toBeGreaterThanOrEqual(8);
    store.setBudget(9999);
    expect(store.budget).toBe(32);
  });
});

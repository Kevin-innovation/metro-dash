import { describe, expect, it } from "vitest";
import { JUMP_APEX, SNEAKER_APEX, SNEAKER_JUMP_MULT } from "../src/config.js";
import {
  DOUBLE_SCORE_MULTIPLIER,
  POWERUP_IDS,
  POWERUP_MAX_LEVEL,
  POWERUPS,
  activatePowerup,
  activeIds,
  clearPowerups,
  createPowerupState,
  isActive,
  jumpMultiplier,
  powerupDuration,
  powerupScoreMultiplier,
  tickPowerups,
} from "../src/powerups.js";
import { SPEC } from "../src/specs.js";

describe("powerupDuration", () => {
  it.each(POWERUP_IDS)("%s gets longer with every shop level", (id) => {
    let previous = 0;
    for (let level = 1; level <= POWERUP_MAX_LEVEL; level++) {
      const duration = powerupDuration(id, level);
      expect(duration).toBeGreaterThan(previous);
      previous = duration;
    }
  });

  it("clamps out-of-range levels instead of extrapolating", () => {
    expect(powerupDuration("magnet", 0)).toBe(powerupDuration("magnet", 1));
    expect(powerupDuration("magnet", 99)).toBe(powerupDuration("magnet", POWERUP_MAX_LEVEL));
  });

  it("returns 0 for an unknown power-up", () => {
    expect(powerupDuration("nope", 3)).toBe(0);
  });
});

describe("power-up timers", () => {
  it("starts with everything inactive", () => {
    const timers = createPowerupState();
    expect(activeIds(timers)).toEqual([]);
  });

  it("refreshes rather than stacks when re-picked", () => {
    const timers = createPowerupState();
    activatePowerup(timers, "magnet", 1);
    tickPowerups(timers, 3);
    const partway = timers.magnet;
    activatePowerup(timers, "magnet", 1);
    expect(timers.magnet).toBe(powerupDuration("magnet", 1));
    expect(timers.magnet).toBeGreaterThan(partway);
  });

  it("never shortens an active longer timer", () => {
    const timers = createPowerupState();
    activatePowerup(timers, "magnet", POWERUP_MAX_LEVEL);
    const long = timers.magnet;
    activatePowerup(timers, "magnet", 1);
    expect(timers.magnet).toBe(long);
  });

  it("reports each power-up exactly once as it expires", () => {
    const timers = createPowerupState();
    activatePowerup(timers, "double", 1);
    const duration = powerupDuration("double", 1);

    let expiries = 0;
    for (let t = 0; t < duration + 2; t += 0.5) {
      expiries += tickPowerups(timers, 0.5).filter((id) => id === "double").length;
    }
    expect(expiries).toBe(1);
    expect(isActive(timers, "double")).toBe(false);
  });

  it("never goes negative", () => {
    const timers = createPowerupState();
    activatePowerup(timers, "sneakers", 1);
    tickPowerups(timers, 999);
    expect(timers.sneakers).toBe(0);
  });

  it("clears everything on death", () => {
    const timers = createPowerupState();
    POWERUP_IDS.forEach((id) => activatePowerup(timers, id, 3));
    clearPowerups(timers);
    expect(activeIds(timers)).toEqual([]);
  });
});

describe("power-up effects", () => {
  it("sneakers raise the jump only while active", () => {
    const timers = createPowerupState();
    expect(jumpMultiplier(timers)).toBe(1);
    activatePowerup(timers, "sneakers", 1);
    expect(jumpMultiplier(timers)).toBe(SNEAKER_JUMP_MULT);
  });

  it("the boosted apex still sits inside the gate band", () => {
    // If this ever inverts, super sneakers would let a player jump a
    // slide-only gate and the obstacle loses its meaning.
    expect(SNEAKER_APEX).toBeGreaterThan(JUMP_APEX);
    expect(SNEAKER_APEX).toBeLessThan(SPEC.sign.maxY);
  });

  it("double score applies only while active", () => {
    const timers = createPowerupState();
    expect(powerupScoreMultiplier(timers)).toBe(1);
    activatePowerup(timers, "double", 1);
    expect(powerupScoreMultiplier(timers)).toBe(DOUBLE_SCORE_MULTIPLIER);
  });

  it("every power-up has a matching world pickup", () => {
    for (const id of POWERUP_IDS) {
      expect(SPEC[id]).toBeDefined();
      expect(SPEC[id].powerup).toBe(id);
      expect(SPEC[id].lethal).toBe(false);
      expect(POWERUPS[id].name).toBeTruthy();
    }
  });
});

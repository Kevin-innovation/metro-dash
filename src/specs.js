import {
  BUS_ROOF,
  JETPACK_ALTITUDE,
  PLAYER_HEIGHT,
  SIGN_BAND_TOP,
  SIGN_BOARD_BOTTOM,
  TRAIN_ROOF,
} from "./config.js";

/**
 * Physical description of every spawnable entity, kept free of Three.js so the
 * pattern table and the test suite can reason about layouts without a renderer.
 *
 * `length` is the visual footprint (used for roof landings); `depth` is the
 * half-depth of the Z window used by the swept collision test.
 *
 * The sign band tops out above every reachable jump apex on purpose — a gate is
 * a slide-only obstacle, and super sneakers must not turn it into a jump.
 */
export const SPEC = {
  train: {
    length: 12,
    depth: 5.28,
    minY: 0,
    maxY: 2.4,
    lethal: true,
    rideable: true,
    roofY: TRAIN_ROOF,
  },
  bus: {
    length: 9.2,
    depth: 4.05,
    minY: 0,
    maxY: 2.15,
    lethal: true,
    rideable: true,
    roofY: BUS_ROOF,
  },
  barrier: { length: 0.5, depth: 0.28, minY: 0, maxY: 0.92, lethal: true, clear: "jump" },
  sign: {
    length: 0.42,
    depth: 0.24,
    minY: SIGN_BOARD_BOTTOM,
    maxY: SIGN_BAND_TOP,
    lethal: true,
    clear: "slide",
  },
  crate: { length: 1.4, depth: 0.77, minY: 0, maxY: 1.2, lethal: true, clear: "jump" },
  // The band is the coarse filter — how high a runner can be and still be
  // considered for this pickup — and the reach check in interactions.js is the
  // precise one. It has to clear the jetpack's cruising altitude, or a coin
  // placed up there is never even looked at, which is exactly what happened to
  // the sky trail: thirty-eight coins in the air and none of them collectable.
  coin: { length: 0.5, depth: 0.25, minY: 0, maxY: JETPACK_ALTITUDE + PLAYER_HEIGHT + 1, lethal: false },
  magnet: { length: 0.6, depth: 0.3, minY: 0, maxY: 3.2, lethal: false, powerup: "magnet" },
  jetpack: { length: 0.7, depth: 0.32, minY: 0, maxY: 3.2, lethal: false, powerup: "jetpack" },
  double: { length: 0.6, depth: 0.3, minY: 0, maxY: 3.2, lethal: false, powerup: "double" },
  sneakers: { length: 0.6, depth: 0.3, minY: 0, maxY: 3.2, lethal: false, powerup: "sneakers" },
};

export const ENTITY_TYPES = Object.keys(SPEC);

export const POWERUP_PICKUPS = ENTITY_TYPES.filter((type) => SPEC[type].powerup);

export function isRideable(type) {
  return !!SPEC[type]?.rideable;
}

export function isLethal(type) {
  return !!SPEC[type]?.lethal;
}

import { JETPACK_ALTITUDE, MAGNET_TIME, SNEAKER_JUMP_MULT } from "./config.js";

/**
 * Timed power-ups. Duration scales with the level bought in the shop, so the
 * same pickup gets meaningfully stronger as a player invests coins.
 */
export const POWERUPS = {
  magnet: {
    id: "magnet",
    name: "자석",
    icon: "🧲",
    colour: "#b388ff",
    base: MAGNET_TIME,
    perLevel: 2,
    latePerLevel: 1,
    blurb: "주변 코인을 끌어당깁니다",
  },
  jetpack: {
    id: "jetpack",
    name: "제트팩",
    icon: "🚀",
    colour: "#ff7a3c",
    base: 6,
    perLevel: 1.5,
    // The smallest late step of the four, on purpose. Flying is not a bonus on
    // top of running, it is a pause from it: nothing on the ground can touch
    // you. Every other power-up makes a run better and this one makes a stretch
    // of it free, so it is the one whose length must not keep climbing.
    latePerLevel: 0.5,
    blurb: `고도 ${JETPACK_ALTITUDE}m로 날아 장애물을 넘습니다`,
  },
  double: {
    id: "double",
    name: "점수 2배",
    icon: "✦",
    colour: "#ffd24a",
    base: 10,
    perLevel: 2.5,
    latePerLevel: 1.25,
    blurb: "획득 점수가 두 배가 됩니다",
  },
  sneakers: {
    id: "sneakers",
    name: "슈퍼 스니커즈",
    icon: "👟",
    colour: "#14d4b8",
    base: 10,
    perLevel: 2.5,
    latePerLevel: 1.25,
    blurb: "점프가 높아집니다 (게이트는 못 넘습니다)",
  },
};

export const POWERUP_IDS = Object.keys(POWERUPS);

/**
 * Which per-power-up counter in Run.metrics each id feeds.
 *
 * The names differ because the metrics are plural tallies and the ids are
 * singular things. Written down once here rather than inline where it is
 * needed: it was a literal inside Run.addPowerup, and the moment the game-over
 * card wanted to read the same four numbers there were two copies of the same
 * mapping in two files with nothing keeping them honest.
 */
export const POWERUP_METRIC = {
  magnet: "magnets",
  jetpack: "jetpacks",
  double: "doubles",
  sneakers: "sneakers",
};

/**
 * Where the upgrade track ends, and where it changes gear.
 *
 * It used to end at five, which cost 33,200 coins for all four — a fortnight of
 * play, against a character list that costs 279,500. Everyone who got through
 * it spent the rest of the game with nothing to buy but skins.
 *
 * The three levels above five are deliberately a different shape. The first
 * five double every duration; carrying that rate to eight would put the magnet
 * on for twenty-six seconds and the jetpack for nineteen, and a run spent
 * mostly inside a power-up is a run the player is watching rather than playing.
 * Above five each step is worth about half of one below it and costs several
 * times as much: a long tail for coins to go into, priced as the luxury it is.
 */
export const POWERUP_BASE_LEVELS = 5;
export const POWERUP_MAX_LEVEL = 8;
export const DOUBLE_SCORE_MULTIPLIER = 2;

/** Seconds a pickup lasts at the given shop level (1-based). */
export function powerupDuration(id, level = 1) {
  const spec = POWERUPS[id];
  if (!spec) return 0;
  const clamped = Math.min(POWERUP_MAX_LEVEL, Math.max(1, Math.floor(level)));
  const base = Math.min(clamped, POWERUP_BASE_LEVELS);
  const late = Math.max(0, clamped - POWERUP_BASE_LEVELS);
  return spec.base + (base - 1) * spec.perLevel + late * (spec.latePerLevel ?? spec.perLevel);
}

/**
 * Live power-up timers for one run. Plain numbers keyed by power-up id, so the
 * whole thing serialises and unit tests trivially.
 */
export function createPowerupState() {
  const timers = {};
  for (const id of POWERUP_IDS) timers[id] = 0;
  return timers;
}

export function activatePowerup(timers, id, level = 1) {
  if (!(id in timers)) return timers;
  // Re-picking a power-up refreshes rather than stacks, so the HUD bar always
  // means the same thing.
  timers[id] = Math.max(timers[id], powerupDuration(id, level));
  return timers;
}

export function tickPowerups(timers, dt) {
  const expired = [];
  for (const id of POWERUP_IDS) {
    if (timers[id] <= 0) continue;
    timers[id] = Math.max(0, timers[id] - dt);
    if (timers[id] === 0) expired.push(id);
  }
  return expired;
}

export function isActive(timers, id) {
  return (timers[id] ?? 0) > 0;
}

export function activeIds(timers) {
  return POWERUP_IDS.filter((id) => timers[id] > 0);
}

export function clearPowerups(timers) {
  for (const id of POWERUP_IDS) timers[id] = 0;
  return timers;
}

/** Jump velocity multiplier currently in effect. */
export function jumpMultiplier(timers) {
  return isActive(timers, "sneakers") ? SNEAKER_JUMP_MULT : 1;
}

/** Score multiplier contributed by power-ups alone. */
export function powerupScoreMultiplier(timers) {
  return isActive(timers, "double") ? DOUBLE_SCORE_MULTIPLIER : 1;
}

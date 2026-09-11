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
  sneakers: {
    id: "sneakers",
    name: "슈퍼 스니커즈",
    icon: "👟",
    colour: "#14d4b8",
    base: 14,
    perLevel: 2.5,
    latePerLevel: 1.25,
    blurb: "점프가 높아집니다 (게이트는 못 넘습니다)",
  },
  /**
   * Replaces 여유, which replaced 점수 2배. Slowing the track fought the
   * thing the game is. This one leans into it: a short rush. Distance score
   * rises because more metres go by, not because a multiplier stacked.
   * The save id stays `focus` so shop levels do not reset.
   */
  focus: {
    id: "focus",
    name: "질주",
    icon: "⚡",
    colour: "#fbbf24",
    base: 8,
    perLevel: 1.5,
    latePerLevel: 0.75,
    blurb: "트랙이 빨라집니다. 점수 배수는 없고, 같은 시간에 더 멀리 갑니다",
  },
  /**
   * The other end of the same dial.
   *
   * 여유 was removed for slowing the track down, and that was right at the
   * time: the run climbed so gently that nobody was ever going faster than
   * they wanted to, so a brake was a pickup that took score away and gave
   * nothing back. The speed steps changed that. A step lands every ten
   * seconds whether the player is ready for it or not, and past the middle of
   * a run there is a real difference between the speed the track is at and the
   * speed the player can read it at.
   *
   * So this is not 여유 returning. It costs score — fewer metres go by, and
   * metres are most of the score — and buys the one thing score cannot: a
   * stretch where the next wall arrives late enough to be answered. Taking it
   * at 20만 is throwing points away. Taking it at 50만 is how you see 60만.
   */
  brake: {
    id: "brake",
    name: "감속",
    icon: "🛑",
    colour: "#38bdf8",
    base: 5,
    perLevel: 1.1,
    latePerLevel: 0.55,
    blurb: "트랙이 느려집니다. 점수는 덜 쌓이고, 대신 읽을 시간이 생깁니다",
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
  sneakers: "sneakers",
  focus: "focuses",
  brake: "brakes",
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
/**
 * Kept at 1 so anything still multiplying by it does not silently re-inflate
 * the board. The 점수 2배 pickup is gone.
 */
export const DOUBLE_SCORE_MULTIPLIER = 1;
/**
 * How much faster 질주 makes the curve. Not a score multiplier — metres
 * tick up quicker, and that is the whole of the bonus.
 */
export const SPRINT_SPEED = 1.25;

/**
 * And how much slower 감속 makes it.
 *
 * Shallower than the sprint is tall, deliberately. A brake that cut the track
 * by a quarter would undo two and a half speed steps at once — five-sixths of
 * a minute of the run handed back for one pickup — and the way to survive the
 * end of a run would be to hold one rather than to read the track.
 */
export const BRAKE_SPEED = 0.82;

/**
 * What the two speed pickups do to the curve, together.
 *
 * Multiplied rather than resolved by priority: holding both is a thing that
 * can happen, and 1.25 × 0.82 lands just above normal, which is what a player
 * carrying a sprint and a brake at once should feel.
 *
 * @param {object} timers live power-up state
 */
export function runSpeedFactor(timers) {
  return (isActive(timers, "focus") ? SPRINT_SPEED : 1) * (isActive(timers, "brake") ? BRAKE_SPEED : 1);
}

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

/** Score multiplier contributed by power-ups alone. Always 1: none of them score. */
export function powerupScoreMultiplier(_timers) {
  return 1;
}

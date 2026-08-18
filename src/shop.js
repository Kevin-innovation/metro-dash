import { CHARACTERS, characterById } from "./characters.js";
import { POWERUPS, POWERUP_IDS, POWERUP_MAX_LEVEL, powerupDuration } from "./powerups.js";

export { CHARACTERS, characterById };

/** Cost to reach level N (index 0 is unused — everyone starts at level 1). */
export const UPGRADE_COSTS = [0, 0, 500, 1200, 2400, 4200];

export const HOVERBOARD_COST = 350;
export const HOVERBOARD_MAX = 9;

export function upgradeCost(level) {
  const next = level + 1;
  if (next > POWERUP_MAX_LEVEL) return null;
  return UPGRADE_COSTS[next] ?? null;
}

/**
 * Everything the shop screen needs to render, derived from the save profile.
 * Returning plain data keeps the DOM layer dumb and the pricing testable.
 */
export function shopView(save) {
  const upgrades = POWERUP_IDS.map((id) => {
    const level = save.upgrades[id] ?? 1;
    const cost = upgradeCost(level);
    return {
      id,
      name: POWERUPS[id].name,
      icon: POWERUPS[id].icon,
      colour: POWERUPS[id].colour,
      blurb: POWERUPS[id].blurb,
      level,
      maxLevel: POWERUP_MAX_LEVEL,
      maxed: cost === null,
      cost,
      affordable: cost !== null && save.coins >= cost,
      duration: powerupDuration(id, level),
      nextDuration: cost === null ? null : powerupDuration(id, level + 1),
    };
  });

  const characters = CHARACTERS.map((character) => {
    const owned = save.characters.includes(character.id);
    return {
      ...character,
      owned,
      equipped: save.character === character.id,
      affordable: owned || save.coins >= character.cost,
    };
  });

  return {
    coins: save.coins,
    upgrades,
    characters,
    hoverboards: {
      owned: save.hoverboards,
      max: HOVERBOARD_MAX,
      cost: HOVERBOARD_COST,
      affordable: save.coins >= HOVERBOARD_COST && save.hoverboards < HOVERBOARD_MAX,
    },
  };
}

/**
 * Apply a purchase to a SaveStore.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function purchase(store, kind, id) {
  const save = store.data;

  if (kind === "upgrade") {
    const level = save.upgrades[id];
    if (level === undefined) return { ok: false, reason: "unknown" };
    const cost = upgradeCost(level);
    if (cost === null) return { ok: false, reason: "maxed" };
    if (!store.spendCoins(cost)) return { ok: false, reason: "poor" };
    save.upgrades[id] = level + 1;
    store.flush();
    return { ok: true };
  }

  if (kind === "hoverboard") {
    if (save.hoverboards >= HOVERBOARD_MAX) return { ok: false, reason: "maxed" };
    if (!store.spendCoins(HOVERBOARD_COST)) return { ok: false, reason: "poor" };
    save.hoverboards += 1;
    store.flush();
    return { ok: true };
  }

  if (kind === "character") {
    const character = CHARACTERS.find((c) => c.id === id);
    if (!character) return { ok: false, reason: "unknown" };
    if (store.ownsCharacter(character.id)) {
      store.equipCharacter(character.id);
      return { ok: true };
    }
    if (!store.spendCoins(character.cost)) return { ok: false, reason: "poor" };
    store.unlockCharacter(character.id);
    store.equipCharacter(character.id);
    return { ok: true };
  }

  return { ok: false, reason: "unknown" };
}

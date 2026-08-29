import { CHARACTERS, characterById } from "./characters.js";
import { POWERUPS, POWERUP_IDS, POWERUP_MAX_LEVEL, powerupDuration } from "./powerups.js";

export { CHARACTERS, characterById };

/** Cost to reach level N (index 0 is unused — everyone starts at level 1). */
export const UPGRADE_COSTS = [0, 0, 500, 1200, 2400, 4200];

/**
 * A hoverboard eats the crash that would have ended the run, once per run.
 *
 * At 350 it was the cheapest thing in the shop and strictly the most valuable —
 * a few coin lines paid for it, so there was never a reason not to be holding
 * one, and "do I spend on insurance or on a character" was not a decision
 * anybody had to make. Priced at what an extra life is actually worth.
 */
export const HOVERBOARD_COST = 3000;

/**
 * The crow antidote. Blocks one crow egg and is spent doing it.
 *
 * More than a hoverboard because it answers a worse problem: a crash is over
 * in an instant and a crow is four and a half seconds of not being able to see
 * what is coming, which is where the crash after it comes from.
 */
export const ANTIDOTE_COST = 5000;

/**
 * One at a time, same as the hoverboard and for the same reason: only one can
 * be used per run, so holding nine would be buying nine runs of insurance in
 * advance and would make the shop a place where the answer is "save up".
 */
export const ANTIDOTE_MAX = 1;
/**
 * How many boards may be held at once.
 *
 * One, because only one can be used per run. Holding nine bought nine runs of
 * insurance in advance and made the shop look like it was selling lives; now it
 * is a decision taken before each run, which is what it always was in play.
 *
 * Existing profiles keep whatever they already bought — they simply cannot buy
 * more until they are spent. Clamping the stored number down would delete coins
 * people paid.
 */
export const HOVERBOARD_MAX = 1;

export function upgradeCost(level) {
  const next = level + 1;
  if (next > POWERUP_MAX_LEVEL) return null;
  return UPGRADE_COSTS[next] ?? null;
}

/**
 * The coins a profile represents: what it is holding plus what it has spent.
 *
 * The server uses this to bound a save against what the account could actually
 * have earned. Deliberately an *under*-estimate — hoverboards get used up, so
 * the ones still owned are fewer than the ones bought — because the number is
 * used to refuse saves, and a refusal aimed at an honest player is far worse
 * than a cheat that squeaks through.
 */
export function profileWorth(save) {
  let spent = 0;
  for (const id of POWERUP_IDS) {
    const level = Math.max(1, Math.floor(save?.upgrades?.[id] ?? 1));
    for (let step = 2; step <= Math.min(level, POWERUP_MAX_LEVEL); step++) {
      spent += UPGRADE_COSTS[step] ?? 0;
    }
  }
  for (const id of save?.characters ?? []) {
    spent += CHARACTERS.find((character) => character.id === id)?.cost ?? 0;
  }
  // Consumables are left out entirely, on purpose.
  //
  // They are spent and gone, so counting the ones still held always understated
  // the total anyway — but the real reason is that this number is compared
  // against a ledger recorded when the account was created, and repricing an
  // item revalues everything already bought at the new price. The hoverboard
  // went from 350 to 3,000: counted here, every profile holding a board bought
  // last week would have appeared to have spent 2,650 coins it never earned,
  // and the save would have been refused and the account flagged. Nobody who
  // did that would have done anything wrong.
  return Math.max(0, Math.floor(save?.coins ?? 0)) + spent;
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
    antidotes: {
      owned: save.antidotes ?? 0,
      max: ANTIDOTE_MAX,
      cost: ANTIDOTE_COST,
      affordable: save.coins >= ANTIDOTE_COST && (save.antidotes ?? 0) < ANTIDOTE_MAX,
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

  if (kind === "antidote") {
    if ((save.antidotes ?? 0) >= ANTIDOTE_MAX) return { ok: false, reason: "maxed" };
    if (!store.spendCoins(ANTIDOTE_COST)) return { ok: false, reason: "poor" };
    save.antidotes = (save.antidotes ?? 0) + 1;
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

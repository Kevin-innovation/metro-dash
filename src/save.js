import { DEFAULT_CHARACTER, isKnownCharacter } from "./characters.js";
import { BEST_KEY, SAVE_KEY } from "./config.js";
import { POWERUP_IDS, POWERUP_MAX_LEVEL } from "./powerups.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.js";

export const SAVE_VERSION = 1;
export { DEFAULT_CHARACTER };

/**
 * The whole persisted profile. Kept as one JSON blob under a single key so a
 * schema bump can migrate everything at once.
 */
export function defaultSave() {
  const upgrades = {};
  for (const id of POWERUP_IDS) upgrades[id] = 1;
  return {
    version: SAVE_VERSION,
    best: 0,
    coins: 0,
    runs: 0,
    totalDistance: 0,
    totalCoins: 0,
    xp: 0,
    hoverboards: 0,
    character: DEFAULT_CHARACTER,
    characters: [DEFAULT_CHARACTER],
    upgrades,
    missions: [],
    missionsDone: 0,
    /**
     * The balance the server last confirmed.
     *
     * The difference between this and `coins` is what has been earned or spent
     * since, and that difference is all the browser ever reports — the server
     * owns the total. Without it two devices would overwrite each other and a
     * balance corrected by staff would be undone by the next run.
     */
    syncedCoins: 0,
    /** Consecutive days played, and the day the last run started. */
    streak: 0,
    lastDay: 0,
    /** Best streak ever reached, kept because losing one should still count. */
    bestStreak: 0,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Coerce anything loaded from disk into a valid profile. A corrupted or
 * hand-edited save must never be able to crash the game or grant impossible
 * upgrade levels.
 */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;

  const out = {
    ...base,
    version: SAVE_VERSION,
    best: clampInt(raw.best),
    coins: clampInt(raw.coins),
    runs: clampInt(raw.runs),
    totalDistance: clampInt(raw.totalDistance),
    totalCoins: clampInt(raw.totalCoins),
    xp: clampInt(raw.xp),
    hoverboards: clampInt(raw.hoverboards, 0, 99),
    missionsDone: clampInt(raw.missionsDone),
    streak: clampInt(raw.streak),
    lastDay: clampInt(raw.lastDay),
    bestStreak: clampInt(raw.bestStreak),
  };

  // A save written before the balance moved to the server has no marker, and
  // defaulting it to zero would read the player's entire balance as freshly
  // earned — the first sync would add it on top of what the server already
  // holds and double it. Absent means "already accounted for".
  out.syncedCoins = raw.syncedCoins === undefined ? out.coins : clampInt(raw.syncedCoins);

  out.settings = normalizeSettings(raw.settings);
  out.upgrades = { ...base.upgrades };
  if (raw.upgrades && typeof raw.upgrades === "object") {
    for (const id of POWERUP_IDS) {
      out.upgrades[id] = clampInt(raw.upgrades[id] ?? 1, 1, POWERUP_MAX_LEVEL);
    }
  }

  // Only characters that actually exist may be owned, and only an owned
  // character may be equipped — otherwise a hand-edited save could pin the
  // runner to a skin with no palette behind it.
  const owned = Array.isArray(raw.characters) ? raw.characters.filter(isKnownCharacter) : [];
  out.characters = Array.from(new Set([DEFAULT_CHARACTER, ...owned]));
  out.character = out.characters.includes(raw.character) ? raw.character : DEFAULT_CHARACTER;

  out.missions = Array.isArray(raw.missions)
    ? raw.missions
        .filter((m) => m && typeof m.id === "string")
        .map((m) => ({
          id: m.id,
          target: clampInt(m.target, 1),
          progress: clampInt(m.progress),
        }))
    : [];

  return out;
}

/**
 * Profile store backed by localStorage, with the storage injected so tests can
 * run against an in-memory stub.
 */
export class SaveStore {
  constructor(storage = safeLocalStorage()) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    let parsed = null;
    try {
      const text = this.storage?.getItem(SAVE_KEY);
      if (text) parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const save = normalizeSave(parsed);
    if (!parsed) save.best = Math.max(save.best, this.readLegacyBest());
    return save;
  }

  /** Pull the high score written by the pre-profile version of the game. */
  readLegacyBest() {
    try {
      const n = Number(this.storage?.getItem(BEST_KEY) ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  flush() {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota exceeded or private mode — the run still plays fine */
    }
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    return this.flush();
  }

  addCoins(amount) {
    this.data.coins = Math.max(0, this.data.coins + Math.floor(amount));
    return this.flush();
  }

  /** @returns {boolean} whether the player could afford it. */
  spendCoins(amount) {
    const cost = Math.floor(amount);
    if (cost <= 0) return true;
    if (this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.flush();
    return true;
  }

  addXp(amount) {
    this.data.xp = Math.max(0, this.data.xp + Math.floor(amount));
    return this.flush();
  }

  recordBest(score) {
    const next = Math.floor(Number(score) || 0);
    if (next > this.data.best) {
      this.data.best = next;
      this.flush();
    }
    return this.data.best;
  }

  recordRun({ distance = 0, coins = 0, score = 0 } = {}) {
    this.data.runs += 1;
    this.data.totalDistance += Math.floor(distance);
    this.data.totalCoins += Math.floor(coins);
    this.recordBest(score);
    return this.flush();
  }

  upgradeLevel(id) {
    return this.data.upgrades[id] ?? 1;
  }

  ownsCharacter(id) {
    return this.data.characters.includes(id);
  }

  unlockCharacter(id) {
    if (!isKnownCharacter(id)) return this.data;
    if (!this.ownsCharacter(id)) this.data.characters.push(id);
    return this.flush();
  }

  /**
   * Equip an owned character. Refuses anything unowned, so the in-memory
   * profile can never disagree with what a reload would produce.
   *
   * @returns {boolean} whether the character was equipped.
   */
  equipCharacter(id) {
    if (!this.ownsCharacter(id)) return false;
    this.data.character = id;
    this.flush();
    return true;
  }

  reset() {
    this.data = defaultSave();
    return this.flush();
  }
}

function safeLocalStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Does this profile represent play worth not throwing away?
 *
 * Used when a guest signs in: a fresh profile can be replaced silently, but one
 * with real progress behind it must not disappear without the player choosing.
 */
export function hasProgress(save) {
  if (!save) return false;
  return (
    (save.best ?? 0) > 0 ||
    (save.coins ?? 0) > 0 ||
    (save.runs ?? 0) > 0 ||
    (save.xp ?? 0) > 0 ||
    (save.hoverboards ?? 0) > 0 ||
    (save.characters?.length ?? 0) > 1
  );
}

/** One-line summary of a profile, so a player can tell two of them apart. */
export function describeSave(save) {
  const normalized = normalizeSave(save);
  return {
    best: normalized.best,
    coins: normalized.coins,
    runs: normalized.runs,
    xp: normalized.xp,
  };
}

/** In-memory storage with the localStorage surface, for tests. */
export function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

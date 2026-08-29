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
    /**
     * Crow antidotes held. Blocks one crow egg and is spent doing it, so like
     * the hoverboard this is a thing you buy for the run you are about to
     * play rather than a stack you sit on.
     */
    antidotes: 0,
    character: DEFAULT_CHARACTER,
    characters: [DEFAULT_CHARACTER],
    upgrades,
    missions: [],
    missionsDone: 0,
    /**
     * The day the current set was dealt, and the day its all-clear bonus was
     * paid. Separate, because a set can be cleared long before midnight and the
     * bonus must not be payable twice.
     */
    missionDay: 0,
    missionBonusDay: 0,
    /**
     * The balance the server last confirmed.
     *
     * The difference between this and `coins` is what has been earned or spent
     * since, and that difference is all the browser ever reports — the server
     * owns the total. Without it two devices would overwrite each other and a
     * balance corrected by staff would be undone by the next run.
     */
    syncedCoins: 0,
    /**
     * Coins this profile has ever been credited, spending not subtracted.
     *
     * The balance and the delta built from it are both *net*, which means the
     * server cannot tell a run that paid 3,000 from one that paid 3,000 and
     * then bought a 2,500 upgrade — both report +500. It was checking permanent
     * purchases against a number that only ever saw the net, so an honest
     * player who earned 50,000 and spent 2,500 of it looked like someone who
     * had spent coins they never had.
     *
     * This is the gross figure, and it only ever goes up.
     */
    earned: 0,
    /** The gross figure the server last acknowledged. Same job as syncedCoins. */
    syncedEarned: 0,
    /** The experience the server last confirmed. Same job as syncedCoins. */
    syncedXp: 0,
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
    antidotes: clampInt(raw.antidotes, 0, 99),
    missionsDone: clampInt(raw.missionsDone),
    missionDay: clampInt(raw.missionDay),
    missionBonusDay: clampInt(raw.missionBonusDay),
    streak: clampInt(raw.streak),
    lastDay: clampInt(raw.lastDay),
    bestStreak: clampInt(raw.bestStreak),
  };

  // A save written before the balance moved to the server has no marker, and
  // defaulting it to zero would read the player's entire balance as freshly
  // earned — the first sync would add it on top of what the server already
  // holds and double it. Absent means "already accounted for".
  out.syncedCoins = raw.syncedCoins === undefined ? out.coins : clampInt(raw.syncedCoins);
  out.syncedXp = raw.syncedXp === undefined ? out.xp : clampInt(raw.syncedXp);
  // A save written before the gross figure existed has no history to recover:
  // what it spent is already spent and what it earned is not written down. It
  // opens level with its own balance and marked as already reported, so the
  // first sync after the update claims nothing. The server forgives what came
  // before separately; see the ledger re-seed in convex/players.js.
  out.earned = raw.earned === undefined ? out.coins : clampInt(raw.earned);
  out.syncedEarned = raw.syncedEarned === undefined ? out.earned : clampInt(raw.syncedEarned);

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
    const n = Math.floor(amount);
    this.data.coins = Math.max(0, this.data.coins + n);
    // Only the credits. This is the number the server checks purchases against,
    // and subtracting spending from it here would put it right back where the
    // net delta already was.
    if (n > 0) this.data.earned += n;
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

  /**
   * Consume one crow antidote.
   *
   * @returns {boolean} whether one was held and has now been spent.
   */
  spendAntidote() {
    if (!((this.data.antidotes ?? 0) > 0)) return false;
    this.data.antidotes -= 1;
    this.flush();
    return true;
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

/**
 * Most coins a guest session may carry into an account it signs into.
 *
 * The carried figure is derived from the browser's own save, which anyone can
 * edit, so it needs a ceiling — but the ceiling is a wall against a hand-edited
 * number, not a budget: a good run pays a few hundred, so a session that
 * genuinely earned this much was a long one. Matched to the server's own
 * per-sync limit so the two cannot disagree about what is plausible.
 */
export const MAX_GUEST_CARRY = 5000;

/**
 * Combine a guest save with the account it is signing into.
 *
 * This used to be a question put to the player — two cards, pick one, and in
 * small print, "고르지 않은 쪽은 사라집니다". It was asked whenever both sides
 * had anything at all on them, which on a shared school PC is every single
 * sign-in: play one guest run before logging in and the account you then log
 * into is offered up for deletion. Students picked 「이 기기 기록」, because the
 * run they had just played was obviously theirs, and their account balance was
 * overwritten with whatever that one guest run had earned. That is the whole of
 * "코인을 쓰지도 않았는데 사라졌어요".
 *
 * Nothing about it needed to be a choice. Every field here has an answer that
 * loses nothing:
 *
 * - Coins add, because they were earned twice over. Only what this browser
 *   earned *since the server last confirmed a balance* is carried, so a save
 *   that has been synced ten times cannot pay itself in ten times.
 * - Records and totals take the higher side. A record is the best thing that
 *   ever happened, not the most recent.
 * - Owned things take the union. Nobody should have to buy a character twice
 *   because they logged in on a different machine.
 * - Settings stay with the device, because a phone and a school desktop do not
 *   want the same graphics tier.
 *
 * @param {object} local this browser's save
 * @param {object} cloud the account's save
 * @returns {{ save: object, carried: number }} the merged profile, and the
 *   coins the guest session brought with it, for the line shown to the player.
 */
export function mergeProfiles(local, cloud) {
  const a = normalizeSave(local);
  const b = normalizeSave(cloud);
  const out = { ...b };

  // What this browser has earned that the server has not seen. Clamped at both
  // ends: a save whose synced marker is ahead of its balance (coins spent since)
  // carries nothing rather than a negative.
  const unsynced = Math.max(0, a.coins - a.syncedCoins);
  const carried = Math.min(unsynced, MAX_GUEST_CARRY);
  out.coins = b.coins + carried;
  // The account's balance has just moved, and the server is about to be told
  // the whole of it. Marking it synced here would claim it already knew.
  out.syncedCoins = b.syncedCoins;

  // The gross figure follows the coins: the account is credited what the guest
  // session carried in, so the ledger behind it has to be told the same thing.
  out.earned = b.earned + carried;
  out.syncedEarned = b.syncedEarned;

  const higher = (key) => Math.max(a[key] ?? 0, b[key] ?? 0);
  for (const key of [
    "best",
    "xp",
    "runs",
    "totalDistance",
    "totalCoins",
    "missionsDone",
    "hoverboards",
    "antidotes",
    "streak",
    "bestStreak",
    "lastDay",
  ]) {
    out[key] = higher(key);
  }
  out.syncedXp = Math.min(a.syncedXp, b.syncedXp);

  out.characters = Array.from(new Set([...b.characters, ...a.characters]));
  // Whichever side actually chose one. A guest save is on the default runner
  // because nobody picked it — taking that as a preference would un-equip the
  // character the player bought, every time they signed in on a school PC.
  const chosen = [a.character, b.character].find(
    (id) => id !== DEFAULT_CHARACTER && out.characters.includes(id),
  );
  out.character = chosen ?? DEFAULT_CHARACTER;

  out.upgrades = {};
  for (const id of POWERUP_IDS) {
    out.upgrades[id] = Math.max(a.upgrades[id] ?? 1, b.upgrades[id] ?? 1);
  }

  // Today's missions come from whichever side was dealt more recently, with
  // their progress. Taking the higher progress field by field would mix two
  // different sets of missions into one that was never dealt.
  const fresher = a.missionDay >= b.missionDay ? a : b;
  out.missions = fresher.missions;
  out.missionDay = fresher.missionDay;
  out.missionBonusDay = Math.max(a.missionBonusDay, b.missionBonusDay);

  // Sound, haptics and graphics belong to the machine in front of you.
  out.settings = a.settings;

  return { save: out, carried };
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

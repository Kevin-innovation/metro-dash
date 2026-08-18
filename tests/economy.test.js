import { describe, expect, it } from "vitest";
import { POWERUP_IDS, POWERUP_MAX_LEVEL } from "../src/powerups.js";
import { SAVE_KEY } from "../src/config.js";
import { SaveStore, createMemoryStorage, defaultSave, normalizeSave } from "../src/save.js";
import {
  CHARACTERS,
  HOVERBOARD_COST,
  HOVERBOARD_MAX,
  purchase,
  shopView,
  upgradeCost,
} from "../src/shop.js";
import { RANKS, rankAt, rankProgress, runXp } from "../src/progression.js";

const storeWith = (patch = {}) => {
  const store = new SaveStore(createMemoryStorage());
  Object.assign(store.data, patch);
  return store;
};

describe("save normalisation", () => {
  it("returns a clean profile for junk input", () => {
    expect(normalizeSave(null)).toEqual(defaultSave());
    expect(normalizeSave("nope")).toEqual(defaultSave());
    expect(normalizeSave(42)).toEqual(defaultSave());
  });

  it("clamps hand-edited upgrade levels", () => {
    const save = normalizeSave({ upgrades: { magnet: 999, jetpack: -4 } });
    expect(save.upgrades.magnet).toBe(POWERUP_MAX_LEVEL);
    expect(save.upgrades.jetpack).toBe(1);
  });

  it("rejects negative currency and stats", () => {
    const save = normalizeSave({ coins: -500, best: -1, hoverboards: -3 });
    expect(save.coins).toBe(0);
    expect(save.best).toBe(0);
    expect(save.hoverboards).toBe(0);
  });

  it("always keeps the default character owned and equipped if the pick is bogus", () => {
    const save = normalizeSave({ character: "hacker", characters: ["hacker"] });
    expect(save.characters).toContain("runner");
    expect(save.character).toBe("runner");
  });

  it("drops owned characters that no longer exist", () => {
    const save = normalizeSave({ characters: ["runner", "ghost", "neon"] });
    expect(save.characters).toEqual(["runner", "neon"]);
  });

  it("drops missions with unknown ids", () => {
    const save = normalizeSave({ missions: [{ id: "not-real", target: 5, progress: 1 }, null] });
    expect(save.missions).toHaveLength(1);
    expect(save.missions[0].id).toBe("not-real");
  });
});

describe("SaveStore", () => {
  it("survives a corrupted blob on disk", () => {
    const storage = createMemoryStorage({ [SAVE_KEY]: "{{{not json" });
    const store = new SaveStore(storage);
    expect(store.data.coins).toBe(0);
    expect(store.data.character).toBe("runner");
  });

  it("migrates the legacy high-score key on a fresh profile", () => {
    const storage = createMemoryStorage({ "metro-dash-best": "8421" });
    expect(new SaveStore(storage).data.best).toBe(8421);
  });

  it("does not let the legacy key overwrite an existing profile", () => {
    const storage = createMemoryStorage({
      "metro-dash-best": "999999",
      [SAVE_KEY]: JSON.stringify({ ...defaultSave(), best: 100 }),
    });
    expect(new SaveStore(storage).data.best).toBe(100);
  });

  it("refuses to spend coins it does not have", () => {
    const store = storeWith({ coins: 100 });
    expect(store.spendCoins(500)).toBe(false);
    expect(store.data.coins).toBe(100);
    expect(store.spendCoins(100)).toBe(true);
    expect(store.data.coins).toBe(0);
  });

  it("only raises the best score", () => {
    const store = storeWith({ best: 500 });
    store.recordBest(200);
    expect(store.data.best).toBe(500);
    store.recordBest(900);
    expect(store.data.best).toBe(900);
  });

  it("round-trips through storage", () => {
    const storage = createMemoryStorage();
    const first = new SaveStore(storage);
    first.addCoins(1234);
    first.unlockCharacter("neon");
    first.equipCharacter("neon");
    expect(new SaveStore(storage).data.coins).toBe(1234);
    expect(new SaveStore(storage).data.character).toBe("neon");
  });

  it("refuses to equip a character that is not owned", () => {
    const store = storeWith({});
    expect(store.equipCharacter("mono")).toBe(false);
    expect(store.data.character).toBe("runner");
  });

  it("refuses to unlock a character that does not exist", () => {
    const store = storeWith({});
    store.unlockCharacter("ghost");
    expect(store.data.characters).not.toContain("ghost");
  });

  it("tolerates storage being unavailable", () => {
    const store = new SaveStore(null);
    expect(() => store.addCoins(50)).not.toThrow();
    expect(store.data.coins).toBe(50);
  });
});

describe("shop pricing", () => {
  it("gets more expensive every level and ends at max", () => {
    let previous = 0;
    for (let level = 1; level < POWERUP_MAX_LEVEL; level++) {
      const cost = upgradeCost(level);
      expect(cost).toBeGreaterThan(previous);
      previous = cost;
    }
    expect(upgradeCost(POWERUP_MAX_LEVEL)).toBe(null);
  });

  it("marks items unaffordable when the bank is short", () => {
    const view = shopView(storeWith({ coins: 0 }).data);
    expect(view.upgrades.every((u) => !u.affordable)).toBe(true);
    expect(view.hoverboards.affordable).toBe(false);
    // The free starter character is always "affordable".
    expect(view.characters[0].owned).toBe(true);
  });

  it("shows the duration a purchase would buy", () => {
    const view = shopView(storeWith({ coins: 99999 }).data);
    for (const upgrade of view.upgrades) {
      expect(upgrade.nextDuration).toBeGreaterThan(upgrade.duration);
      expect(upgrade.affordable).toBe(true);
    }
  });
});

describe("purchases", () => {
  it("raises a power-up level and charges for it", () => {
    const store = storeWith({ coins: 5000 });
    const cost = upgradeCost(1);
    expect(purchase(store, "upgrade", "magnet").ok).toBe(true);
    expect(store.data.upgrades.magnet).toBe(2);
    expect(store.data.coins).toBe(5000 - cost);
  });

  it("does not charge for a failed purchase", () => {
    const store = storeWith({ coins: 10 });
    const result = purchase(store, "upgrade", "magnet");
    expect(result).toEqual({ ok: false, reason: "poor" });
    expect(store.data.coins).toBe(10);
    expect(store.data.upgrades.magnet).toBe(1);
  });

  it("stops at max level without charging", () => {
    const store = storeWith({ coins: 99999 });
    store.data.upgrades.magnet = POWERUP_MAX_LEVEL;
    const before = store.data.coins;
    expect(purchase(store, "upgrade", "magnet")).toEqual({ ok: false, reason: "maxed" });
    expect(store.data.coins).toBe(before);
  });

  it("caps hoverboard stock", () => {
    const store = storeWith({ coins: 99999, hoverboards: HOVERBOARD_MAX });
    expect(purchase(store, "hoverboard", "hoverboard")).toEqual({ ok: false, reason: "maxed" });
    expect(store.data.coins).toBe(99999);
  });

  it("buys a hoverboard at the listed price", () => {
    const store = storeWith({ coins: HOVERBOARD_COST });
    expect(purchase(store, "hoverboard", "hoverboard").ok).toBe(true);
    expect(store.data.hoverboards).toBe(1);
    expect(store.data.coins).toBe(0);
  });

  it("unlocks and equips a character once, then equips for free", () => {
    const neon = CHARACTERS.find((c) => c.id === "neon");
    const store = storeWith({ coins: neon.cost });
    expect(purchase(store, "character", "neon").ok).toBe(true);
    expect(store.data.coins).toBe(0);
    expect(store.data.character).toBe("neon");

    purchase(store, "character", "runner");
    expect(store.data.character).toBe("runner");
    // Re-equipping the owned skin must not charge again.
    expect(purchase(store, "character", "neon").ok).toBe(true);
    expect(store.data.coins).toBe(0);
  });

  it("rejects unknown items", () => {
    const store = storeWith({ coins: 99999 });
    expect(purchase(store, "upgrade", "nope").ok).toBe(false);
    expect(purchase(store, "wat", "x").ok).toBe(false);
    expect(store.data.coins).toBe(99999);
  });
});

describe("rank progression", () => {
  it("starts at level 1 and only ever climbs", () => {
    expect(rankAt(0).level).toBe(1);
    let previous = 0;
    for (let xp = 0; xp < 80000; xp += 500) {
      const level = rankAt(xp).level;
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("reports progress between 0 and 1, and 1 at max rank", () => {
    for (let xp = 0; xp < 60000; xp += 250) {
      const progress = rankProgress(xp);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
    expect(rankProgress(RANKS[RANKS.length - 1].xp)).toBe(1);
  });

  it("awards XP proportional to score", () => {
    expect(runXp(0)).toBe(0);
    expect(runXp(-500)).toBe(0);
    expect(runXp(2500)).toBeGreaterThan(runXp(1000));
  });

  it("every power-up has a shop upgrade slot", () => {
    const save = defaultSave();
    for (const id of POWERUP_IDS) expect(save.upgrades[id]).toBe(1);
  });
});

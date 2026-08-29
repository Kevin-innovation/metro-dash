import { describe, expect, it } from "vitest";
import { CHARACTERS, characterById, perkFor } from "../src/characters.js";
import { CROW_TIME } from "../src/config.js";
import { CHANGELOG, VERSION, currentRelease } from "../src/release.js";
import { Run } from "../src/run.js";
import { SaveStore, normalizeSave } from "../src/save.js";
import {
  ANTIDOTE_COST,
  ANTIDOTE_MAX,
  HOVERBOARD_COST,
  profileWorth,
  purchase,
  shopView,
} from "../src/shop.js";

const store = (coins = 0) => {
  const s = new SaveStore({ getItem: () => null, setItem: () => {} });
  s.data.coins = coins;
  return s;
};

describe("crow antidote — buying", () => {
  it("costs what the shop says and is held one at a time", () => {
    const s = store(ANTIDOTE_COST * 3);
    expect(purchase(s, "antidote").ok).toBe(true);
    expect(s.data.antidotes).toBe(ANTIDOTE_MAX);
    expect(s.data.coins).toBe(ANTIDOTE_COST * 3 - ANTIDOTE_COST);
    // A second one cannot be stockpiled while the first is unspent.
    expect(purchase(s, "antidote")).toEqual({ ok: false, reason: "maxed" });
    expect(s.data.antidotes).toBe(ANTIDOTE_MAX);
  });

  it("refuses when the coins are not there, and takes none", () => {
    const s = store(ANTIDOTE_COST - 1);
    expect(purchase(s, "antidote")).toEqual({ ok: false, reason: "poor" });
    expect(s.data.antidotes).toBe(0);
    expect(s.data.coins).toBe(ANTIDOTE_COST - 1);
  });

  it("can be bought again once it has been used", () => {
    const s = store(ANTIDOTE_COST * 2);
    purchase(s, "antidote");
    expect(s.spendAntidote()).toBe(true);
    expect(purchase(s, "antidote").ok).toBe(true);
    expect(s.data.antidotes).toBe(1);
  });

  it("appears in the shop view with its own limit", () => {
    const s = store(ANTIDOTE_COST);
    const view = shopView(s.data);
    expect(view.antidotes).toEqual({
      owned: 0,
      max: ANTIDOTE_MAX,
      cost: ANTIDOTE_COST,
      affordable: true,
    });
  });

  it("is left out of the ledger estimate, like the hoverboard", () => {
    // profileWorth is compared against a ledger recorded at signup, so a
    // consumable counted here would revalue every one already bought whenever
    // its price moved — and refuse the saves of players who did nothing wrong.
    const s = store(ANTIDOTE_COST + 1000);
    const before = profileWorth(s.data);
    purchase(s, "antidote");
    expect(profileWorth(s.data)).toBe(before - ANTIDOTE_COST);
  });

  it("a repriced hoverboard cannot retroactively inflate an old profile", () => {
    const held = normalizeSave({ coins: 500, hoverboards: 1 });
    const none = normalizeSave({ coins: 500, hoverboards: 0 });
    expect(profileWorth(held)).toBe(profileWorth(none));
  });
});

describe("crow antidote — using", () => {
  it("blocks the crow and is spent doing it", () => {
    const s = store(ANTIDOTE_COST);
    purchase(s, "antidote");
    const run = new Run(s);
    expect(run.addHazard("crow")).toEqual({ blocked: true });
    expect(run.crowActive()).toBe(false);
    expect(s.data.antidotes).toBe(0);
    expect(run.metrics.antidotes).toBe(1);
  });

  it("blocks once only — the next egg lands", () => {
    const s = store(ANTIDOTE_COST);
    purchase(s, "antidote");
    const run = new Run(s);
    run.addHazard("crow");
    expect(run.addHazard("crow")).toEqual({ blocked: false });
    expect(run.crowActive()).toBe(true);
  });

  it("still counts the egg as taken, blocked or not", () => {
    const s = store(ANTIDOTE_COST);
    purchase(s, "antidote");
    const run = new Run(s);
    run.addHazard("crow");
    run.addHazard("crow");
    expect(run.metrics.crows).toBe(2);
  });

  it("does nothing when none is held", () => {
    const s = store(0);
    expect(s.spendAntidote()).toBe(false);
    const run = new Run(s);
    expect(run.addHazard("crow")).toEqual({ blocked: false });
  });

  it("survives a save written before antidotes existed", () => {
    const save = normalizeSave({ coins: 10, hoverboards: 1 });
    expect(save.antidotes).toBe(0);
  });
});

describe("hoverboard price", () => {
  it("is priced as the extra life it is, not as pocket change", () => {
    expect(HOVERBOARD_COST).toBe(3000);
    // The antidote answers the worse problem, so it costs more.
    expect(ANTIDOTE_COST).toBeGreaterThan(HOVERBOARD_COST);
  });
});

describe("new characters", () => {
  const ids = ["scarecrow", "sweeper", "athlete", "attendant"];

  it("all exist and all cost something", () => {
    for (const id of ids) {
      const c = characterById(id);
      expect(c.id, id).toBe(id);
      expect(c.cost, id).toBeGreaterThan(0);
    }
  });

  it("허수아비 shortens the crow and thins the veil", () => {
    const perk = perkFor("scarecrow");
    expect(perk.crowTime).toBeCloseTo(0.7);
    expect(perk.crowVeil).toBeCloseTo(0.5);
  });

  it("허수아비 actually shortens a crow taken in a run", () => {
    const s = store(0);
    const run = new Run(s);
    run.crowScale = perkFor("scarecrow").crowTime;
    run.addHazard("crow");
    expect(run.crowT).toBeCloseTo(CROW_TIME * 0.7);
    expect(run.crowSeconds).toBeCloseTo(CROW_TIME * 0.7);
  });

  it("육상부 holds a combo longer", () => {
    const s = store(0);
    const plain = new Run(s);
    const athlete = new Run(s);
    athlete.comboScale = perkFor("athlete").comboWindow;
    plain.bumpCombo();
    athlete.bumpCombo();
    expect(athlete.comboT).toBeCloseTo(plain.comboT * 1.5);
  });

  it("역무원 banks more XP for the same score", () => {
    const plainStore = store(0);
    const perkStore = store(0);
    const plain = new Run(plainStore);
    const perked = new Run(perkStore);
    perked.xpScale = perkFor("attendant").xpBonus;
    for (const run of [plain, perked]) run.scoreBonus = 100000;
    plain.bank(true);
    perked.bank(true);
    expect(perkStore.data.xp).toBeGreaterThan(plainStore.data.xp);
    expect(perkStore.data.xp).toBe(Math.round(plainStore.data.xp * 1.25));
  });

  it("gives every perk a name nobody has to guess at", () => {
    for (const c of CHARACTERS) {
      const named = Object.keys(c.perk).length > 0;
      // The default runner is the one allowed to have nothing to say.
      if (named) expect(c.blurb, c.id).toContain("·");
    }
  });

  it("prices go up with the runner list, so the shop reads as a ladder", () => {
    const costs = CHARACTERS.map((c) => c.cost);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i], CHARACTERS[i].id).toBeGreaterThan(costs[i - 1]);
    }
  });
});

describe("version and patch notes", () => {
  it("the badge version has an entry to point at", () => {
    expect(currentRelease().version).toBe(VERSION);
  });

  it("is newest first", () => {
    const rank = (v) => {
      const [major, minor] = v.split(".").map(Number);
      return major * 100 + minor;
    };
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(rank(CHANGELOG[i - 1].version)).toBeGreaterThan(rank(CHANGELOG[i].version));
    }
  });

  it("every entry is dated, titled and says something", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date, entry.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title.length, entry.version).toBeGreaterThan(0);
      expect(entry.notes.length, entry.version).toBeGreaterThan(0);
      expect(["major", "minor", "fix"]).toContain(entry.kind);
    }
  });

  it("uses two-digit minors, so 2.1 can never sort above 2.02", () => {
    for (const entry of CHANGELOG) {
      expect(entry.version, entry.version).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("has no duplicate versions", () => {
    const seen = new Set(CHANGELOG.map((e) => e.version));
    expect(seen.size).toBe(CHANGELOG.length);
  });
});

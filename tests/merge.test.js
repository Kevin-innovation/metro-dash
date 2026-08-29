import { describe, expect, it } from "vitest";
import { MAX_GUEST_CARRY, defaultSave, mergeProfiles, normalizeSave } from "../src/save.js";

/** A profile with everything at zero unless the test says otherwise. */
const save = (fields = {}) => normalizeSave({ ...defaultSave(), ...fields });

describe("signing in never loses coins", () => {
  it("adds what the guest session earned to the account balance", () => {
    // The exact case students were hitting: a run or two on a shared PC before
    // logging in, then logging into an account with a real balance.
    const local = save({ coins: 300, syncedCoins: 0 });
    const cloud = save({ coins: 47000, syncedCoins: 47000 });
    const { save: out, carried } = mergeProfiles(local, cloud);
    expect(out.coins).toBe(47300);
    expect(carried).toBe(300);
  });

  it("never returns less than the account already had", () => {
    const cases = [
      [save({ coins: 0, syncedCoins: 0 }), save({ coins: 47000, syncedCoins: 47000 })],
      [save({ coins: 5, syncedCoins: 900 }), save({ coins: 47000, syncedCoins: 47000 })],
      [save({ coins: 99999, syncedCoins: 99999 }), save({ coins: 47000, syncedCoins: 47000 })],
    ];
    for (const [local, cloud] of cases) {
      expect(mergeProfiles(local, cloud).save.coins).toBeGreaterThanOrEqual(cloud.coins);
    }
  });

  it("carries nothing when the browser has already been synced", () => {
    // Everything this save holds, the server has already counted.
    const local = save({ coins: 8000, syncedCoins: 8000 });
    const cloud = save({ coins: 47000, syncedCoins: 47000 });
    const { save: out, carried } = mergeProfiles(local, cloud);
    expect(carried).toBe(0);
    expect(out.coins).toBe(47000);
  });

  it("carries nothing, rather than a negative, after coins were spent", () => {
    const local = save({ coins: 100, syncedCoins: 5000 });
    const cloud = save({ coins: 47000, syncedCoins: 47000 });
    const { save: out, carried } = mergeProfiles(local, cloud);
    expect(carried).toBe(0);
    expect(out.coins).toBe(47000);
  });

  it("caps what a hand-edited guest save can inject", () => {
    const local = save({ coins: 9_000_000, syncedCoins: 0 });
    const cloud = save({ coins: 1000, syncedCoins: 1000 });
    const { save: out, carried } = mergeProfiles(local, cloud);
    expect(carried).toBe(MAX_GUEST_CARRY);
    expect(out.coins).toBe(1000 + MAX_GUEST_CARRY);
  });
});

describe("records and totals take the better side", () => {
  it("keeps the higher best score whichever side it is on", () => {
    expect(mergeProfiles(save({ best: 1240 }), save({ best: 260173 })).save.best).toBe(260173);
    expect(mergeProfiles(save({ best: 260173 }), save({ best: 1240 })).save.best).toBe(260173);
  });

  it("keeps the higher XP, so a level can never go backwards", () => {
    const { save: out } = mergeProfiles(save({ xp: 80 }), save({ xp: 134610 }));
    expect(out.xp).toBe(134610);
  });

  it("keeps the higher lifetime counters", () => {
    const local = save({ runs: 3, totalDistance: 400, totalCoins: 20, missionsDone: 0 });
    const cloud = save({ runs: 214, totalDistance: 400000, totalCoins: 90000, missionsDone: 40 });
    const { save: out } = mergeProfiles(local, cloud);
    expect(out.runs).toBe(214);
    expect(out.totalDistance).toBe(400000);
    expect(out.totalCoins).toBe(90000);
    expect(out.missionsDone).toBe(40);
  });

  it("keeps the longer streak", () => {
    const { save: out } = mergeProfiles(save({ streak: 1, bestStreak: 2 }), save({ streak: 5, bestStreak: 9 }));
    expect(out.streak).toBe(5);
    expect(out.bestStreak).toBe(9);
  });
});

describe("nothing owned is ever paid for twice", () => {
  it("unions the characters bought on either device", () => {
    const local = save({ characters: ["runner", "neon"], character: "neon" });
    const cloud = save({ characters: ["runner", "mono"], character: "mono" });
    const { save: out } = mergeProfiles(local, cloud);
    expect(out.characters.sort()).toEqual(["mono", "neon", "runner"]);
  });

  it("keeps the runner equipped on this device when one was chosen here", () => {
    const local = save({ characters: ["runner", "neon"], character: "neon" });
    const cloud = save({ characters: ["runner", "mono"], character: "mono" });
    expect(mergeProfiles(local, cloud).save.character).toBe("neon");
  });

  it("does not un-equip the account's runner just because a guest was default", () => {
    // The everyday case on a shared PC: a guest session is on the default
    // runner because nobody picked it, not because anybody preferred it.
    const local = save({ characters: ["runner"], character: "runner" });
    const cloud = save({ characters: ["runner", "mono"], character: "mono" });
    expect(mergeProfiles(local, cloud).save.character).toBe("mono");
  });

  it("settles on the default when neither side ever picked anything", () => {
    const out = mergeProfiles(save({}), save({})).save;
    expect(out.character).toBe("runner");
    expect(out.characters).toContain("runner");
  });

  it("keeps the higher upgrade level per power-up", () => {
    const local = save({ upgrades: { magnet: 4, jetpack: 1, double: 2, sneakers: 1 } });
    const cloud = save({ upgrades: { magnet: 2, jetpack: 5, double: 1, sneakers: 3 } });
    const { save: out } = mergeProfiles(local, cloud);
    expect(out.upgrades).toMatchObject({ magnet: 4, jetpack: 5, double: 2, sneakers: 3 });
  });

  it("keeps consumables held on either side", () => {
    const { save: out } = mergeProfiles(
      save({ hoverboards: 1, antidotes: 0 }),
      save({ hoverboards: 0, antidotes: 1 }),
    );
    expect(out.hoverboards).toBe(1);
    expect(out.antidotes).toBe(1);
  });
});

describe("missions and settings", () => {
  it("takes today's set whole, rather than mixing two different sets", () => {
    const local = save({
      missionDay: 20260829,
      missions: [{ id: "coins", target: 150, progress: 40 }],
    });
    const cloud = save({
      missionDay: 20260828,
      missions: [{ id: "combo", target: 80, progress: 79 }],
    });
    const { save: out } = mergeProfiles(local, cloud);
    expect(out.missionDay).toBe(20260829);
    expect(out.missions).toHaveLength(1);
    expect(out.missions[0].id).toBe("coins");
  });

  it("takes the account's set when it is the fresher one", () => {
    const local = save({ missionDay: 20260820, missions: [{ id: "coins", target: 1, progress: 0 }] });
    const cloud = save({ missionDay: 20260829, missions: [{ id: "combo", target: 80, progress: 12 }] });
    expect(mergeProfiles(local, cloud).save.missions[0].id).toBe("combo");
  });

  it("never lets the all-clear bonus be collected twice in a day", () => {
    const { save: out } = mergeProfiles(
      save({ missionBonusDay: 20260829 }),
      save({ missionBonusDay: 0 }),
    );
    expect(out.missionBonusDay).toBe(20260829);
  });

  it("leaves sound and graphics with the machine in front of you", () => {
    const local = save({ settings: { sfx: false, music: false, haptics: true, quality: "low" } });
    const cloud = save({ settings: { sfx: true, music: true, haptics: true, quality: "high" } });
    const { save: out } = mergeProfiles(local, cloud);
    expect(out.settings.sfx).toBe(false);
    expect(out.settings.quality).toBe("low");
  });
});

describe("the merged profile is a valid one", () => {
  it("survives junk on either side", () => {
    const { save: out } = mergeProfiles(null, undefined);
    expect(out).toMatchObject(normalizeSave(null));
  });

  it("does not claim the server has already seen the carried coins", () => {
    // syncedCoins is what tells the next sync how much is new. Moved up to the
    // merged balance, the carried coins would be silently written off.
    const local = save({ coins: 300, syncedCoins: 0 });
    const cloud = save({ coins: 47000, syncedCoins: 47000 });
    const { save: out } = mergeProfiles(local, cloud);
    expect(out.syncedCoins).toBeLessThan(out.coins);
  });

  it("is stable — merging the result again changes nothing", () => {
    const local = save({ coins: 300, syncedCoins: 0, best: 1240, characters: ["runner", "neon"] });
    const cloud = save({ coins: 47000, syncedCoins: 47000, best: 260173 });
    const once = mergeProfiles(local, cloud).save;
    const twice = mergeProfiles(once, once).save;
    expect(twice.best).toBe(once.best);
    expect(twice.characters.sort()).toEqual(once.characters.sort());
  });
});

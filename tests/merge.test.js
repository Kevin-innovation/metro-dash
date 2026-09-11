import { describe, expect, it } from "vitest";
import { seasonAt } from "../src/release.js";
import {
  MAX_GUEST_CARRY,
  defaultSave,
  mergeProfiles,
  normalizeSave,
  pinServerFigures,
} from "../src/save.js";

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
    expect(out.upgrades).toMatchObject({ magnet: 4, jetpack: 5, focus: 2, sneakers: 3 });
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

describe("보고되지 않은 출석 보상", () => {
  it("저장되고 다시 읽힌다", () => {
    // 출석 보상은 런이 시작될 때 로컬 잔액에 먼저 들어가고, 다음 런 제출이
    // 서버에 보고한다. 그 사이에 탭을 닫으면 예전에는 메모리와 함께 사라졌다.
    const stored = normalizeSave({
      ...defaultSave(),
      coins: 5100,
      syncedCoins: 5000,
      pendingClaimCoins: 100,
    });
    expect(stored.pendingClaimCoins).toBe(100);
    expect(normalizeSave(stored).pendingClaimCoins).toBe(100);
  });

  it("없던 세이브는 0으로 열린다", () => {
    const old = { ...defaultSave() };
    delete old.pendingClaimCoins;
    delete old.pendingClaimXp;
    expect(normalizeSave(old).pendingClaimCoins).toBe(0);
    expect(normalizeSave(old).pendingClaimXp).toBe(0);
  });

  it("로그인 병합에서 이 기기 것이 남는다", () => {
    // 계정 쪽 값은 다른 기기가 자기 잔액에 넣어둔 메모다. 큰 쪽을 고르면
    // 한 기기의 출석을 양쪽에서 보고하게 된다.
    const local = save({ coins: 5100, syncedCoins: 5000, pendingClaimCoins: 100 });
    const cloud = save({ coins: 47000, syncedCoins: 47000, pendingClaimCoins: 350 });
    expect(mergeProfiles(local, cloud).save.pendingClaimCoins).toBe(100);
  });
});

describe("스태프가 고친 값이 부팅으로 지워지지 않는다", () => {
  it("코인 지급이 세이브 안의 낡은 숫자를 이긴다", () => {
    // 실제로 일어난 일: 대시보드에서 coins 컬럼을 고쳤는데 화면은 그대로였다.
    // 지급은 컬럼을 패치하고 세이브 블롭은 건드리지 않는다 — 그 블롭은 그
    // 브라우저의 것이니까. 그런데 부팅이 블롭에서 잔액을 읽어 병합하고 그걸
    // absolute 로 도로 올려서, 방금 고친 컬럼 위에 낡은 숫자를 덮어썼다.
    const blob = normalizeSave({ ...defaultSave(), coins: 26355, syncedCoins: 26355 });
    const pinned = pinServerFigures(blob, { coins: 200000 });
    expect(pinned.coins).toBe(200000);
    // 서버가 방금 말한 값이므로 이미 동기화된 것으로 표시된다. 안 그러면
    // 다음 sync 가 17만을 새로 번 것으로 보고한다.
    expect(pinned.syncedCoins).toBe(200000);
  });

  it("코인을 깎는 것도 먹혀야 한다", () => {
    // best 와 달리 max 가 아니라 대입이다. 회수도 정정이다.
    const blob = normalizeSave({ ...defaultSave(), coins: 900000, syncedCoins: 900000 });
    expect(pinServerFigures(blob, { coins: 1000 }).coins).toBe(1000);
  });

  it("최고 점수는 올리기만 한다 — 같은 시즌 안에서", () => {
    // 연결이 끊긴 채 끝낸 판이 세이브 안에 있고 아직 서버에 못 갔다.
    const blob = normalizeSave({ ...defaultSave(), best: 500000, bestSeason: seasonAt() });
    expect(pinServerFigures(blob, { best: 300000 }).best).toBe(500000);
    expect(pinServerFigures(blob, { best: 900000 }).best).toBe(900000);
  });

  it("지난 시즌 기록은 이 시즌을 막지 못한다", () => {
    // 174만은 초당 점수가 아니라 미터당 점수로 세운 숫자다. 이 시즌이
    // 이길 수 있는 값이 아니므로 이 시즌의 기록을 가로막아서도 안 된다.
    const old = normalizeSave({ ...defaultSave(), best: 1_742_419, bestSeason: seasonAt() - 1 });
    expect(pinServerFigures(old, { best: 300_000 }).best).toBe(300_000);
    expect(pinServerFigures(old, { best: 300_000 }).bestSeason).toBe(seasonAt());
  });

  it("서버가 말하지 않은 값은 건드리지 않는다", () => {
    const blob = normalizeSave({ ...defaultSave(), coins: 4242, best: 77, xp: 5 });
    const same = pinServerFigures(blob, {});
    expect(same.coins).toBe(4242);
    expect(same.best).toBe(77);
    expect(same.xp).toBe(5);
    expect(pinServerFigures(blob, { coins: undefined, xp: null }).coins).toBe(4242);
  });

  it("지급받은 잔액 위로 이 기기가 번 것이 얹힌다", () => {
    // 고쳐진 잔액이 병합의 출발점이고, 아직 보고 안 한 수입은 그 위에 더해진다.
    const local = normalizeSave({ ...defaultSave(), coins: 5300, syncedCoins: 5000 });
    const cloud = pinServerFigures(
      normalizeSave({ ...defaultSave(), coins: 26355, syncedCoins: 26355 }),
      { coins: 200000 },
    );
    const { save, carried } = mergeProfiles(local, cloud);
    expect(carried).toBe(300);
    expect(save.coins).toBe(200300);
  });
});

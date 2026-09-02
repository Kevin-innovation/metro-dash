// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema.js";
import { api } from "../convex/_generated/api.js";
import { FREE_ATTEMPTS, MAX_ACCOUNTS_PER_DEVICE, maxDistanceIn } from "../src/leaderboard-rules.js";
import { rankAt } from "../src/progression.js";
import { MAX_SESSIONS } from "../convex/session.js";

/**
 * The backend, run against an in-memory Convex.
 *
 * The rules modules are unit tested on their own; what is checked here is the
 * part those tests cannot see — what the functions actually write to the
 * database. Both of the bugs that reached production (a lockout counter undone
 * by its own rollback, and a client save that could set `best`) were invisible
 * to a pure-function test and would have been caught by one of these.
 */

const ADMIN_KEY = "test-admin-key-0123";
const modules = import.meta.glob("../convex/**/*.*s");

const backend = () => convexTest(schema, modules);

/** A run well inside every bound, so only the code under test can reject it. */
function plausibleRun(overrides = {}) {
  const seconds = 60;
  return {
    score: 4000,
    distance: Math.floor(maxDistanceIn(seconds) * 0.6),
    coins: 40,
    comboMax: 12,
    seconds,
    character: "runner",
    ...overrides,
  };
}

async function signUp(t, handle, pin = "1234", deviceId = handle) {
  return await t.mutation(api.players.register, {
    handle,
    pin,
    deviceId,
    profile: { coins: 0, best: 0 },
  });
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

afterEach(() => {
  vi.useRealTimers();
});

// --- accounts ---------------------------------------------------------------

describe("players:register", () => {
  it("creates an account and hands back a token", async () => {
    const t = backend();
    const session = await signUp(t, "달리기");

    expect(session.handle).toBe("달리기");
    expect(session.token).toMatch(/^[0-9a-f]{48}$/);
    expect(session.best).toBe(0);
  });

  it("starts every account at zero however good the local save claims to be", async () => {
    const t = backend();
    const session = await t.mutation(api.players.register, {
      handle: "구라쟁이",
      pin: "1234",
      deviceId: "device-a",
      profile: { best: 999999, coins: 5 },
    });

    // Both the column the board ranks on and the copy inside the save blob.
    expect(session.best).toBe(0);
    expect(session.profile.best).toBe(0);
  });

  it("refuses a nickname already in use", async () => {
    const t = backend();
    await signUp(t, "선착순", "1234", "device-a");
    await expect(signUp(t, "선착순", "5678", "device-b")).rejects.toThrow(/이미 쓰고/);
  });

  it("refuses a nickname the filter rejects", async () => {
    const t = backend();
    await expect(signUp(t, "시발")).rejects.toThrow();
  });

  it("refuses a PIN that is not four digits", async () => {
    const t = backend();
    await expect(signUp(t, "짧은비번", "12")).rejects.toThrow(/숫자 4자리/);
  });

  it(`caps one device at ${MAX_ACCOUNTS_PER_DEVICE} accounts`, async () => {
    const t = backend();
    for (let i = 0; i < MAX_ACCOUNTS_PER_DEVICE; i++) {
      await signUp(t, `계정${i}`, "1234", "one-laptop");
    }
    await expect(signUp(t, "하나더", "1234", "one-laptop")).rejects.toThrow(/계정을/);
  });

  it("counts the cap per device, not globally", async () => {
    const t = backend();
    for (let i = 0; i < MAX_ACCOUNTS_PER_DEVICE; i++) {
      await signUp(t, `가${i}`, "1234", "laptop-a");
    }
    await expect(signUp(t, "다른기기", "1234", "laptop-b")).resolves.toBeTruthy();
  });
});

describe("players:available", () => {
  it("reports a free nickname as free and a taken one as taken", async () => {
    const t = backend();
    expect(await t.query(api.players.available, { handle: "비어있음" })).toEqual({ ok: true });

    await signUp(t, "비어있음");
    const after = await t.query(api.players.available, { handle: "비어있음" });
    expect(after).toMatchObject({ ok: false, reason: "taken" });
  });
});

describe("players:signIn", () => {
  it("accepts the right PIN and issues a token for that device", async () => {
    const t = backend();
    const first = await signUp(t, "다시로그인");
    const second = await t.mutation(api.players.signIn, {
      handle: "다시로그인",
      pin: "1234",
      deviceId: "another-device",
    });

    expect(second.ok).toBe(true);
    expect(second.token).not.toBe(first.token);

    // And the browser that was already signed in stays signed in. This used to
    // be the opposite: one token per account meant signing in on a phone signed
    // the desktop out, silently, with no way for the player to tell why.
    expect(await t.query(api.players.load, { token: first.token })).toMatchObject({
      handle: "다시로그인",
    });
  });

  it("같은 기기에서 다시 로그인하면 그 기기의 세션만 갈린다", async () => {
    const t = backend();
    const first = await signUp(t, "같은기기", "1234", "device-a");
    const again = await t.mutation(api.players.signIn, {
      handle: "같은기기",
      pin: "1234",
      deviceId: "device-a",
    });

    // The device's own previous token goes, so signing in twice on one browser
    // does not leave a row behind every time.
    await expect(t.query(api.players.load, { token: first.token })).rejects.toThrow(/세션/);
    expect(await t.query(api.players.load, { token: again.token })).toMatchObject({
      handle: "같은기기",
    });
  });

  it("기기 수가 늘어도 최근 것들은 살아 있다", async () => {
    const t = backend();
    await signUp(t, "여러기기", "1234", "d0");
    const tokens = [];
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      const result = await t.mutation(api.players.signIn, {
        handle: "여러기기",
        pin: "1234",
        deviceId: `d${i}`,
      });
      tokens.push(result.token);
    }

    // The cap drops the oldest, never the one that just signed in.
    for (const token of tokens.slice(-3)) {
      expect(await t.query(api.players.load, { token })).toMatchObject({ handle: "여러기기" });
    }
    const rows = await t.run(async (ctx) => await ctx.db.query("sessions").collect());
    expect(rows.length).toBeLessThanOrEqual(MAX_SESSIONS);
  });

  it("keeps counting wrong PINs instead of losing the count to a rollback", async () => {
    const t = backend();
    await signUp(t, "틀린비번");

    for (let i = 1; i <= FREE_ATTEMPTS; i++) {
      const result = await t.mutation(api.players.signIn, { handle: "틀린비번", pin: "0000" });
      expect(result.ok).toBe(false);
      // The countdown is proof the number is being remembered between calls.
      if (i < FREE_ATTEMPTS) expect(result.message).toContain(`${FREE_ATTEMPTS - i}번 더`);
    }

    // The attempt past the allowance is the one that locks the account.
    await t.mutation(api.players.signIn, { handle: "틀린비번", pin: "0000" });

    // This is the regression: a mutation that threw would have rolled the
    // counter back every time, and the right PIN would still work here.
    const stillLocked = await t.mutation(api.players.signIn, { handle: "틀린비번", pin: "1234" });
    expect(stillLocked.ok).toBe(false);
    expect(stillLocked.message).toMatch(/초 뒤에/);
  });

  it("lets the lockout expire", async () => {
    vi.useFakeTimers();
    const t = backend();
    await signUp(t, "기다리기");

    for (let i = 0; i <= FREE_ATTEMPTS + 1; i++) {
      await t.mutation(api.players.signIn, { handle: "기다리기", pin: "0000" });
    }
    expect(
      (await t.mutation(api.players.signIn, { handle: "기다리기", pin: "1234" })).ok,
    ).toBe(false);

    vi.advanceTimersByTime(2 * 60 * 1000);
    const result = await t.mutation(api.players.signIn, { handle: "기다리기", pin: "1234" });
    expect(result.ok).toBe(true);
  });

  it("clears the failure count once the right PIN arrives", async () => {
    const t = backend();
    await signUp(t, "겨우성공");

    await t.mutation(api.players.signIn, { handle: "겨우성공", pin: "0000" });
    await t.mutation(api.players.signIn, { handle: "겨우성공", pin: "1234" });

    // Back to a full allowance: attempt FREE_ATTEMPTS should still be free.
    for (let i = 1; i <= FREE_ATTEMPTS; i++) {
      await t.mutation(api.players.signIn, { handle: "겨우성공", pin: "0000" });
    }
    const stillOpen = await t.mutation(api.players.signIn, { handle: "겨우성공", pin: "1234" });
    expect(stillOpen.ok).toBe(true);
  });

  it("answers an unknown nickname exactly as it answers a wrong PIN", async () => {
    const t = backend();
    await signUp(t, "있는사람");

    const missing = await t.mutation(api.players.signIn, { handle: "없는사람", pin: "1234" });
    const wrong = await t.mutation(api.players.signIn, { handle: "있는사람", pin: "9999" });

    // Different messages here would turn the form into a nickname oracle.
    expect(missing.message.startsWith("닉네임이나 비밀번호가 맞지 않아요")).toBe(true);
    expect(wrong.message.startsWith("닉네임이나 비밀번호가 맞지 않아요")).toBe(true);
  });
});

describe("players:save", () => {
  it("stores the save file", async () => {
    const t = backend();
    const { token } = await signUp(t, "저장하기");

    // The blob is stored as sent, except the balance — which is the server's
    // and is written into the copy so a fresh device restores the right one.
    // Saving does not pay: a browser claiming 120 coins it never earned gets
    // its save kept and its balance left alone.
    await t.mutation(api.players.save, { token, profile: { coins: 120, runs: 4 }, coinsDelta: 120 });
    const loaded = await t.query(api.players.load, { token });
    expect(loaded.profile).toMatchObject({ runs: 4 });
    expect(loaded.coins).toBe(0);
    expect(loaded.profile.coins).toBe(0);
  });

  it("cannot pay itself by saving", async () => {
    // The hole this closes: players:save used to credit whatever the browser
    // said it had earned, up to five thousand a call, with no run required.
    const t = backend();
    const { token } = await signUp(t, "지갑");

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.players.save, {
        token,
        profile: { coins: 5000 * (i + 1) },
        coinsDelta: 5000,
        xpDelta: 60000,
      });
    }
    const loaded = await t.query(api.players.load, { token });
    expect(loaded.coins).toBe(0);
    expect(loaded.level).toBe(1);
  });

  it("cannot raise the score the leaderboard ranks on", async () => {
    const t = backend();
    const { token } = await signUp(t, "치터");

    await t.mutation(api.players.save, { token, profile: { best: 9999999, coins: 1 } });

    const loaded = await t.query(api.players.load, { token });
    expect(loaded.best).toBe(0);
    // Overwritten inside the blob too, or the profile card would show the lie.
    expect(loaded.profile.best).toBe(0);

    const board = await t.query(api.scores.top, {});
    expect(board).toHaveLength(0);
  });

  it("hands back the record the server holds", async () => {
    const t = backend();
    const phone = await signUp(t, "두기기최고", "1234", "phone");
    const desktop = await t.mutation(api.players.signIn, {
      handle: "두기기최고",
      pin: "1234",
      deviceId: "desktop",
    });

    // The record is set on one device…
    await t.mutation(api.scores.submit, { token: phone.token, ...plausibleRun({ score: 4200 }) });

    // …and the other one, which still thinks the best is 0, learns about it on
    // its next sync. Without this the title screen and the leaderboard disagree
    // until the account is signed in again.
    const synced = await t.mutation(api.players.save, {
      token: desktop.token,
      profile: { coins: 0, best: 0 },
    });
    expect(synced).toMatchObject({ ok: true, best: 4200 });
  });

  it("a device that was merely opened cannot drag the rank backwards", async () => {
    const t = backend();
    const phone = await signUp(t, "경험치두기기", "1234", "phone");
    const desktop = await t.mutation(api.players.signIn, {
      handle: "경험치두기기",
      pin: "1234",
      deviceId: "desktop",
    });

    // The phone plays an afternoon. Experience comes from the run, not from
    // what the browser says it has.
    const run = await t.mutation(api.scores.submit, { token: phone.token, ...plausibleRun() });
    expect(run.xp).toBeGreaterThan(0);

    // The desktop has not played since, so its profile still says 0. Saving is
    // not a claim on the total any more, so opening it changes nothing.
    const stale = await t.mutation(api.players.save, {
      token: desktop.token,
      profile: { coins: 0, xp: 0 },
    });
    expect(stale).toMatchObject({ ok: true, xp: run.xp });

    const loaded = await t.query(api.players.load, { token: phone.token });
    expect(loaded.level).toBe(rankAt(run.xp).level);
  });

  it("keeps a correction typed in by staff", async () => {
    const t = backend();
    const { token } = await signUp(t, "경험치보정");
    await t.mutation(api.players.save, { token, profile: { coins: 0, xp: 100 }, xpDelta: 100 });

    // Staff raise the column in the dashboard. The next sync used to overwrite
    // it with whatever the browser happened to be holding.
    const player = await t.run(async (ctx) => {
      const row = await ctx.db.query("players").first();
      await ctx.db.patch(row._id, { xp: 30000 });
      return row._id;
    });
    expect(player).toBeTruthy();

    const after = await t.mutation(api.players.save, {
      token,
      profile: { coins: 0, xp: 100 },
      xpDelta: 0,
    });
    expect(after.xp).toBe(30000);
  });

  it("caps how much experience one sync may add", async () => {
    const t = backend();
    const { token } = await signUp(t, "경험치폭탄");
    const result = await t.mutation(api.players.save, {
      token,
      profile: { coins: 0, xp: 99_999_999 },
      xpDelta: 99_999_999,
    });
    expect(result.xp).toBeLessThan(99_999_999);
  });

  it("refuses a save blob big enough to be an attack", async () => {
    const t = backend();
    const { token } = await signUp(t, "용량폭탄");
    const profile = { junk: "가".repeat(30 * 1024) };
    await expect(t.mutation(api.players.save, { token, profile })).rejects.toThrow(/너무 큽니다/);
  });

  it("rejects a token that is not a session", async () => {
    const t = backend();
    await expect(t.mutation(api.players.save, { token: "nope", profile: {} })).rejects.toThrow(
      /세션/,
    );
  });
});

describe("players:signOut", () => {
  it("invalidates the token it was called with", async () => {
    const t = backend();
    const { token } = await signUp(t, "로그아웃");
    await t.mutation(api.players.signOut, { token });
    await expect(t.query(api.players.load, { token })).rejects.toThrow(/세션/);
  });

  it("다른 기기는 로그인된 채로 둔다", async () => {
    const t = backend();
    const phone = await signUp(t, "두기기", "1234", "phone");
    const desktop = await t.mutation(api.players.signIn, {
      handle: "두기기",
      pin: "1234",
      deviceId: "desktop",
    });

    await t.mutation(api.players.signOut, { token: phone.token });

    await expect(t.query(api.players.load, { token: phone.token })).rejects.toThrow(/세션/);
    expect(await t.query(api.players.load, { token: desktop.token })).toMatchObject({
      handle: "두기기",
    });
  });
});

describe("세션", () => {
  it("세션이 생기기 전에 발급된 토큰도 계속 통한다", async () => {
    // What an already-signed-in browser is holding when this ships. Rejecting
    // those would have signed out everyone who was signed in at the time.
    const t = backend();
    const { token } = await signUp(t, "옛토큰");
    const legacy = await t.run(async (ctx) => {
      const player = await ctx.db.query("players").first();
      const rows = await ctx.db.query("sessions").collect();
      for (const row of rows) await ctx.db.delete(row._id);
      return player.token;
    });

    await expect(t.query(api.players.load, { token })).rejects.toThrow(/세션/);
    expect(await t.query(api.players.load, { token: legacy })).toMatchObject({ handle: "옛토큰" });
  });

  it("로그아웃은 그 옛 토큰까지 끊는다", async () => {
    const t = backend();
    await signUp(t, "옛토큰정리");
    const legacy = await t.run(async (ctx) => (await ctx.db.query("players").first()).token);

    await t.mutation(api.players.signOut, { token: legacy });
    await expect(t.query(api.players.load, { token: legacy })).rejects.toThrow(/세션/);
  });

  it("비밀번호를 다시 정하면 모든 기기가 로그아웃된다", async () => {
    const t = backend();
    const { token } = await signUp(t, "비번리셋");
    await t.mutation(api.admin.resetPin, { adminKey: ADMIN_KEY, handle: "비번리셋", newPin: "9999" });
    await expect(t.query(api.players.load, { token })).rejects.toThrow(/세션/);
  });

  it("계정을 지우면 세션도 남지 않는다", async () => {
    const t = backend();
    await signUp(t, "지워질사람");
    await t.mutation(api.admin.remove, { adminKey: ADMIN_KEY, handle: "지워질사람" });
    expect(await t.run(async (ctx) => await ctx.db.query("sessions").collect())).toEqual([]);
  });
});

// --- the board --------------------------------------------------------------

describe("scores:submit", () => {
  it("records a plausible run and lifts the player's best", async () => {
    const t = backend();
    const { token } = await signUp(t, "성실이");

    const result = await t.mutation(api.scores.submit, { token, ...plausibleRun() });
    // The balance and the experience ride back with the record: this is now the
    // only thing that pays, so it has to say what it paid.
    expect(result).toMatchObject({ ok: true, best: 4000, coins: 40 });
    expect(result.xp).toBeGreaterThan(0);

    const board = await t.query(api.scores.top, {});
    expect(board[0]).toMatchObject({ rank: 1, handle: "성실이", best: 4000 });
  });

  it("keeps the higher best when a later run is worse", async () => {
    const t = backend();
    const { token } = await signUp(t, "기복있음");

    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 9000 }) });
    const worse = await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 100 }) });

    expect(worse.best).toBe(9000);
    const board = await t.query(api.scores.top, {});
    expect(board[0].best).toBe(9000);
  });

  it("refuses a distance the speed curve cannot reach", async () => {
    const t = backend();
    const { token } = await signUp(t, "순간이동");

    const result = await t.mutation(api.scores.submit, {
      token,
      ...plausibleRun({ distance: 500000, score: 100 }),
    });
    expect(result).toEqual({ ok: false, reason: "distance" });

    // A rejected run must leave nothing behind.
    expect(await t.query(api.scores.top, {})).toHaveLength(0);
    expect(await t.query(api.scores.mine, { token })).toHaveLength(0);
  });

  it("refuses a score too high for the distance run", async () => {
    const t = backend();
    const { token } = await signUp(t, "점수뻥튀기");
    const result = await t.mutation(api.scores.submit, {
      token,
      ...plausibleRun({ score: 50_000_000 }),
    });
    expect(result).toEqual({ ok: false, reason: "score" });
  });

  it("refuses a negative score", async () => {
    const t = backend();
    const { token } = await signUp(t, "마이너스");
    const result = await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: -5 }) });
    expect(result).toEqual({ ok: false, reason: "shape" });
  });
});

describe("scores:top", () => {
  it("ranks by best and gives one row per player", async () => {
    const t = backend();
    const a = await signUp(t, "일등이", "1234", "d1");
    const b = await signUp(t, "이등이", "1234", "d2");

    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 2000 }) });
    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 8000 }) });
    // A second run by the leader must not take a second row on the board.
    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 7000 }) });

    const board = await t.query(api.scores.top, {});
    expect(board.map((row) => row.handle)).toEqual(["일등이", "이등이"]);
    expect(board.map((row) => row.rank)).toEqual([1, 2]);
  });

  it("leaves players who have not scored off the board", async () => {
    const t = backend();
    await signUp(t, "구경꾼");
    expect(await t.query(api.scores.top, {})).toHaveLength(0);
  });
});

describe("scores:standing", () => {
  it("places a player below the visible board", async () => {
    const t = backend();
    const top = await signUp(t, "고수", "1234", "d1");
    const low = await signUp(t, "하수", "1234", "d2");

    await t.mutation(api.scores.submit, { token: top.token, ...plausibleRun({ score: 9000 }) });
    await t.mutation(api.scores.submit, { token: low.token, ...plausibleRun({ score: 300 }) });

    expect(await t.query(api.scores.standing, { token: low.token })).toMatchObject({
      rank: 2,
      best: 300,
    });
  });

  it("has no rank before the first run", async () => {
    const t = backend();
    const { token } = await signUp(t, "새내기");
    expect(await t.query(api.scores.standing, { token })).toMatchObject({ rank: null, best: 0 });
  });
});

// --- the staff account ------------------------------------------------------

describe("admin:createStaff", () => {
  const staff = (t, pin = "4490") =>
    t.mutation(api.admin.createStaff, { adminKey: ADMIN_KEY, handle: "admin", pin });

  it("로그인하면 관리자 키를 함께 돌려준다", async () => {
    const t = backend();
    await staff(t);

    const result = await t.mutation(api.players.signIn, { handle: "admin", pin: "4490" });
    expect(result.ok).toBe(true);
    expect(result.staff).toBe(true);
    // This is what lets the browser open the tools page without typing a key.
    expect(result.adminKey).toBe(ADMIN_KEY);
  });

  it("비밀번호가 틀리면 키를 주지 않는다", async () => {
    const t = backend();
    await staff(t);
    const result = await t.mutation(api.players.signIn, { handle: "admin", pin: "0000" });
    expect(result.ok).toBe(false);
    expect(result.adminKey).toBeUndefined();
  });

  it("보통 계정에는 키가 붙지 않는다", async () => {
    const t = backend();
    await signUp(t, "그냥학생");
    const result = await t.mutation(api.players.signIn, { handle: "그냥학생", pin: "1234" });
    expect(result.ok).toBe(true);
    expect(result.adminKey).toBeUndefined();
    expect(result.staff).toBe(false);
  });

  it("한 번 틀리면 바로 잠긴다", async () => {
    const t = backend();
    await staff(t);

    // A published nickname guarding every teacher action gets one free miss,
    // not five, and the lockout starts at five minutes.
    await t.mutation(api.players.signIn, { handle: "admin", pin: "0000" });
    await t.mutation(api.players.signIn, { handle: "admin", pin: "0001" });

    const blocked = await t.mutation(api.players.signIn, { handle: "admin", pin: "4490" });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toMatch(/초 뒤에/);
  });

  it("가입 폼으로는 만들 수 없다", async () => {
    const t = backend();
    // 「admin」 is on the reserved list, so the route the students use is closed.
    await expect(signUp(t, "admin")).rejects.toThrow();
  });

  it("리더보드에 나타나지 않는다", async () => {
    const t = backend();
    await staff(t);
    // Even if it somehow held a score, it is filtered out of the board.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("players").first();
      await ctx.db.patch(row._id, { best: 999999 });
    });
    expect(await t.query(api.scores.top, {})).toHaveLength(0);
  });

  it("이미 있으면 비밀번호만 바꾼다", async () => {
    const t = backend();
    expect(await staff(t, "4490")).toMatchObject({ created: true });
    expect(await staff(t, "1111")).toMatchObject({ created: false });

    expect((await t.mutation(api.players.signIn, { handle: "admin", pin: "1111" })).ok).toBe(true);
  });

  it("관리자 키 없이는 만들 수 없다", async () => {
    const t = backend();
    await expect(
      t.mutation(api.admin.createStaff, { adminKey: "nope", handle: "admin", pin: "4490" }),
    ).rejects.toThrow(/관리자 키/);
  });
});

// --- schools ----------------------------------------------------------------

const SCHOOL = { region: "대구", level: "중", name: "동" };

async function joinSchool(t, token, school = SCHOOL) {
  return await t.mutation(api.players.setSchool, { token, ...school });
}

describe("players:setSchool", () => {
  it("정한 학교가 프로필에 붙는다", async () => {
    const t = backend();
    const { token } = await signUp(t, "학생일");

    const result = await joinSchool(t, token);
    expect(result.schoolLabel).toBe("대구동중");
    expect(await t.query(api.players.load, { token })).toMatchObject({
      schoolLabel: "대구동중",
      school: SCHOOL,
    });
  });

  it("어떻게 쓰든 같은 학교로 모인다", async () => {
    const t = backend();
    const a = await signUp(t, "가나다", "1234", "d1");
    const b = await signUp(t, "라마바", "1234", "d2");
    const c = await signUp(t, "사아자", "1234", "d3");

    await joinSchool(t, a.token, { ...SCHOOL, name: "동" });
    await joinSchool(t, b.token, { ...SCHOOL, name: "동중" });
    await joinSchool(t, c.token, { ...SCHOOL, name: "동중학교" });

    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 100 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 200 }) });
    await t.mutation(api.scores.submit, { token: c.token, ...plausibleRun({ score: 300 }) });

    // One row, three members — not three schools with one member each.
    const board = await t.query(api.schools.top, {});
    expect(board).toEqual([
      expect.objectContaining({ rank: 1, label: "대구동중", members: 3, total: 600 }),
    ]);
  });

  it("한 번 정하면 학생은 못 바꾼다", async () => {
    const t = backend();
    const { token } = await signUp(t, "변덕쟁이");
    await joinSchool(t, token);
    await expect(joinSchool(t, token, { region: "서울", level: "중", name: "한빛" })).rejects.toThrow(
      /한 번만/,
    );
  });

  it("고른 학교급과 이름이 어긋나면 거절한다", async () => {
    const t = backend();
    const { token } = await signUp(t, "헷갈림");
    await expect(
      joinSchool(t, token, { region: "대구", level: "중", name: "계성초등학교" }),
    ).rejects.toThrow(/학교급/);
    // And nothing was stored, so they can still choose properly.
    expect((await t.query(api.players.load, { token })).school).toBe(null);
  });

  it("목록에 없는 지역을 거절한다", async () => {
    const t = backend();
    const { token } = await signUp(t, "외계인");
    await expect(joinSchool(t, token, { region: "달", level: "중", name: "토끼" })).rejects.toThrow(
      /지역/,
    );
  });
});

describe("schools:top", () => {
  it("학교 점수는 구성원 최고점의 합이다", async () => {
    const t = backend();
    const a = await signUp(t, "동중일", "1234", "d1");
    const b = await signUp(t, "동중이", "1234", "d2");
    const c = await signUp(t, "한빛일", "1234", "d3");

    await joinSchool(t, a.token);
    await joinSchool(t, b.token);
    await joinSchool(t, c.token, { region: "서울", level: "고", name: "한빛" });

    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 5000 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 3000 }) });
    await t.mutation(api.scores.submit, { token: c.token, ...plausibleRun({ score: 7000 }) });

    expect(await t.query(api.schools.top, {})).toEqual([
      expect.objectContaining({ rank: 1, label: "대구동중", total: 8000, members: 2 }),
      expect.objectContaining({ rank: 2, label: "서울한빛고", total: 7000, members: 1 }),
    ]);
  });

  it("최고점이 오른 만큼만 학교 점수가 오른다", async () => {
    const t = backend();
    const { token } = await signUp(t, "성장중");
    await joinSchool(t, token);

    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 1000 }) });
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 4000 }) });
    // A worse run must not add anything at all.
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 500 }) });

    const [row] = await t.query(api.schools.top, {});
    expect(row.total).toBe(4000);
  });

  it("학교를 정하기 전에 낸 기록도 가입할 때 함께 들어간다", async () => {
    const t = backend();
    const { token } = await signUp(t, "늦게등록");
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 2500 }) });

    await joinSchool(t, token);
    const [row] = await t.query(api.schools.top, {});
    expect(row).toMatchObject({ total: 2500, members: 1 });
  });

  it("아무도 점수를 못 낸 학교는 보이지 않는다", async () => {
    const t = backend();
    const { token } = await signUp(t, "무득점");
    await joinSchool(t, token);
    expect(await t.query(api.schools.top, {})).toHaveLength(0);
  });

  it("학교를 안 정한 사람은 어느 학교에도 안 들어간다", async () => {
    const t = backend();
    const { token } = await signUp(t, "무소속");
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 9000 }) });
    expect(await t.query(api.schools.top, {})).toHaveLength(0);
    // ...but they still rank as an individual.
    expect(await t.query(api.scores.top, {})).toHaveLength(1);
  });
});

describe("schools:standing", () => {
  it("우리 학교 순위를 알려준다", async () => {
    const t = backend();
    const a = await signUp(t, "일등학교", "1234", "d1");
    const b = await signUp(t, "이등학교", "1234", "d2");
    await joinSchool(t, a.token, { region: "서울", level: "고", name: "한빛" });
    await joinSchool(t, b.token);

    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 9000 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 400 }) });

    expect(await t.query(api.schools.standing, { token: b.token })).toMatchObject({
      rank: 2,
      label: "대구동중",
      total: 400,
    });
  });

  it("학교를 안 정했으면 아무것도 돌려주지 않는다", async () => {
    const t = backend();
    const { token } = await signUp(t, "무소속이");
    expect(await t.query(api.schools.standing, { token })).toBe(null);
  });
});

describe("admin 학교 도구", () => {
  it("잘못 고른 학교를 옮기면 점수도 따라간다", async () => {
    const t = backend();
    const { token } = await signUp(t, "잘못고름");
    await joinSchool(t, token);
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 3000 }) });

    await t.mutation(api.admin.setSchool, {
      adminKey: ADMIN_KEY,
      handle: "잘못고름",
      region: "서울",
      level: "고",
      name: "한빛",
    });

    const board = await t.query(api.schools.top, {});
    expect(board).toEqual([
      expect.objectContaining({ label: "서울한빛고", total: 3000, members: 1 }),
    ]);
  });

  it("학교를 지우면 다시 고를 수 있다", async () => {
    const t = backend();
    const { token } = await signUp(t, "다시고름");
    await joinSchool(t, token);
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 1200 }) });

    await t.mutation(api.admin.clearSchool, { adminKey: ADMIN_KEY, handle: "다시고름" });
    expect(await t.query(api.schools.top, {})).toHaveLength(0);

    await joinSchool(t, token, { region: "서울", level: "고", name: "한빛" });
    const [row] = await t.query(api.schools.top, {});
    expect(row).toMatchObject({ label: "서울한빛고", total: 1200 });
  });

  it("계정을 삭제하면 학교 점수에서도 빠진다", async () => {
    const t = backend();
    const a = await signUp(t, "남는이", "1234", "d1");
    const b = await signUp(t, "떠나는이", "1234", "d2");
    await joinSchool(t, a.token);
    await joinSchool(t, b.token);
    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 1000 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 4000 }) });

    await t.mutation(api.admin.remove, { adminKey: ADMIN_KEY, handle: "떠나는이" });

    const [row] = await t.query(api.schools.top, {});
    expect(row).toMatchObject({ total: 1000, members: 1 });
  });

  it("마지막 한 명이 나가면 학교도 사라진다", async () => {
    const t = backend();
    const { token } = await signUp(t, "마지막사람");
    await joinSchool(t, token);
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 700 }) });

    expect(await t.query(api.admin.schools, { adminKey: ADMIN_KEY })).toHaveLength(1);
    await t.mutation(api.admin.remove, { adminKey: ADMIN_KEY, handle: "마지막사람" });

    // Otherwise every deleted account leaves a 「0명 · 0점」 row behind for staff.
    expect(await t.query(api.admin.schools, { adminKey: ADMIN_KEY })).toHaveLength(0);
  });

  it("여럿 중 하나가 나가면 학교는 남는다", async () => {
    const t = backend();
    const a = await signUp(t, "남는사람", "1234", "d1");
    const b = await signUp(t, "가는사람", "1234", "d2");
    await joinSchool(t, a.token);
    await joinSchool(t, b.token);
    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 700 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 300 }) });

    await t.mutation(api.admin.remove, { adminKey: ADMIN_KEY, handle: "가는사람" });
    const [row] = await t.query(api.admin.schools, { adminKey: ADMIN_KEY });
    expect(row).toMatchObject({ members: 1, total: 700 });
  });

  it("갈라진 학교를 하나로 합친다", async () => {
    const t = backend();
    const a = await signUp(t, "오타학교", "1234", "d1");
    const b = await signUp(t, "정상학교", "1234", "d2");
    await joinSchool(t, a.token, { region: "대구", level: "중", name: "게성" });
    await joinSchool(t, b.token, { region: "대구", level: "중", name: "계성" });
    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 1500 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 2500 }) });

    const before = await t.query(api.admin.schools, { adminKey: ADMIN_KEY });
    expect(before).toHaveLength(2);
    const typo = before.find((row) => row.label.includes("게성"));
    const right = before.find((row) => row.label.includes("계성"));

    const merged = await t.mutation(api.admin.mergeSchools, {
      adminKey: ADMIN_KEY,
      fromKey: typo.key,
      toKey: right.key,
    });
    expect(merged).toMatchObject({ moved: 1, to: "대구계성중" });

    expect(await t.query(api.schools.top, {})).toEqual([
      expect.objectContaining({ label: "대구계성중", total: 4000, members: 2 }),
    ]);
    // And the moved player now reads as being at the merged school.
    expect(await t.query(api.players.load, { token: a.token })).toMatchObject({
      schoolLabel: "대구계성중",
    });
  });

  it("recompute 가 어긋난 합계를 되돌린다", async () => {
    const t = backend();
    const a = await signUp(t, "합계일", "1234", "d1");
    const b = await signUp(t, "합계이", "1234", "d2");
    await joinSchool(t, a.token);
    await joinSchool(t, b.token);
    await t.mutation(api.scores.submit, { token: a.token, ...plausibleRun({ score: 1000 }) });
    await t.mutation(api.scores.submit, { token: b.token, ...plausibleRun({ score: 2000 }) });

    // Corrupt the running total the way a bug in a delta would.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("schools").first();
      await ctx.db.patch(row._id, { total: 999999, members: 47 });
    });

    const result = await t.mutation(api.admin.recomputeSchools, { adminKey: ADMIN_KEY });
    expect(result).toMatchObject({ schools: 1 });

    const [row] = await t.query(api.schools.top, {});
    expect(row).toMatchObject({ total: 3000, members: 2 });
  });

  it("recompute 가 아무도 없는 학교를 치운다", async () => {
    const t = backend();
    // Leaving a school now deletes an empty one on the spot, so the orphan is
    // planted directly — this is the drift recompute exists to undo.
    await t.run(async (ctx) => {
      await ctx.db.insert("schools", {
        key: "대구|중|유령",
        region: "대구",
        level: "중",
        name: "유령",
        label: "대구유령중",
        members: 3,
        total: 5000,
        updatedAt: 0,
      });
    });
    expect(await t.query(api.admin.schools, { adminKey: ADMIN_KEY })).toHaveLength(1);

    const result = await t.mutation(api.admin.recomputeSchools, { adminKey: ADMIN_KEY });
    expect(result).toMatchObject({ schools: 0, removed: 1 });
    expect(await t.query(api.admin.schools, { adminKey: ADMIN_KEY })).toHaveLength(0);
  });

  it("recompute 가 갈라진 학교를 하나로 되돌린다", async () => {
    // The split that reached the live board: 대구범어초등학교 and 범어초등학교, one
    // member each. Both rows are planted the way the old rules wrote them.
    const t = backend();
    const a = await signUp(t, "범어일", "1234", "d1");
    const b = await signUp(t, "범어이", "1234", "d2");

    await t.run(async (ctx) => {
      const plant = async (handle, name, label, best) => {
        const key = `대구|초|${name}`;
        const player = await ctx.db
          .query("players")
          .withIndex("by_handleKey", (q) => q.eq("handleKey", handle))
          .unique();
        await ctx.db.patch(player._id, {
          best,
          school: { region: "대구", level: "초", name, label },
          schoolKey: key,
        });
        await ctx.db.insert("schools", {
          key,
          region: "대구",
          level: "초",
          name,
          label,
          members: 1,
          total: best,
          updatedAt: 0,
        });
      };
      await plant("범어일", "범어", "대구 범어초등학교", 13535);
      await plant("범어이", "대구범어", "대구 대구범어초등학교", 6563);
    });
    expect(await t.query(api.schools.top, {})).toHaveLength(2);

    const result = await t.mutation(api.admin.recomputeSchools, { adminKey: ADMIN_KEY });
    expect(result).toMatchObject({ schools: 1, removed: 1, moved: 2 });

    const rows = await t.query(api.schools.top, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "대구범어초", members: 2, total: 13535 + 6563 });

    // The players' own copy is rewritten too, or the next join would recreate
    // the row it was just merged out of.
    for (const session of [a, b]) {
      expect(await t.query(api.players.load, { token: session.token })).toMatchObject({
        schoolLabel: "대구범어초",
      });
    }
  });

  it("DIS 초 · 중 · 고 분리 행을 하나의 학교로 합친다", async () => {
    const t = backend();
    const a = await signUp(t, "디스초", "1234", "d1");
    const b = await signUp(t, "디스고", "1234", "d2");

    await t.run(async (ctx) => {
      const plant = async (handle, level, name, key, label, best) => {
        const player = await ctx.db
          .query("players")
          .withIndex("by_handleKey", (q) => q.eq("handleKey", handle))
          .unique();
        await ctx.db.patch(player._id, {
          best,
          school: { region: "대구", level, name, label },
          schoolKey: key,
        });
        await ctx.db.insert("schools", {
          key,
          region: "대구",
          level,
          name,
          label,
          members: 1,
          total: best,
          updatedAt: 0,
        });
      };
      await plant("디스초", "초", "국제", "대구|초|국제", "대구국제초", 1200);
      await plant("디스고", "고", "국제학교", "대구|고|국제학교", "대구국제학교", 2300);
    });

    expect(await t.query(api.admin.schools, { adminKey: ADMIN_KEY })).toHaveLength(2);
    expect(await t.query(api.schools.top, {})).toMatchObject([
      { key: "대구|DIS", label: "DIS (대구국제학교)", members: 2, total: 3500 },
    ]);
    const result = await t.mutation(api.admin.recomputeSchools, { adminKey: ADMIN_KEY });
    expect(result).toMatchObject({ schools: 1, removed: 2, moved: 2 });

    const rows = await t.query(api.admin.schools, { adminKey: ADMIN_KEY });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "대구|DIS", label: "DIS (대구국제학교)", members: 2, total: 3500 });
    expect(await t.query(api.schools.top, {})).toMatchObject([
      { key: "대구|DIS", label: "DIS (대구국제학교)", members: 2, total: 3500 },
    ]);
    expect(await t.query(api.players.load, { token: a.token })).toMatchObject({ schoolLabel: "DIS (대구국제학교)" });
    expect(await t.query(api.players.load, { token: b.token })).toMatchObject({ schoolLabel: "DIS (대구국제학교)" });
  });

  it("관리자 목록에 학교가 함께 보인다", async () => {
    const t = backend();
    const { token } = await signUp(t, "소속있음");
    await joinSchool(t, token);
    const [row] = await t.query(api.admin.list, { adminKey: ADMIN_KEY });
    expect(row.school).toBe("대구동중");
  });

  it("관리자가 Kevin을 일반부가 아닌 선생님으로 지정한다", async () => {
    const t = backend();
    const { token } = await signUp(t, "Kevin");

    const result = await t.mutation(api.admin.setSchool, {
      adminKey: ADMIN_KEY,
      handle: "Kevin",
      region: "일반",
      level: "일",
      name: "선생님",
    });
    expect(result.schoolLabel).toBe("선생님");
    expect(await t.query(api.players.load, { token })).toMatchObject({ schoolLabel: "선생님" });

    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 1200 }) });
    expect(await t.query(api.scores.top, {})).toMatchObject([{ handle: "Kevin", school: "선생님" }]);
    expect(await t.query(api.schools.top, {})).toHaveLength(0);
  });
});

describe("일반부", () => {
  const GENERAL_INPUT = { region: "", level: "일", name: "" };

  it("학생이 아니어도 소속을 정할 수 있다", async () => {
    const t = backend();
    const { token } = await signUp(t, "케빈");
    const result = await joinSchool(t, token, GENERAL_INPUT);
    expect(result.schoolLabel).toBe("일반부");
    expect(await t.query(api.players.load, { token })).toMatchObject({ schoolLabel: "일반부" });
  });

  it("학교 랭킹에는 올라가지 않는다", async () => {
    const t = backend();
    const adult = await signUp(t, "어른", "1234", "d1");
    const student = await signUp(t, "학생", "1234", "d2");
    await joinSchool(t, adult.token, GENERAL_INPUT);
    await joinSchool(t, student.token);
    await t.mutation(api.scores.submit, { token: adult.token, ...plausibleRun({ score: 9000 }) });
    await t.mutation(api.scores.submit, { token: student.token, ...plausibleRun({ score: 100 }) });

    const rows = await t.query(api.schools.top, {});
    expect(rows.map((row) => row.label)).toEqual(["대구동중"]);
    // And the school below it is still first, not second behind 일반부.
    expect(await t.query(api.schools.standing, { token: student.token })).toMatchObject({ rank: 1 });
    expect(await t.query(api.schools.standing, { token: adult.token })).toBe(null);
  });

  it("개인 랭킹에는 이름 아래 일반부로 보인다", async () => {
    const t = backend();
    const { token } = await signUp(t, "케빈");
    await joinSchool(t, token, GENERAL_INPUT);
    await t.mutation(api.scores.submit, { token, ...plausibleRun({ score: 9000 }) });
    const [row] = await t.query(api.scores.top, {});
    expect(row).toMatchObject({ handle: "케빈", school: "일반부" });
  });
});

describe("scores:top 의 소속", () => {
  it("이름 아래에 학교가 함께 온다", async () => {
    const t = backend();
    const joined = await signUp(t, "소속있음", "1234", "d1");
    const alone = await signUp(t, "소속없음", "1234", "d2");
    await joinSchool(t, joined.token);
    await t.mutation(api.scores.submit, { token: joined.token, ...plausibleRun({ score: 500 }) });
    await t.mutation(api.scores.submit, { token: alone.token, ...plausibleRun({ score: 400 }) });

    const rows = await t.query(api.scores.top, {});
    expect(rows.map((row) => [row.handle, row.school])).toEqual([
      ["소속있음", "대구동중"],
      // Nothing to show for a player who has not chosen, and no undefined.
      ["소속없음", ""],
    ]);
  });
});

// --- reporting --------------------------------------------------------------

describe("reports:report", () => {
  it("files a report an admin can then see", async () => {
    const t = backend();
    const reporter = await signUp(t, "신고자", "1234", "d1");
    await signUp(t, "나쁜놈", "1234", "d2");

    const result = await t.mutation(api.reports.report, {
      token: reporter.token,
      handle: "나쁜놈",
    });
    expect(result).toEqual({ ok: true, alreadyReported: false });

    const open = await t.query(api.admin.reports, { adminKey: ADMIN_KEY });
    expect(open).toEqual([
      expect.objectContaining({ handle: "나쁜놈", count: 1, reporters: ["신고자"] }),
    ]);
  });

  it("counts one report per reporter however many times they press it", async () => {
    const t = backend();
    const reporter = await signUp(t, "연타쟁이", "1234", "d1");
    await signUp(t, "대상자", "1234", "d2");

    await t.mutation(api.reports.report, { token: reporter.token, handle: "대상자" });
    const again = await t.mutation(api.reports.report, { token: reporter.token, handle: "대상자" });
    expect(again).toEqual({ ok: true, alreadyReported: true });

    const open = await t.query(api.admin.reports, { adminKey: ADMIN_KEY });
    expect(open[0].count).toBe(1);
  });

  it("groups separate reporters onto one row", async () => {
    const t = backend();
    const one = await signUp(t, "목격자일", "1234", "d1");
    const two = await signUp(t, "목격자이", "1234", "d2");
    await signUp(t, "지목당함", "1234", "d3");

    await t.mutation(api.reports.report, { token: one.token, handle: "지목당함" });
    await t.mutation(api.reports.report, { token: two.token, handle: "지목당함" });

    const open = await t.query(api.admin.reports, { adminKey: ADMIN_KEY });
    expect(open).toHaveLength(1);
    expect(open[0].count).toBe(2);
  });

  it("refuses a self-report and an unknown target", async () => {
    const t = backend();
    const { token } = await signUp(t, "혼자놀기");

    await expect(t.mutation(api.reports.report, { token, handle: "혼자놀기" })).rejects.toThrow(
      /자기 자신/,
    );
    await expect(t.mutation(api.reports.report, { token, handle: "유령" })).rejects.toThrow(
      /없어요/,
    );
  });

  it("refuses a report from someone not signed in", async () => {
    const t = backend();
    await signUp(t, "대상자");
    await expect(
      t.mutation(api.reports.report, { token: "not-a-token", handle: "대상자" }),
    ).rejects.toThrow(/세션/);
  });
});

// --- teacher tools ----------------------------------------------------------

describe("admin gate", () => {
  it("turns away a wrong key, a short key and an empty key", async () => {
    const t = backend();
    for (const adminKey of ["wrong", "", `${ADMIN_KEY}x`, ADMIN_KEY.replace(/.$/, "z")]) {
      await expect(t.query(api.admin.list, { adminKey })).rejects.toThrow(/관리자 키/);
    }
  });

  it("never returns a PIN or a token", async () => {
    const t = backend();
    await signUp(t, "사생활");
    const [row] = await t.query(api.admin.list, { adminKey: ADMIN_KEY });
    expect(Object.keys(row).sort()).toEqual(
      [
        "best",
        "coins",
        "createdAt",
        "failedAttempts",
        "flagged",
        "handle",
        "lockedUntil",
        "school",
      ].sort(),
    );
  });
});

describe("admin:recordRun", () => {
  /**
   * The reason this exists. A score edited into the player row led the live
   * weekly board and then vanished on Monday, because the hall is worked out
   * from the runs and there was no run behind it.
   */
  it("reaches the weekly board, the school total and the hall alike", async () => {
    const t = backend();
    const { token } = await signUp(t, "기록보정");
    await t.mutation(api.players.setSchool, {
      token,
      region: "대구",
      level: "중",
      name: "노변",
    });

    await t.mutation(api.admin.recordRun, {
      adminKey: ADMIN_KEY,
      handle: "기록보정",
      score: 260173,
    });

    const week = await t.query(api.scores.top, { range: "week" });
    expect(week[0]).toMatchObject({ handle: "기록보정", best: 260173 });

    const all = await t.query(api.scores.top, { range: "all" });
    expect(all[0]).toMatchObject({ handle: "기록보정", best: 260173 });

    const schools = await t.query(api.schools.top, {});
    expect(schools[0]).toMatchObject({ label: "대구노변중", total: 260173 });

    // And the hall, which reads the runs rather than any of the above.
    await t.mutation(api.hall.closeWeek, { adminKey: ADMIN_KEY, weeksAgo: 0, force: true });
    const [closed] = await t.query(api.hall.list, {});
    expect(closed.players[0]).toMatchObject({ handle: "기록보정", score: 260173 });
    expect(closed.schools[0]).toMatchObject({ label: "대구노변중", total: 260173 });
  });

  it("일반부도 개인 순위에는 들어간다", async () => {
    const t = backend();
    const { token } = await signUp(t, "일반부선수");
    await t.mutation(api.players.setSchool, {
      token,
      region: "일반",
      level: "일",
      name: "일반부",
    });
    await t.mutation(api.admin.recordRun, {
      adminKey: ADMIN_KEY,
      handle: "일반부선수",
      score: 90000,
    });

    const week = await t.query(api.scores.top, { range: "week" });
    expect(week[0]).toMatchObject({ handle: "일반부선수", school: "일반부" });

    await t.mutation(api.hall.closeWeek, { adminKey: ADMIN_KEY, weeksAgo: 0, force: true });
    const [closed] = await t.query(api.hall.list, {});
    // On the podium as a person, absent from the school ranking — 일반부 is an
    // affiliation, not a school, and only the second of those excludes it.
    expect(closed.players[0]).toMatchObject({ handle: "일반부선수", score: 90000 });
    expect(closed.schools).toHaveLength(0);
  });

  it("does not pay for itself", async () => {
    const t = backend();
    const { token } = await signUp(t, "무보수");
    const before = await t.query(api.players.load, { token });
    await t.mutation(api.admin.recordRun, { adminKey: ADMIN_KEY, handle: "무보수", score: 50000 });
    const after = await t.query(api.players.load, { token });
    expect(after.coins).toBe(before.coins);
  });

  it("refuses a wrong key, an unknown player and a score of zero", async () => {
    const t = backend();
    await signUp(t, "거절");
    await expect(
      t.mutation(api.admin.recordRun, { adminKey: "wrong", handle: "거절", score: 10 }),
    ).rejects.toThrow(/관리자 키/);
    await expect(
      t.mutation(api.admin.recordRun, { adminKey: ADMIN_KEY, handle: "없는사람", score: 10 }),
    ).rejects.toThrow(/닉네임/);
    await expect(
      t.mutation(api.admin.recordRun, { adminKey: ADMIN_KEY, handle: "거절", score: 0 }),
    ).rejects.toThrow(/1 이상/);
  });
});

describe("admin:rename", () => {
  it("carries the player's runs and clears the reports that prompted it", async () => {
    const t = backend();
    const reporter = await signUp(t, "신고자", "1234", "d1");
    const bad = await signUp(t, "욕쟁이", "1234", "d2");

    await t.mutation(api.scores.submit, { token: bad.token, ...plausibleRun({ score: 5000 }) });
    await t.mutation(api.reports.report, { token: reporter.token, handle: "욕쟁이" });

    const result = await t.mutation(api.admin.rename, {
      adminKey: ADMIN_KEY,
      handle: "욕쟁이",
      newHandle: "착한이",
    });
    expect(result).toMatchObject({ from: "욕쟁이", to: "착한이", runsUpdated: 1 });

    // The board reads the denormalised copy, so it has to move too.
    const board = await t.query(api.scores.top, {});
    expect(board[0]).toMatchObject({ handle: "착한이", best: 5000 });
    expect(await t.query(api.admin.reports, { adminKey: ADMIN_KEY })).toHaveLength(0);

    // Same account, still signed in.
    expect(await t.query(api.players.load, { token: bad.token })).toMatchObject({
      handle: "착한이",
      best: 5000,
    });
  });

  it("refuses a new nickname the filter rejects or someone else holds", async () => {
    const t = backend();
    await signUp(t, "본인", "1234", "d1");
    await signUp(t, "남의것", "1234", "d2");

    await expect(
      t.mutation(api.admin.rename, { adminKey: ADMIN_KEY, handle: "본인", newHandle: "시발" }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.admin.rename, { adminKey: ADMIN_KEY, handle: "본인", newHandle: "남의것" }),
    ).rejects.toThrow(/이미 쓰고/);
  });
});

describe("admin:resetPin", () => {
  it("sets the new PIN and lifts the lockout that came with the request", async () => {
    const t = backend();
    await signUp(t, "까먹음");

    for (let i = 0; i <= FREE_ATTEMPTS + 1; i++) {
      await t.mutation(api.players.signIn, { handle: "까먹음", pin: "0000" });
    }

    await t.mutation(api.admin.resetPin, {
      adminKey: ADMIN_KEY,
      handle: "까먹음",
      newPin: "4321",
    });

    const result = await t.mutation(api.players.signIn, { handle: "까먹음", pin: "4321" });
    expect(result.ok).toBe(true);
  });

  it("refuses a PIN that is not four digits", async () => {
    const t = backend();
    await signUp(t, "이상한비번");
    await expect(
      t.mutation(api.admin.resetPin, { adminKey: ADMIN_KEY, handle: "이상한비번", newPin: "abc" }),
    ).rejects.toThrow(/숫자 4자리/);
  });
});

describe("admin:unlock", () => {
  it("lifts a lockout without changing the PIN", async () => {
    const t = backend();
    await signUp(t, "잠긴이");
    for (let i = 0; i <= FREE_ATTEMPTS + 1; i++) {
      await t.mutation(api.players.signIn, { handle: "잠긴이", pin: "0000" });
    }

    await t.mutation(api.admin.unlock, { adminKey: ADMIN_KEY, handle: "잠긴이" });
    expect((await t.mutation(api.players.signIn, { handle: "잠긴이", pin: "1234" })).ok).toBe(true);
  });
});

describe("admin:remove", () => {
  it("takes the account, its runs and its reports with it", async () => {
    const t = backend();
    const reporter = await signUp(t, "신고자", "1234", "d1");
    const bad = await signUp(t, "퇴출자", "1234", "d2");

    await t.mutation(api.scores.submit, { token: bad.token, ...plausibleRun() });
    await t.mutation(api.reports.report, { token: reporter.token, handle: "퇴출자" });

    const result = await t.mutation(api.admin.remove, { adminKey: ADMIN_KEY, handle: "퇴출자" });
    expect(result).toMatchObject({ runsRemoved: 1, reportsRemoved: 1 });

    expect(await t.query(api.scores.top, {})).toHaveLength(0);
    expect(await t.query(api.admin.reports, { adminKey: ADMIN_KEY })).toHaveLength(0);
    await expect(t.query(api.players.load, { token: bad.token })).rejects.toThrow(/세션/);

    // And the nickname is free again.
    expect(await t.query(api.players.available, { handle: "퇴출자" })).toEqual({ ok: true });
  });
});

describe("admin:resolveReports", () => {
  it("clears the queue without touching the account", async () => {
    const t = backend();
    const reporter = await signUp(t, "오해한이", "1234", "d1");
    await signUp(t, "결백한이", "1234", "d2");
    await t.mutation(api.reports.report, { token: reporter.token, handle: "결백한이" });

    const result = await t.mutation(api.admin.resolveReports, {
      adminKey: ADMIN_KEY,
      handle: "결백한이",
    });
    expect(result).toMatchObject({ resolved: 1 });
    expect(await t.query(api.admin.reports, { adminKey: ADMIN_KEY })).toHaveLength(0);
    expect(await t.query(api.players.available, { handle: "결백한이" })).toMatchObject({
      ok: false,
      reason: "taken",
    });
  });
});

// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema.js";
import { api } from "../convex/_generated/api.js";
import { FREE_ATTEMPTS, MAX_ACCOUNTS_PER_DEVICE, maxDistanceIn } from "../src/leaderboard-rules.js";

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
  it("accepts the right PIN and rotates the token", async () => {
    const t = backend();
    const first = await signUp(t, "다시로그인");
    const second = await t.mutation(api.players.signIn, { handle: "다시로그인", pin: "1234" });

    expect(second.ok).toBe(true);
    expect(second.token).not.toBe(first.token);

    // The old token is dead, so a stolen one stops working at the next sign-in.
    await expect(t.query(api.players.load, { token: first.token })).rejects.toThrow(/세션/);
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

    await t.mutation(api.players.save, { token, profile: { coins: 120, runs: 4 } });
    const loaded = await t.query(api.players.load, { token });
    expect(loaded.profile).toMatchObject({ coins: 120, runs: 4 });
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
});

// --- the board --------------------------------------------------------------

describe("scores:submit", () => {
  it("records a plausible run and lifts the player's best", async () => {
    const t = backend();
    const { token } = await signUp(t, "성실이");

    const result = await t.mutation(api.scores.submit, { token, ...plausibleRun() });
    expect(result).toEqual({ ok: true, best: 4000 });

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
      ["best", "createdAt", "failedAttempts", "handle", "lockedUntil"].sort(),
    );
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

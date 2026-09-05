import { describe, expect, it } from "vitest";
import { MAX_SPEED } from "../src/config.js";
import {
  FREE_ATTEMPTS,
  LOCKOUT_BASE_SECONDS,
  LOCKOUT_MAX_SECONDS,
  MAX_ACCOUNTS_PER_DEVICE,
  MAX_RUN_SECONDS,
  REJECT_RUN,
  lockState,
  lockoutSeconds,
  maxDistanceIn,
  validateRun,
  RUNS_PER_WINDOW,
  RUN_WINDOW_MS,
  runThrottle,
} from "../src/leaderboard-rules.js";

const reasonFor = (run) => {
  const result = validateRun(run);
  return result.ok ? "ok" : result.reason;
};

/** A run that genuinely could have happened, for the given duration. */
const honestRun = (seconds) => {
  const distance = maxDistanceIn(seconds) * 0.8;
  const coins = Math.floor(distance / 6);
  return { seconds, distance, coins, score: distance * 4 + coins * 20 };
};

describe("sign-in throttling", () => {
  it("does not punish an ordinary typo", () => {
    for (let attempts = 0; attempts <= FREE_ATTEMPTS; attempts++) {
      expect(lockoutSeconds(attempts)).toBe(0);
    }
  });

  it("locks and then backs off exponentially", () => {
    expect(lockoutSeconds(FREE_ATTEMPTS + 1)).toBe(LOCKOUT_BASE_SECONDS);
    expect(lockoutSeconds(FREE_ATTEMPTS + 2)).toBe(LOCKOUT_BASE_SECONDS * 2);
    expect(lockoutSeconds(FREE_ATTEMPTS + 3)).toBe(LOCKOUT_BASE_SECONDS * 4);
  });

  it("caps the lockout so an account is never bricked", () => {
    expect(lockoutSeconds(999)).toBe(LOCKOUT_MAX_SECONDS);
  });

  it("makes exhausting a four-digit PIN take far too long to be worth it", () => {
    // 10,000 possibilities is nothing without a lockout — the leaderboard hands
    // out every valid nickname, so this is the defence that matters.
    let seconds = 0;
    for (let attempt = 1; attempt <= 10000; attempt++) seconds += lockoutSeconds(attempt);
    const years = seconds / (60 * 60 * 24 * 365);
    expect(years).toBeGreaterThan(1);
  });

  it("reports the remaining lock time", () => {
    const now = 1_000_000;
    expect(lockState({ lockedUntil: now + 5000 }, now)).toEqual({
      locked: true,
      retryInSeconds: 5,
    });
    expect(lockState({ lockedUntil: now - 1 }, now).locked).toBe(false);
    expect(lockState({}, now).locked).toBe(false);
    expect(lockState(null, now).locked).toBe(false);
  });

  it("allows a few accounts per device without inviting farming", () => {
    expect(MAX_ACCOUNTS_PER_DEVICE).toBeGreaterThan(1);
    expect(MAX_ACCOUNTS_PER_DEVICE).toBeLessThan(10);
  });
});

describe("maxDistanceIn", () => {
  it("is zero for a run that never started", () => {
    expect(maxDistanceIn(0)).toBe(0);
    expect(maxDistanceIn(-5)).toBe(0);
  });

  it("never exceeds the speed cap", () => {
    for (const seconds of [10, 60, 300, 3600]) {
      expect(maxDistanceIn(seconds)).toBeLessThanOrEqual(seconds * MAX_SPEED);
    }
  });

  it("grows with time", () => {
    let previous = 0;
    for (let t = 5; t <= 600; t += 5) {
      const distance = maxDistanceIn(t);
      expect(distance).toBeGreaterThan(previous);
      previous = distance;
    }
  });
});

describe("validateRun accepts honest runs", () => {
  it.each([20, 60, 180, 600, 1800])("a %is run", (seconds) => {
    expect(reasonFor(honestRun(seconds))).toBe("ok");
  });

  it("accepts a perfect run that hugs every ceiling", () => {
    // The bounds have to leave room for the best a real player could do.
    const seconds = 300;
    const distance = maxDistanceIn(seconds);
    const coins = Math.floor(distance / 1.35);
    const score = distance * 5.8 * 4 + coins * 30 * 4;
    expect(reasonFor({ seconds, distance, coins, score })).toBe("ok");
  });

  it("accepts a run that scored nothing", () => {
    expect(reasonFor({ seconds: 3, distance: 40, coins: 0, score: 0 })).toBe("ok");
  });
});

describe("validateRun rejects impossible runs", () => {
  it("rejects malformed numbers", () => {
    const base = honestRun(60);
    expect(reasonFor({ ...base, score: NaN })).toBe(REJECT_RUN.SHAPE);
    expect(reasonFor({ ...base, score: Infinity })).toBe(REJECT_RUN.SHAPE);
    expect(reasonFor({ ...base, distance: -1 })).toBe(REJECT_RUN.SHAPE);
    expect(reasonFor({ ...base, coins: "12" })).toBe(REJECT_RUN.SHAPE);
    expect(reasonFor(null)).toBe(REJECT_RUN.SHAPE);
  });

  it("rejects travelling further than the speed curve allows", () => {
    expect(reasonFor({ seconds: 10, distance: 100000, coins: 0, score: 0 })).toBe(
      REJECT_RUN.DISTANCE,
    );
    // Even a modest overshoot beyond the curve is not reachable.
    const seconds = 120;
    const distance = maxDistanceIn(seconds) * 2;
    expect(reasonFor({ seconds, distance, coins: 0, score: 0 })).toBe(REJECT_RUN.DISTANCE);
  });

  it("rejects more coins than the track can hold", () => {
    const base = honestRun(120);
    expect(reasonFor({ ...base, coins: base.distance * 5 })).toBe(REJECT_RUN.COINS);
  });

  it("rejects a score the run could not have produced", () => {
    const base = honestRun(120);
    expect(reasonFor({ ...base, score: 1e9 })).toBe(REJECT_RUN.SCORE);
  });

  it("rejects a run left open for days", () => {
    const seconds = MAX_RUN_SECONDS + 1;
    expect(reasonFor({ seconds, distance: 0, coins: 0, score: 0 })).toBe(REJECT_RUN.DURATION);
  });

  it("rejects a huge score claimed in no time at all", () => {
    // The classic console edit: keep the run short, set the number large.
    expect(reasonFor({ seconds: 1, distance: 20, coins: 2, score: 999999 })).toBe(
      REJECT_RUN.SCORE,
    );
  });
});

describe("runThrottle", () => {
  const now = 1_000_000;

  it("lets a first-ever run through and opens a window", () => {
    expect(runThrottle({}, now)).toEqual({
      ok: true,
      runWindowStart: now,
      runsInWindow: 1,
    });
  });

  it("tolerates a burst, which is what dying twice in a row looks like", () => {
    let player = {};
    for (let i = 1; i <= RUNS_PER_WINDOW; i++) {
      const result = runThrottle(player, now);
      expect(result.ok).toBe(true);
      expect(result.runsInWindow).toBe(i);
      player = result;
    }
  });

  it("refuses the run after the allowance is spent", () => {
    const spent = { runWindowStart: now, runsInWindow: RUNS_PER_WINDOW };
    expect(runThrottle(spent, now + 1).ok).toBe(false);
  });

  it("does not spend more of the allowance on a refused run", () => {
    const spent = { runWindowStart: now, runsInWindow: RUNS_PER_WINDOW };
    const result = runThrottle(spent, now + 1);
    expect(result.runsInWindow).toBe(RUNS_PER_WINDOW);
    expect(result.runWindowStart).toBe(now);
  });

  it("opens a fresh window once the old one has run out", () => {
    const spent = { runWindowStart: now, runsInWindow: RUNS_PER_WINDOW };
    const result = runThrottle(spent, now + RUN_WINDOW_MS);
    expect(result).toEqual({ ok: true, runWindowStart: now + RUN_WINDOW_MS, runsInWindow: 1 });
  });

  it("does not strand an account whose clock went backwards", () => {
    // A window stamped in the future is a clock problem, not a cheat, and
    // locking the player out until real time caught up would be the worse
    // answer.
    const future = { runWindowStart: now + 60_000, runsInWindow: RUNS_PER_WINDOW };
    expect(runThrottle(future, now).ok).toBe(true);
  });

  it("allows far more runs a minute than a person can play", () => {
    // The shortest run anyone submits still has to be played and dismissed.
    expect(RUNS_PER_WINDOW).toBeGreaterThanOrEqual(12);
  });
});

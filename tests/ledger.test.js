// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema.js";
import { api } from "../convex/_generated/api.js";
import { CHARACTERS } from "../src/characters.js";
import { maxDistanceIn } from "../src/leaderboard-rules.js";
import { CLIENT_COINS_PER_DAY } from "../convex/scores.js";
import { UPGRADE_COSTS } from "../src/shop.js";

const modules = import.meta.glob("../convex/**/*.*s");
const backend = () => convexTest(schema, modules);

const signUp = (t, profile = { coins: 0, best: 0 }) =>
  t.mutation(api.players.register, {
    handle: "달리기",
    pin: "1234",
    deviceId: "d1",
    profile,
  });

const NEON = CHARACTERS.find((c) => c.id === "neon");

/**
 * Earn `n` coins the only way there is: by submitting runs the server accepts.
 *
 * This used to report deltas to players:save, which paid them out on the
 * browser's word. It does not any more, which is the point of the whole
 * exercise — so the fixture has to play the game like everybody else.
 */
async function earn(t, token, n) {
  let coins = 0;
  while (coins < n) {
    const seconds = 60;
    const take = Math.min(400, n - coins);
    const run = await t.mutation(api.scores.submit, {
      token,
      score: 4000,
      distance: Math.floor(maxDistanceIn(seconds) * 0.6),
      coins: take,
      comboMax: 12,
      seconds,
      character: "runner",
    });
    expect(run.ok, `while earning ${coins}`).toBe(true);
    coins = run.coins;
  }
  return coins;
}

describe("the coin ledger", () => {
  it("lets an honest player spend what they earned", async () => {
    // The case that was permanently refused: sign up with nothing, earn a lot,
    // buy one character. Spending had grown past a ledger frozen at signup.
    const t = backend();
    const { token } = await signUp(t);
    const coins = await earn(t, token, 50000);

    const result = await t.mutation(api.players.save, {
      token,
      profile: { coins: coins - NEON.cost, earned: 50000, characters: ["runner", "neon"] },
      coinsDelta: -NEON.cost,
      coinsEarned: 0,
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("keeps letting them spend, sync after sync", async () => {
    // Spending only ever grows, so a ledger that does not grow with it fails
    // on the *next* purchase even if it survived the first.
    const t = backend();
    const { token } = await signUp(t);
    let coins = await earn(t, token, 60000);
    const owned = ["runner"];
    let spent = 0;

    for (const character of CHARACTERS.filter((c) => c.cost > 0 && c.cost <= 14000)) {
      coins -= character.cost;
      spent += character.cost;
      owned.push(character.id);
      const r = await t.mutation(api.players.save, {
        token,
        profile: { coins, earned: 60000, characters: [...owned] },
        coinsDelta: -character.cost,
        coinsEarned: 0,
      });
      expect(r.ok, `after buying ${character.id} (${spent} spent)`).toBe(true);
    }
  });

  it("still refuses a profile claiming purchases it never earned", async () => {
    const t = backend();
    const { token } = await signUp(t);
    await earn(t, token, 5000);

    // 전설 costs 30,000 and this account has been credited 5,000.
    const result = await t.mutation(api.players.save, {
      token,
      profile: { coins: 5000, earned: 5000, characters: ["runner", "legend"] },
      coinsDelta: 0,
      coinsEarned: 0,
    });
    expect(result).toEqual({ ok: false, reason: "ledger" });
  });

  it("refuses upgrade levels that were never paid for", async () => {
    const t = backend();
    const { token } = await signUp(t);
    await earn(t, token, 5000);
    const everything = UPGRADE_COSTS.slice(2).reduce((a, b) => a + b, 0) * 4;
    expect(everything).toBeGreaterThan(5000);

    const result = await t.mutation(api.players.save, {
      token,
      profile: {
        coins: 5000,
        earned: 5000,
        upgrades: { magnet: 5, jetpack: 5, double: 5, sneakers: 5 },
      },
      coinsDelta: 0,
      coinsEarned: 0,
    });
    expect(result).toEqual({ ok: false, reason: "ledger" });
  });

  it("cannot be fed more than one sync's worth of credit at a time", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const result = await t.mutation(api.players.save, {
      token,
      profile: { coins: 999999, earned: 999999, characters: ["runner", "legend"] },
      coinsDelta: 999999,
      coinsEarned: 999999,
    });
    expect(result).toEqual({ ok: false, reason: "ledger" });
  });

  it("forgives an account stuck under the old frozen ledger, exactly once", async () => {
    const t = backend();
    const { token } = await signUp(t);

    // An account as the old code left it: a ledger frozen at zero and a profile
    // holding a character it did in fact pay for.
    await t.run(async (ctx) => {
      const player = await ctx.db.query("players").first();
      await ctx.db.patch(player._id, { coinLedger: 0, flagged: true, ledgerV: undefined });
    });

    const forgiven = await t.mutation(api.players.save, {
      token,
      profile: { coins: 100, earned: 100, characters: ["runner", "neon"] },
      coinsDelta: 0,
      coinsEarned: 0,
    });
    expect(forgiven).toMatchObject({ ok: true });

    const after = await t.run(async (ctx) => await ctx.db.query("players").first());
    expect(after.flagged).toBe(false);
    // Forgiven up to what it was holding, and no further: the next unpaid
    // character is refused like any other.
    expect(after.coinLedger).toBe(NEON.cost);

    const refused = await t.mutation(api.players.save, {
      token,
      profile: { coins: 100, earned: 100, characters: ["runner", "neon", "legend"] },
      coinsDelta: 0,
      coinsEarned: 0,
    });
    expect(refused).toEqual({ ok: false, reason: "ledger" });
  });
});

describe("stating a balance outright", () => {
  it("cannot set the balance to anything it likes", async () => {
    // `coinsAbsolute` is the sign-in merge stating a total. Unbounded it was a
    // way for any client to award itself any balance at all.
    const t = backend();
    const { token } = await signUp(t);
    const result = await t.mutation(api.players.save, {
      token,
      profile: { coins: 9_000_000, earned: 9_000_000 },
      coinsAbsolute: true,
      xpAbsolute: true,
    });
    expect(result.ok).toBe(true);
    expect(result.coins).toBeLessThanOrEqual(5000);
  });

  it("still carries what a guest session legitimately earned", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const held = await earn(t, token, 4000);
    const result = await t.mutation(api.players.save, {
      token,
      profile: { coins: held + 300, earned: held + 300 },
      coinsAbsolute: true,
    });
    expect(result).toMatchObject({ ok: true, coins: held + 300 });
  });
});

describe("only a validated run pays", () => {
  const run = (over = {}) => ({
    score: 4000,
    distance: Math.floor(maxDistanceIn(60) * 0.6),
    coins: 40,
    comboMax: 12,
    seconds: 60,
    character: "runner",
    ...over,
  });

  it("credits the coins the run actually picked up", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const result = await t.mutation(api.scores.submit, { token, ...run({ coins: 137 }) });
    expect(result.coins).toBe(137);
  });

  it("pays the character's coin perk on top", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const plain = await t.mutation(api.scores.submit, { token, ...run({ coins: 100 }) });
    const perked = await t.mutation(api.scores.submit, {
      token,
      ...run({ coins: 100, character: "mono" }),
    });
    expect(perked.coins - plain.coins).toBeGreaterThan(100);
  });

  it("pays nothing at all for a run it refuses", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const impossible = await t.mutation(api.scores.submit, {
      token,
      ...run({ distance: maxDistanceIn(60) * 9, coins: 9999 }),
    });
    expect(impossible.ok).toBe(false);
    const loaded = await t.query(api.players.load, { token });
    expect(loaded.coins).toBe(0);
  });

  it("works the rank-up out itself rather than being told", async () => {
    const t = backend();
    const { token } = await signUp(t);
    // A score big enough to cross the first rank, which pays on arrival.
    const seconds = 300;
    const big = await t.mutation(api.scores.submit, {
      token,
      score: 400_000,
      distance: Math.floor(maxDistanceIn(seconds) * 0.7),
      coins: 200,
      comboMax: 40,
      seconds,
      character: "runner",
      claimedCoins: 0,
      claimedXp: 0,
    });
    expect(big.ok).toBe(true);
    // Coins beyond the 200 picked up can only have come from the rank-ups the
    // server worked out from the experience it holds.
    expect(big.coins).toBeGreaterThan(200);
  });

  it("honours the browser's mission claim, up to a day's worth", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const first = await t.mutation(api.scores.submit, {
      token,
      ...run({ coins: 0 }),
      claimedCoins: 1000,
    });
    expect(first.coins).toBe(1000);

    // Everything after the day's allowance is dropped, however often it is
    // asked for. A per-run allowance is farmed by submitting runs.
    for (let i = 0; i < 8; i++) {
      await t.mutation(api.scores.submit, { token, ...run({ coins: 0 }), claimedCoins: 5000 });
    }
    // Read off the column rather than off the balance: rank-ups are paid from
    // experience the server owns and are not part of this allowance.
    const player = await t.run(async (ctx) => await ctx.db.query("players").first());
    expect(player.payoutCoinsToday).toBe(CLIENT_COINS_PER_DAY);
  });

  it("refuses a negative or absurd claim without going backwards", async () => {
    const t = backend();
    const { token } = await signUp(t);
    const result = await t.mutation(api.scores.submit, {
      token,
      ...run({ coins: 50 }),
      claimedCoins: -999999,
      claimedXp: Number.NaN,
    });
    expect(result.coins).toBe(50);
    expect(result.xp).toBeGreaterThanOrEqual(0);
  });
});

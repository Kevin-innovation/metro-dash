import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { handleKey, validateHandle } from "../src/nickname.js";
import { GENERAL_LEVEL, TEACHER, canonicalSchool, schoolKey, schoolLabel, validateSchool, TEACHER_DISPLAY } from "../src/school.js";
import { adjustSchool, adjustSchoolWeek, ensureSchool, joinSchool, leaveSchool } from "./schools.js";
import { endAllSessions } from "./session.js";
import { weekKey, weekStart } from "../src/week.js";
import { seasonAt } from "../src/release.js";
import { bestOf } from "./players.js";

/**
 * Teacher tools.
 *
 * Gated on an ADMIN_KEY set in the Convex dashboard rather than on a player
 * account, so there is no admin login to guess and nothing in the client build
 * that grants access.
 *
 * Forced rename is the important one. The nickname filter blocks the obvious
 * cases, but no word list catches a name with characters inserted mid-word —
 * so someone has to be able to change it after the fact.
 */

function requireAdmin(adminKey) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) throw new ConvexError("서버에 ADMIN_KEY가 설정되지 않았습니다");
  // Length check first so a wrong-length guess cannot be told apart by timing.
  if (typeof adminKey !== "string" || adminKey.length !== expected.length) {
    throw new ConvexError("관리자 키가 올바르지 않습니다");
  }
  let same = 0;
  for (let i = 0; i < expected.length; i++) same |= adminKey.charCodeAt(i) ^ expected.charCodeAt(i);
  if (same !== 0) throw new ConvexError("관리자 키가 올바르지 않습니다");
}

/** Reads the balance the same way players.js does, old accounts included. */
function coinsOf(player) {
  if (typeof player.coins === "number") return Math.max(0, Math.floor(player.coins));
  const stored = Math.max(0, Math.floor(player.profile?.coins ?? 0));
  return stored + Math.max(0, Math.floor(player.pendingCoins ?? 0));
}

async function byHandle(ctx, handle) {
  return await ctx.db
    .query("players")
    .withIndex("by_handleKey", (q) => q.eq("handleKey", handleKey(handle)))
    .unique();
}

export const list = query({
  args: { adminKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { adminKey, limit }) => {
    requireAdmin(adminKey);
    const players = await ctx.db
      .query("players")
      .withIndex("by_best")
      .order("desc")
      .take(Math.min(200, Math.max(1, Math.floor(limit ?? 100))));

    // No PIN or token in the response: staff need to find an account, not to
    // sign in as one.
    //
    // The two figures the boards rank by, read the way the boards read them:
    // this week's best (the board players open first) and this season's, which
    // is zero for a best left over from an earlier season.
    const week = weekKey(Date.now());
    return players.map((player) => ({
      handle: player.handle,
      best: bestOf(player),
      weekBest: player.weekKey === week ? (player.weekBest ?? 0) : 0,
      coins: coinsOf(player),
      /** True once a save was refused for claiming more than it could earn. */
      flagged: Boolean(player.flagged),
      school: player.school ? schoolLabel(player.school) : "",
      lockedUntil: player.lockedUntil,
      failedAttempts: player.failedAttempts,
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
    }));
  },
});

/**
 * Everything the economy tab draws from, one row per student.
 *
 * Purchases are not logged anywhere, so what was bought is read off what each
 * save owns; the balance is the server's, and `ledger` is the server's own
 * running total of everything the account was ever credited. The profile
 * figures (runs, coins picked up in runs) are the browser's, which is fine for
 * a picture of the class and is labelled as such on the page.
 *
 * Reads the player table only — one document per student, not one per run — so
 * it does not grow with how much the class plays.
 */
export const economy = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === "string") : []);
    const players = await ctx.db.query("players").collect();
    return players
      .filter((player) => player.role !== "admin")
      .map((player) => {
        const profile = player.profile ?? {};
        const upgrades = {};
        for (const [id, level] of Object.entries(profile.upgrades ?? {})) upgrades[id] = count(level);
        return {
          handle: player.handle,
          school: player.school ? schoolLabel(player.school) : "",
          coins: coinsOf(player),
          ledger: typeof player.coinLedger === "number" ? count(player.coinLedger) : null,
          flagged: Boolean(player.flagged),
          runs: count(profile.runs),
          runCoins: count(profile.totalCoins),
          earned: count(profile.earned),
          character: typeof profile.character === "string" ? profile.character : "",
          characters: strings(profile.characters),
          cosmetics: strings(profile.cosmetics),
          upgrades,
          hoverboards: count(profile.hoverboards),
          antidotes: count(profile.antidotes),
          updatedAt: player.updatedAt,
        };
      });
  },
});

/**
 * Who has been around lately: the newest runs, and the accounts that saved most
 * recently. A save is written whenever a signed-in browser syncs, so its time is
 * the closest thing to a last visit the server has.
 */
export const recent = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    // Enough runs to group by player and still show each one's last few.
    const runs = await ctx.db.query("scores").order("desc").take(200);
    const seen = await ctx.db.query("players").withIndex("by_updatedAt").order("desc").take(50);
    return {
      runs: runs.map((run) => ({
        handle: run.handle,
        school: run.school ?? "",
        score: run.score,
        distance: run.distance,
        seconds: run.seconds,
        createdAt: run.createdAt,
      })),
      players: seen
        .filter((player) => player.role !== "admin")
        .map((player) => ({
          handle: player.handle,
          school: player.school ? schoolLabel(player.school) : "",
          best: bestOf(player),
          updatedAt: player.updatedAt,
        })),
    };
  },
});

export const resetPin = mutation({
  args: { adminKey: v.string(), handle: v.string(), newPin: v.string() },
  handler: async (ctx, { adminKey, handle, newPin }) => {
    requireAdmin(adminKey);
    if (!/^\d{4}$/.test(newPin)) throw new ConvexError("새 비밀번호는 숫자 4자리여야 합니다");

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Clearing the lock too, since a forgotten PIN usually arrives with one.
    await ctx.db.patch(player._id, {
      pin: newPin,
      failedAttempts: 0,
      lockedUntil: 0,
      updatedAt: Date.now(),
    });
    // Every device the account was open on is signed out. A PIN is reset either
    // because it was forgotten or because someone else knows it, and the second
    // case is not helped by leaving those sessions open.
    await endAllSessions(ctx, player._id);
    return { ok: true, handle: player.handle };
  },
});

/**
 * Give or take coins.
 *
 * Applied straight to the balance the server owns, so it is in effect the
 * moment it is run — the same thing as typing a number into the `coins` column
 * in the dashboard, which is now also a working way to do this. The ledger is
 * raised alongside, or the player's next save would be refused for holding
 * things staff had just paid for.
 */
export const grantCoins = mutation({
  args: { adminKey: v.string(), handle: v.string(), coins: v.number() },
  handler: async (ctx, { adminKey, handle, coins }) => {
    requireAdmin(adminKey);
    const amount = Math.trunc(coins);
    if (!Number.isFinite(amount) || amount === 0) throw new ConvexError("0이 아닌 정수를 입력하세요");
    if (Math.abs(amount) > 1_000_000) throw new ConvexError("한 번에 1,000,000 코인까지만 가능합니다");

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Exactly what typing a number into the dashboard's `coins` column does.
    // One mechanism, so the two cannot disagree.
    const balance = Math.max(0, coinsOf(player) + amount);
    await ctx.db.patch(player._id, {
      coins: balance,
      pendingCoins: 0,
      coinLedger: (player.coinLedger ?? 0) + Math.max(0, amount),
      updatedAt: Date.now(),
    });
    return { ok: true, handle: player.handle, coins: balance };
  },
});

/** Change an abusive nickname. Their scores follow the new name. */
export const rename = mutation({
  args: { adminKey: v.string(), handle: v.string(), newHandle: v.string() },
  handler: async (ctx, { adminKey, handle, newHandle }) => {
    requireAdmin(adminKey);

    const check = validateHandle(newHandle);
    if (!check.ok) throw new ConvexError(check.message);

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    const clash = await byHandle(ctx, check.handle);
    if (clash && clash._id !== player._id) throw new ConvexError("이미 쓰고 있는 닉네임입니다");

    await ctx.db.patch(player._id, {
      handle: check.handle,
      handleKey: handleKey(check.handle),
      updatedAt: Date.now(),
    });

    // Score rows carry a copy of the name so the board is a single read; they
    // have to be brought along or the old name stays on display.
    const runs = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    for (const run of runs) await ctx.db.patch(run._id, { handle: check.handle });

    return { ok: true, from: player.handle, to: check.handle, runsUpdated: runs.length };
  },
});

/**
 * Create or update the staff account.
 *
 * Deliberately not reachable from the sign-up form: the nickname filter
 * reserves 「admin」 and every other staff-sounding name, so this is the only
 * way such an account can exist, and it needs the admin key to run.
 *
 * Signing in with it returns the admin key to that browser, which is what opens
 * the tools page. That makes a four-digit PIN the thing standing in front of
 * every teacher action — so this account gets one free wrong guess and then
 * five-minute lockouts that double, and it is kept off the leaderboard.
 */
export const createStaff = mutation({
  args: { adminKey: v.string(), handle: v.string(), pin: v.string() },
  handler: async (ctx, { adminKey, handle, pin }) => {
    requireAdmin(adminKey);
    if (!/^\d{4}$/.test(pin)) throw new ConvexError("비밀번호는 숫자 4자리여야 합니다");

    const now = Date.now();
    const existing = await byHandle(ctx, handle);
    if (existing) {
      await ctx.db.patch(existing._id, {
        pin,
        role: "admin",
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: now,
      });
      return { ok: true, created: false, handle: existing.handle };
    }

    await ctx.db.insert("players", {
      handle,
      handleKey: handleKey(handle),
      pin,
      token: crypto.randomUUID(),
      profile: null,
      best: 0,
      role: "admin",
      // Not a real browser, so it does not consume anyone's device allowance.
      deviceId: "staff",
      failedAttempts: 0,
      lockedUntil: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, created: true, handle };
  },
});

// --- schools ----------------------------------------------------------------

/**
 * Set or move a player's school.
 *
 * Students get one choice and cannot change it, so this is where a mistyped or
 * wrongly-picked school gets fixed. Their best score moves with them, which is
 * what keeps the two rankings agreeing.
 */
export const setSchool = mutation({
  args: {
    adminKey: v.string(),
    handle: v.string(),
    region: v.string(),
    level: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { adminKey, handle, region, level, name }) => {
    requireAdmin(adminKey);
    const check =
      level === GENERAL_LEVEL && name === TEACHER.name
        ? { ok: true, school: { ...TEACHER }, label: TEACHER_DISPLAY }
        : validateSchool({ region, level, name });
    if (!check.ok) throw new ConvexError(check.message);

    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Out of the old school first, so a move between two schools cannot leave
    // the player counted in both.
    await leaveSchool(ctx, player);
    await joinSchool(ctx, { ...player, school: undefined, schoolKey: undefined }, check.school);
    return { ok: true, handle: player.handle, schoolLabel: check.label };
  },
});

/** Unset a school so the player can choose again themselves. */
export const clearSchool = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");
    await leaveSchool(ctx, player);
    return { ok: true };
  },
});

export const schools = query({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    const rows = await ctx.db.query("schools").withIndex("by_total").order("desc").take(300);
    return rows.map((row) => ({
      key: row.key,
      label: schoolLabel(row),
      region: row.region,
      level: row.level,
      name: row.name,
      members: row.members,
      total: row.total,
    }));
  },
});

/**
 * Fold one school into another.
 *
 * The form makes a split unlikely — region and level are picked from lists and
 * the suffix is normalised — but a typo in the name still produces two rows,
 * and this is the one action that puts them back together.
 */
export const mergeSchools = mutation({
  args: { adminKey: v.string(), fromKey: v.string(), toKey: v.string() },
  handler: async (ctx, { adminKey, fromKey, toKey }) => {
    requireAdmin(adminKey);
    if (fromKey === toKey) throw new ConvexError("같은 학교입니다");

    const find = async (key) =>
      await ctx.db
        .query("schools")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

    const from = await find(fromKey);
    const to = await find(toKey);
    if (!from) throw new ConvexError("합칠 학교를 찾을 수 없습니다");
    if (!to) throw new ConvexError("합쳐질 학교를 찾을 수 없습니다");

    const members = await ctx.db
      .query("players")
      .withIndex("by_school", (q) => q.eq("schoolKey", fromKey))
      .collect();

    // Carrying the label too, since it cannot be rebuilt from the parts alone.
    const school = { region: to.region, level: to.level, name: to.name, label: to.label };
    const fromLabel = schoolLabel(from);
    const toLabel = schoolLabel(to);
    for (const player of members) {
      await ctx.db.patch(player._id, { school, schoolKey: to.key });
      // The runs carry the school name too, and a closing week ranks schools
      // from those alone — left alone, the hall would split the school again.
      const runs = await ctx.db
        .query("scores")
        .withIndex("by_player", (q) => q.eq("playerId", player._id))
        .collect();
      for (const run of runs) {
        if (run.school === fromLabel) await ctx.db.patch(run._id, { school: toLabel });
      }
    }

    // The season total is the members' season bests, summed the way adjustSchool
    // reads it; the week's figures move over as they stand, or this week's
    // school board would lose everything the merged school had scored.
    const season = seasonAt();
    const week = weekKey(Date.now());
    const seasonTotal = (row) => ((row.totalSeason ?? 0) === season ? row.total : 0);
    const weekly = (row) =>
      row.weekKey === week
        ? { total: row.weekTotal ?? 0, members: row.weekMembers ?? 0 }
        : { total: 0, members: 0 };
    await ctx.db.patch(to._id, {
      members: to.members + members.length,
      totalSeason: season,
      total: seasonTotal(to) + members.reduce((sum, player) => sum + bestOf(player, season), 0),
      weekKey: week,
      weekTotal: weekly(to).total + weekly(from).total,
      weekMembers: weekly(to).members + weekly(from).members,
      updatedAt: Date.now(),
    });
    await ctx.db.delete(from._id);

    return { ok: true, moved: members.length, from: schoolLabel(from), to: schoolLabel(to) };
  },
});

/**
 * Fill in this week's column from the runs already recorded.
 *
 * The weekly board reads a stored `weekBest`, which only starts being written
 * when a run is submitted. Without this the board would open empty on the day
 * it ships even though the week is half over and the runs are all still there
 * in the scores table. Safe to run at any time: it only ever raises a figure,
 * and it reads the same week boundary the query does.
 */
export const backfillWeek = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    const now = Date.now();
    const since = weekStart(now);
    const week = weekKey(now);

    const best = new Map();
    for await (const run of ctx.db.query("scores")) {
      if (run.createdAt < since) continue;
      const id = String(run.playerId);
      if (run.score > (best.get(id)?.score ?? 0)) best.set(id, { id: run.playerId, score: run.score });
    }

    let updated = 0;
    /** This week's totals per school, rebuilt from the same bests. */
    const bySchool = new Map();
    for (const { id, score } of best.values()) {
      const player = await ctx.db.get(id);
      if (!player) continue;
      const current = player.weekKey === week ? (player.weekBest ?? 0) : 0;
      if (score > current) {
        await ctx.db.patch(id, { weekKey: week, weekBest: score });
        updated += 1;
      }
      const top = Math.max(score, current);
      if (player.schoolKey && top > 0) {
        const held = bySchool.get(player.schoolKey) ?? { total: 0, members: 0 };
        held.total += top;
        held.members += 1;
        bySchool.set(player.schoolKey, held);
      }
    }

    // Written wholesale rather than by delta: this is the rebuild, and a school
    // whose members did not play this week is left with nothing for it.
    let schools = 0;
    for await (const row of ctx.db.query("schools")) {
      const held = bySchool.get(row.key) ?? { total: 0, members: 0 };
      await ctx.db.patch(row._id, {
        weekKey: week,
        weekTotal: held.total,
        weekMembers: held.members,
      });
      schools += 1;
    }

    // Seed the experience column on accounts that have not saved since it
    // existed, so the ladder shows more than whoever played today.
    //
    // Only where it is absent. It used to overwrite from the profile every time
    // this ran, which was right while the column was a mirror and is wrong now
    // that the column is the truth — a correction typed in by staff, or
    // experience earned on a phone that a stale desktop has not seen, would be
    // undone by running a repair tool that has nothing to do with either.
    let levelled = 0;
    for await (const player of ctx.db.query("players")) {
      if (typeof player.xp === "number") continue;
      const stored = player.profile?.xp ?? 0;
      const xp = Number.isFinite(stored) ? Math.max(0, Math.floor(stored)) : 0;
      await ctx.db.patch(player._id, { xp });
      levelled += 1;
    }

    return { ok: true, week, players: updated, schools, levelled };
  },
});

/**
 * Record a score as a run.
 *
 * The way to change what a player has scored. Editing `best` in the dashboard
 * moves one number and leaves everything derived from runs behind it: the
 * weekly board reads `weekBest`, the school boards read running totals, and the
 * hall of fame is worked out from the `scores` table — so a hand-edited figure
 * led the live board on Sunday and vanished from the hall on Monday.
 *
 * This writes the run first and lets everything else follow it, which is the
 * same path a real run takes. What it deliberately does not do is pay: the coin
 * ledger is untouched, because a correction is not an afternoon of playing.
 *
 * `at` records the run into a past week — for a week whose hall needs fixing,
 * which can then be closed again with hall:closeWeek.
 */
export const recordRun = mutation({
  args: {
    adminKey: v.string(),
    handle: v.string(),
    score: v.number(),
    at: v.optional(v.number()),
  },
  handler: async (ctx, { adminKey, handle, score: raw, at }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    const score = Math.floor(Number(raw));
    if (!Number.isFinite(score) || score <= 0) throw new ConvexError("점수는 1 이상이어야 합니다");

    const now = Date.now();
    const when = Number.isFinite(at) ? Math.floor(at) : now;
    if (when > now) throw new ConvexError("미래의 기록은 넣을 수 없습니다");

    // The run itself. The shape of a real one, with the fields a staff entry
    // cannot honestly claim left at zero — nothing reads them but the run
    // detail, and inventing a distance to go with the score would be a lie the
    // fairness audit would later have to explain.
    await ctx.db.insert("scores", {
      playerId: player._id,
      handle: player.handle,
      school: player.school ? schoolLabel(player.school) : "",
      score,
      distance: 0,
      coins: 0,
      comboMax: 0,
      seconds: 0,
      character: "staff",
      createdAt: when,
    });

    const week = weekKey(when);
    const thisWeek = week === weekKey(now);
    const weekBest = player.weekKey === week ? (player.weekBest ?? 0) : 0;

    // The record is a season's record; see bestOf. A run backfilled from an
    // older season must not land on this season's card, and one recorded now
    // has to carry the season with it or the next read will discard it.
    const season = seasonAt(when);
    const seasonBest = bestOf(player, season);
    const thisSeason = season === seasonAt(now);

    const patch = { updatedAt: now };
    if (thisSeason && (score > seasonBest || (player.bestSeason ?? seasonAt(0)) !== season)) {
      patch.best = Math.max(score, seasonBest);
      patch.bestSeason = season;
    }
    // Only when the run lands in the week the player's stored figures are for.
    // A run backfilled into March must not present itself as this week's best;
    // the hall reads that week from the runs and will find it there.
    if (thisWeek && (score > weekBest || player.weekKey !== week)) {
      patch.weekKey = week;
      patch.weekBest = Math.max(score, weekBest);
    }
    await ctx.db.patch(player._id, patch);

    // The same deltas scores:submit moves, so the school boards stay in step
    // without a rebuild.
    if (thisSeason && score > seasonBest) {
      await adjustSchool(ctx, player.schoolKey, { total: score - seasonBest, season });
    }
    if (thisWeek && score > weekBest) {
      await adjustSchoolWeek(ctx, player.schoolKey, week, {
        total: score - weekBest,
        newMember: weekBest === 0,
      });
    }

    return {
      ok: true,
      handle: player.handle,
      score,
      best: Math.max(score, player.best),
      weekBest: thisWeek ? Math.max(score, weekBest) : weekBest,
      week,
      thisWeek,
    };
  },
});

/**
 * Rebuild every school total from the players.
 *
 * The totals are maintained by deltas, which is fast but can only ever be as
 * right as the code that moves them. This is the way back to the truth if they
 * ever drift, and it is safe to run at any time.
 */
export const recomputeSchools = mutation({
  args: { adminKey: v.string() },
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);

    const tally = new Map();
    for await (const player of ctx.db.query("players")) {
      if (!player.school) continue;
      // Put through the current rules rather than read as stored, so a name
      // written under older ones is corrected: 「대구범어」 and 「범어」 are the same
      // school and have to land on the same key before they are counted, or the
      // rebuild would faithfully reproduce the split it exists to fix.
      const school = canonicalSchool(player.school);
      const key = schoolKey(school);
      const entry = tally.get(key) ?? { school, members: 0, total: 0, ids: [] };
      entry.members += 1;
      // This season's best only, the same figure every delta moves the total by.
      entry.total += bestOf(player);
      entry.ids.push(player._id);
      tally.set(key, entry);
    }

    let moved = 0;
    for (const [key, entry] of tally) {
      const row = await ensureSchool(ctx, entry.school);
      await ctx.db.patch(row._id, {
        // The name and the label are rewritten too: a row created before the
        // rules changed keeps its old spelling until something replaces it.
        name: entry.school.name,
        label: entry.school.label,
        members: entry.members,
        totalSeason: seasonAt(),
        total: entry.total,
        updatedAt: Date.now(),
      });
      for (const id of entry.ids) {
        const player = await ctx.db.get(id);
        if (player.schoolKey === key && player.school?.label === entry.school.label) continue;
        await ctx.db.patch(id, { school: entry.school, schoolKey: key });
        moved += 1;
      }
    }

    // Schools nobody is in any more go away rather than sitting at zero.
    let removed = 0;
    for await (const row of ctx.db.query("schools")) {
      if (!tally.has(row.key)) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    return { ok: true, schools: tally.size, removed, moved };
  },
});

/** Lift a lockout without changing the PIN. */
export const unlock = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");
    await ctx.db.patch(player._id, { failedAttempts: 0, lockedUntil: 0 });
    return { ok: true };
  },
});

/** Remove an account and every run it recorded. */
export const remove = mutation({
  args: { adminKey: v.string(), handle: v.string() },
  handler: async (ctx, { adminKey, handle }) => {
    requireAdmin(adminKey);
    const player = await byHandle(ctx, handle);
    if (!player) throw new ConvexError("그런 닉네임이 없습니다");

    // Out of their school first, while their best score is still there to
    // subtract — afterwards there would be nothing left to take out.
    await leaveSchool(ctx, player);

    const runs = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    for (const run of runs) await ctx.db.delete(run._id);

    const filed = await ctx.db
      .query("reports")
      .withIndex("by_target", (q) => q.eq("targetId", player._id))
      .collect();
    for (const row of filed) await ctx.db.delete(row._id);

    // Their signed-in devices go too, or the rows would point at a player that
    // no longer exists and a stale browser would ask about it forever.
    await endAllSessions(ctx, player._id);

    await ctx.db.delete(player._id);
    return { ok: true, runsRemoved: runs.length, reportsRemoved: filed.length };
  },
});

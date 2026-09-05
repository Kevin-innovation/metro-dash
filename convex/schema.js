import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Two tables: who is playing, and what they scored.
 *
 * Accounts are a nickname and a four-digit PIN — no name, no email — so the
 * service holds nothing about a student beyond what the leaderboard shows.
 */
export default defineSchema({
  players: defineTable({
    /** Display name, exactly as the player typed it. */
    handle: v.string(),
    /** Folded form of the handle. Uniqueness and lookups go through this. */
    handleKey: v.string(),
    /** Four-digit PIN, stored as given: see the note in players.js. */
    pin: v.string(),
    /** Rotated on every sign-in; the client sends it back to prove who it is. */
    token: v.string(),

    /** The whole save file — coins, upgrades, missions, rank, characters. */
    profile: v.any(),
    best: v.number(),

    /**
     * Best score inside one week, and which week that was.
     *
     * Kept beside the all-time figure rather than derived from the runs table:
     * the weekly board is read far more often than it is written, and a stored
     * column makes it the same single indexed read the all-time board already
     * is. Absent until the account's first run under the weekly board.
     */
    weekBest: v.optional(v.number()),
    weekKey: v.optional(v.string()),

    /**
     * Ceiling on what this account's save may be worth in coins.
     *
     * The profile is written by the browser, so coins, upgrades and characters
     * arrive on trust. This is the one number the server owns: it starts at
     * whatever the account already had and afterwards only grows by what a
     * validated run could have paid out. A save worth more than this did not
     * come from playing. Absent on accounts that have not saved since.
     */
    coinLedger: v.optional(v.number()),
    /**
     * Which meaning `coinLedger` was last written under.
     *
     * Absent or behind means the number in it came from the version that froze
     * it at signup, and the account is re-seeded once on its next save. See
     * LEDGER_VERSION in players.js.
     */
    ledgerV: v.optional(v.number()),
    /**
     * The day the browser's own payouts were last counted, and how much of
     * that day's allowance has gone.
     *
     * Missions and the streak are worked out in the browser, so what they pay
     * is a claim. It is honoured up to what a day can actually pay and no
     * further — per day rather than per run, because a per-run allowance is
     * farmed by submitting runs and a day's missions finish once.
     */
    payoutDay: v.optional(v.number()),
    payoutCoinsToday: v.optional(v.number()),
    payoutXpToday: v.optional(v.number()),

    /**
     * How many runs this account has banked in the current window, and when
     * that window opened.
     *
     * `scores:submit` is the only mutation that pays anything and it had no
     * throttle at all, so a loop calling it was bounded by nothing but how fast
     * the network answered. See RUNS_PER_WINDOW for why this is a burst
     * allowance rather than a minimum gap between two runs.
     */
    runWindowStart: v.optional(v.number()),
    runsInWindow: v.optional(v.number()),

    /** Set when a save was refused for exceeding the ledger, for staff to see. */
    flagged: v.optional(v.boolean()),

    /**
     * The coin balance, owned by the server.
     *
     * It used to live inside `profile`, which the browser owns and rewrites in
     * full after every run — so a number changed on the server was gone within
     * one game, and staff had no way to correct a balance at all. Out here it
     * is a field like any other: readable in the dashboard, editable in the
     * dashboard, and what the client is told to use.
     *
     * The client no longer sends a balance. It sends what changed since its
     * last sync and is handed the new total back, so a value typed in here
     * survives, two devices cannot overwrite each other's earnings, and a
     * browser that was offline all afternoon still lands its coins correctly.
     *
     * Absent on accounts that have not synced since; the first sync fills it
     * from the profile they already had.
     */
    coins: v.optional(v.number()),
    /** Superseded by `coins`; folded in and cleared on the next sync. */
    pendingCoins: v.optional(v.number()),

    /**
     * The account's experience, owned by the server.
     *
     * It used to be mirrored from the profile on every save, on the reasoning
     * that a client overstating it costs only a wrong badge. What that missed
     * was the other direction. A device that had not played since Tuesday
     * pushed Tuesday's figure up on its next page load — not on a run, on
     * merely being opened — and the rank went *backwards*. A correction typed
     * into the dashboard lasted until the player next opened the game.
     *
     * So it works like `coins` now: the client reports what it earned since it
     * last synced and is handed the total back. Absent on accounts that have
     * not synced since; the first sync fills it from the profile they had.
     */
    xp: v.optional(v.number()),

    /**
     * School, chosen at most once by the player and thereafter only by staff.
     * Absent on every account created before schools existed, and on anyone who
     * has not picked one — those players simply sit outside the school ranking.
     */
    school: v.optional(
      v.object({
        region: v.string(),
        level: v.string(),
        name: v.string(),
        /** Display form, decided at validation time. Optional for older rows. */
        label: v.optional(v.string()),
      }),
    ),
    schoolKey: v.optional(v.string()),

    /**
     * "admin" on the staff account, absent on everyone else.
     *
     * Set only by `admin:createStaff`, never by registration — the nickname
     * filter reserves the obvious staff names, so no player can reach this.
     */
    role: v.optional(v.string()),

    /** Which browser created the account, used only to cap account farming. */
    deviceId: v.string(),

    /** Sign-in throttling. Reset the moment a correct PIN arrives. */
    failedAttempts: v.number(),
    lockedUntil: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_handleKey", ["handleKey"])
    .index("by_token", ["token"])
    .index("by_device", ["deviceId"])
    .index("by_best", ["best"])
    .index("by_xp", ["xp"])
    // Equality on the week first, so the weekly board is one indexed read and
    // last week's leaders are not merely filtered out but never looked at.
    .index("by_week_best", ["weekKey", "weekBest"])
    .index("by_school", ["schoolKey"])
    // Not read by any query — it exists so the dashboard can offer it. The
    // data view sorts by index and by nothing else, so without one here there
    // is no way to ask 「누가 최근에 플레이했나」, and by_creation_time answers a
    // different question: when the account was made, not when it was last used.
    .index("by_updatedAt", ["updatedAt"]),

  /**
   * School standings, kept as a running total rather than computed on read.
   *
   * The obvious version — add up every player's best when the board is opened —
   * would have to read every player document, and a player document carries the
   * whole save file. A few hundred accounts would blow the query's read limit.
   * So the total moves by deltas, and `admin:recomputeSchools` exists to rebuild
   * it from the players if the two ever disagree.
   */
  schools: defineTable({
    key: v.string(),
    region: v.string(),
    level: v.string(),
    name: v.string(),
    /** Rendered once at write time so the board is a single read. */
    label: v.string(),
    members: v.number(),
    /** Sum of every member's best score. */
    total: v.number(),

    /**
     * The same sum, but of this week's bests.
     *
     * Kept by deltas beside the all-time figure for the same reason that one
     * is: adding up the members on read would mean loading a save file per
     * member. Stale rows are read as zero rather than swept — a school that
     * has not played since Monday simply is not in this week's ranking.
     */
    weekTotal: v.optional(v.number()),
    weekMembers: v.optional(v.number()),
    weekKey: v.optional(v.string()),

    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_total", ["total"])
    .index("by_week_total", ["weekKey", "weekTotal"]),

  /**
   * Signed-in devices, one row each.
   *
   * The token used to live on the player document, which meant an account had
   * exactly one of them: signing in on a phone rotated the token the desktop
   * was holding, and the desktop was silently signed out the next time it
   * asked for anything. A row per device is what lets both stay signed in.
   *
   * Tokens issued before this table existed still work — see `requirePlayer`.
   */
  sessions: defineTable({
    playerId: v.id("players"),
    /** Bearer token held by that one browser. */
    token: v.string(),
    /** Which browser it was issued to, so a re-login replaces its own row. */
    deviceId: v.string(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_player", ["playerId"])
    .index("by_player_device", ["playerId", "deviceId"]),

  /**
   * Nickname reports.
   *
   * The word list cannot catch a name with characters inserted mid-word, so the
   * players who can see the board are the ones who will spot those. One report
   * per reporter per target, so a group cannot pile onto someone.
   */
  reports: defineTable({
    targetId: v.id("players"),
    targetHandle: v.string(),
    reporterId: v.id("players"),
    reporterHandle: v.string(),
    status: v.string(),
    createdAt: v.number(),
  })
    .index("by_target", ["targetId"])
    .index("by_reporter_target", ["reporterId", "targetId"])
    .index("by_status", ["status", "createdAt"]),

  /**
   * Closed weeks, kept for good.
   *
   * A weekly board is only worth chasing if winning it leaves something
   * behind; otherwise Monday erases the week and the person who topped it has
   * nothing to show. One row per week, written once when the week ends.
   */
  halls: defineTable({
    weekKey: v.string(),
    /** 「8월 3주차」 — what the week is called to a player. */
    label: v.string(),
    startedAt: v.number(),
    closedAt: v.number(),
    /** Top three of each board, in order. */
    players: v.array(
      v.object({ rank: v.number(), handle: v.string(), score: v.number(), school: v.string() }),
    ),
    schools: v.array(
      v.object({ rank: v.number(), label: v.string(), total: v.number(), members: v.number() }),
    ),
  }).index("by_week", ["weekKey"]),

  scores: defineTable({
    playerId: v.id("players"),
    /** Denormalised so the leaderboard is a single read. */
    handle: v.string(),
    /**
     * The school at the time of the run, denormalised for the same reason the
     * nickname is: closing a week has to rank schools from these rows alone,
     * and reading a player document per run would mean loading a save file per
     * run to find out where they go.
     */
    school: v.optional(v.string()),
    score: v.number(),
    distance: v.number(),
    coins: v.number(),
    comboMax: v.number(),
    seconds: v.number(),
    character: v.string(),
    createdAt: v.number(),
  })
    .index("by_score", ["score"])
    .index("by_player", ["playerId"]),
});

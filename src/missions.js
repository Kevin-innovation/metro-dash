/**
 * The day's missions. Three, dealt at midnight, gone at the next midnight.
 *
 * They used to be replaced the instant one was finished, which meant there was
 * never a set to finish — just an endless queue, and no answer to "what am I
 * doing today". The title screen has always called them 「오늘의 미션」; this is
 * that promise kept. Clearing all three pays a bonus, so a day has a shape:
 * open the game, see three things, do them, and the run counter looks after
 * itself.
 *
 * `metric` names a counter the run reports (see Game#trackMission).
 */
/** Difficulty steps every mission is written for. */
export const MISSION_TIERS = 7;

/**
 * Mission table.
 *
 * `metric` names a counter the run reports. `scope: "run"` metrics are read as
 * the best single run and are idempotent; `scope: "total"` metrics accumulate
 * across runs and are reported as deltas.
 *
 * Every entry carries one target per difficulty step, so the same mission grows
 * with the player instead of being retired.
 */
export const MISSION_DEFS = [
  // --- single-run goals ---------------------------------------------------
  { id: "coins-run", metric: "coins", scope: "run",
    targets: [15, 25, 40, 60, 85, 115, 150], label: "한 판에 코인 {t}개 모으기", coins: 110, xp: 85 },
  { id: "distance-run", metric: "distance", scope: "run",
    targets: [500, 900, 1400, 2000, 2800, 3800, 5000], label: "한 판에 {t}m 달리기", coins: 140, xp: 110 },
  { id: "combo-run", metric: "comboMax", scope: "run",
    targets: [8, 14, 22, 32, 45, 60, 80], label: "콤보 {t} 달성하기", coins: 130, xp: 105 },
  { id: "score-run", metric: "score", scope: "run",
    targets: [3000, 6000, 10000, 16000, 24000, 35000, 50000], label: "한 판에 {t}점 얻기", coins: 190, xp: 150 },
  { id: "nearmiss-run", metric: "nearMissesRun", scope: "run",
    targets: [8, 15, 25, 38, 55, 75, 100], label: "한 판에 아슬아슬 {t}번 스치기", coins: 160, xp: 125 },
  { id: "mounts-run", metric: "mountsRun", scope: "run",
    targets: [3, 6, 10, 15, 21, 28, 36], label: "한 판에 지붕 {t}번 올라타기", coins: 140, xp: 110 },
  { id: "powerups-run", metric: "powerupsRun", scope: "run",
    targets: [2, 4, 6, 9, 12, 16, 20], label: "한 판에 파워업 {t}개 먹기", coins: 130, xp: 100 },
  { id: "survive-run", metric: "seconds", scope: "run",
    targets: [45, 75, 110, 150, 200, 260, 330], label: "한 판에 {t}초 버티기", coins: 170, xp: 135 },
  { id: "roof-run", metric: "roofDistance", scope: "run",
    targets: [40, 80, 140, 210, 300, 400, 520], label: "한 판에 지붕 위로 {t}m 달리기", coins: 165, xp: 130 },
  { id: "gates-run", metric: "gatesRun", scope: "run",
    targets: [4, 8, 14, 21, 30, 40, 52], label: "한 판에 게이트 {t}개 슬라이드로 통과", coins: 150, xp: 120 },

  // --- career goals -------------------------------------------------------
  { id: "mounts-total", metric: "mounts", scope: "total",
    targets: [10, 25, 50, 90, 150, 230, 340], label: "지붕에 {t}번 올라타기", coins: 130, xp: 100 },
  { id: "nearmiss-total", metric: "nearMisses", scope: "total",
    targets: [15, 40, 80, 140, 230, 350, 500], label: "아슬아슬하게 {t}번 스치기", coins: 155, xp: 125 },
  { id: "powerups-total", metric: "powerups", scope: "total",
    targets: [8, 20, 40, 70, 110, 165, 240], label: "파워업 {t}개 사용하기", coins: 120, xp: 95 },
  { id: "jetpack-total", metric: "jetpacks", scope: "total",
    targets: [3, 8, 16, 28, 45, 68, 100], label: "제트팩 {t}번 타기", coins: 175, xp: 140 },
  { id: "magnet-total", metric: "magnets", scope: "total",
    targets: [4, 10, 20, 35, 55, 82, 120], label: "자석 {t}번 사용하기", coins: 115, xp: 90 },
  { id: "double-total", metric: "doubles", scope: "total",
    targets: [4, 10, 20, 35, 55, 82, 120], label: "점수 2배 {t}번 사용하기", coins: 125, xp: 100 },
  { id: "sneakers-total", metric: "sneakers", scope: "total",
    targets: [4, 10, 20, 35, 55, 82, 120], label: "슈퍼 스니커즈 {t}번 사용하기", coins: 120, xp: 95 },
  { id: "board-total", metric: "boards", scope: "total",
    targets: [2, 5, 10, 18, 28, 42, 60], label: "호버보드 {t}번 꺼내기", coins: 180, xp: 145 },
  { id: "gates-total", metric: "gates", scope: "total",
    targets: [15, 40, 80, 140, 230, 350, 500], label: "게이트 {t}개 슬라이드로 통과", coins: 145, xp: 115 },
  { id: "coins-total", metric: "coinsTotal", scope: "total",
    targets: [200, 500, 1000, 1800, 3000, 4800, 7500], label: "코인 {t}개 모으기", coins: 200, xp: 160 },
];

export const MISSION_SLOTS = 3;

/**
 * Paid for clearing all three in a day, before the difficulty step is applied.
 *
 * Twice the largest single mission on purpose: the third one is the one people
 * give up on, and it should be the one they come back for.
 */
export const DAILY_BONUS = { coins: 400, xp: 300 };

/**
 * What clearing the set actually pays at a difficulty step.
 *
 * Scaled by the same step the missions are, and for the same reason. Flat, it
 * was a quiet penalty for levelling: the targets grew, every mission's payout
 * grew with them, and this one number stayed where it was. By Lv.5 the reward
 * for finishing all three was worth less than one of the three; by Lv.7 nine of
 * the twenty missions each paid more on their own than the set did. The comment
 * above said what it was for the whole time — it just stopped being true after
 * the fourth rank.
 */
export function dailyBonus(tier = 0) {
  const step = tierStep(tier);
  return {
    coins: Math.round(DAILY_BONUS.coins * step),
    xp: Math.round(DAILY_BONUS.xp * step),
  };
}

/** True once every mission in the day's set is done. */
export function allCleared(missions) {
  const list = missions ?? [];
  return list.length >= MISSION_SLOTS && list.every(isComplete);
}

/** How many of the day's set are finished, for the counter on the title card. */
export function clearedCount(missions) {
  return (missions ?? []).filter(isComplete).length;
}

export function missionDef(id) {
  return MISSION_DEFS.find((def) => def.id === id) ?? null;
}

export function missionLabel(mission) {
  const def = missionDef(mission.id);
  if (!def) return "";
  return def.label.replace("{t}", mission.target.toLocaleString());
}

/**
 * `scope: "run"` metrics reset every run and track the best single run;
 * `scope: "total"` metrics accumulate across runs.
 */
export function missionScope(id) {
  return missionDef(id)?.scope ?? "total";
}

function makeMission(def, tier) {
  const index = Math.min(def.targets.length - 1, Math.max(0, tier));
  return { id: def.id, target: def.targets[index], progress: 0 };
}

/**
 * Deal `count` missions, avoiding ids already in play. `random` is injected so
 * tests get deterministic rolls.
 */
export function rollMissions(exclude = [], count = MISSION_SLOTS, tier = 0, random = Math.random) {
  const taken = new Set(exclude);
  const pool = MISSION_DEFS.filter((def) => !taken.has(def.id));
  const chosen = [];

  // Fall back to repeats only if the pool genuinely runs dry.
  const source = pool.length >= count ? pool.slice() : MISSION_DEFS.slice();
  while (chosen.length < count && source.length > 0) {
    const index = Math.floor(random() * source.length) % source.length;
    const [def] = source.splice(index, 1);
    chosen.push(makeMission(def, tier));
  }
  return chosen;
}

/** Top up a mission list to MISSION_SLOTS without disturbing existing entries. */
export function ensureMissions(missions, tier = 0, random = Math.random) {
  const valid = (missions ?? []).filter((m) => missionDef(m.id));
  if (valid.length >= MISSION_SLOTS) return valid.slice(0, MISSION_SLOTS);
  const extra = rollMissions(
    valid.map((m) => m.id),
    MISSION_SLOTS - valid.length,
    tier,
    random,
  );
  return [...valid, ...extra];
}

export function isComplete(mission) {
  return mission.progress >= mission.target;
}

/**
 * Fold a batch of metric readings into the active missions.
 *
 * @param {Array} missions active missions (not mutated)
 * @param {Record<string, number>} metrics
 * @returns {{ missions: Array, completed: Array }}
 */
export function applyMetrics(missions, metrics) {
  const completed = [];
  const next = missions.map((mission) => {
    const def = missionDef(mission.id);
    if (!def || isComplete(mission)) return mission;

    const reading = metrics[def.metric];
    if (typeof reading !== "number" || Number.isNaN(reading)) return mission;

    // Run-scoped missions look at the best single run, cumulative ones add up.
    const progress =
      def.scope === "run"
        ? Math.max(mission.progress, Math.floor(reading))
        : mission.progress + Math.max(0, Math.floor(reading));

    const updated = { ...mission, progress: Math.min(mission.target, progress) };
    if (isComplete(updated) && !isComplete(mission)) completed.push({ ...updated, def });
    return updated;
  });

  return { missions: next, completed };
}

/**
 * How much a mission pays at a given difficulty step.
 *
 * Levelling up used to be a straight penalty: the targets grew with the rank
 * and the payout did not, so a Lv.7 player was asked for a 60 combo and paid
 * exactly what a Lv.1 player got for an 8. The reward now grows with the step
 * that set the target.
 */
export function missionPay(def, tier) {
  const step = tierStep(tier);
  return { coins: Math.round(def.coins * step), xp: Math.round(def.xp * step) };
}

/**
 * How much a payout grows at a difficulty step.
 *
 * One function rather than a number written out wherever it is needed — the
 * all-clear bonus was left behind exactly once, and once was enough.
 */
export function tierStep(tier) {
  return 1 + Math.max(0, Math.min(MISSION_TIERS - 1, tier)) * 0.28;
}

/**
 * The step a mission was actually dealt at, read back from its target.
 *
 * The target is the only record of it — the tier itself is not stored — and it
 * is exactly what the mission card on the title screen reads to work out the
 * payout it prints.
 */
export function dealtTier(entry) {
  const index = entry?.def?.targets?.indexOf(entry.target) ?? -1;
  return index < 0 ? 0 : index;
}

/**
 * What a finished set pays.
 *
 * Each mission pays at the step *it* was dealt at, not at the player's step
 * now. Those are the same number all day for most people and diverge the moment
 * anyone levels up mid-set — and when they diverged, the card said 110 coins
 * and the bank paid 264. It also made holding an easy mission until after a
 * level-up the best-paying thing a player could do with it.
 */
export function missionReward(completedList) {
  return completedList.reduce(
    (acc, entry) => {
      const pay = missionPay(entry.def, dealtTier(entry));
      return { coins: acc.coins + pay.coins, xp: acc.xp + pay.xp };
    },
    { coins: 0, xp: 0 },
  );
}

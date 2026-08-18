/**
 * Rolling missions. Three are active at any time; finishing one banks its
 * reward and immediately deals a replacement, so there is always something to
 * chase beyond the score itself.
 *
 * `metric` names a counter the run reports (see Game#trackMission).
 */
export const MISSION_DEFS = [
  { id: "coins-run", metric: "coins", scope: "run", targets: [20, 35, 60], label: "한 판에 코인 {t}개 모으기", coins: 120, xp: 90 },
  { id: "distance-run", metric: "distance", scope: "run", targets: [600, 1200, 2000], label: "한 판에 {t}m 달리기", coins: 150, xp: 120 },
  { id: "combo-run", metric: "comboMax", scope: "run", targets: [10, 20, 35], label: "콤보 {t} 달성하기", coins: 140, xp: 110 },
  { id: "mounts-total", metric: "mounts", scope: "total", targets: [10, 25, 50], label: "지붕에 {t}번 올라타기", coins: 130, xp: 100 },
  { id: "nearmiss-total", metric: "nearMisses", scope: "total", targets: [15, 40, 80], label: "아슬아슬하게 {t}번 스치기", coins: 160, xp: 130 },
  { id: "powerups-total", metric: "powerups", scope: "total", targets: [8, 20, 40], label: "파워업 {t}개 사용하기", coins: 120, xp: 95 },
  { id: "jetpack-total", metric: "jetpacks", scope: "total", targets: [3, 8, 15], label: "제트팩 {t}번 타기", coins: 180, xp: 140 },
  { id: "score-run", metric: "score", scope: "run", targets: [4000, 9000, 18000], label: "한 판에 {t}점 얻기", coins: 200, xp: 160 },
];

export const MISSION_SLOTS = 3;

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

export function missionReward(completedList) {
  return completedList.reduce(
    (acc, entry) => ({ coins: acc.coins + entry.def.coins, xp: acc.xp + entry.def.xp }),
    { coins: 0, xp: 0 },
  );
}

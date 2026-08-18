/**
 * Rank ladder. XP comes from missions and from banking score at the end of a
 * run, so both careful mission play and one huge run move the needle.
 */
export const RANKS = [
  { level: 1, xp: 0, name: "신입 러너" },
  { level: 2, xp: 600, name: "통근자" },
  { level: 3, xp: 1800, name: "선로 주자" },
  { level: 4, xp: 4000, name: "지붕 곡예사" },
  { level: 5, xp: 7500, name: "터널 질주자" },
  { level: 6, xp: 13000, name: "급행 열차" },
  { level: 7, xp: 21000, name: "도시의 그림자" },
  { level: 8, xp: 33000, name: "메트로 마스터" },
  { level: 9, xp: 50000, name: "전설" },
];

/** XP awarded for a finished run, on top of any mission rewards. */
export function runXp(score) {
  return Math.floor(Math.max(0, score) / 25);
}

export function rankAt(xp) {
  let current = RANKS[0];
  for (const rank of RANKS) if (xp >= rank.xp) current = rank;
  return current;
}

export function nextRankAt(xp) {
  return RANKS.find((rank) => rank.xp > xp) ?? null;
}

/**
 * Difficulty step the next mission is dealt at.
 *
 * One step per rank rather than one per three, so the harder targets are
 * actually reached during normal play — with the old mapping the top band sat
 * behind roughly forty runs and most of the mission content never appeared.
 */
export function missionTier(xp, tiers) {
  return Math.min(tiers - 1, Math.max(0, rankAt(xp).level - 1));
}

/** Progress towards the next rank, 0..1. Maxed ranks report 1. */
export function rankProgress(xp) {
  const current = rankAt(xp);
  const next = nextRankAt(xp);
  if (!next) return 1;
  const span = next.xp - current.xp;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (xp - current.xp) / span));
}

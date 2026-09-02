/**
 * Rank ladder. XP comes from missions and from banking score at the end of a
 * run, so both careful mission play and one huge run move the needle.
 */

/**
 * The first nine, set by hand and never to be edited.
 *
 * Every player who has ever levelled did it against these numbers, and moving
 * one demotes whoever is standing on it. They are also the ranks a new player
 * passes in their first afternoon, which is why each gets a name of its own
 * rather than sharing one with nine neighbours.
 */
const EARLY_RANKS = [
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

export const TOP_LEVEL = 99;

/**
 * Where the ladder ends.
 *
 * Chosen against how fast the top of the school actually earns — around a
 * quarter of a million experience in a heavy week — so ninety-nine is a school
 * year of it rather than a fortnight. The old ceiling was reached by five
 * players in the first week, and after that the bar under their nickname was
 * simply full forever.
 */
const TOP_XP = 5_000_000;

/**
 * One title per ten levels above the ninth.
 *
 * Ninety names would be ninety chances to write a bad one, and a rank nobody
 * sits at for more than an evening does not need its own. The number carries
 * the precision; the title carries the bragging.
 */
const BANDS = [
  "첫차 사냥꾼",
  "환승의 달인",
  "무정차 급행",
  "종점까지 간 사람",
  "노선도를 외운 자",
  "밤을 달리는 기관사",
  "선로의 주인",
  "도시의 심장박동",
  "메트로 그 자체",
];

/**
 * Growth per level above the ninth, solved so that the last one lands on
 * TOP_XP. Geometric rather than linear: the level after a player's current one
 * should always be about a run away, and a flat step that reaches five million
 * in ninety would cost fifty thousand at level ten — as much as the whole climb
 * to nine.
 */
const STEP = (TOP_XP / EARLY_RANKS[EARLY_RANKS.length - 1].xp) ** (1 / (TOP_LEVEL - 9));

/** Round to something a player can read back, without ever losing the order. */
function readable(xp) {
  if (xp < 100_000) return Math.round(xp / 100) * 100;
  if (xp < 1_000_000) return Math.round(xp / 1000) * 1000;
  return Math.round(xp / 10_000) * 10_000;
}

function buildRanks() {
  const base = EARLY_RANKS[EARLY_RANKS.length - 1].xp;
  const ranks = [...EARLY_RANKS];
  for (let level = 10; level <= TOP_LEVEL; level++) {
    ranks.push({
      level,
      xp: readable(base * STEP ** (level - 9)),
      name: BANDS[Math.min(BANDS.length - 1, Math.floor(level / 10) - 1)],
    });
  }
  return ranks;
}

export const RANKS = buildRanks();

/**
 * Coins paid for reaching a new rank.
 *
 * The first nine keep the hand-set schedule they were always paid on — they
 * are the first afternoon, they come to nine thousand coins in total, and every
 * player who climbed them did it for these numbers.
 *
 * Above the ninth the payout follows the experience the level actually cost.
 * It used to be flat at 2,000, which sounds even and was not: the experience
 * curve restarts just above rank nine, so levelling from 9 to 10 costs 2,600
 * experience where 8 to 9 cost 17,000 — and both paid 2,000. That made levels
 * 10 to 25 worth about 0.7 coins for every point of experience, against the
 * 0.13 that playing pays, and the fastest way to earn in the game was to stand
 * on the cheapest rungs of the ladder. Paying a fixed fraction of what a level
 * cost cannot have a sweet spot in it, because there is nothing left to vary.
 */
export const RANK_UP_COINS = 250;

/**
 * Coins per point of experience a level cost.
 *
 * A quarter of what running pays for the same experience, so arriving somewhere
 * is a garnish on the runs that got you there rather than a better way to earn
 * than running.
 */
const RANK_COIN_RATE = 0.04;
/** Floor, so the cheap early ranks above nine are still worth arriving at. */
const RANK_COIN_MIN = 300;
/** Ceiling, so the quarter-million-experience rungs are not a windfall. */
const RANK_COIN_MAX = 2500;

export function rankReward(level) {
  const n = Math.floor(level);
  if (n <= EARLY_RANKS.length) {
    return RANK_UP_COINS * Math.min(Math.max(0, n - 1), EARLY_RANKS.length - 1);
  }
  const here = RANKS.find((rank) => rank.level === n);
  const below = RANKS.find((rank) => rank.level === n - 1);
  if (!here || !below) return RANK_COIN_MIN;
  const cost = Math.max(0, here.xp - below.xp);
  return Math.min(RANK_COIN_MAX, Math.max(RANK_COIN_MIN, Math.round(cost * RANK_COIN_RATE)));
}

/** Everything earned by crossing from one rank to another, ranks included. */
export function rankUpBetween(fromLevel, toLevel) {
  const gained = [];
  for (let level = fromLevel + 1; level <= toLevel; level++) {
    const rank = RANKS.find((entry) => entry.level === level);
    if (rank) gained.push(rank);
  }
  return { ranks: gained, coins: gained.reduce((sum, rank) => sum + rankReward(rank.level), 0) };
}

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

/** Ranks that get a difficulty step each, one for one. The first afternoon. */
const TIER_PER_RANK_UNTIL = 7;
/** Ranks per step after that. The ladder is long; the mission table is not. */
const RANKS_PER_TIER = 15;

/**
 * Difficulty step the next mission is dealt at.
 *
 * Two rates, because the ladder has two halves. The first seven ranks are a
 * player's first afternoon and get a step each, so the missions grow as fast as
 * they do. Above that a rank is a week rather than an evening, and a step every
 * fifteen ranks keeps the targets moving without asking a Lv.12 player for what
 * a Lv.50 one is meant to face.
 *
 * It used to be one step per rank and nothing else, which capped out at rank
 * seven: every player from Lv.8 to Lv.99 was dealt identical targets for
 * identical pay, for ninety-one levels of the ladder.
 */
export function missionTier(xp, tiers) {
  const level = rankAt(xp).level;
  if (level <= TIER_PER_RANK_UNTIL) return Math.min(tiers - 1, Math.max(0, level - 1));
  const beyond = Math.floor((level - TIER_PER_RANK_UNTIL) / RANKS_PER_TIER) + 1;
  return Math.min(tiers - 1, TIER_PER_RANK_UNTIL - 1 + beyond);
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

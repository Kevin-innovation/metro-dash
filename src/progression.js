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
 * Scaled by the rank so the ladder keeps paying: the ranks are far apart by
 * design, and arriving at 「메트로 마스터」 for the same 250 coins as 「통근자」
 * would make the climb feel like it stopped mattering halfway up.
 *
 * Flat above the ninth. With nine ranks the top payout was 2,000; carrying the
 * same rule to ninety-nine would have made one level-up worth 24,500 and the
 * whole ladder worth 1.2 million, against a shop that costs 113,700 to empty.
 * A ladder that pays for itself twelve times over is not a ladder, it is a tap.
 */
export const RANK_UP_COINS = 250;

export function rankReward(level) {
  const steps = Math.min(Math.max(0, Math.floor(level) - 1), EARLY_RANKS.length - 1);
  return RANK_UP_COINS * steps;
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

/**
 * Difficulty step the next mission is dealt at.
 *
 * Deliberately still counted off the first nine ranks. The ladder above them is
 * a long climb for its own sake; the mission table has seven steps and its
 * hardest targets were written for a player who has been at this a while, not
 * for one who has been at it a year. Mapping seven steps across ninety-nine
 * ranks would hand a Lv.20 player the targets a Lv.99 one is meant to face.
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

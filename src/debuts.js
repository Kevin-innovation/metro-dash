import { HAZARD_FROM_SCORE } from "./spawner.js";
import { LANES_FROM_SCORE } from "./lanes.js";
import { STORM_FROM_SCORE } from "./lightning.js";

/**
 * Telling the player what is about to start happening to them.
 *
 * Three things in this game switch on at a score — the crow egg, the road
 * changing width, the storm — and each of them was arriving with no notice at
 * all. A hazard nobody was told about is indistinguishable from a bug: the
 * first person to meet the lightning warning asked whether the yellow strip was
 * the four-lane change, and they were right to, because nothing had said either
 * thing existed.
 *
 * So each one gets a line, DEBUT_LEAD points before it starts, saying what is
 * coming and what to do about it. Not at the threshold — arriving with the
 * thing is not notice — and not much earlier either, because a warning far
 * enough ahead to be forgotten is the same as no warning.
 *
 * Each fires once per run. The road keeps announcing every change it makes
 * after that (see advanceRoad); the other two only need saying once, because
 * after the first egg and the first bolt the player knows.
 */

/**
 * How much score's worth of notice, in points.
 *
 * Twenty-five thousand is about seven seconds of plain survival and four or
 * five of a run going well — long enough to read a line and look up, short
 * enough that what it warned about is the next thing that happens.
 */
export const DEBUT_LEAD = 25_000;

export const DEBUTS = [
  {
    id: "crow",
    at: HAZARD_FROM_SCORE,
    text: "곧 까마귀 알 — 코인 줄에 함정이 섞입니다",
  },
  {
    id: "lanes",
    at: LANES_FROM_SCORE,
    text: "곧 길 폭이 바뀝니다 — 4차선부터",
  },
  {
    id: "storm",
    at: STORM_FROM_SCORE,
    text: "곧 번개 — 빨갛게 켜진 레인에서 비키세요",
  },
];

/**
 * Which announcements fall between two scores.
 *
 * Takes the span rather than the current score because the score moves in jumps
 * — a wheel face, a long combo, a whole pattern of coins at once — and a check
 * for 「are we at the number」 misses every threshold that was stepped over
 * rather than landed on. The one thing this must never do is stay quiet.
 *
 * @param {number} from score at the previous step
 * @param {number} to score now
 */
export function debutsBetween(from, to) {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  return DEBUTS.filter((debut) => {
    const announceAt = debut.at - DEBUT_LEAD;
    return announceAt > low && announceAt <= high;
  });
}

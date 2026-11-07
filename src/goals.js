import { JOURNEY, NORTH_POLE_METRES, journeyStage } from "./christmas.js";
import { isComplete, missionLabel } from "./missions.js";

/**
 * Everyone on this week's board still ahead of the runner, lowest first.
 *
 * Only those ahead of the runner's own record: going past someone already behind
 * you changes nothing about where you stand, and saying so would be a lie.
 */
export class Rivals {
  /**
   * @param {Array<{ handle: string, best: number }>} rows the board
   * @param {string|null} me
   */
  constructor(rows, me) {
    const own = rows.find((row) => row.handle === me)?.best ?? 0;
    this.ahead = rows
      .filter((row) => row.handle !== me && row.best > own)
      .sort((a, b) => a.best - b.best);
  }

  /**
   * Who this score has just gone past, if anybody.
   *
   * @returns {{ handle: string, rank: number }|null} the highest passed, and the
   *   place that now puts the runner in
   */
  passed(score) {
    let last = null;
    while (this.ahead.length && score > this.ahead[0].best) last = this.ahead.shift();
    return last && { handle: last.handle, rank: this.ahead.length + 1 };
  }

  /** The nearest one still ahead, or null at the top. */
  next() {
    return this.ahead[0] ?? null;
  }
}

/** Past this share of the way still to go, it is not close and not worth saying. */
const WORTH_SAYING = 0.6;

const number = (value) => Math.ceil(value).toLocaleString();

/**
 * The closest thing the run just missed, for the game-over card.
 *
 * Each candidate is measured as the share of its own distance still to go, so a
 * mission one short and a rival 8,000 points away can be compared at all.
 *
 * @returns {{ icon: string, text: string }|null}
 */
export function nearestGoal({ score, distance, best = 0, missions = [], rivals = null, christmas = false }) {
  const goals = [];

  const rival = rivals?.next();
  if (rival && rival.best > score) {
    goals.push({
      icon: "🏁",
      text: `${rival.handle}님까지 ${number(rival.best - score)}점`,
      left: (rival.best - score) / rival.best,
    });
  }

  if (best > score) {
    goals.push({ icon: "🏆", text: `내 최고 기록까지 ${number(best - score)}점`, left: (best - score) / best });
  }

  if (christmas) {
    const here = journeyStage(distance);
    const next = JOURNEY[here + 1];
    const at = next?.at ?? NORTH_POLE_METRES;
    if (distance < at) {
      goals.push({
        icon: next ? "🧭" : "🎅",
        text: `${next?.name ?? "북극"}까지 ${number(at - distance)}m`,
        left: (at - distance) / (at - JOURNEY[here].at),
      });
    }
  }

  for (const mission of missions) {
    if (isComplete(mission) || !(mission.target > 0)) continue;
    goals.push({
      icon: "🎯",
      text: `「${missionLabel(mission)}」 ${number(mission.target - mission.progress)} 남음`,
      left: (mission.target - mission.progress) / mission.target,
    });
  }

  const closest = goals.sort((a, b) => a.left - b.left)[0];
  return closest && closest.left <= WORTH_SAYING ? { icon: closest.icon, text: closest.text } : null;
}

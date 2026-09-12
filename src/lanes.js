/**
 * How wide the road is, and when that changes.
 *
 * Three lanes for the whole run was a constant nobody had ever had a reason to
 * question, and it is the one dimension the difficulty curve never touched: the
 * track got faster and denser and the choice stayed 「left, middle, right」 from
 * the first second to the last.
 *
 * So past a point the road itself moves. It widens to four, to five, then back
 * down, and the number it is at changes what a layout can even ask: a wall on a
 * five-lane road has to block five lanes to be a wall, and two vehicles that
 * sealed three quarters of a narrow road seal less than half of a wide one.
 * Wide is room; narrow is pressure. It is the same tension and release the
 * rests gave the timing, applied to the space instead.
 *
 * ## Why the lanes are a range and not a centred fan
 *
 * The obvious way to lay out four lanes is to centre them — at ±0.5 and ±1.5 of
 * a lane's width — and it is wrong here for a reason that only shows up in
 * motion: it moves every lane. A run that widened from three to four would slide
 * the runner sideways, and slide every obstacle already on the track with it,
 * because those were placed against the old positions and are still coming.
 *
 * A contiguous range of whole lanes does not have that problem. Lane 0 is lane 0
 * at every width, everything already placed stays exactly where it was put, and
 * a change is a lane appearing at one edge or leaving from one. The road is off
 * centre at the even widths; the camera only half-follows the runner anyway, so
 * what that reads as is a road that opens to one side, which is what it is.
 */

/** Metres between one lane and the next. The lane at index n sits at n × this. */
export const LANE_GAP = 2.2;

/** Where a lane index sits across the road. */
export function laneX(lane) {
  return lane * LANE_GAP;
}

/**
 * The score at which the road stops being three lanes wide for good.
 *
 * Three hundred thousand. It was half a million — the number the difficulty
 * ladder is built around — and that was late enough that most runs never saw
 * the road move at all, which made the most distinctive thing in the game a
 * thing almost nobody met. 30만 is still well past the point where a player has
 * the lane change itself down cold; nobody is learning what a road is while it
 * is changing shape.
 */
export const LANES_FROM_SCORE = 300_000;

/**
 * Points between one width and the next, once it has started.
 *
 * Fifty thousand, so the road is somewhere different every fifteen seconds or
 * so rather than twice in a good run. At the old 12만 the shape was closer to a
 * setting than to a rhythm, and a rhythm is the entire point of it.
 */
export const LANES_EVERY = 50_000;

/**
 * The widths, in the order they come round.
 *
 * Four, three, four, five, and round again — a road that breathes rather than
 * one that grows. Three is the floor because every pattern in the table was
 * drawn for three and the fairness audit is an argument about what a runner can
 * reach from where they are standing; narrower than that is a different game,
 * not a harder one. Five is the ceiling for the opposite reason: past it a wall
 * stops being something you answer and starts being something you walk round.
 *
 * Written so that consecutive entries — the wrap from the last back to the
 * first included — never differ by more than one. A road that went from three
 * to five in one step would take away a lane somebody could be standing in and
 * open another one where they were not looking, in the same moment.
 */
export const LANE_WIDTHS = [4, 3, 4, 5];

/** How many lanes the road has at this score. */
export function laneCountAt(score) {
  const points = Number(score) || 0;
  if (points < LANES_FROM_SCORE) return 3;
  const step = Math.floor((points - LANES_FROM_SCORE) / LANES_EVERY);
  return LANE_WIDTHS[step % LANE_WIDTHS.length];
}

/**
 * The lanes themselves, lowest first.
 *
 * A contiguous run of whole numbers holding lane 0, growing to the high side
 * first. Four is [-1, 0, 1, 2] and five is [-2, -1, 0, 1, 2], so going from
 * three to four adds a lane and moves none, and going from four to five does
 * the same on the other side.
 */
export function laneSet(count) {
  const n = Math.max(1, Math.round(count) || 1);
  const low = -Math.floor(n / 2) + (n % 2 === 0 ? 1 : 0);
  return Array.from({ length: n }, (_, i) => low + i);
}

/** The lanes in play at this score. */
export function lanesAt(score) {
  return laneSet(laneCountAt(score));
}

/**
 * Where a runner standing in `lane` ends up when the road becomes `lanes`.
 *
 * A lane can be taken away with somebody on it, and the answer has to be the
 * forgiving one: they are moved to the nearest lane that still exists rather
 * than killed by the road changing under them. Nothing the player did caused
 * it and nothing they could have done would have avoided it.
 */
export function closestLane(lane, lanes) {
  if (!lanes.length) return 0;
  let best = lanes[0];
  for (const candidate of lanes) {
    if (Math.abs(candidate - lane) < Math.abs(best - lane)) best = candidate;
  }
  return best;
}

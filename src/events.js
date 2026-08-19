/**
 * Sections: the stretches where the run stops being the same run.
 *
 * Everything else in the game scales one axis — obstacles arrive faster, and
 * that is the whole of it. Four minutes of that reads as one long corridor
 * however steep the curve gets, because the *thing the player is doing* never
 * changes: dodge, jump, slide, repeat, slightly sooner.
 *
 * A section changes the job for fifteen seconds. Coins with nothing in the way.
 * Gates with nothing but gates. Roof to roof with the ground given up. The
 * skill is the same; what the run is asking for is not.
 *
 * Timed rather than random, and identical for everyone at the same second of a
 * run — a leaderboard where one player got three coin rushes and another got
 * none is not measuring the same thing twice.
 *
 * Pure: no Three.js, no DOM. The spawner reads `patterns`, the Run reads
 * `scoreMultiplier`, and Game shows the banner.
 */

/** Seconds into a run before the first section. */
export const FIRST_EVENT_AT = 42;
/** Seconds from the start of one section to the start of the next. */
export const EVENT_PERIOD = 52;
/**
 * How long a section lasts, when it does not say otherwise.
 *
 * Each one is only as long as it stays interesting. The coin rush is the short
 * one on purpose: nothing in it can kill you, and fifteen seconds of that is
 * three quarters of a kilometre of empty track — which reads as the game having
 * broken rather than as a reward.
 */
export const EVENT_SECONDS = 14;

export const EVENTS = [
  {
    id: "coinrush",
    name: "코인 러시",
    /** Nothing lethal at all: the reward for surviving to it is a rest. */
    patterns: ["rush-coins"],
    seconds: 8,
    scoreMultiplier: 2,
    colour: "#ffd24a",
  },
  {
    id: "gates",
    name: "게이트 회랑",
    /** Slide, stand, slide. One verb, over and over, until it is a rhythm. */
    patterns: ["triple-sign", "gate-run"],
    seconds: 11,
    scoreMultiplier: 1.5,
    colour: "#7dfcd4",
  },
  {
    id: "roofs",
    name: "지붕 하이웨이",
    /** The ground is still there; it is simply where the coins are not. */
    patterns: ["roof-weave", "bus-hop", "bus-roof"],
    scoreMultiplier: 1.5,
    colour: "#8fd0ff",
  },
];

export function eventById(id) {
  return EVENTS.find((event) => event.id === id) ?? null;
}

/**
 * The section running at `t` seconds into a run, if any.
 *
 * @returns {{ event: object, elapsed: number, remaining: number } | null}
 */
export function eventAt(t) {
  if (!(t >= FIRST_EVENT_AT)) return null;
  const since = t - FIRST_EVENT_AT;
  const elapsed = since % EVENT_PERIOD;

  const index = Math.floor(since / EVENT_PERIOD) % EVENTS.length;
  const event = EVENTS[index];
  const seconds = event.seconds ?? EVENT_SECONDS;
  if (elapsed >= seconds) return null;

  return { event, elapsed, remaining: seconds - elapsed };
}

/** Score multiplier from the section alone, 1 when none is running. */
export function eventMultiplierAt(t) {
  return eventAt(t)?.event.scoreMultiplier ?? 1;
}

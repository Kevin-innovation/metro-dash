import { describe, expect, it } from "vitest";
import { REACTION_HARD } from "../src/config.js";
import { ALL_LANES } from "../src/patterns.js";
import {
  FIRST_STRIKE_AFTER,
  LightningStorm,
  STORM_FROM_SCORE,
  STRIKE_PERIOD,
  STRIKE_SECONDS,
  STRIKE_SPREAD,
  WARN_SECONDS,
} from "../src/lightning.js";

/** A lane change settles in about this long, and can be started in mid-air. */
const LANE_SETTLE = 0.19;

const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** Run the storm forward and collect what it did. */
const storm = (seconds, { open = true, rng = () => 0.5, dt = 1 / 60 } = {}) => {
  const s = new LightningStorm(rng);
  const events = [];
  const lethalLanes = new Set();
  let lethalFrames = 0;
  for (let t = 0; t < seconds; t += dt) {
    const event = s.update(dt, { open: typeof open === "function" ? open(t) : open });
    if (event) events.push({ t, event, lane: s.strike?.lane ?? null });
    if (s.danger != null) {
      lethalLanes.add(s.danger);
      lethalFrames += 1;
    }
  }
  return { s, events, lethalLanes, lethalSeconds: lethalFrames * dt };
};

describe("번개", () => {
  it("예고가 반응 시간보다 길다", () => {
    // The whole fairness argument, and the only one that can be made here: a
    // bolt is not on the track, so there is no approach to audit. What there
    // is, is the time between 「보였다」 and 「쳤다」, and it has to cover the
    // tightest reaction the run ever asks for plus getting out of the lane.
    const answerable = REACTION_HARD + LANE_SETTLE;
    expect(WARN_SECONDS).toBeGreaterThan(answerable);
    // With real headroom, not by a rounding error.
    expect(WARN_SECONDS).toBeGreaterThan(answerable * 1.7);
  });

  it("치명적인 시간은 예고보다 훨씬 짧다", () => {
    // The decision was made during the warning. Keeping the lane deadly much
    // past that starts killing people for a choice they already got right.
    expect(STRIKE_SECONDS).toBeLessThan(WARN_SECONDS / 3);
  });

  it("한 번에 한 레인만 친다", () => {
    // Two of three lanes stay safe throughout, so the run always has an answer
    // — whatever else is on the track at the time.
    const dt = 1 / 120;
    const s = new LightningStorm(sequence([0.05, 0.4, 0.95, 0.6, 0.1]));
    for (let t = 0; t < 120; t += dt) {
      s.update(dt, { open: true });
      const live = [s.warning?.lane, s.danger].filter((lane) => lane != null);
      expect(new Set(live).size, `t=${t.toFixed(2)}`).toBeLessThanOrEqual(1);
      if (s.danger != null) {
        expect(ALL_LANES.filter((lane) => lane !== s.danger).length).toBe(ALL_LANES.length - 1);
      }
    }
  });

  it("예고 없이 치는 일이 없다", () => {
    // Every lethal frame has to be preceded by its own warning. Checked by
    // walking the clock rather than trusting the state machine's shape.
    const dt = 1 / 120;
    const s = new LightningStorm(sequence([0.2, 0.8, 0.5]));
    let warnedFor = 0;
    let lastLane = null;
    for (let t = 0; t < 180; t += dt) {
      s.update(dt, { open: true });
      if (s.warning) {
        if (s.warning.lane !== lastLane) {
          lastLane = s.warning.lane;
          warnedFor = 0;
        }
        warnedFor += dt;
      } else if (s.danger != null) {
        expect(s.danger, "쳤는데 예고한 레인과 다르다").toBe(lastLane);
        expect(warnedFor, `t=${t.toFixed(2)} 예고가 짧다`).toBeGreaterThanOrEqual(
          WARN_SECONDS - dt * 2,
        );
      }
    }
  });

  it("지붕 아래에서는 아무 일도 없다", () => {
    const { events, lethalSeconds } = storm(120, { open: false });
    expect(events).toEqual([]);
    expect(lethalSeconds).toBe(0);
  });

  it("터널에 들어가면 예고도 같이 끝난다", () => {
    // A warning that follows the runner under a roof has nothing on screen to
    // explain it, and would kill somebody in a lane that looks clear.
    const dt = 1 / 120;
    const s = new LightningStorm(() => 0.5);
    for (let t = 0; t < FIRST_STRIKE_AFTER + WARN_SECONDS * 0.5; t += dt) {
      s.update(dt, { open: true });
    }
    expect(s.warning, "예고 중이어야 한다").not.toBeNull();
    s.update(dt, { open: false });
    expect(s.warning).toBeNull();
    expect(s.danger).toBeNull();
  });

  it("30초에 칠 만큼은 치고, 쉴 틈도 남긴다", () => {
    // Few enough that a strike is an event, often enough that the sky is worth
    // watching.
    const { events } = storm(40);
    const strikes = events.filter((e) => e.event === "strike").length;
    expect(strikes).toBeGreaterThanOrEqual(4);
    expect(strikes).toBeLessThanOrEqual(10);
    // And the gap between them stays long enough to be over before the next
    // begins, whichever way the jitter falls.
    expect(STRIKE_PERIOD - STRIKE_SPREAD).toBeGreaterThan(WARN_SECONDS + STRIKE_SECONDS);
  });

  it("첫 번개는 하늘이 열리고 조금 뒤에 온다", () => {
    // Coming out of a tunnel moves the sky, the fog and the ground at once; a
    // bolt inside that reads as scenery rather than as something aimed at you.
    const { events } = storm(FIRST_STRIKE_AFTER * 0.9);
    expect(events.filter((e) => e.event === "strike")).toEqual([]);
    expect(FIRST_STRIKE_AFTER).toBeGreaterThan(WARN_SECONDS);
  });

  it("모든 레인이 돌아가며 맞는다", () => {
    // Not a fairness rule so much as the absence of an accidental one: a storm
    // that only ever hit the middle would be a lane the player simply stops
    // using.
    const { lethalLanes } = storm(400, { rng: sequence([0.05, 0.45, 0.95]) });
    expect([...lethalLanes].sort()).toEqual([...ALL_LANES].sort());
  });

  it("점수로 열리고, 하늘이 있어야 친다", () => {
    // It was a night-zone thing, and a night zone is 40 seconds of a run that
    // no longer ends — so most of a long run had no storm in it at all. Keyed
    // to score now, like the crow and the road: time is what the player
    // survived, score is how well.
    expect(STORM_FROM_SCORE).toBeGreaterThan(0);
    // Past the point where a player has the lane change down cold, and inside
    // what an ordinary good run reaches.
    expect(STORM_FROM_SCORE).toBeLessThan(1_000_000);
  });
});

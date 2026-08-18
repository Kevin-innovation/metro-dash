import { describe, expect, it } from "vitest";
import {
  MISSION_DEFS,
  MISSION_SLOTS,
  applyMetrics,
  ensureMissions,
  isComplete,
  missionLabel,
  missionReward,
  rollMissions,
} from "../src/missions.js";

/** Deterministic "random" so rolls are reproducible. */
const seeded = (seed = 1) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

describe("mission definitions", () => {
  it("have unique ids and ascending targets", () => {
    const ids = MISSION_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of MISSION_DEFS) {
      for (let i = 1; i < def.targets.length; i++) {
        expect(def.targets[i]).toBeGreaterThan(def.targets[i - 1]);
      }
      expect(def.coins).toBeGreaterThan(0);
      expect(def.xp).toBeGreaterThan(0);
      expect(def.label).toContain("{t}");
    }
  });

  it("have enough variety to fill every slot without repeats", () => {
    expect(MISSION_DEFS.length).toBeGreaterThan(MISSION_SLOTS);
  });
});

describe("rollMissions", () => {
  it("deals the requested number without duplicates", () => {
    const missions = rollMissions([], MISSION_SLOTS, 0, seeded(7));
    expect(missions).toHaveLength(MISSION_SLOTS);
    expect(new Set(missions.map((m) => m.id)).size).toBe(MISSION_SLOTS);
  });

  it("avoids ids that are already in play", () => {
    const exclude = MISSION_DEFS.slice(0, 4).map((d) => d.id);
    const missions = rollMissions(exclude, 3, 0, seeded(3));
    for (const mission of missions) expect(exclude).not.toContain(mission.id);
  });

  it("uses harder targets at a higher tier", () => {
    const easy = rollMissions([], 1, 0, seeded(11))[0];
    const hard = rollMissions([], 1, 2, seeded(11))[0];
    expect(hard.id).toBe(easy.id);
    expect(hard.target).toBeGreaterThan(easy.target);
  });

  it("starts every mission at zero progress", () => {
    for (const mission of rollMissions([], MISSION_SLOTS, 1, seeded(5))) {
      expect(mission.progress).toBe(0);
      expect(isComplete(mission)).toBe(false);
    }
  });
});

describe("ensureMissions", () => {
  it("tops an empty list up to a full hand", () => {
    expect(ensureMissions([], 0, seeded(2))).toHaveLength(MISSION_SLOTS);
  });

  it("leaves a full hand alone", () => {
    const existing = rollMissions([], MISSION_SLOTS, 0, seeded(9));
    expect(ensureMissions(existing, 0, seeded(4))).toEqual(existing);
  });

  it("discards entries whose definition no longer exists", () => {
    const missions = ensureMissions([{ id: "deleted", target: 5, progress: 2 }], 0, seeded(6));
    expect(missions).toHaveLength(MISSION_SLOTS);
    expect(missions.some((m) => m.id === "deleted")).toBe(false);
  });
});

describe("applyMetrics", () => {
  const runMission = { id: "coins-run", target: 30, progress: 0 };
  const totalMission = { id: "mounts-total", target: 10, progress: 0 };

  it("takes the best single run for run-scoped missions", () => {
    let { missions } = applyMetrics([runMission], { coins: 18 });
    expect(missions[0].progress).toBe(18);
    // A worse run must not erase progress.
    ({ missions } = applyMetrics(missions, { coins: 4 }));
    expect(missions[0].progress).toBe(18);
  });

  it("accumulates for total-scoped missions", () => {
    let { missions } = applyMetrics([totalMission], { mounts: 4 });
    ({ missions } = applyMetrics(missions, { mounts: 3 }));
    expect(missions[0].progress).toBe(7);
  });

  it("never exceeds the target", () => {
    const { missions } = applyMetrics([totalMission], { mounts: 9999 });
    expect(missions[0].progress).toBe(totalMission.target);
  });

  it("reports a completion exactly once", () => {
    let result = applyMetrics([totalMission], { mounts: 10 });
    expect(result.completed).toHaveLength(1);
    // Re-applying must not re-award it.
    result = applyMetrics(result.missions, { mounts: 5 });
    expect(result.completed).toHaveLength(0);
  });

  it("ignores missing or NaN readings", () => {
    const { missions } = applyMetrics([runMission], { distance: 100, coins: NaN });
    expect(missions[0].progress).toBe(0);
  });

  it("does not mutate the input", () => {
    const original = { ...totalMission };
    applyMetrics([totalMission], { mounts: 5 });
    expect(totalMission).toEqual(original);
  });

  it("sums rewards across everything completed at once", () => {
    const { completed } = applyMetrics(
      [
        { id: "coins-run", target: 1, progress: 0 },
        { id: "mounts-total", target: 1, progress: 0 },
      ],
      { coins: 5, mounts: 5 },
    );
    expect(completed).toHaveLength(2);
    const reward = missionReward(completed);
    expect(reward.coins).toBe(completed[0].def.coins + completed[1].def.coins);
    expect(reward.xp).toBe(completed[0].def.xp + completed[1].def.xp);
  });
});

describe("missionLabel", () => {
  it("substitutes the rolled target", () => {
    expect(missionLabel({ id: "coins-run", target: 35, progress: 0 })).toContain("35");
  });

  it("returns an empty string for an unknown mission", () => {
    expect(missionLabel({ id: "nope", target: 1, progress: 0 })).toBe("");
  });
});

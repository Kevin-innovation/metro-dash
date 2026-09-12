import { describe, expect, it } from "vitest";
import { DIAMOND_GOAL, SLOT_FACES, SLOT_MAX_MULTIPLIER, SLOT_TOP_MULTIPLIER, spinSlots } from "../src/slots.js";
import { MAX_CHARACTER_SCORE_BONUS, CHARACTERS } from "../src/characters.js";
import { MAX_MULTIPLIER } from "../src/leaderboard-rules.js";
import { MAX_COMBO_MULTIPLIER } from "../src/scoring.js";

import { MAX_EVENT_MULTIPLIER } from "../src/events.js";
import { Run } from "../src/run.js";
import { SaveStore } from "../src/save.js";

const store = (coins = 0) => {
  const s = new SaveStore({ getItem: () => null, setItem: () => {} });
  s.data.coins = coins;
  return s;
};

/** A generator that walks the whole wheel, so every face can be exercised. */
function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("the diamond wheel — the table", () => {
  it("is a wheel of distinct faces, every one of them landable", () => {
    // The count is a presentation choice and has moved once already; that no
    // face is decoration is not. A reel showing an outcome the draw can never
    // produce misrepresents the bet the player is taking.
    expect(SLOT_FACES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SLOT_FACES.map((face) => face.id)).size).toBe(SLOT_FACES.length);
    for (const face of SLOT_FACES) {
      expect(face.weight, `${face.id} is on the reel but cannot be drawn`).toBeGreaterThan(0);
    }
  });

  it("can hurt as well as help", () => {
    // A wheel that can only help is a delayed present, not a decision. The
    // exact split is a tuning matter; that both sides exist is not.
    const tones = SLOT_FACES.map((face) => face.tone);
    expect(tones.filter((tone) => tone === "good").length).toBeGreaterThan(0);
    expect(tones.filter((tone) => tone === "bad").length).toBeGreaterThan(0);
  });

  it("is only score multipliers", () => {
    const allowed = new Set([0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const face of SLOT_FACES) {
      expect(face.effect.type, face.id).toBe("multiplier");
      expect(allowed, face.id).toContain(face.effect.value);
      expect(face.effect.seconds, face.id).toBeGreaterThan(0);
    }
  });

  it("gives ninety-five percent good spins", () => {
    const n = 20000;
    let good = 0;
    const rng = sequence(Array.from({ length: n }, (_, i) => (i + 0.5) / n));
    for (let i = 0; i < n; i++) {
      const { face } = spinSlots(rng);
      if (face.effect.value > 1) good += 1;
    }
    expect(good / n).toBeCloseTo(0.95, 2);
  });

  it("is the same wheel for the player at the top of the board", () => {
    // It was not. Whoever led the week drew from a second, harsher table — 70%
    // good instead of 95, and 「점수 ×0」 seven spins in a hundred instead of
    // one. It could not do the job it was there for: a score already on the
    // board is never touched, so it pulled nobody back towards the field. It
    // only taxed the person winning, mid-run, on odds they could not see.
    //
    // Pinned as a test rather than left as an absence, because the seam it left
    // behind — a second number on every face and a flag on the call — is small
    // enough to grow back by accident.
    const draw = (opts) => {
      const n = 4000;
      const rng = sequence(Array.from({ length: n }, (_, i) => (i + 0.5) / n));
      const counts = new Map();
      for (let i = 0; i < n; i++) {
        const { face } = spinSlots(rng, opts);
        counts.set(face.id, (counts.get(face.id) ?? 0) + 1);
      }
      return [...counts.entries()].sort().map(([id, n]) => `${id}:${n}`).join(" ");
    };
    // Whatever anyone passes about who is spinning, the same wheel comes back.
    expect(draw({ chase: true })).toBe(draw(undefined));
    expect(draw({ chase: false })).toBe(draw(undefined));
    for (const face of SLOT_FACES) {
      expect(Object.keys(face), face.id).not.toContain("chase");
    }
  });

  it("never lands outside the wheel, whatever the draw", () => {
    // Including both ends, where a weighted pick is most likely to fall off.
    for (const roll of [0, 0.0000001, 0.5, 0.9999999, 1]) {
      const { face, index } = spinSlots(() => roll);
      expect(SLOT_FACES[index]).toBe(face);
    }
  });

  it("draws every face eventually and none more than its share", () => {
    const counts = new Map();
    const rng = sequence(Array.from({ length: 20000 }, (_, i) => (i * 0.00005) % 1));
    for (let i = 0; i < 20000; i++) {
      const { face } = spinSlots(rng);
      counts.set(face.id, (counts.get(face.id) ?? 0) + 1);
    }
    expect(counts.size).toBe(SLOT_FACES.length);
    // The order of the wheel is a presentation choice; the weights are the
    // contract. A sweep across [0,1) should land on each face in proportion.
    const total = SLOT_FACES.reduce((sum, face) => sum + face.weight, 0);
    for (const face of SLOT_FACES) {
      const share = counts.get(face.id) / 20000;
      expect(Math.abs(share - face.weight / total)).toBeLessThan(0.005);
    }
  });
});

describe("the diamond wheel — the server's ceiling", () => {
  it("counts the wheel's best face", () => {
    expect(SLOT_TOP_MULTIPLIER).toBe(SLOT_MAX_MULTIPLIER);
  });

  it("is the product of every multiplier in the game", () => {
    // The one invariant that matters here: a multiplier added to the game and
    // not to this product puts the best runs past the validator and off the
    // board. Written as the product so the failure is loud.
    expect(MAX_MULTIPLIER).toBe(
      MAX_COMBO_MULTIPLIER *
        MAX_EVENT_MULTIPLIER *
        SLOT_TOP_MULTIPLIER *
        MAX_CHARACTER_SCORE_BONUS,
    );
  });

  it("covers the strongest loadout a run can actually assemble", () => {
    const run = new Run(store());
    run.scoreScale = MAX_CHARACTER_SCORE_BONUS;
    run.eventMultiplier = MAX_EVENT_MULTIPLIER;
    run.setSlotMultiplier(SLOT_MAX_MULTIPLIER, 8);
    for (let i = 0; i < 200; i++) run.bumpCombo();
    expect(run.multiplier()).toBeLessThanOrEqual(MAX_MULTIPLIER);
  });
});

describe("the diamond wheel — collecting", () => {
  it("spins on the third diamond and not before", () => {
    const run = new Run(store());
    for (let i = 1; i < DIAMOND_GOAL; i++) expect(run.addDiamond()).toBe(false);
    expect(run.addDiamond()).toBe(true);
    expect(run.takeSpin()).toBe(true);
    expect(run.diamonds).toBe(0);
    expect(run.spins).toBe(1);
  });

  it("keeps a diamond won on the wheel rather than erasing it", () => {
    // 「다이아 2개」 landing on a counter that was about to be zeroed would be
    // the wheel handing back something it then took away.
    const run = new Run(store());
    for (let i = 0; i < DIAMOND_GOAL; i++) run.addDiamond();
    run.addDiamond();
    run.addDiamond();
    run.takeSpin();
    expect(run.diamonds).toBe(2);
  });

  it("cannot spin without paying", () => {
    const run = new Run(store());
    run.addDiamond();
    expect(run.takeSpin()).toBe(false);
    expect(run.diamonds).toBe(1);
  });
});

describe("the diamond wheel — what it pays", () => {
  it("multiplies the score for exactly as long as the face said", () => {
    const run = new Run(store());
    run.setSlotMultiplier(10, 5);
    expect(run.multiplier()).toBe(10);
    run.advance(4.9, { travelled: 1, mounted: false });
    expect(run.multiplier()).toBe(10);
    run.advance(0.2, { travelled: 1, mounted: false });
    expect(run.multiplier()).toBe(1);
    expect(run.slotFace).toBe(null);
  });

  it("lets a later spin take a multiplier away", () => {
    // Two spins inside twenty seconds is the wheel being played twice. A ×10
    // that a later ×0.5 could not touch would make the bad face free for the
    // player who was already winning.
    const run = new Run(store());
    run.setSlotMultiplier(10, 8);
    run.setSlotMultiplier(0.5, 12);
    expect(run.multiplier()).toBe(0.5);
  });

  it("gives the crow a window it cannot land in, without spending an antidote", () => {
    const s = store();
    s.data.antidotes = 1;
    const run = new Run(s);
    run.cureCrow(15);

    expect(run.addHazard("crow")).toEqual({ blocked: true, reason: "immune" });
    expect(s.data.antidotes).toBe(1);
    expect(run.crowActive()).toBe(false);

    // And the antidote is still there to be spent once the window closes —
    // buying a window of its own, which is what it is for.
    run.advance(15.1, { travelled: 1, mounted: false });
    expect(run.addHazard("crow")).toEqual({ blocked: true, reason: "antidote" });
    expect(s.data.antidotes).toBe(0);
  });

  it("fogs the screen without putting a bird on it", () => {
    // Two of thirty faces doing the same thing is a smaller wheel: everything
    // that darkens the screen reads the crow's timer, and so does the bird, so
    // 「시야 흐림」 written as a short crow was a second copy of the face next
    // to it — pecking and all.
    const run = new Run(store());
    run.blind(8);
    expect(run.blindT).toBe(8);
    expect(run.crowActive()).toBe(false);
    run.advance(8.1, { travelled: 1, mounted: false });
    expect(run.blindT).toBe(0);
  });

  it("lifts the fog as well as the bird when the wheel grants immunity", () => {
    const run = new Run(store());
    run.blind(8);
    run.addHazard("crow");
    run.cureCrow(15);
    expect(run.blindT).toBe(0);
    expect(run.crowActive()).toBe(false);
  });

  it("clears the wheel when the run ends", () => {
    // A ×10 counting down over a game-over card is multiplying a run that has
    // stopped scoring.
    const run = new Run(store());
    run.setSlotMultiplier(10, 8);
    run.setSpeedScale(1.18, 12);
    run.cureCrow(15);
    run.blind(8);
    run.clearPowerups();
    expect(run.blindT).toBe(0);
    expect(run.multiplier()).toBe(1);
    expect(run.speedScale).toBe(1);
    expect(run.crowImmuneT).toBe(0);
  });

  it("runs the speed face down and hands the curve back", () => {
    const run = new Run(store());
    run.setSpeedScale(1.18, 12);
    run.advance(11.9, { travelled: 1, mounted: false });
    expect(run.speedScale).toBe(1.18);
    run.advance(0.2, { travelled: 1, mounted: false });
    expect(run.speedScale).toBe(1);
  });
});

describe("characters — the plain half of the perk", () => {
  it("gives every paid runner a signature that is not empty", () => {
    for (const character of CHARACTERS) {
      if (character.cost === 0) continue;
      expect(Object.keys(character.perk ?? {}).length, character.id).toBeGreaterThan(0);
    }
  });

  it("prices the score bonus in the order the shop draws the runners that have one", () => {
    const paid = CHARACTERS.filter((character) => (character.perk?.scoreBonus ?? 1) > 1);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i].cost).toBeGreaterThan(paid[i - 1].cost);
      expect(paid[i].perk.scoreBonus).toBeGreaterThanOrEqual(paid[i - 1].perk.scoreBonus);
    }
  });

  it("makes 허수아비 the crow specialist, not the score specialist", () => {
    const scarecrow = CHARACTERS.find((character) => character.id === "scarecrow");
    expect(scarecrow.perk.crowTime).toBeLessThan(1);
    expect(scarecrow.perk.scoreBonus).toBeUndefined();
  });

  it("carries the runner's score bonus into the run's multiplier", () => {
    const run = new Run(store());
    run.scoreScale = 1.22;
    expect(run.multiplier()).toBeCloseTo(1.22, 10);
  });
});

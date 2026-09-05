import { describe, expect, it } from "vitest";
import { DIAMOND_GOAL, SLOT_FACES, SLOT_MAX_MULTIPLIER, SLOT_TOP_MULTIPLIER, spinSlots } from "../src/slots.js";
import { MAX_CHARACTER_SCORE_BONUS, CHARACTERS } from "../src/characters.js";
import { MAX_MULTIPLIER } from "../src/leaderboard-rules.js";
import { MAX_COMBO_MULTIPLIER } from "../src/scoring.js";
import { DOUBLE_SCORE_MULTIPLIER } from "../src/powerups.js";
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
  it("has thirty faces, all of them distinct", () => {
    expect(SLOT_FACES).toHaveLength(30);
    expect(new Set(SLOT_FACES.map((face) => face.id)).size).toBe(30);
  });

  it("can hurt as well as help", () => {
    // A wheel that can only help is a delayed present, not a decision. The
    // exact split is a tuning matter; that both sides exist is not.
    const tones = SLOT_FACES.map((face) => face.tone);
    expect(tones.filter((tone) => tone === "good").length).toBeGreaterThan(0);
    expect(tones.filter((tone) => tone === "bad").length).toBeGreaterThan(0);
  });

  it("declares an effect the game knows how to pay out", () => {
    const known = new Set([
      "multiplier", "powerup", "powerups", "coins", "combo", "item",
      "cure", "diamonds", "crow", "clearPowerups", "comboReset",
      "speed", "blind", "loseItem", "none",
    ]);
    for (const face of SLOT_FACES) {
      expect(known, `${face.id} → ${face.effect.type}`).toContain(face.effect.type);
      if (face.effect.type === "multiplier") expect(face.effect.seconds).toBeGreaterThan(0);
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
        DOUBLE_SCORE_MULTIPLIER *
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
    run.powerups.double = 10;
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
  it("gives every paid runner something that shows on the score or the coins", () => {
    // The complaint this answers: sixty thousand coins bought a runner that
    // felt identical for the whole of a run.
    for (const character of CHARACTERS) {
      if (character.cost === 0) continue;
      const perk = character.perk ?? {};
      const plain = (perk.scoreBonus ?? 1) > 1 || (perk.coinBonus ?? 1) > 1;
      expect(plain, `${character.id} has nothing a player can feel`).toBe(true);
    }
  });

  it("prices the score bonus in the order the shop draws them", () => {
    const paid = CHARACTERS.filter((character) => character.cost > 0);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i].cost).toBeGreaterThan(paid[i - 1].cost);
      expect(paid[i].perk.scoreBonus).toBeGreaterThanOrEqual(paid[i - 1].perk.scoreBonus);
    }
  });

  it("makes 허수아비 the best runner on a clean run, not only on a bad one", () => {
    // It is the most expensive thing in the shop and was sold entirely on
    // damage limitation, which is a thing nobody buys until they are already
    // losing runs to it.
    const scarecrow = CHARACTERS.find((character) => character.id === "scarecrow");
    expect(scarecrow.perk.scoreBonus).toBe(MAX_CHARACTER_SCORE_BONUS);
    expect(scarecrow.perk.crowTime).toBeLessThan(1);
  });

  it("carries the runner's score bonus into the run's multiplier", () => {
    const run = new Run(store());
    run.scoreScale = 1.3;
    expect(run.multiplier()).toBeCloseTo(1.3, 10);
  });
});

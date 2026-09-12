import * as THREE from "three";
import { ALL_LANES } from "./patterns.js";
import { laneX } from "./lanes.js";

/**
 * The storm.
 *
 * Everything else that can kill you is a thing on the track: it is placed a
 * known distance ahead, it arrives at a known speed, and the fairness audit can
 * ask whether the runner could have got past it. Lightning is the first hazard
 * that is not on the track at all — it picks a lane and it arrives on its own
 * clock — so the fairness argument has to be made here instead, and made in the
 * same units: seconds, and what the runner can do in them.
 *
 * Three rules, and they are the whole design.
 *
 * One lane at a time. A bolt in every lane is not a hazard, it is a coin flip
 * about where you happened to be standing, and the run has to always have an
 * answer. Two of three lanes stay safe throughout.
 *
 * The warning outlasts the reaction the run is being dealt. A strike is
 * announced on the ground, in the lane it will hit, for longer than the player
 * needs to see it and move — REACTION_HARD at its very tightest is 0.45s and a
 * lane change settles in about 0.19s, so anything over about 0.64s is
 * answerable. WARN_SECONDS is nearly double that, because a hazard that comes
 * out of the sky rather than down the track has no approach to read, and 「눈에
 * 들어왔다」 and 「피할 수 있었다」 need to be the same moment.
 *
 * The lethal part is brief. The lane is deadly for STRIKE_SECONDS and no
 * longer: the decision was made during the warning, and stretching the danger
 * out past it would start killing players for a choice they already got right.
 *
 * Not night only, and not anywhere with a roof.
 *
 * It started as a night thing, on the reasoning that darkness is what makes a
 * flash read as a flash. That made it weather a run passed through two or three
 * times rather than a hazard the run has, and the night zone is 40 seconds of a
 * run that no longer has an end — so most of a long run had no storm in it at
 * all. It is keyed to score now, like the crow and the road: time is what the
 * player survived, score is how well.
 *
 * The one place it cannot happen is under a ceiling. A bolt that comes through
 * a tunnel roof or a station canopy is not difficulty, it is a bug that happens
 * to kill you, and the rule is the physical one rather than a list of zone
 * names so a zone added later cannot forget to be on it.
 */

/** The score from which the sky is in play at all. */
export const STORM_FROM_SCORE = 400_000;

/** How long a strike is painted on the ground before it lands. */
export const WARN_SECONDS = 1.2;

/** How long the lane stays lethal once it does. */
export const STRIKE_SECONDS = 0.3;

/** Average seconds between strikes, and how far that wanders either way. */
export const STRIKE_PERIOD = 4.4;
export const STRIKE_SPREAD = 1.3;

/**
 * Seconds under open sky that pass before the first bolt.
 *
 * Coming out of a tunnel is already a lot to take in — the sky, the fog and the
 * ground all move at once — and a strike landing inside that is read as part of
 * the scenery rather than as something aimed at you.
 */
export const FIRST_STRIKE_AFTER = 2.2;

/** Warning red, and the white of the bolt itself. See makeLightning. */
const WARN_COLOUR = 0xff2246;
const STRIKE_COLOUR = 0xf2f8ff;

/**
 * A strike in progress.
 *
 * @typedef {{ lane: number, warnT: number, strikeT: number }} Strike
 */

export class LightningStorm {
  /** @param {() => number} [rng] */
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    /** @type {Strike|null} */
    this.strike = null;
    this.nextIn = FIRST_STRIKE_AFTER;
    /** True for the frames the sky is actually lit. */
    this.flash = 0;
    this.wasOpen = false;
  }

  /** The lane that will be hit, while it is only a warning. */
  get warning() {
    const s = this.strike;
    return s && s.warnT > 0 ? { lane: s.lane, progress: 1 - s.warnT / WARN_SECONDS } : null;
  }

  /** The lane that is lethal right now, or null. */
  get danger() {
    const s = this.strike;
    return s && s.warnT <= 0 && s.strikeT > 0 ? s.lane : null;
  }

  /**
   * Advance the storm.
   *
   * Running under a roof puts everything back rather than letting a warning
   * follow the runner into a tunnel, where a bolt could not reach and there is
   * nothing on screen to explain the mark on the ground.
   *
   * @param {number} dt
   * @param {{ open: boolean, lanes?: number[] }} opts `open` is 「the sky can
   *   reach the runner and the run has earned a storm」
   * @returns {"warn"|"strike"|null} what happened this step, for the sound and
   *   the screen to answer
   */
  update(dt, { open, lanes = ALL_LANES }) {
    this.flash = Math.max(0, this.flash - dt * 3.4);

    if (!open) {
      if (this.wasOpen) this.reset();
      return null;
    }
    if (!this.wasOpen) {
      this.wasOpen = true;
      this.nextIn = FIRST_STRIKE_AFTER;
    }

    if (this.strike) {
      if (this.strike.warnT > 0) {
        this.strike.warnT -= dt;
        // Crossing into the strike is an event rather than a state, so the
        // thunder and the flash fire once however long the frame was.
        if (this.strike.warnT <= 0) {
          this.flash = 1;
          return "strike";
        }
        return null;
      }
      this.strike.strikeT -= dt;
      if (this.strike.strikeT <= 0) {
        this.strike = null;
        this.nextIn = STRIKE_PERIOD + (this.rng() * 2 - 1) * STRIKE_SPREAD;
      }
      return null;
    }

    this.nextIn -= dt;
    if (this.nextIn > 0) return null;

    // Out of the lanes that exist now. A bolt aimed at a lane the road no
    // longer has is one nobody has to answer; aimed at one it has just grown is
    // a lane the player may not have noticed opening.
    const lane = lanes[Math.min(lanes.length - 1, Math.floor(this.rng() * lanes.length))];
    this.strike = { lane, warnT: WARN_SECONDS, strikeT: STRIKE_SECONDS };
    return "warn";
  }
}

/**
 * The mark on the ground and the bolt above it.
 *
 * One object per storm rather than one per strike: there is only ever a single
 * strike alive, so this is moved and shown rather than built and thrown away —
 * a run passes through several tunnels and none of them should be allocating.
 *
 * The mark is drawn on the ground instead of in the air because the ground is
 * where the player is looking. A glow hanging in the sky is scenery; a lane
 * lighting up under their feet is an instruction.
 */
export function makeLightning() {
  const root = new THREE.Group();

  // Red, and specifically not amber.
  //
  // Amber was the first answer and it was wrong for a reason that only shows up
  // on the actual road: the lane lines are painted 0xf2d64b and the coins are
  // gold, so a wide warm strip laid down the middle of a lane does not read as
  // a warning at all — it reads as more road. The first person to see it asked
  // whether the yellow was the four-lane change.
  //
  // Nothing else on this track is red. That is the whole argument for it.
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2246,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  // Long, so it reads as 「이 레인」 rather than as a spot to step around, and
  // laid flat a hair above the deck to keep it off the road texture.
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(2, 34), markMaterial);
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.02;
  root.add(mark);

  const boltMaterial = new THREE.MeshBasicMaterial({
    color: WARN_COLOUR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 40, 0.9), boltMaterial);
  bolt.position.y = 20;
  root.add(bolt);

  root.visible = false;
  return { root, mark, markMaterial, bolt, boltMaterial };
}

/**
 * Point the marker at what the storm is doing.
 *
 * The warning pulses, and the pulse quickens as the strike closes: the player
 * should be able to tell how long is left without reading anything, because
 * there is nothing on this screen to read.
 *
 * @param {ReturnType<makeLightning>} rig
 * @param {LightningStorm} storm
 * @param {number} z where the runner is
 * @param {number} t seconds, for the pulse
 */
export function updateLightning(rig, storm, z, t) {
  const warning = storm.warning;
  const danger = storm.danger;
  const lane = warning?.lane ?? danger;
  if (lane == null) {
    rig.root.visible = false;
    return;
  }

  rig.root.visible = true;
  rig.root.position.set(laneX(lane), 0, z + 2);

  if (warning) {
    // The pulse brightens the mark; it must never be what makes it visible.
    // It was written the other way round first — opacity from 0.18 up — and at
    // the bottom of the swing the warning was, measured on a frame, not on the
    // screen at all. Every second of a telegraph has to be readable, because
    // the entire claim that this hazard is fair is that it was seen in time.
    const urgency = 5 + warning.progress * 13;
    const pulse = 0.5 + 0.5 * Math.sin(t * urgency);
    const base = 0.5 + warning.progress * 0.32;
    rig.markMaterial.color.setHex(WARN_COLOUR);
    rig.markMaterial.opacity = base * (0.78 + 0.22 * pulse);

    // The column comes up during the warning rather than only at the strike,
    // because a mark on the ground says where and says nothing about what. Shown
    // on its own it was read as something rising out of the road; the same
    // column standing over the lane the whole time it is charging is what makes
    // the sky the obvious source, and it is the second thing that separates
    // this from a road marking.
    rig.bolt.scale.y = 1;
    rig.boltMaterial.color.setHex(WARN_COLOUR);
    rig.boltMaterial.opacity = 0.12 + warning.progress * 0.3 * (0.6 + 0.4 * pulse);
  } else {
    // White the instant it lands, so the colour change alone says 「now」.
    rig.markMaterial.color.setHex(STRIKE_COLOUR);
    rig.markMaterial.opacity = 0.92;
    rig.boltMaterial.color.setHex(STRIKE_COLOUR);
    rig.boltMaterial.opacity = 0.95;
  }
}

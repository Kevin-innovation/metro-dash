import * as THREE from "three";
import { LANES } from "./config.js";
import { ALL_LANES } from "./patterns.js";

/**
 * The night storm.
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
 * Night only. It is the one zone dark enough for a flash to read as a flash,
 * and confining it there makes the storm something a run passes through rather
 * than weather it lives in.
 */

/** How long a strike is painted on the ground before it lands. */
export const WARN_SECONDS = 1.2;

/** How long the lane stays lethal once it does. */
export const STRIKE_SECONDS = 0.3;

/** Average seconds between strikes, and how far that wanders either way. */
export const STRIKE_PERIOD = 4.4;
export const STRIKE_SPREAD = 1.3;

/**
 * Seconds of night that pass before the first bolt.
 *
 * The zone change is already a lot to take in — the sky, the fog and the ground
 * all move at once — and a strike landing inside that is read as part of the
 * scenery rather than as something aimed at you.
 */
export const FIRST_STRIKE_AFTER = 2.2;

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
    this.wasNight = false;
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
   * Leaving the night puts everything back rather than letting a warning follow
   * the run out into daylight, where there is nothing on screen to explain it.
   *
   * @param {number} dt
   * @param {{ night: boolean }} opts
   * @returns {"warn"|"strike"|null} what happened this step, for the sound and
   *   the screen to answer
   */
  update(dt, { night }) {
    this.flash = Math.max(0, this.flash - dt * 3.4);

    if (!night) {
      if (this.wasNight) this.reset();
      return null;
    }
    if (!this.wasNight) {
      this.wasNight = true;
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

    const lane = ALL_LANES[Math.min(ALL_LANES.length - 1, Math.floor(this.rng() * ALL_LANES.length))];
    this.strike = { lane, warnT: WARN_SECONDS, strikeT: STRIKE_SECONDS };
    return "warn";
  }
}

/**
 * The mark on the ground and the bolt above it.
 *
 * One object per storm rather than one per strike: there is only ever a single
 * strike alive, so this is moved and shown rather than built and thrown away —
 * a run passes through several nights and none of them should be allocating.
 *
 * The mark is drawn on the ground instead of in the air because the ground is
 * where the player is looking. A glow hanging in the sky is scenery; a lane
 * lighting up under their feet is an instruction.
 */
export function makeLightning() {
  const root = new THREE.Group();

  // Amber while it is a warning, not the blue of the bolt itself. The mark is
  // not a picture of lightning, it is 「여기 서 있지 마라」, and every other
  // thing on this road that means that is warm — the barriers, the signs, the
  // hazard stripes. Pale blue on a bright road was also simply hard to see.
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0xffae1f,
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
    color: 0xdff1ff,
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
  rig.root.position.set(LANES[lane + 1] ?? 0, 0, z + 2);

  if (warning) {
    // The pulse brightens the mark; it must never be what makes it visible.
    // It was written the other way round first — opacity from 0.18 up — and at
    // the bottom of the swing the warning was, measured on a frame, not on the
    // screen at all. Every second of a telegraph has to be readable, because
    // the entire claim that this hazard is fair is that it was seen in time.
    const urgency = 5 + warning.progress * 13;
    const pulse = 0.5 + 0.5 * Math.sin(t * urgency);
    const base = 0.5 + warning.progress * 0.32;
    rig.markMaterial.color.setHex(0xffae1f);
    rig.markMaterial.opacity = base * (0.78 + 0.22 * pulse);
    rig.boltMaterial.opacity = 0;
  } else {
    // White the instant it lands, so the colour change alone says 「now」.
    rig.markMaterial.color.setHex(0xf2f8ff);
    rig.markMaterial.opacity = 0.92;
    rig.boltMaterial.opacity = 0.95;
  }
}

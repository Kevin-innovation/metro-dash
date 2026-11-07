/**
 * Procedural chiptune backing track.
 *
 * There is no audio file to load: a lookahead scheduler queues short oscillator
 * notes a beat ahead of the clock, and layers switch on as the run's phase
 * climbs, so the music thickens with the difficulty instead of looping flat.
 *
 * During the Christmas event the same scheduler plays a medley of carols. See
 * carols.js for the tune; the arrangement is here.
 */

import { CHORDS, MEDLEY_STEPS, carolStep } from "./carols.js";

/** Semitone offsets of a natural-minor scale, used for the arpeggio. */
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12];
const ROOT = 55; // A1
const BASS_PATTERN = [0, 0, 5, 0, 3, 3, 7, 5];
const ARP_PATTERN = [0, 4, 7, 4, 5, 7, 9, 7];

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Layers unlock as the run heats up; tempo rises with them. */
const LAYERS = [
  { phase: 0, bpm: 104, bass: true, arp: false, hat: false, lead: false },
  { phase: 1, bpm: 116, bass: true, arp: true, hat: false, lead: false },
  { phase: 2, bpm: 128, bass: true, arp: true, hat: true, lead: false },
  { phase: 3, bpm: 138, bass: true, arp: true, hat: true, lead: true },
  { phase: 4, bpm: 150, bass: true, arp: true, hat: true, lead: true },
];

/**
 * The carols keep to the same idea. The tune and the oom of the bass are there
 * from the first bar, because a carol nobody can hear yet is not a carol; the
 * rest arrives as the run heats up, and so does the pace.
 */
const CAROL_LAYERS = [
  { phase: 0, bpm: 116, pah: false, fullBells: false, octave: false },
  { phase: 1, bpm: 124, pah: true, fullBells: false, octave: false },
  { phase: 2, bpm: 134, pah: true, fullBells: true, octave: false },
  { phase: 3, bpm: 146, pah: true, fullBells: true, octave: true },
  { phase: 4, bpm: 158, pah: true, fullBells: true, octave: true },
];

export function layerFor(phaseId, layers = LAYERS) {
  let current = layers[0];
  for (const layer of layers) if (phaseId >= layer.phase) current = layer;
  return current;
}

/** Seconds of audio the scheduler keeps queued ahead of the playhead. */
const LOOKAHEAD = 0.18;
const TICK_MS = 40;

/** Where the music sits against the sound effects, under the same master. */
const BGM_LEVEL = 1;
/** Seconds between two coins before the next one starts the arpeggio again. */
const COIN_RUN_GAP = 0.7;
/** C major, for a bought coin sound when no carol is playing to follow. */
const PLAIN_TRIAD = [60, 64, 67];

export class Bgm {
  /** @param {AudioBus} bus shares the AudioContext with the sound effects */
  constructor(bus) {
    this.bus = bus;
    this.enabled = true;
    this.playing = false;
    this.step = 0;
    this.nextNoteAt = 0;
    this.phaseId = 0;
    this.timer = 0;
    this.gain = null;
    this.christmas = false;
  }

  /** Which music this run gets. Starts the medley over whenever it changes. */
  setChristmas(on) {
    if (this.christmas === on) return;
    this.christmas = on;
    this.step = 0;
  }

  /** Back to the top, for a new run. A pause carries on from where it was. */
  rewind() {
    this.step = 0;
  }

  get ctx() {
    return this.bus.ctx;
  }

  ensureGain() {
    if (!this.ctx || this.gain) return this.gain;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.bus.master);
    return this.gain;
  }

  start(phaseId = 0) {
    if (!this.enabled || this.playing) return;
    this.bus.resume();
    if (!this.ctx) return;
    this.ensureGain();
    this.playing = true;
    this.phaseId = phaseId;
    if (!this.christmas) this.step = 0;
    this.nextNoteAt = this.ctx.currentTime + 0.08;
    this.fade(BGM_LEVEL, 1.2);
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop({ fadeOut = 0.5 } = {}) {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = 0;
    this.fade(0, fadeOut);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop({ fadeOut: 0.25 });
  }

  setPhase(phaseId) {
    this.phaseId = phaseId;
  }

  /**
   * The note a coin plays: up through the chord the carol is on, an octave higher,
   * so a line of coins plays an arpeggio that belongs to the music under it.
   */
  coinHz() {
    const now = this.ctx?.currentTime ?? 0;
    this.coinRun = now - (this.coinAt ?? -1) < COIN_RUN_GAP ? (this.coinRun ?? 0) + 1 : 0;
    this.coinAt = now;
    const triad = this.christmas ? CHORDS[carolStep(this.step).chord].triad : PLAIN_TRIAD;
    return midiToHz(triad[this.coinRun % 3] + 12 * (1 + (Math.floor(this.coinRun / 3) % 2)));
  }

  /** Duck the music briefly so a crash or toast still cuts through. */
  duck(seconds = 0.6) {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    this.gain.gain.linearRampToValueAtTime(BGM_LEVEL, now + seconds);
  }

  fade(target, seconds) {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(target, now + seconds);
  }

  /** Queue every note that falls inside the lookahead window. */
  pump() {
    if (!this.playing || !this.ctx) return;
    const layer = layerFor(this.phaseId, this.christmas ? CAROL_LAYERS : LAYERS);
    const stepSeconds = 60 / layer.bpm / 2; // eighth notes
    const cycle = this.christmas ? MEDLEY_STEPS : 16;

    while (this.nextNoteAt < this.ctx.currentTime + LOOKAHEAD) {
      if (this.christmas) this.scheduleCarolStep(this.step, this.nextNoteAt, layer, stepSeconds);
      else this.scheduleStep(this.step, this.nextNoteAt, layer);
      this.nextNoteAt += stepSeconds;
      this.step = (this.step + 1) % cycle;
    }
  }

  /** One eighth note of carol: bell tune, oom-pah, and sleigh bells over it all. */
  scheduleCarolStep(step, when, layer, stepSeconds) {
    const { chord, offset, midi, length } = carolStep(step);
    const { root, triad } = CHORDS[chord];

    if (midi !== null) {
      // Rings past the note a little, the way a struck bell does.
      const duration = Math.max(0.22, length * stepSeconds * 1.15);
      this.bell(midi, when, duration, 0.17);
      if (layer.octave) this.bell(midi + 12, when, duration, 0.05);
    }

    // Oom on one and three, the root and then its fifth.
    if (offset === 0 || offset === 4) {
      const hz = midiToHz(offset === 0 ? root : root + 7);
      this.note({ hz, when, duration: 0.2, type: "triangle", gain: 0.3 });
    }
    // Pah on two and four.
    if (layer.pah && (offset === 2 || offset === 6)) {
      for (const tone of triad) {
        this.note({ hz: midiToHz(tone), when, duration: 0.13, type: "triangle", gain: 0.055 });
      }
    }

    // Sleigh bells: two high partials, on the beat and then on every eighth.
    if (layer.fullBells || offset % 2 === 0) {
      const accent = offset % 2 === 0 ? 1 : 0.55;
      this.note({ hz: 5400, when, duration: 0.05, type: "square", gain: 0.022 * accent });
      this.note({ hz: 7600, when, duration: 0.07, type: "square", gain: 0.016 * accent });
    }
  }

  /** A glockenspiel: the note, and a quick bright partial that dies first. */
  bell(midi, when, duration, gain) {
    const hz = midiToHz(midi);
    this.note({ hz, when, duration, type: "sine", gain });
    this.note({ hz: hz * 3, when, duration: Math.min(0.14, duration), type: "sine", gain: gain * 0.28 });
  }

  scheduleStep(step, when, layer) {
    const bar = step % 8;

    if (layer.bass) {
      this.note({
        hz: midiToHz(ROOT + BASS_PATTERN[bar]),
        when,
        duration: 0.16,
        type: "square",
        gain: 0.22,
      });
    }

    if (layer.arp && step % 2 === 0) {
      this.note({
        hz: midiToHz(ROOT + 24 + ARP_PATTERN[bar]),
        when,
        duration: 0.11,
        type: "triangle",
        gain: 0.1,
      });
    }

    if (layer.hat && step % 2 === 1) {
      this.note({ hz: 7400, when, duration: 0.035, type: "square", gain: 0.035 });
    }

    if (layer.lead && bar === 0) {
      const note = SCALE[(step / 2) % SCALE.length | 0];
      this.note({
        hz: midiToHz(ROOT + 36 + note),
        when,
        duration: 0.34,
        type: "sawtooth",
        gain: 0.055,
      });
    }
  }

  note({ hz, when, duration, type, gain }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, when);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}

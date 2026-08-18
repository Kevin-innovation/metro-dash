/**
 * Procedural chiptune backing track.
 *
 * There is no audio file to load: a lookahead scheduler queues short oscillator
 * notes a beat ahead of the clock, and layers switch on as the run's phase
 * climbs, so the music thickens with the difficulty instead of looping flat.
 */

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

export function layerFor(phaseId) {
  let current = LAYERS[0];
  for (const layer of LAYERS) if (phaseId >= layer.phase) current = layer;
  return current;
}

/** Seconds of audio the scheduler keeps queued ahead of the playhead. */
const LOOKAHEAD = 0.18;
const TICK_MS = 40;

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
    this.step = 0;
    this.nextNoteAt = this.ctx.currentTime + 0.08;
    this.fade(0.5, 1.2);
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

  /** Duck the music briefly so a crash or toast still cuts through. */
  duck(seconds = 0.6) {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    this.gain.gain.linearRampToValueAtTime(0.5, now + seconds);
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
    const layer = layerFor(this.phaseId);
    const stepSeconds = 60 / layer.bpm / 2; // eighth notes

    while (this.nextNoteAt < this.ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextNoteAt, layer);
      this.nextNoteAt += stepSeconds;
      this.step = (this.step + 1) % 16;
    }
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

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }

  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  beep(freq, dur = 0.12, type = "square", gain = 0.9) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  coin() {
    this.beep(980, 0.08, "square", 0.55);
    setTimeout(() => this.beep(1320, 0.1, "square", 0.45), 40);
  }

  jump() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.16);
  }

  slide() {
    this.beep(180, 0.16, "triangle", 0.35);
  }

  magnet() {
    this.beep(520, 0.12, "square", 0.5);
    setTimeout(() => this.beep(740, 0.16, "square", 0.4), 70);
  }

  crash() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  switchLane() {
    this.beep(440, 0.05, "triangle", 0.2);
  }

  slam() {
    this.beep(160, 0.1, "sawtooth", 0.4);
    setTimeout(() => this.beep(90, 0.12, "triangle", 0.3), 40);
  }

  mount() {
    this.beep(360, 0.08, "square", 0.4);
    setTimeout(() => this.beep(540, 0.12, "square", 0.35), 55);
  }

  hop() {
    this.beep(500, 0.06, "triangle", 0.28);
  }

  speedup() {
    this.beep(660, 0.08, "square", 0.45);
    setTimeout(() => this.beep(880, 0.1, "square", 0.4), 70);
    setTimeout(() => this.beep(1100, 0.14, "square", 0.35), 150);
  }
}

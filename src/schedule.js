import { EVENTS, EVENT_PERIOD, EVENT_SECONDS, FIRST_EVENT_AT } from "./events.js";
import { jitter, makeRng, shuffled } from "./rng.js";
import { ZONES, ZONE_FADE, blendLook } from "./zones.js";

/**
 * One run's layout: which zone is where, and which section starts when.
 *
 * Everything in here used to be a function of the clock alone. The tunnel began
 * at 34 seconds of every run ever played, the first section at 42, and the
 * sections then cycled in the order they are written in the table. It was
 * deliberate — two players' scores should measure the same thing — but the
 * consequence was that the course could be memorised, and a course that has
 * been memorised is recited rather than played. The top of the board stopped
 * moving.
 *
 * The fairness argument is kept, by shuffling rather than sampling. A shuffled
 * deck deals every card once per pass, so over a run everyone still meets each
 * section the same number of times and spends the same share of the run in
 * each zone. What nobody can know any more is which one is next, or exactly
 * when — and that is the part that was being memorised.
 *
 * Seeded, so a run can be replayed exactly: the fairness audit sweeps seeds,
 * the tests pin one, and a bug report is one number.
 */

/** How far a zone boundary may slide, as a share of that zone's length. */
const ZONE_JITTER = 0.25;
/** Shortest a zone may be cut to, whatever the jitter says. */
const ZONE_MIN_SECONDS = 14;
/** How far a section's start may slide from its slot, in seconds. */
const EVENT_JITTER = 9;

/**
 * The opening zone is not shuffled.
 *
 * The first half-minute is the tutorial patterns and a player's first look at
 * the game; starting one run in a tunnel and the next on a viaduct would make
 * the opening a different lesson every time. Everything after it is fair game.
 */
const OPENING_ZONE = "surface";

export class RunSchedule {
  /** @param {number} seed */
  constructor(seed = 0) {
    this.seed = seed >>> 0;
    this.zoneRng = makeRng(this.seed);
    this.eventRng = makeRng(this.seed ^ 0x9e3779b9);

    /** Zones as `{ zone, from, to }`, built out as the run asks for them. */
    this.zones = [];
    this.zoneDeck = [];
    const opening = ZONES.find((z) => z.id === OPENING_ZONE) ?? ZONES[0];
    this.zones.push({ zone: opening, from: 0, to: this.zoneLength(opening) });

    /** Sections as `{ event, from, to }`, likewise. */
    this.sections = [];
    this.eventDeck = [];
    this.nextSlot = FIRST_EVENT_AT;
  }

  zoneLength(zone) {
    const spread = zone.seconds * ZONE_JITTER;
    return Math.max(ZONE_MIN_SECONDS, zone.seconds + jitter(this.zoneRng, spread));
  }

  /**
   * Draw the next zone.
   *
   * Never the one just played: a shuffled deck can put the same card at the end
   * of one pass and the start of the next, and two adjacent stretches of the
   * same zone read as the boundary having failed rather than as a choice.
   */
  drawZone(previous) {
    if (!this.zoneDeck.length) this.zoneDeck = shuffled(this.zoneRng, ZONES);
    if (this.zoneDeck[0] === previous && this.zoneDeck.length > 1) {
      [this.zoneDeck[0], this.zoneDeck[1]] = [this.zoneDeck[1], this.zoneDeck[0]];
    }
    return this.zoneDeck.shift();
  }

  extendZones(until) {
    while (this.zones[this.zones.length - 1].to < until) {
      const last = this.zones[this.zones.length - 1];
      const zone = this.drawZone(last.zone);
      this.zones.push({ zone, from: last.to, to: last.to + this.zoneLength(zone) });
    }
  }

  /** The zone in force at `t`, and the one after it. */
  zoneSpanAt(t) {
    this.extendZones(t + ZONE_FADE + 1);
    const at = Math.max(0, t);
    for (let i = 0; i < this.zones.length; i++) {
      if (at < this.zones[i].to) return { current: this.zones[i], next: this.zones[i + 1] };
    }
    const last = this.zones[this.zones.length - 1];
    return { current: last, next: last };
  }

  zoneAt(t) {
    return this.zoneSpanAt(t).current.zone;
  }

  /**
   * Where the run sits between two zones.
   *
   * The change is spread over ZONE_FADE seconds *before* the boundary, so the
   * light is already shifting as the tunnel mouth comes into view rather than
   * snapping the moment the runner crosses a line.
   */
  zoneBlend(t) {
    const { current, next } = this.zoneSpanAt(t);
    if (!next || next === current) return { from: current.zone, to: current.zone, k: 0 };
    const start = current.to - ZONE_FADE;
    if (t <= start) return { from: current.zone, to: next.zone, k: 0 };
    return { from: current.zone, to: next.zone, k: Math.min(1, (t - start) / ZONE_FADE) };
  }

  lookAt(t) {
    const { from, to, k } = this.zoneBlend(t);
    return blendLook(from, to, k);
  }

  /**
   * The next roofed stretch, and how long until it starts.
   *
   * Something has to come *towards* the runner or arriving somewhere reads as
   * the world going dark. Null when the next stretch is open sky, or when we
   * are already under a roof.
   */
  nextCeilingAt(t) {
    const { current, next } = this.zoneSpanAt(t);
    if (!next || next === current) return null;
    if (current.zone.ceiling !== null || next.zone.ceiling === null) return null;
    return { at: current.to, seconds: current.to - t };
  }

  /** Never the same section twice running; see drawZone. */
  drawEvent(previous) {
    if (!this.eventDeck.length) this.eventDeck = shuffled(this.eventRng, EVENTS);
    if (this.eventDeck[0] === previous && this.eventDeck.length > 1) {
      [this.eventDeck[0], this.eventDeck[1]] = [this.eventDeck[1], this.eventDeck[0]];
    }
    return this.eventDeck.shift();
  }

  extendSections(until) {
    while (this.nextSlot <= until) {
      const last = this.sections[this.sections.length - 1];
      const event = this.drawEvent(last?.event);
      const seconds = event.seconds ?? EVENT_SECONDS;
      // Jittered around the slot, never before the previous one has finished.
      const earliest = last ? last.to + 6 : FIRST_EVENT_AT;
      const from = Math.max(earliest, this.nextSlot + jitter(this.eventRng, EVENT_JITTER));
      this.sections.push({ event, from, to: from + seconds, seconds });
      this.nextSlot += EVENT_PERIOD;
    }
  }

  /** The section running at `t`, or null. */
  eventAt(t) {
    if (!(t >= 0)) return null;
    this.extendSections(t + EVENT_PERIOD);
    for (const section of this.sections) {
      if (t < section.from) return null;
      if (t < section.to) {
        return {
          event: section.event,
          elapsed: t - section.from,
          seconds: section.seconds,
          remaining: section.to - t,
        };
      }
    }
    return null;
  }
}

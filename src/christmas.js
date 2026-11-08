/**
 * The Christmas edition.
 *
 * Kept pure, for the same reason chuseok.js is: the browser, the spawner, the
 * score validator and the tests all need the same dates and wheel.
 *
 * November 7 through December 31, 2026, KST. Midnight KST is 15:00 UTC on the
 * day before. Outside those dates, `npm run dev` with `?christmas` in the URL
 * turns it on locally; see main.js. That switch is compiled out of a production
 * build.
 */

export const CHRISTMAS_TITLE = "MetDash · Christmas Edition";
export const CHRISTMAS_EVENT_FROM = Date.UTC(2026, 10, 6, 15, 0, 0);
export const CHRISTMAS_EVENT_TO = Date.UTC(2026, 11, 31, 15, 0, 0);

let preview = false;

/** Dev-server only. See main.js. */
export function setChristmasPreview(on) {
  preview = on;
}

/**
 * Whether the event is running at `ms`. Start inclusive, end exclusive.
 *
 * Read when a run starts and when the title comes back, never during a run, so
 * a run that crosses a boundary finishes under the rules it started with.
 */
export function christmasAt(ms = Date.now(), from = CHRISTMAS_EVENT_FROM, to = CHRISTMAS_EVENT_TO) {
  if (preview) return true;
  return ms >= from && ms < to;
}

/**
 * What the crow is during the event: the same trap on the same clock, with the
 * same antidote and 허수아비 perk, but weather rather than a bird. Only how it
 * looks and what it is called changes, so the difficulty stays where it was.
 */
export const BLIZZARD = { name: "눈보라", icon: "🌨️", colour: "#7dd3fc" };

export const GIFT_FIRST_MIN = 25;
export const GIFT_FIRST_MAX = 35;
export const GIFT_GAP_MIN = 40;
export const GIFT_GAP_MAX = 55;

/**
 * The Santa raid: a line, the sleigh, a countdown, then one golden parcel.
 *
 * Paid as ordinary run coins, which the server checks against distance. The
 * daily allowance for client claims is already spent in full by a good day's
 * missions, so paying this from it would quietly cost someone their mission coins.
 */
export const RAID_FIRST_MIN = 50;
export const RAID_FIRST_MAX = 70;
export const RAID_GAP_MIN = 70;
export const RAID_GAP_MAX = 100;
export const RAID_MAX_PER_RUN = 3;
export const SANTA_DROP_COINS = 1500;
/** How long the line stands before the count starts, and where the count starts. */
export const RAID_ANNOUNCE_SECONDS = 2;
export const RAID_COUNT_FROM = 3;

const between = (rng, low, high) => low + Math.floor(rng() * (high - low + 1));

/** Seconds of play before a run's first gift. */
export function firstGiftAt(rng = Math.random) {
  return between(rng, GIFT_FIRST_MIN, GIFT_FIRST_MAX);
}

/** Seconds of play until the next gift after one has appeared. */
export function nextGiftGap(rng = Math.random) {
  return between(rng, GIFT_GAP_MIN, GIFT_GAP_MAX);
}

/** Seconds of play before a run's first raid. */
export function firstRaidAt(rng = Math.random) {
  return between(rng, RAID_FIRST_MIN, RAID_FIRST_MAX);
}

/** Seconds of play until the next raid after one has come. */
export function nextRaidGap(rng = Math.random) {
  return between(rng, RAID_GAP_MIN, RAID_GAP_MAX);
}

/**
 * The raid's clock: waiting, then the line, then the count, then waiting for the
 * parcel to be placed. Ticks on play time alone, so a pause or a wheel holds it.
 */
export class SantaRaid {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.phase = "waiting";
    this.at = firstRaidAt(rng);
    this.t = 0;
    this.count = 0;
    this.raids = 0;
  }

  /**
   * @param {number} dt seconds of play
   * @param {number} runTime
   * @param {boolean} canStart whether there is open sky long enough for all of it.
   *   Only asked before it starts: a count already running is not called off.
   * @returns {{ type: "announce" } | { type: "count", value: number } | { type: "drop" } | null}
   */
  update(dt, runTime, canStart) {
    if (this.phase === "waiting") {
      if (this.raids >= RAID_MAX_PER_RUN || runTime < this.at || !canStart) return null;
      this.raids += 1;
      this.phase = "announce";
      this.t = RAID_ANNOUNCE_SECONDS;
      return { type: "announce" };
    }
    if (this.phase === "dropping") return null;

    this.t -= dt;
    if (this.t > 0) return null;
    this.t += 1;
    this.count = this.phase === "announce" ? RAID_COUNT_FROM : this.count - 1;
    this.phase = "count";
    if (this.count > 0) return { type: "count", value: this.count };
    this.phase = "dropping";
    return { type: "drop" };
  }

  /** Whether a raid is under way, or would be if the sky allowed it. */
  due(runTime) {
    return this.phase !== "waiting" || (this.raids < RAID_MAX_PER_RUN && runTime >= this.at);
  }

  /** The parcel is on the track, so the next raid can be scheduled. */
  dropped(runTime) {
    this.phase = "waiting";
    this.at = runTime + nextRaidGap(this.rng);
  }
}

const multiplier = (value, seconds, weight, extra = {}) => ({
  id: `gift-x${value}`,
  tone: "good",
  theme: "christmas",
  icon: "🎁",
  label: `점수 ×${value}`,
  detail: `${seconds}초`,
  weight,
  effect: { type: "multiplier", value, seconds },
  ...extra,
});

const GIFT_SECONDS = 8;

/**
 * One hundred tickets, and every result that pays lasts the same eight seconds,
 * so the number on the face is the whole of what was won.
 *
 * In reel order, which has no effect on the odds. The big faces are spaced between
 * small ones so a slowing reel is always creeping up on something. Better than one
 * spin in three pays ×10 or more: this is what a gift is worth finding.
 */
export const CHRISTMAS_SLOT_FACES = [
  {
    id: "gift-miss",
    tone: "none",
    theme: "christmas",
    icon: "🧦",
    label: "꽝",
    detail: "다음 선물을 노려보세요!",
    weight: 8,
    effect: { type: "none" },
  },
  multiplier(12, GIFT_SECONDS, 10),
  multiplier(3, GIFT_SECONDS, 19),
  multiplier(99, GIFT_SECONDS, 0.4, { icon: "👑", jackpot: true }),
  multiplier(2, GIFT_SECONDS, 19),
  multiplier(20, GIFT_SECONDS, 6, { icon: "🌟" }),
  multiplier(5, GIFT_SECONDS, 15),
  multiplier(15, GIFT_SECONDS, 7),
  multiplier(10, GIFT_SECONDS, 15.6),
];

const isExtreme = (face) => face.jackpot || face.effect.type === "none";
const EXTREME_TICKETS = CHRISTMAS_SLOT_FACES.filter(isExtreme).reduce((sum, face) => sum + face.weight, 0);

/**
 * A face's tickets out of one hundred.
 *
 * `risk` is the 블랙 산타's perk: it multiplies the odds of both a miss and ×99,
 * and the faces in between shrink to make room, so "double" is exactly double.
 */
export function christmasTickets(face, risk = 1) {
  if (isExtreme(face)) return face.weight * risk;
  return (face.weight * (100 - EXTREME_TICKETS * risk)) / (100 - EXTREME_TICKETS);
}

/**
 * @param {() => number} rng
 * @param {number} [risk] see christmasTickets
 */
export function spinChristmas(rng = Math.random, risk = 1) {
  let ticket = rng() * 100;
  for (let index = 0; index < CHRISTMAS_SLOT_FACES.length; index++) {
    ticket -= christmasTickets(CHRISTMAS_SLOT_FACES[index], risk);
    if (ticket < 0) return { face: CHRISTMAS_SLOT_FACES[index], index };
  }
  const index = CHRISTMAS_SLOT_FACES.length - 1;
  return { face: CHRISTMAS_SLOT_FACES[index], index };
}

/**
 * How often a spin that is not ×99 is made to crawl past it first.
 *
 * One in ten. At one in two it stopped being a thrill and became the wheel
 * taunting the player every other spin.
 */
export const WHEEL_TEASE_CHANCE = 0.1;

/** ×99 always gets the slow walk, or the slow walk would give away that it missed. */
export function wheelTeases(face, rng = Math.random) {
  return Boolean(face.jackpot) || rng() < WHEEL_TEASE_CHANCE;
}

/**
 * The reel's route when it teases, in faces from the top of the strip.
 *
 * A near miss stops ×99 dead under the pointer, drags it to the very edge, and
 * drops into the next face. The real thing hangs on the line just before ×99 and
 * falls in. Both take the same time and start the same way, so until the last half
 * second nobody can tell which they are watching. The winner was drawn before the
 * reel moved; this only decides how it arrives.
 *
 * @param {number} landing the face the reel stops on
 * @param {boolean} jackpot whether that face is ×99
 */
export function teasePath(landing, jackpot) {
  const legs = jackpot
    ? [
        [landing - 1.35, 3000, "cubic-bezier(0.12, 0.7, 0.2, 1)"],
        [landing - 0.62, 1100, "ease-out"],
        [landing - 0.52, 1000, "ease-in-out"],
        [landing, 420, "ease-in"],
      ]
    : [
        [landing - 1.35, 3000, "cubic-bezier(0.12, 0.7, 0.2, 1)"],
        [landing - 1, 1100, "ease-out"],
        [landing - 0.54, 1000, "ease-in-out"],
        [landing, 420, "ease-in"],
      ];
  const ms = legs.reduce((sum, [, duration]) => sum + duration, 0);
  let elapsed = 0;
  const frames = [{ at: 0, offset: 0, easing: legs[0][2] }];
  legs.forEach(([at, duration], i) => {
    elapsed += duration;
    frames.push({ at, offset: elapsed / ms, easing: legs[i + 1]?.[2] ?? "linear" });
  });
  return { ms, crawlAt: legs[0][1], frames };
}

/**
 * The three events the track deals in turn. One at a time, never during a raid or
 * a blizzard, and each with the raid's line and count first, so nobody is asked
 * to react to something that started without warning.
 */
export const TRACK_EVENT_FIRST_MIN = 35;
export const TRACK_EVENT_FIRST_MAX = 45;
export const TRACK_EVENT_GAP_MIN = 30;
export const TRACK_EVENT_GAP_MAX = 45;
export const TRACK_EVENT_KINDS = ["elf", "avalanche", "ice"];
export const TRACK_EVENT_SECONDS = { elf: 10.5, avalanche: 10, ice: 8 };
/** From the line going up to the event starting. */
export const TRACK_EVENT_LEAD_SECONDS = RAID_ANNOUNCE_SECONDS + RAID_COUNT_FROM;
/** The whole of the longest one, line and count included: how much open sky to ask for. */
export const TRACK_EVENT_CLEAR_SECONDS = TRACK_EVENT_LEAD_SECONDS + 11;

/** A gift is worth a little, all of them and the sack a lot. */
export const ELF_GIFTS = 8;
export const ELF_GIFT_COINS = 60;
export const ELF_SACK_COINS = 500;
export const AVALANCHE_COINS = 1000;
/** Quicker, but well inside the ×1.18 the validator already allows the wheel. */
export const AVALANCHE_SPEED = 1.15;
export const ICE_CLEAR_COINS = 100;
/** A lane change takes about twice as long to settle. Mild, because it can kill. */
export const ICE_LANE_SCALE = 0.45;

export const AURORA_COMBO = 15;
export const AURORA_SECONDS = 8;
export const AURORA_COOLDOWN = 30;
/** Extra coins per coin picked up. */
export const AURORA_COIN_BONUS = 1;

export class TrackEvents {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.phase = "waiting";
    this.at = between(rng, TRACK_EVENT_FIRST_MIN, TRACK_EVENT_FIRST_MAX);
    this.kind = null;
    this.t = 0;
    this.count = 0;
    this.deck = [];
  }

  get busy() {
    return this.phase !== "waiting";
  }

  /** Each of the three before any of them twice, in a different order each time. */
  deal() {
    if (!this.deck.length) {
      const deck = [...TRACK_EVENT_KINDS];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      this.deck = deck;
    }
    return this.deck.shift();
  }

  /**
   * @param {number} dt seconds of play
   * @param {number} runTime
   * @param {boolean} canStart only asked before one starts: a count is not called off.
   * @returns {{ type: "announce" | "start" | "end", kind: string } | { type: "count", value: number } | null}
   */
  update(dt, runTime, canStart) {
    if (this.phase === "waiting") {
      if (runTime < this.at || !canStart) return null;
      this.kind = this.deal();
      this.phase = "announce";
      this.t = RAID_ANNOUNCE_SECONDS;
      return { type: "announce", kind: this.kind };
    }

    this.t -= dt;
    if (this.t > 0) return null;

    if (this.phase === "active") {
      const { kind } = this;
      this.phase = "waiting";
      this.kind = null;
      this.at = runTime + between(this.rng, TRACK_EVENT_GAP_MIN, TRACK_EVENT_GAP_MAX);
      return { type: "end", kind };
    }

    this.t += 1;
    this.count = this.phase === "announce" ? RAID_COUNT_FROM : this.count - 1;
    this.phase = "count";
    if (this.count > 0) return { type: "count", value: this.count };
    this.phase = "active";
    this.t = TRACK_EVENT_SECONDS[this.kind];
    return { type: "start", kind: this.kind };
  }
}

/** The reward for a long combo: it lights up at the threshold and dies with the combo. */
export class Aurora {
  constructor() {
    this.t = 0;
    this.cooldown = 0;
  }

  get active() {
    return this.t > 0;
  }

  /** @returns {"start" | "end" | "broken" | null} */
  update(dt, combo, canStart) {
    if (this.t > 0) {
      this.t -= dt;
      const broken = combo <= 0;
      if (this.t > 0 && !broken) return null;
      this.t = 0;
      this.cooldown = AURORA_COOLDOWN;
      return broken ? "broken" : "end";
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || combo < AURORA_COMBO || !canStart) return null;
    this.t = AURORA_SECONDS;
    return "start";
  }
}

/**
 * How lit the dark city is, by combo: first the bulbs on the walls, then the
 * windows, and last the trees. Each runs 0 to 1. Keeping a combo going is what
 * turns the lights on, and losing it lets the avenue go dark again.
 */
export function cityLight(combo) {
  const part = (from, to) => Math.min(1, Math.max(0, (combo - from) / (to - from)));
  return { walls: part(0, 5), towers: part(3, 15), trees: part(15, 30) };
}

/** The run is a journey north. Metres are where each stretch begins. */
export const JOURNEY = [
  { at: 0, id: "city", name: "뉴욕" },
  { at: 2000, id: "forest", name: "눈 덮인 숲" },
  { at: 5000, id: "arctic", name: "북극 들판" },
];
export const NORTH_POLE_METRES = 6000;
export const NORTH_POLE_COINS = 2000;

export function journeyStage(distance) {
  let index = 0;
  JOURNEY.forEach((stage, i) => {
    if (distance >= stage.at) index = i;
  });
  return index;
}

/** The power-ups in their Christmas clothes. What they do does not change. */
export const CHRISTMAS_POWERUP_LOOK = {
  jetpack: { name: "하늘 썰매", icon: "🛷" },
  magnet: { name: "산타 자루", icon: "🎒" },
  sneakers: { name: "루돌프 부츠", icon: "🥾" },
  focus: { name: "방울 질주", icon: "🔔" },
};

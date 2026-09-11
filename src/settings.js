/**
 * Player settings and the render-quality ladder.
 *
 * Quality is a single tier that fans out into concrete renderer knobs, so a
 * slow device degrades along one predictable axis instead of a dozen flags.
 */
export const QUALITY_TIERS = ["low", "medium", "high"];

/**
 * `screenBlur` gates the one effect that costs the compositor rather than the
 * GPU: a backdrop-filter over the canvas forces a readback of the whole frame,
 * which is exactly the wrong thing to ask of the device that was already too
 * slow to hold its tier. The crow's haze is in the fog and the lights as well,
 * so switching this off dims and thickens the world without blurring it.
 */

/**
 * Sight lines, measured in seconds of track rather than in metres.
 *
 * They were metres, and metres are the wrong unit here for the same reason
 * every other number in this game is written in seconds: how hard a run is to
 * read depends on how long a thing is visible for, not on how far away it is.
 *
 * At 56 m/s a 165-metre fog was 2.95 seconds of warning, and the spawner places
 * patterns 2.35 seconds ahead — one comfortable step inside the fog, so a
 * layout was always visible from the moment it existed. Doubling the opening
 * speed would have made that same 165 metres 2.06 seconds: patterns spawning
 * *inside* the murk and stepping out of it, and a tunnel (which multiplies the
 * fog by 0.42) down under a second of warning. Nothing about the timing would
 * have been unfair — every gap is still the same fraction of a second — but it
 * would have been unfair to look at, which is the same thing to a player.
 *
 * The numbers below are each tier's old metres divided by the old top speed, so
 * the view at 56 m/s is pixel-for-pixel what it always was. It is the same
 * sight line written in the unit that keeps it true at any speed.
 *
 * `drawSeconds` is the camera's far plane on the same basis, kept well past the
 * fog so nothing is ever clipped before it has finished fading out.
 */
export const QUALITY_PROFILES = {
  low: {
    label: "낮음",
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    particleBudget: 60,
    speedLines: false,
    screenBlur: false,
    fogSeconds: [0.61, 2.14],
    drawSeconds: 2.7,
  },
  medium: {
    label: "보통",
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    particleBudget: 160,
    speedLines: true,
    screenBlur: true,
    fogSeconds: [0.86, 2.95],
    drawSeconds: 3.75,
  },
  high: {
    label: "높음",
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    particleBudget: 260,
    speedLines: true,
    screenBlur: true,
    fogSeconds: [1.04, 3.57],
    drawSeconds: 4.64,
  },
};

/**
 * A key bound to the hoverboard, or null for the double-tap it has always been.
 *
 * The gesture is two quick jumps, which is the same on a keyboard and under a
 * thumb and costs no extra key. It is also a gesture some people simply cannot
 * make reliably, and on a school keyboard the second press is the one that gets
 * eaten. So the double-tap stays as the default and this is an alternative
 * rather than a replacement: bind a key and it deploys the board outright,
 * while two quick jumps go on working for everyone who never opens this screen.
 *
 * Stored as a KeyboardEvent.code — "KeyF", "ShiftLeft" — because that is the
 * one identifier that survives a Korean keyboard layout being toggled mid-run.
 */
const BOARD_KEY_PATTERN = /^[A-Za-z0-9]{1,24}$/;

export const DEFAULT_SETTINGS = {
  sfx: true,
  music: true,
  haptics: true,
  /** "auto" lets the governor pick; anything else pins the tier. */
  quality: "auto",
  /** KeyboardEvent.code, or null for the double-tap jump. */
  boardKey: null,
};

/** Keys the game already spends, which a board binding must not steal. */
export const RESERVED_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "KeyP",
  "Escape",
  "Enter",
  "Tab",
]);

export function isBindableKey(code) {
  return typeof code === "string" && BOARD_KEY_PATTERN.test(code) && !RESERVED_KEYS.has(code);
}

/** What a bound key is called on screen. "KeyF" is not a label. */
export function keyLabel(code) {
  if (!code) return "점프 두 번";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `숫자패드 ${code.slice(6)}`;
  return code;
}

export function normalizeSettings(raw) {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  return {
    sfx: typeof raw.sfx === "boolean" ? raw.sfx : base.sfx,
    music: typeof raw.music === "boolean" ? raw.music : base.music,
    haptics: typeof raw.haptics === "boolean" ? raw.haptics : base.haptics,
    quality:
      raw.quality === "auto" || QUALITY_TIERS.includes(raw.quality) ? raw.quality : base.quality,
    // A binding that is no longer allowed — a key the game has since taken for
    // itself — falls back to the gesture rather than to nothing at all.
    boardKey: isBindableKey(raw.boardKey) ? raw.boardKey : base.boardKey,
  };
}

export function qualityProfile(tier) {
  return QUALITY_PROFILES[tier] ?? QUALITY_PROFILES.medium;
}

/** Frame rate below which the governor gives up quality to keep motion smooth. */
export const DOWNGRADE_FPS = 46;
/** Frame rate that must be sustained before the governor tries to climb back. */
export const UPGRADE_FPS = 58;
/** Seconds of sustained evidence required before each kind of change. */
export const DOWNGRADE_AFTER = 1.5;
export const UPGRADE_AFTER = 8;

/**
 * Watches frame times and moves the quality tier up or down.
 *
 * Downgrades react quickly (a stuttering game is unplayable now) while upgrades
 * need long, sustained headroom — the asymmetry is what stops it oscillating
 * between two tiers forever.
 */
export class QualityGovernor {
  constructor(startTier = "high") {
    this.tier = QUALITY_TIERS.includes(startTier) ? startTier : "medium";
    this.belowFor = 0;
    this.aboveFor = 0;
    /** Tiers already proven too heavy are never retried automatically. */
    this.ceiling = QUALITY_TIERS.length - 1;
  }

  reset(tier = this.tier) {
    this.tier = tier;
    this.belowFor = 0;
    this.aboveFor = 0;
  }

  /**
   * @param {number} dt seconds since the previous frame
   * @returns {string|null} the new tier if it changed
   */
  sample(dt) {
    if (dt <= 0) return null;
    const fps = 1 / dt;
    const index = QUALITY_TIERS.indexOf(this.tier);

    if (fps < DOWNGRADE_FPS) {
      this.belowFor += dt;
      this.aboveFor = 0;
    } else if (fps > UPGRADE_FPS) {
      this.aboveFor += dt;
      this.belowFor = 0;
    } else {
      this.belowFor = Math.max(0, this.belowFor - dt * 0.5);
      this.aboveFor = Math.max(0, this.aboveFor - dt * 0.5);
    }

    if (this.belowFor >= DOWNGRADE_AFTER && index > 0) {
      // Remember that this tier could not hold, so we do not climb back into it.
      this.ceiling = Math.min(this.ceiling, index - 1);
      this.reset(QUALITY_TIERS[index - 1]);
      return this.tier;
    }

    if (this.aboveFor >= UPGRADE_AFTER && index < this.ceiling) {
      this.reset(QUALITY_TIERS[index + 1]);
      return this.tier;
    }

    return null;
  }
}

/** Best starting guess before any frames have been measured. */
export function guessStartTier({ deviceMemory, hardwareConcurrency, isMobile } = {}) {
  if (isMobile) return "medium";
  if (typeof deviceMemory === "number" && deviceMemory <= 4) return "medium";
  if (typeof hardwareConcurrency === "number" && hardwareConcurrency <= 4) return "medium";
  return "high";
}

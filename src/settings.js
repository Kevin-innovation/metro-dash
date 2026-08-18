/**
 * Player settings and the render-quality ladder.
 *
 * Quality is a single tier that fans out into concrete renderer knobs, so a
 * slow device degrades along one predictable axis instead of a dozen flags.
 */
export const QUALITY_TIERS = ["low", "medium", "high"];

export const QUALITY_PROFILES = {
  low: {
    label: "낮음",
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    particleBudget: 60,
    speedLines: false,
    fog: [34, 120],
    drawDistance: 150,
  },
  medium: {
    label: "보통",
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    particleBudget: 160,
    speedLines: true,
    fog: [48, 165],
    drawDistance: 210,
  },
  high: {
    label: "높음",
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    particleBudget: 260,
    speedLines: true,
    fog: [58, 200],
    drawDistance: 260,
  },
};

export const DEFAULT_SETTINGS = {
  sfx: true,
  music: true,
  haptics: true,
  /** "auto" lets the governor pick; anything else pins the tier. */
  quality: "auto",
};

export function normalizeSettings(raw) {
  const base = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  return {
    sfx: typeof raw.sfx === "boolean" ? raw.sfx : base.sfx,
    music: typeof raw.music === "boolean" ? raw.music : base.music,
    haptics: typeof raw.haptics === "boolean" ? raw.haptics : base.haptics,
    quality:
      raw.quality === "auto" || QUALITY_TIERS.includes(raw.quality) ? raw.quality : base.quality,
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

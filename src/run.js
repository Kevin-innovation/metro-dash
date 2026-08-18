import { applyMetrics, missionReward, rollMissions } from "./missions.js";
import {
  activatePowerup,
  clearPowerups,
  createPowerupState,
  isActive,
  powerupScoreMultiplier,
  tickPowerups,
} from "./powerups.js";
import { rankAt, runXp } from "./progression.js";
import {
  COMBO_WINDOW,
  NEAR_MISS_BONUS,
  coinGain,
  distanceGain,
  mountBonus,
  roofRideGain,
  scoreMultiplier,
  totalScore,
} from "./scoring.js";

/**
 * Everything numeric about the run in progress: score, combo, power-up timers,
 * the stats missions read, and committing all of it to the profile.
 *
 * Deliberately free of Three.js and the DOM — the Game owns presentation, this
 * owns bookkeeping, and the split is what makes the banking rules testable.
 */
export class Run {
  /** @param {import("./save.js").SaveStore} store */
  constructor(store) {
    this.store = store;
    this.powerups = createPowerupState();
    this.reset();
  }

  reset() {
    this.scoreDist = 0;
    this.scoreCoins = 0;
    this.scoreBonus = 0;
    this.coins = 0;
    this.combo = 0;
    this.comboMax = 0;
    this.comboT = 0;
    this.distance = 0;
    this.metrics = { mounts: 0, nearMisses: 0, powerups: 0, jetpacks: 0 };
    // A run is banked when the player dies and again when they leave the card,
    // so progress is always committed as a delta against this.
    this.banked = { coins: 0, distance: 0, xp: 0, ...this.metrics };
    this.runCounted = false;
    this.runClosed = false;
    clearPowerups(this.powerups);
  }

  get score() {
    return totalScore(this.scoreDist, this.scoreCoins, this.scoreBonus);
  }

  /** Combo tier times any power-up bonus. */
  multiplier() {
    return scoreMultiplier(this.combo, powerupScoreMultiplier(this.powerups));
  }

  bumpCombo() {
    this.combo += 1;
    this.comboT = COMBO_WINDOW;
    if (this.combo > this.comboMax) this.comboMax = this.combo;
  }

  /** @returns {string[]} power-ups that expired on this step */
  advance(dt, { travelled, mounted }) {
    this.distance += travelled;
    const multiplier = this.multiplier();
    this.scoreDist += distanceGain(travelled) * multiplier;
    // Riding a roof is the risky line, so it pays on top of plain distance.
    if (mounted) this.scoreDist += roofRideGain(travelled) * multiplier;

    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    return tickPowerups(this.powerups, dt);
  }

  /** @returns {number} points awarded, for the floating "+N" readout */
  addCoin() {
    this.bumpCombo();
    this.coins += 1;
    const gain = coinGain(this.combo) * this.multiplier();
    this.scoreCoins += gain;
    return gain;
  }

  addMount(isHop) {
    this.scoreBonus += mountBonus(isHop) * this.multiplier();
    this.bumpCombo();
    if (!isHop) this.metrics.mounts += 1;
  }

  addNearMiss() {
    this.metrics.nearMisses += 1;
    this.bumpCombo();
    this.scoreBonus += NEAR_MISS_BONUS * this.multiplier();
  }

  addPowerup(id, level) {
    activatePowerup(this.powerups, id, level);
    this.metrics.powerups += 1;
    if (id === "jetpack") this.metrics.jetpacks += 1;
  }

  powerupActive(id) {
    return isActive(this.powerups, id);
  }

  clearPowerups() {
    clearPowerups(this.powerups);
  }

  /**
   * Commit run progress to the profile.
   *
   * Called on death and again when the run is finally closed out, so
   * everything is banked as a delta against what was already committed.
   * Missions with `scope: "run"` take the best single-run reading and are
   * idempotent; cumulative ones only ever see the new increment.
   *
   * @param {boolean} final marks the run as over for the run counter
   */
  bank(final = false) {
    // Once a run is closed its readings are stale. Applying them again would
    // credit whatever missions were dealt as replacements.
    if (this.runClosed) return { completed: [], reward: { coins: 0, xp: 0 } };
    if (final) this.runClosed = true;

    const save = this.store.data;
    const score = this.score;
    const coinsDelta = this.coins - this.banked.coins;
    const distanceDelta = this.distance - this.banked.distance;
    const xpDelta = runXp(score) - this.banked.xp;
    const deltas = {
      mounts: this.metrics.mounts - this.banked.mounts,
      nearMisses: this.metrics.nearMisses - this.banked.nearMisses,
      powerups: this.metrics.powerups - this.banked.powerups,
      jetpacks: this.metrics.jetpacks - this.banked.jetpacks,
    };

    if (coinsDelta > 0) this.store.addCoins(coinsDelta);
    if (xpDelta > 0) this.store.addXp(xpDelta);
    this.store.recordBest(score);
    save.totalDistance += Math.max(0, Math.floor(distanceDelta));
    save.totalCoins += Math.max(0, Math.floor(coinsDelta));
    if (final && !this.runCounted) {
      this.runCounted = true;
      save.runs += 1;
    }

    this.banked = {
      coins: this.coins,
      distance: this.distance,
      xp: runXp(score),
      ...this.metrics,
    };

    const { missions, completed } = applyMetrics(save.missions, {
      coins: this.coins,
      distance: Math.floor(this.distance),
      comboMax: this.comboMax,
      score: Math.floor(score),
      ...deltas,
    });

    save.missions = missions;
    const reward = missionReward(completed);
    if (completed.length) {
      save.missionsDone += completed.length;
      this.store.addCoins(reward.coins);
      this.store.addXp(reward.xp);
    }

    // Replacements are dealt only once the run is genuinely over. Handing them
    // out any earlier would let this run's totals retroactively complete a
    // mission that was never played for.
    if (final) this.dealReplacements();

    this.store.flush();
    return { completed, reward };
  }

  dealReplacements() {
    const save = this.store.data;
    const cleared = save.missions.filter((m) => m.progress >= m.target);
    if (!cleared.length) return;
    const keep = save.missions.filter((m) => m.progress < m.target);
    const tier = Math.min(2, Math.floor((rankAt(save.xp).level - 1) / 3));
    save.missions = [...keep, ...rollMissions(keep.map((m) => m.id), cleared.length, tier)];
  }
}

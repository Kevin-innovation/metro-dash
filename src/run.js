import { MISSION_TIERS, applyMetrics, missionReward, rollMissions } from "./missions.js";
import {
  activatePowerup,
  clearPowerups,
  createPowerupState,
  isActive,
  powerupScoreMultiplier,
  tickPowerups,
} from "./powerups.js";
import { missionTier, runXp } from "./progression.js";
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
    /** Seconds survived and metres ridden on roofs, both single-run goals. */
    this.seconds = 0;
    this.roofDistance = 0;
    this.metrics = {
      mounts: 0,
      nearMisses: 0,
      powerups: 0,
      jetpacks: 0,
      magnets: 0,
      doubles: 0,
      sneakers: 0,
      boards: 0,
      gates: 0,
      barriers: 0,
    };
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
    this.seconds += dt;
    this.distance += travelled;
    const multiplier = this.multiplier();
    this.scoreDist += distanceGain(travelled) * multiplier;
    // Riding a roof is the risky line, so it pays on top of plain distance.
    if (mounted) {
      this.scoreDist += roofRideGain(travelled) * multiplier;
      this.roofDistance += travelled;
    }

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
    // Per-power-up tallies as well as the total, so missions can single one out.
    const counter = { jetpack: "jetpacks", magnet: "magnets", double: "doubles", sneakers: "sneakers" }[id];
    if (counter) this.metrics[counter] += 1;
  }

  addBoard() {
    this.metrics.boards += 1;
  }

  /** Obstacles the runner got past, counted by what it took to clear them. */
  addCleared({ gates = 0, barriers = 0 }) {
    this.metrics.gates += gates;
    this.metrics.barriers += barriers;
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
    const deltas = {};
    for (const key of Object.keys(this.metrics)) {
      deltas[key] = this.metrics[key] - (this.banked[key] ?? 0);
    }
    // Career coin total is a cumulative goal of its own, separate from the
    // run-scoped "coins this run" reading.
    deltas.coinsTotal = coinsDelta;

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
      // Run-scoped readings are absolute; the cumulative ones are deltas.
      coins: this.coins,
      distance: Math.floor(this.distance),
      comboMax: this.comboMax,
      score: Math.floor(score),
      seconds: Math.floor(this.seconds),
      roofDistance: Math.floor(this.roofDistance),
      nearMissesRun: this.metrics.nearMisses,
      mountsRun: this.metrics.mounts,
      powerupsRun: this.metrics.powerups,
      gatesRun: this.metrics.gates,
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
    const tier = missionTier(save.xp, MISSION_TIERS);
    save.missions = [...keep, ...rollMissions(keep.map((m) => m.id), cleared.length, tier)];
  }
}

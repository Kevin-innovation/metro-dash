import { DAILY_BONUS, allCleared, applyMetrics, missionReward } from "./missions.js";
import { dayKey } from "./daily.js";
import {
  activatePowerup,
  clearPowerups,
  createPowerupState,
  isActive,
  powerupScoreMultiplier,
  tickPowerups,
} from "./powerups.js";
import { runXp } from "./progression.js";
import { perkFor } from "./characters.js";
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
    /** Set by Game while a section is running; 1 the rest of the time. */
    this.eventMultiplier = 1;
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

  /** Combo tier times any power-up bonus, times the section running now. */
  multiplier() {
    const base = scoreMultiplier(this.combo, powerupScoreMultiplier(this.powerups));
    return base * (this.eventMultiplier ?? 1);
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

    // The character's coin perk lands here rather than on `addCoin`: the score
    // and the missions count coins picked up, and a runner who earns more per
    // coin must not also score more for the same run.
    const bonus = perkFor(save.character).coinBonus ?? 1;
    if (coinsDelta > 0) this.store.addCoins(Math.round(coinsDelta * bonus));
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
      // The character's mission perk applies to the mission payout only, not to
      // the coins picked up during the run — those have their own multiplier.
      const missionBonus = perkFor(save.character).missionBonus ?? 1;
      reward.coins = Math.round(reward.coins * missionBonus);
      this.store.addCoins(reward.coins);
      this.store.addXp(reward.xp);
    }

    // Clearing the whole day's set pays on top. Guarded by the day it was paid
    // for rather than by a flag, so it cannot be collected twice and comes back
    // by itself tomorrow.
    const today = dayKey(Date.now());
    if (allCleared(save.missions) && save.missionBonusDay !== today) {
      save.missionBonusDay = today;
      this.store.addCoins(DAILY_BONUS.coins);
      this.store.addXp(DAILY_BONUS.xp);
      reward.coins += DAILY_BONUS.coins;
      reward.xp += DAILY_BONUS.xp;
      reward.dailyBonus = true;
    }

    this.store.flush();
    return { completed, reward };
  }

}

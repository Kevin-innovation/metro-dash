import { MISSION_TIERS, allCleared, applyMetrics, dailyBonus, missionReward } from "./missions.js";
import { dayKey } from "./daily.js";
import {
  activatePowerup,
  clearPowerups,
  createPowerupState,
  isActive,
  powerupScoreMultiplier,
  tickPowerups,
} from "./powerups.js";
import { CROW_TIME } from "./config.js";
import { missionTier, runXp } from "./progression.js";
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
    /**
     * Character perks, as multipliers. Written once per run by Game and left
     * alone by reset(), which also runs on death — a perk is a property of who
     * is equipped, not of the run in progress.
     */
    this.crowScale = 1;
    this.comboScale = 1;
    this.xpScale = 1;
    this.reset();
  }

  reset() {
    this.scoreDist = 0;
    this.scoreCoins = 0;
    this.scoreBonus = 0;
    this.coins = 0;
    /** Set by Game while a section is running; 1 the rest of the time. */
    this.eventMultiplier = 1;
    /**
     * Seconds of crow left, and the duration it was granted for.
     *
     * Kept out of `powerups` on purpose. That table is the shop's: every id in
     * it has an upgrade level, a purchase price and a HUD chip that means "you
     * are winning". A debuff filed there would appear in all three.
     */
    this.crowT = 0;
    this.crowSeconds = CROW_TIME;
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
      crows: 0,
      antidotes: 0,
    };
    // A run is banked when the player dies and again when they leave the card,
    // so progress is always committed as a delta against this.
    this.banked = { coins: 0, distance: 0, xp: 0, ...this.metrics };
    this.runCounted = false;
    this.runClosed = false;
    /** Client-computed payouts this run, for the server to bound. */
    this.claimed = { coins: 0, xp: 0 };
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
    this.comboT = COMBO_WINDOW * this.comboScale;
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

    this.crowT = Math.max(0, this.crowT - dt);

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

  /**
   * Take a hazard pickup.
   *
   * Refreshes rather than stacks, exactly like a power-up: two crow eggs in
   * quick succession are already a bad enough few seconds without the second
   * one doubling the first.
   */
  addHazard(id, seconds = CROW_TIME) {
    if (id !== "crow") return { blocked: false };
    this.metrics.crows += 1;
    // The antidote is checked here rather than at the pickup, so every route
    // into a hazard — the egg, a test, anything added later — is covered by
    // one rule instead of by whoever remembered.
    if (this.store.spendAntidote()) {
      this.metrics.antidotes += 1;
      return { blocked: true };
    }
    const held = seconds * this.crowScale;
    this.crowSeconds = held;
    this.crowT = Math.max(this.crowT, held);
    return { blocked: false };
  }

  crowActive() {
    return this.crowT > 0;
  }

  /**
   * Apply the character's experience perk.
   *
   * 「획득 XP +25%」 says experience, not run experience, and it was reaching
   * only the score-derived half — so the character bought for XP did nothing
   * for the missions, which is where a careful player gets most of theirs.
   */
  scaledXp(xp) {
    return Math.round(xp * this.xpScale);
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

  /**
   * End one power-up now.
   *
   * The jetpack is the only thing that uses it, and only because the player
   * asked: pressing down while flying should bring you back to the deck rather
   * than being ignored for the six seconds the timer still holds.
   */
  endPowerup(id) {
    if (!(this.powerups[id] > 0)) return false;
    this.powerups[id] = 0;
    return true;
  }

  clearPowerups() {
    clearPowerups(this.powerups);
    // Death takes the bird with it. Leaving it running meant the game-over
    // card came up behind a veil the player could no longer do anything about.
    this.crowT = 0;
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
    const earnedXp = this.scaledXp(runXp(score));
    const xpDelta = earnedXp - this.banked.xp;
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
      xp: earnedXp,
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
    // The all-clear bonus is settled at the player's step now, which is what
    // the title card prints beside it. The individual missions are not — each
    // is paid at the step it was dealt at, which is what *its* card prints.
    const tier = missionTier(save.xp, MISSION_TIERS);
    // The character's mission perk applies to the mission payout only, not to
    // the coins picked up during the run — those have their own multiplier.
    const missionBonus = perkFor(save.character).missionBonus ?? 1;
    // Each mission at the step it was dealt at; see missionReward.
    const reward = missionReward(completed);
    if (completed.length) {
      save.missionsDone += completed.length;
      // Both halves of the payout. 「미션 보상 +30%」is printed beside a card
      // that shows coins and XP, and the perk was reaching only the coins.
      reward.coins = Math.round(reward.coins * missionBonus);
      reward.xp = Math.round(reward.xp * missionBonus);
      this.store.addCoins(reward.coins);
      this.store.addXp(this.scaledXp(reward.xp));
    }

    // Clearing the whole day's set pays on top. Guarded by the day it was paid
    // for rather than by a flag, so it cannot be collected twice and comes back
    // by itself tomorrow.
    const today = dayKey(Date.now());
    if (allCleared(save.missions) && save.missionBonusDay !== today) {
      save.missionBonusDay = today;
      // The perk reaches this too. It is a mission payout like any other, and
      // it was only escaping because it was added after the line that applied
      // the multiplier — which meant the one character built around missions
      // lost its perk on the largest mission payout of the day.
      const bonus = dailyBonus(tier);
      const coins = Math.round(bonus.coins * missionBonus);
      const xp = Math.round(bonus.xp * missionBonus);
      this.store.addCoins(coins);
      this.store.addXp(this.scaledXp(xp));
      reward.coins += coins;
      reward.xp += xp;
      reward.dailyBonus = true;
    }

    this.store.flush();
    // What the browser paid itself for things the server cannot check — the
    // missions and the day's bonus. Reported so it can be bounded rather than
    // silently kept; see CLIENT_COINS_PER_DAY.
    this.claimed.coins += reward.coins;
    this.claimed.xp += reward.xp;
    return { completed, reward };
  }

}

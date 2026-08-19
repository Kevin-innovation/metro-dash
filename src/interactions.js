import { LANE_TOLERANCE, lerp, nearMiss, sweptHit } from "./collision.js";
import {
  COLLIDE_PAD_Y,
  LATE_DODGE_WINDOW,
  MAGNET_RANGE,
  NEAR_MISS_HEIGHT,
  NEAR_MISS_RANGE,
  PICKUP_DEPTH,
} from "./config.js";
import { POWERUPS } from "./powerups.js";

/** Half-range in which a magnet-dragged coin is simply absorbed. */
const MAGNET_GRAB = 1.35;
/** How far the runner's midpoint may sit from a pickup and still take it. */
const PICKUP_REACH = 1.35;

/**
 * Resolves everything the runner touches during one simulation step: pickups,
 * near misses and lethal contact.
 *
 * Reports what happened as events rather than playing sounds or writing to the
 * DOM, so the presentation layer stays in Game and the rules stay here.
 */
export class Interactions {
  /**
   * @param {import("./entities.js").EntityPool} pool
   * @param {import("./run.js").Run} run
   * @param {import("./particles.js").ParticleField} particles
   */
  constructor(pool, run, particles) {
    this.pool = pool;
    this.run = run;
    this.particles = particles;
    /** Character perk: multiplier on how far the magnet reaches. */
    this.magnetScale = 1;
  }

  /** Player capsule at the start / end of the current simulation step. */
  static sweep(p) {
    return [
      { x: p.prevX, y: p.prevY, z: p.prevZ, height: p.prevHeight },
      { x: p.x, y: p.y, z: p.z, height: p.height },
    ];
  }

  /**
   * @returns {Array<{ type: "coin", gain: number } | { type: "powerup", id: string }>}
   */
  collectPickups(player, { upgradeLevel }) {
    const events = [];
    const [prev, cur] = Interactions.sweep(player);
    const magnetOn = this.run.powerupActive("magnet");
    // The jetpack hoovers up its coin trail without demanding pixel-perfect flying.
    const flying = this.run.powerupActive("jetpack");

    for (const item of this.pool.live) {
      if (item.taken || item.lethal) continue;
      const itemX = item.mesh.position.x;
      const itemY = item.mesh.position.y;

      // A magnet-dragged coin can end up alongside the runner rather than in
      // front, so proximity wins over the swept corridor test.
      const grabbed =
        magnetOn &&
        item.type === "coin" &&
        Math.hypot(player.x - itemX, player.y + 0.95 - itemY, player.z - item.z) < MAGNET_GRAB;

      if (!grabbed) {
        const hit = sweptHit(
          prev,
          cur,
          {
            x: itemX,
            z: item.z,
            prevZ: item.prevZ,
            depth: PICKUP_DEPTH,
            minY: item.minY,
            maxY: item.maxY,
          },
          { laneTolerance: LANE_TOLERANCE },
        );
        if (!hit.hit) continue;
        if (!flying) {
          const midY = lerp(prev.y + prev.height * 0.5, cur.y + cur.height * 0.5, hit.t);
          if (Math.abs(midY - itemY) > PICKUP_REACH) continue;
        }
      }

      item.taken = true;
      item.mesh.visible = false;

      if (item.type === "coin") {
        this.particles.burst(itemX, itemY, item.z, {
          count: 7,
          colour: 0xffd24a,
          speed: 3.2,
          life: 0.34,
          size: 0.26,
        });
        events.push({ type: "coin", gain: this.run.addCoin() });
      } else if (item.powerup) {
        this.particles.burst(itemX, itemY, item.z, {
          count: 26,
          colour: parseInt(POWERUPS[item.powerup].colour.slice(1), 16),
          speed: 6.5,
          life: 0.75,
          size: 0.42,
        });
        this.run.addPowerup(item.powerup, upgradeLevel(item.powerup));
        events.push({ type: "powerup", id: item.powerup });
      }
    }

    return events;
  }

  /**
   * Award a bonus the moment the runner squeaks past an obstacle. Scored once
   * per obstacle, on the step where its Z is crossed.
   *
   * Also tallies what the runner got past, by the move it took to clear it, so
   * missions can ask for gates specifically rather than just "obstacles".
   *
   * @returns {{ nearMisses: number, gates: number, barriers: number }}
   */
  scoreNearMisses(player) {
    const tally = { nearMisses: 0, gates: 0, barriers: 0 };
    if (player.flying) return tally;

    for (const item of this.pool.live) {
      if (!item.lethal || item.scored || item.taken) continue;
      // Only when the runner crosses the obstacle this step.
      if (player.prevZ - item.prevZ >= 0 || player.z - item.z < 0) continue;
      item.scored = true;
      if (item.type === "sign") tally.gates += 1;
      else if (item.type === "barrier") tally.barriers += 1;
      if (player.mounted === item) continue;

      // Swerving out of this obstacle's lane at the last moment counts, even
      // though the lerp has already carried the runner clear of it.
      const lateDodge =
        item.lane === player.laneFrom && player.laneChangeT < LATE_DODGE_WINDOW;

      const kind = nearMiss(
        { x: player.x, y: player.y, z: player.z, height: player.height },
        { x: item.mesh.position.x, minY: item.minY, maxY: item.maxY },
        {
          laneRange: NEAR_MISS_RANGE,
          heightRange: NEAR_MISS_HEIGHT,
          padY: COLLIDE_PAD_Y,
          lateDodge,
        },
      );
      if (!kind) continue;

      this.run.addNearMiss();
      tally.nearMisses += 1;
    }

    this.run.addCleared(tally);
    return tally;
  }

  /** @returns {boolean} whether the runner hit something lethal this step. */
  detectCrash(player) {
    const [prev, cur] = Interactions.sweep(player);

    for (const item of this.pool.live) {
      if (!item.lethal || item.taken) continue;
      if (item.rideable) {
        if (player.mounted === item) continue;
        if (player.y >= item.roofY - 0.42) continue;
      }

      const hit = sweptHit(
        prev,
        cur,
        {
          x: item.mesh.position.x,
          z: item.z,
          prevZ: item.prevZ,
          depth: item.depth,
          minY: item.minY,
          maxY: item.maxY,
        },
        { padY: COLLIDE_PAD_Y },
      );

      if (hit.hit) return true;
    }

    return false;
  }

  /** Drag loose coins toward the runner while the magnet is running. */
  pullCoins(player, dt, speed) {
    if (!this.run.powerupActive("magnet")) return;

    for (const item of this.pool.live) {
      if (item.type !== "coin" || item.taken) continue;
      const dx = player.x - item.mesh.position.x;
      const dy = player.y + 1.05 - item.mesh.position.y;
      const dz = player.z + 0.7 - item.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= MAGNET_RANGE * this.magnetScale || distance <= 0.0001) continue;

      const pull = Math.max(speed * 2.1, 32);
      const step = Math.min(distance, pull * dt) / distance;
      item.mesh.position.x += dx * step;
      item.mesh.position.y += dy * step;
      item.z += dz * step;
      item.mesh.position.z = item.z;
    }
  }
}

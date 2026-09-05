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

/** Half-range in which a magnet-dragged pickup is simply absorbed. */
const MAGNET_GRAB = 1.35;

/**
 * What the magnet reaches for.
 *
 * One predicate, read by both the drag and the grab, because the two used to
 * be written separately and a thing the magnet pulled but would not absorb
 * would orbit the runner for the rest of the power-up.
 */
function magnetTakes(item) {
  return item.type === "coin" || item.hazard === "crow";
}
/** How far the runner's midpoint may sit from a pickup and still take it. */
const PICKUP_REACH = 1.35;
/**
 * Reach while the jetpack is running.
 *
 * Wider, because flying is not a precise instrument and the trail should not
 * demand pixel-perfect altitude — but still finite. It used to be unlimited,
 * which was fine when the trail was the only thing up there and simply meant
 * "collect it"; now that the sky has its own coin line, an unlimited reach
 * would also hoover the ground six metres below and hand the flier every coin
 * in the lane for free.
 */
const FLYING_PICKUP_REACH = 2.2;
/**
 * Reach while super sneakers are running.
 *
 * The coin arcs over an obstacle are placed for the height an ordinary jump
 * reaches when it crosses them. A boosted jump crosses the same point two or
 * three metres higher and sailed straight over the lot — so the power-up that
 * makes you jump better was also the one that cost you coins. Wide enough that
 * the boost does not take anything away, narrow enough that it is still a jump
 * rather than a magnet.
 */
const SNEAKER_PICKUP_REACH = 3.0;

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
   * @returns {Array<{ type: "coin", gain: number } | { type: "powerup", id: string }
   *   | { type: "hazard", id: string, blocked: boolean }>}
   */
  collectPickups(player, { upgradeLevel }) {
    const events = [];
    const [prev, cur] = Interactions.sweep(player);
    const magnetOn = this.run.powerupActive("magnet");
    // The jetpack collects with a wider reach; see FLYING_PICKUP_REACH.
    const flying = this.run.powerupActive("jetpack");
    const bounding = this.run.powerupActive("sneakers");
    const rewardReach = flying
      ? FLYING_PICKUP_REACH
      : bounding
        ? SNEAKER_PICKUP_REACH
        : PICKUP_REACH;

    for (const item of this.pool.live) {
      if (item.taken || item.lethal) continue;
      const itemX = item.mesh.position.x;
      const itemY = item.mesh.position.y;

      // Anything the magnet drags can end up alongside the runner rather than
      // in front, so proximity wins over the swept corridor test.
      //
      // Crow eggs included, and that is the point of the change rather than a
      // side effect of it: the magnet now pulls the egg in too, so the one
      // power-up that collected things for you is also the one that collects
      // the thing you did not want. See pullCoins.
      const grabbed =
        magnetOn &&
        magnetTakes(item) &&
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
        const midY = lerp(prev.y + prev.height * 0.5, cur.y + cur.height * 0.5, hit.t);
        // A hazard is never granted the widened reach. Those exist so a
        // power-up cannot cost you the coins it flew you past; extending them
        // to the crow egg would mean the two power-ups that make you jump
        // higher also drag traps in from three metres away, and a trap you
        // cannot dodge is not a choice.
        const reach = item.hazard ? PICKUP_REACH : rewardReach;
        if (Math.abs(midY - itemY) > reach) continue;
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
      } else if (item.hazard) {
        // Soot rather than the pickup's own bright colour: the burst is the
        // last thing seen clearly before the veil closes, so it has to read as
        // a mistake and not as a reward.
        this.particles.burst(itemX, itemY, item.z, {
          count: 22,
          colour: 0x1b2029,
          speed: 5.4,
          life: 0.8,
          size: 0.4,
        });
        const { blocked, reason } = this.run.addHazard(item.hazard);
        events.push({ type: "hazard", id: item.hazard, blocked, reason });
      } else if (item.token === "diamond") {
        this.particles.burst(itemX, itemY, item.z, {
          count: 24,
          colour: 0xbae6fd,
          speed: 6.2,
          life: 0.7,
          size: 0.34,
        });
        const ready = this.run.addDiamond();
        events.push({ type: "token", id: "diamond", held: this.run.diamonds, ready });
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

  /**
   * Drag loose pickups toward the runner while the magnet is running.
   *
   * Coins and crow eggs, and nothing else.
   *
   * The egg is the whole of the change. The magnet used to be the one thing in
   * the game with no downside at all — twenty seconds of collecting without
   * steering — and the crow was the one thing that punished not looking where
   * you were going. Having the magnet ignore the egg meant the two never met:
   * the safest stretch of a run was also the one stretch the trap could not
   * reach into.
   *
   * Now the magnet takes what is in front of it, which is what a magnet does.
   * It is still overwhelmingly a good thing to pick up; it is no longer a
   * reason to stop reading the track, and a magnet running through the frenzy
   * past a hundred thousand is a genuine decision about which lane to be in.
   *
   * Power-ups are deliberately left out. Dragging them in would make the
   * magnet a machine for collecting the other three power-ups, which is a much
   * bigger change than this one and not the one that was asked for.
   */
  pullCoins(player, dt, speed) {
    if (!this.run.powerupActive("magnet")) return;

    for (const item of this.pool.live) {
      if (!magnetTakes(item) || item.taken) continue;
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

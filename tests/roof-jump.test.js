import { describe, expect, it } from "vitest";
import { applyAction, createPlayer, mountPlayer, updatePlayer } from "../src/player.js";
import { FIXED_DT, JUMP_V, MAX_SPEED, MOUNT_TIME, START_SPEED } from "../src/config.js";
import { SPEC } from "../src/specs.js";

/**
 * How long a roof is standable at a given speed.
 *
 * `bestRoof` keeps the runner mounted while their Z is within 47% of the
 * vehicle's length either side of its centre, so this is the whole of the time
 * a jump could be taken from it.
 */
const roofSeconds = (type, speed) => (SPEC[type].length * 0.47 * 2) / speed;

/** A runner standing on a vehicle, mounted the way a landing mounts them. */
function onRoof(type) {
  const player = createPlayer();
  const item = { type, roofY: SPEC[type].roofY, z: 0, mesh: { position: { x: 0 } } };
  mountPlayer(player, item, false);
  return { player, item };
}

describe("jumping off a vehicle roof", () => {
  it("works at the speed a run starts at", () => {
    const { player } = onRoof("bus");
    applyAction(player, "jump", null, {});
    expect(player.jumping).toBe(true);
    expect(player.vy).toBeCloseTo(JUMP_V, 5);
  });

  it("works at full speed, which is where it used to stop", () => {
    // The bug: the climb onto a roof locks the jump for MOUNT_TIME, and above
    // ~29 m/s a bus roof does not last that long — so from the middle of a run
    // onward every press on a bus was swallowed and the roof-to-roof line, the
    // whole reason buses are rideable, quietly stopped working.
    expect(roofSeconds("bus", MAX_SPEED)).toBeLessThan(MOUNT_TIME);

    const { player } = onRoof("bus");
    expect(player.mounting).toBe(true);
    applyAction(player, "jump", null, {});
    expect(player.jumping).toBe(true);
    expect(player.mounting).toBe(false);
    expect(player.vy).toBeCloseTo(JUMP_V, 5);
  });

  it("launches from the roof, not from half-way up the climb", () => {
    // The mount is an easing animation over a landing that already succeeded.
    // A jump that started part-way up would clear less than the one the player
    // asked for, which is a subtler version of the same bug.
    const { player } = onRoof("train");
    updatePlayer(player, FIXED_DT, MAX_SPEED, { roofs: [] });
    expect(player.y).toBeLessThan(SPEC.train.roofY);

    applyAction(player, "jump", null, {});
    expect(player.y).toBe(SPEC.train.roofY);
  });

  it("still refuses a second jump in mid-air", () => {
    // The fix opens the climb, not the air. Nothing here is a double jump.
    const { player } = onRoof("bus");
    applyAction(player, "jump", null, {});
    const rising = player.vy;
    applyAction(player, "jump", null, {});
    expect(player.vy).toBe(rising);
  });

  it("gives a train roof the same treatment", () => {
    expect(roofSeconds("train", MAX_SPEED)).toBeLessThan(MOUNT_TIME);
    const { player } = onRoof("train");
    applyAction(player, "jump", null, {});
    expect(player.jumping).toBe(true);
    expect(player.mounted).toBe(null);
  });

  it("leaves the roof behind, so the vehicle can be collided with again", () => {
    const { player } = onRoof("bus");
    applyAction(player, "jump", null, {});
    expect(player.mounted).toBe(null);
    expect(player.roofY).toBe(0);
  });

  it("is not fine at the start of a run either, now the run opens at forty", () => {
    // It used to be, and that is why the bug read as a late-run problem: at
    // 20 m/s a bus roof lasted 0.43 seconds against a 0.3 second mount, so the
    // first minute worked and everything after it did not.
    //
    // The opening speed doubled, and now the very first bus gives 0.22 seconds
    // — under the mount from the first layout of the run. Nothing breaks,
    // because the fix above is what carries it: a jump pressed during the climb
    // is honoured rather than swallowed. What changes is that the fix is now
    // load-bearing for the whole run rather than for the back half of it, which
    // is worth having written down.
    expect(roofSeconds("bus", START_SPEED)).toBeLessThan(MOUNT_TIME);

    const { player } = onRoof("bus");
    expect(player.mounting).toBe(true);
    applyAction(player, "jump", null, {});
    expect(player.jumping).toBe(true);
    expect(player.vy).toBeCloseTo(JUMP_V, 5);
  });
});

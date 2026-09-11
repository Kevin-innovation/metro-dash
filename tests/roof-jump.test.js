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

  it("is roomy at the start of a run again", () => {
    // It stopped being, for one release. The opening speed doubled and a 9.2m
    // bus gave 0.22 seconds against a 0.3 second mount, so the very first bus
    // of the run was already past before the climb onto it had finished.
    // Vehicles were lengthened for exactly this; see SPEC.
    expect(roofSeconds("bus", START_SPEED)).toBeGreaterThan(MOUNT_TIME);
  });

  it("leaves enough of a window at top speed to act inside", () => {
    // The number that actually decides whether the roof line is playable. A
    // runner crosses the top of a stationary vehicle — they do not ride it — so
    // this is the whole of the time they have up there to read the next roof
    // and press. At sixty frames a second, a tenth of a second is six of them,
    // which is not a decision, it is a coin flip.
    //
    // An input buffer does not help here and it is worth writing down why: a
    // press made early is not refused, it jumps — and a jump taken a metre
    // short of the bus sails the whole thing, because at this speed one lasts
    // fifty-nine metres. There is nothing to buffer. The window has to be wide
    // enough to aim at, which makes it a question about how long the vehicle is.
    const frames = (type) => (roofSeconds(type, MAX_SPEED) * 60);
    expect(frames("bus"), "bus").toBeGreaterThan(9);
    expect(frames("train"), "train").toBeGreaterThan(9);
  });
});

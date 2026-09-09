import { describe, expect, it } from "vitest";
import { setKaiLook } from "../src/player.js";

describe("카이 billboard", () => {
  it("hides the box rig when the cute look is on", () => {
    const box = { visible: true };
    const puppet = { visible: false };
    const p = { rigMeshes: [box], puppet, kaiLook: false };
    setKaiLook(p, true);
    expect(p.kaiLook).toBe(true);
    expect(box.visible).toBe(false);
    expect(puppet.visible).toBe(true);
  });

  it("brings the boxes back for any other runner", () => {
    const box = { visible: false };
    const puppet = { visible: true };
    const p = { rigMeshes: [box], puppet, kaiLook: true };
    setKaiLook(p, false);
    expect(box.visible).toBe(true);
    expect(puppet.visible).toBe(false);
  });

  it("does not throw if the sprite has not loaded yet", () => {
    const box = { visible: true };
    const p = { rigMeshes: [box], puppet: null, kaiLook: false };
    expect(() => setKaiLook(p, true)).not.toThrow();
    expect(box.visible).toBe(false);
  });
});

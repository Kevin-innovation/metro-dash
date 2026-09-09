import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KAI_FRAMES, pickKaiFrame, setKaiLook } from "../src/player.js";

const GROUND = {
  sliding: false,
  jumping: false,
  diving: false,
  flying: false,
  runT: 0,
};

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

describe("카이 run cycle", () => {
  it("ships opposite-stride run frames plus jump and slide", () => {
    expect(KAI_FRAMES.run0).toBe("/characters/kai/run0.png");
    expect(KAI_FRAMES.run1).toBe("/characters/kai/run1.png");
    expect(KAI_FRAMES.jump).toBe("/characters/kai/jump.png");
    expect(KAI_FRAMES.slide).toBe("/characters/kai/slide.png");
    expect(KAI_FRAMES.run0).not.toBe(KAI_FRAMES.run1);
    for (const url of Object.values(KAI_FRAMES)) {
      expect(existsSync(resolve(`public${url}`)), url).toBe(true);
    }
  });

  it("alternates opposite run strides on the ground", () => {
    expect(pickKaiFrame({ ...GROUND, runT: 0 })).toBe("run0");
    expect(pickKaiFrame({ ...GROUND, runT: 0.25 })).toBe("run1");
    expect(pickKaiFrame({ ...GROUND, runT: 0.5 })).toBe("run0");
    expect(pickKaiFrame({ ...GROUND, runT: 0.75 })).toBe("run1");
  });

  it("uses the jump pose in the air and while flying", () => {
    expect(pickKaiFrame({ ...GROUND, jumping: true, runT: 0 })).toBe("jump");
    expect(pickKaiFrame({ ...GROUND, diving: true, runT: 1 })).toBe("jump");
    expect(pickKaiFrame({ ...GROUND, flying: true, runT: 2 })).toBe("jump");
  });

  it("uses the slide pose while sliding, even if a jump flag is still set", () => {
    expect(pickKaiFrame({ ...GROUND, sliding: true, jumping: true })).toBe("slide");
  });
});


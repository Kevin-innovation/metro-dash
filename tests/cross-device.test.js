import { describe, expect, it, vi } from "vitest";
import { Cloud } from "../src/cloud.js";
import { mergeProfiles, normalizeSave } from "../src/save.js";

/**
 * The bug these cover: a character bought on one computer went missing on
 * another, and worse, the second computer deleted it from the account.
 *
 * Two halves. The client half is that a browser which was *already* signed in
 * never read the account's save on boot — it confirmed the token, threw the
 * profile away and pushed its own copy up. The server half is in
 * tests/convex-backend.test.js, where players:save now refuses to lower
 * anything that can only be bought.
 */

/** A Cloud with the network stubbed, so refresh can be driven by hand. */
function cloudWith(loadResult) {
  const cloud = new Cloud("https://example.convex.cloud");
  cloud.session = { token: "t", handle: "테스터", schoolLabel: "", staff: false, remember: true };
  cloud.client = { query: vi.fn(async () => loadResult), mutation: vi.fn() };
  cloud.ready = true;
  return cloud;
}

describe("a browser that was already signed in", () => {
  it("keeps the account's save file when it confirms its token", async () => {
    // refresh() ran on every boot and read three fields off the answer for the
    // account bar. The save file came down with it and was dropped on the
    // floor, which is the only chance a signed-in boot gets to see it.
    const profile = { characters: ["runner", "scarecrow"], character: "scarecrow", coins: 900 };
    const cloud = cloudWith({ handle: "테스터", profile, best: 4000, coins: 900 });

    expect(cloud.lastLoad).toBeUndefined();
    await cloud.refresh();
    expect(cloud.lastLoad.profile).toEqual(profile);
    expect(cloud.lastLoad.best).toBe(4000);
  });

  it("drops it again on sign-out, so the next account starts clean", async () => {
    const cloud = cloudWith({ handle: "테스터", profile: { characters: ["runner"] }, best: 0 });
    await cloud.refresh();
    expect(cloud.lastLoad).not.toBe(null);
    cloud.clearSession();
    expect(cloud.lastLoad).toBe(null);
  });
});

describe("reconciling two computers", () => {
  const bought = () =>
    normalizeSave({
      characters: ["runner", "scarecrow"],
      character: "scarecrow",
      upgrades: { magnet: 6, jetpack: 3, double: 1, sneakers: 1 },
      coins: 4000,
      syncedCoins: 4000,
      runs: 40,
      best: 800000,
    });

  const behind = () =>
    normalizeSave({
      characters: ["runner"],
      character: "runner",
      upgrades: { magnet: 2, jetpack: 1, double: 1, sneakers: 1 },
      coins: 1200,
      syncedCoins: 1200,
      runs: 12,
      best: 90000,
    });

  it("gives the stale computer the character it never saw", () => {
    const { save } = mergeProfiles(behind(), bought());
    expect(save.characters).toContain("scarecrow");
    expect(save.character).toBe("scarecrow");
  });

  it("takes the higher upgrade level on every power-up", () => {
    const { save } = mergeProfiles(behind(), bought());
    expect(save.upgrades.magnet).toBe(6);
    expect(save.upgrades.jetpack).toBe(3);
  });

  it("keeps the counters that only ever climb", () => {
    const { save } = mergeProfiles(behind(), bought());
    expect(save.runs).toBe(40);
    expect(save.best).toBe(800000);
  });

  it("carries nothing twice on an ordinary boot", () => {
    // Both sides synced, so there is nothing outstanding to carry — otherwise
    // every reload would credit the same coins again.
    const { carried } = mergeProfiles(behind(), bought());
    expect(carried).toBe(0);
  });

  it("carries coins earned offline exactly once", () => {
    const offline = normalizeSave({ ...behind(), coins: 1900, syncedCoins: 1200 });
    const { carried, save } = mergeProfiles(offline, bought());
    expect(carried).toBe(700);
    expect(save.coins).toBe(4700);
  });
});

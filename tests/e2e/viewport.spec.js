import { expect, test } from "@playwright/test";

test("the camera follows the play area even when the window never changes", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 664 });
  await page.goto("/");
  await page.waitForFunction(() => window.__metroDash);

  // What a late stylesheet looks like from inside: the area changes size and no
  // window resize event says so. Left unanswered, the track was stretched sideways.
  const aspect = () => page.evaluate(() => window.__metroDash.camera.aspect);
  await page.evaluate(() => {
    document.getElementById("app").style.height = "3000px";
  });
  await expect.poll(aspect).toBeCloseTo(393 / 3000, 2);
  await page.evaluate(() => {
    document.getElementById("app").style.height = "";
  });
  await expect.poll(aspect).toBeCloseTo(393 / 664, 2);
});

test("the play area is the size of the screen before the stylesheet applies", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 664 });
  await page.goto("/");
  await page.waitForFunction(() => window.__metroDash);
  const height = await page.evaluate(() => {
    for (const sheet of document.styleSheets) if (sheet.href) sheet.disabled = true;
    return document.getElementById("app").clientHeight;
  });
  expect(height).toBe(664);
});

import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests.
 *
 * The unit suite covers the rules and the backend covers what gets written;
 * neither can see a button that fell through to the browser default or a name
 * clipped to an ellipsis. These drive the built site in a real browser, which
 * is the only place those show up.
 *
 * Runs against the production build rather than the dev server, so what is
 * tested is what ships.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // The page boots a Three.js scene before the title screen settles, so the
  // default 30s is tight once several workers are sharing one preview server.
  timeout: 60_000,
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["list"]],

  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "phone", use: { ...devices["iPhone 13"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],

  // Skipped when E2E_URL points at a deployed site.
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "npm run build && npm run preview",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * THE KIT CHECK — measured rules for the screens already moved to the kit
 * (01 §2: "must pass at 1025, 1164 and 1440 wide").
 *
 * It needs no API and no database: the pages are the fixture previews under
 * `apps/web/*-preview.html`, served by the web dev server alone. `pnpm
 * kit:check` runs it. A screen is added to `e2e-kit/` when it is moved, and
 * stays there so a later change cannot quietly cut its last column again.
 */
const port = Number(process.env.KIT_PORT ?? 5399);
const baseURL = process.env.KIT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e-kit",
  fullyParallel: false,
  /* The first page pays the dev server's cold compile. */
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.KIT_BASE_URL ? undefined : {
    command: `pnpm --filter @carres/web exec vite --port ${port} --strictPort`,
    /* A dev build refuses to start without an API base on this machine
       (`lib/api-base.ts`). No API runs here and none is called: the fixture
       previews answer their own reads. */
    env: { VITE_API_BASE_URL: "http://127.0.0.1:8888" },
    url: `${baseURL}/side-menu-preview.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each CI project has its own runner. Three workers overlap the long animations
  // and leave a core for the preview server.
  workers: process.env.CI ? 3 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/rubic/",
    trace: "retain-on-failure",
  },
  webServer: {
    // CI builds once in the workflow and reuses that dist. Local runs build here.
    command: process.env.CI ? "npm run preview" : "npm run build && npm run preview",
    url: "http://127.0.0.1:4173/rubic/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});

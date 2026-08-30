import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./test/electron",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    locale: "en-US",
    trace: "off",
    video: "off",
  },
  outputDir: "test-results/electron-run",
})

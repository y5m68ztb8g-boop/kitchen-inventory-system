import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  webServer: {
    command:
      "GROW_NATURALLY_E2E=1 GROW_NATURALLY_INVENTORY_DB_PATH=/tmp/grow-naturally-e2e-$$-inventory.json GROW_NATURALLY_PURCHASING_DB_PATH=/tmp/grow-naturally-e2e-$$-purchasing.sqlite pnpm dev --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false
  },
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    }
  ]
});

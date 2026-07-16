import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import config from "../playwright.config";

describe("Playwright inventory isolation", () => {
  it("never runs browser tests against the live trial server or its database", () => {
    const webServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer;

    expect(config.fullyParallel).toBe(false);
    expect(webServer?.reuseExistingServer).toBe(false);
    expect(webServer?.command).toContain("GROW_NATURALLY_E2E=1");
    expect(webServer?.command).toContain("GROW_NATURALLY_INVENTORY_DB_PATH=");
    expect(webServer?.command).toContain("GROW_NATURALLY_PURCHASING_DB_PATH=");
    expect(webServer?.url).not.toBe("http://127.0.0.1:5174");
    expect(config.use?.baseURL).not.toBe("http://127.0.0.1:5174");
  });

  it("uses a fake Quick Add runner in E2E mode and cannot load the real Brakes runner", () => {
    const viteSource = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    const e2eConfiguration = viteSource.slice(viteSource.indexOf("const isE2E"));

    expect(e2eConfiguration).toMatch(/brakesQuickAddRunner\s*:\s*isE2E\s*\?\s*(?:create)?fake/i);
    expect(e2eConfiguration).not.toMatch(/isE2E\s*\?\s*createBrakesQuickAddRunner/i);
  });
});

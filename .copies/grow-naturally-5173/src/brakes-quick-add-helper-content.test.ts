import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const root = process.cwd();
const contentScriptPath = path.join(root, "brakes-quick-add-helper", "content.js");
const serviceWorkerPath = path.join(root, "brakes-quick-add-helper", "service-worker.js");
const manifestPath = path.join(root, "brakes-quick-add-helper", "manifest.json");
const helperPanelId = "tintohotel-brakes-helper";

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function waitForMicrotasks() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function getScriptPrelude(source: string) {
  const firstFunctionIndex = source.indexOf("function ");
  if (firstFunctionIndex === -1) return source;
  return source.slice(0, firstFunctionIndex);
}

function installChromeMocks(options: {
  shouldOpen: boolean;
  items?: { code: string; name: string; quantity: number }[];
}) {
  const handlers: Array<
    (message: { type?: string }) => void
  > = [];
  const sendLog: { type?: string }[] = [];

  const runtime: {
    onMessage: { addListener: (listener: (message: { type?: string }) => void) => void };
    sendMessage: ReturnType<typeof vi.fn>;
    storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } };
  } = {
    onMessage: {
      addListener: (listener: (message: { type?: string }) => void) => {
        handlers.push(listener);
      },
    },
    sendMessage: vi.fn(async (message: { type?: string }) => {
      sendLog.push(message);
      if (message?.type === "TINTO_SHOULD_OPEN_BRAKES_HELPER") return { shouldOpen: options.shouldOpen };
      if (message?.type === "TINTO_GET_BRAKES_ITEMS") return { items: options.items ?? [] };
      if (message?.type === "TINTO_CONSUME_BRAKES_HELPER") return { ok: true };
      return {};
    }),
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
  };

  const globalBag = globalThis as { [key: string]: unknown };
  const originalChrome = globalBag.chrome;
  Object.defineProperty(globalBag, "chrome", {
    configurable: true,
    writable: true,
    value: { runtime },
  });

  const restoreChrome = () => {
    if (originalChrome === undefined) {
      delete globalBag.chrome;
    } else {
      globalBag.chrome = originalChrome;
    }
  };

  return { handlers, runtime, sendLog, restoreChrome };
}

function runContentScript() {
  const source = read(contentScriptPath);
  // eslint-disable-next-line no-new-func
  const run = new Function(source);
  run();
}

describe("brakes-quick-add-helper one-shot trigger behavior", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not auto-open on a normal Brakes cart unless SW pending is allowed", async () => {
    const { runtime, handlers, sendLog, restoreChrome } = installChromeMocks({ shouldOpen: false });
    document.body.textContent = "Brakes cart content";

    try {
      runContentScript();
      await waitForMicrotasks();

      expect(sendLog).toContainEqual({ type: "TINTO_SHOULD_OPEN_BRAKES_HELPER" });
      expect(handlers).toHaveLength(1);
      expect(document.getElementById(helperPanelId)).toBeNull();
      expect(sendLog.some((msg) => msg.type === "TINTO_GET_BRAKES_ITEMS")).toBe(false);
      expect(sendLog.some((msg) => msg.type === "TINTO_CONSUME_BRAKES_HELPER")).toBe(false);
    } finally {
      restoreChrome();
      document.body.innerHTML = "";
    }
  });

  it("only opens helper when pending is true and Quick Add text appears, then consumes pending", async () => {
    const { sendLog, restoreChrome } = installChromeMocks({
      shouldOpen: true,
      items: [{ code: "ABC-01", name: "Brake Pad", quantity: 2 }],
    });
    const originalInnerTextDescriptor = Object.getOwnPropertyDescriptor(document.body, "innerText");
    Object.defineProperty(document.body, "innerText", {
      configurable: true,
      get: () => document.body.textContent || "",
      set: (value) => {
        document.body.textContent = String(value);
      },
    });

    document.body.textContent = "loading";

    try {
      runContentScript();
      await waitForMicrotasks();
      expect(document.getElementById(helperPanelId)).toBeNull();

      document.body.innerHTML = "<div>Quick Add</div>";
      document.body.innerText = "Quick Add";
      await waitForMicrotasks();
      await waitForMicrotasks();

      expect(sendLog).toContainEqual({ type: "TINTO_GET_BRAKES_ITEMS" });
      expect(sendLog).toContainEqual({ type: "TINTO_CONSUME_BRAKES_HELPER" });
      expect(document.getElementById(helperPanelId)).not.toBeNull();
    } finally {
      if (originalInnerTextDescriptor) {
        Object.defineProperty(document.body, "innerText", originalInnerTextDescriptor);
      }
      restoreChrome();
      document.body.innerHTML = "";
    }
  });

  it("keeps message-driven toggle for hotkey/plugin path", async () => {
    const { handlers, sendLog, restoreChrome } = installChromeMocks({
      shouldOpen: false,
      items: [{ code: "BRK-1", name: "Pad", quantity: 1 }],
    });
    document.body.textContent = "Brakes cart";

    try {
      runContentScript();
      await waitForMicrotasks();

      const toggleHandler = handlers[0];
      expect(typeof toggleHandler).toBe("function");

      toggleHandler({ type: "TINTO_TOGGLE_BRAKES_HELPER" });
      await waitForMicrotasks();
      expect(document.getElementById(helperPanelId)).not.toBeNull();
      expect(sendLog.some((msg) => msg.type === "TINTO_TOGGLE_BRAKES_HELPER")).toBe(false);
      expect(sendLog.some((msg) => msg.type === "TINTO_GET_BRAKES_ITEMS")).toBe(true);
    } finally {
      restoreChrome();
      document.body.innerHTML = "";
    }
  });

  it("keeps top-level init explicit and removes unconditional `void togglePanel()`", () => {
    const source = read(contentScriptPath);
    const prelude = getScriptPrelude(source);

    expect(prelude).toMatch(/openPendingHelperWhenReady/);
    expect(prelude).not.toMatch(/^\s*void\s+togglePanel\(\)\s*;/m);
    expect(source).toMatch(/TINTO_SHOULD_OPEN_BRAKES_HELPER/);
    expect(source).toMatch(/TINTO_CONSUME_BRAKES_HELPER/);
    expect(source).toMatch(/waitForQuickAdd/);
    expect(source).toMatch(/quick add/i);
  });

  it("expects one-shot pending path in service worker and storage permission in manifest", () => {
    const workerSource = read(serviceWorkerPath);
    const manifest = JSON.parse(read(manifestPath));

    expect(manifest.permissions).toContain("storage");
    expect(workerSource).toMatch(/chrome\.tabs\.onUpdated/);
    expect(workerSource).toMatch(/chrome\.storage\.local\.(set|get|remove)/);
    expect(workerSource).toMatch(/tintohotel-quick-add/i);
    expect(workerSource).toMatch(/searchParams\.get\(["']tintohotel-quick-add["']\)/);
    expect(workerSource).toMatch(/tintohotelQuickAddPendingAt/);
    expect(workerSource).toMatch(/TINTO_SHOULD_OPEN_BRAKES_HELPER/);
    expect(workerSource).toMatch(/TINTO_CONSUME_BRAKES_HELPER/);
  });
});

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeBrakesAdapter,
  task6BrakesQueue,
  type FakeBrakesAdapter
} from "./fixtures/task-6-brakes-quick-add-fixtures";

type QuickAddItem = (typeof task6BrakesQueue)[number];
type QuickAddResult = {
  itemId: string;
  status: "Added" | "AwaitingConfirmation" | "InvalidCode" | "Failed";
  message: string | null;
};
type QuickAddRunner = { fill(items: QuickAddItem[]): Promise<QuickAddResult[]> };
type QuickAddModule = {
  createBrakesQuickAddRunner(
    input?: { adapter?: FakeBrakesAdapter; adapterFactory?: () => Promise<FakeBrakesAdapter> }
  ): QuickAddRunner;
  buildRetryQueue(items: Array<QuickAddItem & { brakesStatus: "Pending" | QuickAddResult["status"] }>): QuickAddItem[];
};

type BrakesLaunchConfigLike = {
  command?: string;
  executable?: string;
  commandLine?: string[];
  args?: string[];
  argv?: string[];
};

type BrakesQuickAddModuleWithLaunchConfig = QuickAddModule & {
  brakesChromeLaunchCommand?: () => string[] | string | BrakesLaunchConfigLike;
  buildBrakesChromeLaunchCommand?: () => string[] | string | BrakesLaunchConfigLike;
  buildBrakesChromeLaunchOptions?: () => string[] | string | BrakesLaunchConfigLike;
  brakesChromeLaunchOptions?: () => BrakesLaunchConfigLike;
};

async function loadQuickAddModule(): Promise<QuickAddModule> {
  vi.resetModules();
  return import("../../server/ordering/brakesQuickAdd") as Promise<QuickAddModule>;
}

function createAdapterWithClosedCart(
  outcomes: Record<string, "confirmed" | "invalid" | "ambiguous">,
  onOpenCart: () => Promise<void>
): FakeBrakesAdapter {
  const adapter = createFakeBrakesAdapter(outcomes);
  adapter.openCart = onOpenCart;
  return adapter;
}

function getBrakesLaunchConfig(module: BrakesQuickAddModuleWithLaunchConfig): { command: string; args: string[] } {
  const factory =
    module.brakesChromeLaunchCommand ??
    module.buildBrakesChromeLaunchCommand ??
    module.buildBrakesChromeLaunchOptions ??
    module.brakesChromeLaunchOptions;

  if (!factory) {
    throw new Error("Brakes Chrome launch config factory is not exported");
  }

  const value = factory();
  if (Array.isArray(value)) {
    const [command, ...args] = value;
    return { command: command, args };
  }
  if (typeof value === "string") {
    return { command: "/usr/bin/open", args: value.split(" ").filter(Boolean) };
  }
  if (value && typeof value === "object") {
    const command = (value.command || value.executable || "").toString();
    const args = (value.args ?? value.argv ?? value.commandLine ?? []) as string[];
    return { command, args };
  }
  return { command: "", args: [] };
}

function splitCommandLine(args: string[]): string[] {
  const idx = args.lastIndexOf("--args");
  if (idx >= 0) {
    return args.slice(idx + 1);
  }
  return args;
}

function hasArg(args: string[], key: string): boolean {
  return args.some((item) => item === key || item.startsWith(`${key}=`));
}

function hasArgPair(args: string[], key: string): boolean {
  return args.some((item, index) => {
    if (item === key) return typeof args[index + 1] === "string";
    if (item.startsWith(`${key}=`)) return true;
    return false;
  });
}

function hasArgPrefix(args: string[], key: string): boolean {
  return args.some((item) => item.startsWith(`${key}=`));
}

function getArgValue(args: string[], key: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === key && args[index + 1] !== undefined) {
      return args[index + 1];
    }
    if (item.startsWith(`${key}=`)) {
      return item.slice(key.length + 1);
    }
  }
  return undefined;
}

describe("Brakes Quick Add runner", () => {
  let module: QuickAddModule;

  beforeEach(async () => {
    module = await loadQuickAddModule();
  });

  it("fills each product code and complete-pack quantity and marks Added only after explicit confirmation", async () => {
    const adapter = createFakeBrakesAdapter({ "135177": "confirmed" });
    const runner = module.createBrakesQuickAddRunner({ adapter });

    const result = await runner.fill([task6BrakesQueue[0]]);

    expect(result).toEqual([{ itemId: "brakes-confirmed", status: "Added", message: null }]);
    expect(adapter.actions).toEqual([
      "goto-cart",
      "fill-code:135177",
      "fill-quantity:2",
      "click-add",
      "read-result:135177"
    ]);
  });

  it("uses InvalidCode only for an explicit invalid-code result", async () => {
    const adapter = createFakeBrakesAdapter({ "BAD-404": "invalid" });
    const result = await module.createBrakesQuickAddRunner({ adapter }).fill([task6BrakesQueue[1]]);

    expect(result).toEqual([
      expect.objectContaining({ itemId: "brakes-invalid", status: "InvalidCode" })
    ]);
  });

  it("uses AwaitingConfirmation for ambiguous Quick Add results", async () => {
    const adapter = createFakeBrakesAdapter({ "WAIT-101": "ambiguous" });
    const result = await module.createBrakesQuickAddRunner({ adapter }).fill([task6BrakesQueue[2]]);

    expect(result).toEqual([
      expect.objectContaining({ itemId: "brakes-ambiguous", status: "AwaitingConfirmation" })
    ]);
  });

  it("retries every unresolved row but excludes Added rows", () => {
    const queue = module.buildRetryQueue([
      { ...task6BrakesQueue[0], brakesStatus: "Added" },
      { ...task6BrakesQueue[1], brakesStatus: "InvalidCode" },
      { ...task6BrakesQueue[2], brakesStatus: "AwaitingConfirmation" },
      { itemId: "pending", productCode: "PENDING", quantity: 1, brakesStatus: "Pending" },
      { itemId: "failed", productCode: "FAILED", quantity: 1, brakesStatus: "Failed" }
    ]);

    expect(queue.map((item) => item.itemId)).toEqual([
      "brakes-invalid",
      "brakes-ambiguous",
      "pending",
      "failed"
    ]);
  });

  it("has no checkout, delivery, price-confirmation, or place-order selector or action", async () => {
    const adapter = createFakeBrakesAdapter({ "135177": "confirmed" });
    await module.createBrakesQuickAddRunner({ adapter }).fill([task6BrakesQueue[0]]);

    const forbidden = /checkout|delivery|confirm(?:-|\s)?price|price(?:-|\s)?confirmation|place(?:-|\s)?order|submit(?:-|\s)?order/i;
    expect(adapter.actions.filter((action) => forbidden.test(action))).toEqual([]);
    expect(adapter.selectors.filter((selector) => forbidden.test(selector))).toEqual([]);
  });

  it("returns Failed for every item when opening the Brakes cart fails", async () => {
    const adapter = createFakeBrakesAdapter({ "135177": "confirmed", "BAD-404": "invalid", "WAIT-101": "ambiguous" });
    adapter.openCart = async () => {
      throw new Error("购物车页面尚未打开");
    };
    const runner = module.createBrakesQuickAddRunner({ adapter });

    const result = await runner.fill(task6BrakesQueue);

    expect(result).toHaveLength(task6BrakesQueue.length);
    for (const [index, item] of task6BrakesQueue.entries()) {
      expect(result[index]).toMatchObject({
        itemId: item.itemId,
        status: "Failed"
      });
      expect(typeof result[index].message).toBe("string");
      expect(result[index].message?.trim()).not.toBe("");
    }
  });

  it("returns Failed for every item when the Brakes adapter fails to initialize", async () => {
    const adapterFactory = vi.fn().mockRejectedValue(new Error("Brakes adapter 初始化失败"));
    const runner = module.createBrakesQuickAddRunner({ adapterFactory });

    const result = await runner.fill(task6BrakesQueue);

    expect(adapterFactory).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(task6BrakesQueue.length);
    for (const [index, item] of task6BrakesQueue.entries()) {
      expect(result[index]).toMatchObject({
        itemId: item.itemId,
        status: "Failed"
      });
      expect(typeof result[index].message).toBe("string");
      expect(result[index].message?.trim()).not.toBe("");
    }
  });

  it("retries with a fresh adapter when cached openCart fails due to a closed browser", async () => {
    const firstAdapter = createAdapterWithClosedCart(
      { "135177": "confirmed", "BAD-404": "invalid", "WAIT-101": "ambiguous" },
      async () => {
        throw new Error("Target page, context or browser has been closed");
      }
    );
    const secondAdapter = createFakeBrakesAdapter({ "135177": "confirmed", "BAD-404": "invalid", "WAIT-101": "ambiguous" });
    const adapterFactory = vi.fn()
      .mockResolvedValueOnce(firstAdapter)
      .mockResolvedValueOnce(secondAdapter);

    const runner = module.createBrakesQuickAddRunner({ adapterFactory });
    const result = await runner.fill(task6BrakesQueue);

    expect(adapterFactory).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { itemId: "brakes-confirmed", status: "Added", message: null },
      { itemId: "brakes-invalid", status: "InvalidCode", message: "Brakes 明确返回产品编码无效。" },
      { itemId: "brakes-ambiguous", status: "AwaitingConfirmation", message: null }
    ]);
  });

  it("returns Failed for every item when openCart retry also fails", async () => {
    const firstAdapter = createAdapterWithClosedCart(
      { "135177": "confirmed", "BAD-404": "invalid", "WAIT-101": "ambiguous" },
      async () => {
        throw new Error("Target page, context or browser has been closed");
      }
    );
    const secondAdapter = createAdapterWithClosedCart(
      { "135177": "confirmed", "BAD-404": "invalid", "WAIT-101": "ambiguous" },
      async () => {
        throw new Error("Target page, context or browser has been closed");
      }
    );
    const adapterFactory = vi.fn()
      .mockResolvedValueOnce(firstAdapter)
      .mockResolvedValueOnce(secondAdapter);

    const runner = module.createBrakesQuickAddRunner({ adapterFactory });
    const result = await runner.fill(task6BrakesQueue);

    expect(adapterFactory).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(task6BrakesQueue.length);
    for (const [index, item] of task6BrakesQueue.entries()) {
      expect(result[index]).toMatchObject({
        itemId: item.itemId,
        status: "Failed"
      });
      expect(result[index].message).toBe("Target page, context or browser has been closed");
    }
  });

  it("generates native Chrome CDP launch command for Brakes browser", () => {
    const launchConfig = getBrakesLaunchConfig(module as BrakesQuickAddModuleWithLaunchConfig);
    const launchArgs = launchConfig.args;

    expect(launchConfig.command).toBe("/usr/bin/open");
    expect(launchArgs).toContain("-na");
    expect(launchArgs).toContain("Google Chrome");
    expect(launchArgs).toContain("--args");

    const commandArgs = splitCommandLine(launchConfig.args);
    const userDataDirArg = commandArgs.find((arg) => arg.startsWith("--user-data-dir"));
    expect(userDataDirArg).toBeTruthy();
    expect(userDataDirArg).toContain("=");

    const remoteAddress = getArgValue(commandArgs, "--remote-debugging-address");
    expect(remoteAddress).toBe("127.0.0.1");
    const remotePort = getArgValue(commandArgs, "--remote-debugging-port");
    expect(remotePort).toBeTruthy();
    expect(remotePort?.trim()).toBe(remotePort);
    expect(commandArgs).toContain("https://www.brake.co.uk/cart");
    expect(hasArg(commandArgs, "--no-sandbox")).toBe(false);
    expect(hasArg(commandArgs, "--disable-setuid-sandbox")).toBe(false);
    expect(hasArg(commandArgs, "--enable-automation")).toBe(false);
  });
});

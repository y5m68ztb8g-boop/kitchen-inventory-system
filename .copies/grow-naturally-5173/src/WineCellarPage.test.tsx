import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WineCellarPage } from "./WineCellarPage";
import type { WineCellarModuleProps } from "./modules/wine-cellar";

type RenderedCall = { props?: WineCellarModuleProps };

const renderedWineCellarCalls = vi.hoisted(() => [] as RenderedCall[]);

const mockWineCellarRepository = vi.hoisted(() => ({
  load: vi.fn()
}));

vi.mock("./modules/wine-cellar", () => ({
  WineCellarModule: (props: WineCellarModuleProps) => {
    renderedWineCellarCalls.push({ props });
    return <div>WineCellarModule stub</div>;
  }
}));

vi.mock("./modules/wine-cellar/services/serverRepository", () => ({
  ServerWineCellarRepository: vi.fn(() => mockWineCellarRepository)
}));

describe("WineCellarPage", () => {
  beforeEach(() => {
    renderedWineCellarCalls.length = 0;
    mockWineCellarRepository.load.mockReset().mockResolvedValue(undefined);
  });

  it("uses Tennent’s dedicated wine invoice catalogue and excludes main supplier directories", async () => {
    render(<WineCellarPage />);
    await screen.findByText("WineCellarModule stub");

    const productCatalog = renderedWineCellarCalls[0]?.props?.productCatalog ?? [];
    expect(productCatalog.length).toBeGreaterThan(0);

    const supplierNames = productCatalog.map((entry) => entry.supplierName?.toLocaleLowerCase());
    const supplierCodes = productCatalog.map((entry) => {
      const firstSegment = entry.productId.split("-")[0];
      return firstSegment?.toLocaleUpperCase();
    });

    expect(supplierNames.every((name) => name ? !/(campbells|macmurphy|brakes|mark murphy)/i.test(name) : true)).toBe(true);
    expect(supplierNames.some((name) => name?.includes("tenn"))).toBe(true);
    expect(supplierCodes.every((code) => !["CMP", "MM", "BRK"].includes(code))).toBe(true);
  });
});

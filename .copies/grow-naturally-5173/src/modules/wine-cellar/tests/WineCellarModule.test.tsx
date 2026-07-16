import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { WineCellarModule } from "../WineCellarModule";
import { LocalStorageWineCellarRepository } from "../services/localStorageRepository";

const actor = { id: "u1", name: "Alex" };
const scope = { hotelId: "h1", areaId: "a1" };
const allPermissions = [
  "wine_cellar.view", "wine_cellar.manage_layout", "wine_cellar.count",
  "wine_cellar.receive", "wine_cellar.adjust", "wine_cellar.view_cost"
] as const;

function seededRepository(seedScope = scope, productName = "House Red") {
  const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
  const rack = repository.createRack(seedScope, { name: "A架" }, actor);
  repository.createPosition(seedScope, {
    rackId: rack.id, code: "A1", width: 3, depth: 2, stockUnit: "bottle",
    fillDirection: "left-to-right", lowStockMode: "percentage", lowStockThreshold: 25,
    assignment: { productId: null, productName, matchStatus: "unmatched", unitCost: null }
  }, actor);
  return repository;
}

describe("WineCellarModule", () => {
  beforeEach(() => window.localStorage.clear());

  it("counts clicked empty slots, warns without blocking, then records receipt and correction", async () => {
    const user = userEvent.setup();
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={allPermissions} repository={seededRepository()} />);

    expect(screen.getByRole("heading", { name: "主酒库" })).toBeInTheDocument();
    expect(screen.getByText("待匹配发票")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "盘点 A1" }));
    await user.click(screen.getByRole("button", { name: /A1.*1.*1/ }));
    await user.click(screen.getByRole("button", { name: /A1.*1.*3/ }));
    expect(screen.getByText("该酒位的空位排列可能异常，请确认酒瓶是否按规定摆放。")).toBeInTheDocument();
    expect(screen.getByText(/4\s*\/\s*6/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存盘点" }));

    await user.click(screen.getByRole("button", { name: "收货 A1" }));
    await user.type(screen.getByLabelText("收货数量"), "2");
    await user.click(screen.getByRole("button", { name: "保存收货" }));
    await user.click(screen.getByRole("button", { name: "修正 A1" }));
    await user.type(screen.getByLabelText("修正数量"), "-5");
    await user.type(screen.getByLabelText("修正原因"), "破损");
    await user.click(screen.getByRole("button", { name: "保存修正" }));
    expect(screen.getByText(/1\s*\/\s*6/)).toBeInTheDocument();
    expect(screen.getByText("低库存")).toBeInTheDocument();
  });

  it("enforces view and cost permissions", () => {
    const { rerender } = render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={[]} repository={seededRepository()} />);
    expect(screen.getByText("您没有查看酒库库存的权限。")).toBeInTheDocument();

    rerender(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={["wine_cellar.view"]} repository={seededRepository()} />);
    expect(screen.queryByText("酒库总金额")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "盘点 A1" })).not.toBeInTheDocument();
  });

  it("drops the previous area's products when rerendered into another area", () => {
    const repository = seededRepository();
    const otherScope = { hotelId: "h1", areaId: "a2" };
    const rack = repository.createRack(otherScope, { name: "B架" }, actor);
    repository.createPosition(otherScope, {
      rackId: rack.id, code: "B1", width: 2, depth: 2, stockUnit: "bottle",
      fillDirection: "front-to-back", lowStockMode: "percentage", lowStockThreshold: 25,
      assignment: { productId: null, productName: "Area Two White", matchStatus: "unmatched", unitCost: null }
    }, actor);
    const { rerender } = render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={allPermissions} repository={repository} />);
    expect(screen.getByText("House Red")).toBeInTheDocument();

    rerender(<WineCellarModule hotelId="h1" areaId="a2" areaName="副酒库" currentUser={actor}
      permissions={allPermissions} repository={repository} />);

    expect(screen.queryByText("House Red")).not.toBeInTheDocument();
    expect(screen.getByText("Area Two White")).toBeInTheDocument();
  });

  it("hides unit cost from the receipt panel without cost permission", async () => {
    const user = userEvent.setup();
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={["wine_cellar.view", "wine_cellar.receive"]} repository={seededRepository()} />);

    await user.click(screen.getByRole("button", { name: "收货 A1" }));

    expect(screen.getByLabelText("收货数量")).toBeInTheDocument();
    expect(screen.queryByLabelText("单位成本")).not.toBeInTheDocument();
  });

  it("reconfigures, rematches, and archives an existing position", async () => {
    const user = userEvent.setup();
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={allPermissions} repository={seededRepository()} productCatalog={[{
        productId: "wine-2", productName: "Invoice Red", invoiceReference: "INV-200", unitCost: 14
      }]} />);

    await user.click(screen.getByRole("button", { name: "配置 A1" }));
    await user.selectOptions(screen.getByLabelText("匹配发票商品"), "wine-2");
    await user.click(screen.getByRole("button", { name: "保存酒位" }));
    expect(screen.getByText("Invoice Red")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停用 A1" }));
    expect(screen.queryByText("Invoice Red")).not.toBeInTheDocument();
  });

  it("moves racks up and down in display order", async () => {
    const user = userEvent.setup();
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={["wine_cellar.view", "wine_cellar.manage_layout"]} repository={repository} />);

    await user.type(screen.getByLabelText("新酒架名称"), "A架");
    await user.click(screen.getByRole("button", { name: "新增酒架" }));
    await user.type(screen.getByLabelText("新酒架名称"), "B架");
    await user.click(screen.getByRole("button", { name: "新增酒架" }));
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["A架", "B架"]);

    await user.click(screen.getByRole("button", { name: "B架 上移" }));
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["B架", "A架"]);

    await user.click(screen.getByRole("button", { name: "B架 下移" }));
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["A架", "B架"]);
  });

  it("creates an unassigned position without exposing stock actions", async () => {
    const user = userEvent.setup();
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    repository.createRack(scope, { name: "A架" }, actor);
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={allPermissions} repository={repository} />);

    await user.click(screen.getByRole("button", { name: "新增酒位" }));
    await user.type(screen.getByLabelText("酒位编号"), "U1");
    await user.click(screen.getByRole("button", { name: "保存酒位" }));

    expect(screen.getByRole("heading", { name: "未分配商品" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "盘点 U1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收货 U1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "修正 U1" })).not.toBeInTheDocument();
  });

  it("keeps an out-of-catalog matched assignment when only dimensions are edited", async () => {
    const user = userEvent.setup();
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    const rack = repository.createRack(scope, { name: "A架" }, actor);
    repository.createPosition(scope, {
      rackId: rack.id, code: "A1", width: 3, depth: 2, stockUnit: "bottle",
      fillDirection: "front-to-back", lowStockMode: "percentage", lowStockThreshold: 25,
      assignment: {
        productId: "wine-legacy", productName: "Legacy Red", matchStatus: "matched",
        invoiceReference: "INV-100", unitCost: 10
      }
    }, actor);
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={allPermissions} productCatalog={[]} repository={repository} />);

    await user.click(screen.getByRole("button", { name: "配置 A1" }));
    await user.clear(screen.getByLabelText("每排数量"));
    await user.type(screen.getByLabelText("每排数量"), "4");
    await user.click(screen.getByRole("button", { name: "保存酒位" }));

    const snapshot = repository.getSnapshot(scope);
    expect(snapshot.positions[0]).toMatchObject({ width: 4, capacity: 8 });
    expect(snapshot.assignments.find((assignment) => assignment.active)).toMatchObject({
      productId: "wine-legacy", matchStatus: "matched", invoiceReference: "INV-100", unitCost: 10
    });
  });

  it("keeps rack input and shows the save error when storage fails", async () => {
    const user = userEvent.setup();
    const failingStorage: Storage = {
      length: 0,
      clear() {},
      getItem() { return null; },
      key() { return null; },
      removeItem() {},
      setItem() { throw new Error("disk full"); }
    };
    const repository = new LocalStorageWineCellarRepository({ storage: failingStorage });
    render(<WineCellarModule hotelId="h1" areaId="a1" areaName="主酒库" currentUser={actor}
      permissions={["wine_cellar.view", "wine_cellar.manage_layout"]} repository={repository} />);

    const input = screen.getByLabelText("新酒架名称");
    await user.type(input, "保留输入");
    await user.click(screen.getByRole("button", { name: "新增酒架" }));

    expect(screen.getByRole("alert")).toHaveTextContent("酒库数据保存失败，请重试。");
    expect(input).toHaveValue("保留输入");
  });
});

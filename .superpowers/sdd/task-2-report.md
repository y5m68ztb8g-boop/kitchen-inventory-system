# Task 2 Report

- 日期：2026-07-11
- 目标：仅编写测试，针对下单任务2的前置验证。
- 修改文件：
  - `src/ordering/inventory.test.ts`
  - `src/Home.test.tsx`（仅追加末尾深链路路由断言）
- 未修改生产、服务端、配置文件。

## 聚焦测试执行

已执行：
```bash
pnpm vitest run src/ordering/inventory.test.ts src/Home.test.tsx
```

### 失败结论

1. `src/ordering/inventory.test.ts`：加载失败（首要失败）
   - 错误：无法解析 `../inventoryQuantity`。
   - 说明：当前仓库尚未存在 `src/inventoryQuantity.ts`。

2. `src/Home.test.tsx`：新增深链路用例失败
   - 用例：`opens the selected inventory location from an ordering deep link`
   - 现象：`#freezer?supplierProductId=BRK-100243&location=A1` 渲染仍为首页，未显示冻库位置按钮 `A1`。
   - 说明：当前 `App.getRoute()` 未拆分 hash query，因此不支持按 `supplierProductId/location` 的深链路路由。

## 生产实现（GREEN）

- 新增：
  - src/inventoryQuantity.ts
  - server/ordering/inventory.ts
- 修改：
  - src/inventoryStore.ts
  - src/App.tsx
  - src/FreezerPage.tsx
  - src/DryStorePage.tsx
  - src/App.css
  - tsconfig.node.json

实现内容：
- 将库存整箱/散包等效数量计算提取为纯模块，并由 inventoryStore 保持原有导出入口。
- 建立只读的 ordering inventory snapshot、SHA-256 snapshot key 和 freezer/dry-store 深链。
- hash 路由拆分查询参数；两库页面会以 location 初始化货架筛选，并以 supplierProductId + location 高亮对应行。
- 未从 snapshot 或深链逻辑写入任何库存。

已执行并通过：
~~~
pnpm vitest run src/ordering/inventory.test.ts src/Home.test.tsx src/playwrightIsolation.test.ts
pnpm test
pnpm build
git diff --check
~~~

结果：
- 聚焦测试：3 个测试文件、57 个测试通过。
- 完整单测：9 个测试文件、230 个测试通过。
- TypeScript/Vite 构建通过。

## 自审

- 未修改 e2e/home.spec.ts、e2e/purchasing.spec.ts 或父目录中其他工作者的删除项。
- 未暂存或提交本报告。
- 新增的已提交快照测试把同一商品的 freezer/dry-store 两个位置都保留，但其 totalEquivalentQuantity 期望为两个位置中较高的单位置数量（1.5），而不是物理库存相加值（2.5）。实现遵循该测试契约；后续任务若需要跨位置库存总和，应先确认并补充该语义的测试。

## 下一步（按 task-2 预期）
- 继续实现 `inventoryQuantity` 与 `server/ordering/inventory` 模块后，再次跑 `pnpm vitest run src/ordering/inventory.test.ts src/Home.test.tsx src/playwrightIsolation.test.ts`。
- 计划提交消息：`test: define ordering inventory snapshots`

- [2026-07-11] RED evidence: pnpm vitest run src/ordering/inventory.test.ts
  - Failing test: ordering inventory snapshots > converts full and loose packages into equivalent supplier packs
  - Assertion changed to expect totalEquivalentQuantity=2.5, but actual is 1.5.
  - Assertion error: expected 1.5 to be 2.5 (Object.is equality), line src/ordering/inventory.test.ts:31.
  - Result: 1 failed, 3 passed (4 tests total).

- [2026-07-11] GREEN evidence: totalEquivalentQuantity now sums all retained location equivalent quantities while preserving each location value.
  - pnpm vitest run src/ordering/inventory.test.ts src/Home.test.tsx src/playwrightIsolation.test.ts: 3 files, 57 tests passed.
  - pnpm test: 9 files, 230 tests passed.
  - pnpm build: TypeScript and Vite production build passed.
  - Production change: server/ordering/inventory.ts uses addition rather than Math.max for snapshot totals.

- [2026-07-11] GREEN evidence: scoped warehouse mapping and pending baseline deep links.
  - database.freezer and database.dryStore are normalized with forced freezer/dry-store warehouses; legacy flat arrays remain compatible with an entry warehouse value.
  - Pending freezer baseline rows now match suggested supplier ID plus location and receive aria-current=true and inventory-table-row-highlighted.
  - pnpm vitest run src/ordering/inventory.test.ts src/ordering/inventoryDeepLink.test.tsx src/Home.test.tsx src/playwrightIsolation.test.ts: 4 files, 59 tests passed.
  - pnpm test: 10 files, 232 tests passed.
  - pnpm build: TypeScript and Vite production build passed.
  - The mistaken project-root task-2-report.md was removed; this report remains uncommitted.

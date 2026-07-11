# Task 1 Test-First Report

## Requirements source
- `/Users/xue/Documents/Codex/自然生长/.superpowers/sdd/task-1-brief.md`

## Modified files
- `src/ordering/database.test.ts`

## Commands run
- `pnpm vitest run src/ordering/database.test.ts`

## Observed result
- Vitest failed during module load: cannot resolve `../../server/ordering/database`.
- Command output: `Error: Failed to load url ../../server/ordering/database ... Does the file exist?`
- No tests were collected/executed because the target module file path is missing in the current workspace state.

## Failure reasoning
- The first expected test-run blocker for this task is that the ordering production module file is not yet present (`server/ordering/database.ts` / directory missing), so importing it from `src/ordering/database.test.ts` fails before test execution.
- This matches task expectation that the focused test suite should fail before server-side ordering implementation is added.

## 追加更新 (修复 test fixture)

### 修改文件
- `src/ordering/database.test.ts`

### 变更说明
- 修正用例 `shares one PO while supplier groups keep independent status`：
  - 使用 `getOrCreateDraftBatch` 先创建 draft 批次。
  - 通过 SQL 为批次显式插入最小 `purchase_batch_items`（非空）和 `purchase_batch_suppliers`。
  - 分别为 `CMP` 与 `BRK` 创建供应商组（`status` 初始为 `Pending`）。
  - 使用 `saveBatchPo` + `markSupplierOrdered({ batchId, supplierCode: "CMP", ... })`。

### 测试结果
- 运行命令: `pnpm vitest run src/ordering/database.test.ts`
- 结果: 仍失败，原因与预期一致，缺少 `server/ordering/database` 生产模块导致测试文件无法加载。

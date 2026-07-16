# 酒库库存模块集成说明

当前模块已接入主系统的“区域 > 酒水库”入口，使用独立的酒库 SQLite 数据库和快照 API；酒水商品目录与主食品供应商目录分开维护。

## 1. 模块入口文件

唯一公共入口是：

```text
src/modules/wine-cellar/index.ts
```

主系统不得直接导入 `components/`、`hooks/`、`services/localStorageRepository.ts` 或其他内部文件。

## 2. 主系统需要导入的组件

```tsx
import { WineCellarModule } from "./modules/wine-cellar";

<WineCellarModule
  hotelId={hotel.id}
  areaId={area.id}
  areaName={area.name}
  currentUser={{ id: currentUser.id, name: currentUser.name }}
  permissions={permissions}
/>
```

未传 `repository` 时，组件使用按 `hotelId + areaId` 隔离的 `localStorage`。当前 `WineCellarRepository` 是同步接口；未来网络 API 不能直接替换它。集成时应增加带本地缓存和后台同步的同步桥接层，或把 Repository 与 hook 一并升级为异步接口并处理 loading、竞态和失败回滚。

商品/发票目录通过 `productCatalog` 注入。每项可提供商品 ID、名称、供应商、供应商编码、发票引用、单位成本和货币。没有匹配的手工商品正常保存库存数量，但估值为零。

当前主系统的酒库页面只注入 Tennent's 酒水发票目录（`src/generated/tennentsWineCatalogue.ts`），不会调用 Campbells、MacMurphy 或 Brakes 的主食品发票目录。

## 3. 需要新增的路由

建议主系统增加：

```text
/areas/:areaId/wine-cellar
```

如果当前 hash 路由继续保留，可使用等价的 `#areas/:areaId/wine-cellar`。本分支没有修改 `src/App.tsx`，由区域架构任务选择最终路由形式。

## 4. 如何识别 `wine_cellar` 区域

区域注册表或区域主页读取 Area 后，应使用稳定类型值：

```ts
if (area.type === "wine_cellar") {
  return <WineCellarModule hotelId={area.hotelId} areaId={area.id} areaName={area.name} currentUser={user} permissions={permissions} />;
}
```

不要使用区域名称文本推断类型。若主系统引入区域模块注册器，只注册 `WineCellarModule` 公共入口。

## 5. 数据库迁移与 API 接线

独立 SQLite 默认路径建议为：

```text
local-data/wine-cellar.sqlite
```

`server/wine-cellar/schema.ts` 包含幂等初始化，会创建并索引：

- `wine_cellar_racks`
- `wine_cellar_positions`
- `wine_cellar_product_assignments`
- `wine_cellar_count_sessions`
- `wine_cellar_count_entries`
- `wine_cellar_receipts`
- `wine_cellar_stock_adjustments`
- `wine_cellar_audit_events`

`createWineCellarDatabase(path)` 在打开数据库时自动执行初始化并启用外键。它不修改普通库存 JSON、Supabase、purchasing 或 ordering 表，也没有写入现有迁移文件。

本次没有注册 API。后续接线建议在独立 `server/wine-cellar/routes.ts` 中暴露 Repository 操作，再在 `vite.config.ts` 的开发服务器插件中安装路由。采用缓存桥接 Repository 时，组件和内部视图不需要改变；若改为异步 Repository，则需要同步调整 `useWineCellar`。

为了让 Node TypeScript 项目检查共享的模块领域类型，本分支只在 `tsconfig.node.json` 增加了 `src/modules/wine-cellar/types`、`utils` 和 `services` 的 include 范围。

## 6. 环境变量

当前浏览器 localStorage 模式没有必需环境变量。

SQLite Repository 支持可选变量：

```text
GROW_NATURALLY_WINE_CELLAR_DB_PATH
```

未传显式路径且没有该变量时，默认使用 `local-data/wine-cellar.sqlite`。不要使用 `VITE_` 前缀暴露服务器路径。

## 7. 权限要求

- `wine_cellar.view`：查看模块。
- `wine_cellar.manage_layout`：新增、重命名、停用酒架和酒位。
- `wine_cellar.count`：保存数字货架盘点。
- `wine_cellar.receive`：记录收货补货。
- `wine_cellar.adjust`：记录带原因的库存修正。
- `wine_cellar.view_cost`：查看单位成本和酒库估值。

所有写操作使用传入的 `currentUser` 记录操作人 ID、名称和 ISO 时间。

## 8. 如何运行测试

在 `experiments/grow-naturally-supabase-trial` 中运行：

```bash
pnpm test -- src/modules/wine-cellar/tests
pnpm test
pnpm exec tsc -b --pretty false
pnpm build
```

项目当前没有独立 lint 脚本。代码检查使用 TypeScript、生产构建、测试和 `git diff --check`。

## 9. 如何撤销本模块

在尚未集成主路由/API 时：

1. 删除 `src/modules/wine-cellar/`。
2. 删除 `server/wine-cellar/`。
3. 从 `tsconfig.node.json` 删除三个 wine-cellar include 项。
4. 如已在本机生成，可删除 `local-data/wine-cellar.sqlite`。
5. 浏览器如需清理演示数据，删除以 `grow-naturally:wine-cellar:v1:` 开头的 localStorage key。

如果主系统已接线，还需撤销区域注册、路由、API 安装和总金额聚合，但不要删除普通库存数据。

## 10. 可能与主系统冲突的文件

本分支实际修改的非模块文件只有 `tsconfig.node.json`。人工集成时还可能涉及：

- `src/App.tsx`：全局或 hash 路由。
- `src/Home.tsx`：如果区域入口仍在首页维护。
- 未来区域类型/模块注册文件：识别 `wine_cellar`。
- `vite.config.ts`：安装未来 SQLite API 路由。
- 主库存估值聚合文件：加入酒库金额。
- `tsconfig.node.json`：共享服务器类型 include，可能需要与其他分支合并。

### 总库存金额接线

公共入口导出 `calculateInventorySummary(snapshot)`。API 接通后，主系统可读取区域快照并聚合：

```ts
import { calculateInventorySummary } from "./modules/wine-cellar";

const wineCellarValue = calculateInventorySummary(wineCellarSnapshot).totalValue;
const totalInventoryValue = existingInventoryValue + wineCellarValue;
```

仅匹配发票、使用 GBP 且具有非负单位成本的有效商品参与酒库金额。当前版本拒绝保存其他币种，避免把未经换算的金额错误合并为英镑。此分支没有修改现有普通库存估值逻辑。

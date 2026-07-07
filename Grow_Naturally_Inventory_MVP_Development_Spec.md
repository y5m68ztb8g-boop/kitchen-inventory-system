# Grow Naturally — Kitchen Inventory MVP 开发说明

版本：v0.1  
目标：基于历史供应商发票数据库，开发第一版可用的厨房库存录入、搜索、盘点与货值估算系统。

---

## 1. 核心原则

1. 员工看到的是产品名称、位置、数量、供应商名称。
2. 系统内部使用隐藏的内部 Product ID。
3. 供应商商品编码保留，但不能替代酒店内部 Product ID。
4. 发票是供应商商品数据库和价格历史数据库。
5. 新增库存商品时，优先从历史发票记录中选择，避免重复手工录入。
6. 第一版只解决厨房库存，不扩展到采购审批、菜单自动扣料或全酒店平台。

---

## 2. 当前可用数据

数据来源：

- Brakes / Sysco 发票
- Mark Murphy 发票
- Campbell 发票
- 冷冻库 A、B、C、D 及托盘区的商品、位置、数量和包装信息

当前 Excel 数据文件：

`Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx`

系统开发时不得直接把 Excel 当作运行数据库。Excel 仅作为初始导入源。

建议运行数据库：

- 开发阶段：SQLite
- 后续多人使用：PostgreSQL

---

## 3. 第一版必须实现的功能

### 3.1 发票商品搜索

后台新增产品时，用户在搜索框中输入关键词，例如：

`chicken`

系统必须搜索所有已导入发票中的：

- Product Description
- Supplier Product Code
- Supplier Name
- Pack Size
- 历史发票商品名称

搜索结果使用下拉联想方式显示。

每条搜索结果至少显示：

- 供应商名称
- 供应商商品编码
- 发票商品名称
- 包装规格
- 最新采购价格
- 平均采购价格
- 最近采购日期
- 历史购买次数

示例：

```text
Campbell
Code: 22CFIL4
Chicken Fillet 142–170g Skin Off
Pack: 10 pieces
Latest: £xx.xx
Bought: 8 times
```

### 3.2 搜索结果去重

下拉列表不能把同一个商品的每一张发票都单独显示成一行。

正确方式：

- 同一供应商
- 同一 Supplier Product Code

合并成一个供应商商品结果。

该结果下方可以展开查看：

- 所有历史发票日期
- 每次采购单价
- 每次购买数量
- 发票编号

也就是说：

默认显示“唯一供应商商品”，需要时再展开“全部历史发票”。

---

## 4. 新增酒店库存商品流程

用户点击：

`Add Product`

然后执行以下步骤。

### 第一步：搜索历史发票商品

用户输入：

`fudge cake`

系统搜索全部供应商发票数据库，并显示类似：

```text
Brakes
F41554
Chocolate Fudge Cake
1.4kg
Latest price: £xx.xx
```

### 第二步：用户选择正确商品

用户点击所需供应商商品后，系统自动带入：

- Supplier
- Supplier Product Code
- Supplier Product Description
- Pack Size
- Latest Purchase Price
- Average Purchase Price
- VAT Rate
- Latest Purchase Date
- Purchase Unit
- 历史价格记录

### 第三步：用户只补充酒店内部信息

用户手工输入或选择：

- 酒店显示名称
- 存放位置，例如 D3
- 当前库存数量
- 当前库存单位
- 是否已开封
- 最低库存
- 备注
- 是否为自制产品

### 第四步：建立内部产品

系统生成隐藏的内部 Product ID。

示例：

```text
Internal Product ID: 8f31...
Display Name: Chocolate Fudge Cake
Location: D3
Supplier: Brakes
Supplier Code: F41554
```

员工不需要看到或记住 Internal Product ID。

---

## 5. 同一酒店产品关联多个供应商

系统必须允许一个酒店库存产品关联多个供应商商品。

例如：

```text
Hotel Product:
Chicken Breast

Supplier Links:
- Campbell / 22CFIL4
- Brakes / 123456
- Retail purchase / no code
```

原因：

- 同一种产品可能从不同供应商采购
- 更换供应商后，酒店库存历史不能断
- 需要比较供应商价格
- 需要保留不同包装规格

因此数据库中不能把 Supplier Product Code 直接当作酒店产品主键。

---

## 6. 建议数据库结构

### 6.1 hotel_products

酒店实际管理的产品。

字段：

- id
- display_name
- category
- item_type
- default_location_id
- purchase_unit
- usage_unit
- minimum_stock
- active
- homemade
- notes
- created_at
- updated_at

### 6.2 suppliers

字段：

- id
- supplier_code
- supplier_name
- active

示例：

- BRK / Brakes
- MM / Mark Murphy
- CMP / Campbell

### 6.3 supplier_products

每个供应商自己的商品。

字段：

- id
- supplier_id
- supplier_product_code
- supplier_product_name
- pack_size
- purchase_unit
- latest_price
- average_price
- vat_rate
- latest_purchase_date
- purchase_count
- active

唯一约束：

`(supplier_id, supplier_product_code)`

### 6.4 product_supplier_links

酒店产品与供应商商品之间的关联表。

字段：

- id
- hotel_product_id
- supplier_product_id
- preferred
- conversion_factor
- notes

### 6.5 invoice_headers

字段：

- id
- supplier_id
- invoice_number
- invoice_date
- document_type
- invoice_total
- source_file

唯一约束：

`(supplier_id, invoice_number)`

### 6.6 invoice_lines

字段：

- id
- invoice_header_id
- supplier_product_id
- raw_product_description
- raw_pack_size
- quantity
- unit_price
- vat_rate
- line_value

### 6.7 locations

字段：

- id
- display_code
- warehouse
- location_type
- description
- active

示例：

- A1
- B0
- C3
- D4
- P1

### 6.8 inventory_balances

字段：

- id
- hotel_product_id
- location_id
- quantity_purchase_units
- quantity_usage_units
- opened
- last_counted_at
- last_counted_by

### 6.9 inventory_transactions

字段：

- id
- hotel_product_id
- location_id
- transaction_type
- quantity
- unit
- reason
- created_by
- created_at

transaction_type 示例：

- COUNT
- GOODS_IN
- STOCK_OUT
- WASTE
- ADJUSTMENT
- TRANSFER

---

## 7. 搜索逻辑

### 7.1 搜索范围

搜索必须同时覆盖：

- supplier_product_name
- supplier_product_code
- supplier_name
- pack_size
- invoice_lines.raw_product_description

### 7.2 搜索方式

第一版至少支持：

- 不区分大小写
- 部分关键词匹配
- 多关键词匹配
- 编码精确匹配
- 简单模糊匹配

例如输入：

`choc fudge`

应匹配：

`Chocolate Fudge Cake`

输入：

`F41554`

应精确找到对应商品。

### 7.3 搜索结果排序

推荐顺序：

1. 商品编码精确匹配
2. 商品名称精确匹配
3. 名称前缀匹配
4. 多关键词全部命中
5. 模糊匹配
6. 最近采购过的商品优先
7. 购买次数多的商品优先

---

## 8. 产品录入界面

### 左侧：搜索区

- 搜索框
- 供应商筛选
- 分类筛选
- 搜索结果列表

### 右侧：选中商品详情

显示：

- 供应商
- 商品编码
- 发票商品名称
- 包装规格
- 最新价格
- 平均价格
- 最近采购日期
- 价格历史
- 发票历史

底部按钮：

`Use This Product`

点击后进入酒店产品录入表单。

---

## 9. 库存查询界面

首页搜索商品名称。

示例：

输入：

`chicken`

显示：

```text
Chicken Breast
Location: A1
Stock: 7 cases
Supplier: Campbell
Supplier code: 22CFIL4
Latest price: £xx.xx
Estimated value: £xx.xx
```

同时支持：

- 按位置浏览
- 按分类浏览
- 按低库存浏览
- 按未匹配供应商商品浏览

---

## 10. 库存盘点界面

按位置进入：

```text
A1
```

显示该位置所有产品。

每个产品可以录入：

- 整箱数量
- 开箱后的袋数
- 散装件数
- 是否已开封
- 备注

第一版允许双单位显示，例如：

```text
2 cases + 3 pieces
1 case + 2 bags
```

禁止强迫员工换算成小数箱。

---

## 11. 货值计算

货值计算优先级：

1. 最新采购价
2. 没有最新价时使用平均采购价
3. 没有可用价格时标记为未估值

公式：

```text
Estimated Stock Value =
Quantity in Purchase Units × Latest Purchase Price
```

存在散装库存时，必须根据 Pack Size 或 conversion_factor 换算。

如果无法安全换算：

- 不允许猜
- 显示“需要确认包装换算”
- 不计入已确认货值

首页必须区分：

- 已确认货值
- 估算货值
- 未估值产品数量

---

## 12. 发票导入逻辑

后台必须提供：

`Import Invoices`

支持批量导入 PDF。

导入流程：

1. 识别供应商
2. 识别发票号和日期
3. 提取商品编码
4. 提取商品名称
5. 提取包装规格
6. 提取数量
7. 提取单价
8. 提取 VAT
9. 提取行金额
10. 更新 supplier_products 的最新价格和平均价格

重复导入同一张发票时不得重复写入。

---

## 13. MVP 范围

第一版必须做：

- 发票数据库导入
- 发票商品搜索
- 下拉联想
- 选择供应商商品后自动填充
- 新建酒店产品
- 产品与供应商商品关联
- 库存查询
- 按位置盘点
- 货值估算
- 未匹配项审核

第一版不做：

- 自动下采购单
- 菜单销售自动扣库存
- POS 对接
- 用户复杂权限
- 手机扫码
- EHO 温度记录
- 能源系统
- 客房库存
- 自动识别包装照片

---

## 14. Codex 开发顺序

### Step 1

创建 SQLite 数据库和迁移文件。

### Step 2

把现有 Excel 中的数据导入：

- Suppliers
- Supplier Products
- Invoice Headers
- Invoice Lines
- Locations
- Hotel Products
- Inventory

### Step 3

实现供应商商品搜索 API。

建议接口：

```text
GET /api/supplier-products/search?q=chicken
```

返回：

- supplier
- supplier_product_code
- product_name
- pack_size
- latest_price
- average_price
- latest_purchase_date
- purchase_count

### Step 4

实现新增酒店产品页面。

### Step 5

实现产品查询页面。

### Step 6

实现位置盘点页面。

### Step 7

实现货值页面。

### Step 8

实现发票重新导入和去重。

---

## 15. 验收标准

### 搜索

输入 `chicken` 后，两秒内显示全部相关供应商商品。

### 编码搜索

输入完整供应商编码后，必须优先显示精确结果。

### 自动填充

选中供应商商品后，供应商、商品编码、名称、包装、最新价格、平均价格和采购日期必须自动填入。

### 防重复

同一个供应商编码不得重复生成多个 supplier_product。

### 多供应商关联

一个酒店产品必须可以关联多个 supplier_product。

### 发票追溯

任意 supplier_product 都可以查看历史发票和历史价格。

### 库存货值

能换算的商品自动计算货值；不能换算的商品明确提示，不得猜测。

---

## 16. 前端用语

员工界面始终显示业务名称：

- Chicken Breast
- A1
- Brakes
- 7 cases

隐藏系统字段：

- Internal Product ID
- Database primary key
- Foreign key

编码只在采购和后台详情中显示。

---

## 17. 第一版推荐技术栈

推荐：

- Frontend: Next.js
- Backend: Next.js API routes 或 FastAPI
- Database: SQLite
- ORM: Prisma 或 SQLAlchemy
- Search: SQLite FTS5
- Styling: Tailwind CSS
- Import: Python PDF parser
- Deployment: 本地电脑或酒店局域网

第一版优先保证：

- 可靠
- 快
- 简单
- 能实际使用

不要过早引入微服务、复杂权限、消息队列或云架构。

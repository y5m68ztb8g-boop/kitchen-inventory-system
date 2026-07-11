import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { getCopy } from "./copy";
import {
  persistInventoryDatabase,
  saveLocalInventoryDatabase,
  shouldSyncInventoryDatabaseFromServer,
  syncInventoryDatabaseFromServer
} from "./inventoryDatabase";
import {
  buildInventoryEntry,
  calculateInventoryLineTotal,
  formatCurrency,
  getInventoryPackageCounts,
  getInvoiceUnitLabel,
  loadInventoryEntries,
  saveInventoryEntries,
  supplierShortName,
  type InventoryEntry
} from "./inventoryStore";
import { searchSupplierProducts, type SupplierProduct } from "./supplierProducts";

const dryStoreAreas = [
  { filterCode: "A", label: "A货架", className: "dry-store-rack dry-rack-a", positions: ["A0", "A1", "A2", "A3", "A4"] },
  { filterCode: "B", label: "B货架", className: "dry-store-rack dry-rack-b", positions: ["B0", "B1", "B2", "B3", "B4"] },
  { filterCode: "C", label: "C货架", className: "dry-store-rack dry-rack-c", positions: ["C0", "C1", "C2", "C3", "C4"] },
  { filterCode: "F", label: "F货架", className: "dry-store-rack dry-rack-f", positions: ["F0", "F1", "F2", "F3", "F4"] }
];
const openPackageOptions = [0, 25, 50, 75, 100];
const allLocationFilter = "ALL";

type DeleteRequest = {
  id: string;
  productName: string;
};

type RenameTarget = {
  id: string;
  name: string;
};

export function DryStorePage({
  initialLocation,
  supplierProductId
}: {
  initialLocation?: string | null;
  supplierProductId?: string | null;
} = {}) {
  const copy = getCopy();
  const [entries, setEntries] = useState<InventoryEntry[]>(() => loadInventoryEntries("dry-store"));
  const [formOpen, setFormOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [locationCode, setLocationCode] = useState("A0");
  const [quantity, setQuantity] = useState("");
  const [openPackagePercent, setOpenPackagePercent] = useState(0);
  const [unit, setUnit] = useState("");
  const [selectedSupplierProduct, setSelectedSupplierProduct] = useState<SupplierProduct | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteRequest | null>(null);
  const [locationFilter, setLocationFilter] = useState(() =>
    dryStoreAreas.some((area) => area.positions.includes(initialLocation || "")) ? initialLocation || allLocationFilter : allLocationFilter
  );
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const invoiceResults = useMemo(() => searchSupplierProducts(productName), [productName]);
  const inventoryTableRows = useMemo(
    () =>
      entries
        .filter((entry) => locationMatchesFilter(entry.locationCode, locationFilter))
        .map((entry, index) => ({
          entry,
          sortIndex: index,
          total: calculateInventoryLineTotal(entry)
        }))
        .sort((left, right) => compareDryStoreRows(left, right, locationFilter)),
    [entries, locationFilter]
  );

  useEffect(() => {
    if (!shouldSyncInventoryDatabaseFromServer()) {
      return;
    }

    let active = true;

    void syncInventoryDatabaseFromServer().then((database) => {
      if (!active) {
        return;
      }

      const nextEntries = database.dryStore.length > 0 || entries.length === 0 ? database.dryStore : entries;
      const nextDatabase = {
        ...database,
        dryStore: nextEntries
      };

      setEntries(nextEntries);
      saveLocalInventoryDatabase(nextDatabase);
      void persistInventoryDatabase(nextDatabase).catch(() => undefined);
    });

    return () => {
      active = false;
    };
  }, []);

  function updateEntries(nextEntries: InventoryEntry[]) {
    setPendingDelete(null);
    setEntries(nextEntries);
    saveInventoryEntries(nextEntries, "dry-store");
  }

  function handleSave() {
    const numericQuantity = quantity.trim() ? Number(quantity) : 0;
    const valuationQuantity = numericQuantity + openPackagePercent / 100;
    if (
      !productName.trim() ||
      !selectedSupplierProduct ||
      Number.isNaN(numericQuantity) ||
      numericQuantity < 0 ||
      valuationQuantity <= 0
    ) {
      return;
    }

    const nextEntry = buildInventoryEntry({
      describeLocation: describeDryStoreLocation,
      locationCode,
      openPackagePercent,
      productName,
      quantity: numericQuantity,
      supplierProduct: selectedSupplierProduct,
      unit: getInvoiceUnitLabel(selectedSupplierProduct)
    });
    updateEntries([...entries, nextEntry]);
    setFormOpen(false);
    setProductName("");
    setLocationCode("A0");
    setQuantity("");
    setOpenPackagePercent(0);
    setUnit("");
    setSelectedSupplierProduct(null);
  }

  function requestDelete(id: string, productName: string) {
    setPendingDelete({ id, productName });
  }

  function confirmPendingDelete() {
    if (!pendingDelete) {
      return;
    }

    updateEntries(entries.filter((entry) => entry.id !== pendingDelete.id));
  }

  function startRename(id: string, currentName: string) {
    setRenameTarget({ id, name: currentName });
  }

  function saveRename() {
    if (!renameTarget?.name.trim()) {
      return;
    }

    updateEntries(
      entries.map((entry) =>
        entry.id === renameTarget.id ? { ...entry, productName: renameTarget.name.trim() } : entry
      )
    );
    setRenameTarget(null);
  }

  function updateInventoryQuantity(entry: InventoryEntry, delta: number) {
    updateEntries(
      entries.map((currentEntry) =>
        currentEntry.id === entry.id
          ? {
              ...currentEntry,
              quantity: Math.max(0, currentEntry.quantity + delta),
              unit: getInvoiceUnitLabel(currentEntry.supplierProduct)
            }
          : currentEntry
      )
    );
  }

  function updateInventoryPackageCount(
    entry: InventoryEntry,
    field: "fullPackageCount" | "loosePackageCount",
    delta: number
  ) {
    const currentCounts = getInventoryPackageCounts(entry);
    const nextValue = Math.max(0, currentCounts[field] + delta);
    updateEntries(
      entries.map((currentEntry) =>
        currentEntry.id === entry.id
          ? {
              ...currentEntry,
              fullPackageCount: currentCounts.fullPackageCount,
              loosePackageCount: currentCounts.loosePackageCount,
              [field]: nextValue
            }
          : currentEntry
      )
    );
  }

  function renderProductNameControl(entry: InventoryEntry) {
    if (renameTarget?.id === entry.id) {
      return (
        <span className="product-name-editor">
          <input
            aria-label="产品新名称"
            onChange={(event) => setRenameTarget({ ...renameTarget, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                saveRename();
              }
              if (event.key === "Escape") {
                setRenameTarget(null);
              }
            }}
            value={renameTarget.name}
          />
          <button aria-label="保存产品名" className="icon-action-button" onClick={saveRename} type="button">
            <Check aria-hidden="true" size={16} strokeWidth={2} />
          </button>
          <button aria-label="取消改名" className="icon-action-button" onClick={() => setRenameTarget(null)} type="button">
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </span>
      );
    }

    return (
      <span className="product-name-line">
        <strong>{entry.productName}</strong>
        <button
          aria-label={`修改 ${entry.productName} 名字`}
          className="icon-action-button product-name-edit-button"
          onClick={() => startRename(entry.id, entry.productName)}
          type="button"
        >
          <Pencil aria-hidden="true" size={15} strokeWidth={2} />
        </button>
      </span>
    );
  }

  function renderStockControl(entry: InventoryEntry) {
    const packageCounts = getInventoryPackageCounts(entry);
    const canAdjustPackages =
      packageCounts.unitsPerCase > 1 &&
      Boolean(entry.quantityText?.match(/\b(?:case|cases|open\s+case|open\s+cases)\b/i) ||
        packageCounts.loosePackageCount > 0 ||
        entry.fullPackageCount !== undefined);

    if (!canAdjustPackages) {
      return (
        <span className="stock-adjuster">
          {!entry.quantityText && entry.openPackagePercent ? <small>{`开封 +${entry.openPackagePercent}%`}</small> : null}
          <span className="stock-adjuster-row">
            <span>数量</span>
            <button aria-label={`减少 ${entry.productName} 数量`} onClick={() => updateInventoryQuantity(entry, -1)} type="button">
              -
            </button>
            <strong aria-label={`${entry.productName} 数量`}>{entry.quantity}</strong>
            <button aria-label={`增加 ${entry.productName} 数量`} onClick={() => updateInventoryQuantity(entry, 1)} type="button">
              +
            </button>
          </span>
          <small>{`单位 ${getInvoiceUnitLabel(entry.supplierProduct)}`}</small>
        </span>
      );
    }

    return (
      <span className="stock-adjuster">
        <span className="stock-adjuster-row">
          <span>整箱</span>
          <button
            aria-label={`减少 ${entry.productName} 整箱数量`}
            onClick={() => updateInventoryPackageCount(entry, "fullPackageCount", -1)}
            type="button"
          >
            -
          </button>
          <strong aria-label={`${entry.productName} 整箱数量`}>{packageCounts.fullPackageCount}</strong>
          <button
            aria-label={`增加 ${entry.productName} 整箱数量`}
            onClick={() => updateInventoryPackageCount(entry, "fullPackageCount", 1)}
            type="button"
          >
            +
          </button>
        </span>
        <span className="stock-adjuster-row">
          <span>散包</span>
          <button
            aria-label={`减少 ${entry.productName} 散包数量`}
            onClick={() => updateInventoryPackageCount(entry, "loosePackageCount", -1)}
            type="button"
          >
            -
          </button>
          <strong aria-label={`${entry.productName} 散包数量`}>{packageCounts.loosePackageCount}</strong>
          <button
            aria-label={`增加 ${entry.productName} 散包数量`}
            onClick={() => updateInventoryPackageCount(entry, "loosePackageCount", 1)}
            type="button"
          >
            +
          </button>
        </span>
        <small>{`每箱 ${packageCounts.unitsPerCase} 小包`}</small>
        <small>{`单位 ${getInvoiceUnitLabel(entry.supplierProduct)}`}</small>
      </span>
    );
  }

  return (
    <main className="page-shell dry-store-shell">
      <a className="back-link" href="#">
        {copy.routes.backHome}
      </a>
      <section className="page-panel freezer-panel">
        <div className="page-heading-row">
          <h1>干货库</h1>
          <span>Dry Store</span>
        </div>
        <div className="freezer-map dry-store-map" aria-label="干货库货架图" data-layout="corner-l">
          <button
            aria-pressed={locationFilter === allLocationFilter}
            className={`freezer-filter-all ${locationFilter === allLocationFilter ? "freezer-filter-active" : ""}`}
            onClick={() => setLocationFilter(allLocationFilter)}
            type="button"
          >
            全部
          </button>
          {dryStoreAreas.map((area) => (
            <section className={area.className} key={area.label}>
              <button
                aria-pressed={locationFilter === area.filterCode}
                className={`freezer-rack-button ${locationFilter === area.filterCode ? "freezer-filter-active" : ""}`}
                onClick={() => setLocationFilter(area.filterCode)}
                type="button"
              >
                <h2>{area.label}</h2>
              </button>
              <div className="position-grid">
                {area.positions.map((position) => (
                  <button
                    aria-pressed={locationFilter === position}
                    className={locationFilter === position ? "freezer-filter-active" : ""}
                    key={position}
                    onClick={() => setLocationFilter(position)}
                    type="button"
                  >
                    {formatDryStoreLocationCode(position)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <section className="inventory-list-section">
          <div className="inventory-list-header">
            <div>
              <h2>干货库库存总列表</h2>
              <small>{`当前筛选：${getDryStoreLocationFilterLabel(locationFilter)}`}</small>
            </div>
            <button type="button" onClick={() => setFormOpen((current) => !current)}>
              录入产品
            </button>
          </div>
          {formOpen ? (
            <section className="entry-form" aria-label="录入产品表单">
              <div className="entry-form-grid">
                <label>
                  <span>产品名称</span>
                  <input
                    aria-label="产品名称"
                    onChange={(event) => {
                      setProductName(event.target.value);
                      setSelectedSupplierProduct(null);
                    }}
                    value={productName}
                  />
                </label>
                <label>
                  <span>位置</span>
                  <select aria-label="位置" onChange={(event) => setLocationCode(event.target.value)} value={locationCode}>
                    {dryStoreAreas.flatMap((area) =>
                      area.positions.map((position) => (
                        <option key={position} value={position}>
                          {formatDryStoreLocationCode(position)}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  <span>库存数量</span>
                  <input
                    aria-label="库存数量"
                    inputMode="decimal"
                    onChange={(event) => setQuantity(event.target.value)}
                    value={quantity}
                  />
                </label>
                <label>
                  <span>库存单位</span>
                  <input aria-label="库存单位" onChange={(event) => setUnit(event.target.value)} value={unit} />
                </label>
              </div>
              <fieldset className="partial-stock-control">
                <legend>开箱余量</legend>
                <div className="partial-stock-options">
                  {openPackageOptions.map((percent) => (
                    <button
                      aria-pressed={openPackagePercent === percent}
                      className={openPackagePercent === percent ? "partial-stock-option-selected" : ""}
                      key={percent}
                      onClick={() => setOpenPackagePercent(percent)}
                      type="button"
                    >
                      {`${percent}%`}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="invoice-search-field">
                <span>匹配 Excel 发票商品</span>
              </div>
              {productName.trim() ? (
                <div className="invoice-results">
                  {invoiceResults.map((product) => (
                    <button
                      aria-pressed={selectedSupplierProduct?.id === product.id}
                      className={`invoice-result ${
                        selectedSupplierProduct?.id === product.id ? "invoice-result-selected" : ""
                      }`}
                      key={product.id}
                      onClick={() => {
                        setSelectedSupplierProduct(product);
                        setProductName(product.productName);
                      }}
                      type="button"
                    >
                      <strong>{`${product.supplierProductCode} · ${product.productName}`}</strong>
                      <span>{`${supplierShortName(product)} · ${product.packSize || "No pack size"}`}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedSupplierProduct ? (
                <section className="supplier-price-card" aria-label="供应商价格信息">
                  <h3>{selectedSupplierProduct.supplierName}</h3>
                  <p>{`${supplierShortName(selectedSupplierProduct)} / ${selectedSupplierProduct.supplierProductCode}`}</p>
                  <div className="price-chip-row">
                    <span>{`最低 ${formatCurrency(selectedSupplierProduct.lowestPrice)}`}</span>
                    <span>{`最高 ${formatCurrency(selectedSupplierProduct.highestPrice)}`}</span>
                    <span>{`平均 ${formatCurrency(selectedSupplierProduct.averagePrice)}`}</span>
                    <span>{`最后 ${formatCurrency(selectedSupplierProduct.latestPrice)}`}</span>
                  </div>
                </section>
              ) : null}
              <button aria-label="保存产品" className="save-entry-button" onClick={handleSave} type="button">
                <span>保存产品</span>
              </button>
            </section>
          ) : null}
          <div className="inventory-table" role="table" aria-label="干货库库存总列表">
            <div className="inventory-table-row inventory-table-head" role="row">
              <span role="columnheader">产品</span>
              <span role="columnheader">位置</span>
              <span role="columnheader">库存</span>
              <span role="columnheader">供应商 / 价格</span>
            </div>
            {inventoryTableRows.map(({ entry }) => (
              <article
                aria-current={isDeepLinkedEntry(entry, supplierProductId, initialLocation) ? "true" : undefined}
                className={"inventory-table-row" + (isDeepLinkedEntry(entry, supplierProductId, initialLocation) ? " inventory-table-row-highlighted" : "")}
                key={entry.id}
                role="row"
              >
                <span className="inventory-product-cell" role="cell">
                  {renderProductNameControl(entry)}
                  {entry.productName !== entry.supplierProduct.productName ? (
                    <small className="product-subtitle">{entry.supplierProduct.productName}</small>
                  ) : null}
                </span>
                <span className="inventory-location-cell" role="cell">
                  <span className="location-chip">{formatDryStoreLocationCode(entry.locationCode)}</span>
                </span>
                <span className="inventory-stock-cell" role="cell">{renderStockControl(entry)}</span>
                <span className="supplier-price-cell" role="cell">
                  <span className="supplier-code-line">
                    <strong>{`${supplierShortName(entry.supplierProduct)} / ${entry.supplierProduct.supplierProductCode}`}</strong>
                  </span>
                  <span className="price-summary">
                    <small>{`单价 ${formatCurrency(entry.supplierProduct.latestPrice)}`}</small>
                    <small>{`总价 ${formatCurrency(calculateInventoryLineTotal(entry))}`}</small>
                  </span>
                  <span className="inventory-row-actions">
                    <button
                      aria-label={`删除 ${entry.productName}`}
                      className="row-action-button row-action-danger"
                      onClick={() => requestDelete(entry.id, entry.productName)}
                      type="button"
                    >
                      删除
                    </button>
                  </span>
                </span>
              </article>
            ))}
            {inventoryTableRows.length === 0 ? (
              <div className="inventory-empty-row" role="row">
                <span role="cell">这个位置目前没有库存记录</span>
              </div>
            ) : null}
          </div>
        </section>
      </section>
      {pendingDelete ? (
        <section className="delete-confirm-overlay" role="presentation">
          <section
            aria-labelledby="delete-confirm-title"
            aria-modal="true"
            className="delete-confirm-dialog"
            role="dialog"
          >
            <h2 id="delete-confirm-title">确认删除</h2>
            <p>{`是否确认删除 ${pendingDelete.productName}？`}</p>
            <div className="delete-confirm-actions">
              <button className="row-action-button" onClick={() => setPendingDelete(null)} type="button">
                否，取消
              </button>
              <button className="row-action-button row-action-danger" onClick={confirmPendingDelete} type="button">
                是，删除
              </button>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function compareDryStoreRows(
  left: { entry: InventoryEntry; sortIndex: number; total: number },
  right: { entry: InventoryEntry; sortIndex: number; total: number },
  locationFilter: string
) {
  if (locationFilter === allLocationFilter) {
    return right.total - left.total || left.sortIndex - right.sortIndex;
  }

  return getDryStoreLocationSortRank(left.entry.locationCode) - getDryStoreLocationSortRank(right.entry.locationCode) ||
    left.sortIndex - right.sortIndex;
}

function isDeepLinkedEntry(entry: InventoryEntry, supplierProductId?: string | null, locationCode?: string | null) {
  return Boolean(supplierProductId && locationCode && entry.supplierProduct.id === supplierProductId && entry.locationCode === locationCode);
}

function getDryStoreLocationSortRank(locationCode: string) {
  const number = Number(locationCode.slice(1));
  if (Number.isNaN(number)) {
    return 99;
  }

  if (number === 0) {
    return 0;
  }

  if (number === 4) {
    return 4;
  }

  return number;
}

function locationMatchesFilter(locationCode: string, locationFilter: string) {
  if (locationFilter === allLocationFilter) {
    return true;
  }

  return locationFilter.length === 1 ? locationCode.startsWith(locationFilter) : locationCode === locationFilter;
}

function getDryStoreLocationFilterLabel(locationFilter: string) {
  if (locationFilter === allLocationFilter) {
    return "全部";
  }

  if (locationFilter.length === 1) {
    return `${locationFilter}货架`;
  }

  return formatDryStoreLocationCode(locationFilter);
}

export function describeDryStoreLocation(locationCode: string) {
  const zone = locationCode.charAt(0).toUpperCase();
  const displayCode = formatDryStoreLocationCode(locationCode);

  return {
    rack: `${zone}货架`,
    rackEn: `Rack ${zone}`,
    position: displayCode,
    positionEn: displayCode
  };
}

export function formatDryStoreLocationCode(locationCode: string) {
  if (/^[A-Z]0$/.test(locationCode)) {
    return `${locationCode.charAt(0)} top`;
  }

  if (/^[A-Z]4$/.test(locationCode)) {
    return `${locationCode.charAt(0)} floor`;
  }

  return locationCode;
}

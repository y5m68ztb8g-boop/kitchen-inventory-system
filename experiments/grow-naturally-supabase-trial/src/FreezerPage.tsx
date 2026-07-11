import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { getCopy } from "./copy";
import {
  persistInventoryDatabase,
  saveLocalInventoryDatabase,
  shouldSyncInventoryDatabaseFromServer,
  syncInventoryDatabaseFromServer
} from "./inventoryDatabase";
import { FREEZER_INVENTORY, type FreezerInventoryItem } from "./generated/freezerInventory";
import { formatFreezerLocationCode } from "./inventoryData";
import {
  buildInventoryEntry,
  calculateInventoryLineTotal,
  formatCurrency,
  getInvoiceUnitLabel,
  getInventoryPackageCounts,
  loadDeletedInventoryItemIds,
  loadInventoryEntries,
  loadSourceProductNameOverrides,
  parseRecordedQuantity,
  saveDeletedInventoryItemIds,
  saveInventoryEntries,
  saveSourceProductNameOverrides,
  supplierShortName,
  type InventoryEntry
} from "./inventoryStore";
import { getInvoiceMatchCandidates, searchSupplierProducts, type SupplierProduct } from "./supplierProducts";

const freezerAreas = [
  { filterCode: "A", label: "A货架", className: "freezer-rack rack-a", positions: ["A1", "A2", "A3", "A4"] },
  { filterCode: "B", label: "B货架", className: "freezer-rack rack-b", positions: ["B0", "B1", "B2", "B3", "B4"] },
  { filterCode: "C", label: "C货架", className: "freezer-rack rack-c", positions: ["C0", "C1", "C2", "C3", "C4"] },
  { filterCode: "D", label: "D货架", className: "freezer-rack rack-d", positions: ["D0", "D1", "D2", "D3", "D4"] },
  { filterCode: "P", label: "托盘区", className: "freezer-rack pallet-zone", positions: ["P1", "P2", "P3", "P4"] }
];
const openPackageOptions = [0, 25, 50, 75, 100];
const allLocationFilter = "ALL";
type DeleteRequest = {
  key: string;
  productName: string;
};
type RenameTarget = {
  key: string;
  name: string;
};

export function FreezerPage({
  initialLocation,
  supplierProductId
}: {
  initialLocation?: string | null;
  supplierProductId?: string | null;
} = {}) {
  const copy = getCopy();
  const [entries, setEntries] = useState<InventoryEntry[]>(() => syncRecordedEntries(loadInventoryEntries()));
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<string>>(
    () => new Set(loadDeletedInventoryItemIds())
  );
  const [formOpen, setFormOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [locationCode, setLocationCode] = useState("A1");
  const [quantity, setQuantity] = useState("");
  const [openPackagePercent, setOpenPackagePercent] = useState(0);
  const [unit, setUnit] = useState("");
  const [selectedSupplierProduct, setSelectedSupplierProduct] = useState<SupplierProduct | null>(null);
  const [activeMatchItemId, setActiveMatchItemId] = useState("");
  const [matchQuery, setMatchQuery] = useState("");
  const [selectedMatchProduct, setSelectedMatchProduct] = useState<SupplierProduct | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteRequest | null>(null);
  const [locationFilter, setLocationFilter] = useState(() =>
    freezerAreas.some((area) => area.positions.includes(initialLocation || "")) ? initialLocation || allLocationFilter : allLocationFilter
  );
  const [sourceNameOverrides, setSourceNameOverrides] = useState<Record<string, string>>(
    () => loadSourceProductNameOverrides()
  );
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const invoiceResults = useMemo(() => searchSupplierProducts(productName), [productName]);
  const entryBySourceId = useMemo(
    () => new Map(entries.flatMap((entry) => (entry.sourceItemId ? [[entry.sourceItemId, entry] as const] : []))),
    [entries]
  );
  const manualEntries = entries.filter((entry) => !entry.sourceItemId);
  const visibleFreezerInventory = useMemo(
    () =>
      FREEZER_INVENTORY.filter((item) => !deletedSourceIds.has(item.id)).map((item) => ({
        ...item,
        productName: sourceNameOverrides[item.id] || item.productName
      })),
    [deletedSourceIds, sourceNameOverrides]
  );
  const allInventoryTableRows = useMemo(() => {
    const sourceRows = visibleFreezerInventory.map((item, index) => {
      const matchedEntry = entryBySourceId.get(item.id);

      return matchedEntry
        ? {
            entry: matchedEntry,
            item,
            sortIndex: index,
            total: calculateInventoryLineTotal(matchedEntry),
            type: "entry" as const
          }
        : {
            item,
            sortIndex: index,
            total: Number.NEGATIVE_INFINITY,
            type: "pending" as const
          };
    });
    const manualRows = manualEntries.map((entry, index) => ({
      entry,
      item: undefined,
      sortIndex: visibleFreezerInventory.length + index,
      total: calculateInventoryLineTotal(entry),
      type: "entry" as const
    }));

    return [...sourceRows, ...manualRows];
  }, [entryBySourceId, manualEntries, visibleFreezerInventory]);
  const inventoryTableRows = useMemo(() => {
    const filteredRows = allInventoryTableRows.filter((row) =>
      locationMatchesFilter(getTableRowLocationCode(row), locationFilter)
    );

    return filteredRows.sort((left, right) => compareInventoryRows(left, right, locationFilter));
  }, [allInventoryTableRows, locationFilter]);
  const activeMatchItem = FREEZER_INVENTORY.find((item) => item.id === activeMatchItemId);
  const matchCandidates = useMemo(() => {
    if (!activeMatchItem) {
      return [];
    }

    return getInvoiceMatchCandidates({
      productName: matchQuery || activeMatchItem.productName,
      suggestedSupplierCode: activeMatchItem.suggestedSupplierCode,
      suggestedSupplierProductCode: activeMatchItem.suggestedSupplierProductCode
    });
  }, [activeMatchItem, matchQuery]);

  useEffect(() => {
    if (!shouldSyncInventoryDatabaseFromServer()) {
      return;
    }

    let active = true;

    void syncInventoryDatabaseFromServer().then((database) => {
      if (!active) {
        return;
      }

      const syncedEntries = syncRecordedEntries(database.freezer);
      const hasStoredFreezerState =
        database.freezer.length > 0 ||
        database.deletedFreezerInventoryIds.length > 0 ||
        Object.keys(database.freezerSourceNameOverrides).length > 0;
      const nextEntries = hasStoredFreezerState || entries.length === 0 ? syncedEntries : entries;
      const nextDeletedSourceIds = hasStoredFreezerState
        ? database.deletedFreezerInventoryIds
        : [...deletedSourceIds];
      const nextSourceNameOverrides = hasStoredFreezerState
        ? database.freezerSourceNameOverrides
        : sourceNameOverrides;
      const nextDatabase = {
        ...database,
        deletedFreezerInventoryIds: nextDeletedSourceIds,
        freezer: nextEntries,
        freezerSourceNameOverrides: nextSourceNameOverrides
      };

      setEntries(nextEntries);
      setDeletedSourceIds(new Set(nextDeletedSourceIds));
      setSourceNameOverrides(nextSourceNameOverrides);
      saveLocalInventoryDatabase(nextDatabase);
      void persistInventoryDatabase(nextDatabase).catch(() => undefined);
    });

    return () => {
      active = false;
    };
  }, []);

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
      locationCode,
      openPackagePercent,
      productName,
      quantity: numericQuantity,
      supplierProduct: selectedSupplierProduct,
      unit: getInvoiceUnitLabel(selectedSupplierProduct)
    });
    const nextEntries = [...entries, nextEntry];
    setEntries(nextEntries);
    saveInventoryEntries(nextEntries);
    setFormOpen(false);
    setProductName("");
    setLocationCode("A1");
    setQuantity("");
    setOpenPackagePercent(0);
    setUnit("");
    setSelectedSupplierProduct(null);
  }

  function updateEntries(nextEntries: InventoryEntry[]) {
    setPendingDelete(null);
    setEntries(nextEntries);
    saveInventoryEntries(nextEntries);
  }

  function updateDeletedSourceIds(nextDeletedSourceIds: Set<string>) {
    setPendingDelete(null);
    setDeletedSourceIds(nextDeletedSourceIds);
    saveDeletedInventoryItemIds([...nextDeletedSourceIds]);
  }

  function updateSourceNameOverrides(nextOverrides: Record<string, string>) {
    setSourceNameOverrides(nextOverrides);
    saveSourceProductNameOverrides(nextOverrides);
  }

  function clearActiveInvoiceMatch() {
    setActiveMatchItemId("");
    setMatchQuery("");
    setSelectedMatchProduct(null);
  }

  function openInvoiceMatch(item: FreezerInventoryItem, currentMatch?: SupplierProduct) {
    setActiveMatchItemId(item.id);
    setMatchQuery(currentMatch?.productName || item.productName);
    setSelectedMatchProduct(currentMatch || null);
  }

  function deleteInventoryEntry(entry: InventoryEntry) {
    updateEntries(entries.filter((currentEntry) => currentEntry.id !== entry.id));
  }

  function deleteRecordedInventory(item: FreezerInventoryItem) {
    updateEntries(entries.filter((entry) => entry.sourceItemId !== item.id));
    const nextDeletedSourceIds = new Set(deletedSourceIds);
    nextDeletedSourceIds.add(item.id);
    updateDeletedSourceIds(nextDeletedSourceIds);
    if (activeMatchItemId === item.id) {
      clearActiveInvoiceMatch();
    }
  }

  function requestDelete(deleteKey: string, productName: string) {
    setPendingDelete({ key: deleteKey, productName });
  }

  function confirmPendingDelete() {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.key.startsWith("source:")) {
      const sourceId = pendingDelete.key.replace("source:", "");
      const sourceItem = FREEZER_INVENTORY.find((item) => item.id === sourceId);
      if (sourceItem) {
        deleteRecordedInventory(sourceItem);
      }
      return;
    }

    const entryId = pendingDelete.key.replace("entry:", "");
    const entry = entries.find((currentEntry) => currentEntry.id === entryId);
    if (entry) {
      deleteInventoryEntry(entry);
    }
  }

  function cancelPendingDelete() {
    setPendingDelete(null);
  }

  function startRename(renameKey: string, currentName: string) {
    setRenameTarget({ key: renameKey, name: currentName });
  }

  function updateRenameDraft(nextName: string) {
    setRenameTarget((current) => (current ? { ...current, name: nextName } : current));
  }

  function cancelRename() {
    setRenameTarget(null);
  }

  function saveRename() {
    if (!renameTarget) {
      return;
    }

    const nextName = renameTarget.name.trim();
    if (!nextName) {
      return;
    }

    if (renameTarget.key.startsWith("source:")) {
      const sourceId = renameTarget.key.replace("source:", "");
      updateEntries(
        entries.map((entry) => (entry.sourceItemId === sourceId ? { ...entry, productName: nextName } : entry))
      );
      updateSourceNameOverrides({ ...sourceNameOverrides, [sourceId]: nextName });
      setRenameTarget(null);
      return;
    }

    const entryId = renameTarget.key.replace("entry:", "");
    updateEntries(entries.map((entry) => (entry.id === entryId ? { ...entry, productName: nextName } : entry)));
    setRenameTarget(null);
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

  function confirmInvoiceMatch(item: FreezerInventoryItem) {
    if (!selectedMatchProduct) {
      return;
    }

    const parsedQuantity = parseRecordedQuantity(item.quantityText);
    const nextEntry = buildInventoryEntry({
      locationCode: item.locationCode,
      productName: item.productName,
      quantity: parsedQuantity.quantity,
      quantityText: item.quantityText,
      sourceItemId: item.id,
      supplierProduct: selectedMatchProduct,
      unit: getInvoiceUnitLabel(selectedMatchProduct)
    });
    updateEntries([...entries.filter((entry) => entry.sourceItemId !== item.id), nextEntry]);
    clearActiveInvoiceMatch();
  }

  function renderInvoiceMatchPanel(item: FreezerInventoryItem) {
    return (
      <section className="match-panel" key={`${item.id}-match`} aria-label={`${item.productName} 发票匹配`}>
        <label className="invoice-search-field">
          <span>搜索发票商品</span>
          <input
            onChange={(event) => {
              setMatchQuery(event.target.value);
              setSelectedMatchProduct(null);
            }}
            value={matchQuery}
          />
        </label>
        <div className="invoice-results">
          {matchCandidates.length === 0 ? (
            <section className="invoice-empty-state">
              <strong>发票历史里没有找到匹配商品</strong>
              {item.recordedSupplierCode ? <span>{`记录货号 ${item.recordedSupplierCode}`}</span> : null}
              <small>这说明当前 Excel 发票库里没有对应采购记录，需要手动查发票或以后补录。</small>
            </section>
          ) : null}
          {matchCandidates.map((product) => (
            <button
              aria-pressed={selectedMatchProduct?.id === product.id}
              className={`invoice-result ${selectedMatchProduct?.id === product.id ? "invoice-result-selected" : ""}`}
              key={product.id}
              onClick={() => setSelectedMatchProduct(product)}
              type="button"
            >
              <strong>{`${product.supplierProductCode} · ${product.productName}`}</strong>
              <span>{`${supplierShortName(product)} · ${product.packSize || "No pack size"}`}</span>
            </button>
          ))}
        </div>
        {selectedMatchProduct ? (
          <section className="supplier-price-card" aria-label="供应商价格信息">
            <h3>{selectedMatchProduct.supplierName}</h3>
            <p>{`${supplierShortName(selectedMatchProduct)} / ${selectedMatchProduct.supplierProductCode}`}</p>
            <div className="price-chip-row">
              <span>{`最低 ${formatCurrency(selectedMatchProduct.lowestPrice)}`}</span>
              <span>{`最高 ${formatCurrency(selectedMatchProduct.highestPrice)}`}</span>
              <span>{`平均 ${formatCurrency(selectedMatchProduct.averagePrice)}`}</span>
              <span>{`最后 ${formatCurrency(selectedMatchProduct.latestPrice)}`}</span>
            </div>
          </section>
        ) : null}
        <button
          className="confirm-match-button"
          disabled={!selectedMatchProduct}
          onClick={() => confirmInvoiceMatch(item)}
          type="button"
        >
          确认匹配
        </button>
      </section>
    );
  }

  function renderEntryRow(entry: InventoryEntry, sourceItem?: FreezerInventoryItem) {
    const matchOpen = sourceItem ? activeMatchItemId === sourceItem.id : false;
    const deleteKey = sourceItem ? `source:${sourceItem.id}` : `entry:${entry.id}`;
    const renameKey = deleteKey;

    return (
      <Fragment key={entry.id}>
        <article
          aria-current={isDeepLinkedEntry(entry, supplierProductId, initialLocation) ? "true" : undefined}
          className={"inventory-table-row" + (isDeepLinkedEntry(entry, supplierProductId, initialLocation) ? " inventory-table-row-highlighted" : "")}
          role="row"
        >
          <span className="inventory-product-cell" role="cell">
            {renderProductNameControl(renameKey, entry.productName)}
            {entry.productName !== entry.supplierProduct.productName ? (
              <small className="product-subtitle">{entry.supplierProduct.productName}</small>
            ) : null}
          </span>
          <span className="inventory-location-cell" role="cell">
            <span className="location-chip">{formatFreezerLocationCode(entry.locationCode)}</span>
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
              {sourceItem ? (
                <button
                  aria-label={`编辑 ${entry.productName} 发票`}
                  className="row-action-button"
                  onClick={() => openInvoiceMatch(sourceItem, entry.supplierProduct)}
                  type="button"
                >
                  编辑
                </button>
              ) : null}
              <button
                aria-label={`删除 ${entry.productName}`}
                className="row-action-button row-action-danger"
                onClick={() => requestDelete(deleteKey, entry.productName)}
                type="button"
              >
                删除
              </button>
            </span>
          </span>
        </article>
        {sourceItem && matchOpen ? renderInvoiceMatchPanel(sourceItem) : null}
      </Fragment>
    );
  }

  function renderStockControl(entry: InventoryEntry) {
    const packageCounts = getInventoryPackageCounts(entry);
    const canAdjustPackages =
      packageCounts.unitsPerCase > 1 &&
      Boolean(
        entry.quantityText?.match(/\b(?:case|cases|open\s+case|open\s+cases)\b/i) ||
          packageCounts.loosePackageCount > 0 ||
          entry.fullPackageCount !== undefined
      );

    if (!canAdjustPackages) {
      return (
        <span className="stock-adjuster">
          {entry.quantityText ? <small>{entry.quantityText}</small> : null}
          {!entry.quantityText && entry.openPackagePercent ? <small>{`开封 +${entry.openPackagePercent}%`}</small> : null}
          <span className="stock-adjuster-row">
            <span>数量</span>
            <button
              aria-label={`减少 ${entry.productName} 数量`}
              onClick={() => updateInventoryQuantity(entry, -1)}
              type="button"
            >
              -
            </button>
            <strong aria-label={`${entry.productName} 数量`}>{entry.quantity}</strong>
            <button
              aria-label={`增加 ${entry.productName} 数量`}
              onClick={() => updateInventoryQuantity(entry, 1)}
              type="button"
            >
              +
            </button>
          </span>
          <small>{`单位 ${getInvoiceUnitLabel(entry.supplierProduct)}`}</small>
        </span>
      );
    }

    return (
      <span className="stock-adjuster">
        {entry.quantityText ? <small>{entry.quantityText}</small> : null}
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

  function renderPendingInventory(item: FreezerInventoryItem) {
    const matchOpen = activeMatchItemId === item.id;
    const deleteKey = `source:${item.id}`;
    const deepLinked = isDeepLinkedPendingInventory(item, supplierProductId, initialLocation);

    return (
      <Fragment key={item.id}>
        <article
          aria-current={deepLinked ? "true" : undefined}
          className={"inventory-table-row" + (deepLinked ? " inventory-table-row-highlighted" : "")}
          key={item.id}
          role="row"
        >
          <span className="inventory-product-cell" role="cell">
            {renderProductNameControl(deleteKey, item.productName)}
            <small className="product-subtitle">
              {item.recordedSupplierCode ? `${item.id} · 货号 ${item.recordedSupplierCode}` : item.id}
            </small>
          </span>
          <span className="inventory-location-cell" role="cell">
            <span className="location-chip">{formatFreezerLocationCode(item.locationCode)}</span>
          </span>
          <span className="inventory-stock-cell" role="cell">
            <span className="pending-stock-text">{item.quantityText}</span>
          </span>
          <span className="supplier-price-cell pending-price-cell" role="cell">
            <span className="inventory-row-actions">
              <button
                aria-label={`匹配 ${item.productName} 发票`}
                className="match-invoice-button"
                onClick={() => openInvoiceMatch(item)}
                type="button"
              >
                等待匹配发票
              </button>
              <button
                aria-label={`删除 ${item.productName}`}
                className="row-action-button row-action-danger"
                onClick={() => requestDelete(deleteKey, item.productName)}
                type="button"
              >
                删除
              </button>
            </span>
          </span>
        </article>
        {matchOpen ? renderInvoiceMatchPanel(item) : null}
      </Fragment>
    );
  }

  function renderProductNameControl(renameKey: string, currentName: string) {
    if (renameTarget?.key === renameKey) {
      return (
        <span className="product-name-editor">
          <input
            aria-label="产品新名称"
            onChange={(event) => updateRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                saveRename();
              }
              if (event.key === "Escape") {
                cancelRename();
              }
            }}
            value={renameTarget.name}
          />
          <button aria-label="保存产品名" className="icon-action-button" onClick={saveRename} type="button">
            <Check aria-hidden="true" size={16} strokeWidth={2} />
          </button>
          <button aria-label="取消改名" className="icon-action-button" onClick={cancelRename} type="button">
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </span>
      );
    }

    return (
      <span className="product-name-line">
        <strong>{currentName}</strong>
        <button
          aria-label={`修改 ${currentName} 名字`}
          className="icon-action-button product-name-edit-button"
          onClick={() => startRename(renameKey, currentName)}
          type="button"
        >
          <Pencil aria-hidden="true" size={15} strokeWidth={2} />
        </button>
      </span>
    );
  }

  return (
    <main className="page-shell freezer-shell">
      <a className="back-link" href="#">
        {copy.routes.backHome}
      </a>
      <section className="page-panel freezer-panel">
        <div className="page-heading-row">
          <h1>冷冻库</h1>
          <span>Freezer</span>
        </div>
        <div className="freezer-map" aria-label="冷冻库货架图">
          <button
            aria-pressed={locationFilter === allLocationFilter}
            className={`freezer-filter-all ${locationFilter === allLocationFilter ? "freezer-filter-active" : ""}`}
            onClick={() => setLocationFilter(allLocationFilter)}
            type="button"
          >
            全部
          </button>
          {freezerAreas.map((area) => (
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
                    {formatFreezerLocationCode(position)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <section className="inventory-list-section">
          <div className="inventory-list-header">
            <div>
              <h2>冷冻库库存总列表</h2>
              <small>{`当前筛选：${getLocationFilterLabel(locationFilter)}`}</small>
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
                  <select
                    aria-label="位置"
                    onChange={(event) => setLocationCode(event.target.value)}
                    value={locationCode}
                  >
                    {freezerAreas.flatMap((area) =>
                      area.positions.map((position) => (
                        <option key={position} value={position}>
                          {formatFreezerLocationCode(position)}
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
                  <input
                    aria-label="库存单位"
                    onChange={(event) => setUnit(event.target.value)}
                    value={unit}
                  />
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
          <div className="inventory-table" role="table" aria-label="冷冻库库存总列表">
            <div className="inventory-table-row inventory-table-head" role="row">
              <span role="columnheader">产品</span>
              <span role="columnheader">位置</span>
              <span role="columnheader">库存</span>
              <span role="columnheader">供应商 / 价格</span>
            </div>
            {inventoryTableRows.map((row) =>
              row.type === "pending" ? renderPendingInventory(row.item) : renderEntryRow(row.entry, row.item)
            )}
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
              <button className="row-action-button" onClick={cancelPendingDelete} type="button">
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

type InventoryTableRow =
  | {
      entry: InventoryEntry;
      item: FreezerInventoryItem | undefined;
      sortIndex: number;
      total: number;
      type: "entry";
    }
  | {
      item: FreezerInventoryItem;
      sortIndex: number;
      total: number;
      type: "pending";
    };

function getTableRowLocationCode(row: InventoryTableRow) {
  return row.type === "pending" ? row.item.locationCode : row.entry.locationCode;
}

function isDeepLinkedEntry(entry: InventoryEntry, supplierProductId?: string | null, locationCode?: string | null) {
  return Boolean(supplierProductId && locationCode && entry.supplierProduct.id === supplierProductId && entry.locationCode === locationCode);
}

function isDeepLinkedPendingInventory(
  item: FreezerInventoryItem,
  supplierProductId?: string | null,
  locationCode?: string | null
) {
  const itemSupplierProductId =
    item.suggestedSupplierCode && item.suggestedSupplierProductCode
      ? `${item.suggestedSupplierCode}-${item.suggestedSupplierProductCode}`
      : "";
  return Boolean(
    supplierProductId &&
      locationCode &&
      itemSupplierProductId === supplierProductId &&
      item.locationCode === locationCode
  );
}

function compareInventoryRows(left: InventoryTableRow, right: InventoryTableRow, locationFilter: string) {
  if (locationFilter === allLocationFilter) {
    return right.total - left.total || left.sortIndex - right.sortIndex;
  }

  return (
    getLocationSortRank(getTableRowLocationCode(left)) - getLocationSortRank(getTableRowLocationCode(right)) ||
    left.sortIndex - right.sortIndex
  );
}

function getLocationSortRank(locationCode: string) {
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

function getLocationFilterLabel(locationFilter: string) {
  if (locationFilter === allLocationFilter) {
    return "全部";
  }

  if (locationFilter.length === 1) {
    return locationFilter === "P" ? "托盘区" : `${locationFilter}货架`;
  }

  return formatFreezerLocationCode(locationFilter);
}

function syncRecordedEntries(entries: InventoryEntry[]) {
  const sourceItemsById = new Map(FREEZER_INVENTORY.map((item) => [item.id, item]));

  return entries.map((entry) => {
    if (!entry.sourceItemId) {
      return entry;
    }

    const sourceItem = sourceItemsById.get(entry.sourceItemId);
    if (!sourceItem || sourceItem.quantityText === entry.quantityText) {
      return entry;
    }

    const parsedQuantity = parseRecordedQuantity(sourceItem.quantityText);
    return {
      ...entry,
      locationCode: sourceItem.locationCode,
      productName: sourceItem.productName,
      quantity: parsedQuantity.quantity,
      quantityText: sourceItem.quantityText
    };
  });
}

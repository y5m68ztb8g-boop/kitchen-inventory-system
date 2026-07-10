import { useEffect, useRef, useState } from "react";
import { Clipboard, ExternalLink, Package, Snowflake, Thermometer, Wine } from "lucide-react";

import { getCopy } from "./copy";
import { describeDryStoreLocation } from "./DryStorePage";
import { getBrakesSearchUrl, openExternalUrl } from "./externalLinks";
import { getHomeModules, type HomeModule } from "./homeModules";
import { shouldSyncInventoryDatabaseFromServer, syncInventoryDatabaseFromServer } from "./inventoryDatabase";
import { formatFreezerLocationCode, searchStockByProductName, type StockItem } from "./inventoryData";
import {
  calculateInventoryTotal,
  entryToStockItem,
  formatCurrency,
  loadDeletedInventoryItemIds,
  loadInventoryEntries
} from "./inventoryStore";
import { searchSupplierProducts, type SupplierProduct } from "./supplierProducts";

const storageBranches = [
  { className: "area-branch-freezer", href: "#freezer", Icon: Snowflake, label: "冷冻库" },
  { className: "area-branch-chiller", href: "#chiller", Icon: Thermometer, label: "冷藏库" },
  { className: "area-branch-dry-store", href: "#dry-store", Icon: Package, label: "干货库" },
  { className: "area-branch-drinks", href: "#drinks", Icon: Wine, label: "酒水库" }
];

const valuationShortcuts = [
  { className: "valuation-shortcut-freezer", Icon: Snowflake, id: "freezer", label: "冷冻库金额", title: "冷冻库库存金额" },
  { className: "valuation-shortcut-chiller", Icon: Thermometer, id: "chiller", label: "冷藏库金额", title: "冷藏库库存金额" },
  { className: "valuation-shortcut-dry-store", Icon: Package, id: "dry-store", label: "干货库金额", title: "干货库库存金额" },
  { className: "valuation-shortcut-drinks", Icon: Wine, id: "drinks", label: "酒水库金额", title: "酒水库库存金额" }
];

const freezerMiniAreas = [
  { className: "mini-rack-a", label: "A", positions: ["A1", "A2", "A3", "A4"] },
  { className: "mini-rack-b", label: "B", positions: ["B0", "B1", "B2", "B3", "B4"] },
  { className: "mini-rack-c", label: "C", positions: ["C0", "C1", "C2", "C3", "C4"] },
  { className: "mini-rack-d", label: "D", positions: ["D0", "D1", "D2", "D3", "D4"] },
  { className: "mini-rack-p", label: "P", positions: ["P1", "P2", "P3", "P4"] }
];

type SearchMode = "inventory" | "invoice";

function ModuleContent({ module }: { module: HomeModule }) {
  const Icon = module.Icon;

  return (
    <>
      {Icon ? (
        <span className="module-icon" aria-hidden="true">
          <Icon size={30} strokeWidth={1.8} />
        </span>
      ) : null}
      {module.label ? <span className="module-label">{module.label}</span> : null}
      {module.value ? <span className="module-value">{module.value}</span> : null}
    </>
  );
}

function getStorageBranchByWarehouse(warehouse: string) {
  return storageBranches.find((branch) => branch.label === warehouse) || storageBranches[0];
}

function formatCompactLocation(item: { rack: string; position: string }) {
  if (/^[A-Z](?:\d| top| floor)$/i.test(item.position)) {
    return item.position;
  }

  const rackCode = item.rack.match(/^([A-Z])/i)?.[1];
  const positionNumber = item.position.match(/\d+/)?.[0];

  if (rackCode && positionNumber) {
    return `${rackCode.toUpperCase()}${positionNumber}`;
  }

  return item.position || item.rack;
}

function ResultLocationMap({ item }: { item: StockItem }) {
  const compactLocation = formatCompactLocation(item);

  if (item.warehouse !== "冷冻库") {
    return (
      <div className="result-location-map result-location-map-simple" aria-label={`${compactLocation}定位`}>
        <span>{item.warehouse}</span>
        <strong className="location-pulse">{compactLocation}</strong>
      </div>
    );
  }

  return (
    <div className="result-location-map result-freezer-mini-map" aria-label={`${compactLocation}定位`}>
      <div className="mini-freezer-badge" aria-label="冷冻库">
        <span className="area-branch-icon" aria-hidden="true">
          <Snowflake size={14} strokeWidth={2.2} />
        </span>
        冷冻库
      </div>
      {freezerMiniAreas.map((area) => (
        <div className={`mini-rack ${area.className}`} key={area.label}>
          <span>{area.label}</span>
          <div className="mini-position-grid">
            {area.positions.map((position) => {
              const positionLabel = formatFreezerLocationCode(position);
              const isActive = positionLabel === compactLocation;

              return (
                <span
                  aria-label={isActive ? `${positionLabel}当前位置` : undefined}
                  className={isActive ? "mini-position location-pulse" : "mini-position"}
                  key={position}
                >
                  {positionLabel}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function InvoiceHistoryResult({
  copiedCode,
  onCopyCode,
  product
}: {
  copiedCode: string;
  onCopyCode: (code: string) => void;
  product: SupplierProduct;
}) {
  const codeCopied = copiedCode === product.supplierProductCode;
  const brakesSearchUrl = product.supplierCode === "BRK" ? getBrakesSearchUrl(product.supplierProductCode) : "";

  return (
    <article className="result-card invoice-history-card">
      <div className="result-card-main">
        <h2>{product.productName}</h2>
        <div className="result-meta">
          <span className="invoice-supplier-chip">{product.supplierName}</span>
          <span className="result-location-chip">{`规格 ${product.packSize || "No pack size"}`}</span>
        </div>
        <div className="invoice-code-row">
          <span>Code</span>
          <strong>{product.supplierProductCode}</strong>
          {brakesSearchUrl ? (
            <button
              aria-label={`用默认浏览器打开 Brakes ${product.supplierProductCode}`}
              className="open-supplier-button"
              onClick={() => {
                void openExternalUrl(brakesSearchUrl);
              }}
              type="button"
            >
              <ExternalLink aria-hidden="true" size={15} strokeWidth={2} />
              Open Brakes
            </button>
          ) : null}
          <button
            aria-label={`复制 ${product.supplierProductCode}`}
            className="copy-code-button"
            onClick={() => onCopyCode(product.supplierProductCode)}
            type="button"
          >
            <Clipboard aria-hidden="true" size={15} strokeWidth={2} />
            {codeCopied ? "已复制" : "复制"}
          </button>
        </div>
        <div className="invoice-price-grid">
          <span>{`最低 ${formatCurrency(product.lowestPrice)}`}</span>
          <span>{`最高 ${formatCurrency(product.highestPrice)}`}</span>
          <span>{`平均 ${formatCurrency(product.averagePrice)}`}</span>
          <span>{`最后 ${formatCurrency(product.latestPrice)}`}</span>
        </div>
      </div>
      <div className="invoice-history-side">
        <strong>{`采购 ${product.purchaseCount} 次`}</strong>
        <span>{`最近 ${product.latestPurchaseDate || "No date"}`}</span>
        <small>{product.supplierCode}</small>
      </div>
    </article>
  );
}

function copyTextWithTemporaryInput(text: string) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.left = "-9999px";
  input.style.position = "fixed";
  input.style.top = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(input);
  }
}

export function Home() {
  const copy = getCopy();
  const [freezerInventoryEntries, setFreezerInventoryEntries] = useState(() => loadInventoryEntries());
  const [dryStoreInventoryEntries, setDryStoreInventoryEntries] = useState(() => loadInventoryEntries("dry-store"));
  const freezerInventoryValue = calculateInventoryTotal(freezerInventoryEntries);
  const dryStoreInventoryValue = calculateInventoryTotal(dryStoreInventoryEntries);
  const totalInventoryValue = freezerInventoryValue + dryStoreInventoryValue;
  const [valuationScope, setValuationScope] = useState("all");
  const valuationTitle =
    valuationScope === "all"
      ? copy.home.totalValue
      : valuationShortcuts.find((shortcut) => shortcut.id === valuationScope)?.title || copy.home.totalValue;
  const valuationValue =
    valuationScope === "all"
      ? totalInventoryValue
      : valuationScope === "freezer"
        ? freezerInventoryValue
        : valuationScope === "dry-store"
          ? dryStoreInventoryValue
          : 0;
  const modules = getHomeModules(copy, formatCurrency(valuationValue));
  const [areaMenuOpen, setAreaMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("inventory");
  const [copiedSupplierCode, setCopiedSupplierCode] = useState("");
  const [searchResultsDismissed, setSearchResultsDismissed] = useState(false);
  const areaMenuRef = useRef<HTMLDivElement>(null);
  const searchModuleRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLElement>(null);
  const matchedSourceIds = new Set(
    freezerInventoryEntries.flatMap((entry) => (entry.sourceItemId ? [entry.sourceItemId] : []))
  );
  const excludedSourceIds = new Set([...matchedSourceIds, ...loadDeletedInventoryItemIds()]);
  const inventorySearchItems = [
    ...freezerInventoryEntries.map((entry) => entryToStockItem(entry)),
    ...dryStoreInventoryEntries.map((entry) =>
      entryToStockItem(entry, {
        describeLocation: describeDryStoreLocation,
        warehouse: "干货库",
        warehouseEn: "Dry Store"
      })
    )
  ];
  const searchResults = searchStockByProductName(
    searchQuery,
    inventorySearchItems,
    excludedSourceIds
  );
  const invoiceSearchResults = searchSupplierProducts(invoiceSearchQuery, 8);
  const activeSearchQuery = searchMode === "invoice" ? invoiceSearchQuery : searchQuery;
  const showSearchResults = searchOpen && Boolean(activeSearchQuery.trim()) && !searchResultsDismissed;

  useEffect(() => {
    if (!shouldSyncInventoryDatabaseFromServer()) {
      return;
    }

    let active = true;

    void syncInventoryDatabaseFromServer().then((database) => {
      if (!active) {
        return;
      }

      setFreezerInventoryEntries(database.freezer);
      setDryStoreInventoryEntries(database.dryStore);
    });

    return () => {
      active = false;
    };
  }, []);

  async function copySupplierProductCode(code: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else if (!copyTextWithTemporaryInput(code)) {
        throw new Error("Clipboard copy is unavailable.");
      }
      setCopiedSupplierCode(code);
    } catch {
      setCopiedSupplierCode(copyTextWithTemporaryInput(code) ? code : "");
    }
  }

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!areaMenuOpen) {
      return;
    }

    function closeAreaMenuOnOutsideClick(event: PointerEvent) {
      if (areaMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setAreaMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeAreaMenuOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closeAreaMenuOnOutsideClick);
    };
  }, [areaMenuOpen]);

  useEffect(() => {
    if (!showSearchResults) {
      return;
    }

    function closeSearchResultsOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;

      if (searchModuleRef.current?.contains(target) || searchResultsRef.current?.contains(target)) {
        return;
      }

      setSearchResultsDismissed(true);
    }

    document.addEventListener("pointerdown", closeSearchResultsOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closeSearchResultsOnOutsideClick);
    };
  }, [showSearchResults]);

  return (
    <main className="home-shell" aria-label={copy.home.ariaLabel}>
      <section className="home-grid" aria-label={copy.home.moduleGroupLabel}>
        {modules.map((module) => {
          if (module.id === "search") {
            return searchOpen ? (
              <div
                className="home-module home-module-search home-module-search-open"
                key={module.id}
                aria-label={module.ariaLabel}
                ref={searchModuleRef}
              >
                <span className="module-icon" aria-hidden="true">
                  {module.Icon ? <module.Icon size={30} strokeWidth={1.8} /> : null}
                </span>
                <div className="home-search-fields">
                  <label className="home-search-label" htmlFor="home-invoice-search">
                    历史采购 / Invoice / Code
                  </label>
                  <input
                    className="home-search-input home-search-input-compact"
                    id="home-invoice-search"
                    onChange={(event) => {
                      setInvoiceSearchQuery(event.target.value);
                      setSearchMode("invoice");
                      setSearchResultsDismissed(false);
                    }}
                    onFocus={() => {
                      setSearchMode("invoice");
                      setSearchResultsDismissed(false);
                    }}
                    placeholder="搜索发票商品 / code"
                    value={invoiceSearchQuery}
                  />
                  <label className="home-search-label" htmlFor="home-product-search">
                    {copy.search.inputLabel}
                  </label>
                  <input
                    className="home-search-input home-search-input-compact"
                    id="home-product-search"
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchMode("inventory");
                      setSearchResultsDismissed(false);
                    }}
                    onFocus={() => {
                      setSearchMode("inventory");
                      setSearchResultsDismissed(false);
                    }}
                    placeholder={copy.search.placeholder}
                    ref={searchInputRef}
                    value={searchQuery}
                  />
                </div>
              </div>
            ) : (
              <button
                className={`home-module home-module-${module.id}`}
                key={module.id}
                onClick={() => setSearchOpen(true)}
                type="button"
                aria-label={module.ariaLabel}
              >
                <ModuleContent module={module} />
              </button>
            );
          }

          if (module.id === "area") {
            return (
              <div className="area-module-wrap" key={module.id} ref={areaMenuRef}>
                <button
                  className={`home-module home-module-${module.id}`}
                  onClick={() => setAreaMenuOpen((current) => !current)}
                  type="button"
                  aria-expanded={areaMenuOpen}
                  aria-label={module.ariaLabel}
                >
                  <ModuleContent module={module} />
                </button>
                {areaMenuOpen ? (
                  <div className="area-branches" aria-label="库房选择">
                    {storageBranches.map(({ className, href, Icon, label }) => (
                      <a className={`area-branch ${className}`} href={href} key={href}>
                        <span className="area-branch-icon" aria-hidden="true">
                          <Icon size={18} strokeWidth={2} />
                        </span>
                        {label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          if (module.id === "valuation") {
            const Icon = module.Icon;

            return (
              <div className="home-module home-module-valuation" key={module.id} aria-label={module.ariaLabel}>
                <div className="valuation-icon-stack">
                  <button
                    aria-label="全部库存金额"
                    aria-pressed={valuationScope === "all"}
                    className="valuation-total-button"
                    onClick={() => setValuationScope("all")}
                    type="button"
                  >
                    {Icon ? (
                      <span className="module-icon valuation-coin-icon" aria-hidden="true">
                        <Icon size={31} strokeWidth={1.8} />
                      </span>
                    ) : null}
                  </button>
                  <div className="valuation-shortcuts" aria-label="按库房查看库存金额">
                    {valuationShortcuts.map(({ className, Icon, id, label }) => (
                      <button
                        aria-label={label}
                        aria-pressed={valuationScope === id}
                        className={`valuation-shortcut ${className}`}
                        key={id}
                        onClick={() => setValuationScope(id)}
                        type="button"
                      >
                        <Icon size={15} strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                </div>
                <a className="valuation-main-link" href={module.href} aria-label={module.ariaLabel}>
                  <span className="module-label">{valuationTitle}</span>
                  {module.value ? <span className="module-value">{module.value}</span> : null}
                </a>
              </div>
            );
          }

          return module.href ? (
            <a
              className={`home-module home-module-${module.id}`}
              href={module.href}
              key={module.id}
              aria-label={module.ariaLabel}
            >
              <ModuleContent module={module} />
            </a>
          ) : (
            <div
              className={`home-module home-module-empty home-module-${module.id}`}
              key={module.id}
              aria-label={module.ariaLabel}
            />
          );
        })}
      </section>
      {showSearchResults ? (
        <section className="home-search-results" aria-live="polite" ref={searchResultsRef}>
          {searchMode === "invoice" ? (
            <>
              {invoiceSearchResults.length === 0 ? <p className="muted-text">发票历史里没有找到匹配商品</p> : null}
              {invoiceSearchResults.map((product) => (
                <InvoiceHistoryResult
                  copiedCode={copiedSupplierCode}
                  key={product.id}
                  onCopyCode={copySupplierProductCode}
                  product={product}
                />
              ))}
            </>
          ) : (
            <>
              {searchResults.length === 0 ? <p className="muted-text">{copy.search.empty}</p> : null}
              {searchResults.map((item) => (
                (() => {
                  const storageBranch = getStorageBranchByWarehouse(item.warehouse);
                  const Icon = storageBranch.Icon;

                  return (
                    <article className="result-card" key={item.id}>
                      <div className="result-card-main">
                        <h2>{item.productName}</h2>
                        <div className="result-meta">
                          <span className={`area-branch result-warehouse-label ${storageBranch.className}`}>
                            <span className="area-branch-icon" aria-hidden="true">
                              <Icon size={18} strokeWidth={2} />
                            </span>
                            {item.warehouse}
                          </span>
                          <span className="result-location-chip">{formatCompactLocation(item)}</span>
                        </div>
                        <strong>{`库存：${item.quantityText}`}</strong>
                      </div>
                      <ResultLocationMap item={item} />
                    </article>
                  );
                })()
              ))}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

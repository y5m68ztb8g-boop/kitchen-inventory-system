const DATA_SCRIPT_URL = "data/supplier_search_data.js?v=0.10.17";
const DATA_GLOBAL = "___GROW_NATURALLY_SUPPLIER_SEARCH_DATA___";

const state = {
  data: null,
  filtered: [],
  selectedId: null,
  loading: false,
  error: null,
};

const elements = {
  queryInput: document.querySelector("#queryInput"),
  supplierFilter: document.querySelector("#supplierFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  openInventoryButton: document.querySelector("#openInventoryButton"),
  resultList: document.querySelector("#resultList"),
  resultCount: document.querySelector("#resultCount"),
  selectedLabel: document.querySelector("#selectedLabel"),
  resultsHint: document.querySelector("#resultsHint"),
  emptyState: document.querySelector("#emptyState"),
  detailPane: document.querySelector("#detailPane"),
};

const defaultEmptyTitle = elements.emptyState.querySelector("strong").textContent;
const defaultEmptyMessage = elements.emptyState.querySelector("span").textContent;

elements.openInventoryButton.addEventListener("click", () => {
  window.location.href = "index.html";
});

elements.refreshButton.addEventListener("click", () => {
  loadSnapshot(true);
});

elements.queryInput.addEventListener("input", () => {
  renderResults();
});

elements.supplierFilter.addEventListener("change", () => {
  renderResults();
});

loadSnapshot(false);

async function loadSnapshot(forceReload) {
  state.loading = true;
  state.error = null;
  elements.resultsHint.textContent = forceReload ? "Reloading local snapshot..." : "Loading local snapshot...";
  try {
    state.data = await loadSnapshotData(forceReload);
    populateSupplierFilter(state.data.suppliers || []);
    state.filtered = state.data.supplier_products || [];
    state.selectedId = state.filtered[0]?.supplier_product_id ?? null;
    state.loading = false;
    renderResults();
  } catch (error) {
    state.loading = false;
    state.error = error;
    state.filtered = [];
    renderError(String(error));
  }
}

function loadSnapshotData(forceReload) {
  return new Promise((resolve, reject) => {
    const scriptId = "supplier-search-data-loader";
    const existing = document.getElementById(scriptId);
    if (existing) {
      existing.remove();
    }
    delete window[DATA_GLOBAL];

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `${DATA_SCRIPT_URL}${forceReload ? `&t=${Date.now()}` : ""}`;
    script.async = true;
    script.onload = () => {
      const payload = window[DATA_GLOBAL];
      if (!payload) {
        reject(new Error(`Data script loaded but ${DATA_GLOBAL} was not defined.`));
        return;
      }
      resolve(payload);
    };
    script.onerror = () => {
      reject(new Error(`Failed to load ${DATA_SCRIPT_URL}`));
    };
    document.head.appendChild(script);
  });
}

function populateSupplierFilter(suppliers) {
  const currentValue = elements.supplierFilter.value;
  elements.supplierFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All suppliers";
  elements.supplierFilter.appendChild(allOption);

  for (const supplier of suppliers) {
    const option = document.createElement("option");
    option.value = supplier.supplier_code;
    option.textContent = `${supplier.supplier_code} - ${supplier.supplier_name}`;
    elements.supplierFilter.appendChild(option);
  }

  if ([...elements.supplierFilter.options].some((option) => option.value === currentValue)) {
    elements.supplierFilter.value = currentValue;
  }
}

function renderResults() {
  if (!state.data) {
    return;
  }

  const query = normalize(elements.queryInput.value);
  const supplierCode = normalize(elements.supplierFilter.value);
  const tokens = query ? query.split(/\s+/).filter(Boolean) : [];

  const allProducts = state.data.supplier_products || [];
  const filtered = allProducts.filter((product) => matches(product, tokens, supplierCode));
  const sorted = sortProducts(filtered, tokens);
  state.filtered = sorted;
  if (!sorted.some((product) => product.supplier_product_id === state.selectedId)) {
    state.selectedId = sorted[0]?.supplier_product_id ?? null;
  }

  elements.resultCount.textContent = String(sorted.length);
  elements.resultsHint.textContent = query
    ? `Showing matches for "${query}".`
    : supplierCode
      ? `Showing recent products for ${supplierCode}.`
      : "Showing recent products across all suppliers.";
  elements.emptyState.hidden = sorted.length !== 0;
  if (sorted.length === 0) {
    elements.emptyState.querySelector("strong").textContent = defaultEmptyTitle;
    elements.emptyState.querySelector("span").textContent = defaultEmptyMessage;
  }

  elements.resultList.replaceChildren(
    ...sorted.map((product) => renderResultRow(product)),
  );

  if (state.selectedId) {
    const selected = sorted.find((product) => product.supplier_product_id === state.selectedId) || sorted[0];
    if (selected) {
      renderDetails(selected);
    }
  } else {
    renderEmptyDetails();
  }
}

function renderError(message) {
  elements.resultCount.textContent = "0";
  elements.resultsHint.textContent = message;
  elements.emptyState.hidden = false;
  elements.emptyState.querySelector("strong").textContent = "Unable to load supplier search data";
  elements.emptyState.querySelector("span").textContent = message;
  elements.resultList.replaceChildren();
  renderEmptyDetails();
}

function renderResultRow(product) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `supplier-result${product.supplier_product_id === state.selectedId ? " selected" : ""}`;
  button.addEventListener("click", () => {
    state.selectedId = product.supplier_product_id;
    renderResults();
  });

  const title = document.createElement("strong");
  title.textContent = product.supplier_product_name || product.supplier_product_code || "Unnamed product";

  const meta = document.createElement("span");
  meta.textContent = `${product.supplier_code} · ${product.supplier_product_code || "No code"} · ${product.supplier_name}`;

  const footer = document.createElement("span");
  footer.textContent = `Last price ${formatMoney(product.latest_price)} · ${product.latest_purchase_date || "No date"} · ${product.purchase_count || 0} invoices`;

  button.append(title, meta, footer);
  return button;
}

function renderDetails(product) {
  const historyRows = (product.invoice_history || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.invoice_date || "")}</td>
          <td>${escapeHtml(row.invoice_number || "")}</td>
          <td>${escapeHtml(row.quantity ?? "")}</td>
          <td>${escapeHtml(formatMoney(row.unit_price))}</td>
          <td>${escapeHtml(formatMoney(row.line_value))}</td>
          <td>${escapeHtml(row.raw_product_description || "")}</td>
        </tr>
      `,
    )
    .join("");

  elements.selectedLabel.textContent = `${product.supplier_code} ${product.supplier_product_code || ""}`.trim();
  elements.detailPane.className = "supplier-detail";
  elements.detailPane.innerHTML = `
    <div class="supplier-detail-header">
      <div>
        <strong>${escapeHtml(product.supplier_product_name || "Unnamed product")}</strong>
        <span>${escapeHtml(product.supplier_name)} · ${escapeHtml(product.supplier_code)}</span>
      </div>
      <div class="supplier-detail-price">
        <strong>${escapeHtml(formatMoney(product.latest_price))}</strong>
        <span>Average ${escapeHtml(formatMoney(product.average_price))}</span>
      </div>
    </div>
    <dl class="supplier-detail-grid">
      <div><dt>Code</dt><dd>${escapeHtml(product.supplier_product_code || "No code")}</dd></div>
      <div><dt>Pack size</dt><dd>${escapeHtml(product.pack_size || "Unknown")}</dd></div>
      <div><dt>Purchase unit</dt><dd>${escapeHtml(product.purchase_unit || "Unknown")}</dd></div>
      <div><dt>VAT</dt><dd>${escapeHtml(formatPercent(product.vat_rate))}</dd></div>
      <div><dt>Latest purchase</dt><dd>${escapeHtml(product.latest_purchase_date || "Unknown")}</dd></div>
      <div><dt>Purchase count</dt><dd>${escapeHtml(String(product.purchase_count || 0))}</dd></div>
    </dl>
    <div class="supplier-detail-history">
      <h3>Invoice history</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Invoice</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line value</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>${historyRows || `<tr><td colspan="6">No invoice history available.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderEmptyDetails() {
  elements.selectedLabel.textContent = "None";
  elements.detailPane.className = "supplier-detail-empty";
  elements.detailPane.innerHTML = `
    <strong>No product selected</strong>
    <span>Pick a result on the left to see its purchase history.</span>
  `;
}

function matches(product, tokens, supplierCode) {
  if (supplierCode && normalize(product.supplier_code) !== supplierCode) {
    return false;
  }
  if (tokens.length === 0) {
    return true;
  }

  const blob = normalize(product.search_text || "");
  return tokens.every((token) => blob.includes(token));
}

function sortProducts(products, tokens) {
  return [...products].sort((left, right) => {
    const leftExact = isExactMatch(left, tokens);
    const rightExact = isExactMatch(right, tokens);
    if (leftExact !== rightExact) {
      return leftExact ? -1 : 1;
    }

    const leftDate = normalizeDate(left.latest_purchase_date);
    const rightDate = normalizeDate(right.latest_purchase_date);
    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }

    const leftCount = Number(left.purchase_count || 0);
    const rightCount = Number(right.purchase_count || 0);
    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }

    return String(left.supplier_product_name || "").localeCompare(String(right.supplier_product_name || ""));
  });
}

function isExactMatch(product, tokens) {
  if (tokens.length === 0) {
    return false;
  }
  const haystack = normalize(`${product.supplier_product_code || ""} ${product.supplier_product_name || ""}`);
  return tokens.length === 1 && haystack.includes(tokens[0]);
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDate(value) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return `£${number.toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return `${number.toFixed(0)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

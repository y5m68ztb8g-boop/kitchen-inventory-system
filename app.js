const APP_VERSION = "v0.10.8";
const STORAGE_KEY = "kitchen-inventory-v2";
const LEGACY_KEY = "kitchen-inventory-v1";
const categories = ["All", "Produce", "Meat / Dairy", "Dry Goods", "Seasoning", "Frozen", "Other"];

const dinnerMenu = [
  { dish: "Soup", ingredients: ["Soup", "Sourdough Bread"] },
  { dish: "Mackerel", ingredients: ["Mixed Fish", "Crostini", "Pickled"] },
  { dish: "Treeine", ingredients: ["Ham Hock", "Sourdough Bread", "Piccalilli"] },
  { dish: "Goats", ingredients: ["Goats Cheese", "Veg Mix", "Tomatos", "Red Onion", "Walnuts", "Herb Oil"] },
  { dish: "Mushroom", ingredients: ["Sliced Mushroom", "Pea Pure", "Mint Oil"] },
  { dish: "Chicken", ingredients: ["Chicken Breast", "Baby Carrots", "Hasselback", "Broccoli", "Tarragon Jus"] },
  { dish: "Seabass", ingredients: ["Seabass", "Lemon Butter", "Broad Beans", "Peas"] },
  { dish: "Haddock", ingredients: ["Unfreeze Haddock", "Beer Battered", "Chips", "Tartare", "Garden Peas", "Mash Peas"] },
  { dish: "Risotto", ingredients: ["Cooked Risotto", "Courgette", "Asparagus", "Parmesan", "Lemon Oil"] },
  { dish: "Steak Pie", ingredients: ["Cooked Beef", "Pastry", "Carrots", "Parsnip", "Red Wine Jus", "Mash"] },
  { dish: "Burger", ingredients: ["B/C", "Burger Sauce", "Veg Mix", "Bun", "Fries", "Slaw"] },
  { dish: "Ciabatta", ingredients: ["Sliced Beef", "Ciabatta Bread", "Mustard Mayo", "Rocket", "Onion", "Fries"] },
  { dish: "Stir Fry", ingredients: ["B/C/V", "Mixed Sauce", "Mixed Veg", "Noodle", "Rice", "Cou/Asp"] },
  { dish: "Caeser", ingredients: ["Rosted Chicken", "Lettuce", "Caeser Sauce", "Parmesan", "Croutons", "Herb Oil"] },
  { dish: "Eton Mess", ingredients: ["Berries", "Meringue", "Cream"] },
  { dish: "Lemon Tart", ingredients: ["Tart", "Raspberries", "Creme"] },
  { dish: "STP", ingredients: ["Pudding", "Toffee Sauce", "Ice Cream"] },
];

const breakfastMenu = [];
const eventMenu = [];
const menuCatalog = {
  dinner: {
    label: "Dinner Menu Check",
    description: "Check ingredients by dinner dish. Clicking Missing marks the item as out of stock and adds it to restock suggestions.",
    items: dinnerMenu,
  },
  breakfast: {
    label: "Breakfast Menu Check",
    description: "After the fixed breakfast menu is imported, ingredients will be checked here by dish.",
    items: breakfastMenu,
  },
  event: {
    label: "Event Menu Check",
    description: "After wedding, tour group, or conference menus are imported, ingredients will be checked here by event.",
    items: eventMenu,
  },
};

const sampleItems = [
  createSampleItem("Eggs", 8, "pcs", "Meat / Dairy", "Fridge Door", 5, 6, "Brakes", "brakes", 1, "", "Standard", "Weekly", "Use first for breakfast and baking."),
  createSampleItem("Tomatoes", 3, "pcs", "Produce", "Chiller Shelf", 2, 2, "Brakes", "brakes", 1, "", "Standard", "Weekly", "Good to use first for soup or scrambled eggs."),
  createSampleItem("Pasta", 1, "bag", "Dry Goods", "Cupboard", 160, 2, "Brakes", "brakes", 2, "", "Standard", "Monthly", "Restock when below 2 bags."),
  createSampleItem("Frozen Prawns", 450, "g", "Frozen", "Freezer Drawer", 35, 300, "Campbells Meat", "campbells", 2, "https://www.campbellsmeat.com/", "High Value / Bulk", "Weekly", ""),
  createSampleItem("Steaks", 12, "pcs", "Frozen", "Freezer Drawer", 25, 6, "Campbells Meat", "campbells", 2, "https://www.campbellsmeat.com/", "Event Only", "Weekly", "Prioritise tracking for events and group meals."),
];

let state = loadState();
let activeCategory = "All";
let activeMenuType = null;
let editingId = null;

const elements = {
  totalCount: document.querySelector("#totalCount"),
  soonCount: document.querySelector("#soonCount"),
  lowCount: document.querySelector("#lowCount"),
  orderCount: document.querySelector("#orderCount"),
  trackedCount: document.querySelector("#trackedCount"),
  menuMissingCount: document.querySelector("#menuMissingCount"),
  summaryDialog: document.querySelector("#summaryDialog"),
  summaryDialogTitle: document.querySelector("#summaryDialogTitle"),
  summaryDialogSubtitle: document.querySelector("#summaryDialogSubtitle"),
  summaryDialogList: document.querySelector("#summaryDialogList"),
  closeSummaryDialogButton: document.querySelector("#closeSummaryDialogButton"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  inventoryList: document.querySelector("#inventoryList"),
  emptyState: document.querySelector("#emptyState"),
  shoppingList: document.querySelector("#shoppingList"),
  menuArea: document.querySelector("#menuArea"),
  menuCheckTitle: document.querySelector("#menuCheckTitle"),
  menuCheckDescription: document.querySelector("#menuCheckDescription"),
  menuEmptyState: document.querySelector("#menuEmptyState"),
  menuList: document.querySelector("#menuList"),
  orderList: document.querySelector("#orderList"),
  orderEmptyState: document.querySelector("#orderEmptyState"),
  stocktakeList: document.querySelector("#stocktakeList"),
  stocktakeEmptyState: document.querySelector("#stocktakeEmptyState"),
  defaultOrderedByInput: document.querySelector("#defaultOrderedByInput"),
  executorInput: document.querySelector("#executorInput"),
  defaultPurposeInput: document.querySelector("#defaultPurposeInput"),
  defaultServiceDateInput: document.querySelector("#defaultServiceDateInput"),
  defaultEventNameInput: document.querySelector("#defaultEventNameInput"),
  itemDialog: document.querySelector("#itemDialog"),
  itemForm: document.querySelector("#itemForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  itemId: document.querySelector("#itemId"),
  nameInput: document.querySelector("#nameInput"),
  quantityInput: document.querySelector("#quantityInput"),
  unitInput: document.querySelector("#unitInput"),
  categoryInput: document.querySelector("#categoryInput"),
  locationInput: document.querySelector("#locationInput"),
  trackingTypeInput: document.querySelector("#trackingTypeInput"),
  stocktakeCycleInput: document.querySelector("#stocktakeCycleInput"),
  supplierInput: document.querySelector("#supplierInput"),
  supplierSiteInput: document.querySelector("#supplierSiteInput"),
  productUrlInput: document.querySelector("#productUrlInput"),
  leadDaysInput: document.querySelector("#leadDaysInput"),
  expiryInput: document.querySelector("#expiryInput"),
  thresholdInput: document.querySelector("#thresholdInput"),
  noteInput: document.querySelector("#noteInput"),
  stocktakeDialog: document.querySelector("#stocktakeDialog"),
  stocktakeForm: document.querySelector("#stocktakeForm"),
  stocktakeDialogTitle: document.querySelector("#stocktakeDialogTitle"),
  stocktakeItemId: document.querySelector("#stocktakeItemId"),
  actualQuantityInput: document.querySelector("#actualQuantityInput"),
  stocktakeUnitInput: document.querySelector("#stocktakeUnitInput"),
  countedByInput: document.querySelector("#countedByInput"),
  stocktakeTypeInput: document.querySelector("#stocktakeTypeInput"),
  stocktakeDateInput: document.querySelector("#stocktakeDateInput"),
  stocktakeReasonInput: document.querySelector("#stocktakeReasonInput"),
  stocktakeNoteInput: document.querySelector("#stocktakeNoteInput"),
};

document.querySelector("#openAddButton").addEventListener("click", openAddDialog);
document.querySelector("#closeDialogButton").addEventListener("click", closeItemDialog);
document.querySelector("#cancelDialogButton").addEventListener("click", closeItemDialog);
document.querySelector("#seedButton").addEventListener("click", restoreSamples);
document.querySelector("#exportButton").addEventListener("click", exportData);
document.querySelector("#printReportButton").addEventListener("click", printDailyReport);
document.querySelector("#createOrdersButton").addEventListener("click", createOrdersFromLowStock);
document.querySelector("#clearReceivedButton").addEventListener("click", clearReceivedOrders);
document.querySelector("#clearOldStocktakeButton").addEventListener("click", clearOldStocktakes);
document.querySelector("#resetMenuCheckButton").addEventListener("click", resetMenuChecks);
document.querySelector("#closeSummaryDialogButton").addEventListener("click", closeSummaryDialog);
document.querySelector("#closeStocktakeDialogButton").addEventListener("click", closeStocktakeDialog);
document.querySelector("#cancelStocktakeDialogButton").addEventListener("click", closeStocktakeDialog);
elements.searchInput.addEventListener("input", render);
elements.sortSelect.addEventListener("change", render);
elements.itemForm.addEventListener("submit", saveItem);
elements.stocktakeForm.addEventListener("submit", saveStocktake);
elements.defaultServiceDateInput.value = offsetDate(0);
elements.defaultOrderedByInput.readOnly = true;
elements.executorInput.value = "";
elements.defaultOrderedByInput.value = "";
elements.executorInput.addEventListener("change", () => {
  elements.defaultOrderedByInput.value = elements.executorInput.value;
});

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.category === activeCategory);
    });
    render();
  });
});

document.querySelectorAll(".menu-nav button").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveMenu(button.dataset.menuType);
  });
});

document.querySelectorAll(".summary-card").forEach((button) => {
  button.addEventListener("click", () => {
    openSummaryDialog(button.dataset.summaryType);
  });
});

render();

function setActiveMenu(menuType) {
  activeMenuType = menuCatalog[menuType] ? menuType : null;
  render();
}

function getActiveMenu() {
  return activeMenuType ? menuCatalog[activeMenuType] : null;
}

function getActiveMenuItems(menuType = activeMenuType) {
  return menuCatalog[menuType]?.items || [];
}


function getCurrentExecutor() {
  return elements.executorInput.value.trim();
}

function requireExecutor() {
  if (getCurrentExecutor()) return true;
  alert("Please select an executor first.");
  elements.executorInput.focus();
  return false;
}

function clearExecutorSelection() {
  elements.executorInput.value = "";
  elements.defaultOrderedByInput.value = "";
}

function createSampleItem(
  name,
  quantity,
  unit,
  category,
  location,
  expiryDays,
  threshold,
  supplier,
  supplierSite,
  leadDays,
  productUrl,
  trackingType,
  stocktakeCycle,
  note,
) {
  return {
    id: createId(),
    name,
    quantity,
    unit,
    category,
    location,
    expiry: offsetDate(expiryDays),
    threshold,
    supplier,
    supplierSite,
    productUrl,
    trackingType,
    stocktakeCycle,
    leadDays,
    note,
  };
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return { items: sampleItems, orders: [], stocktakes: [], menuChecks: {} };
    }
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const items = JSON.parse(legacy);
      if (Array.isArray(items)) return { items: items.map(normalizeItem), orders: [], stocktakes: [], menuChecks: {} };
    } catch {
      return { items: sampleItems, orders: [], stocktakes: [], menuChecks: {} };
    }
  }

  return { items: sampleItems, orders: [], stocktakes: [], menuChecks: {} };
}

function normalizeState(nextState) {
  if (Array.isArray(nextState)) return { items: nextState.map(normalizeItem), orders: [], stocktakes: [], menuChecks: {} };
  return {
    items: Array.isArray(nextState.items) ? nextState.items.map(normalizeItem) : sampleItems,
    orders: Array.isArray(nextState.orders) ? nextState.orders.map(normalizeOrder) : [],
    stocktakes: Array.isArray(nextState.stocktakes) ? nextState.stocktakes.map(normalizeStocktake) : [],
    menuChecks: nextState.menuChecks && typeof nextState.menuChecks === "object" ? nextState.menuChecks : {},
  };
}

function normalizeItem(item) {
  const category = translateLegacyValue(item.category);
  const trackingType = translateLegacyValue(item.trackingType);
  const stocktakeCycle = translateLegacyValue(item.stocktakeCycle);
  return {
    id: item.id || createId(),
    name: item.name || "Unnamed Item",
    quantity: Number(item.quantity || 0),
    unit: item.unit || "portion",
    category: categories.includes(category) && category !== "All" ? category : "Other",
    location: translateLegacyValue(item.location || ""),
    expiry: item.expiry || offsetDate(7),
    threshold: Number(item.threshold || 1),
    supplier: item.supplier || "Default Supplier",
    supplierSite: item.supplierSite || inferSupplierSite(item.supplier),
    productUrl: item.productUrl || "",
    trackingType: trackingType || inferTrackingType(category, item.name),
    stocktakeCycle: stocktakeCycle || "Weekly",
    leadDays: Number.isFinite(Number(item.leadDays)) ? Number(item.leadDays) : 1,
    note: translateLegacyValue(item.note || ""),
  };
}

function normalizeOrder(order) {
  return {
    id: order.id || createId(),
    itemId: order.itemId || "",
    itemName: order.itemName || "Unnamed Item",
    supplier: order.supplier || "Default Supplier",
    supplierSite: order.supplierSite || inferSupplierSite(order.supplier),
    productUrl: order.productUrl || "",
    quantity: Number(order.quantity || 1),
    unit: order.unit || "portion",
    status: order.status || "draft",
    createdAt: order.createdAt || offsetDate(0),
    dueDate: order.dueDate || offsetDate(1),
    orderedBy: order.orderedBy || "",
    receivedBy: order.receivedBy || "",
    receivedAt: order.receivedAt || "",
    purpose: translateLegacyValue(order.purpose) || "Routine Restock",
    serviceDate: order.serviceDate || offsetDate(0),
    eventName: order.eventName || "",
  };
}

function normalizeStocktake(stocktake) {
  return {
    id: stocktake.id || createId(),
    itemId: stocktake.itemId || "",
    itemName: stocktake.itemName || "Unnamed Item",
    previousQuantity: Number(stocktake.previousQuantity || 0),
    actualQuantity: Number(stocktake.actualQuantity || 0),
    difference: Number(stocktake.difference || 0),
    unit: stocktake.unit || "portion",
    countedBy: stocktake.countedBy || "",
    type: translateLegacyValue(stocktake.type) || "Weekly",
    date: stocktake.date || offsetDate(0),
    reason: translateLegacyValue(stocktake.reason || ""),
    note: translateLegacyValue(stocktake.note || ""),
    createdAt: stocktake.createdAt || new Date().toISOString(),
  };
}

function translateLegacyValue(value) {
  const text = String(value || "");
  const legacyMap = {
    "Other Event": "Other Event",
    "Placed": "Placed",
    "Received": "Received",
    "Default Supplier": "Default Supplier",
  };
  return legacyMap[text] || text;
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const filteredItems = getFilteredItems();
  renderSummary();
  renderMenuChecklist();
  renderInventory(filteredItems);
  renderShoppingList();
  renderOrders();
  renderStocktakes();
}

function getFilteredItems() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const sortMode = elements.sortSelect.value;

  return state.items
    .filter((item) => activeCategory === "All" || item.category === activeCategory)
    .filter((item) => {
      const haystack = [item.name, item.category, item.location, item.supplier, item.productUrl, item.note]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (sortMode === "quantity") return Number(a.quantity) - Number(b.quantity);
      if (sortMode === "supplier") return a.supplier.localeCompare(b.supplier, "zh-CN");
      if (sortMode === "name") return a.name.localeCompare(b.name, "zh-CN");
      return new Date(a.expiry) - new Date(b.expiry);
    });
}

function renderSummary() {
  const soonItems = state.items.filter((item) => getDaysLeft(item.expiry) <= 7);
  const lowItems = getLowItems();
  const activeOrders = state.orders.filter((order) => order.status !== "received");
  const trackedItems = state.items.filter((item) => item.trackingType !== "Standard");
  const missingIngredients = getMissingMenuIngredients();

  elements.totalCount.textContent = state.items.length;
  elements.soonCount.textContent = soonItems.length;
  elements.lowCount.textContent = lowItems.length;
  elements.orderCount.textContent = activeOrders.length;
  elements.trackedCount.textContent = trackedItems.length;
  elements.menuMissingCount.textContent = missingIngredients.length;
}

function openSummaryDialog(summaryType) {
  const summary = getSummaryDetails(summaryType);
  if (!summary) return;

  elements.summaryDialogTitle.textContent = summary.title;
  elements.summaryDialogSubtitle.textContent = summary.subtitle;
  elements.summaryDialogList.innerHTML = "";

  if (summary.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "summary-empty";
    empty.textContent = summary.emptyText;
    elements.summaryDialogList.appendChild(empty);
  } else {
    summary.items.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "summary-detail-card";
      card.innerHTML = entry.html;
      elements.summaryDialogList.appendChild(card);
    });
  }

  elements.summaryDialog.showModal();
}

function closeSummaryDialog() {
  elements.summaryDialog.close();
}

function getSummaryDetails(summaryType) {
  const soonItems = state.items
    .filter((item) => getDaysLeft(item.expiry) <= 7)
    .sort((a, b) => getDaysLeft(a.expiry) - getDaysLeft(b.expiry));
  const lowItems = getLowItems().slice().sort((a, b) => Number(a.quantity) - Number(b.quantity));
  const activeOrders = state.orders.filter((order) => order.status !== "received");
  const trackedItems = state.items.filter((item) => item.trackingType !== "Standard");
  const missingIngredients = getMissingMenuIngredients();

  if (summaryType === "all") {
    return {
      title: "All Items",
      subtitle: "Full inventory list",
      emptyText: "No items available.",
      items: state.items.map((item) => ({
        html: `
          <strong>${escapeHtml(item.name)}</strong>
          <div class="detail-meta">
            <span>${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span>
            <span>${escapeHtml(item.category)}</span>
            <span>${escapeHtml(item.supplier)}</span>
            <span>${escapeHtml(item.location || "Not Set")}</span>
          </div>
        `,
      })),
    };
  }

  if (summaryType === "soon") {
    return {
      title: "Expiring Soon",
      subtitle: "Items due in 7 days or less",
      emptyText: "No items are expiring soon.",
      items: soonItems.map((item) => ({
        html: `
          <strong>${escapeHtml(item.name)}</strong>
          <div class="detail-meta">
            <span>${escapeHtml(item.expiry)}</span>
            <span>${getDaysLeft(item.expiry)} days left</span>
            <span>${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span>
            <span>${escapeHtml(item.supplier)}</span>
          </div>
        `,
      })),
    };
  }

  if (summaryType === "low") {
    return {
      title: "Low Stock",
      subtitle: "Items at or below the reorder line",
      emptyText: "No items are low on stock.",
      items: lowItems.map((item) => ({
        html: `
          <strong>${escapeHtml(item.name)}</strong>
          <div class="detail-meta">
            <span>${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span>
            <span>Line ${formatNumber(item.threshold)} ${escapeHtml(item.unit)}</span>
            <span>${escapeHtml(item.supplier)}</span>
            <span>${escapeHtml(item.location || "Not Set")}</span>
          </div>
        `,
      })),
    };
  }

  if (summaryType === "orders") {
    return {
      title: "Open Orders",
      subtitle: "Orders not yet received",
      emptyText: "No open orders.",
      items: activeOrders.map((order) => ({
        html: `
          <strong>${escapeHtml(order.itemName)}</strong>
          <div class="detail-meta">
            <span>${formatNumber(order.quantity)} ${escapeHtml(order.unit)}</span>
            <span>${escapeHtml(order.purpose || "Routine Restock")}</span>
            <span>${escapeHtml(order.orderedBy || "Not Set")}</span>
            <span>${escapeHtml(order.dueDate)}</span>
          </div>
        `,
      })),
    };
  }

  if (summaryType === "tracked") {
    return {
      title: "Tracked Items",
      subtitle: "Event-only and high-value items",
      emptyText: "No tracked items.",
      items: trackedItems.map((item) => ({
        html: `
          <strong>${escapeHtml(item.name)}</strong>
          <div class="detail-meta">
            <span>${escapeHtml(item.trackingType)}</span>
            <span>${escapeHtml(item.stocktakeCycle)}</span>
            <span>${escapeHtml(item.supplier)}</span>
            <span>${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span>
          </div>
        `,
      })),
    };
  }

  if (summaryType === "menu") {
    return {
      title: "Menu Shortage",
      subtitle: "Ingredients marked missing in the selected menu check",
      emptyText: "No menu shortages.",
      items: missingIngredients.map((entry) => ({
        html: `
          <strong>${escapeHtml(entry.ingredient)}</strong>
          <div class="detail-meta">
            <span>${escapeHtml(entry.dish)}</span>
          </div>
        `,
      })),
    };
  }

  return null;
}

function renderMenuChecklist() {
  elements.menuList.innerHTML = "";
  document.querySelectorAll(".menu-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.menuType === activeMenuType);
  });

  const activeMenu = getActiveMenu();
  if (!activeMenu) {
    elements.menuArea.hidden = true;
    return;
  }

  elements.menuArea.hidden = false;
  elements.menuCheckTitle.textContent = activeMenu.label;
  elements.menuCheckDescription.textContent = activeMenu.description;
  elements.menuEmptyState.hidden = activeMenu.items.length > 0;

  activeMenu.items.forEach((dish) => {
    const ingredientStatuses = dish.ingredients.map((ingredient) =>
      getMenuCheckStatus(dish.dish, ingredient, activeMenuType),
    );
    const missingCount = ingredientStatuses.filter((status) => status === "missing").length;
    const okCount = ingredientStatuses.filter((status) => status === "ok").length;
    const dishStatus = missingCount > 0 ? "Unavailable" : okCount === dish.ingredients.length ? "Available" : "Pending";
    const card = document.createElement("article");
    card.className = `menu-card ${missingCount > 0 ? "blocked" : okCount === dish.ingredients.length ? "ready" : ""}`;
    card.innerHTML = `
      <div class="menu-card-head">
        <h3>${escapeHtml(dish.dish)}</h3>
        <span class="badge ${missingCount > 0 ? "danger" : ""}">${dishStatus}</span>
      </div>
      <div class="ingredient-grid">
        ${dish.ingredients
          .map((ingredient) => {
            const status = getMenuCheckStatus(dish.dish, ingredient, activeMenuType);
            return `
              <div class="ingredient-check ${status}">
                <span>${escapeHtml(ingredient)}</span>
                <div>
                  <button data-action="menuOk" data-menu-type="${escapeHtml(activeMenuType)}" data-dish="${escapeHtml(dish.dish)}" data-ingredient="${escapeHtml(ingredient)}">OK</button>
                  <button data-action="menuMissing" data-menu-type="${escapeHtml(activeMenuType)}" data-dish="${escapeHtml(dish.dish)}" data-ingredient="${escapeHtml(ingredient)}">Missing</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
    elements.menuList.appendChild(card);
  });

  elements.menuList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", handleMenuCheckAction);
  });
}

function renderInventory(filteredItems) {
  elements.inventoryList.innerHTML = "";
  elements.emptyState.hidden = filteredItems.length > 0;

  filteredItems.forEach((item) => {
    const daysLeft = getDaysLeft(item.expiry);
    const status = getStatus(daysLeft);
    const isLow = Number(item.quantity) <= Number(item.threshold);
    const card = document.createElement("article");
    card.className = `item-card ${status.level} ${isLow ? "low" : ""}`;
    card.innerHTML = `
      <div class="item-main">
        <div class="item-title">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="badge">${escapeHtml(item.category)}</span>
          ${item.trackingType !== "Standard" ? `<span class="badge danger">${escapeHtml(item.trackingType)}</span>` : ""}
          <span class="badge">${escapeHtml(item.stocktakeCycle)}</span>
          <span class="badge ${status.level}">${status.label}</span>
          ${isLow ? '<span class="badge warning">Low Stock</span>' : ""}
        </div>
        <div class="meta">
          <span>Quantity: ${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</span>
          <span>Location: ${escapeHtml(item.location || "Not Set")}</span>
          <span>Supplier: ${escapeHtml(item.supplier)}</span>
          <span>Website: ${escapeHtml(getSupplierSiteLabel(item.supplierSite))}</span>
          <span>Lead time: ${formatNumber(item.leadDays)} days</span>
          <span>Expiry: ${escapeHtml(item.expiry)}</span>
          <span>Low-stock line: ${formatNumber(item.threshold)} ${escapeHtml(item.unit)}</span>
        </div>
        ${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ""}
      </div>
      <div class="item-actions">
        <button title="Decrease Quantity" aria-label="Decrease Quantity" data-action="minus" data-id="${item.id}">−</button>
        <button title="Increase Quantity" aria-label="Increase Quantity" data-action="plus" data-id="${item.id}">+</button>
        <button title="Open Restock Website" aria-label="Open Restock Website" data-action="openSite" data-id="${item.id}">↗</button>
        <button title="Create Supplier Order" aria-label="Create Supplier Order" data-action="order" data-id="${item.id}">＋</button>
        <button title="Record Stocktake" aria-label="Record Stocktake" data-action="stocktake" data-id="${item.id}">ST</button>
        <button title="Edit" aria-label="Edit" data-action="edit" data-id="${item.id}">✎</button>
        <button title="Delete" aria-label="Delete" data-action="delete" data-id="${item.id}">×</button>
      </div>
    `;
    elements.inventoryList.appendChild(card);
  });

  elements.inventoryList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", handleItemAction);
  });
}

function renderShoppingList() {
  const lowItems = getLowItems();
  elements.shoppingList.innerHTML = "";

  if (lowItems.length === 0) {
    const empty = document.createElement("li");
    empty.innerHTML = "<span>No restock needed</span><strong>OK</strong>";
    elements.shoppingList.appendChild(empty);
    return;
  }

  lowItems.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${escapeHtml(item.name)} · ${escapeHtml(item.supplier)}</span>
      <strong>${formatNumber(getSuggestedQuantity(item))} ${escapeHtml(item.unit)}</strong>
    `;
    elements.shoppingList.appendChild(li);
  });
}

function renderOrders() {
  elements.orderList.innerHTML = "";
  elements.orderEmptyState.hidden = state.orders.length > 0;
  const mergeInfoByOrderId = getDuplicateOrderInfo();

  state.orders
    .slice()
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .forEach((order) => {
      const mergeInfo = mergeInfoByOrderId.get(order.id);
      const card = document.createElement("article");
      card.className = `order-card ${order.status} ${mergeInfo ? "duplicate" : ""}`;
      card.innerHTML = `
        <div>
          <div class="item-title">
            <h3>${escapeHtml(order.itemName)}</h3>
            <span class="badge">${escapeHtml(order.supplier)}</span>
            <span class="badge">${escapeHtml(getSupplierSiteLabel(order.supplierSite))}</span>
            <span class="badge ${order.status === "received" ? "" : "warning"}">${getOrderStatusLabel(order.status)}</span>
            ${mergeInfo ? '<span class="badge warning">Duplicate</span>' : ""}
          </div>
          ${
            mergeInfo
              ? `<div class="merge-alert">
                  <strong>Possible duplicate order</strong>
                  <span>Combined total: ${formatNumber(mergeInfo.totalQuantity)} ${escapeHtml(order.unit)} · ${escapeHtml(mergeInfo.purposes.join(" / "))}</span>
                  <span>Ordered by: ${escapeHtml(mergeInfo.orderedBy.join(" / ") || "Not Set")}</span>
                </div>`
              : ""
          }
          <div class="meta">
            <span>Order: ${formatNumber(order.quantity)} ${escapeHtml(order.unit)}</span>
            <span>Ordered By: ${escapeHtml(order.orderedBy || "Not Set")}</span>
            <span>Purpose: ${escapeHtml(order.purpose || "Routine Restock")}</span>
            <span>Service / Event Date: ${escapeHtml(order.serviceDate || "-")}</span>
            ${order.eventName ? `<span>Notes: ${escapeHtml(order.eventName)}</span>` : ""}
            ${order.receivedBy ? `<span>Received By: ${escapeHtml(order.receivedBy)}</span>` : ""}
            ${order.receivedAt ? `<span>Received Date: ${escapeHtml(order.receivedAt)}</span>` : ""}
            <span>Order Date: ${escapeHtml(order.createdAt)}</span>
            <span>Expected Delivery: ${escapeHtml(order.dueDate)}</span>
          </div>
          <div class="order-detail-fields">
            <input data-action="orderedBy" data-id="${order.id}" maxlength="20" value="${escapeHtml(order.orderedBy || "")}" placeholder="Ordered By" aria-label="Ordered By" />
            <select data-action="purpose" data-id="${order.id}" aria-label="Purpose">
              ${getPurposeOptions(order.purpose)}
            </select>
            <input data-action="serviceDate" data-id="${order.id}" type="date" value="${escapeHtml(order.serviceDate || offsetDate(0))}" aria-label="Service or Event Date" />
            <input data-action="eventName" data-id="${order.id}" maxlength="36" value="${escapeHtml(order.eventName || "")}" placeholder="Event / Group Notes" aria-label="Event or Group Notes" />
            <input data-action="receivedBy" data-id="${order.id}" maxlength="20" value="${escapeHtml(order.receivedBy || "")}" placeholder="Received By" aria-label="Received By" />
          </div>
        </div>
        <div class="order-actions">
          <input data-action="orderQty" data-id="${order.id}" type="number" min="0.1" step="0.1" value="${order.quantity}" aria-label="Order Quantity" />
          <button data-action="openOrderSite" data-id="${order.id}">Website</button>
          ${mergeInfo ? `<button data-action="mergeDuplicateOrder" data-id="${order.id}">Merge</button>` : ""}
          <button data-action="placeOrder" data-id="${order.id}">${order.status === "draft" ? "Place Order" : "Placed"}</button>
          <button data-action="receiveOrder" data-id="${order.id}">Receive</button>
          <button data-action="deleteOrder" data-id="${order.id}" aria-label="Delete Order">×</button>
        </div>
      `;
      elements.orderList.appendChild(card);
    });

  elements.orderList.querySelectorAll("button, input, select").forEach((control) => {
    const eventName = control.tagName === "BUTTON" ? "click" : control.tagName === "SELECT" ? "change" : "input";
    control.addEventListener(eventName, handleOrderAction);
  });
}

function renderStocktakes() {
  elements.stocktakeList.innerHTML = "";
  elements.stocktakeEmptyState.hidden = state.stocktakes.length > 0;

  state.stocktakes
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((stocktake) => {
      const card = document.createElement("article");
      card.className = "stocktake-card";
      card.innerHTML = `
        <div>
          <div class="item-title">
            <h3>${escapeHtml(stocktake.itemName)}</h3>
            <span class="badge">${escapeHtml(stocktake.type)}</span>
            <span class="badge">${escapeHtml(stocktake.countedBy || "Not Set")}</span>
            <span class="badge ${stocktake.difference < 0 ? "warning" : ""}">Difference ${formatSigned(stocktake.difference)} ${escapeHtml(stocktake.unit)}</span>
          </div>
          <div class="meta">
            <span>Stocktake Date: ${escapeHtml(stocktake.date)}</span>
            <span>Book: ${formatNumber(stocktake.previousQuantity)} ${escapeHtml(stocktake.unit)}</span>
            <span>Actual: ${formatNumber(stocktake.actualQuantity)} ${escapeHtml(stocktake.unit)}</span>
            ${stocktake.reason ? `<span>Reason: ${escapeHtml(stocktake.reason)}</span>` : ""}
            ${stocktake.note ? `<span>Notes: ${escapeHtml(stocktake.note)}</span>` : ""}
          </div>
        </div>
        <div class="stocktake-actions">
          <button data-action="deleteStocktake" data-id="${stocktake.id}" aria-label="Delete Stocktake Record">×</button>
        </div>
      `;
      elements.stocktakeList.appendChild(card);
    });

  elements.stocktakeList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", handleStocktakeAction);
  });
}
function getLowItems() {
  return state.items.filter((item) => Number(item.quantity) <= Number(item.threshold));
}

function getMenuCheckKey(menuType, dish, ingredient) {
  return `${offsetDate(0)}::${menuType || "dinner"}::${dish}::${ingredient}`;
}

function getMenuCheckStatus(dish, ingredient, menuType = activeMenuType) {
  if (!menuType) return "";
  return state.menuChecks[getMenuCheckKey(menuType, dish, ingredient)] || "";
}

function getMissingMenuIngredients(menuType = activeMenuType) {
  const missing = [];
  if (!menuType) return missing;
  getActiveMenuItems(menuType).forEach((dish) => {
    dish.ingredients.forEach((ingredient) => {
      if (getMenuCheckStatus(dish.dish, ingredient, menuType) === "missing") {
        missing.push({ dish: dish.dish, ingredient });
      }
    });
  });
  return missing;
}

function handleMenuCheckAction(event) {
  if (!requireExecutor()) return;
  const { action, menuType, dish, ingredient } = event.currentTarget.dataset;
  const key = getMenuCheckKey(menuType, dish, ingredient);
  state.menuChecks[key] = action === "menuMissing" ? "missing" : "ok";

  if (action === "menuMissing") {
    markIngredientOutOfStock(ingredient, dish);
  }

  persist();
  render();
}

function markIngredientOutOfStock(ingredient, dish) {
  const normalizedName = normalizeIngredientName(ingredient);
  let item = state.items.find((entry) => normalizeIngredientName(entry.name) === normalizedName);

  if (!item) {
    item = {
      id: createId(),
      name: ingredient,
      quantity: 0,
      unit: "portion",
      category: inferCategoryFromIngredient(ingredient),
      location: "To Confirm",
      expiry: offsetDate(3),
      threshold: 1,
      supplier: "Default Supplier",
      supplierSite: "other",
      productUrl: "",
      trackingType: inferTrackingType("", ingredient),
      stocktakeCycle: "Weekly",
      leadDays: 1,
      note: `Menu shortage: ${dish}`,
    };
    state.items = [item, ...state.items];
    return;
  }

  item.quantity = 0;
  item.threshold = Math.max(Number(item.threshold || 1), 1);
  item.note = item.note ? `${item.note}; Menu shortage: ${dish}` : `Menu shortage: ${dish}`;
}

function resetMenuChecks() {
  if (!requireExecutor()) return;
  if (!activeMenuType) return;
  const todayPrefix = `${offsetDate(0)}::${activeMenuType}::`;
  Object.keys(state.menuChecks).forEach((key) => {
    if (key.startsWith(todayPrefix)) delete state.menuChecks[key];
  });
  persist();
  render();
}

function getSuggestedQuantity(item) {
  return Math.max(Number(item.threshold) * 2 - Number(item.quantity), 1);
}

function getDaysLeft(expiry) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${expiry}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function getStatus(daysLeft) {
  if (daysLeft < 0) return { level: "danger", label: `Expired by ${Math.abs(daysLeft)} days` };
  if (daysLeft === 0) return { level: "danger", label: "Expires Today" };
  if (daysLeft <= 3) return { level: "danger", label: `${daysLeft} days left` };
  if (daysLeft <= 7) return { level: "warning", label: `${daysLeft} days left` };
  return { level: "", label: "OK" };
}

function getOrderStatusLabel(status) {
  if (status === "placed") return "Placed";
  if (status === "received") return "Received";
  return "Draft";
}

function getPurposeOptions(selectedPurpose) {
  const purposes = ["Tomorrow Breakfast", "Tomorrow Dinner", "Routine Restock", "Wedding Event", "Tour Group", "Conference Event", "Other Event"];
  return purposes
    .map((purpose) => {
      const selected = purpose === selectedPurpose ? "selected" : "";
      return `<option value="${escapeHtml(purpose)}" ${selected}>${escapeHtml(purpose)}</option>`;
    })
    .join("");
}

function getOrderMergeKey(order) {
  return [
    normalizeIngredientName(order.itemName),
    normalizeIngredientName(order.supplier),
    normalizeIngredientName(order.unit),
    order.supplierSite || "",
  ].join("::");
}

function getDuplicateOrderGroups() {
  const groups = new Map();
  state.orders
    .filter((order) => order.status !== "received")
    .forEach((order) => {
      const key = getOrderMergeKey(order);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    });

  return [...groups.values()].filter((orders) => orders.length > 1);
}

function getDuplicateOrderInfo() {
  const info = new Map();
  getDuplicateOrderGroups().forEach((orders) => {
    const totalQuantity = orders.reduce((total, order) => total + Number(order.quantity || 0), 0);
    const purposes = uniqueFilled(orders.map((order) => order.purpose || "Routine Restock"));
    const orderedBy = uniqueFilled(orders.map((order) => order.orderedBy || ""));
    orders.forEach((order) => {
      info.set(order.id, { totalQuantity, purposes, orderedBy, orderIds: orders.map((entry) => entry.id) });
    });
  });
  return info;
}

function uniqueFilled(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function mergeDuplicateOrder(orderId) {
  const target = state.orders.find((order) => order.id === orderId);
  if (!target) return;

  const group = getDuplicateOrderGroups().find((orders) => orders.some((order) => order.id === orderId));
  if (!group) return;

  const totalQuantity = group.reduce((total, order) => total + Number(order.quantity || 0), 0);
  const purposes = uniqueFilled(group.map((order) => order.purpose || "Routine Restock"));
  const orderedBy = uniqueFilled(group.map((order) => order.orderedBy || ""));
  const eventNames = uniqueFilled(group.map((order) => order.eventName || ""));
  const dueDates = group.map((order) => order.dueDate).filter(Boolean).sort();
  const serviceDates = group.map((order) => order.serviceDate).filter(Boolean).sort();

  target.quantity = Number(totalQuantity.toFixed(1));
  target.purpose = purposes.length > 1 ? "Routine Restock" : purposes[0] || target.purpose;
  target.orderedBy = orderedBy.join(" / ");
  target.eventName = [
    eventNames.join(" / "),
    purposes.length > 1 ? `Merged purposes: ${purposes.join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  target.dueDate = dueDates[0] || target.dueDate;
  target.serviceDate = serviceDates[0] || target.serviceDate;
  target.status = "draft";

  const mergedIds = new Set(group.map((order) => order.id));
  state.orders = state.orders.filter((order) => order.id === target.id || !mergedIds.has(order.id));
  persist();
  render();
}

function handleItemAction(event) {
  if (!requireExecutor()) return;
  const { action, id } = event.currentTarget.dataset;
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  if (action === "plus" || action === "minus") {
    const step = Number(item.quantity) >= 10 ? 10 : 1;
    const nextQuantity =
      action === "plus" ? Number(item.quantity) + step : Math.max(0, Number(item.quantity) - step);
    item.quantity = Number(nextQuantity.toFixed(1));
    persist();
    render();
  }

  if (action === "order") addOrderForItem(item);
  if (action === "openSite") openSupplierPage(item);
  if (action === "stocktake") openStocktakeDialog(item);
  if (action === "edit") openEditDialog(item);

  if (action === "delete") {
    state.items = state.items.filter((entry) => entry.id !== id);
    state.orders = state.orders.filter((order) => order.itemId !== id);
    persist();
    render();
  }
}

function handleStocktakeAction(event) {
  if (!requireExecutor()) return;
  const { action, id } = event.currentTarget.dataset;
  const stocktake = state.stocktakes.find((entry) => entry.id === id);
  if (!stocktake) return;

  if (action === "deleteStocktake") {
    state.stocktakes = state.stocktakes.filter((entry) => entry.id !== id);
  }

  persist();
  render();
}

function handleOrderAction(event) {
  if (!requireExecutor()) return;
  const { action, id } = event.currentTarget.dataset;
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;
  let shouldRender = false;

  if (action === "orderQty") {
    order.quantity = Number(event.currentTarget.value || 1);
  }

  if (action === "orderedBy") {
    order.orderedBy = event.currentTarget.value.trim();
  }

  if (action === "purpose") {
    order.purpose = event.currentTarget.value;
  }

  if (action === "serviceDate") {
    order.serviceDate = event.currentTarget.value;
  }

  if (action === "eventName") {
    order.eventName = event.currentTarget.value.trim();
  }

  if (action === "receivedBy") {
    order.receivedBy = event.currentTarget.value.trim();
  }

  if (action === "placeOrder") {
    order.status = "placed";
    order.createdAt = offsetDate(0);
    shouldRender = true;
  }

  if (action === "openOrderSite") {
    openSupplierPage(order);
    return;
  }

  if (action === "mergeDuplicateOrder") {
    mergeDuplicateOrder(id);
    return;
  }

  if (action === "receiveOrder") {
    order.status = "received";
    order.receivedAt = offsetDate(0);
    const item = state.items.find((entry) => entry.id === order.itemId);
    if (item) item.quantity = Number((Number(item.quantity) + Number(order.quantity)).toFixed(1));
    shouldRender = true;
  }

  if (action === "deleteOrder") {
    state.orders = state.orders.filter((entry) => entry.id !== id);
    shouldRender = true;
  }

  persist();
  if (shouldRender) render();
}

function addOrderForItem(item) {
  const existing = state.orders.find((order) => order.itemId === item.id && order.status !== "received");
  if (existing) {
    existing.quantity = Math.max(existing.quantity, getSuggestedQuantity(item));
    existing.status = "draft";
  } else {
    state.orders = [createOrder(item), ...state.orders];
  }
  persist();
  render();
}

function createOrdersFromLowStock() {
  if (!requireExecutor()) return;
  getLowItems().forEach(addOrderForItem);
}

function createOrder(item) {
  return {
    id: createId(),
    itemId: item.id,
    itemName: item.name,
    supplier: item.supplier,
    supplierSite: item.supplierSite,
    productUrl: item.productUrl,
    quantity: getSuggestedQuantity(item),
    unit: item.unit,
    status: "draft",
    createdAt: offsetDate(0),
    dueDate: offsetDate(Number(item.leadDays || 1)),
    orderedBy: getCurrentExecutor(),
    purpose: elements.defaultPurposeInput.value,
    serviceDate: elements.defaultServiceDateInput.value || offsetDate(0),
    eventName: elements.defaultEventNameInput.value.trim(),
  };
}

function clearReceivedOrders() {
  if (!requireExecutor()) return;
  state.orders = state.orders.filter((order) => order.status !== "received");
  persist();
  render();
}

function openStocktakeDialog(item) {
  elements.stocktakeForm.reset();
  elements.stocktakeItemId.value = item.id;
  elements.stocktakeDialogTitle.textContent = `Record Stocktake: ${item.name}`;
  elements.actualQuantityInput.value = item.quantity;
  elements.stocktakeUnitInput.value = item.unit;
  elements.countedByInput.value = getCurrentExecutor();
  elements.stocktakeTypeInput.value = item.stocktakeCycle || "Weekly";
  elements.stocktakeDateInput.value = offsetDate(0);
  elements.stocktakeReasonInput.value = item.trackingType === "Event Only" ? "Event use" : "";
  elements.stocktakeDialog.showModal();
}

function closeStocktakeDialog() {
  elements.stocktakeDialog.close();
}

function saveStocktake(event) {
  event.preventDefault();
  if (!requireExecutor()) return;

  const item = state.items.find((entry) => entry.id === elements.stocktakeItemId.value);
  if (!item) return;

  const previousQuantity = Number(item.quantity);
  const actualQuantity = Number(elements.actualQuantityInput.value || 0);
  const difference = Number((actualQuantity - previousQuantity).toFixed(1));

  item.quantity = Number(actualQuantity.toFixed(1));
  state.stocktakes = [
    {
      id: createId(),
      itemId: item.id,
      itemName: item.name,
      previousQuantity,
      actualQuantity,
      difference,
      unit: item.unit,
      countedBy: elements.countedByInput.value.trim() || "Not Set",
      type: elements.stocktakeTypeInput.value,
      date: elements.stocktakeDateInput.value || offsetDate(0),
      reason: elements.stocktakeReasonInput.value.trim(),
      note: elements.stocktakeNoteInput.value.trim(),
      createdAt: new Date().toISOString(),
    },
    ...state.stocktakes,
  ];

  persist();
  elements.stocktakeDialog.close();
  render();
}

function clearOldStocktakes() {
  if (!requireExecutor()) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  cutoff.setHours(0, 0, 0, 0);
  state.stocktakes = state.stocktakes.filter((stocktake) => new Date(`${stocktake.date}T00:00:00`) >= cutoff);
  persist();
  render();
}

function openAddDialog() {
  if (!requireExecutor()) return;
  editingId = null;
  elements.dialogTitle.textContent = "Add Item";
  elements.itemForm.reset();
  elements.itemId.value = "";
  elements.expiryInput.value = offsetDate(7);
  elements.quantityInput.value = 1;
  elements.thresholdInput.value = 1;
  elements.leadDaysInput.value = 1;
  elements.trackingTypeInput.value = "Standard";
  elements.stocktakeCycleInput.value = "Weekly";
  elements.supplierInput.value = "";
  elements.supplierSiteInput.value = "brakes";
  elements.productUrlInput.value = "";
  elements.itemDialog.showModal();
}

function closeItemDialog() {
  editingId = null;
  elements.itemDialog.close();
}

function openEditDialog(item) {
  editingId = item.id;
  elements.dialogTitle.textContent = "EditItem";
  elements.itemId.value = item.id;
  elements.nameInput.value = item.name;
  elements.quantityInput.value = item.quantity;
  elements.unitInput.value = item.unit;
  elements.categoryInput.value = categories.includes(item.category) ? item.category : "Other";
  elements.locationInput.value = item.location || "";
  elements.trackingTypeInput.value = item.trackingType || "Standard";
  elements.stocktakeCycleInput.value = item.stocktakeCycle || "Weekly";
  elements.supplierInput.value = item.supplier || "";
  elements.supplierSiteInput.value = item.supplierSite || inferSupplierSite(item.supplier);
  elements.productUrlInput.value = item.productUrl || "";
  elements.leadDaysInput.value = item.leadDays || 1;
  elements.expiryInput.value = item.expiry;
  elements.thresholdInput.value = item.threshold;
  elements.noteInput.value = item.note || "";
  elements.itemDialog.showModal();
}

function saveItem(event) {
  event.preventDefault();
  if (!requireExecutor()) return;

  const nextItem = {
    id: editingId || createId(),
    name: elements.nameInput.value.trim(),
    quantity: Number(elements.quantityInput.value),
    unit: elements.unitInput.value.trim(),
    category: elements.categoryInput.value,
    location: elements.locationInput.value.trim(),
    trackingType: elements.trackingTypeInput.value,
    stocktakeCycle: elements.stocktakeCycleInput.value,
    supplier: elements.supplierInput.value.trim() || "Default Supplier",
    supplierSite: elements.supplierSiteInput.value,
    productUrl: elements.productUrlInput.value.trim(),
    leadDays: Number(elements.leadDaysInput.value || 1),
    expiry: elements.expiryInput.value,
    threshold: Number(elements.thresholdInput.value),
    note: elements.noteInput.value.trim(),
  };

  if (editingId) {
    state.items = state.items.map((item) => (item.id === editingId ? nextItem : item));
    state.orders = state.orders.map((order) =>
      order.itemId === editingId && order.status !== "received"
        ? {
            ...order,
            itemName: nextItem.name,
            supplier: nextItem.supplier,
            supplierSite: nextItem.supplierSite,
            productUrl: nextItem.productUrl,
            unit: nextItem.unit,
          }
        : order,
    );
  } else {
    state.items = [nextItem, ...state.items];
  }

  persist();
  elements.itemDialog.close();
  render();
}

function restoreSamples() {
  if (!requireExecutor()) return;
  state = {
    items: sampleItems.map((item) => ({ ...item, id: createId() })),
    orders: [],
    stocktakes: [],
    menuChecks: {},
  };
  persist();
  render();
}

function exportData() {
  if (!requireExecutor()) return;
  const exportPayload = {
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    ...state,
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kitchen-inventory-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function printDailyReport() {
  if (!requireExecutor()) return;
  const html = buildDailyReportHtml();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const reportWindow = window.open(url, "_blank");
  if (!reportWindow) {
    URL.revokeObjectURL(url);
    alert("The browser blocked the print window. Please allow pop-ups and try again.");
    return;
  }
  clearExecutorSelection();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function buildDailyReportHtml() {
  const today = offsetDate(0);
  const lowItems = getLowItems();
  const pendingOrders = state.orders.filter((order) => order.status !== "received");
  const reportMenuType = activeMenuType;
  const reportMenu = getActiveMenu();
  const missingIngredients = getMissingMenuIngredients(reportMenuType);
  const menuRows = getActiveMenuItems(reportMenuType)
    .map((dish) => {
      const missing = dish.ingredients.filter(
        (ingredient) => getMenuCheckStatus(dish.dish, ingredient, reportMenuType) === "missing",
      );
      const checked = dish.ingredients.filter(
        (ingredient) => getMenuCheckStatus(dish.dish, ingredient, reportMenuType) === "ok",
      );
      const status = missing.length > 0 ? "Unavailable" : checked.length === dish.ingredients.length ? "Available" : "Pending";
      return { dish: dish.dish, status, missing };
    })
    .sort((a, b) => {
      const rank = { Unavailable: 0, Pending: 1, Available: 2 };
      return rank[a.status] - rank[b.status] || a.dish.localeCompare(b.dish);
    });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Daily Kitchen Report ${today}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; color: #1d2522; font-family: Arial, sans-serif; }
      h1 { margin: 0 0 4px; font-size: 26px; }
      h2 { margin: 22px 0 8px; font-size: 18px; border-bottom: 2px solid #1d2522; padding-bottom: 5px; }
      .muted { color: #68736f; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
      .summary div { border: 1px solid #cfd8d3; padding: 10px; border-radius: 6px; }
      .summary strong { display: block; margin-top: 6px; font-size: 22px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #cfd8d3; padding: 7px; text-align: left; vertical-align: top; }
      th { background: #eef4f1; }
      .bad { color: #bd3d2a; font-weight: 700; }
      .ok { color: #2f7d57; font-weight: 700; }
      .warn { color: #b7791f; font-weight: 700; }
      .footer { margin-top: 24px; font-size: 12px; color: #68736f; }
      @media print {
        body { padding: 14mm; }
        h2 { break-after: avoid; }
        table { break-inside: auto; }
        tr { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <h1>Daily Kitchen Report</h1>
    <div class="muted">Date: ${escapeHtml(today)}  Version: ${escapeHtml(APP_VERSION)}</div>

    <section class="summary">
      <div>Unavailable Dishes<strong>${menuRows.filter((row) => row.status === "Unavailable").length}</strong></div>
      <div>Missing Ingredients<strong>${missingIngredients.length}</strong></div>
      <div>Restock Suggestions<strong>${lowItems.length}</strong></div>
      <div>Orders To Receive<strong>${pendingOrders.length}</strong></div>
    </section>

    <h2>${escapeHtml(reportMenu?.label || "Menu Availability")}</h2>
    ${
      menuRows.length
        ? `<table>
      <thead><tr><th>Dish</th><th>Status</th><th>Missing Ingredients</th></tr></thead>
      <tbody>
        ${menuRows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.dish)}</td><td class="${row.status === "Unavailable" ? "bad" : row.status === "Available" ? "ok" : "warn"}">${row.status}</td><td>${row.missing.length ? row.missing.map(escapeHtml).join(", ") : "-"}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>`
        : "<p>No menu check selected or imported.</p>"
    }

    <h2>Kitchen Shortage List</h2>
    ${missingIngredients.length ? `<table><thead><tr><th>Ingredient</th><th>Affected Dish</th></tr></thead><tbody>${missingIngredients.map((entry) => `<tr><td>${escapeHtml(entry.ingredient)}</td><td>${escapeHtml(entry.dish)}</td></tr>`).join("")}</tbody></table>` : "<p>No menu shortages.</p>"}

    <h2>Restock Suggestions</h2>
    ${lowItems.length ? `<table><thead><tr><th>Item</th><th>Current Quantity</th><th>Suggested Restock</th><th>Supplier</th><th>Location</th></tr></thead><tbody>${lowItems.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</td><td>${formatNumber(getSuggestedQuantity(item))} ${escapeHtml(item.unit)}</td><td>${escapeHtml(item.supplier)}</td><td>${escapeHtml(item.location || "Not Set")}</td></tr>`).join("")}</tbody></table>` : "<p>No restock suggestions.</p>"}

    <h2>Orders To Receive</h2>
    ${pendingOrders.length ? `<table><thead><tr><th>Item</th><th>Quantity</th><th>Supplier</th><th>Purpose</th><th>Ordered By</th><th>Expected Delivery</th></tr></thead><tbody>${pendingOrders.map((order) => `<tr><td>${escapeHtml(order.itemName)}</td><td>${formatNumber(order.quantity)} ${escapeHtml(order.unit)}</td><td>${escapeHtml(order.supplier)}</td><td>${escapeHtml(order.purpose || "Routine Restock")}</td><td>${escapeHtml(order.orderedBy || "Not Set")}</td><td>${escapeHtml(order.dueDate)}</td></tr>`).join("")}</tbody></table>` : "<p>No orders waiting to be received.</p>"}

    <div class="footer">For kitchen, front of house, reception, or management. Printed copies can be annotated by hand.</div>
    <script>
      window.addEventListener("load", () => {
        setTimeout(() => window.print(), 600);
      });
    </script>
  </body>
</html>`;
}
function formatNumber(value) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

function formatSigned(value) {
  const numericValue = Number(value);
  if (numericValue > 0) return `+${formatNumber(numericValue)}`;
  return formatNumber(numericValue);
}

function inferTrackingType(category, name) {
  const text = `${category || ""} ${name || ""}`;
  if (text.includes("meat") || text.includes("prawn") || text.includes("seafood") || text.includes("Steaks")) return "High Value / Bulk";
  if (/beef|steak|fish|seabass|haddock|mackerel|chicken/i.test(text)) return "High Value / Bulk";
  return "Standard";
}

function inferCategoryFromIngredient(ingredient) {
  const text = ingredient.toLowerCase();
  if (/beef|steak|chicken|fish|seabass|haddock|mackerel|cheese|cream|ice cream/.test(text)) return "Meat / Dairy";
  if (/chips|fries|bread|bun|rice|noodle|pastry|tart|pudding/.test(text)) return "Dry Goods";
  if (/sauce|jus|mayo|oil|butter|piccalilli|tartare/.test(text)) return "Seasoning";
  if (/carrot|broccoli|pea|beans|courgette|asparagus|lettuce|rocket|onion|tomato|veg|berries|raspberries|mushroom|parsnip/.test(text)) return "Produce";
  return "Other";
}

function normalizeIngredientName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")
    .trim();
}

function inferSupplierSite(supplier) {
  const normalized = String(supplier || "").toLowerCase();
  if (normalized.includes("campbell")) return "campbells";
  if (normalized.includes("brake")) return "brakes";
  return "other";
}

function getSupplierSiteLabel(site) {
  if (site === "campbells") return "Campbells";
  if (site === "brakes") return "Brakes";
  return "Other";
}

function getSupplierUrl(record) {
  if (record.productUrl) return record.productUrl;
  if (record.supplierSite === "campbells") return "https://www.campbellsmeat.com/";
  if (record.supplierSite === "brakes") return "https://www.brake.co.uk/";
  return "";
}

function openSupplierPage(record) {
  const url = getSupplierUrl(record);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}








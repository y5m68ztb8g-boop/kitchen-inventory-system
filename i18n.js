const I18N_LANGUAGE_KEY = "kitchen-inventory-language";

const exactText = {
  "Kitchen Stock Management": "厨房库存管理",
  "Print Report": "打印报告",
  "Add Item": "新增食材",
  "Dinner Check": "晚餐检查",
  "Breakfast Check": "早餐检查",
  "Event Menu Check": "团餐检查",
  "Close Check": "关闭检查",
  "Total Items": "总食材",
  "Expiring Soon": "即将过期",
  "Low Stock": "低库存",
  "Open Orders": "待处理订单",
  "Tracked Items": "重点追踪",
  "Menu Shortage": "菜单缺货",
  "All": "全部",
  "Produce": "蔬果",
  "Meat / Dairy": "肉蛋奶",
  "Dry Goods": "主食",
  "Seasoning": "调味",
  "Frozen": "冷冻",
  "Other": "其他",
  "Sort": "排序",
  "Expiry Date": "按过期时间",
  "Quantity": "数量",
  "Supplier": "供应商",
  "Name": "名称",
  "Order Details": "下单信息",
  "Ordered By": "下单人",
  "Purpose": "用途",
  "Tomorrow Breakfast": "明日早餐",
  "Tomorrow Dinner": "明日晚餐",
  "Routine Restock": "日常补货",
  "Wedding Event": "婚礼活动",
  "Tour Group": "旅行团",
  "Conference Event": "会议活动",
  "Other Event": "其他活动",
  "Service / Event Date": "用餐/活动日期",
  "Event or Group Notes": "活动或团队备注",
  "Restock Suggestions": "补货建议",
  "Version History": "版本记录",
  "Executor": "执行人",
  "Select Executor": "选择执行人",
  "Menu Check": "菜单检查",
  "Choose breakfast, dinner, or event menu to start checking.": "选择早餐、晚餐或团餐后开始检查。",
  "Reset Today's Check": "重置今日检查",
  "This menu has not been imported yet": "这个菜单还没有导入",
  "Once you provide the breakfast or event menu, I will add the fixed checks here.": "等你给我早餐或团餐菜单后，我会把固定检查项加到这里。",
  "Current Inventory": "当前库存",
  "Items are marked by expiry and low stock; supplier details help with quick ordering.": "按临期和低库存自动标记，供应商信息用于快速下单。",
  "No matching items": "还没有匹配的食材",
  "Try changing the search, or add a kitchen stock item.": "试试调整搜索，或者新增一件厨房库存。",
  "Supplier Orders": "供应商订单",
  "Low-stock items can create orders automatically; receiving updates inventory.": "低库存食材可自动生成订单，收货后会同步增加库存。",
  "Clear Received": "清除已收货",
  "No supplier orders": "暂无供应商订单",
  "Click the plus beside a restock suggestion to create an order.": "点击补货建议旁的加号即可生成订单。",
  "Stocktake Records": "盘点记录",
  "Use weekly and monthly stocktakes to correct inventory; track valuable and event-only items.": "用周盘点和月盘点修正实际库存，贵重物品和活动专用物品重点追踪。",
  "Keep Last 90 Days": "保留最近90天",
  "No stocktake records": "暂无盘点记录",
  "Click Stocktake on an inventory card to correct the actual quantity.": "在库存卡片点击“盘点”即可修正实际数量。",
  "Item Name": "食材名称",
  "Unit": "单位",
  "Category": "分类",
  "Storage Location": "存放位置",
  "Tracking Type": "追踪类型",
  "Standard": "普通",
  "High Value / Bulk": "贵重/大件",
  "Event Only": "活动专用",
  "Stocktake Frequency": "盘点频率",
  "Weekly": "周盘点",
  "Monthly": "月盘点",
  "Ordering Website": "订货网站",
  "Product Link": "商品链接",
  "Lead Time": "到货天数",
  "Low-Stock Line": "低库存线",
  "Notes": "备注",
  "Cancel": "取消",
  "Save": "保存",
  "Record Stocktake": "记录盘点",
  "Actual Quantity": "实际数量",
  "Counted By": "盘点人",
  "Stocktake Type": "盘点类型",
  "Ad Hoc": "临时盘点",
  "Stocktake Date": "盘点日期",
  "Difference Reason": "差异原因",
  "Save Stocktake": "保存盘点",
  "Dinner Menu Check": "晚餐菜单检查",
  "Breakfast Menu Check": "早餐菜单检查",
  "Check ingredients by dinner dish. Clicking Missing marks the item as out of stock and adds it to restock suggestions.": "按晚餐菜品检查原材料；点“缺”会把原材料标为缺货并加入补货建议。",
  "After the fixed breakfast menu is imported, ingredients will be checked here by dish.": "早餐固定菜单导入后，会在这里按菜品检查原材料。",
  "After wedding, tour group, or conference menus are imported, ingredients will be checked here by event.": "婚礼、旅行团和会议团餐菜单导入后，会在这里按活动检查原材料。",
  "Unavailable": "不可售",
  "Available": "可售",
  "Pending": "待检查",
  "OK": "有",
  "Missing": "缺",
  "Not Set": "未填写",
  "No restock needed": "暂时不用补货",
  "Website": "网站",
  "Place Order": "下单",
  "Placed": "已下单",
  "Receive": "收货",
  "Received": "已收货",
  "Draft": "草稿",
  "Edit Item": "编辑食材",
  "Delete": "删除",
  "ST": "盘",
  "Duplicate": "重复",
  "Possible duplicate order": "可能重复下单",
  "Combined total": "合计数量",
  "Ordered by": "下单人",
  "Merge": "合并",
  "Merged purposes": "合并用途",
  "Daily Kitchen Report": "今日厨房报告",
  "Date": "日期",
  "Version": "版本",
  "Unavailable Dishes": "不可售菜品",
  "Missing Ingredients": "缺货原材料",
  "Orders To Receive": "待收货订单",
  "Menu Availability": "菜单可售状态",
  "Dish": "菜品",
  "Status": "状态",
  "No menu check selected or imported.": "尚未选择或导入菜单检查。",
  "Kitchen Shortage List": "厨房缺货清单",
  "Ingredient": "原材料",
  "Affected Dish": "影响菜品",
  "No menu shortages.": "暂无菜单缺货。",
  "Current Quantity": "当前数量",
  "Suggested Restock": "建议补货",
  "No restock suggestions.": "暂无补货建议。",
  "Expected Delivery": "预计到货",
  "No orders waiting to be received.": "暂无待收货订单。",
  "For kitchen, front of house, reception, or management. Printed copies can be annotated by hand.": "给厨房、楼面、前台或经理查看。打印后可手写备注。",
  "Added duplicate order detection and merge prompts for shared items across departments.": "增加跨部门共用物品的重复下单识别和合并提示。",
  "Added Chinese/English language switching so the same system can be previewed in either language.": "增加中英文语言切换，同一套系统可随时预览中文或英文。",
  "Converted the interface, dialogs, menu checks, and report preview to English.": "将界面、弹窗、菜单检查和报告预览改为英文。",
  "Added Tinto Hotel branding and a black-gold visual theme.": "加入 Tinto Hotel 标识，页面调整为黑金品牌背景。",
  "Added breakfast, dinner, and event menu check switching; menu checks are hidden by default.": "增加早餐、晚餐、团餐检查切换，默认不显示检查菜单。",
  "Fixed the blank page issue when opening print reports.": "修复打印报告打开空白页的问题。",
  "Added a daily kitchen report for kitchen, front of house, and management printing.": "增加今日厨房报告，一键生成打印版给厨房、楼面和经理查看。",
  "Fixed missing default state when loading menu checks for the first time.": "修复首次加载菜单检查时缺少默认状态的问题。",
  "Added dinner menu checks with shortage links to inventory and restock suggestions.": "增加晚餐菜单检查，缺货原材料可联动到库存和补货建议。",
  "Fixed mobile dialog buttons being covered by content.": "修复手机端弹窗按钮被内容遮挡的问题。",
  "Fixed unresponsive buttons on mobile LAN access.": "修复手机局域网访问时按钮无反应的问题。",
  "Fixed stocktake save being blocked by the counted-by field.": "修复盘点保存被“盘点人”必填项拦住的问题。",
  "Changed to weekly/monthly stocktake mode with tracked items and receiver records.": "改为周/月盘点模式，增加重点追踪物品和收货人记录。",
  "Tested usage/outgoing records, then adjusted to stocktake mode for the real kitchen flow.": "尝试领用/出库记录，后续按实际厨房流程改为盘点模式。",
  "Added version number and version history.": "增加版本号和版本记录。",
  "Added order ownership: ordered by, purpose, event date, and group notes.": "增加酒店订单归属：下单人、用途、活动日期、团队备注。",
  "Added restock website shortcuts for Campbells Meat and Brakes.": "增加 Campbells Meat 和 Brakes 的补货网站入口。",
  "Fixed the add-item dialog not closing directly.": "修复新增食材弹窗无法直接关闭的问题。",
  "Added supplier orders, placing orders, receiving, and inventory sync.": "增加供应商订单、下单、收货和库存同步。",
  "Created kitchen inventory, categories, expiry alerts, and low-stock alerts.": "建立厨房库存、分类、临期和低库存提醒。",
};

const placeholders = {
  "Search item, supplier, location, or notes": "搜索食材、供应商、位置或备注",
  "e.g. Chef Li": "例如：Chef Li",
  "e.g. Smith Wedding / Tour Group": "例如：Smith Wedding / Tour Group",
  "e.g. Eggs": "例如：鸡蛋",
  "pcs / bag / g": "个 / 袋 / g",
  "Fridge / Cupboard": "冰箱 / 橱柜",
  "e.g. Local Supplier": "例如：本地供应商",
  "Brand, purpose, or opened date": "可写品牌、用途或开封时间",
  "e.g. Anna": "例如：Anna",
  "e.g. Normal use / Event use": "例如：正常消耗 / 活动使用",
  "Stocktake notes or follow-up issues": "可写盘点说明或需要跟进的问题",
};

const prefixText = [
  ["Quantity:", "数量："],
  ["Location:", "位置："],
  ["Supplier:", "供应商："],
  ["Website:", "网站："],
  ["Lead time:", "到货："],
  ["Expiry:", "过期："],
  ["Low-stock line:", "补货线："],
  ["Order:", "订购："],
  ["Combined total:", "合计数量："],
  ["Ordered by:", "下单人："],
  ["Ordered By:", "下单人："],
  ["Purpose:", "用途："],
  ["Service / Event Date:", "用餐/活动日期："],
  ["Notes:", "备注："],
  ["Received By:", "收货人："],
  ["Received Date:", "收货日："],
  ["Order Date:", "下单日："],
  ["Expected Delivery:", "预计到货："],
  ["Stocktake Date:", "盘点日："],
  ["Book:", "账面："],
  ["Actual:", "实际："],
  ["Reason:", "原因："],
  ["Difference", "差异"],
];

const reverseText = Object.fromEntries(Object.entries(exactText).map(([en, zh]) => [zh, en]));
const reversePlaceholders = Object.fromEntries(Object.entries(placeholders).map(([en, zh]) => [zh, en]));
let applyingLanguage = false;
let pendingLanguageApply = false;

function getLanguage() {
  return localStorage.getItem(I18N_LANGUAGE_KEY) || "en";
}

function translateExact(text, language) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const translated = language === "zh" ? exactText[trimmed] : reverseText[trimmed];
  if (translated) return text.replace(trimmed, translated);

  const pairs = language === "zh" ? prefixText : prefixText.map(([en, zh]) => [zh, en]);
  for (const [from, to] of pairs) {
    if (trimmed.startsWith(from)) return replaceEmbeddedLabels(text.replace(from, to), language);
  }

  if (language === "zh") {
    return replaceEmbeddedLabels(text.replace(/Expired by (\d+) days/g, "已过期 $1 天").replace(/(\d+) days left/g, "$1 天内过期").replace(/ days/g, " 天"), language);
  }
  return replaceEmbeddedLabels(text.replace(/已过期 (\d+) 天/g, "Expired by $1 days").replace(/(\d+) 天内过期/g, "$1 days left").replace(/ 天/g, " days"), language);
}

function replaceEmbeddedLabels(text, language) {
  const map = language === "zh" ? exactText : reverseText;
  const terms =
    language === "zh"
      ? [
          "Tomorrow Breakfast",
          "Tomorrow Dinner",
          "Routine Restock",
          "Wedding Event",
          "Tour Group",
          "Conference Event",
          "Other Event",
          "Merged purposes",
        ]
      : ["明日早餐", "明日晚餐", "日常补货", "婚礼活动", "旅行团", "会议活动", "其他活动", "合并用途"];
  return terms.reduce((nextText, term) => {
    const translated = map[term];
    return translated ? nextText.split(term).join(translated) : nextText;
  }, text);
}

function translateNode(node, language) {
  if (node.nodeType === Node.TEXT_NODE) {
    const translated = translateExact(node.nodeValue, language);
    if (translated !== node.nodeValue) node.nodeValue = translated;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (["SCRIPT", "STYLE"].includes(node.tagName)) return;

  ["placeholder", "title", "aria-label"].forEach((attribute) => {
    const value = node.getAttribute(attribute);
    if (!value) return;
    const map = language === "zh" ? placeholders : reversePlaceholders;
    const exactMap = language === "zh" ? exactText : reverseText;
    const translated = map[value] || exactMap[value] || translateExact(value, language);
    if (translated !== value) node.setAttribute(attribute, translated);
  });

  node.childNodes.forEach((child) => translateNode(child, language));
}

function applyLanguage(language = getLanguage()) {
  applyingLanguage = true;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = language === "zh" ? "厨房库存管理" : "Kitchen Stock Management";
  const toggle = document.querySelector("#languageToggleButton");
  if (toggle) toggle.textContent = language === "zh" ? "English" : "中文";
  translateNode(document.body, language);
  applyingLanguage = false;
}

function toggleLanguage() {
  const nextLanguage = getLanguage() === "zh" ? "en" : "zh";
  localStorage.setItem(I18N_LANGUAGE_KEY, nextLanguage);
  applyLanguage(nextLanguage);
}

function translateReportHtml(html, language) {
  if (language !== "zh") return html;
  let nextHtml = html;
  Object.entries(exactText).forEach(([en, zh]) => {
    nextHtml = nextHtml.split(en).join(zh);
  });
  prefixText.forEach(([en, zh]) => {
    nextHtml = nextHtml.split(en).join(zh);
  });
  return nextHtml.replace(/Expired by (\d+) days/g, "已过期 $1 天").replace(/(\d+) days left/g, "$1 天内过期").replace(/ days/g, " 天");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#languageToggleButton")?.addEventListener("click", toggleLanguage);
  applyLanguage();

  document.querySelector("#printReportButton")?.addEventListener(
    "click",
    (event) => {
      if (getLanguage() !== "zh" || typeof buildDailyReportHtml !== "function") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const html = translateReportHtml(buildDailyReportHtml(), "zh");
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const reportWindow = window.open(url, "_blank");
      if (!reportWindow) {
        URL.revokeObjectURL(url);
        alert("浏览器阻止了打印窗口，请允许弹出窗口后再试。");
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    true,
  );
});

const languageObserver = new MutationObserver(() => {
  if (applyingLanguage || getLanguage() !== "zh") return;
  if (pendingLanguageApply) return;
  pendingLanguageApply = true;
  window.requestAnimationFrame(() => {
    pendingLanguageApply = false;
    if (getLanguage() === "zh") applyLanguage("zh");
  });
});

languageObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["placeholder", "title", "aria-label"],
});

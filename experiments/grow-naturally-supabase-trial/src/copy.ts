export const SUPPORTED_LOCALES = ["zh-CN", "en-GB"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type AppCopy = {
  home: {
    ariaLabel: string;
    moduleGroupLabel: string;
    search: string;
    area: string;
    futureModule: string;
    totalValue: string;
  };
  routes: {
    backHome: string;
    searchDescription: string;
    areaDescription: string;
    valuationDescription: string;
  };
  search: {
    inputLabel: string;
    placeholder: string;
    empty: string;
  };
  valuation: {
    empty: string;
  };
};

export const DEFAULT_LOCALE: Locale = "zh-CN";

const COPY: Record<Locale, AppCopy> = {
  "zh-CN": {
    home: {
      ariaLabel: "Grow Naturally 首页",
      moduleGroupLabel: "主功能入口",
      search: "搜索",
      area: "区域",
      futureModule: "未来功能预留",
      totalValue: "产品库存总金额"
    },
    routes: {
      backHome: "返回首页",
      searchDescription: "这个页面下一步会接入产品搜索。",
      areaDescription: "这个页面下一步会显示 A、B、C、D 和托盘区域。",
      valuationDescription: "这个页面下一步会显示库存货值明细。"
    },
    search: {
      inputLabel: "搜索产品",
      placeholder: "输入产品名称",
      empty: "暂时没有找到这个产品。"
    },
    valuation: {
      empty: "还没有录入库存。录入产品并匹配发票价格后，这里会自动累加。"
    }
  },
  "en-GB": {
    home: {
      ariaLabel: "Grow Naturally home",
      moduleGroupLabel: "Main destinations",
      search: "Search",
      area: "Area",
      futureModule: "Future feature space",
      totalValue: "Total Inventory Value"
    },
    routes: {
      backHome: "Back home",
      searchDescription: "This page will connect to product search next.",
      areaDescription: "This page will show A, B, C, D, and pallet areas next.",
      valuationDescription: "This page will show stock valuation details next."
    },
    search: {
      inputLabel: "Search product",
      placeholder: "Enter product name",
      empty: "No product found yet."
    },
    valuation: {
      empty: "No stock has been entered yet. Once products are matched to invoice prices, this total will update."
    }
  }
};

export function getCopy(locale: Locale = DEFAULT_LOCALE): AppCopy {
  return COPY[locale];
}

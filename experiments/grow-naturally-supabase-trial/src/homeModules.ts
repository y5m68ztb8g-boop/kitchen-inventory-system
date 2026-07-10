import { BadgePoundSterling, MapPinned, Search } from "lucide-react";
import type { ComponentType } from "react";

import type { AppCopy } from "./copy";

export type HomeModule = {
  id: "search" | "area" | "future" | "valuation";
  label: string;
  href?: string;
  ariaLabel: string;
  value?: string;
  Icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
};

export function getHomeModules(copy: AppCopy, totalValue = "£0.00"): HomeModule[] {
  return [
    {
      id: "search",
      label: copy.home.search,
      href: "#search",
      ariaLabel: copy.home.search,
      Icon: Search
    },
    {
      id: "area",
      label: copy.home.area,
      ariaLabel: copy.home.area,
      Icon: MapPinned
    },
    {
      id: "future",
      label: "",
      ariaLabel: copy.home.futureModule
    },
    {
      id: "valuation",
      label: copy.home.totalValue,
      href: "#valuation",
      ariaLabel: copy.home.totalValue,
      value: totalValue,
      Icon: BadgePoundSterling
    }
  ];
}

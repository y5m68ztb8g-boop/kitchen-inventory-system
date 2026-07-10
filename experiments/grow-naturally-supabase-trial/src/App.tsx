import { useEffect, useState } from "react";

import "./App.css";
import { CloudSyncPage } from "./CloudSyncPage";
import { DryStorePage } from "./DryStorePage";
import { FreezerPage } from "./FreezerPage";
import { Home } from "./Home";
import { PurchasingPage } from "./PurchasingPage";
import { SearchPage } from "./SearchPage";
import { StorageAreaPage } from "./StorageAreaPage";
import { ValuationPage } from "./ValuationPage";

function getRoute() {
  return window.location.hash.replace("#", "");
}

export function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());

    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  if (route === "search") {
    return <SearchPage />;
  }

  if (route === "purchasing") {
    return <PurchasingPage />;
  }

  if (route === "freezer") {
    return <FreezerPage />;
  }

  if (route === "chiller") {
    return <StorageAreaPage title="冷藏库" subtitle="Chiller" />;
  }

  if (route === "dry-store") {
    return <DryStorePage />;
  }

  if (route === "drinks") {
    return <StorageAreaPage title="酒水库" subtitle="Drinks" />;
  }

  if (route === "valuation") {
    return <ValuationPage />;
  }

  if (route === "valuation-freezer") {
    return <ValuationPage scope="freezer" />;
  }

  if (route === "valuation-chiller") {
    return <ValuationPage scope="chiller" />;
  }

  if (route === "valuation-dry-store") {
    return <ValuationPage scope="dry-store" />;
  }

  if (route === "valuation-drinks") {
    return <ValuationPage scope="drinks" />;
  }

  if (route === "cloud-sync") {
    return <CloudSyncPage />;
  }

  return <Home />;
}

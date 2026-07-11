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
  const [name, query = ""] = window.location.hash.replace("#", "").split("?", 2);
  return { name, searchParams: new URLSearchParams(query) };
}

export function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());

    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  if (route.name === "search") {
    return <SearchPage />;
  }

  if (route.name === "purchasing") {
    return <PurchasingPage />;
  }

  if (route.name === "freezer") {
    return <FreezerPage initialLocation={route.searchParams.get("location")} supplierProductId={route.searchParams.get("supplierProductId")} />;
  }

  if (route.name === "chiller") {
    return <StorageAreaPage title="冷藏库" subtitle="Chiller" />;
  }

  if (route.name === "dry-store") {
    return <DryStorePage initialLocation={route.searchParams.get("location")} supplierProductId={route.searchParams.get("supplierProductId")} />;
  }

  if (route.name === "drinks") {
    return <StorageAreaPage title="酒水库" subtitle="Drinks" />;
  }

  if (route.name === "valuation") {
    return <ValuationPage />;
  }

  if (route.name === "valuation-freezer") {
    return <ValuationPage scope="freezer" />;
  }

  if (route.name === "valuation-chiller") {
    return <ValuationPage scope="chiller" />;
  }

  if (route.name === "valuation-dry-store") {
    return <ValuationPage scope="dry-store" />;
  }

  if (route.name === "valuation-drinks") {
    return <ValuationPage scope="drinks" />;
  }

  if (route.name === "cloud-sync") {
    return <CloudSyncPage />;
  }

  return <Home />;
}

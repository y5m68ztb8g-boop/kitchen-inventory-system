import { useEffect, useMemo, useState } from "react";

import { WineCellarModule } from "./modules/wine-cellar";
import { ServerWineCellarRepository } from "./modules/wine-cellar/services/serverRepository";
import { TENNENTS_WINE_CATALOGUE } from "./generated/tennentsWineCatalogue";

const scope = { areaId: "drinks", hotelId: "tintohotel" };
const permissions = [
  "wine_cellar.view",
  "wine_cellar.manage_layout",
  "wine_cellar.count",
  "wine_cellar.receive",
  "wine_cellar.adjust",
  "wine_cellar.view_cost"
] as const;

export function WineCellarPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repository = useMemo(() => new ServerWineCellarRepository(setError), []);
  const productCatalog = useMemo(() => TENNENTS_WINE_CATALOGUE.map((product) => ({
    currency: "GBP",
    productId: `tennents:${product.productCode}`,
    productName: product.description,
    supplierName: "Tennent's",
    supplierProductCode: product.productCode,
    unitCost: product.latestPrice,
    invoiceReference: `Tennent's history · ${product.invoiceCount} purchases`
  })), []);

  useEffect(() => {
    let active = true;
    void repository.load(scope)
      .then(() => active && setReady(true))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "酒水库读取失败。 "));
    return () => { active = false; };
  }, [repository]);

  return (
    <div className="wine-cellar-page">
      <a className="back-link" href="#">返回首页</a>
      {error && !ready ? <p className="wine-cellar-page-error" role="alert">{error}</p> : null}
      {!ready ? <section className="wine-cellar-loading"><h1>酒水库</h1><p>正在加载酒水库...</p></section> : (
        <WineCellarModule
          areaId={scope.areaId}
          areaName="酒水库"
          currentUser={{ id: "alex", name: "Alex" }}
          hotelId={scope.hotelId}
          permissions={permissions}
          productCatalog={productCatalog}
          repository={repository}
        />
      )}
      {error && ready ? <p className="wine-cellar-page-error" role="alert">{error}</p> : null}
    </div>
  );
}

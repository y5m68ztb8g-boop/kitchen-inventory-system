import { useState } from "react";

import { getCopy } from "./copy";
import { searchStockByProductName } from "./inventoryData";

export function SearchPage() {
  const copy = getCopy();
  const [query, setQuery] = useState("");
  const results = searchStockByProductName(query);

  return (
    <main className="page-shell search-shell">
      <a className="back-link" href="#">
        {copy.routes.backHome}
      </a>
      <section className="page-panel search-panel">
        <h1>{copy.home.search}</h1>
        <label className="search-label" htmlFor="product-search">
          {copy.search.inputLabel}
        </label>
        <input
          className="search-input"
          id="product-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.search.placeholder}
          value={query}
        />

        <div className="search-results" aria-live="polite">
          {query.trim() && results.length === 0 ? (
            <p className="muted-text">{copy.search.empty}</p>
          ) : null}
          {results.map((item) => (
            <article className="result-card" key={item.id}>
              <h2>{item.productName}</h2>
              <p>{`${item.warehouse} / ${item.rack} / ${item.position}`}</p>
              <strong>{`库存：${item.quantityText}`}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

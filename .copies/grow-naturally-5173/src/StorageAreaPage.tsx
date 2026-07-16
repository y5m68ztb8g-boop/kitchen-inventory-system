import { getCopy } from "./copy";

type StorageAreaPageProps = {
  title: string;
  subtitle: string;
};

export function StorageAreaPage({ title, subtitle }: StorageAreaPageProps) {
  const copy = getCopy();

  return (
    <main className="page-shell storage-shell">
      <a className="back-link" href="#">
        {copy.routes.backHome}
      </a>
      <section className="page-panel storage-panel">
        <div className="page-heading-row">
          <h1>{title}</h1>
          <span>{subtitle}</span>
        </div>
        <section className="inventory-list-section">
          <div className="inventory-list-header">
            <div>
              <h2>{`${title}库存总列表`}</h2>
              <small>当前筛选：全部</small>
            </div>
            <button type="button">录入产品</button>
          </div>
          <div className="inventory-table" role="table" aria-label={`${title}库存总列表`}>
            <div className="inventory-table-row inventory-table-head" role="row">
              <span role="columnheader">产品</span>
              <span role="columnheader">位置</span>
              <span role="columnheader">库存</span>
              <span role="columnheader">供应商 / 价格</span>
            </div>
            <div className="inventory-empty-row" role="row">
              <span role="cell">这个库房还没有库存记录</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

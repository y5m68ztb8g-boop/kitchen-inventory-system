import { useEffect, useMemo, useState, type FormEvent } from "react";

import "./WineCellarModule.css";
import { CountWorkspace } from "./components/CountWorkspace";
import { HistoryPanel } from "./components/HistoryPanel";
import { PositionCard } from "./components/PositionCard";
import { PositionEditor } from "./components/PositionEditor";
import { StockOperationPanel } from "./components/StockOperationPanel";
import { SummaryCards } from "./components/SummaryCards";
import { useWineCellar } from "./hooks/useWineCellar";
import { LocalStorageWineCellarRepository } from "./services/localStorageRepository";
import type { WineCellarRepository } from "./services/repository";
import type { WineCellarActor, WineCellarPermission, WineCellarPosition, WineCellarProductOption } from "./types";
import { calculateInventorySummary } from "./utils/inventory";

export type WineCellarModuleProps = {
  hotelId: string;
  areaId: string;
  areaName: string;
  currentUser: WineCellarActor;
  permissions: readonly WineCellarPermission[];
  repository?: WineCellarRepository;
  productCatalog?: readonly WineCellarProductOption[];
};

type Action = { mode: "count" | "receive" | "adjust"; position: WineCellarPosition } | null;

function RackHeader({ name, canManage, canMoveUp, canMoveDown, onRename, onArchive, onMoveUp, onMoveDown }: { name: string; canManage: boolean; canMoveUp: boolean; canMoveDown: boolean; onRename: (name: string) => void; onArchive: () => void; onMoveUp: () => void; onMoveDown: () => void }) {
  const [editing, setEditing] = useState(false);
  const [nextName, setNextName] = useState(name);
  function submit(event: FormEvent) { event.preventDefault(); onRename(nextName); setEditing(false); }
  return <div className="wine-cellar-rack-heading">{editing ? <form onSubmit={submit}><label>酒架名称<input aria-label={`${name} 新名称`} onChange={(event) => setNextName(event.target.value)} value={nextName} /></label><button type="submit">保存名称</button></form> : <h2>{name}</h2>}
    {canManage ? <div><button aria-label={`${name} 上移`} className="wine-cellar-link-button" disabled={!canMoveUp} onClick={onMoveUp} type="button">↑</button><button aria-label={`${name} 下移`} className="wine-cellar-link-button" disabled={!canMoveDown} onClick={onMoveDown} type="button">↓</button><button className="wine-cellar-link-button" onClick={() => setEditing((value) => !value)} type="button">重命名</button><button className="wine-cellar-link-button wine-cellar-danger" onClick={onArchive} type="button">停用酒架</button></div> : null}</div>;
}

export function WineCellarModule({ hotelId, areaId, areaName, currentUser, permissions, repository: suppliedRepository, productCatalog = [] }: WineCellarModuleProps) {
  const repository = useMemo(() => suppliedRepository ?? new LocalStorageWineCellarRepository(), [suppliedRepository]);
  const scope = useMemo(() => ({ hotelId, areaId }), [hotelId, areaId]);
  const { snapshot, error, run } = useWineCellar(repository, scope, currentUser);
  const [tab, setTab] = useState<"shelves" | "history">("shelves");
  const [rackName, setRackName] = useState("");
  const [showPositionEditor, setShowPositionEditor] = useState(false);
  const [editingPosition, setEditingPosition] = useState<WineCellarPosition | null>(null);
  const [action, setAction] = useState<Action>(null);
  const allowed = (permission: WineCellarPermission) => permissions.includes(permission);
  const activeAction = action?.position.hotelId === hotelId && action.position.areaId === areaId ? action : null;
  const activeEditingPosition = editingPosition?.hotelId === hotelId && editingPosition.areaId === areaId ? editingPosition : null;

  useEffect(() => {
    setAction(null);
    setEditingPosition(null);
    setShowPositionEditor(false);
  }, [hotelId, areaId]);

  useEffect(() => {
    if (!activeAction) return;
    const permission = activeAction.mode === "count" ? "wine_cellar.count" : activeAction.mode === "receive" ? "wine_cellar.receive" : "wine_cellar.adjust";
    if (!allowed(permission)) setAction(null);
  }, [action, permissions]);

  if (!allowed("wine_cellar.view")) return <section className="wine-cellar-denied">您没有查看酒库库存的权限。</section>;

  const activeRacks = snapshot.racks.filter((rack) => rack.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const activeAssignments = new Map(snapshot.assignments.filter((item) => item.active).map((item) => [item.positionId, item]));
  const summary = calculateInventorySummary(snapshot);

  function createRack(event: FormEvent) {
    event.preventDefault();
    const saved = run(() => repository.createRack(scope, { name: rackName }, currentUser));
    if (saved) setRackName("");
  }

  function moveRack(index: number, offset: -1 | 1) {
    const other = activeRacks[index + offset];
    const rack = activeRacks[index];
    if (!other || !rack) return;
    const orderedIds = activeRacks.map((item) => item.id);
    [orderedIds[index], orderedIds[index + offset]] = [orderedIds[index + offset], orderedIds[index]];
    run(() => repository.reorderRacks(scope, orderedIds, currentUser));
  }

  return <main className="wine-cellar-shell">
    <header className="wine-cellar-header"><div><small>Drinks Inventory</small><h1>{areaName}</h1><p>定期盘点驱动库存 · {currentUser.name}</p></div><span className="wine-cellar-area-badge">Drinks</span></header>
    <SummaryCards showCost={allowed("wine_cellar.view_cost")} summary={summary} />
    {error ? <div className="wine-cellar-error" role="alert">{error}</div> : null}
    <nav className="wine-cellar-tabs" aria-label="酒库视图"><button aria-pressed={tab === "shelves"} onClick={() => setTab("shelves")} type="button">数字酒架</button><button aria-pressed={tab === "history"} onClick={() => setTab("history")} type="button">操作记录</button></nav>

    {activeAction?.mode === "count" && allowed("wine_cellar.count") ? <CountWorkspace onCancel={() => setAction(null)} onSave={(emptySlotIds) => { const saved = run(() => repository.recordCount(scope, { positionId: activeAction.position.id, emptySlotIds }, currentUser)); if (saved) setAction(null); return Boolean(saved); }} position={activeAction.position} /> : null}
    {(activeAction?.mode === "receive" && allowed("wine_cellar.receive")) || (activeAction?.mode === "adjust" && allowed("wine_cellar.adjust")) ? <StockOperationPanel mode={activeAction.mode} onCancel={() => setAction(null)} onSave={({ quantity, reason, invoiceReference, unitCost }) => {
      const saved = activeAction.mode === "receive"
        ? run(() => repository.recordReceipt(scope, { positionId: activeAction.position.id, quantity, invoiceReference, unitCost }, currentUser))
        : run(() => repository.recordAdjustment(scope, { positionId: activeAction.position.id, delta: quantity, reason }, currentUser));
      if (saved) setAction(null);
      return Boolean(saved);
    }} position={activeAction.position} showCost={allowed("wine_cellar.view_cost")} /> : null}

    {tab === "history" ? <HistoryPanel snapshot={snapshot} /> : <section className="wine-cellar-shelves">
      {allowed("wine_cellar.manage_layout") ? <section className="wine-cellar-layout-tools"><form onSubmit={createRack}><label>新酒架名称<input onChange={(event) => setRackName(event.target.value)} placeholder="例如 A 架" required value={rackName} /></label><button type="submit">新增酒架</button></form><button className="wine-cellar-secondary" disabled={!activeRacks.length} onClick={() => setShowPositionEditor((value) => !value)} type="button">{showPositionEditor ? "关闭酒位编辑" : "新增酒位"}</button></section> : null}
      {showPositionEditor && allowed("wine_cellar.manage_layout") ? <PositionEditor onSave={(input) => Boolean(run(() => repository.createPosition(scope, input, currentUser)))} products={productCatalog} racks={activeRacks} /> : null}
      {activeEditingPosition && allowed("wine_cellar.manage_layout") ? <PositionEditor assignment={activeAssignments.get(activeEditingPosition.id)} key={activeEditingPosition.id} onSave={(input) => { const saved = Boolean(run(() => repository.updatePosition(scope, activeEditingPosition.id, input, currentUser))); if (saved) setEditingPosition(null); return saved; }} position={activeEditingPosition} products={productCatalog} racks={activeRacks} /> : null}
      {activeRacks.map((rack, rackIndex) => {
        const positions = snapshot.positions.filter((position) => position.active && position.rackId === rack.id);
        return <section className="wine-cellar-rack" key={rack.id}><RackHeader canManage={allowed("wine_cellar.manage_layout")} canMoveDown={rackIndex < activeRacks.length - 1} canMoveUp={rackIndex > 0} name={rack.name} onArchive={() => run(() => repository.archiveRack(scope, rack.id, currentUser))} onMoveDown={() => moveRack(rackIndex, 1)} onMoveUp={() => moveRack(rackIndex, -1)} onRename={(name) => run(() => repository.updateRack(scope, rack.id, { name }, currentUser))} />
          <div className="wine-cellar-position-grid">{positions.map((position) => { const assignment = activeAssignments.get(position.id); return <PositionCard assignment={assignment} canAdjust={Boolean(assignment) && allowed("wine_cellar.adjust")} canCount={Boolean(assignment) && allowed("wine_cellar.count")} canManage={allowed("wine_cellar.manage_layout")} canReceive={Boolean(assignment) && allowed("wine_cellar.receive")} key={position.id} onAction={(mode) => setAction({ mode, position })} onArchive={() => { run(() => repository.archivePosition(scope, position.id, currentUser)); if (editingPosition?.id === position.id) setEditingPosition(null); }} onConfigure={() => { setEditingPosition(position); setShowPositionEditor(false); }} position={position} showCost={allowed("wine_cellar.view_cost")} />; })}{positions.length === 0 ? <p className="wine-cellar-empty">该酒架还没有酒位</p> : null}</div>
        </section>;
      })}
      {activeRacks.length === 0 ? <section className="wine-cellar-empty-state"><h2>先建立第一个酒架</h2><p>酒位会按酒架分组，每个数字格代表一瓶或一桶。</p></section> : null}
    </section>}
  </main>;
}

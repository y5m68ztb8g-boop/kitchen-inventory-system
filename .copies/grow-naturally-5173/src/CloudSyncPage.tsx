import { useEffect, useState } from "react";

import { getCopy } from "./copy";
import type { InventoryDatabase } from "./inventoryDatabase";

type CloudStatus = {
  configured: boolean;
  lastAutoSync?: {
    error: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    pending: boolean;
  };
  recordId: string | null;
  table: string;
};

type CloudReadResponse = {
  configured: boolean;
  database?: InventoryDatabase;
  error?: string;
  updatedAt?: string | null;
};

type SyncMessage = {
  tone: "error" | "info" | "success";
  text: string;
};

const emptyCounts = {
  deletedFreezerInventoryIds: 0,
  dryStore: 0,
  freezer: 0,
  freezerSourceNameOverrides: 0
};

function getDatabaseCounts(database?: InventoryDatabase) {
  if (!database) {
    return emptyCounts;
  }

  return {
    deletedFreezerInventoryIds: database.deletedFreezerInventoryIds.length,
    dryStore: database.dryStore.length,
    freezer: database.freezer.length,
    freezerSourceNameOverrides: Object.keys(database.freezerSourceNameOverrides).length
  };
}

async function readJson<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const payload = (await response.json()) as T;

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : response.statusText;
    throw new Error(message);
  }

  return payload;
}

export function CloudSyncPage() {
  const copy = getCopy();
  const [cloudDatabase, setCloudDatabase] = useState<InventoryDatabase | undefined>();
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);
  const [localDatabase, setLocalDatabase] = useState<InventoryDatabase | undefined>();
  const [message, setMessage] = useState<SyncMessage>({ tone: "info", text: "正在检查 Supabase 试验环境。" });
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [working, setWorking] = useState(false);
  const localCounts = getDatabaseCounts(localDatabase);
  const cloudCounts = getDatabaseCounts(cloudDatabase);
  const autoSyncLabel = status?.lastAutoSync?.pending
    ? "自动同步中"
    : status?.lastAutoSync?.error
      ? `自动同步失败：${status.lastAutoSync.error}`
      : status?.lastAutoSync?.lastSuccessAt
        ? `最近自动同步 ${new Date(status.lastAutoSync.lastSuccessAt).toLocaleString("en-GB")}`
        : "还没有自动同步记录";

  useEffect(() => {
    void refreshState();
  }, []);

  async function refreshState() {
    setWorking(true);
    try {
      const [nextStatus, nextLocalDatabase] = await Promise.all([
        readJson<CloudStatus>("/api/cloud-inventory-db/status"),
        readJson<InventoryDatabase>("/api/inventory-db")
      ]);
      setStatus(nextStatus);
      setLocalDatabase(nextLocalDatabase);

      if (!nextStatus.configured) {
        setCloudDatabase(undefined);
        setCloudUpdatedAt(null);
        setMessage({ tone: "info", text: "Supabase 还没有配置。现在只是本机副本，原系统不受影响。" });
        return;
      }

      const nextCloud = await readJson<CloudReadResponse>("/api/cloud-inventory-db");
      setCloudDatabase(nextCloud.database);
      setCloudUpdatedAt(nextCloud.updatedAt || null);
      setMessage({ tone: "success", text: "Supabase 已连接，可以进行上传或下载测试。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "检查 Supabase 失败。" });
    } finally {
      setWorking(false);
    }
  }

  async function uploadLocalToCloud() {
    if (!localDatabase) {
      return;
    }

    setWorking(true);
    try {
      const response = await readJson<{ database: InventoryDatabase }>("/api/cloud-inventory-db", {
        body: JSON.stringify(localDatabase),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      setCloudDatabase(response.database);
      setCloudUpdatedAt(new Date().toISOString());
      setMessage({ tone: "success", text: "已把副本本机数据库上传到 Supabase。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "上传 Supabase 失败。" });
    } finally {
      setWorking(false);
    }
  }

  async function downloadCloudToLocal() {
    setWorking(true);
    try {
      const response = await readJson<CloudReadResponse>("/api/cloud-inventory-db");
      if (!response.database) {
        throw new Error("Supabase 没有返回库存数据。");
      }

      const saveResponse = await fetch("/api/inventory-db", {
        body: JSON.stringify(response.database),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      if (!saveResponse.ok) {
        throw new Error("保存 Supabase 数据到本机副本失败。");
      }
      setCloudDatabase(response.database);
      setCloudUpdatedAt(response.updatedAt || null);
      setLocalDatabase(response.database);
      setMessage({ tone: "success", text: "已把 Supabase 数据下载到这个试验副本。本操作没有影响 5173 原系统。" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "下载 Supabase 数据失败。" });
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="page-shell cloud-sync-shell">
      <a className="back-link" href="#">
        {copy.routes.backHome}
      </a>
      <section className="page-panel cloud-sync-panel">
        <div className="cloud-sync-heading">
          <div>
            <span>Supabase Trial</span>
            <h1>云端同步试验副本</h1>
          </div>
          <button disabled={working} onClick={refreshState} type="button">
            刷新状态
          </button>
        </div>

        <p className={`cloud-sync-message cloud-sync-message-${message.tone}`}>{message.text}</p>

        <div className="cloud-sync-grid">
          <section className="cloud-sync-card">
            <span>本机副本</span>
            <strong>{`${localCounts.freezer + localCounts.dryStore} 个库存产品`}</strong>
            <small>{`冷冻 ${localCounts.freezer} · 干货 ${localCounts.dryStore} · 名字修改 ${localCounts.freezerSourceNameOverrides}`}</small>
          </section>

          <section className="cloud-sync-card">
            <span>Supabase</span>
            <strong>{status?.configured ? `${cloudCounts.freezer + cloudCounts.dryStore} 个库存产品` : "未配置"}</strong>
            <small>
              {status?.configured
                ? `表 ${status.table} · 记录 ${status.recordId}${cloudUpdatedAt ? ` · ${new Date(cloudUpdatedAt).toLocaleString("en-GB")}` : ""}`
                : "需要填写 .env.local"}
            </small>
          </section>
        </div>

        <div className="cloud-sync-actions">
          <button disabled={working || !status?.configured || !localDatabase} onClick={uploadLocalToCloud} type="button">
            上传本机副本到 Supabase
          </button>
          <button disabled={working || !status?.configured} onClick={downloadCloudToLocal} type="button">
            从 Supabase 下载到副本
          </button>
        </div>

        <section className="cloud-sync-note">
          <strong>安全说明</strong>
          <p>这个页面只控制 `5174` 试验副本。原系统 `5173` 和备份文件不会被这个页面修改。</p>
          <p>{autoSyncLabel}</p>
        </section>
      </section>
    </main>
  );
}

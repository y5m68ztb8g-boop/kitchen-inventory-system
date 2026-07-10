# Supabase Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Supabase cloud sync to the isolated trial copy without changing the original local system.

**Architecture:** Keep the existing `local-data/inventory-db.json` as the source of truth unless the user explicitly uploads or downloads through a trial page. Add Vite dev-server API routes that talk to Supabase from the server side so secret keys are not exposed in the browser. Add a simple `#cloud-sync` page for status, upload local to cloud, and download cloud to local.

**Tech Stack:** Vite dev server middleware, React, TypeScript, Supabase REST API, local JSON fallback.

## Global Constraints

- Only modify `/Users/xue/Documents/Codex/自然生长/experiments/grow-naturally-supabase-trial`.
- Do not modify the original app running on port `5173`.
- Do not overwrite local inventory automatically from Supabase during the trial.
- Store Supabase credentials only in local environment files, not source code.
- Keep `local-data/inventory-db.json` usable even if Supabase is unconfigured or fails.

---

### Task 1: Server-Side Supabase Bridge

**Files:**
- Modify: `vite.config.ts`
- Create: `.env.local.example`
- Create: `supabase/inventory_databases.sql`

**Interfaces:**
- Produces: `GET /api/cloud-inventory-db/status`
- Produces: `GET /api/cloud-inventory-db`
- Produces: `POST /api/cloud-inventory-db`

- [x] Add environment-driven Supabase REST helper functions.
- [x] Add status, read, and write endpoints.
- [x] Add SQL for a single JSON inventory snapshot table.

### Task 2: Trial UI

**Files:**
- Create: `src/CloudSyncPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: cloud sync API routes from Task 1.
- Produces: `#cloud-sync` page with check status, upload local, download cloud actions.

- [x] Add a separate page so the normal inventory screens are untouched.
- [x] Require explicit button clicks for upload/download.
- [x] Show local and cloud counts before/after operations.

### Task 3: Verification

**Files:**
- No new files.

**Interfaces:**
- Consumes: all app code.
- Produces: test/build evidence and endpoint checks.

- [x] Run `pnpm test && pnpm build`.
- [x] Check local endpoint still returns `65` freezer entries.
- [x] Check cloud status endpoint returns a controlled unconfigured state before credentials exist.

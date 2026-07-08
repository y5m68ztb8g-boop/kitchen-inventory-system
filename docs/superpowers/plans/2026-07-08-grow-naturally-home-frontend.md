# Grow Naturally Home Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Vite + React frontend showing the first Grow Naturally home screen with a centered 2 by 2 Apple-inspired module grid.

**Architecture:** Create a new independent `grow-naturally-app/` directory so the frontend is isolated from the broken previous Python implementation. The first app uses static data and client-side placeholder routes so the visual experience can be reviewed before backend work begins.

**Tech Stack:** Vite, React, TypeScript, CSS, Vitest, React Testing Library, Playwright.

## Global Constraints

- The home screen uses a white page background.
- The first screen uses a centered 2 by 2 module grid.
- Modules are large translucent white surfaces with soft borders, subtle shadow, and a light glass feel.
- The initial modules are `搜索`, `区域`, an intentionally empty module, and `产品库存总金额`.
- The app must not depend on the old Kitchen History system or yesterday's Python implementation.
- The first implementation uses static placeholder data.
- Employee-facing text must avoid database terms such as Internal Product ID, primary key, foreign key, importer, and schema.
- Mixed-size widget layout is out of scope until explicitly requested later.

---

## File Structure

- Create `grow-naturally-app/package.json` for scripts and dependencies.
- Create `grow-naturally-app/index.html` as the Vite entry document.
- Create `grow-naturally-app/vite.config.ts` with React and Vitest configuration.
- Create `grow-naturally-app/tsconfig.json` and `grow-naturally-app/tsconfig.node.json` for TypeScript.
- Create `grow-naturally-app/src/main.tsx` as the React mount point.
- Create `grow-naturally-app/src/App.tsx` for simple hash-route rendering.
- Create `grow-naturally-app/src/homeModules.ts` for home module configuration.
- Create `grow-naturally-app/src/Home.tsx` for the home screen.
- Create `grow-naturally-app/src/PlaceholderPage.tsx` for placeholder destination pages.
- Create `grow-naturally-app/src/App.css` for the visual system.
- Create `grow-naturally-app/src/test/setup.ts` for test setup.
- Create `grow-naturally-app/src/Home.test.tsx` for component behavior checks.
- Create `grow-naturally-app/e2e/home.spec.ts` for browser layout smoke checks.
- Create `grow-naturally-app/playwright.config.ts` for Playwright.
- Create `grow-naturally-app/.gitignore` for frontend build artifacts.

---

### Task 1: Scaffold The Independent Frontend App

**Files:**
- Create: `grow-naturally-app/package.json`
- Create: `grow-naturally-app/index.html`
- Create: `grow-naturally-app/vite.config.ts`
- Create: `grow-naturally-app/tsconfig.json`
- Create: `grow-naturally-app/tsconfig.node.json`
- Create: `grow-naturally-app/src/main.tsx`
- Create: `grow-naturally-app/src/App.tsx`
- Create: `grow-naturally-app/src/test/setup.ts`
- Create: `grow-naturally-app/.gitignore`

**Interfaces:**
- Produces: A Vite React app mounted at `#root`.
- Produces: npm scripts `dev`, `build`, `test`, and `preview`.

- [ ] **Step 1: Create package and config files**

- [ ] **Step 2: Create the React entry point and minimal app**

- [ ] **Step 3: Install dependencies with `pnpm install`**

- [ ] **Step 4: Run `pnpm test -- --run` and expect the initial smoke test to pass**

- [ ] **Step 5: Run `pnpm build` and expect Vite to produce `dist/`**

---

### Task 2: Build The Home Screen Module Grid

**Files:**
- Create: `grow-naturally-app/src/homeModules.ts`
- Create: `grow-naturally-app/src/Home.tsx`
- Create: `grow-naturally-app/src/PlaceholderPage.tsx`
- Modify: `grow-naturally-app/src/App.tsx`
- Create: `grow-naturally-app/src/App.css`
- Create: `grow-naturally-app/src/Home.test.tsx`

**Interfaces:**
- Consumes: React app shell from Task 1.
- Produces: `HOME_MODULES`, `Home`, and `PlaceholderPage`.

- [ ] **Step 1: Write tests confirming the visible module labels and empty module**

- [ ] **Step 2: Implement `HOME_MODULES` with the four initial modules**

- [ ] **Step 3: Implement `Home` as a centered 2 by 2 grid**

- [ ] **Step 4: Implement placeholder pages for search, area, and valuation**

- [ ] **Step 5: Style the white Apple-inspired glass module layout**

- [ ] **Step 6: Run `pnpm test -- --run` and `pnpm build`**

---

### Task 3: Browser Verification

**Files:**
- Create: `grow-naturally-app/playwright.config.ts`
- Create: `grow-naturally-app/e2e/home.spec.ts`

**Interfaces:**
- Consumes: The home screen and placeholder routes from Task 2.
- Produces: A browser smoke test that verifies the homepage layout and navigation.

- [ ] **Step 1: Add Playwright config using Vite dev server**

- [ ] **Step 2: Add a browser test for the 2 by 2 homepage and module navigation**

- [ ] **Step 3: Run `pnpm exec playwright test`**

- [ ] **Step 4: Start the dev server and provide the local URL for visual review**

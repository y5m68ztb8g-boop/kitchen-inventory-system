# Tinto Stock / Linear Project Map

This folder is the Linear-ready project map for the Tinto Stock system.

The current Codex workspace does not have a direct Linear connector, so this document keeps the project structure, priorities, and issue wording in a format that can be copied into Linear without changing application data.

## Project

- Name: Tinto Stock
- Product: Hotel inventory, purchasing intake, and ordering workspace
- Current branch: `codex/ai-whiteboard-purchasing`
- Runtime: Vite + React + TypeScript
- Data: SQLite for local/server workflows, Supabase inventory sync
- Primary users: Alex and hotel staff on desktop and tablet

## Workflow States

1. Backlog
2. Ready
3. In progress
4. Review
5. Done
6. Blocked

## Priority Rules

- P0: Prevents staff from recording stock or placing an intended order.
- P1: Causes repeated work, wrong product matching, or unclear supplier actions.
- P2: Slows scanning, editing, or reviewing but has a usable workaround.
- P3: Visual polish, copy, and convenience improvements.

## Current Focus

The current release focuses on making the system feel like one calm operations workspace:

- One visual language across home, inventory, AI intake, ordering, cloud sync, and drinks.
- Clear primary action per screen.
- Dense information where staff compare products, with enough spacing for tablet use.
- Existing inventory, invoice matching, ordering, and Supabase behavior preserved.

## Definition Of Done

- The main action is visible without searching the page.
- Desktop and tablet layouts keep controls aligned and readable.
- Empty, loading, warning, and success states use the same visual language.
- No inventory records, invoice matches, or ordering behavior are changed by visual work.
- `pnpm test` and `pnpm build` pass.


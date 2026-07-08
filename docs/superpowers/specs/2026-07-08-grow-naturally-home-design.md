# Grow Naturally Home Screen Design

Date: 2026-07-08

## Purpose

Build the first visible frontend for the new independent Grow Naturally inventory system. The first screen must help a non-technical user immediately understand where to click without exposing database concepts or old implementation details.

This design covers only the home screen and its first navigation targets. It does not include the database, Excel import, search implementation, or valuation calculations.

## Visual Direction

The home screen uses a clean Apple-inspired style:

- White page background.
- Centered 2 by 2 module grid.
- Large translucent white modules with soft borders, subtle shadow, and a light glass feel.
- Minimal text.
- No side navigation, dense dashboard, technical labels, or setup instructions on the screen.

The first version should feel like a calm entry screen, not an admin panel.

## Initial Modules

The first screen starts with four modules:

1. Search
   - Position: top left.
   - Label: `搜索`.
   - Purpose: entry point for finding products.
   - Initial action: navigate to the product search page or placeholder search screen.

2. Area
   - Position: top right.
   - Label: `区域`.
   - Purpose: entry point for location-based browsing and counting.
   - Initial action: navigate to an area selection page or placeholder area screen.

3. Empty future module
   - Position: bottom left.
   - Label: none for now, or a very quiet placeholder state if needed during development.
   - Purpose: reserve space for the next feature without making the home screen feel unfinished.

4. Inventory total value
   - Position: bottom right.
   - Label: `产品库存总金额`.
   - Purpose: entry point for stock valuation.
   - Initial display: a large GBP value when data is available; otherwise a neutral placeholder.
   - Initial action: navigate to the valuation detail page or placeholder valuation screen.

## Layout Behavior

For the first release, the grid is a centered 2 by 2 layout with large modules.

As more functions are added later, the home screen should remain a simple module grid. The modules can gradually become smaller and wrap into more columns or rows, but the homepage should keep the same rule: each module is one clear destination.

The app should not introduce mixed-size widgets until explicitly requested later.

## Navigation Model

The home screen is a launch surface. Each module should behave like a large button:

- Search opens product search.
- Area opens location or freezer-area browsing.
- Inventory total value opens valuation details.
- The empty module does nothing until assigned a feature.

Navigation can initially point to simple placeholder pages so the frontend can be reviewed visually before backend work begins.

## Content Rules

Employee-facing text should use simple business language:

- `搜索`
- `区域`
- `产品库存总金额`

Avoid showing internal system language on the home screen:

- Internal Product ID
- Database primary key
- Foreign key
- Supplier product table names
- Importer or schema terms

## Technical Direction

Create a new independent frontend app in this project folder instead of extending the broken previous implementation. The app should not depend on the old Kitchen History system.

Recommended first implementation:

- New app directory, for example `grow-naturally-app/`.
- Vite + React frontend for a fast visual prototype.
- Static placeholder data for the first visual review.
- Later connection to a local SQLite-backed API.

## Acceptance Criteria

The first frontend pass is acceptable when:

- Opening the app shows a white home screen with four centered modules.
- The modules are arranged as a 2 by 2 grid on desktop.
- The design is visually minimal and calm.
- The user can immediately identify `搜索`, `区域`, and `产品库存总金额`.
- The third module remains intentionally empty.
- The layout can later scale to more modules without changing the core homepage idea.

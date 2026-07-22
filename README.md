# Opticut Export App (v2)

Local browser tool for converting Allmoxy CSV exports into Weinig OptiCut-ready
cut-list CSV files and printable shop-floor cut lists.

This is a modernized rebuild of the original single-file `index.html` app:
modular architecture, build tooling, lint/format, and automated tests for every
high-risk business rule.

## What It Does

- Parses Allmoxy CSV files in the browser.
- Normalizes material names and top edge names (including **B-edge priority**).
- Groups rows into material/top-edge/**ship-date** batches (optional combine ship dates).
- Separates **special orders** (Scoop, Slope, Dividers, DrillFront, FileSlots) into `SPECIAL_` batches when enabled (default ON). Laser and GroupID are not special triggers.
- Strips batching-only columns (`GroupID`, `Laser`, Ship Date, and all secondary-operation columns) from exported CSVs.
- Exports cut-list CSV files for OptiCut.
- Prints landscape cut-list sheets per batch (or all batches) with a 3-column fluid flow, rounded widths, GroupID box counts, Code 128 barcodes, and checkboxes.
- Prints a **Batch index** (batch name, boxes, orders with group qty in brackets, barcodes) for station scanning.
- **Station** live queue (`#station`): **Export ZIP** from prep downloads CSVs and sends all batches; scan barcode on floor; soft-remove / Add back; wipe database (password `dbs`).
- Cut-list preview shows full imported rows (Scoop, GroupID, etc.); export strips batching columns.
- Export rounding is checked by default; it rounds `Width` up to whole numbers,
  merges matching rows, and records original width quantities in `Label`.
- Supports excluding orders, materials, and top edges before export.
- Supports split batches while keeping each order number in only one split batch.

## Project Structure

```
index.html              Mount point / app shell
src/
  main.js               App controller: wires DOM events to logic, holds state
  styles.css            Modern design system (DBS brand) + print styles
  ui/
    cutListPrintView.js Cut-list + batch-index print HTML
    stationView.js      Live station queue UI
  logic/                Pure, tested business rules (no DOM, no side effects)
    csv.js              parseCSV, csvEscape, convertToCSV, escapeHTML, escapeAttr
    headers.js          mapHeaders (column detection + positional fallback)
    categories.js       getMaterialCategory + CATEGORY_CODES
    widths.js           Width vs W rule, roundWidthUpToWhole, fraction parsing
    boxMath.js          Math.ceil(parts/4) box math + box matrix
    materialNames.js    Export material name formatting (PF, HRM, 12mm, 32-char)
    topEdges.js         Top edge normalization + edge codes
    splitOrders.js      Round-robin split-batch distribution + validation
    grouping.js         splitDataIntoGroups, B-edge priority, exclusions
    specialOrders.js    Special-order detection from secondary-operation columns
    shipDate.js         Ship-date batch grouping + print labels
    groupBoxes.js       Per-GroupID box totals + order-total reconcile for print
    batchOrders.js      Per-batch order exclusions (sidebar panel)
    cutListPrint.js     Flat cut-list print rows (pair FB/LR, merge, sort)
    exportRows.js       Cut-list export rows, rounded-width merge + Label
    code128.js          Code 128 SVG barcodes
    stationSync.js      Firestore station jobs (send, soft-delete, wipe)
    firebaseConfig.js   Firebase project config
    settingsStore.js    Persistent settings (localStorage)
    demoData.js         Demo CSV
tests/                  Vitest tests for every module above
.github/workflows/      CI: install, test, build, deploy docs/
```

## Run Locally

```bash
npm install
npm run dev      # Vite dev server
```

Then open the URL Vite prints (default http://localhost:5173).

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # preview the production build
npm run deploy    # build + copy dist/ to docs/ for GitHub Pages
```

The build is a static site — deploy `dist/` to GitHub Pages, Netlify, Vercel,
or any static host.

## Run Tests

```bash
npm test          # one-shot
npm run test:watch
```

## Lint & Format

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

## Business Rules (do not change without checking)

These rules are encoded in the logic modules and protected by tests. Changing
them may break shop-floor operations:

- `Math.ceil(parts / 4)` box math (`src/logic/boxMath.js`)
- When GroupID exists, order box total = sum of per-group `ceil(parts/4)` so print
  GroupID-qty always matches the order total (`src/logic/groupBoxes.js`)
- Grouping by `Width` (drawer height) instead of `W` (`src/logic/widths.js`)
- Rounding drawer `Width` up to whole numbers for cut-list print and export
- Rounded-width export checked ON by default, original widths recorded in `Label`
- Warning before turning rounded-width export OFF
- `B` top-edge priority for matching `F` rows (`src/logic/grouping.js`)
- Each order appears in exactly one split batch (`src/logic/splitOrders.js`)
- Special orders never share a batch with normal orders of the same material/edge (`src/logic/specialOrders.js`)
- Batching-only columns are excluded from export CSV (`src/logic/headers.js` → `filterForExport`)
- Identical cut-list print lines merge (same order, group, width, and lengths)
- Export material names ≤ 32 chars, thickness at end, PF/HRM/12mm rules
  (`src/logic/materialNames.js`)

## Manual Test Checklist

After changes, test:

1. Load a CSV.
2. Confirm batch list shows boxes and orders.
3. Confirm cut-list preview loads.
4. Confirm **Cut list** print opens a landscape sheet for the current batch.
5. Confirm **Cut lists** prints every batch on separate pages.
6. Export ZIP and confirm only cut-list CSVs are included.
7. Confirm rounded-width export is checked by default.
8. Uncheck rounded-width export and confirm the warning appears.
9. With rounded-width export checked, confirm matching rounded rows merge,
   `Width` is whole number, and `Label` records original width quantities.
10. Confirm material names are under 32 characters and keep thickness at end.
11. Split a batch and confirm no order number appears in two split batches from
    the same source group.

## Persistent Settings

The app stores recent file names and the max-orders-per-batch setting in browser
`localStorage` via `src/logic/settingsStore.js`.

Row removals are not automatically carried into the next CSV load, so a previous
material/top-edge removal will not silently hide rows from a future file.

## License

All rights reserved. Internal tooling — see repository owner for usage rights.

import { escapeHTML, escapeAttr } from '../logic/csv.js';
import {
  packCutListPrintFlow,
  estimateRowsPerPrintColumn,
  PRINT_FLOW_COLUMNS,
} from './cutListPrintView.js';

/** Max side-by-side columns on the station monitor. */
export const STATION_FLOW_COLUMNS = 3;

/** Fallback row-units per column when viewport height is unknown (bake / tests). */
export const STATION_SCREEN_ROWS_PER_COLUMN = 22;

/**
 * Fill column 1 top-to-bottom, then column 2, then column 3.
 * Stacks small orders in the same column until the budget is full — matches
 * “fluid flow / less scrolling” on the station monitor.
 *
 * @param {Array<{ cost: number }>} items
 * @param {number} [columnCount]
 * @param {number} [maxCostPerColumn] row-units (title≈2 + data rows)
 * @returns {number[][]} column index → item indices
 */
export function assignFragmentsToColumns(
  items,
  columnCount = STATION_FLOW_COLUMNS,
  maxCostPerColumn = STATION_SCREEN_ROWS_PER_COLUMN
) {
  const columns = Array.from({ length: columnCount }, () => []);
  const used = Array.from({ length: columnCount }, () => 0);
  let col = 0;
  const budget = Math.max(4, maxCostPerColumn || STATION_SCREEN_ROWS_PER_COLUMN);

  (items || []).forEach((item, index) => {
    const cost = Math.max(1, item?.cost || 1);
    if (used[col] > 0 && used[col] + cost > budget && col < columnCount - 1) {
      col += 1;
    }
    columns[col].push(index);
    used[col] += cost;
  });

  return columns;
}

/**
 * Estimate how many row-units fit in one station column for the current viewport.
 * @param {ParentNode} root
 * @returns {number}
 */
export function estimateStationViewportColumnBudget(root) {
  const body =
    root?.closest?.('.station-live-body') ||
    root?.querySelector?.('.station-live-body') ||
    root;
  const avail = Math.max(180, (body?.clientHeight || 640) - 96);
  const sample =
    root?.querySelector?.('.cutlist-table tbody tr') ||
    root?.querySelector?.('tbody tr');
  let rowH = 22;
  try {
    const h = sample?.getBoundingClientRect?.().height;
    if (h && h > 8) rowH = h;
  } catch {
    /* ignore */
  }
  return Math.max(8, Math.floor(avail / rowH));
}

function fragmentCost(el) {
  const rows = el.querySelectorAll('tbody tr').length;
  return 2 + rows;
}

/** Pull the order id from a fragment title ("Order 602947 - …" / "(cont.)"). */
export function stationOrderFragmentKey(titleText) {
  const text = String(titleText || '').trim();
  const match = text.match(/order\s+([^\s(]+)/i);
  if (match) return match[1].replace(/[,\s]+$/g, '').toLowerCase();
  return text.replace(/\s*\(cont\.\)\s*/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Stable order key for a fragment: data-order, title, or first row id.
 * @param {Element} frag
 * @returns {string}
 */
export function stationOrderKeyFromFragment(frag) {
  const dataOrder = frag?.getAttribute?.('data-order');
  if (dataOrder) return String(dataOrder).trim().toLowerCase();

  const titleText = frag?.querySelector?.('.cutlist-order-title')?.textContent || '';
  const fromTitle = stationOrderFragmentKey(titleText);
  if (fromTitle) return fromTitle;

  const rowId =
    frag?.querySelector?.('tr[data-row-id], [data-row-id]')?.getAttribute('data-row-id') || '';
  if (!rowId) return '';
  const parts = rowId.split('|');
  if (parts[0] === 't') return String(parts[1] || '').trim().toLowerCase();
  return String(parts[0] || '').trim().toLowerCase();
}

/**
 * Merge continuation fragments of the same order back into one table so a
 * short order is not left split across columns with empty space below.
 * @param {Element[]} fragments
 * @returns {Element[]}
 */
export function mergeStationOrderFragments(fragments) {
  const primaryByKey = new Map();
  const orderKeys = [];

  (fragments || []).forEach((frag, index) => {
    const key = stationOrderKeyFromFragment(frag) || `frag-${index}`;

    if (!primaryByKey.has(key)) {
      primaryByKey.set(key, frag);
      orderKeys.push(key);
      return;
    }

    const primary = primaryByKey.get(key);
    const tbody = primary.querySelector('tbody');
    if (!tbody) return;
    frag.querySelectorAll('tbody tr').forEach((row) => {
      tbody.appendChild(row);
    });
  });

  const merged = orderKeys.map((key) => primaryByKey.get(key)).filter(Boolean);
  merged.forEach((frag) => restripeFragmentRows(frag));
  return merged;
}

/** Re-apply zebra striping after merging continuation chunks. */
function restripeFragmentRows(frag) {
  const rows = frag?.querySelectorAll?.('tbody tr.cutlist-data-row');
  if (!rows?.length) return;
  rows.forEach((row, i) => {
    row.classList.toggle('cutlist-row-alt', i % 2 === 1);
  });
}

/** True when any order is still split with a "(cont.)" title. */
export function stationFlowNeedsOrderMerge(root) {
  if (!root?.querySelectorAll) return false;
  return [...root.querySelectorAll('.cutlist-order-title')].some((el) =>
    /\(cont\.\)/i.test(el.textContent || '')
  );
}

/**
 * Rebuild every cut-list / trim flow into up to three columns.
 * Fills column 1 until the viewport budget is full, then column 2, then 3.
 * Keeps each order together; only opens another column when needed.
 * @param {ParentNode} root
 * @param {number} [columnCount]
 */
export function balanceStationFlowColumns(root, columnCount = STATION_FLOW_COLUMNS) {
  if (!root?.querySelectorAll) return;

  const budget = estimateStationViewportColumnBudget(root);

  root.querySelectorAll('.cutlist-print-flow').forEach((flow) => {
    const raw = [...flow.querySelectorAll('.cutlist-order-fragment')];
    if (!raw.length) return;

    const fragments = mergeStationOrderFragments(raw);
    const items = fragments.map((el) => ({ cost: fragmentCost(el) }));
    const assignment = assignFragmentsToColumns(items, columnCount, budget);
    const filled = assignment.filter((indexes) => indexes.length > 0);
    const usedCols = Math.max(1, filled.length);

    const band = document.createElement('div');
    band.className = 'cutlist-print-columns';
    band.style.setProperty('--station-flow-cols', String(usedCols));

    filled.forEach((indexes) => {
      const col = document.createElement('div');
      col.className = 'cutlist-order-column';
      indexes.forEach((fragIndex) => {
        col.appendChild(fragments[fragIndex]);
      });
      band.appendChild(col);
    });

    flow.replaceChildren(band);
  });
}

function rowHtmlForPrint(tr, checks) {
  const clone = tr.cloneNode(true);
  clone.querySelectorAll('.station-check[data-row-id]').forEach((input) => {
    const id = input.getAttribute('data-row-id') || '';
    const checked = Boolean(checks[id]);
    const span = document.createElement('span');
    span.className = checked ? 'print-check print-check--done' : 'print-check';
    span.setAttribute('aria-hidden', 'true');
    if (checked) span.setAttribute('data-checked', '1');
    input.replaceWith(span);
  });
  return clone.outerHTML;
}

/** Convert any leftover station-check inputs to print-check spans. */
function convertStationChecksInRoot(root, checks = {}) {
  root?.querySelectorAll?.('.station-check[data-row-id]').forEach((input) => {
    const id = input.getAttribute('data-row-id') || '';
    const checked = Boolean(checks[id]);
    const span = document.createElement('span');
    span.className = checked ? 'print-check print-check--done' : 'print-check';
    span.setAttribute('aria-hidden', 'true');
    if (checked) span.setAttribute('data-checked', '1');
    input.replaceWith(span);
  });
}

function renderPrintDomFragment(fragment, tableHeadByOrder) {
  const order = String(fragment.order || '');
  const title = fragment.titleHtml
    ? `<div class="cutlist-order-title">${fragment.titleHtml}</div>`
    : '';
  const head = tableHeadByOrder.get(order) || tableHeadByOrder.get(order.toLowerCase()) || '';
  const start = fragment.rowStart || 0;
  const body = (fragment.rows || [])
    .map((row, i) => {
      const wrap = document.createElement('tbody');
      wrap.innerHTML = row.__html || '';
      const tr = wrap.firstElementChild;
      if (!tr) return row.__html || '';
      tr.classList.toggle('cutlist-row-alt', (start + i) % 2 === 1);
      return tr.outerHTML;
    })
    .join('');
  const orderAttr = order ? ` data-order="${escapeAttr(order)}"` : '';
  return `<div class="cutlist-order-fragment"${orderAttr}>${title}<table class="cutlist-table cutlist-table--flow" cellspacing="0">${head}<tbody>${body}</tbody></table></div>`;
}

function renderPrintDomPage(columns, tableHeadByOrder) {
  return `<div class="cutlist-print-columns">${columns
    .map((fragments) => {
      if (!fragments.length) {
        return `<div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>`;
      }
      return `<div class="cutlist-order-column">${fragments
        .map((fragment) => renderPrintDomFragment(fragment, tableHeadByOrder))
        .join('')}</div>`;
    })
    .join('')}</div>`;
}

/**
 * Build print HTML from the live station sheet: fill page columns top-to-bottom
 * (print packing), and continue long orders onto the next column/page instead of
 * shoving a whole tall order onto a nearly empty next sheet.
 *
 * @param {Element} sheetEl `.cutlist-print-sheet` from the live station view
 * @param {{ checks?: Record<string, boolean> }} [options]
 * @returns {string}
 */
export function buildStationPrintSheetHtml(sheetEl, { checks = {} } = {}) {
  if (!sheetEl?.querySelector) return '';

  const working = sheetEl.cloneNode(true);
  const header = working.querySelector('.print-batch-header')?.outerHTML || '';
  const merged = mergeStationOrderFragments([
    ...working.querySelectorAll('.cutlist-order-fragment'),
  ]);
  if (!merged.length) {
    convertStationChecksInRoot(working, checks);
    return working.outerHTML;
  }

  const tableHeadByOrder = new Map();
  const sections = merged.map((frag) => {
    const order =
      frag.getAttribute('data-order') || stationOrderKeyFromFragment(frag) || 'order';
    const titleEl = frag.querySelector('.cutlist-order-title');
    let titleHtml = titleEl?.innerHTML || `Order ${escapeHTML(order)}`;
    titleHtml = titleHtml.replace(
      /\s*<span[^>]*cutlist-order-cont[^>]*>[\s\S]*?<\/span>/gi,
      ''
    );
    const table = frag.querySelector('table');
    const head =
      (table?.querySelector('colgroup')?.outerHTML || '') +
      (table?.querySelector('thead')?.outerHTML || '');
    tableHeadByOrder.set(order, head);
    tableHeadByOrder.set(String(order).toLowerCase(), head);
    const rows = [...frag.querySelectorAll('tbody tr')].map((tr) => ({
      __html: rowHtmlForPrint(tr, checks),
    }));
    return {
      order,
      titleHtml,
      contTitleHtml: `${titleHtml} <span class="cutlist-order-cont">(cont.)</span>`,
      rows,
    };
  });

  const hasShipDate = [...working.querySelectorAll('.print-meta-label')].some((el) =>
    /ship/i.test(el.textContent || '')
  );
  const rowsPerColumn = estimateRowsPerPrintColumn({
    orderCount: Math.max(sections.length, 1),
    hasShipDate,
  });
  const pages = packCutListPrintFlow(sections, {
    columnCount: PRINT_FLOW_COLUMNS,
    rowsPerColumn,
  });

  const flowHtml = pages
    .map((columns) => renderPrintDomPage(columns, tableHeadByOrder))
    .join('');

  const trimClass = working.classList.contains('trim-list-sheet') ? ' trim-list-sheet' : '';
  return `<div class="cutlist-print-sheet${trimClass}">${header}<div class="cutlist-print-flow">${flowHtml}</div></div>`;
}

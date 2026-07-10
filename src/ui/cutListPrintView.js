import { escapeHTML } from '../logic/csv.js';
import { getExportMaterialName } from '../logic/materialNames.js';
import { formatShipDateLabel } from '../logic/shipDate.js';
import { formatOrderCutListBoxSummary } from '../logic/groupBoxes.js';
import { getCutListPrintSections } from '../logic/cutListPrint.js';

function formatPrintBatchOrders(batch) {
  const orders = batch?.sortedOrders || [];
  if (!orders.length) return '';
  return orders.map((o) => escapeHTML(String(o).trim())).join(', ');
}

function buildPrintHeaderBanner(batchKey, batch, colIndices, position = null) {
  const safeBatchKey = escapeHTML(batchKey);
  const safePrintedAt = escapeHTML(
    new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );
  const materialDisplay = batch.materialName
    ? `<b>${escapeHTML(getExportMaterialName(batch.materialName))}</b>`
    : `<span class="badge badge--danger">⚠️ MISSING MATERIAL</span>`;
  const topEdgeDisplay = batch.topEdge
    ? `<b>${escapeHTML(batch.topEdge)}</b>`
    : `<span class="badge badge--danger">⚠️ MISSING TOP EDGE</span>`;
  const batchTag =
    position && position.count > 1
      ? `<span class="print-batch-index">Batch ${position.index} of ${position.count}</span>`
      : '';
  const specialTag = batch.isSpecial
    ? `<span class="print-batch-special">★ SPECIAL</span>`
    : '';
  const shipDateLabel = formatShipDateLabel(batch.shipDate, colIndices);
  const shipDateChip = shipDateLabel
    ? `
        <div class="print-meta-chip">
          <div class="print-meta-label">Ship Date</div>
          <div><b>${escapeHTML(shipDateLabel)}</b></div>
        </div>`
    : '';

  return `
    <div class="print-batch-header">
      <div class="print-batch-header-row">
        <div class="print-batch-title">
          ${safeBatchKey}.csv${batchTag}${specialTag}
          <span class="print-batch-boxes-total">${batch.totalBoxes} Boxes</span>
          <span class="print-batch-orders-list">${formatPrintBatchOrders(batch)}</span>
        </div>
        <div class="print-batch-time">Printed: ${safePrintedAt}</div>
      </div>
      <div class="print-batch-meta">
        <div class="print-meta-chip">
          <div class="print-meta-label">Material</div>
          <div>${materialDisplay}</div>
        </div>
        <div class="print-meta-chip">
          <div class="print-meta-label">Top Edge</div>
          <div>${topEdgeDisplay}</div>
        </div>
        ${shipDateChip}
      </div>
    </div>
  `;
}

function renderCutListTableHead(hasGroup) {
  return `
      <colgroup>
        ${hasGroup ? '<col class="cutlist-col-grp">' : ''}
        <col class="cutlist-col-width">
        <col class="cutlist-col-length">
        <col class="cutlist-col-length">
        <col class="cutlist-col-count">
        <col class="cutlist-col-count">
        <col class="cutlist-col-check">
      </colgroup>
      <thead>
        <tr class="cutlist-columns-row">
          ${hasGroup ? '<th>Grp</th>' : ''}
          <th>W</th>
          <th>F / B</th>
          <th>L / R</th>
          <th>Bx</th>
          <th>Pcs</th>
          <th class="cutlist-check-col" aria-label="Check"></th>
        </tr>
      </thead>`;
}

function renderCutListDataRow(r, hasGroup, altClass) {
  return `
      <tr class="cutlist-data-row${altClass}">
        ${hasGroup ? `<td class="cutlist-group${r.special ? ' cutlist-group-special' : ''}">${escapeHTML(r.groupId || '')}${r.special ? ' <span class="cutlist-group-star">★</span>' : ''}</td>` : ''}
        <td class="cutlist-dim">${escapeHTML(r.width)}"</td>
        <td class="cutlist-dim">${r.fbLength ? `<b>${escapeHTML(r.fbLength)}"</b>` : ''}</td>
        <td class="cutlist-dim">${r.lrLength ? `<b>${escapeHTML(r.lrLength)}"</b>` : ''}</td>
        <td class="cutlist-qty"><b>${r.boxes}</b></td>
        <td class="cutlist-qty"><b>${r.parts}</b></td>
        <td class="cutlist-check"><span class="print-check" aria-hidden="true"></span></td>
      </tr>`;
}

function renderCutListTableBody(rows, hasGroup) {
  let rowOrdinal = 0;
  let html = '';
  rows.forEach((r) => {
    const altClass = rowOrdinal % 2 === 1 ? ' cutlist-row-alt' : '';
    rowOrdinal++;
    html += renderCutListDataRow(r, hasGroup, altClass);
  });
  return html;
}

/** Side-by-side columns on a landscape print page. */
export const PRINT_FLOW_COLUMNS = 3;

/** Approx. data rows that fit in one print column under the batch header. */
export const PRINT_ROWS_PER_COLUMN = 28;

/** Order title band cost in row-units (keeps packing honest). */
const ORDER_TITLE_ROW_COST = 2;

/**
 * Pack order sections into page bands of columns.
 * Fill column 1 top-to-bottom, then column 2, then column 3.
 * The next order continues in the same column under the previous table
 * when vertical space remains.
 *
 * @returns {Array<Array<Array<{order: string, titleHtml: string, rows: object[]}>>>}
 *   pages → columns → fragments
 */
export function packCutListPrintFlow(
  sections,
  {
    columnCount = PRINT_FLOW_COLUMNS,
    rowsPerColumn = PRINT_ROWS_PER_COLUMN,
    titleCost = ORDER_TITLE_ROW_COST,
  } = {}
) {
  const pages = [];
  let columns = Array.from({ length: columnCount }, () => []);
  let colIndex = 0;
  let used = 0;

  const flushPage = () => {
    if (columns.some((col) => col.length)) {
      pages.push(columns);
      columns = Array.from({ length: columnCount }, () => []);
      colIndex = 0;
      used = 0;
    }
  };

  const advanceColumn = () => {
    colIndex += 1;
    used = 0;
    if (colIndex >= columnCount) flushPage();
  };

  const ensureSpace = (needed) => {
    if (used > 0 && used + needed > rowsPerColumn) {
      advanceColumn();
    }
  };

  for (const section of sections || []) {
    const rows = section.rows || [];
    if (!rows.length) continue;

    let offset = 0;
    let firstFragment = true;

    while (offset < rows.length) {
      const overhead = firstFragment ? titleCost : 1; // thead on continuations
      ensureSpace(overhead + 1);
      const spaceForRows = Math.max(1, rowsPerColumn - used - overhead);
      const chunk = rows.slice(offset, offset + spaceForRows);
      offset += chunk.length;

      columns[colIndex].push({
        order: section.order,
        titleHtml: firstFragment ? section.titleHtml : '',
        rows: chunk,
      });
      used += overhead + chunk.length;
      firstFragment = false;

      if (offset < rows.length) {
        advanceColumn();
      }
    }
  }

  flushPage();
  return pages;
}

function renderCutListColumnTable(rows, hasGroup) {
  return `
      <table class="cutlist-table cutlist-table--flow" cellspacing="0">
        ${renderCutListTableHead(hasGroup)}
        <tbody>${renderCutListTableBody(rows, hasGroup)}</tbody>
      </table>`;
}

function renderFlowFragment(fragment, hasGroup) {
  const title = fragment.titleHtml
    ? `<div class="cutlist-order-title">${fragment.titleHtml}</div>`
    : '';
  return `<div class="cutlist-order-fragment">${title}${renderCutListColumnTable(fragment.rows, hasGroup)}</div>`;
}

function renderFlowColumn(fragments, hasGroup) {
  if (!fragments.length) {
    return `<div class="cutlist-order-column cutlist-order-column--empty"></div>`;
  }
  return `<div class="cutlist-order-column">${fragments
    .map((fragment) => renderFlowFragment(fragment, hasGroup))
    .join('')}</div>`;
}

function renderFlowPage(columns, hasGroup) {
  return `<div class="cutlist-print-columns">${columns
    .map((fragments) => renderFlowColumn(fragments, hasGroup))
    .join('')}</div>`;
}

function buildSectionTitleHtml(section, batch, colIndices, anySpecial) {
  const specialMark = section.special && anySpecial ? ' <span class="cutlist-order-special">★ SPECIAL</span>' : '';
  const boxSummary = formatOrderCutListBoxSummary(section.order, batch, colIndices);
  const boxMark = boxSummary ? ` · ${escapeHTML(boxSummary)}` : '';
  return `Order ${escapeHTML(section.order)}${boxMark}${specialMark}`;
}

function renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, colCount) {
  if (!sections.length) {
    return `<div class="cutlist-print-columns">
      <div class="cutlist-order-column">
        <div class="cutlist-order-fragment">
          <table class="cutlist-table cutlist-table--flow" cellspacing="0">
            ${renderCutListTableHead(hasGroup)}
            <tbody>
              <tr><td colspan="${colCount}" class="cutlist-cell-empty" style="padding:1rem;">No cut-list rows available.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  const titled = sections.map((section) => ({
    ...section,
    titleHtml: buildSectionTitleHtml(section, batch, colIndices, anySpecial),
  }));
  const pages = packCutListPrintFlow(titled);

  return pages.map((columns) => renderFlowPage(columns, hasGroup)).join('');
}

export function buildCutListPrintCard(batchKey, batch, colIndices, position = null) {
  const headerBanner = buildPrintHeaderBanner(batchKey, batch, colIndices, position);
  const sections = getCutListPrintSections(batch, colIndices);
  const hasGroup = colIndices.groupId !== -1;
  const anySpecial = sections.some((s) => s.special);
  const colCount = 6 + (hasGroup ? 1 : 0);

  return `<div class="cutlist-print-sheet">${headerBanner}<div class="cutlist-print-flow">${renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, colCount)}</div></div>`;
}

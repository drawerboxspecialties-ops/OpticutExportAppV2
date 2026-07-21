import { escapeHTML, escapeAttr } from '../logic/csv.js';
import { getExportMaterialName } from '../logic/materialNames.js';
import { formatShipDateLabel } from '../logic/shipDate.js';
import { formatOrderCutListBoxSummary } from '../logic/groupBoxes.js';
import { getTrimListPrintSections, trimListRowId } from '../logic/trimListPrint.js';
import { DFM_MARK } from '../logic/cutListPrint.js';
import { buildCode128Svg } from '../logic/code128.js';
import {
  packCutListPrintFlow,
  packStationBalancedFlow,
  estimateRowsPerPrintColumn,
  formatPrintBatchOrders,
  PRINT_ROWS_PER_COLUMN,
} from './cutListPrintView.js';

/**
 * Station / print HTML for the trim-saw list — same visual layout as OptiCut
 * cut lists (header chips + 3-column flow), with actual F/B and L/R part W.
 *
 * @param {string} batchKey
 * @param {object} batch
 * @param {object} colIndices
 * @param {{ allRows?: string[][], mode?: 'station'|'print' }} [options]
 */
export function buildTrimListPrintCard(batchKey, batch, colIndices, options = {}) {
  const mode = options.mode === 'station' ? 'station' : 'print';
  const sections = getTrimListPrintSections(batch, colIndices, { allRows: options.allRows });
  const hasGroup = colIndices.groupId !== -1;
  const anySpecial = sections.some((s) => s.special);
  const colCount = 7 + (hasGroup ? 1 : 0);
  const printRows = estimateRowsPerPrintColumn({
    orderCount: Math.max(sections.length, (batch?.sortedOrders || []).length, 1),
    hasShipDate: Boolean(formatShipDateLabel(batch?.shipDate, colIndices)),
  });
  const rowsPerColumn = printRows;

  return `<div class="cutlist-print-sheet trim-list-sheet"${
    mode === 'station' ? ' data-station-sheet="1" data-trim-sheet="1"' : ''
  }>${buildTrimHeaderBanner(batchKey, batch, colIndices)}<div class="cutlist-print-flow">${renderTrimFlowBody(
    sections,
    batch,
    colIndices,
    hasGroup,
    anySpecial,
    colCount,
    rowsPerColumn,
    mode
  )}</div></div>`;
}

function buildTrimHeaderBanner(batchKey, batch, colIndices) {
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
  const specialTag = batch.isSpecial ? `<span class="print-batch-special">★ SPECIAL</span>` : '';
  const shipDateLabel = formatShipDateLabel(batch.shipDate, colIndices);
  const shipDateChip = shipDateLabel
    ? `
        <div class="print-meta-chip">
          <div class="print-meta-label">Ship Date</div>
          <div><b>${escapeHTML(shipDateLabel)}</b></div>
        </div>`
    : '';
  const barcodeSvg = buildCode128Svg(batchKey, {
    height: 32,
    moduleWidth: 1.25,
    includeLabel: false,
  });
  const barcodeBlock = barcodeSvg
    ? `<div class="print-batch-barcode" title="${escapeAttr(batchKey)}">${barcodeSvg}</div>`
    : '';

  return `
    <div class="print-batch-header">
      <div class="print-batch-header-row">
        <div class="print-batch-title">
          ${safeBatchKey}.csv <span class="print-batch-trim">TRIM</span>${specialTag}
          <span class="print-batch-boxes-total">${batch.totalBoxes || 0} Boxes</span>
          <span class="print-batch-orders-list">${formatPrintBatchOrders(batch)}</span>
        </div>
        <div class="print-batch-header-aside">
          ${barcodeBlock}
          <div class="print-batch-time">Printed: ${safePrintedAt}</div>
        </div>
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

function renderTrimTableHead(hasGroup) {
  return `
      <colgroup>
        ${hasGroup ? '<col class="cutlist-col-grp">' : ''}
        <col class="cutlist-col-trim-w">
        <col class="cutlist-col-trim-len">
        <col class="cutlist-col-trim-w">
        <col class="cutlist-col-trim-len">
        <col class="cutlist-col-count">
        <col class="cutlist-col-count">
        <col class="cutlist-col-check">
      </colgroup>
      <thead>
        <tr class="cutlist-columns-row">
          ${hasGroup ? '<th>Grp</th>' : ''}
          <th>F/B W</th>
          <th>L</th>
          <th>L/R W</th>
          <th>L</th>
          <th>Bx</th>
          <th>Pcs</th>
          <th class="cutlist-check-col" aria-label="Check"></th>
        </tr>
      </thead>`;
}

function renderTrimDataRow(r, order, hasGroup, altClass, mode = 'print') {
  const dfmMark = r.dfm ? `<span class="cutlist-dfm-mark">${escapeHTML(DFM_MARK)}</span>` : '';
  const groupCell = hasGroup
    ? `<td class="cutlist-group${r.special ? ' cutlist-group-special' : ''}${r.dfm ? ' cutlist-group--dfm' : ''}"><span class="cutlist-group-id">${escapeHTML(r.groupId || '')}${r.special ? ' <span class="cutlist-group-star">★</span>' : ''}</span>${dfmMark}</td>`
    : '';
  const rowId = trimListRowId({ ...r, order });
  const needs = r.needsTrim ? ' trim-row-needs' : '';
  const checkCell =
    mode === 'station'
      ? `<td class="cutlist-check"><input type="checkbox" class="station-check" data-row-id="${escapeAttr(rowId)}" aria-label="Mark trim line complete"></td>`
      : `<td class="cutlist-check"><span class="print-check" aria-hidden="true"></span></td>`;
  return `
      <tr class="cutlist-data-row${altClass}${needs}${r.dfm ? ' cutlist-row-dfm' : ''}"${
        mode === 'station' ? ` data-row-id="${escapeAttr(rowId)}"` : ''
      }>
        ${groupCell}
        <td class="cutlist-dim trim-fb-w">${r.fbW ? `${escapeHTML(r.fbW)}"` : ''}</td>
        <td class="cutlist-dim">${r.fbLength ? `<b>${escapeHTML(r.fbLength)}"</b>` : ''}</td>
        <td class="cutlist-dim trim-lr-w">${r.lrW ? `${escapeHTML(r.lrW)}"` : ''}</td>
        <td class="cutlist-dim">${r.lrLength ? `<b>${escapeHTML(r.lrLength)}"</b>` : ''}</td>
        <td class="cutlist-qty"><b>${r.boxes}</b></td>
        <td class="cutlist-qty"><b>${r.parts}</b></td>
        ${checkCell}
      </tr>`;
}

function renderTrimTableBody(rows, order, hasGroup, rowStart = 0, mode = 'print') {
  let html = '';
  rows.forEach((r, i) => {
    const altClass = (rowStart + i) % 2 === 1 ? ' cutlist-row-alt' : '';
    html += renderTrimDataRow(r, order, hasGroup, altClass, mode);
  });
  return html;
}

function renderTrimColumnTable(fragment, hasGroup, mode = 'print') {
  return `
      <table class="cutlist-table cutlist-table--flow" cellspacing="0">
        ${renderTrimTableHead(hasGroup)}
        <tbody>${renderTrimTableBody(
          fragment.rows,
          fragment.order,
          hasGroup,
          fragment.rowStart || 0,
          mode
        )}</tbody>
      </table>`;
}

function renderTrimFlowFragment(fragment, hasGroup, mode = 'print') {
  const title = fragment.titleHtml
    ? `<div class="cutlist-order-title">${fragment.titleHtml}</div>`
    : '';
  const orderAttr = fragment.order
    ? ` data-order="${escapeAttr(String(fragment.order))}"`
    : '';
  return `<div class="cutlist-order-fragment"${orderAttr}>${title}${renderTrimColumnTable(
    fragment,
    hasGroup,
    mode
  )}</div>`;
}

function renderTrimFlowColumn(fragments, hasGroup, mode = 'print') {
  if (!fragments.length) {
    return `<div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>`;
  }
  return `<div class="cutlist-order-column">${fragments
    .map((fragment) => renderTrimFlowFragment(fragment, hasGroup, mode))
    .join('')}</div>`;
}

function renderTrimFlowPage(columns, hasGroup, mode = 'print') {
  // Station: only emit filled columns; CSS sizes width to cols/3 of the monitor.
  const cols =
    mode === 'station' ? columns.filter((fragments) => fragments.length) : columns;
  const used = cols.length ? cols : columns;
  const colStyle =
    mode === 'station' && used.length
      ? ` style="--station-flow-cols:${used.length}"`
      : '';
  return `<div class="cutlist-print-columns"${colStyle}>${used
    .map((fragments) => renderTrimFlowColumn(fragments, hasGroup, mode))
    .join('')}</div>`;
}

function buildTrimSectionTitleHtml(section, batch, colIndices, anySpecial) {
  const specialMark =
    section.special && anySpecial ? ' <span class="cutlist-order-special">★ SPECIAL</span>' : '';
  const boxSummary = formatOrderCutListBoxSummary(section.order, batch, colIndices);
  const boxMark = boxSummary ? ` · ${escapeHTML(boxSummary)}` : '';
  return `Order ${escapeHTML(section.order)}${boxMark}${specialMark}`;
}

function buildTrimSectionContTitleHtml(section) {
  return `Order ${escapeHTML(section.order)} <span class="cutlist-order-cont">(cont.)</span>`;
}

function renderTrimFlowBody(
  sections,
  batch,
  colIndices,
  hasGroup,
  anySpecial,
  colCount,
  rowsPerColumn = PRINT_ROWS_PER_COLUMN,
  mode = 'print'
) {
  if (!sections.length) {
    const emptyTable = `<div class="cutlist-order-column">
        <div class="cutlist-order-fragment">
          <table class="cutlist-table cutlist-table--flow" cellspacing="0">
            ${renderTrimTableHead(hasGroup)}
            <tbody>
              <tr><td colspan="${colCount}" class="cutlist-cell-empty" style="padding:1rem;">No trim-list rows available.</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
    if (mode === 'station') {
      return `<div class="cutlist-print-columns" style="--station-flow-cols:1">${emptyTable}</div>`;
    }
    return `<div class="cutlist-print-columns">
      ${emptyTable}
      <div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>
      <div class="cutlist-order-column cutlist-order-column--empty" aria-hidden="true"></div>
    </div>`;
  }

  const titled = sections.map((section) => ({
    ...section,
    titleHtml: buildTrimSectionTitleHtml(section, batch, colIndices, anySpecial),
    contTitleHtml: buildTrimSectionContTitleHtml(section),
  }));
  const pages =
    mode === 'station'
      ? packStationBalancedFlow(titled)
      : packCutListPrintFlow(titled, { rowsPerColumn });

  return pages.map((columns) => renderTrimFlowPage(columns, hasGroup, mode)).join('');
}

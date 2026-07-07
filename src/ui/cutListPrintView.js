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

function flowGridClass(hasGroup) {
  return hasGroup ? 'cutlist-flow-grid cutlist-flow-grid--group' : 'cutlist-flow-grid';
}

function renderCutListFlowHeader(hasGroup) {
  return `
    <div class="${flowGridClass(hasGroup)} cutlist-flow-header">
      ${hasGroup ? '<span class="cutlist-flow-cell cutlist-flow-head">Grp</span>' : ''}
      <span class="cutlist-flow-cell cutlist-flow-head">W</span>
      <span class="cutlist-flow-cell cutlist-flow-head">F / B</span>
      <span class="cutlist-flow-cell cutlist-flow-head">L / R</span>
      <span class="cutlist-flow-cell cutlist-flow-head">Bx</span>
      <span class="cutlist-flow-cell cutlist-flow-head">Pcs</span>
      <span class="cutlist-flow-cell cutlist-flow-head cutlist-flow-check" aria-hidden="true"></span>
    </div>`;
}

function renderCutListFlowRow(r, hasGroup, altClass) {
  return `
    <div class="${flowGridClass(hasGroup)} cutlist-flow-row${altClass}">
      ${hasGroup ? `<span class="cutlist-flow-cell cutlist-group${r.special ? ' cutlist-group-special' : ''}">${escapeHTML(r.groupId || '')}${r.special ? ' <span class="cutlist-group-star">★</span>' : ''}</span>` : ''}
      <span class="cutlist-flow-cell cutlist-dim">${escapeHTML(r.width)}"</span>
      <span class="cutlist-flow-cell cutlist-dim">${r.fbLength ? `<b>${escapeHTML(r.fbLength)}"</b>` : ''}</span>
      <span class="cutlist-flow-cell cutlist-dim">${r.lrLength ? `<b>${escapeHTML(r.lrLength)}"</b>` : ''}</span>
      <span class="cutlist-flow-cell cutlist-qty"><b>${r.boxes}</b></span>
      <span class="cutlist-flow-cell cutlist-qty"><b>${r.parts}</b></span>
      <span class="cutlist-flow-cell cutlist-check"><span class="print-check" aria-hidden="true"></span></span>
    </div>`;
}

function renderCutListFlowRows(rows, hasGroup) {
  let rowOrdinal = 0;
  let html = '';
  rows.forEach((r) => {
    const altClass = rowOrdinal % 2 === 1 ? ' cutlist-row-alt' : '';
    rowOrdinal++;
    html += renderCutListFlowRow(r, hasGroup, altClass);
  });
  return html;
}

function renderCutListOrderBlock(section, batch, colIndices, hasGroup, anySpecial, printColumns) {
  const specialMark = section.special && anySpecial ? ' <span class="cutlist-order-special">★ SPECIAL</span>' : '';
  const boxSummary = formatOrderCutListBoxSummary(section.order, batch, colIndices);
  const boxMark = boxSummary ? ` · ${escapeHTML(boxSummary)}` : '';

  return `
    <div class="cutlist-order-block">
      <div class="cutlist-order-title">Order ${escapeHTML(section.order)}${boxMark}${specialMark}</div>
      ${renderCutListFlowHeader(hasGroup)}
      <div class="cutlist-order-flow" style="--cutlist-print-cols: ${printColumns}">
        ${renderCutListFlowRows(section.rows, hasGroup)}
      </div>
    </div>`;
}

function renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, printColumns) {
  if (!sections.length) {
    return `<div class="cutlist-order-block">
      ${renderCutListFlowHeader(hasGroup)}
      <div class="cutlist-order-flow" style="--cutlist-print-cols: 1">
        <div class="${flowGridClass(hasGroup)} cutlist-flow-row">
          <span class="cutlist-flow-cell cutlist-cell-empty" style="grid-column: 1 / -1;">No cut-list rows available.</span>
        </div>
      </div>
    </div>`;
  }

  return sections
    .map((section) =>
      renderCutListOrderBlock(section, batch, colIndices, hasGroup, anySpecial, printColumns)
    )
    .join('');
}

export const PRINT_CUTLIST_COLUMNS = 4;
export const PRINT_ALL_CUTLIST_COLUMNS = 3;

export function buildCutListPrintCard(batchKey, batch, colIndices, position = null, printColumns = PRINT_CUTLIST_COLUMNS) {
  const headerBanner = buildPrintHeaderBanner(batchKey, batch, colIndices, position);
  const sections = getCutListPrintSections(batch, colIndices);
  const hasGroup = colIndices.groupId !== -1;
  const anySpecial = sections.some((s) => s.special);

  return `<div class="cutlist-print-sheet">${headerBanner}<div class="cutlist-print-flow">${renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, printColumns)}</div></div>`;
}

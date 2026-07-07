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

function renderCutListOrderTitleRow(section, batch, colIndices, hasGroup, anySpecial, colCount) {
  const specialMark = section.special && anySpecial ? ' <span class="cutlist-order-special">★ SPECIAL</span>' : '';
  const boxSummary = formatOrderCutListBoxSummary(section.order, batch, colIndices);
  const boxMark = boxSummary ? ` · ${escapeHTML(boxSummary)}` : '';
  return `
      <tr class="cutlist-order-title-row">
        <td colspan="${colCount}">Order ${escapeHTML(section.order)}${boxMark}${specialMark}</td>
      </tr>`;
}

function renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, colCount) {
  if (!sections.length) {
    return `<table class="cutlist-table cutlist-table--flow" cellspacing="0">
      ${renderCutListTableHead(hasGroup)}
      <tbody>
        <tr><td colspan="${colCount}" class="cutlist-cell-empty" style="padding:1rem;">No cut-list rows available.</td></tr>
      </tbody>
    </table>`;
  }

  let rowOrdinal = 0;
  let bodyRows = '';

  sections.forEach((section) => {
    bodyRows += renderCutListOrderTitleRow(
      section,
      batch,
      colIndices,
      hasGroup,
      anySpecial,
      colCount
    );
    section.rows.forEach((r) => {
      const altClass = rowOrdinal % 2 === 1 ? ' cutlist-row-alt' : '';
      rowOrdinal++;
      bodyRows += renderCutListDataRow(r, hasGroup, altClass);
    });
  });

  return `<table class="cutlist-table cutlist-table--flow" cellspacing="0">
    ${renderCutListTableHead(hasGroup)}
    <tbody>${bodyRows}</tbody>
  </table>`;
}

export function buildCutListPrintCard(batchKey, batch, colIndices, position = null) {
  const headerBanner = buildPrintHeaderBanner(batchKey, batch, colIndices, position);
  const sections = getCutListPrintSections(batch, colIndices);
  const hasGroup = colIndices.groupId !== -1;
  const anySpecial = sections.some((s) => s.special);
  const colCount = 6 + (hasGroup ? 1 : 0);

  return `<div class="cutlist-print-sheet">${headerBanner}<div class="cutlist-print-flow">${renderCutListFlowBody(sections, batch, colIndices, hasGroup, anySpecial, colCount)}</div></div>`;
}

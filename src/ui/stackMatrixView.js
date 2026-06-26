import { escapeHTML } from '../logic/csv.js';
import { formatDecimalForDisplay, roundWidthUpToWhole } from '../logic/widths.js';
import {
  getStackMatrixSections,
  getStackItemWItems,
  splitSectionForPrint,
} from '../logic/stackMatrix.js';
import { getExportMaterialName } from '../logic/materialNames.js';
import { formatShipDateLabel } from '../logic/shipDate.js';
import { formatOrderGroupBoxLabel } from '../logic/groupBoxes.js';

let checkboxIdCounter = 0;
export function resetCheckboxCounter() {
  checkboxIdCounter = 0;
}

function formatOrderHeading(order, batch, colIndices, printMode = false) {
  if (!printMode) {
    return `Order ${order}`;
  }
  const groupQty = formatOrderGroupBoxLabel(order, batch, colIndices);
  return `${order} ${groupQty}`;
}

function formatPrintBatchOrders(batch, colIndices) {
  const orders = batch?.sortedOrders || [];
  if (!orders.length) return '';
  return orders
    .map((o) => {
      const order = String(o).trim();
      const groupQty = formatOrderGroupBoxLabel(order, batch, colIndices);
      return escapeHTML(`${order} ${groupQty}`);
    })
    .join(' · ');
}

function getOrderBoxesForStackWidth(batch, order, stackWidth) {
  if (!batch?.heightOrderBoxes) return 0;
  const target = String(stackWidth);
  return Object.keys(batch.heightOrderBoxes).reduce((sum, height) => {
    if (roundWidthUpToWhole(height) !== target) return sum;
    return sum + (batch.heightOrderBoxes[height]?.[order] ?? 0);
  }, 0);
}

function formatWidthHeader(widthGroup, batch, order, printMode = false) {
  const label = `Width ${escapeHTML(formatDecimalForDisplay(widthGroup.width))}"`;
  if (!printMode || !batch?.heightOrderBoxes || !order) {
    return `<span>${label}</span>`;
  }
  const boxes = getOrderBoxesForStackWidth(batch, order, widthGroup.width);
  return `<span>${label} · ${boxes} bx</span>`;
}

function formatStackCell(item, printMode, roundedWidth) {
  if (!item) {
    return `<span class="stack-cell-empty">-</span>`;
  }
  const wItems = getStackItemWItems(item, roundedWidth);
  const wNote = wItems.length
    ? `<div class="w-note">${wItems.map((w) => `W: ${escapeHTML(w.value)} (${w.qty})`).join('<br>')}</div>`
    : '';
  if (printMode) {
    return `<div><b>${escapeHTML(formatDecimalForDisplay(item.length))}"</b> x${item.qty}</div>${wNote}`;
  }
  return `<div class="stack-cell"><b>${escapeHTML(formatDecimalForDisplay(item.length))}"</b> <span class="qty-label">Qty</span> <b>${item.qty}</b></div>${wNote}`;
}

/**
 * Render the interactive stack matrix tbody HTML for the current batch.
 * Uses data-tsr-toggle so main.js can attach a single delegated listener instead
 * of inline onclick attributes (no global window function needed).
 */
export function renderStackMatrixRows(batch, colIndices, printMode = false) {
  const sections = getStackMatrixSections(batch, colIndices);
  let html = '';

  sections.forEach((section) => {
    html += `
      <tr class="pivot-header-row">
        <td colspan="3">${escapeHTML(formatOrderHeading(section.order, batch, colIndices, printMode))}</td>
      </tr>
    `;

    section.widths.forEach((widthGroup) => {
      html += `
        <tr class="pivot-width-row">
          <td colspan="3">${formatWidthHeader(widthGroup, batch, section.order, printMode)}</td>
        </tr>
      `;

      const rowCount = Math.max(widthGroup.frontBack.length, widthGroup.sides.length);
      for (let i = 0; i < rowCount; i++) {
        checkboxIdCounter++;
        const rowId = `stack-row-${checkboxIdCounter}`;
        html += `
          <tr id="${rowId}" data-stack-row>
            <td class="stack-seq">
              <input type="checkbox" class="check-box" data-toggle-row="${rowId}" />
              <span>S${String(i + 1).padStart(3, '0')}</span>
            </td>
            <td>${formatStackCell(widthGroup.frontBack[i], printMode, widthGroup.width)}</td>
            <td>${formatStackCell(widthGroup.sides[i], printMode, widthGroup.width)}</td>
          </tr>
        `;
      }
    });
  });

  if (!html) {
    html = `<tr><td colspan="3" class="stack-cell-empty" style="padding:1rem;">No stack matrix rows available.</td></tr>`;
  }
  return html;
}

function renderPrintOrderCard(section, chunk, chunkIndex, chunkCount, batch, colIndices) {
  const baseLabel = formatOrderHeading(section.order, batch, colIndices, true);
  const orderLabel =
    chunkCount > 1
      ? chunkIndex === 0
        ? `${baseLabel} (1 of ${chunkCount})`
        : `${baseLabel} — continued (${chunkIndex + 1} of ${chunkCount})`
      : baseLabel;
  const continuedClass = chunkIndex > 0 ? ' stack-order-card--continued' : '';
  let seq = chunk.startSeq;
  let html = `
    <div class="stack-order-card${continuedClass}">
      <table class="stack-order-table" cellpadding="4" cellspacing="0">
        <thead>
          <tr><th colspan="3" class="stack-order-title">${escapeHTML(orderLabel)}</th></tr>
          <tr class="stack-order-columns-row">
            <th class="seq-col">Seq</th>
            <th>Front / Back</th>
            <th>Left / Right</th>
          </tr>
        </thead>
        <tbody>
  `;

  let rowOrdinal = 0;
  chunk.widthGroups.forEach((widthGroup) => {
    html += `
      <tr><td colspan="3" class="stack-width-row">${formatWidthHeader(widthGroup, batch, section.order, true)}</td></tr>
    `;
    const rowCount = Math.max(widthGroup.frontBack.length, widthGroup.sides.length);
    for (let i = 0; i < rowCount; i++) {
      const altClass = rowOrdinal % 2 === 1 ? ' stack-row-alt' : '';
      rowOrdinal++;
      html += `
        <tr class="stack-data-row${altClass}">
          <td class="stack-seq">
            <span class="print-check" aria-hidden="true"></span>
            <span>S${String(seq).padStart(3, '0')}</span>
          </td>
          <td>${formatStackCell(widthGroup.frontBack[i], true, widthGroup.width)}</td>
          <td>${formatStackCell(widthGroup.sides[i], true, widthGroup.width)}</td>
        </tr>
      `;
      seq++;
    }
  });

  html += `</tbody></table></div>`;
  return html;
}

export function renderStackMatrixOrderCards(batch, colIndices) {
  const sections = getStackMatrixSections(batch, colIndices);
  const cards = [];
  sections.forEach((section) => {
    const chunks = splitSectionForPrint(section);
    chunks.forEach((chunk, idx) => {
      cards.push(renderPrintOrderCard(section, chunk, idx, chunks.length, batch, colIndices));
    });
  });
  return sections.length
    ? `<div class="stack-card-grid">${cards.join('')}</div>`
    : `<div class="stack-cell-empty" style="padding:1rem;">No stack matrix rows available.</div>`;
}

export function buildCompactPrintCard(batchKey, batch, colIndices, position = null) {
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
  const shipDateLabel = formatShipDateLabel(batch.shipDate, colIndices);
  const shipDateChip = shipDateLabel
    ? `
        <div class="print-meta-chip">
          <div class="print-meta-label">Ship Date</div>
          <div><b>${escapeHTML(shipDateLabel)}</b></div>
        </div>`
    : '';

  const headerBanner = `
    <div class="print-batch-header">
      <div class="print-batch-header-row">
        <div class="print-batch-title">
          ${safeBatchKey}.csv${batchTag}
          <span class="print-batch-boxes-total">${batch.totalBoxes} Boxes</span>
          <span class="print-batch-orders-list">${formatPrintBatchOrders(batch, colIndices)}</span>
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

  // Full banner once at the top; each order card shows order + GroupID box counts only.
  return `${headerBanner}${renderStackMatrixOrderCards(batch, colIndices)}`;
}

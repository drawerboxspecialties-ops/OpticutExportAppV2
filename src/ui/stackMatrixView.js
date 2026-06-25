import { escapeHTML } from '../logic/csv.js';
import { formatDecimalForDisplay } from '../logic/widths.js';
import {
  getStackMatrixSections,
  getStackItemWItems,
  formatWidthQtyNote,
  splitSectionForPrint,
} from '../logic/stackMatrix.js';
import { getExportMaterialName } from '../logic/materialNames.js';

let checkboxIdCounter = 0;
export function resetCheckboxCounter() {
  checkboxIdCounter = 0;
}

function formatWidthHeader(widthGroup) {
  return `<span>Width ${escapeHTML(formatDecimalForDisplay(widthGroup.width))}"</span>`;
}

function formatStackCell(item, printMode, roundedWidth, onToggleFnName) {
  if (!item) {
    return `<span class="stack-cell-empty">-</span>`;
  }
  const wItems = getStackItemWItems(item, roundedWidth);
  const wNote = wItems.length
    ? `<div class="w-note">${wItems.map((w) => `W: ${escapeHTML(w.value)} (${w.qty})`).join('<br>')}</div>`
    : '';
  const onToggle = onToggleFnName ? `onclick="${onToggleFnName}(this, '${'__rowId__'}')"` : '';
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
        <td colspan="3">Order ${escapeHTML(section.order)}</td>
      </tr>
    `;

    section.widths.forEach((widthGroup) => {
      html += `
        <tr class="pivot-width-row">
          <td colspan="3">${formatWidthHeader(widthGroup)}</td>
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

function renderPrintOrderCard(section, chunk, chunkIndex, chunkCount) {
  const orderLabel =
    chunkCount > 1
      ? `Order ${section.order} ${chunkIndex === 0 ? '(1 of ' + chunkCount + ')' : 'Continued (' + (chunkIndex + 1) + ' of ' + chunkCount + ')'}`
      : `Order ${section.order}`;
  let seq = chunk.startSeq;
  let html = `
    <div class="stack-order-card">
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
      <tr><td colspan="3" class="stack-width-row">${formatWidthHeader(widthGroup)}</td></tr>
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
      cards.push(renderPrintOrderCard(section, chunk, idx, chunks.length));
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

  const headerBanner = `
    <div class="print-batch-header">
      <div class="print-batch-header-row">
        <div class="print-batch-title">${safeBatchKey}.csv${batchTag}</div>
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
        <div class="print-batch-stats">
          <div class="print-stat-chip">
            <div class="print-meta-label">Boxes</div>
            <div class="print-stat-val">${batch.totalBoxes}</div>
          </div>
          <div class="print-stat-chip">
            <div class="print-meta-label">Parts</div>
            <div class="print-stat-val">${batch.totalParts}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // A table wrapper lets the batch header (thead) repeat at the top of every
  // printed page when a batch spans multiple pages.
  return `
    <table class="print-batch-sheet">
      <thead>
        <tr><td class="print-batch-head-cell">${headerBanner}</td></tr>
      </thead>
      <tbody>
        <tr><td class="print-batch-body-cell">${renderStackMatrixOrderCards(batch, colIndices)}</td></tr>
      </tbody>
    </table>
  `;
}

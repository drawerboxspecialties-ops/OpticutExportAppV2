import { escapeHTML, escapeAttr } from '../logic/csv.js';
import { getExportMaterialName } from '../logic/materialNames.js';
import { formatShipDateLabel } from '../logic/shipDate.js';
import { getTrimListPrintSections, trimListRowId } from '../logic/trimListPrint.js';
import { DFM_MARK } from '../logic/cutListPrint.js';
import { buildCode128Svg } from '../logic/code128.js';

/**
 * Station / print HTML for the trim-saw list.
 * Shows actual F/B and L/R part W (never rounded) with matching lengths.
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
  const material = batch?.materialName
    ? escapeHTML(getExportMaterialName(batch.materialName))
    : '—';
  const topEdge = batch?.topEdge ? escapeHTML(batch.topEdge) : '—';
  const shipDateLabel = formatShipDateLabel(batch?.shipDate, colIndices);
  const barcodeSvg = buildCode128Svg(batchKey, {
    height: 36,
    moduleWidth: 1.25,
    includeLabel: false,
  });

  const body = sections.length
    ? sections
        .map((section) => {
          const special = section.special
            ? ' <span class="cutlist-order-special">★ SPECIAL</span>'
            : '';
          const rowsHtml = section.rows
            .map((r, i) => {
              const alt = i % 2 === 1 ? ' cutlist-row-alt' : '';
              const needs = r.needsTrim ? ' trim-row-needs' : '';
              const dfm = r.dfm
                ? `<span class="cutlist-dfm-mark">${escapeHTML(DFM_MARK)}</span>`
                : '';
              const groupCell = hasGroup
                ? `<td class="cutlist-group${r.special ? ' cutlist-group-special' : ''}"><span class="cutlist-group-id">${escapeHTML(r.groupId || '')}${r.special ? ' <span class="cutlist-group-star">★</span>' : ''}</span>${dfm}</td>`
                : '';
              const rowId = trimListRowId({ ...r, order: section.order });
              const checkCell =
                mode === 'station'
                  ? `<td class="cutlist-check"><input type="checkbox" class="station-check" data-row-id="${escapeAttr(rowId)}" aria-label="Mark trim line complete"></td>`
                  : `<td class="cutlist-check"><span class="print-check" aria-hidden="true"></span></td>`;
              return `
          <tr class="cutlist-data-row${alt}${needs}"${mode === 'station' ? ` data-row-id="${escapeAttr(rowId)}"` : ''}>
            ${groupCell}
            <td class="cutlist-dim trim-fb-w"><b>${r.fbW ? `${escapeHTML(r.fbW)}"` : ''}</b></td>
            <td class="cutlist-dim">${r.fbLength ? `<b>${escapeHTML(r.fbLength)}"</b>` : ''}</td>
            <td class="cutlist-dim trim-lr-w"><b>${r.lrW ? `${escapeHTML(r.lrW)}"` : ''}</b></td>
            <td class="cutlist-dim">${r.lrLength ? `<b>${escapeHTML(r.lrLength)}"</b>` : ''}</td>
            <td class="cutlist-qty"><b>${r.parts}</b></td>
            ${checkCell}
          </tr>`;
            })
            .join('');

          return `
      <div class="cutlist-order-fragment trim-order-block">
        <div class="cutlist-order-title">Order ${escapeHTML(section.order)}${special}</div>
        <table class="cutlist-table cutlist-table--flow trim-table" cellspacing="0">
          <thead>
            <tr class="cutlist-columns-row">
              ${hasGroup ? '<th>Grp</th>' : ''}
              <th>F/B W</th>
              <th>F / B</th>
              <th>L/R W</th>
              <th>L / R</th>
              <th>Pcs</th>
              <th class="cutlist-check-col" aria-label="Check"></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
        })
        .join('')
    : `<p class="trim-list-empty">No trim lines in this batch.</p>`;

  return `
    <div class="cutlist-print-sheet trim-list-sheet"${mode === 'station' ? ' data-station-sheet="1" data-trim-sheet="1"' : ''}>
      <div class="print-batch-header">
        <div class="print-batch-header-row">
          <div>
            <div class="print-batch-title">Trim list · ${escapeHTML(batchKey)}</div>
            <div class="print-batch-meta">${material} · ${topEdge}${
              shipDateLabel ? ` · ${escapeHTML(shipDateLabel)}` : ''
            } · ${Number(batch?.totalBoxes) || 0} boxes</div>
          </div>
          <div class="print-batch-header-aside">
            ${barcodeSvg || ''}
          </div>
        </div>
      </div>
      <div class="cutlist-print-flow trim-list-flow">${body}</div>
    </div>`;
}

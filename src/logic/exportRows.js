import { getExportMaterialName } from './materialNames.js';
import { roundWidthUpToWhole, formatDecimalForDisplay } from './widths.js';
import { formatWidthQtyNote } from './stackMatrix.js';

/**
 * Build a base export row: clean material name, optionally round Width up,
 * blank W, blank Label. Returns a new array (does not mutate input).
 *
 * @param {string[]} row
 * @param {object} colIndices
 * @param {boolean} roundWidth
 * @returns {string[]}
 */
export function prepareBaseExportRow(row, colIndices, roundWidth = false) {
  const exportRow = [...row];
  if (colIndices.materialName !== -1 && colIndices.materialName < exportRow.length) {
    exportRow[colIndices.materialName] = getExportMaterialName(exportRow[colIndices.materialName]);
  }
  if (roundWidth && colIndices.width !== -1 && colIndices.width < exportRow.length) {
    exportRow[colIndices.width] = roundWidthUpToWhole(exportRow[colIndices.width]);
  }
  if (colIndices.w !== -1 && colIndices.w < exportRow.length) {
    exportRow[colIndices.w] = '';
  }
  if (colIndices.label !== -1 && colIndices.label < exportRow.length) {
    exportRow[colIndices.label] = '';
  }
  return exportRow;
}

/**
 * Merge key for rounded-width export: all columns except Quantity and Label.
 * @param {string[]} exportRow
 * @param {object} colIndices
 * @returns {string}
 */
export function getRoundedExportMergeKey(exportRow, colIndices) {
  return exportRow
    .map((value, idx) => {
      if (idx === colIndices.quantity || idx === colIndices.label) return '';
      return String(value ?? '').trim();
    })
    .join('|');
}

function addCountToMap(map, key, qty) {
  if (!key) return;
  map[key] = (map[key] || 0) + qty;
}

/**
 * Build the cut-list rows for export.
 *
 * When roundExportWidths is true:
 *   - round Width up to whole numbers
 *   - merge rows that become identical (all columns except Qty/Label)
 *   - sum quantities
 *   - record original width quantities in Label as "Rounded from Width: <w> x<n>, ..."
 *     only when the original widths differ from the rounded width.
 *
 * When false: just prepare each row (clean material, blank W, blank Label).
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @param {boolean} roundExportWidths
 * @returns {string[][]}
 */
export function getCutListRowsForExport(rows, colIndices, roundExportWidths) {
  if (colIndices.materialName === -1) return rows;

  if (roundExportWidths && colIndices.width !== -1) {
    const merged = {};
    rows.forEach((row) => {
      const exportRow = prepareBaseExportRow(row, colIndices, true);
      const key = getRoundedExportMergeKey(exportRow, colIndices);
      const qty = parseInt(row[colIndices.quantity]) || 0;
      const originalWidth =
        colIndices.width !== -1 && colIndices.width < row.length
          ? String(row[colIndices.width] || '').trim()
          : '';

      if (!merged[key]) {
        merged[key] = { row: exportRow, qty: 0, originalWidths: {} };
      }
      merged[key].qty += qty;
      addCountToMap(merged[key].originalWidths, originalWidth, qty);
    });

    return Object.values(merged).map((group) => {
      const exportRow = group.row;
      if (colIndices.quantity !== -1 && colIndices.quantity < exportRow.length) {
        exportRow[colIndices.quantity] = String(group.qty);
      }
      if (colIndices.label !== -1 && colIndices.label < exportRow.length) {
        const roundedWidth =
          colIndices.width !== -1 && colIndices.width < exportRow.length
            ? formatDecimalForDisplay(exportRow[colIndices.width])
            : '';
        const originalWidths = Object.keys(group.originalWidths).map(formatDecimalForDisplay);
        const changed =
          originalWidths.length > 1 ||
          originalWidths.some((width) => width && width !== roundedWidth);
        exportRow[colIndices.label] = changed
          ? `Rounded from Width: ${formatWidthQtyNote(group.originalWidths)}`
          : '';
      }
      return exportRow;
    });
  }

  return rows.map((row) => prepareBaseExportRow(row, colIndices, false));
}

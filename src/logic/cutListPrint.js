import { getStackType } from './stackMatrix.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialOrderNumbers } from './specialOrders.js';

/**
 * Build flat cut-list rows for the print-only "Cut List" sheet.
 *
 * One row per cut line; identical lines (same order, GroupID, stack type, width,
 * length) are merged with quantities summed. Rows are sorted by order number
 * (ascending), then drawer width (descending), then length (descending).
 *
 * Uses the batch's pre-merge `sourceRows` when present so GroupID is accurate
 * (the export-merged `rows` can blend two GroupIDs into one line).
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @param {object} colIndices
 * @returns {Array<{
 *   order: string, groupId: string, stackType: 'FB'|'LR',
 *   width: string, length: string, qty: number, special: boolean
 * }>}
 */
export function getCutListPrintRows(batch, colIndices) {
  const rows = batch?.sourceRows?.length ? batch.sourceRows : batch?.rows || [];
  if (!rows.length || !colIndices) return [];

  const specialOrders = getSpecialOrderNumbers(rows, colIndices);
  const hasGroupId = colIndices.groupId !== -1;
  const map = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const stackType = getStackType(row, colIndices);
    const length = formatDecimalForDisplay(String(row[colIndices.length] ?? '').trim());
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!stackType || !length || qty <= 0) return;

    const width = formatDecimalForDisplay(getStackMatrixWidth(row, colIndices));
    const groupId =
      hasGroupId && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const key = `${order}|${groupId}|${stackType}|${width}|${length}`;

    if (!map.has(key)) {
      map.set(key, {
        order,
        groupId,
        stackType,
        width,
        length,
        widthSort: getFractionalSortValue(width),
        lengthSort: getFractionalSortValue(length),
        qty: 0,
        special: specialOrders.has(order),
      });
    }
    map.get(key).qty += qty;
  });

  const list = Array.from(map.values());
  list.sort((a, b) => {
    const orderA = getNumericSortValue(a.order);
    const orderB = getNumericSortValue(b.order);
    if (orderA !== orderB) return orderA - orderB;
    if (a.order !== b.order) return a.order.localeCompare(b.order);
    if (b.widthSort !== a.widthSort) return b.widthSort - a.widthSort;
    if (b.lengthSort !== a.lengthSort) return b.lengthSort - a.lengthSort;
    if (a.stackType !== b.stackType) return a.stackType.localeCompare(b.stackType);
    return getNumericSortValue(a.groupId) - getNumericSortValue(b.groupId);
  });

  return list.map(({ widthSort: _widthSort, lengthSort: _lengthSort, ...row }) => row);
}

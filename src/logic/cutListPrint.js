import { getStackType } from './stackMatrix.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialOrderNumbers } from './specialOrders.js';

/**
 * Build cut-list print sections grouped by order.
 *
 * Within each order, rows pair Front/Back and Left/Right on the same line when
 * they share order + GroupID + stack-matrix width (same box group). Identical
 * source lines merge first (F+B qty summed, L+R qty summed).
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @param {object} colIndices
 * @returns {Array<{
 *   order: string, special: boolean,
 *   rows: Array<{
 *     width: string, fbLength: string, lrLength: string,
 *     qty: number, groupId: string, special: boolean
 *   }>
 * }>}
 */
export function getCutListPrintSections(batch, colIndices) {
  const rows = batch?.sourceRows?.length ? batch.sourceRows : batch?.rows || [];
  if (!rows.length || !colIndices) return [];

  const specialOrders = getSpecialOrderNumbers(rows, colIndices);
  const hasGroupId = colIndices.groupId !== -1;
  const lineMap = new Map();

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

    if (!lineMap.has(key)) {
      lineMap.set(key, {
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
    lineMap.get(key).qty += qty;
  });

  const boxMap = new Map();
  lineMap.forEach((line) => {
    const boxKey = `${line.order}|${line.groupId}|${line.width}`;
    if (!boxMap.has(boxKey)) {
      boxMap.set(boxKey, {
        order: line.order,
        groupId: line.groupId,
        width: line.width,
        widthSort: line.widthSort,
        special: line.special,
        fb: [],
        lr: [],
      });
    }
    const box = boxMap.get(boxKey);
    const item = { length: line.length, lengthSort: line.lengthSort, qty: line.qty };
    if (line.stackType === 'FB') box.fb.push(item);
    else box.lr.push(item);
  });

  const boxRows = [];
  boxMap.forEach((box) => {
    box.fb.sort((a, b) => b.lengthSort - a.lengthSort);
    box.lr.sort((a, b) => b.lengthSort - a.lengthSort);
    const rowCount = Math.max(box.fb.length, box.lr.length);
    for (let i = 0; i < rowCount; i++) {
      const fb = box.fb[i];
      const lr = box.lr[i];
      if (!fb && !lr) continue;
      const qty =
        fb && lr ? Math.max(fb.qty, lr.qty) : fb ? fb.qty : lr.qty;
      boxRows.push({
        order: box.order,
        groupId: box.groupId,
        width: box.width,
        widthSort: box.widthSort,
        fbLength: fb?.length ?? '',
        lrLength: lr?.length ?? '',
        fbLengthSort: fb?.lengthSort ?? 0,
        lrLengthSort: lr?.lengthSort ?? 0,
        qty,
        special: box.special,
      });
    }
  });

  boxRows.sort((a, b) => {
    const orderA = getNumericSortValue(a.order);
    const orderB = getNumericSortValue(b.order);
    if (orderA !== orderB) return orderA - orderB;
    if (a.order !== b.order) return a.order.localeCompare(b.order);
    if (b.widthSort !== a.widthSort) return b.widthSort - a.widthSort;
    if (b.fbLengthSort !== a.fbLengthSort) return b.fbLengthSort - a.fbLengthSort;
    if (b.lrLengthSort !== a.lrLengthSort) return b.lrLengthSort - a.lrLengthSort;
    return getNumericSortValue(a.groupId) - getNumericSortValue(b.groupId);
  });

  const sections = [];
  boxRows.forEach((row) => {
    const last = sections[sections.length - 1];
    if (!last || last.order !== row.order) {
      sections.push({ order: row.order, special: row.special, rows: [] });
    }
    sections[sections.length - 1].rows.push({
      width: row.width,
      fbLength: row.fbLength,
      lrLength: row.lrLength,
      qty: row.qty,
      groupId: row.groupId,
      special: row.special,
    });
  });

  return sections;
}

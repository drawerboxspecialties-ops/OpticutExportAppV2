import { getStackType } from './stackMatrix.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialOrderNumbers } from './specialOrders.js';

/**
 * Resolve the box-row key: one row of boxes = order + drawer set + stack-matrix width.
 * GroupID (or Label) identifies the drawer set; stack width separates each height row
 * so front/back pairs only with left/right from the same box row.
 */
function boxGroupKey(order, groupId, label, stackWidth) {
  if (groupId) return `${order}|g:${groupId}|w:${stackWidth}`;
  if (label) return `${order}|l:${label}|w:${stackWidth}`;
  return `${order}|w:${stackWidth}`;
}

/**
 * Build cut-list print sections grouped by order.
 *
 * Within each order, front/back and left/right pair on the same print row when they
 * belong to the same box row: order + GroupID (or Label) + stack-matrix width.
 * Multiple lengths at that width pair by length order (longest first), like the stack matrix.
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
  const hasLabel = colIndices.label !== -1;
  const lineMap = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const stackType = getStackType(row, colIndices);
    const length = formatDecimalForDisplay(String(row[colIndices.length] ?? '').trim());
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!stackType || !length || qty <= 0) return;

    const stackWidth = formatDecimalForDisplay(getStackMatrixWidth(row, colIndices));
    const groupId =
      hasGroupId && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const label =
      hasLabel && colIndices.label < row.length
        ? String(row[colIndices.label] ?? '').trim()
        : '';
    const side = stackType === 'FB' ? 'FB' : 'LR';
    const key = `${boxGroupKey(order, groupId, label, stackWidth)}|${side}|${length}`;

    if (!lineMap.has(key)) {
      lineMap.set(key, {
        order,
        groupId,
        label,
        stackWidth,
        side,
        length,
        stackWidthSort: getFractionalSortValue(stackWidth),
        lengthSort: getFractionalSortValue(length),
        qty: 0,
        special: specialOrders.has(order),
      });
    }
    lineMap.get(key).qty += qty;
  });

  const boxMap = new Map();
  lineMap.forEach((line) => {
    const key = boxGroupKey(line.order, line.groupId, line.label, line.stackWidth);
    if (!boxMap.has(key)) {
      boxMap.set(key, {
        order: line.order,
        groupId: line.groupId,
        special: line.special,
        fb: [],
        lr: [],
      });
    }
    const box = boxMap.get(key);
    const item = {
      length: line.length,
      lengthSort: line.lengthSort,
      stackWidth: line.stackWidth,
      stackWidthSort: line.stackWidthSort,
      qty: line.qty,
    };
    if (line.side === 'FB') box.fb.push(item);
    else box.lr.push(item);
  });

  const sortItems = (a, b) => {
    if (b.lengthSort !== a.lengthSort) return b.lengthSort - a.lengthSort;
    return b.stackWidthSort - a.stackWidthSort;
  };

  const boxRows = [];
  boxMap.forEach((box) => {
    box.fb.sort(sortItems);
    box.lr.sort(sortItems);
    const rowCount = Math.max(box.fb.length, box.lr.length);
    for (let i = 0; i < rowCount; i++) {
      const fb = box.fb[i];
      const lr = box.lr[i];
      if (!fb && !lr) continue;

      const widthSource = fb || lr;
      boxRows.push({
        order: box.order,
        groupId: box.groupId,
        width: widthSource.stackWidth,
        widthSort: widthSource.stackWidthSort,
        fbLength: fb?.length ?? '',
        lrLength: lr?.length ?? '',
        fbLengthSort: fb?.lengthSort ?? 0,
        lrLengthSort: lr?.lengthSort ?? 0,
        qty: fb ? fb.qty : lr.qty,
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

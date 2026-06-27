import { getStackType } from './stackMatrix.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialOrderNumbers } from './specialOrders.js';

/**
 * Resolve the box-group key used to pair front/back with left/right on one row.
 * GroupID links all parts for a drawer set; Label is the fallback when GroupID is absent.
 *
 * @param {string} order
 * @param {string} groupId
 * @param {string} label
 * @param {string} stackWidth
 * @returns {string}
 */
function boxGroupKey(order, groupId, label, stackWidth) {
  if (groupId) return `${order}|g:${groupId}`;
  if (label) return `${order}|l:${label}`;
  return `${order}|w:${stackWidth}`;
}

/**
 * Build cut-list print sections grouped by order.
 *
 * Within each order, front/back, left, and right for the same drawer set (GroupID,
 * or Label when no GroupID) share one row. Left and right are split into separate
 * columns and paired to the corresponding front/back line by length order (longest
 * first), matching the stack-matrix pairing logic at the box-group level.
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @param {object} colIndices
 * @returns {Array<{
 *   order: string, special: boolean,
 *   rows: Array<{
 *     width: string, fbLength: string, leftLength: string, rightLength: string,
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
    const side = stackType === 'FB' ? 'FB' : stackType === 'LR' ? getLeftRightSide(row, colIndices) : '';
    if (!side) return;

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
        left: [],
        right: [],
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
    else if (line.side === 'L') box.left.push(item);
    else box.right.push(item);
  });

  const sortItems = (a, b) => {
    if (b.lengthSort !== a.lengthSort) return b.lengthSort - a.lengthSort;
    return b.stackWidthSort - a.stackWidthSort;
  };

  const boxRows = [];
  boxMap.forEach((box) => {
    box.fb.sort(sortItems);
    box.left.sort(sortItems);
    box.right.sort(sortItems);
    const rowCount = Math.max(box.fb.length, box.left.length, box.right.length);
    for (let i = 0; i < rowCount; i++) {
      const fb = box.fb[i];
      const left = box.left[i];
      const right = box.right[i];
      if (!fb && !left && !right) continue;

      const widthSource = fb || left || right;
      const qtys = [fb?.qty, left?.qty, right?.qty].filter((n) => n > 0);
      boxRows.push({
        order: box.order,
        groupId: box.groupId,
        width: widthSource.stackWidth,
        widthSort: widthSource.stackWidthSort,
        fbLength: fb?.length ?? '',
        leftLength: left?.length ?? '',
        rightLength: right?.length ?? '',
        fbLengthSort: fb?.lengthSort ?? 0,
        leftLengthSort: left?.lengthSort ?? 0,
        rightLengthSort: right?.lengthSort ?? 0,
        qty: qtys.length ? Math.max(...qtys) : 0,
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
    if (b.leftLengthSort !== a.leftLengthSort) return b.leftLengthSort - a.leftLengthSort;
    if (b.rightLengthSort !== a.rightLengthSort) return b.rightLengthSort - a.rightLengthSort;
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
      leftLength: row.leftLength,
      rightLength: row.rightLength,
      qty: row.qty,
      groupId: row.groupId,
      special: row.special,
    });
  });

  return sections;
}

/**
 * @param {string[]} row
 * @param {{ partName: number }} colIndices
 * @returns {'L' | 'R' | ''}
 */
function getLeftRightSide(row, colIndices) {
  if (colIndices.partName === -1 || colIndices.partName >= row.length) return '';
  const partName = String(row[colIndices.partName] || '').trim().toUpperCase();
  if (partName.startsWith('L') || partName.includes('LEFT')) return 'L';
  if (partName.startsWith('R') || partName.includes('RIGHT')) return 'R';
  if (partName.includes('SIDE')) return 'L';
  return '';
}

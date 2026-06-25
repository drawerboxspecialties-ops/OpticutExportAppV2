import { getStackMatrixWidth, formatDecimalForDisplay, getNumericSortValue } from './widths.js';

/**
 * Determine the stack type (Front/Back vs Left/Right) for a row.
 * @param {string[]} row
 * @param {{ partName: number }} colIndices
 * @returns {'FB' | 'LR' | ''}
 */
export function getStackType(row, colIndices) {
  if (colIndices.partName === -1 || colIndices.partName >= row.length) return '';
  const partName = String(row[colIndices.partName] || '').trim().toUpperCase();
  if (
    partName.startsWith('F') ||
    partName.startsWith('B') ||
    partName.includes('FRONT') ||
    partName.includes('BACK')
  )
    return 'FB';
  if (
    partName.startsWith('L') ||
    partName.startsWith('R') ||
    partName.includes('LEFT') ||
    partName.includes('RIGHT') ||
    partName.includes('SIDE')
  )
    return 'LR';
  return '';
}

function addCountToMap(map, key, qty) {
  if (!key) return;
  map[key] = (map[key] || 0) + qty;
}

/**
 * Build the stack-matrix sections: order -> width -> { FB, LR } -> length -> { qty, wValues }.
 *
 * Width groups use the rounded-up stack matrix width (operator guidance).
 * Raw W values are tracked per length so the print sheet can show "W: 3.937 (40)"
 * notes when W differs from the rounded stack width.
 *
 * @param {{ rows: string[][] }} batch
 * @param {object} colIndices
 * @returns {Array<{ order: string, widths: Array<{ width: string, frontBack: object[], sides: object[] }> }>}
 */
export function getStackMatrixSections(batch, colIndices) {
  const orderMap = {};

  batch.rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] || 'Unknown').trim();
    const width = getStackMatrixWidth(row, colIndices);
    const rawW =
      colIndices.w !== -1 && colIndices.w < row.length ? String(row[colIndices.w] || '').trim() : '';
    const stackType = getStackType(row, colIndices);
    const length = String(row[colIndices.length] || '').trim();
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!stackType || !length || qty <= 0) return;

    if (!orderMap[order]) orderMap[order] = {};
    if (!orderMap[order][width]) orderMap[order][width] = { FB: {}, LR: {} };
    if (!orderMap[order][width][stackType][length]) {
      orderMap[order][width][stackType][length] = { qty: 0, wValues: {} };
    }
    orderMap[order][width][stackType][length].qty += qty;
    if (rawW) {
      addCountToMap(orderMap[order][width][stackType][length].wValues, rawW, qty);
    }
  });

  return Object.keys(orderMap)
    .sort()
    .map((order) => {
      const widths = Object.keys(orderMap[order])
        .sort((a, b) => getNumericSortValue(b) - getNumericSortValue(a))
        .map((width) => {
          const stacks = orderMap[order][width];
          const toItems = (stack) =>
            Object.keys(stack)
              .sort((a, b) => getNumericSortValue(b) - getNumericSortValue(a))
              .map((length) => ({ length, qty: stack[length].qty, wValues: stack[length].wValues }));
          return { width, frontBack: toItems(stacks.FB), sides: toItems(stacks.LR) };
        });
      return { order, widths };
    });
}

/**
 * Return the W-note items for a stack cell: raw W values (with quantities) that
 * differ from the rounded stack width.
 * @param {object} item
 * @param {string} roundedWidth
 * @returns {Array<{ value: string, qty: number }>}
 */
export function getStackItemWItems(item, roundedWidth) {
  if (!item) return [];
  const widthValue = formatDecimalForDisplay(roundedWidth);
  return Object.keys(item.wValues || {})
    .sort((a, b) => getNumericSortValue(b) - getNumericSortValue(a))
    .filter((w) => {
      const displayW = formatDecimalForDisplay(w);
      return displayW && displayW !== widthValue;
    })
    .map((w) => ({ value: formatDecimalForDisplay(w), qty: item.wValues[w] }));
}

/**
 * Format a width-quantity note string like "4.5 x40, 3.937 x8".
 * @param {Record<string, number>} widthQtyMap
 * @returns {string}
 */
export function formatWidthQtyNote(widthQtyMap) {
  return Object.keys(widthQtyMap)
    .sort((a, b) => getNumericSortValue(b) - getNumericSortValue(a))
    .map((width) => `${formatDecimalForDisplay(width)} x${widthQtyMap[width]}`)
    .join(', ');
}

/**
 * Estimate how many printed rows a width group will occupy, including fractional
 * weight for extra W-note lines. Used by the print packer.
 * @param {object} widthGroup
 * @returns {number}
 */
export function getPrintWidthGroupRowCount(widthGroup) {
  const rowCount = Math.max(widthGroup.frontBack.length, widthGroup.sides.length);
  let extraWRows = 0;
  for (let i = 0; i < rowCount; i++) {
    const frontBackWRows = Math.max(0, getStackItemWItems(widthGroup.frontBack[i], widthGroup.width).length - 1) * 0.35;
    const sideWRows = Math.max(0, getStackItemWItems(widthGroup.sides[i], widthGroup.width).length - 1) * 0.35;
    extraWRows += Math.max(frontBackWRows, sideWRows);
  }
  return 1 + extraWRows + rowCount;
}

/**
 * Slice a width group's frontBack/sides arrays to [start, end).
 */
export function slicePrintWidthGroup(widthGroup, start, end) {
  return {
    ...widthGroup,
    frontBack: widthGroup.frontBack.slice(start, end),
    sides: widthGroup.sides.slice(start, end),
  };
}

/**
 * Pack a single order's width groups into print cards of at most maxRowsPerCard rows.
 * Tall width groups are split into continuation cards. Returns chunks with a startSeq.
 *
 * @param {{ order: string, widths: object[] }} section
 * @param {number} maxRowsPerCard
 * @returns {Array<{ widthGroups: object[], startSeq: number }>}
 */
export function splitSectionForPrint(section, maxRowsPerCard = 24) {
  const chunks = [];
  let current = [];
  let currentRows = 0;
  let nextSeq = 1;

  const flushCurrent = () => {
    if (current.length === 0) return;
    chunks.push({ widthGroups: current, startSeq: nextSeq });
    nextSeq += current.reduce(
      (sum, group) => sum + Math.max(group.frontBack.length, group.sides.length),
      0
    );
    current = [];
    currentRows = 0;
  };

  section.widths.forEach((widthGroup) => {
    const groupRows = getPrintWidthGroupRowCount(widthGroup);
    if (groupRows > maxRowsPerCard) {
      flushCurrent();
      const maxItems = Math.max(1, maxRowsPerCard - 1);
      const itemCount = Math.max(widthGroup.frontBack.length, widthGroup.sides.length);
      for (let start = 0; start < itemCount; start += maxItems) {
        const slicedGroup = slicePrintWidthGroup(widthGroup, start, start + maxItems);
        chunks.push({ widthGroups: [slicedGroup], startSeq: nextSeq });
        nextSeq += Math.max(slicedGroup.frontBack.length, slicedGroup.sides.length);
      }
      return;
    }

    if (currentRows > 0 && currentRows + groupRows > maxRowsPerCard) {
      flushCurrent();
    }
    current.push(widthGroup);
    currentRows += groupRows;
  });

  flushCurrent();
  return chunks;
}

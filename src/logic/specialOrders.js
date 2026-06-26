/**
 * Secondary-operation columns that flag an order as "special".
 * Laser is intentionally excluded per shop rules.
 *
 * These keys correspond to optional columns detected by mapHeaders.
 */
export const SPECIAL_ORDER_COLUMN_KEYS = [
  'scoop',
  'slope',
  'dividersFB',
  'dividersSS',
  'drillFront',
  'fileSlots',
];

/**
 * A cell counts as "special" when it holds a real value, i.e. it is not blank
 * and not the literal "none" (case-insensitive).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSpecialOrderValue(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v !== '' && v !== 'none';
}

/**
 * Determine which order numbers are "special".
 *
 * If ANY row on a sales order has a special value in ANY special column, the
 * entire order is special — all of its rows batch together in SPECIAL_ groups.
 * Orders are never split between normal and special batches.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Set<string>} set of trimmed order numbers
 */
export function getSpecialOrderNumbers(rows, colIndices) {
  const special = new Set();
  if (!colIndices || colIndices.orderNumber === -1) return special;

  const laserIdx = colIndices.laser;
  const specialCols = SPECIAL_ORDER_COLUMN_KEYS.map((key) => colIndices[key]).filter(
    (idx) => typeof idx === 'number' && idx !== -1 && idx !== laserIdx
  );
  if (specialCols.length === 0) return special;

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    if (!order || special.has(order)) return;
    for (const idx of specialCols) {
      if (idx < row.length && isSpecialOrderValue(row[idx])) {
        special.add(order);
        break;
      }
    }
  });

  return special;
}

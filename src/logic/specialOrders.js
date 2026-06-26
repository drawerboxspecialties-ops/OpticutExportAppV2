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
 * Allmoxy scoop size picks (e.g. "#4     4\" x 1\"") are normal drawer config,
 * not secondary operations that require a SPECIAL batch.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCatalogScoopSpec(value) {
  const v = String(value ?? '').trim();
  return /^#\d+\s+.+x\s*.+$/i.test(v);
}

/**
 * A cell counts as "special" when it holds a real value, i.e. it is not blank
 * and not the literal "none" (case-insensitive).
 *
 * @param {unknown} value
 * @param {string} [columnKey] optional column key (e.g. "scoop") for column-specific rules
 * @returns {boolean}
 */
export function isSpecialOrderValue(value, columnKey = null) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '' || v === 'none') return false;
  if (columnKey === 'scoop' && isCatalogScoopSpec(value)) return false;
  return true;
}

/**
 * Determine which order numbers are "special": an order is special if ANY of
 * its rows has a special value in ANY of the special columns that exist.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Set<string>} set of trimmed order numbers
 */
export function getSpecialOrderNumbers(rows, colIndices) {
  const special = new Set();
  if (!colIndices || colIndices.orderNumber === -1) return special;

  const laserIdx = colIndices.laser;
  const specialCols = SPECIAL_ORDER_COLUMN_KEYS.map((key) => ({
    key,
    idx: colIndices[key],
  })).filter(({ idx }) => typeof idx === 'number' && idx !== -1 && idx !== laserIdx);
  if (specialCols.length === 0) return special;

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    if (!order || special.has(order)) return;
    for (const { key, idx } of specialCols) {
      if (idx < row.length && isSpecialOrderValue(row[idx], key)) {
        special.add(order);
        break;
      }
    }
  });

  return special;
}

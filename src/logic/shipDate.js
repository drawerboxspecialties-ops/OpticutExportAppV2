/** @param {unknown} value */
export function normalizeShipDate(value) {
  return String(value ?? '').trim();
}

/**
 * @param {string[]} row
 * @param {object} colIndices
 * @returns {string}
 */
export function getShipDateFromRow(row, colIndices) {
  if (!colIndices || colIndices.shipDate === -1 || colIndices.shipDate >= row.length) {
    return '';
  }
  return normalizeShipDate(row[colIndices.shipDate]);
}

/**
 * One ship date per order (first non-empty row wins).
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Record<string, string>}
 */
export function buildOrderShipDateMap(rows, colIndices) {
  const map = {};
  if (!colIndices || colIndices.shipDate === -1) return map;
  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const date = getShipDateFromRow(row, colIndices);
    if (!order || map[order] !== undefined) return;
    map[order] = date;
  });
  return map;
}

/**
 * Token appended to grouping keys when a Ship Date column exists.
 *
 * @param {string} order
 * @param {Record<string, string>} orderShipDates
 * @param {object} colIndices
 * @returns {string}
 */
export function shipDateGroupingToken(order, orderShipDates, colIndices) {
  if (colIndices.shipDate === -1) return '';
  const date = orderShipDates[order] ?? '';
  const label = date || 'No Ship Date';
  return `_${label.replace(/\|/g, '-')}`;
}

/**
 * Display label for batch headers and print.
 *
 * @param {string} shipDate
 * @param {object} colIndices
 * @returns {string|null}
 */
export function formatShipDateLabel(shipDate, colIndices) {
  if (colIndices.shipDate === -1) return null;
  const v = normalizeShipDate(shipDate);
  return v || 'No Ship Date';
}

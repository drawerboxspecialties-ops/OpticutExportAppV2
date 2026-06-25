/**
 * Width / W helpers.
 *
 * These encode the "Width vs W" business rule from the dev notes:
 * summary height and stack-matrix grouping use Width (the nominal drawer height),
 * never W (which can be near-size like 3.937). The stack matrix rounds Width UP
 * to a whole number for operator guidance.
 */

/**
 * Strip trailing zeros from a decimal string for display (e.g. "4.500000" -> "4.5").
 * Non-decimal strings are returned unchanged.
 * @param {unknown} value
 * @returns {string}
 */
export function formatDecimalForDisplay(value) {
  const str = String(value ?? '').trim();
  if (!/^-?\d+\.\d+$/.test(str)) return str;
  return str.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Return the summary height for a row.
 *
 * Uses Width (drawer height) when present; falls back to W only when Width is
 * absent. Returns '0' when neither is available.
 *
 * @param {string[]} row
 * @param {{ w: number, width: number }} colIndices
 * @returns {string}
 */
export function getSummaryHeight(row, colIndices) {
  if (colIndices.width !== -1 && colIndices.width < row.length) {
    return String(row[colIndices.width] || '').trim() || '0';
  }
  if (
    colIndices.w !== -1 &&
    colIndices.w < row.length &&
    String(row[colIndices.w] || '').trim()
  ) {
    return String(row[colIndices.w]).trim();
  }
  return '0';
}

/**
 * Round a width value UP to the next whole number, returning it as a string.
 * Non-numeric or non-positive values become '0'.
 *
 * This is the operator-guidance rounding used by the stack matrix and (by default)
 * the exported CSV Width column.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function roundWidthUpToWhole(value) {
  const parsed = parseFloat(String(value || '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return '0';
  return String(Math.ceil(parsed));
}

/**
 * Stack-matrix width for a row = roundWidthUpToWhole(summaryHeight).
 * @param {string[]} row
 * @param {{ w: number, width: number }} colIndices
 * @returns {string}
 */
export function getStackMatrixWidth(row, colIndices) {
  return roundWidthUpToWhole(getSummaryHeight(row, colIndices));
}

/**
 * Parse a numeric sort value from a cell that may contain fractions like
 * "3 1/2", "1/4", plain decimals, or integers. Non-numeric -> 0.
 *
 * Mirrors the original getSortVal helper used for descending numeric sorts.
 *
 * @param {string} value
 * @returns {number}
 */
export function getNumericSortValue(value) {
  const parsed = parseFloat(String(value || '').trim());
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse a potentially fractional cell value to a number.
 * Handles "3 1/2", "1/4", "3.5", "4".
 * @param {string} value
 * @returns {number}
 */
export function getFractionalSortValue(value) {
  const valStr = String(value || '').trim();
  if (!valStr) return 0;
  const parsed = parseFloat(valStr);
  if (!Number.isNaN(parsed)) {
    if (valStr.includes('/')) {
      const parts = valStr.split(/\s+/);
      if (parts.length === 2) {
        const w = parseFloat(parts[0]);
        const fracParts = parts[1].split('/');
        if (fracParts.length === 2) {
          const num = parseFloat(fracParts[0]);
          const den = parseFloat(fracParts[1]);
          if (!Number.isNaN(w) && !Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
            return w + num / den;
          }
        }
      } else {
        const fracParts = valStr.split('/');
        if (fracParts.length === 2) {
          const num = parseFloat(fracParts[0]);
          const den = parseFloat(fracParts[1]);
          if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
            return num / den;
          }
        }
      }
    }
    return parsed;
  }
  return 0;
}

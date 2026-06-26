import { boxesForParts } from './boxMath.js';

/**
 * Sum parts per (order, GroupID) from raw rows and convert each group to box count.
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Record<string, Array<{ groupId: string, boxes: number, parts: number }>>}
 */
export function buildOrderGroupBoxTotalsFromRows(rows, colIndices) {
  const result = {};
  if (!colIndices || colIndices.groupId === -1 || !rows?.length) {
    return result;
  }

  const partsMap = {};
  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const groupId = String(row[colIndices.groupId] ?? '').trim();
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!order || !groupId || qty <= 0) return;
    const key = `${order}|${groupId}`;
    partsMap[key] = (partsMap[key] || 0) + qty;
  });

  Object.entries(partsMap).forEach(([key, parts]) => {
    const sep = key.indexOf('|');
    const order = key.slice(0, sep);
    const groupId = key.slice(sep + 1);
    if (!result[order]) result[order] = [];
    result[order].push({ groupId, parts, boxes: boxesForParts(parts) });
  });

  Object.values(result).forEach((groups) => {
    groups.sort((a, b) =>
      String(a.groupId).localeCompare(String(b.groupId), undefined, { numeric: true })
    );
  });

  return result;
}

/**
 * Sum parts per (order, GroupID) and convert each group to box count.
 * Uses pre-merge totals on the batch when present (rows may merge across GroupIDs).
 *
 * @param {{ rows: string[][], orderGroupBoxTotals?: Record<string, Array<{ groupId: string, boxes: number, parts: number }>> }} batch
 * @param {object} colIndices
 * @returns {Record<string, Array<{ groupId: string, boxes: number, parts: number }>>}
 */
export function buildOrderGroupBoxTotals(batch, colIndices) {
  if (batch?.orderGroupBoxTotals) {
    return batch.orderGroupBoxTotals;
  }
  return buildOrderGroupBoxTotalsFromRows(batch?.rows, colIndices);
}

/**
 * Print label for an order: "1 - 2 bx, 2 - 3 bx" when multiple GroupIDs exist.
 *
 * @param {string} order
 * @param {object} batch
 * @param {object} colIndices
 * @returns {string}
 */
export function formatOrderGroupBoxLabel(order, batch, colIndices) {
  const groups = buildOrderGroupBoxTotals(batch, colIndices)[order];
  // Per shop request: split label only when an order has exactly two GroupIDs.
  if (groups?.length === 2) {
    return groups.map((g) => `${g.groupId} - ${g.boxes} bx`).join(', ');
  }
  const boxes = batch?.orderColTotals?.[order] ?? 0;
  return `${boxes} bx`;
}

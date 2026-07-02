import { boxesForParts } from './boxMath.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialGroupKeys, getGroupSpecialKey } from './specialOrders.js';

/** @typedef {{ w: string, length: string }} PartDim */

/**
 * @param {string[]} row
 * @param {object} colIndices
 * @returns {'front'|'back'|'left'|'right'|''}
 */
function getPartSide(row, colIndices) {
  if (colIndices.partName === -1 || colIndices.partName >= row.length) return '';
  const part = String(row[colIndices.partName] ?? '').trim().toUpperCase();
  if (part.startsWith('F') || part.includes('FRONT')) return 'front';
  if (part.startsWith('B') || part.includes('BACK')) return 'back';
  if (part.startsWith('L') || part.includes('LEFT')) return 'left';
  if (part.startsWith('R') || part.includes('RIGHT')) return 'right';
  if (part.includes('SIDE')) return 'left';
  return '';
}

/**
 * @param {string[]} row
 * @param {object} colIndices
 * @returns {PartDim}
 */
function readPartDim(row, colIndices) {
  const w =
    colIndices.w !== -1 && colIndices.w < row.length
      ? formatDecimalForDisplay(String(row[colIndices.w] ?? '').trim())
      : '';
  const length = formatDecimalForDisplay(String(row[colIndices.length] ?? '').trim());
  return { w, length };
}

function drawerSetKey(order, groupId, label) {
  const gid = String(groupId ?? '').trim();
  const lab = String(label ?? '').trim();
  if (gid && lab) return `${order}|g:${gid}|l:${lab}`;
  if (gid) return `${order}|g:${gid}`;
  if (lab) return `${order}|l:${lab}`;
  return '';
}

function compareGroupIds(a, b) {
  const idA = String(a.groupId ?? '').trim();
  const idB = String(b.groupId ?? '').trim();
  if (idA === idB) return 0;
  if (!idA) return 1;
  if (!idB) return -1;
  return idA.localeCompare(idB, undefined, { numeric: true });
}

function emptySide() {
  return { w: '', length: '' };
}

function setSide(target, dim) {
  if (!dim.w && !dim.length) return;
  target.w = dim.w;
  target.length = dim.length;
}

function sumPartQtys(parts) {
  return parts.reduce((sum, p) => sum + p.qty, 0);
}

function pickClosestWPart(list, used, lead, { requireLength } = {}) {
  let best = null;
  let bestIdx = -1;
  let bestDiff = Infinity;

  list.forEach((p, i) => {
    if (used.has(i)) return;
    if (requireLength && p.dim.length !== lead.dim.length) return;
    if (lead.dim.w && p.dim.w) {
      const diff = Math.abs(parseFloat(p.dim.w) - parseFloat(lead.dim.w));
      if (Number.isFinite(diff) && diff < bestDiff) {
        best = p;
        bestIdx = i;
        bestDiff = diff;
      }
      return;
    }
    if (!requireLength && p.stackWidth === lead.stackWidth && bestDiff === Infinity) {
      best = p;
      bestIdx = i;
    }
  });

  if (best) {
    used.add(bestIdx);
    return best;
  }
  return null;
}

function boxRowMergeKey(row) {
  return [
    row.order,
    row.groupId,
    row.width,
    row.front.length,
    row.back.length,
    row.left.length,
    row.right.length,
    row.special ? '1' : '0',
  ].join('|');
}

/** Combine rows with identical dimensions so print matches export merge behavior. */
function mergeIdenticalBoxRows(rows) {
  const merged = [];
  const indexByKey = new Map();
  rows.forEach((row) => {
    const key = boxRowMergeKey(row);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      merged[existingIndex].parts += row.parts;
      return;
    }
    indexByKey.set(key, merged.length);
    merged.push({ ...row });
  });
  return merged;
}

/**
 * Build cut-list print sections: one row per box line with rounded drawer width,
 * Front/Back length, and Left/Right length (shop cut-list layout).
 */
export function getCutListPrintSections(batch, colIndices) {
  const rows = batch?.sourceRows?.length ? batch.sourceRows : batch?.rows || [];
  if (!rows.length || !colIndices) return [];

  const specialGroups = getSpecialGroupKeys(rows, colIndices);
  const hasGroupId = colIndices.groupId !== -1;
  const hasLabel = colIndices.label !== -1;
  const isGroupSpecial = (order, groupId, label) =>
    specialGroups.has(getGroupSpecialKey(order, groupId, label));
  /** @type {Map<string, { order: string, groupId: string, label: string, lineLabel: string, special: boolean, parts: object[] }>} */
  const buckets = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const side = getPartSide(row, colIndices);
    const dim = readPartDim(row, colIndices);
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!side || !dim.length || qty <= 0) return;

    const stackWidth = formatDecimalForDisplay(getStackMatrixWidth(row, colIndices));
    const groupId =
      hasGroupId && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const label =
      hasLabel && colIndices.label < row.length
        ? String(row[colIndices.label] ?? '').trim()
        : '';
    const setKey = drawerSetKey(order, groupId, label) || `${order}|w:${stackWidth}`;

    if (!buckets.has(setKey)) {
      buckets.set(setKey, {
        order,
        groupId,
        label,
        lineLabel: label,
        special: isGroupSpecial(order, groupId, label),
        parts: [],
      });
    }

    buckets.get(setKey).parts.push({
      side,
      dim,
      qty,
      stackWidth,
      stackWidthSort: getFractionalSortValue(stackWidth),
      lengthSort: getFractionalSortValue(dim.length),
    });
  });

  const boxRows = [];

  buckets.forEach((bucket) => {
    const fronts = bucket.parts.filter((p) => p.side === 'front');
    const backs = bucket.parts.filter((p) => p.side === 'back');
    const lefts = bucket.parts.filter((p) => p.side === 'left');
    const rights = bucket.parts.filter((p) => p.side === 'right');

    if (fronts.length === 0) {
      const byWidth = new Map();
      [...lefts, ...rights, ...backs].forEach((p) => {
        if (!byWidth.has(p.stackWidth)) {
          byWidth.set(p.stackWidth, {
            order: bucket.order,
            groupId: bucket.groupId,
            lineLabel: bucket.lineLabel,
            special: bucket.special,
            width: p.stackWidth,
            stackWidthSort: p.stackWidthSort,
            front: emptySide(),
            back: emptySide(),
            left: emptySide(),
            right: emptySide(),
            parts: 0,
          });
        }
        const line = byWidth.get(p.stackWidth);
        if (p.side === 'left') setSide(line.left, p.dim);
        if (p.side === 'right') setSide(line.right, p.dim);
        if (p.side === 'back') setSide(line.back, p.dim);
        line.parts += p.qty;
      });
      byWidth.forEach((line) => boxRows.push(line));
      return;
    }

    const frontGroups = new Map();
    fronts.forEach((p) => {
      const key = `${p.dim.w}|${p.dim.length}|${p.stackWidth}`;
      if (!frontGroups.has(key)) frontGroups.set(key, []);
      frontGroups.get(key).push(p);
    });

    const frontKeys = Array.from(frontGroups.keys()).sort((a, b) => {
      const [, lA, swA] = a.split('|');
      const [, lB, swB] = b.split('|');
      const swDiff = getFractionalSortValue(swB) - getFractionalSortValue(swA);
      if (swDiff !== 0) return swDiff;
      return getFractionalSortValue(lB) - getFractionalSortValue(lA);
    });

    const usedBack = new Set();
    const usedLeft = new Set();
    const usedRight = new Set();

    frontKeys.forEach((key) => {
      const group = frontGroups.get(key);
      const lead = group[0];
      const line = {
        order: bucket.order,
        groupId: bucket.groupId,
        lineLabel: bucket.lineLabel,
        special: bucket.special,
        width: lead.stackWidth,
        stackWidthSort: lead.stackWidthSort,
        front: { ...lead.dim },
        back: emptySide(),
        left: emptySide(),
        right: emptySide(),
        parts: frontKeys.length === 1 ? sumPartQtys(bucket.parts) : sumPartQtys(group),
      };

      const back = pickClosestWPart(backs, usedBack, lead, { requireLength: true });
      if (back) {
        setSide(line.back, back.dim);
        if (frontKeys.length > 1) line.parts += back.qty;
      }

      const pickSide = (list, used) => {
        if (frontKeys.length === 1) {
          const part = list.find((_, i) => !used.has(i));
          if (part) {
            used.add(list.indexOf(part));
            return part;
          }
          return null;
        }
        return pickClosestWPart(list, used, lead);
      };

      const leftPart = pickSide(lefts, usedLeft);
      const rightPart = pickSide(rights, usedRight);
      if (leftPart) {
        setSide(line.left, leftPart.dim);
        if (frontKeys.length > 1) line.parts += leftPart.qty;
      }
      if (rightPart) {
        setSide(line.right, rightPart.dim);
        if (frontKeys.length > 1) line.parts += rightPart.qty;
      }

      boxRows.push(line);
    });
  });

  boxRows.sort((a, b) => {
    const orderA = getNumericSortValue(a.order);
    const orderB = getNumericSortValue(b.order);
    if (orderA !== orderB) return orderA - orderB;
    if (a.order !== b.order) return a.order.localeCompare(b.order);
    const groupCmp = compareGroupIds(a, b);
    if (groupCmp !== 0) return groupCmp;
    if (b.stackWidthSort !== a.stackWidthSort) return b.stackWidthSort - a.stackWidthSort;
    const aLen = getFractionalSortValue(a.front.length || a.left.length);
    const bLen = getFractionalSortValue(b.front.length || b.left.length);
    return bLen - aLen;
  });

  const mergedBoxRows = mergeIdenticalBoxRows(boxRows);

  const sections = [];
  mergedBoxRows.forEach((row) => {
    const last = sections[sections.length - 1];
    if (!last || last.order !== row.order) {
      sections.push({ order: row.order, special: false, rows: [] });
    }
    const section = sections[sections.length - 1];
    section.rows.push({
      parts: row.parts,
      boxes: boxesForParts(row.parts),
      groupId: row.groupId,
      special: row.special,
      width: row.width,
      fbLength: row.front.length || row.back.length,
      lrLength: row.left.length || row.right.length,
    });
    if (row.special) section.special = true;
  });

  return sections;
}

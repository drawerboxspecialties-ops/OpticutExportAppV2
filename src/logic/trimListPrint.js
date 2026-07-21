import { boxesForParts } from './boxMath.js';
import {
  getSummaryHeight,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialGroupKeys, getGroupSpecialKey } from './specialOrders.js';
import { getDifferentFrontMaterialKeys, dfmDrawerKey } from './cutListPrint.js';

/**
 * Trim-saw cut list: same order/group pairing as OptiCut.
 * Shows actual part W for F/B and L/R (never rounded up) plus lengths.
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @param {object} colIndices
 * @param {{ allRows?: string[][], dfmKeys?: Set<string> }} [options]
 * @returns {Array<{ order: string, special: boolean, rows: object[] }>}
 */
export function getTrimListPrintSections(batch, colIndices, options = {}) {
  const rows = batch?.sourceRows?.length ? batch.sourceRows : batch?.rows || [];
  if (!rows.length || !colIndices) return [];

  const dfmKeys =
    options.dfmKeys ||
    getDifferentFrontMaterialKeys(options.allRows?.length ? options.allRows : rows, colIndices);
  const isDfm = (order, groupId) => dfmKeys.has(dfmDrawerKey(order, groupId));

  const specialGroups = getSpecialGroupKeys(rows, colIndices);
  const hasGroupId = colIndices.groupId !== -1;
  const hasLabel = colIndices.label !== -1;
  const isGroupSpecial = (order, groupId, label) =>
    specialGroups.has(getGroupSpecialKey(order, groupId, label));

  /** @type {Map<string, { order: string, groupId: string, label: string, special: boolean, dfm: boolean, parts: object[] }>} */
  const buckets = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    const side = getPartSide(row, colIndices);
    const dim = readPartDim(row, colIndices);
    const qty = parseInt(row[colIndices.quantity]) || 0;
    if (!side || !dim.length || qty <= 0) return;

    // Drawer height only for pairing drawers — not shown as rounded trim W.
    const drawerHeight = formatDecimalForDisplay(getSummaryHeight(row, colIndices));
    if (!drawerHeight || drawerHeight === '0') return;

    const groupId =
      hasGroupId && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const label =
      hasLabel && colIndices.label < row.length ? String(row[colIndices.label] ?? '').trim() : '';
    const setKey = drawerSetKey(order, groupId, label) || `${order}|h:${drawerHeight}`;

    if (!buckets.has(setKey)) {
      buckets.set(setKey, {
        order,
        groupId,
        label,
        special: isGroupSpecial(order, groupId, label),
        dfm: isDfm(order, groupId),
        parts: [],
      });
    }

    buckets.get(setKey).parts.push({
      side,
      dim,
      qty,
      drawerHeight,
      drawerHeightSort: getFractionalSortValue(drawerHeight),
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
      const byKey = new Map();
      [...lefts, ...rights, ...backs].forEach((p) => {
        const lineKey = p.drawerHeight;
        if (!byKey.has(lineKey)) {
          byKey.set(lineKey, {
            order: bucket.order,
            groupId: bucket.groupId,
            special: bucket.special,
            dfm: bucket.dfm,
            drawerHeight: p.drawerHeight,
            drawerHeightSort: p.drawerHeightSort,
            front: emptySide(),
            back: emptySide(),
            left: emptySide(),
            right: emptySide(),
            parts: 0,
          });
        }
        const line = byKey.get(lineKey);
        if (p.side === 'left') setSide(line.left, p.dim);
        if (p.side === 'right') setSide(line.right, p.dim);
        if (p.side === 'back') setSide(line.back, p.dim);
        line.parts += p.qty;
      });
      byKey.forEach((line) => boxRows.push(line));
      return;
    }

    const usedBack = new Set();
    const usedLeft = new Set();
    const usedRight = new Set();

    sortFrontParts(fronts).forEach((lead) => {
      const line = {
        order: bucket.order,
        groupId: bucket.groupId,
        special: bucket.special,
        dfm: bucket.dfm,
        drawerHeight: lead.drawerHeight,
        drawerHeightSort: lead.drawerHeightSort,
        front: { ...lead.dim },
        back: emptySide(),
        left: emptySide(),
        right: emptySide(),
        parts: lead.qty,
      };
      const back = pickClosestPart(backs, usedBack, lead, { requireLength: true });
      if (back) {
        setSide(line.back, back.dim);
        line.parts += back.qty;
      }
      const leftPart = pickClosestPart(lefts, usedLeft, lead);
      if (leftPart) {
        setSide(line.left, leftPart.dim);
        line.parts += leftPart.qty;
      }
      const rightPart = pickClosestPart(rights, usedRight, lead);
      if (rightPart) {
        setSide(line.right, rightPart.dim);
        line.parts += rightPart.qty;
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
    if (b.drawerHeightSort !== a.drawerHeightSort) return b.drawerHeightSort - a.drawerHeightSort;
    const aLen = getFractionalSortValue(a.front.length || a.left.length);
    const bLen = getFractionalSortValue(b.front.length || b.left.length);
    return bLen - aLen;
  });

  const merged = mergeIdenticalTrimRows(boxRows);
  const sections = [];
  merged.forEach((row) => {
    const last = sections[sections.length - 1];
    if (!last || last.order !== row.order) {
      sections.push({ order: row.order, special: false, rows: [] });
    }
    const section = sections[sections.length - 1];
    const frontOnlyDfm = Boolean(row.dfm) && !row.left.length && !row.right.length;
    const boxes = frontOnlyDfm ? row.parts : boxesForParts(row.parts);
    const fbW = row.front.w || row.back.w || '';
    const lrW = row.left.w || row.right.w || '';
    section.rows.push({
      parts: row.parts,
      boxes,
      groupId: row.groupId,
      special: row.special,
      dfm: Boolean(row.dfm),
      fbW,
      lrW,
      fbLength: row.front.length || row.back.length,
      lrLength: row.left.length || row.right.length,
      /** Highlight when F/B and L/R finish W differ (typical trim case). */
      needsTrim: Boolean(fbW && lrW && fbW !== lrW),
    });
    if (row.special) section.special = true;
  });

  return sections;
}

/** Stable checkbox id for a trim line (never collides with OptiCut checks). */
export function trimListRowId(row) {
  return [
    't',
    String(row?.order ?? '').trim(),
    String(row?.groupId ?? '').trim(),
    String(row?.fbW ?? '').trim(),
    String(row?.fbLength ?? '').trim(),
    String(row?.lrW ?? '').trim(),
    String(row?.lrLength ?? '').trim(),
  ].join('|');
}

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

function sortFrontParts(fronts) {
  return fronts.slice().sort((a, b) => {
    const swDiff = b.drawerHeightSort - a.drawerHeightSort;
    if (swDiff !== 0) return swDiff;
    return getFractionalSortValue(b.dim.length) - getFractionalSortValue(a.dim.length);
  });
}

function pickClosestPart(list, used, lead, { requireLength } = {}) {
  let best = null;
  let bestIdx = -1;
  let bestDiff = Infinity;

  list.forEach((p, i) => {
    if (used.has(i)) return;
    if (p.drawerHeight !== lead.drawerHeight) return;
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
    if (!requireLength && bestDiff === Infinity) {
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

function trimRowMergeKey(row) {
  return [
    row.order,
    row.groupId,
    row.front.w,
    row.front.length,
    row.back.w,
    row.back.length,
    row.left.w,
    row.left.length,
    row.right.w,
    row.right.length,
    row.special ? '1' : '0',
    row.dfm ? '1' : '0',
  ].join('|');
}

function mergeIdenticalTrimRows(rows) {
  const merged = [];
  const indexByKey = new Map();
  rows.forEach((row) => {
    const key = trimRowMergeKey(row);
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

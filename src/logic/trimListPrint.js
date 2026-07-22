import { boxesForParts } from './boxMath.js';
import {
  getSummaryHeight,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
  roundWidthUpToWhole,
} from './widths.js';
import { getSpecialGroupKeys, getGroupSpecialKey } from './specialOrders.js';
import {
  getDifferentFrontMaterialKeys,
  dfmDrawerKey,
  buildDfmFrontQtyMaps,
  resolveSideOnlyDfmBoxes,
} from './cutListPrint.js';

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

  const lookupRows = options.allRows?.length ? options.allRows : rows;
  const dfmKeys =
    options.dfmKeys || getDifferentFrontMaterialKeys(lookupRows, colIndices);
  const isDfm = (order, groupId) => dfmKeys.has(dfmDrawerKey(order, groupId));
  const frontMaps = buildDfmFrontQtyMaps(lookupRows, colIndices);

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
    // Keep rows even when Width is blank/0 so Trim stays in sync with OptiCut.
    const drawerHeight = formatDecimalForDisplay(getSummaryHeight(row, colIndices));

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
      pushTrimSideOnlyBoxRows(bucket, backs, lefts, rights, boxRows);
      return;
    }

    const frontGroups = new Map();
    fronts.forEach((p) => {
      const key = `${p.dim.w}|${p.dim.length}|${p.drawerHeight}`;
      if (!frontGroups.has(key)) frontGroups.set(key, []);
      frontGroups.get(key).push(p);
    });

    const usedBack = new Set();
    const usedLeft = new Set();
    const usedRight = new Set();

    // Same-size fronts → one line (matches OptiCut); attach any leftover B/L/R.
    if (frontGroups.size === 1) {
      const group = frontGroups.values().next().value;
      const lead = group[0];
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
        frontQty: sumPartQtys(fronts),
        parts: sumPartQtys(bucket.parts),
      };
      const back = pickClosestPart(backs, usedBack, lead, { requireLength: true });
      if (back) setSide(line.back, back.dim);

      const pickFirstUnused = (list, used) => {
        const idx = list.findIndex((_, i) => !used.has(i));
        if (idx === -1) return null;
        used.add(idx);
        return list[idx];
      };
      const leftPart = pickFirstUnused(lefts, usedLeft);
      const rightPart = pickFirstUnused(rights, usedRight);
      if (leftPart) setSide(line.left, leftPart.dim);
      if (rightPart) setSide(line.right, rightPart.dim);

      boxRows.push(line);
      return;
    }

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
        frontQty: lead.qty,
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
    // Match the printed F/B length (front or back) — not L/R when F is absent (*DFM sides).
    const aLen = getFractionalSortValue(a.front.length || a.back.length || a.left.length);
    const bLen = getFractionalSortValue(b.front.length || b.back.length || b.left.length);
    return bLen - aLen;
  });

  const merged = mergeIdenticalTrimRows(boxRows);

  const sideOnlyDfmLinesByGroup = new Map();
  merged.forEach((row) => {
    const sideOnly =
      Boolean(row.dfm) && !row.front.length && (row.left.length || row.right.length || row.back.length);
    if (!sideOnly) return;
    const key = dfmDrawerKey(row.order, row.groupId);
    sideOnlyDfmLinesByGroup.set(key, (sideOnlyDfmLinesByGroup.get(key) || 0) + 1);
  });

  const sections = [];
  merged.forEach((row) => {
    const last = sections[sections.length - 1];
    if (!last || last.order !== row.order) {
      sections.push({ order: row.order, special: false, rows: [] });
    }
    const section = sections[sections.length - 1];
    const hasFront = Boolean(row.front.length);
    const hasSide = Boolean(row.left.length || row.right.length || row.back.length);
    const frontOnlyDfm = Boolean(row.dfm) && hasFront && !row.left.length && !row.right.length;
    const sideOnlyDfm = Boolean(row.dfm) && !hasFront && hasSide;
    let boxes;
    if (frontOnlyDfm) {
      // Bx = front qty only (B on the same sheet must not inflate drawer count).
      boxes = row.frontQty > 0 ? row.frontQty : row.parts;
    } else if (sideOnlyDfm) {
      const groupKey = dfmDrawerKey(row.order, row.groupId);
      boxes = resolveSideOnlyDfmBoxes(
        {
          ...row,
          // Front qty map keys use OptiCut stack width (rounded up).
          width: formatDecimalForDisplay(roundWidthUpToWhole(row.drawerHeight || row.width || '')),
          fbLength: row.back.length || row.front.length,
          sideOnlyDfmGroupLines: sideOnlyDfmLinesByGroup.get(groupKey) || 1,
        },
        frontMaps
      );
    } else {
      boxes = boxesForParts(row.parts);
    }
    const fbW = row.front.w || row.back.w || '';
    const lrW = row.left.w || row.right.w || '';
    section.rows.push({
      parts: row.parts,
      boxes,
      groupId: row.groupId,
      special: row.special,
      dfm: Boolean(row.dfm),
      frontOnlyDfm,
      sideOnlyDfm,
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
    row?.special ? '1' : '0',
    row?.dfm ? '1' : '0',
  ].join('|');
}

function sumPartQtys(parts) {
  return parts.reduce((sum, p) => sum + (p.qty || 0), 0);
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

/**
 * Side-only (*DFM) trim lines: pair from each back, then L/R — never by height alone.
 */
function pushTrimSideOnlyBoxRows(bucket, backs, lefts, rights, boxRows) {
  const usedLeft = new Set();
  const usedRight = new Set();

  if (backs.length) {
    sortFrontParts(backs).forEach((lead) => {
      const line = {
        order: bucket.order,
        groupId: bucket.groupId,
        special: bucket.special,
        dfm: bucket.dfm,
        drawerHeight: lead.drawerHeight,
        drawerHeightSort: lead.drawerHeightSort,
        width: lead.drawerHeight,
        front: emptySide(),
        back: { ...lead.dim },
        left: emptySide(),
        right: emptySide(),
        parts: lead.qty,
        backQty: lead.qty,
        leftQty: 0,
        rightQty: 0,
      };
      const leftPart = pickClosestPart(lefts, usedLeft, lead);
      if (leftPart) {
        setSide(line.left, leftPart.dim);
        line.leftQty = leftPart.qty;
        line.parts += leftPart.qty;
      }
      const rightPart = pickClosestPart(rights, usedRight, lead);
      if (rightPart) {
        setSide(line.right, rightPart.dim);
        line.rightQty = rightPart.qty;
        line.parts += rightPart.qty;
      }
      line.drawerCount = Math.max(line.backQty, line.leftQty, line.rightQty);
      boxRows.push(line);
    });
    return;
  }

  const bySize = new Map();
  [...lefts, ...rights].forEach((p) => {
    const sizeKey = `${p.drawerHeight}|${p.dim.length}|${p.dim.w}`;
    if (!bySize.has(sizeKey)) {
      bySize.set(sizeKey, {
        order: bucket.order,
        groupId: bucket.groupId,
        special: bucket.special,
        dfm: bucket.dfm,
        drawerHeight: p.drawerHeight,
        drawerHeightSort: p.drawerHeightSort,
        width: p.drawerHeight,
        front: emptySide(),
        back: emptySide(),
        left: emptySide(),
        right: emptySide(),
        parts: 0,
        backQty: 0,
        leftQty: 0,
        rightQty: 0,
      });
    }
    const line = bySize.get(sizeKey);
    if (p.side === 'left') {
      setSide(line.left, p.dim);
      line.leftQty += p.qty;
    }
    if (p.side === 'right') {
      setSide(line.right, p.dim);
      line.rightQty += p.qty;
    }
    line.parts += p.qty;
  });
  bySize.forEach((line) => {
    line.drawerCount = Math.max(line.leftQty, line.rightQty);
    boxRows.push(line);
  });
}

function pickClosestPart(list, used, lead, { requireLength } = {}) {
  let best = null;
  let bestIdx = -1;
  let bestDiff = Infinity;
  let bestQtyGap = Infinity;
  let bestHeightGap = Infinity;

  list.forEach((p, i) => {
    if (used.has(i)) return;
    if (requireLength && p.dim.length !== lead.dim.length) return;
    let diff = Infinity;
    if (lead.dim.w && p.dim.w) {
      diff = Math.abs(parseFloat(p.dim.w) - parseFloat(lead.dim.w));
      if (!Number.isFinite(diff)) return;
    } else if (!requireLength && p.drawerHeight === lead.drawerHeight) {
      diff = 0;
    } else if (!requireLength) {
      // Prefer same drawer height, but still attach leftover L/R (OptiCut parity).
      diff = 1000;
    } else {
      return;
    }
    const heightGap =
      p.drawerHeight === lead.drawerHeight
        ? 0
        : Math.abs(
            (parseFloat(p.drawerHeight) || 0) - (parseFloat(lead.drawerHeight) || 0)
          );
    const qtyGap = Math.abs((p.qty || 0) - (lead.qty || 0));
    if (
      diff < bestDiff ||
      (diff === bestDiff && heightGap < bestHeightGap) ||
      (diff === bestDiff && heightGap === bestHeightGap && qtyGap < bestQtyGap)
    ) {
      best = p;
      bestIdx = i;
      bestDiff = diff;
      bestHeightGap = heightGap;
      bestQtyGap = qtyGap;
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
      const existing = merged[existingIndex];
      existing.parts += row.parts;
      if (row.frontQty) {
        existing.frontQty = (existing.frontQty || 0) + row.frontQty;
      }
      if (row.drawerCount) {
        existing.drawerCount = (existing.drawerCount || 0) + row.drawerCount;
      }
      if (row.backQty) existing.backQty = (existing.backQty || 0) + row.backQty;
      if (row.leftQty) existing.leftQty = (existing.leftQty || 0) + row.leftQty;
      if (row.rightQty) existing.rightQty = (existing.rightQty || 0) + row.rightQty;
      return;
    }
    indexByKey.set(key, merged.length);
    merged.push({ ...row });
  });
  return merged;
}

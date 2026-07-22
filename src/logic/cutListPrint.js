import { boxesForParts } from './boxMath.js';
import {
  getStackMatrixWidth,
  formatDecimalForDisplay,
  getNumericSortValue,
  getFractionalSortValue,
} from './widths.js';
import { getSpecialGroupKeys, getGroupSpecialKey } from './specialOrders.js';

/** Shop-floor mark: front material differs from B/L/R for this drawer. */
export const DFM_MARK = '*DFM';

/** @typedef {{ w: string, length: string }} PartDim */

/**
 * Stable key for matching a drawer across material batches (order + GroupID).
 * @param {string} order
 * @param {string} [groupId='']
 * @returns {string}
 */
export function dfmDrawerKey(order, groupId = '') {
  return `${String(order ?? '').trim()}|${String(groupId ?? '').trim()}`;
}

/**
 * Front qty maps for *DFM side sheets (F lives on another batch).
 * - bySize: order|groupId|width|fbLength → front pcs (drawer count for that size)
 * - byGroup: order|groupId → total front pcs
 *
 * @param {string[][]} rows full import (or all rows that include fronts)
 * @param {object} colIndices
 * @returns {{ bySize: Map<string, number>, byGroup: Map<string, number> }}
 */
export function buildDfmFrontQtyMaps(rows, colIndices) {
  const bySize = new Map();
  const byGroup = new Map();
  if (!rows?.length || !colIndices || colIndices.partName === -1) {
    return { bySize, byGroup };
  }

  rows.forEach((row) => {
    if (getPartSide(row, colIndices) !== 'front') return;
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    if (!order) return;
    const qty = parseInt(row[colIndices.quantity], 10) || 0;
    if (qty <= 0) return;
    const groupId =
      colIndices.groupId !== -1 && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const width = formatDecimalForDisplay(getStackMatrixWidth(row, colIndices));
    const length = formatDecimalForDisplay(String(row[colIndices.length] ?? '').trim());
    const sizeKey = dfmFrontSizeKey(order, groupId, width, length);
    const groupKey = dfmDrawerKey(order, groupId);
    bySize.set(sizeKey, (bySize.get(sizeKey) || 0) + qty);
    byGroup.set(groupKey, (byGroup.get(groupKey) || 0) + qty);
  });

  return { bySize, byGroup };
}

/**
 * @param {string} order
 * @param {string} groupId
 * @param {string} width
 * @param {string} fbLength
 */
export function dfmFrontSizeKey(order, groupId, width, fbLength) {
  return `${String(order ?? '').trim()}|${String(groupId ?? '').trim()}|${String(width ?? '').trim()}|${String(fbLength ?? '').trim()}`;
}

/**
 * Drawer box count for a side-only *DFM line.
 * Prefer this line's side qty (drawerCount) so two sizes that share FB length
 * (different L/R) are not both assigned the full front-size total.
 *
 * @param {object} row
 * @param {{ bySize: Map<string, number>, byGroup: Map<string, number> }} frontMaps
 * @returns {number}
 */
export function resolveSideOnlyDfmBoxes(row, frontMaps) {
  if (row?.drawerCount > 0) return row.drawerCount;
  const order = String(row?.order ?? '').trim();
  const groupId = String(row?.groupId ?? '').trim();
  const width = String(row?.width ?? '').trim();
  const fbLength = String(row?.back?.length || row?.front?.length || row?.fbLength || '').trim();
  const sizeKey = dfmFrontSizeKey(order, groupId, width, fbLength);
  if (frontMaps?.bySize?.has(sizeKey)) {
    return frontMaps.bySize.get(sizeKey) || 0;
  }
  const groupKey = dfmDrawerKey(order, groupId);
  if (typeof row?.sideOnlyDfmGroupLines === 'number' && row.sideOnlyDfmGroupLines === 1) {
    if (frontMaps?.byGroup?.has(groupKey)) return frontMaps.byGroup.get(groupKey) || 0;
  }
  return boxesForParts(row?.parts || 0);
}

/**
 * Find drawers whose Front material differs from Back/Left/Right material.
 * Keys are `order|groupId` (blank groupId when GroupID is absent).
 *
 * @param {string[][]} rows
 * @param {object} colIndices
 * @returns {Set<string>}
 */
export function getDifferentFrontMaterialKeys(rows, colIndices) {
  const keys = new Set();
  if (!rows?.length || !colIndices || colIndices.materialName === -1) return keys;

  /** @type {Map<string, { fronts: Set<string>, sides: Set<string> }>} */
  const byDrawer = new Map();

  rows.forEach((row) => {
    const order = String(row[colIndices.orderNumber] ?? '').trim();
    if (!order) return;
    const side = getPartSide(row, colIndices);
    if (!side) return;
    const material = String(row[colIndices.materialName] ?? '')
      .trim()
      .toLowerCase();
    if (!material) return;
    const groupId =
      colIndices.groupId !== -1 && colIndices.groupId < row.length
        ? String(row[colIndices.groupId] ?? '').trim()
        : '';
    const key = dfmDrawerKey(order, groupId);
    if (!byDrawer.has(key)) {
      byDrawer.set(key, { fronts: new Set(), sides: new Set() });
    }
    const entry = byDrawer.get(key);
    if (side === 'front') entry.fronts.add(material);
    else entry.sides.add(material);
  });

  byDrawer.forEach((entry, key) => {
    if (!entry.fronts.size || !entry.sides.size) return;
    const same =
      entry.fronts.size === entry.sides.size &&
      [...entry.fronts].every((m) => entry.sides.has(m));
    if (!same) keys.add(key);
  });

  return keys;
}

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

function sortFrontParts(fronts) {
  return fronts.slice().sort((a, b) => {
    const swDiff = b.stackWidthSort - a.stackWidthSort;
    if (swDiff !== 0) return swDiff;
    return getFractionalSortValue(b.dim.length) - getFractionalSortValue(a.dim.length);
  });
}

/**
 * Side-only (*DFM) lines: pair from each back (FB length = drawer size), then L/R.
 * Never collapse all Widths into one row — that merged Pantry/Dry Bar sizes.
 *
 * @param {object} bucket
 * @param {object[]} backs
 * @param {object[]} lefts
 * @param {object[]} rights
 * @param {object[]} boxRows
 */
function pushSideOnlyBoxRows(bucket, backs, lefts, rights, boxRows) {
  const usedLeft = new Set();
  const usedRight = new Set();

  if (backs.length) {
    sortFrontParts(backs).forEach((lead) => {
      const line = {
        order: bucket.order,
        groupId: bucket.groupId,
        lineLabel: bucket.lineLabel,
        special: bucket.special,
        dfm: bucket.dfm,
        width: lead.stackWidth,
        stackWidthSort: lead.stackWidthSort,
        front: emptySide(),
        back: { ...lead.dim },
        left: emptySide(),
        right: emptySide(),
        parts: lead.qty,
        backQty: lead.qty,
        leftQty: 0,
        rightQty: 0,
      };
      const leftPart = pickClosestWPart(lefts, usedLeft, lead);
      if (leftPart) {
        setSide(line.left, leftPart.dim);
        line.leftQty = leftPart.qty;
        line.parts += leftPart.qty;
      }
      const rightPart = pickClosestWPart(rights, usedRight, lead);
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

  // No backs: emit L/R groups by stackWidth + length (do not merge different lengths).
  const bySize = new Map();
  [...lefts, ...rights].forEach((p) => {
    const sizeKey = `${p.stackWidth}|${p.dim.length}|${p.dim.w}`;
    if (!bySize.has(sizeKey)) {
      bySize.set(sizeKey, {
        order: bucket.order,
        groupId: bucket.groupId,
        lineLabel: bucket.lineLabel,
        special: bucket.special,
        dfm: bucket.dfm,
        width: p.stackWidth,
        stackWidthSort: p.stackWidthSort,
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

function buildBoxLineFromFront(lead, bucket) {
  return {
    order: bucket.order,
    groupId: bucket.groupId,
    lineLabel: bucket.lineLabel,
    special: bucket.special,
    dfm: bucket.dfm,
    width: lead.stackWidth,
    stackWidthSort: lead.stackWidthSort,
    front: { ...lead.dim },
    back: emptySide(),
    left: emptySide(),
    right: emptySide(),
    parts: 0,
  };
}

function pairDrawerSides(line, lead, backs, lefts, rights, usedBack, usedLeft, usedRight) {
  line.parts = lead.qty;
  const back = pickClosestWPart(backs, usedBack, lead, { requireLength: true });
  if (back) {
    setSide(line.back, back.dim);
    line.parts += back.qty;
  }
  const leftPart = pickClosestWPart(lefts, usedLeft, lead);
  if (leftPart) {
    setSide(line.left, leftPart.dim);
    line.parts += leftPart.qty;
  }
  const rightPart = pickClosestWPart(rights, usedRight, lead);
  if (rightPart) {
    setSide(line.right, rightPart.dim);
    line.parts += rightPart.qty;
  }
}

function pickClosestWPart(list, used, lead, { requireLength } = {}) {
  let best = null;
  let bestIdx = -1;
  let bestDiff = Infinity;
  let bestQtyGap = Infinity;

  list.forEach((p, i) => {
    if (used.has(i)) return;
    if (requireLength && p.dim.length !== lead.dim.length) return;
    let diff = Infinity;
    if (lead.dim.w && p.dim.w) {
      diff = Math.abs(parseFloat(p.dim.w) - parseFloat(lead.dim.w));
      if (!Number.isFinite(diff)) return;
    } else if (!requireLength && p.stackWidth === lead.stackWidth) {
      diff = 0;
    } else {
      return;
    }
    const qtyGap = Math.abs((p.qty || 0) - (lead.qty || 0));
    if (diff < bestDiff || (diff === bestDiff && qtyGap < bestQtyGap)) {
      best = p;
      bestIdx = i;
      bestDiff = diff;
      bestQtyGap = qtyGap;
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
    row.dfm ? '1' : '0',
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
      const existing = merged[existingIndex];
      existing.parts += row.parts;
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

/**
 * Build cut-list print sections: one row per box line with rounded drawer width,
 * Front/Back length, and Left/Right length (shop cut-list layout).
 *
 * @param {{ sourceRows?: string[][], rows?: string[][] }} batch
 * @param {object} colIndices
 * @param {{ allRows?: string[][], dfmKeys?: Set<string> }} [options]
 *   Pass `allRows` (full import) or precomputed `dfmKeys` so cross-material
 *   fronts are marked with *DFM on both the front sheet and the side sheet.
 */
export function getCutListPrintSections(batch, colIndices, options = {}) {
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
  /** @type {Map<string, { order: string, groupId: string, label: string, lineLabel: string, special: boolean, dfm: boolean, parts: object[] }>} */
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
        dfm: isDfm(order, groupId),
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
      pushSideOnlyBoxRows(bucket, backs, lefts, rights, boxRows);
      return;
    }

    const frontGroups = new Map();
    fronts.forEach((p) => {
      const key = `${p.dim.w}|${p.dim.length}|${p.stackWidth}`;
      if (!frontGroups.has(key)) frontGroups.set(key, []);
      frontGroups.get(key).push(p);
    });

    const usedBack = new Set();
    const usedLeft = new Set();
    const usedRight = new Set();

    if (frontGroups.size === 1) {
      const group = frontGroups.values().next().value;
      const lead = group[0];
      const line = buildBoxLineFromFront(lead, bucket);
      line.parts = sumPartQtys(bucket.parts);

      const back = pickClosestWPart(backs, usedBack, lead, { requireLength: true });
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
      const line = buildBoxLineFromFront(lead, bucket);
      pairDrawerSides(line, lead, backs, lefts, rights, usedBack, usedLeft, usedRight);
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

  // Count side-only *DFM lines per group (for single-line group front rollup).
  const sideOnlyDfmLinesByGroup = new Map();
  mergedBoxRows.forEach((row) => {
    const sideOnly =
      Boolean(row.dfm) && !row.front.length && (row.left.length || row.right.length || row.back.length);
    if (!sideOnly) return;
    const key = dfmDrawerKey(row.order, row.groupId);
    sideOnlyDfmLinesByGroup.set(key, (sideOnlyDfmLinesByGroup.get(key) || 0) + 1);
  });

  const sections = [];
  mergedBoxRows.forEach((row) => {
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
      // Each front is one drawer box (sides live on another cut list).
      boxes = row.parts;
    } else if (sideOnlyDfm) {
      // No F on this sheet — Bx still counts drawers via front qty from full file.
      const groupKey = dfmDrawerKey(row.order, row.groupId);
      boxes = resolveSideOnlyDfmBoxes(
        {
          ...row,
          fbLength: row.back.length || row.front.length,
          sideOnlyDfmGroupLines: sideOnlyDfmLinesByGroup.get(groupKey) || 1,
        },
        frontMaps
      );
    } else {
      boxes = boxesForParts(row.parts);
    }
    section.rows.push({
      parts: row.parts,
      boxes,
      groupId: row.groupId,
      special: row.special,
      dfm: Boolean(row.dfm),
      frontOnlyDfm,
      sideOnlyDfm,
      width: row.width,
      fbLength: row.front.length || row.back.length,
      lrLength: row.left.length || row.right.length,
    });
    if (row.special) section.special = true;
  });

  return sections;
}

/**
 * Box summary for one cut-list section (already scoped to one order / GroupID).
 * Example: "5 boxes"
 *
 * @param {{ rows: Array<{ boxes?: number }> }} section
 * @returns {string}
 */
export function formatSectionBoxSummary(section) {
  const total = (section?.rows || []).reduce((sum, r) => sum + (r.boxes || 0), 0);
  if (total <= 0) return '';
  return `${total} ${total === 1 ? 'box' : 'boxes'}`;
}

/**
 * Order-title box summary when every line is front-only *DFM
 * (Bx = front qty). Example: "5 boxes (3-5)".
 *
 * @param {{ rows: Array<{ boxes?: number, groupId?: string }> }} section
 * @returns {string}
 */
export function formatFrontOnlyDfmBoxSummary(section) {
  if (section?.groupId) return formatSectionBoxSummary(section);
  const total = (section?.rows || []).reduce((sum, r) => sum + (r.boxes || 0), 0);
  if (total <= 0) return '';
  const boxWord = total === 1 ? 'box' : 'boxes';
  const byGroup = new Map();
  (section.rows || []).forEach((r) => {
    const id = String(r.groupId ?? '').trim();
    if (!id) return;
    byGroup.set(id, (byGroup.get(id) || 0) + (r.boxes || 0));
  });
  if (byGroup.size) {
    const breakdown = [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([id, boxes]) => `${id}-${boxes}`)
      .join(', ');
    return `${total} ${boxWord} (${breakdown})`;
  }
  return `${total} ${boxWord}`;
}

/**
 * Display box totals for a batch. *DFM sheets (front-only or side-only) count
 * drawers from front qty; materialBoxes stays ceil(parts/4).
 *
 * @param {{ totalBoxes?: number }} batch
 * @param {Array<{ order: string, rows: Array<{ boxes?: number, groupId?: string, frontOnlyDfm?: boolean, sideOnlyDfm?: boolean }> }>} sections
 */
export function getBatchDisplayBoxInfoFromSections(batch, sections) {
  const materialBoxes = Number(batch?.totalBoxes) || 0;
  const rows = (sections || []).flatMap((s) => s.rows || []);
  if (!rows.length) {
    return {
      displayBoxes: materialBoxes,
      materialBoxes,
      isFrontOnlyDfm: false,
      isSideOnlyDfm: false,
      usesDrawerBoxCount: false,
      orderDisplayBoxes: {},
      orderGroupDisplayBoxes: {},
    };
  }

  const isFrontOnlyDfm = rows.every((r) => r.frontOnlyDfm);
  const isSideOnlyDfm = rows.every((r) => r.sideOnlyDfm);
  const usesDrawerBoxCount =
    isFrontOnlyDfm ||
    isSideOnlyDfm ||
    rows.some((r) => r.frontOnlyDfm || r.sideOnlyDfm);

  if (!usesDrawerBoxCount) {
    return {
      displayBoxes: materialBoxes,
      materialBoxes,
      isFrontOnlyDfm: false,
      isSideOnlyDfm: false,
      usesDrawerBoxCount: false,
      orderDisplayBoxes: {},
      orderGroupDisplayBoxes: {},
    };
  }

  /** @type {Record<string, number>} */
  const orderDisplayBoxes = {};
  /** @type {Record<string, Array<{ groupId: string, boxes: number }>>} */
  const orderGroupDisplayBoxes = {};

  (sections || []).forEach((section) => {
    const order = String(section.order ?? '').trim();
    if (!order) return;
    const byGroup = new Map();
    let orderTotal = 0;
    (section.rows || []).forEach((r) => {
      const boxes = r.boxes || 0;
      orderTotal += boxes;
      const gid = String(r.groupId ?? '').trim();
      if (gid) byGroup.set(gid, (byGroup.get(gid) || 0) + boxes);
    });
    orderDisplayBoxes[order] = (orderDisplayBoxes[order] || 0) + orderTotal;
    orderGroupDisplayBoxes[order] = [...byGroup.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([groupId, boxes]) => ({ groupId, boxes }));
  });

  const displayBoxes = rows.reduce((sum, r) => sum + (r.boxes || 0), 0);
  return {
    displayBoxes,
    materialBoxes,
    isFrontOnlyDfm,
    isSideOnlyDfm,
    usesDrawerBoxCount: true,
    orderDisplayBoxes,
    orderGroupDisplayBoxes,
  };
}

/**
 * @param {{ sourceRows?: string[][], rows?: string[][], totalBoxes?: number }} batch
 * @param {object} colIndices
 * @param {{ allRows?: string[][], dfmKeys?: Set<string> }} [options]
 */
export function getBatchDisplayBoxInfo(batch, colIndices, options = {}) {
  return getBatchDisplayBoxInfoFromSections(
    batch,
    getCutListPrintSections(batch, colIndices, options)
  );
}

/**
 * Header / sidebar label — drawer box count for the sheet.
 * @param {{ displayBoxes: number }} info
 * @returns {string}
 */
export function formatBatchBoxesTotalLabel(info) {
  const n = Number(info?.displayBoxes) || 0;
  return `${n} ${n === 1 ? 'Box' : 'Boxes'}`;
}

/**
 * Batch-index Boxes cell — drawer box count only.
 * @param {{ displayBoxes: number }} info
 * @returns {string}
 */
export function formatBatchIndexBoxesCell(info) {
  return String(Number(info?.displayBoxes) || 0);
}

/**
 * Per-order GroupID label for batch index on *DFM drawer-count batches.
 * @param {string} order
 * @param {{ usesDrawerBoxCount?: boolean, isFrontOnlyDfm?: boolean, orderGroupDisplayBoxes?: Record<string, Array<{ groupId: string, boxes: number }>>, orderDisplayBoxes?: Record<string, number> }} info
 * @returns {string}
 */
export function formatFrontOnlyDfmOrderGroupLabel(order, info) {
  if (!info?.usesDrawerBoxCount && !info?.isFrontOnlyDfm && !info?.isSideOnlyDfm) return '';
  const groups = info.orderGroupDisplayBoxes?.[order];
  if (groups?.length) {
    return groups.map((g) => `${g.groupId}-${g.boxes}`).join(', ');
  }
  const total = info.orderDisplayBoxes?.[order];
  return total !== undefined && total !== null ? String(total) : '';
}

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
  if (groupId) return `${order}|g:${groupId}`;
  if (label) return `${order}|l:${label}`;
  return '';
}

function emptySide() {
  return { w: '', length: '' };
}

function setSide(target, dim) {
  if (!dim.w && !dim.length) return;
  target.w = dim.w;
  target.length = dim.length;
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
            qty: 0,
          });
        }
        const line = byWidth.get(p.stackWidth);
        if (p.side === 'left') setSide(line.left, p.dim);
        if (p.side === 'right') setSide(line.right, p.dim);
        if (p.side === 'back') setSide(line.back, p.dim);
        line.qty = Math.max(line.qty, p.qty);
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
      const [wA, lA, swA] = a.split('|');
      const [wB, lB, swB] = b.split('|');
      const swDiff = getFractionalSortValue(swB) - getFractionalSortValue(swA);
      if (swDiff !== 0) return swDiff;
      return getFractionalSortValue(lB) - getFractionalSortValue(lA);
    });

    const usedBack = new Set();
    const usedLeft = new Set();
    const usedRight = new Set();

    frontKeys.forEach((key, index) => {
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
        qty: group[0].qty,
      };

      const back = backs.find(
        (p, i) =>
          !usedBack.has(i) &&
          p.dim.length === lead.dim.length &&
          (p.dim.w === lead.dim.w || !p.dim.w || !lead.dim.w)
      );
      if (back) {
        usedBack.add(backs.indexOf(back));
        setSide(line.back, back.dim);
      }

      const pickSide = (list, used) => {
        if (frontKeys.length === 1) {
          const part = list.find((_, i) => !used.has(i));
          if (part) {
            used.add(list.indexOf(part));
            return part.dim;
          }
          return null;
        }
        const match = list.find(
          (p, i) => !used.has(i) && p.stackWidth === lead.stackWidth
        );
        if (match) {
          used.add(list.indexOf(match));
          return match.dim;
        }
        const byIndex = list.find((_, i) => !used.has(i) && index === 0);
        if (byIndex) {
          used.add(list.indexOf(byIndex));
          return byIndex.dim;
        }
        return null;
      };

      const leftDim = pickSide(lefts, usedLeft);
      const rightDim = pickSide(rights, usedRight);
      if (leftDim) setSide(line.left, leftDim);
      if (rightDim) setSide(line.right, rightDim);

      boxRows.push(line);
    });
  });

  boxRows.sort((a, b) => {
    const orderA = getNumericSortValue(a.order);
    const orderB = getNumericSortValue(b.order);
    if (orderA !== orderB) return orderA - orderB;
    if (a.order !== b.order) return a.order.localeCompare(b.order);
    if (b.stackWidthSort !== a.stackWidthSort) return b.stackWidthSort - a.stackWidthSort;
    const aLen = getFractionalSortValue(a.front.length || a.left.length);
    const bLen = getFractionalSortValue(b.front.length || b.left.length);
    return bLen - aLen;
  });

  const sections = [];
  boxRows.forEach((row) => {
    const last = sections[sections.length - 1];
    if (!last || last.order !== row.order) {
      sections.push({ order: row.order, special: false, rows: [] });
    }
    const section = sections[sections.length - 1];
    section.rows.push({
      qty: row.qty,
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

/**
 * Row count for print layout (order header + data rows).
 * @param {{ rows: object[] }} section
 * @returns {number}
 */
export function getCutListSectionRowCount(section) {
  return 1 + (section?.rows?.length || 0);
}

/**
 * Split cut-list sections into two balanced columns for side-by-side print tables.
 *
 * @param {Array<{ order: string, special: boolean, rows: object[] }>} sections
 * @returns {{ left: typeof sections, right: typeof sections }}
 */
export function splitCutListSectionsForPrint(sections) {
  if (!sections?.length) return { left: [], right: [] };
  if (sections.length === 1 && sections[0].rows.length > 1) {
    const section = sections[0];
    const mid = Math.ceil(section.rows.length / 2);
    return {
      left: [{ ...section, rows: section.rows.slice(0, mid), continued: false }],
      right: [{ ...section, rows: section.rows.slice(mid), continued: true }],
    };
  }

  const left = [];
  const right = [];
  let leftRows = 0;
  let rightRows = 0;

  sections.forEach((section) => {
    const count = getCutListSectionRowCount(section);
    if (leftRows <= rightRows) {
      left.push({ ...section, continued: false });
      leftRows += count;
    } else {
      right.push({ ...section, continued: false });
      rightRows += count;
    }
  });

  return { left, right };
}

import { describe, expect, it } from 'vitest';
import {
  getStackMatrixSections,
  getStackItemWItems,
  getStackType,
  formatWidthQtyNote,
  splitSectionForPrint,
  getPrintWidthGroupRowCount,
} from '../src/logic/stackMatrix.js';
import { mapHeaders } from '../src/logic/headers.js';
import { parseCSV } from '../src/logic/csv.js';
import { DEMO_CSV } from '../src/logic/demoData.js';
import {
  splitDataIntoGroups,
  defaultFrontTopEdgesFromBacks,
  normalizeTopEdges,
} from '../src/logic/grouping.js';

function loadDemoGroups() {
  const { headers, rows } = parseCSV(DEMO_CSV);
  const colIndices = mapHeaders(headers);
  normalizeTopEdges(rows, colIndices);
  defaultFrontTopEdgesFromBacks(rows, colIndices);
  const groups = splitDataIntoGroups(rows, colIndices, 999, {});
  return { groups, colIndices };
}

describe('getStackType', () => {
  const cols = { partName: 2 };
  it('returns FB for front/back parts', () => {
    expect(getStackType(['', '', 'F', '', '', '', '', '', ''], cols)).toBe('FB');
    expect(getStackType(['', '', 'B', '', '', '', '', '', ''], cols)).toBe('FB');
    expect(getStackType(['', '', 'Front', '', '', '', '', '', ''], cols)).toBe('FB');
    expect(getStackType(['', '', 'Back', '', '', '', '', '', ''], cols)).toBe('FB');
  });
  it('returns LR for left/right/side parts', () => {
    expect(getStackType(['', '', 'L', '', '', '', '', '', ''], cols)).toBe('LR');
    expect(getStackType(['', '', 'R', '', '', '', '', '', ''], cols)).toBe('LR');
    expect(getStackType(['', '', 'Left', '', '', '', '', '', ''], cols)).toBe('LR');
    expect(getStackType(['', '', 'Right', '', '', '', '', '', ''], cols)).toBe('LR');
    expect(getStackType(['', '', 'Side', '', '', '', '', '', ''], cols)).toBe('LR');
  });
  it('returns empty for unknown parts', () => {
    expect(getStackType(['', '', 'Top', '', '', '', '', '', ''], cols)).toBe('');
  });
  it('returns empty when partName column is missing', () => {
    expect(getStackType(['', '', 'F', ''], { partName: -1 })).toBe('');
  });
});

describe('getStackMatrixSections (demo CSV)', () => {
  it('produces one section per order, sorted', () => {
    const { groups, colIndices } = loadDemoGroups();
    const sections = getStackMatrixSections(groups['PLY_CFB_601881'], colIndices);
    const orders = sections.map((s) => s.order);
    expect(orders).toEqual([...orders].sort());
    expect(orders).toContain('601881');
    expect(orders).toContain('601883');
    expect(orders).toContain('602016');
  });

  it('separates Front/Back from Left/Right for an order across width groups', () => {
    const { groups, colIndices } = loadDemoGroups();
    const sections = getStackMatrixSections(groups['PLY_CFB_601881'], colIndices);
    const order602016 = sections.find((s) => s.order === '602016');
    expect(order602016).toBeDefined();
    const hasFrontBack = order602016.widths.some((wg) => wg.frontBack.length > 0);
    const hasSides = order602016.widths.some((wg) => wg.sides.length > 0);
    expect(hasFrontBack).toBe(true);
    expect(hasSides).toBe(true);
  });

  it('sorts widths highest to lowest', () => {
    const { groups, colIndices } = loadDemoGroups();
    const sections = getStackMatrixSections(groups['PLY_CFB_601881'], colIndices);
    sections.forEach((section) => {
      const widths = section.widths.map((w) => parseFloat(w.width));
      const sorted = [...widths].sort((a, b) => b - a);
      expect(widths).toEqual(sorted);
    });
  });

  it('sorts lengths longest to shortest within each stack type', () => {
    const { groups, colIndices } = loadDemoGroups();
    const sections = getStackMatrixSections(groups['PLY_CFB_601881'], colIndices);
    sections.forEach((section) => {
      section.widths.forEach((wg) => {
        const fbLens = wg.frontBack.map((i) => parseFloat(i.length));
        expect(fbLens).toEqual([...fbLens].sort((a, b) => b - a));
      });
    });
  });
});

describe('getStackItemWItems', () => {
  it('returns raw W values that differ from the rounded width', () => {
    const item = { wValues: { '3.937': 40, '4.000000': 8 } };
    const items = getStackItemWItems(item, '4');
    expect(items).toEqual([{ value: '3.937', qty: 40 }]);
  });
  it('returns empty when W matches the rounded width', () => {
    const item = { wValues: { '4.000000': 8 } };
    expect(getStackItemWItems(item, '4')).toEqual([]);
  });
  it('returns empty for empty item', () => {
    expect(getStackItemWItems(null, '4')).toEqual([]);
  });
});

describe('formatWidthQtyNote', () => {
  it('formats widths with quantities, sorted highest width first', () => {
    expect(formatWidthQtyNote({ '4.000000': 8, '3.937': 40 })).toBe('4 x8, 3.937 x40');
  });
  it('returns empty string for empty map', () => {
    expect(formatWidthQtyNote({})).toBe('');
  });
});

describe('splitSectionForPrint', () => {
  it('packs width groups into cards without exceeding max rows', () => {
    const { groups, colIndices } = loadDemoGroups();
    const sections = getStackMatrixSections(groups['PLY_CFB_601881'], colIndices);
    const section = sections[0];
    const chunks = splitSectionForPrint(section, 24);
    chunks.forEach((chunk) => {
      const rows = chunk.widthGroups.reduce(
        (sum, wg) => sum + getPrintWidthGroupRowCount(wg),
        0
      );
      expect(rows).toBeLessThanOrEqual(24);
    });
  });

  it('produces at least one chunk', () => {
    const { groups, colIndices } = loadDemoGroups();
    const sections = getStackMatrixSections(groups['PLY_CFB_601881'], colIndices);
    const chunks = splitSectionForPrint(sections[0], 24);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

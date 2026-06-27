import { describe, expect, it } from 'vitest';
import { getCutListPrintSections } from '../src/logic/cutListPrint.js';
import { mapHeaders } from '../src/logic/headers.js';

const headers = [
  'OrderNumber',
  'MaterialName',
  'PartName',
  'W',
  'Length',
  'Quantity',
  'Label',
  'Width',
  'TopEdge',
  'GroupID',
  'Scoop',
  'Slope',
  'DrillFront',
  'DividersFB',
  'DividersSS',
  'FileSlots',
];
const cols = mapHeaders(headers);

function row({ order, part, length, qty, width, groupId = '', label = '', scoop = 'None' }) {
  return [
    order,
    'PF: 12MM Baltic Birch Ply',
    part,
    String(width),
    String(length),
    String(qty),
    label,
    String(width),
    'Clear Foil Bullnose',
    groupId,
    scoop,
    'None',
    'None',
    'None',
    'None',
    'None',
  ];
}

describe('getCutListPrintSections', () => {
  it('merges identical FB lines and sums quantity', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'B', length: '22', qty: 4, width: 8, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].fbLength).toBe('22');
    expect(sections[0].rows[0].lrLength).toBe('');
    expect(sections[0].rows[0].qty).toBe(8);
  });

  it('pairs front/back with corresponding left/right on the same row by GroupID', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '24', qty: 6, width: 6, groupId: '1' }),
        row({ order: '601881', part: 'L', length: '18', qty: 12, width: 6, groupId: '1' }),
        row({ order: '601881', part: 'R', length: '18', qty: 12, width: 6, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].fbLength).toBe('24');
    expect(sections[0].rows[0].lrLength).toBe('18');
    expect(sections[0].rows[0].qty).toBe(6);
  });

  it('pairs sides to the corresponding front/back line by length order', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '30', qty: 4, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 8, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'L', length: '20', qty: 8, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'R', length: '18', qty: 12, width: 8, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(2);
    expect(sections[0].rows[0]).toMatchObject({
      fbLength: '30',
      lrLength: '20',
      qty: 4,
    });
    expect(sections[0].rows[1]).toMatchObject({
      fbLength: '22',
      lrLength: '18',
      qty: 8,
    });
  });

  it('groups F/B/L/R by Label when GroupID is absent', () => {
    const batch = {
      sourceRows: [
        row({ order: '602016', part: 'F', length: '18', qty: 8, width: 10, label: '1.2' }),
        row({ order: '602016', part: 'L', length: '18', qty: 4, width: 5, label: '1.2' }),
        row({ order: '602016', part: 'R', length: '18', qty: 16, width: 8, label: '1.2' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0]).toMatchObject({
      width: '10',
      fbLength: '18',
      lrLength: '18',
      qty: 8,
    });
  });

  it('keeps separate rows when GroupID differs', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 2, width: 8, groupId: '2' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(2);
    expect(sections[0].rows.map((r) => r.groupId).sort()).toEqual(['1', '2']);
  });

  it('groups rows under one order section with width desc sort', () => {
    const batch = {
      sourceRows: [
        row({ order: '602336', part: 'F', length: '18', qty: 1, width: 6 }),
        row({ order: '601881', part: 'F', length: '20', qty: 1, width: 8 }),
        row({ order: '601881', part: 'F', length: '30', qty: 1, width: 8 }),
        row({ order: '601881', part: 'F', length: '24', qty: 1, width: 12 }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections.map((s) => s.order)).toEqual(['601881', '602336']);
    expect(sections[0].rows.map((r) => `${r.width}:${r.fbLength}`)).toEqual([
      '12:24',
      '8:30',
      '8:20',
    ]);
  });

  it('flags sections special when the order has a scoop value', () => {
    const batch = {
      sourceRows: [
        row({ order: '602336', part: 'F', length: '34', qty: 4, width: 12, groupId: '3', scoop: '#4  4" x 1"' }),
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections.find((s) => s.order === '602336')?.special).toBe(true);
    expect(sections.find((s) => s.order === '601881')?.special).toBe(false);
  });

  it('skips rows with zero quantity, missing length, or no stack type', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 0, width: 8 }),
        row({ order: '601881', part: 'F', length: '', qty: 4, width: 8 }),
        row({ order: '601881', part: 'Cleat', length: '22', qty: 4, width: 8 }),
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8 }),
      ],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].qty).toBe(4);
  });

  it('falls back to merged rows when sourceRows are absent', () => {
    const batch = {
      rows: [row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' })],
    };
    const sections = getCutListPrintSections(batch, cols);
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0].qty).toBe(4);
  });
});

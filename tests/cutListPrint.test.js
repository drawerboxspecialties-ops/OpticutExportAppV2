import { describe, expect, it } from 'vitest';
import { getCutListPrintRows } from '../src/logic/cutListPrint.js';
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

function row({ order, part, length, qty, width, groupId = '', scoop = 'None' }) {
  return [
    order,
    'PF: 12MM Baltic Birch Ply',
    part,
    String(width),
    String(length),
    String(qty),
    '',
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

describe('getCutListPrintRows', () => {
  it('merges identical lines and sums quantity', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'B', length: '22', qty: 4, width: 8, groupId: '1' }),
      ],
    };
    const result = getCutListPrintRows(batch, cols);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(8);
    expect(result[0].stackType).toBe('FB');
    expect(result[0].width).toBe('8');
    expect(result[0].length).toBe('22');
    expect(result[0].groupId).toBe('1');
  });

  it('keeps separate rows when GroupID differs', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' }),
        row({ order: '601881', part: 'F', length: '22', qty: 2, width: 8, groupId: '2' }),
      ],
    };
    const result = getCutListPrintRows(batch, cols);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.groupId).sort()).toEqual(['1', '2']);
  });

  it('routes length into Front/Back vs Left/Right via part name', () => {
    const batch = {
      sourceRows: [
        row({ order: '601881', part: 'F', length: '30', qty: 4, width: 8 }),
        row({ order: '601881', part: 'L', length: '20', qty: 8, width: 8 }),
      ],
    };
    const result = getCutListPrintRows(batch, cols);
    const fb = result.find((r) => r.stackType === 'FB');
    const lr = result.find((r) => r.stackType === 'LR');
    expect(fb.length).toBe('30');
    expect(lr.length).toBe('20');
  });

  it('sorts by order asc, then width desc, then length desc', () => {
    const batch = {
      sourceRows: [
        row({ order: '602336', part: 'F', length: '18', qty: 1, width: 6 }),
        row({ order: '601881', part: 'F', length: '20', qty: 1, width: 8 }),
        row({ order: '601881', part: 'F', length: '30', qty: 1, width: 8 }),
        row({ order: '601881', part: 'F', length: '24', qty: 1, width: 12 }),
      ],
    };
    const result = getCutListPrintRows(batch, cols);
    expect(result.map((r) => `${r.order}:${r.width}:${r.length}`)).toEqual([
      '601881:12:24',
      '601881:8:30',
      '601881:8:20',
      '602336:6:18',
    ]);
  });

  it('flags rows special when the order has a scoop value', () => {
    const batch = {
      sourceRows: [
        row({ order: '602336', part: 'F', length: '34', qty: 4, width: 12, groupId: '3', scoop: '#4  4" x 1"' }),
        row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' }),
      ],
    };
    const result = getCutListPrintRows(batch, cols);
    const special = result.find((r) => r.order === '602336');
    const normal = result.find((r) => r.order === '601881');
    expect(special.special).toBe(true);
    expect(normal.special).toBe(false);
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
    const result = getCutListPrintRows(batch, cols);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(4);
  });

  it('falls back to merged rows when sourceRows are absent', () => {
    const batch = {
      rows: [row({ order: '601881', part: 'F', length: '22', qty: 4, width: 8, groupId: '1' })],
    };
    const result = getCutListPrintRows(batch, cols);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(4);
  });
});

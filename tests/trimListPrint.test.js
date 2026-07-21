import { describe, expect, it } from 'vitest';
import { getTrimListPrintSections, trimListRowId } from '../src/logic/trimListPrint.js';
import { buildTrimListPrintCard } from '../src/ui/trimListPrintView.js';
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

function row({ order, part, length, qty, w, drawerWidth, groupId = '', label = '' }) {
  const partW = w ?? drawerWidth ?? '6';
  const height = drawerWidth ?? w ?? '6';
  return [
    order,
    'PF: 12MM Baltic Birch Ply',
    part,
    String(partW),
    String(length),
    String(qty),
    label,
    String(height),
    'Clear Foil Bullnose',
    groupId,
    'None',
    'None',
    'None',
    'None',
    'None',
    'None',
  ];
}

describe('getTrimListPrintSections', () => {
  it('keeps actual F/B and L/R part W without rounding (Parts Cut Sheet style)', () => {
    const batch = {
      sourceRows: [
        row({
          order: '602913',
          part: 'F',
          w: '4',
          length: '28.063',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '602913',
          part: 'B',
          w: '4',
          length: '28.063',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '602913',
          part: 'L',
          w: '3.938',
          length: '17.376',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '602913',
          part: 'R',
          w: '3.938',
          length: '17.376',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
      ],
    };
    const sections = getTrimListPrintSections(batch, cols);
    expect(sections).toHaveLength(1);
    expect(sections[0].rows[0]).toMatchObject({
      groupId: '1',
      fbW: '4',
      fbLength: '28.063',
      lrW: '3.938',
      lrLength: '17.376',
      needsTrim: true,
      parts: 8,
    });
  });

  it('does not round L/R W up to whole inches', () => {
    const batch = {
      sourceRows: [
        row({ order: '1', part: 'F', w: '4', length: '25.063', qty: 2, drawerWidth: '4', groupId: '1' }),
        row({ order: '1', part: 'B', w: '4', length: '25.063', qty: 2, drawerWidth: '4', groupId: '1' }),
        row({
          order: '1',
          part: 'L',
          w: '3.938',
          length: '17.376',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '1',
          part: 'R',
          w: '3.938',
          length: '17.376',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
      ],
    };
    const row0 = getTrimListPrintSections(batch, cols)[0].rows[0];
    expect(row0.lrW).toBe('3.938');
    expect(row0.lrW).not.toBe('4');
  });
});

describe('trimListRowId', () => {
  it('prefixes trim ids so they never collide with OptiCut checks', () => {
    expect(
      trimListRowId({
        order: '602913',
        groupId: '1',
        fbW: '4',
        fbLength: '28.063',
        lrW: '3.938',
        lrLength: '17.376',
      })
    ).toBe('t|602913|1|4|28.063|3.938|17.376');
  });
});

describe('buildTrimListPrintCard', () => {
  it('renders OptiCut-style flow with actual F/B and L/R W columns', () => {
    const batch = {
      materialName: 'PF: 5/8" Maple White',
      topEdge: 'Flat Foil',
      totalBoxes: 4,
      sortedOrders: ['602913'],
      orderColTotals: { '602913': 4 },
      sourceRows: [
        row({
          order: '602913',
          part: 'F',
          w: '4',
          length: '25.063',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '602913',
          part: 'B',
          w: '4',
          length: '25.063',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '602913',
          part: 'L',
          w: '3.938',
          length: '17.376',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '602913',
          part: 'R',
          w: '3.938',
          length: '17.376',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
      ],
    };
    const html = buildTrimListPrintCard('SLD_CFB_602913', batch, cols, { mode: 'station' });
    expect(html).toContain('print-batch-trim');
    expect(html).toContain('TRIM');
    expect(html).toContain('cutlist-print-columns');
    expect(html).toContain('print-meta-chip');
    expect(html).toContain('FB W');
    expect(html).toContain('LR W');
    expect(html).toContain('3.938');
    expect(html).toContain('cutlist-col-trim-w');
    expect(html).toContain('data-trim-sheet');
    expect(html).toContain('station-check');
    // Sparse: one order → one column, not stretched full width.
    expect(html).toContain('--station-flow-cols:1');
    expect(html).not.toContain('cutlist-order-column--empty');
  });

  it('balances multi-order station Trim across three columns like OptiCut', () => {
    const orders = ['1', '2', '3', '4', '5', '6'];
    const sourceRows = orders.flatMap((order, idx) => {
      const rows = [];
      for (let g = 1; g <= 4; g++) {
        const w = String(3 + (idx % 3));
        const lrW = `${w}.938`;
        rows.push(
          row({
            order,
            part: 'F',
            w,
            length: String(20 + g),
            qty: 2,
            drawerWidth: w,
            groupId: String(g),
          }),
          row({
            order,
            part: 'B',
            w,
            length: String(20 + g),
            qty: 2,
            drawerWidth: w,
            groupId: String(g),
          }),
          row({
            order,
            part: 'L',
            w: lrW,
            length: String(14 + g),
            qty: 2,
            drawerWidth: w,
            groupId: String(g),
          }),
          row({
            order,
            part: 'R',
            w: lrW,
            length: String(14 + g),
            qty: 2,
            drawerWidth: w,
            groupId: String(g),
          })
        );
      }
      return rows;
    });
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'Clear Foil Bullnose',
      totalBoxes: 48,
      sortedOrders: orders,
      orderColTotals: Object.fromEntries(orders.map((o) => [o, 8])),
      sourceRows,
    };
    const html = buildTrimListPrintCard('PLY_CFB_multi', batch, cols, { mode: 'station' });
    expect(html).toContain('data-trim-sheet');
    expect(html).toContain('--station-flow-cols:3');
    expect(html).not.toContain('cutlist-order-column--empty');
    const filledCols = html.match(/cutlist-order-column(?!--empty)/g) || [];
    expect(filledCols.length).toBeGreaterThanOrEqual(3);
    // Trailing decimals must remain visible (no 3.... truncation).
    expect(html).toContain('.938');
    expect(html).not.toMatch(/\d\.\.\.\./);
  });

  it('keeps print Trim packing unchanged (may include empty columns)', () => {
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 2,
      sortedOrders: ['9'],
      orderColTotals: { 9: 2 },
      sourceRows: [
        row({ order: '9', part: 'F', w: '4', length: '22', qty: 2, drawerWidth: '4', groupId: '1' }),
        row({ order: '9', part: 'B', w: '4', length: '22', qty: 2, drawerWidth: '4', groupId: '1' }),
        row({
          order: '9',
          part: 'L',
          w: '3.938',
          length: '16',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
        row({
          order: '9',
          part: 'R',
          w: '3.938',
          length: '16',
          qty: 2,
          drawerWidth: '4',
          groupId: '1',
        }),
      ],
    };
    const html = buildTrimListPrintCard('PRINT_TRIM', batch, cols, { mode: 'print' });
    expect(html).toContain('print-batch-trim');
    expect(html).toContain('TRIM');
    expect(html).not.toContain('station-check');
    expect(html).toContain('print-check');
    expect(html).not.toContain('--station-flow-cols');
  });
});

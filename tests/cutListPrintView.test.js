import { describe, expect, it } from 'vitest';
import {
  buildCutListPrintCard,
  splitRowsForPrintColumns,
  PRINT_CUTLIST_COLUMNS,
} from '../src/ui/cutListPrintView.js';
import { mapHeaders } from '../src/logic/headers.js';

const cols = mapHeaders([
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
]);

function drawerRows(order, label, length, drawerWidth, qty = 4) {
  const w = String(drawerWidth);
  return ['F', 'B', 'L', 'R'].map((part) => [
    order,
    'PF: 12MM Baltic Birch Ply',
    part,
    w,
    String(length),
    String(qty),
    label,
    w,
    'PVC',
    '1',
  ]);
}

describe('splitRowsForPrintColumns', () => {
  it('splits rows top-to-bottom across four columns', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n }));
    expect(splitRowsForPrintColumns(rows, 4)).toEqual([
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }, { id: 4 }],
      [{ id: 5 }, { id: 6 }],
      [{ id: 7 }, { id: 8 }],
    ]);
  });

  it('uses fewer columns when there are fewer rows', () => {
    expect(splitRowsForPrintColumns([{ id: 1 }, { id: 2 }], 4)).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  });
});

describe('buildCutListPrintCard', () => {
  it('renders parallel table columns per order for print', () => {
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 8,
      sortedOrders: ['602479', '602485'],
      orderColTotals: { 602479: 4, 602485: 4 },
      sourceRows: [
        ...drawerRows('602479', '1', '30.94', '9'),
        ...drawerRows('602485', '2', '25.94', '6'),
      ],
    };

    const html = buildCutListPrintCard('MDF_PVC_602479', batch, cols, null, PRINT_CUTLIST_COLUMNS);
    expect(html).toContain('cutlist-print-flow');
    expect(html).toContain('cutlist-order-columns');
    expect(html.match(/cutlist-order-block/g)?.length).toBe(2);
    expect(html.match(/cutlist-table--flow/g)?.length).toBe(2);
    expect(html).toContain('Order 602479');
    expect(html).toContain('Order 602485');
  });

  it('splits a large order into four side-by-side tables', () => {
    const sourceRows = [];
    for (let i = 0; i < 12; i++) {
      sourceRows.push(
        ...drawerRows('602504', String(i + 1), String(20 + i), '9', 4)
      );
    }
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 12,
      sortedOrders: ['602504'],
      orderColTotals: { 602504: 12 },
      sourceRows,
    };

    const html = buildCutListPrintCard('TEST', batch, cols, null, 4);
    expect(html.match(/class="cutlist-order-column"/g)?.length).toBe(4);
    expect(html.match(/cutlist-table--flow/g)?.length).toBe(4);
  });
});

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
  it('fills column 1 top-to-bottom before column 2', () => {
    const rows = Array.from({ length: 32 }, (_, i) => ({ id: i + 1 }));
    const chunks = splitRowsForPrintColumns(rows, 4);
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toHaveLength(8);
    expect(chunks[1]).toHaveLength(8);
    expect(chunks[2]).toHaveLength(8);
    expect(chunks[3]).toHaveLength(8);
    expect(chunks.flat().map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it('uses fewer columns when there are fewer rows', () => {
    expect(splitRowsForPrintColumns([{ id: 1 }, { id: 2 }], 4)).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  });
});

describe('buildCutListPrintCard', () => {
  it('renders one self-contained table per print column with its own header', () => {
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
    expect(html).toContain('cutlist-order-columns');
    expect(html).not.toContain('cutlist-order-flow');
    expect(html.match(/cutlist-order-block/g)?.length).toBe(2);
    expect(html.match(/<thead>/g)?.length).toBe(2);
    expect(html).toContain('Order 602479');
    expect(html).toContain('Order 602485');
  });

  it('splits a large order into four aligned tables for print', () => {
    const sourceRows = [];
    for (let i = 0; i < 32; i++) {
      sourceRows.push(...drawerRows('602504', String(i + 1), String(20 + i), '9', 4));
    }
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 32,
      sortedOrders: ['602504'],
      orderColTotals: { 602504: 32 },
      sourceRows,
    };

    const html = buildCutListPrintCard('TEST', batch, cols, null, 4);
    expect(html.match(/class="cutlist-order-column"/g)?.length).toBe(4);
    expect(html.match(/cutlist-table--flow/g)?.length).toBe(4);
    expect(html.match(/<thead>/g)?.length).toBe(4);
  });
});

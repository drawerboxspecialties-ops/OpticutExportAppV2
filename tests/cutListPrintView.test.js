import { describe, expect, it } from 'vitest';
import {
  buildCutListPrintCard,
  splitRowsForPrintTables,
  PRINT_TABLES_PER_ORDER,
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

describe('splitRowsForPrintTables', () => {
  it('fills table 1 top-to-bottom before table 2 and 3', () => {
    const rows = Array.from({ length: 32 }, (_, i) => ({ id: i + 1 }));
    const chunks = splitRowsForPrintTables(rows, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(11);
    expect(chunks[1]).toHaveLength(11);
    expect(chunks[2]).toHaveLength(10);
    expect(chunks.flat().map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it('uses fewer tables when there are fewer rows', () => {
    expect(splitRowsForPrintTables([{ id: 1 }], 3)).toEqual([[{ id: 1 }]]);
  });
});

describe('buildCutListPrintCard', () => {
  it('renders three aligned tables per order when enough rows exist', () => {
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

    const html = buildCutListPrintCard('TEST', batch, cols, null, PRINT_TABLES_PER_ORDER);
    expect(html.match(/class="cutlist-order-column"/g)?.length).toBe(3);
    expect(html.match(/<thead>/g)?.length).toBe(3);
    expect(html.match(/cutlist-data-row/g)?.length).toBe(32);
  });

  it('renders one table per order in a batch with multiple orders', () => {
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

    const html = buildCutListPrintCard('MDF_PVC_602479', batch, cols);
    expect(html.match(/cutlist-order-block/g)?.length).toBe(2);
    expect(html.match(/<thead>/g)?.length).toBe(2);
  });
});

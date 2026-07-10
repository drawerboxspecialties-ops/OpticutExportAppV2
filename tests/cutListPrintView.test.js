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
  it('splits into 3 tables with rows filling down first', () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({ id: i + 1 }));
    const chunks = splitRowsForPrintTables(rows, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(8);
    expect(chunks[1]).toHaveLength(8);
    expect(chunks[2]).toHaveLength(6);
    expect(chunks[0][0].id).toBe(1);
    expect(chunks[1][0].id).toBe(9);
    expect(chunks[2][0].id).toBe(17);
  });

  it('splits small orders into 3 tables too', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const chunks = splitRowsForPrintTables(rows, 3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(1);
    expect(chunks[2]).toHaveLength(0);
  });
});

describe('buildCutListPrintCard', () => {
  it('renders 3 side-by-side tables per order', () => {
    const sourceRows = [];
    for (let i = 0; i < 22; i++) {
      sourceRows.push(...drawerRows('602516', String(i + 1), String(20 + i), '9', 4));
    }
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 22,
      sortedOrders: ['602516'],
      orderColTotals: { 602516: 22 },
      sourceRows,
    };

    const html = buildCutListPrintCard('TEST', batch, cols, null, PRINT_TABLES_PER_ORDER);
    expect(html.match(/class="cutlist-order-column"/g)?.length).toBe(3);
    expect(html.match(/cutlist-order-columns/g)?.length).toBe(1);
    expect(html.match(/cutlist-order-stack/g)).toBeNull();
    expect(html.match(/<thead>/g)?.length).toBe(3);
  });

  it('renders 3 tables for each order in a multi-order batch', () => {
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 12,
      sortedOrders: ['602479', '602485'],
      orderColTotals: { 602479: 4, 602485: 4 },
      sourceRows: [
        ...drawerRows('602479', '1', '30.94', '9'),
        ...drawerRows('602485', '2', '25.94', '6'),
      ],
    };

    const html = buildCutListPrintCard('TEST', batch, cols);
    expect(html.match(/cutlist-order-block/g)?.length).toBe(2);
    expect(html.match(/class="cutlist-order-column"/g)?.length).toBe(6);
    expect(html.match(/<thead>/g)?.length).toBe(6);
  });
});

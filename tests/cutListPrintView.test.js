import { describe, expect, it } from 'vitest';
import {
  buildCutListPrintCard,
  splitRowsForPrintTables,
  rowsPerPrintTable,
  PRINT_ROWS_PER_TABLE,
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
  it('fills table 1 before starting table 2 below it', () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({ id: i + 1 }));
    const chunks = splitRowsForPrintTables(rows, 15);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(15);
    expect(chunks[1]).toHaveLength(7);
    expect(chunks[0][0].id).toBe(1);
    expect(chunks[1][0].id).toBe(16);
  });

  it('uses one table when rows fit', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(splitRowsForPrintTables(rows, 15)).toHaveLength(1);
  });
});

describe('rowsPerPrintTable', () => {
  it('uses smaller chunks when multiple orders share a page', () => {
    expect(rowsPerPrintTable(1)).toBe(PRINT_ROWS_PER_TABLE);
    expect(rowsPerPrintTable(2)).toBe(12);
  });
});

describe('buildCutListPrintCard', () => {
  it('renders stacked full-width tables that fill vertically', () => {
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

    const html = buildCutListPrintCard('TEST', batch, cols);
    expect(html.match(/cutlist-order-stack/g)?.length).toBe(1);
    expect(html.match(/class="cutlist-order-column"/g)).toBeNull();
    expect(html.match(/cutlist-order-columns/g)).toBeNull();
    expect(html.match(/<table class="cutlist-table/g)?.length).toBe(2);
    expect(html.match(/<thead>/g)?.length).toBe(2);
  });

  it('renders stacked tables for each order in a batch', () => {
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
    expect(html.match(/cutlist-order-stack/g)?.length).toBe(2);
    expect(html.match(/<table class="cutlist-table/g)?.length).toBe(2);
  });
});

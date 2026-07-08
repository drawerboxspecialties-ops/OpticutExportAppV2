import { describe, expect, it } from 'vitest';
import {
  buildCutListPrintCard,
  rowsPerPrintColumn,
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
  it('fills the first table before starting the second', () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({ id: i + 1 }));
    expect(splitRowsForPrintTables(rows, 3, 2)).toEqual([
      rows.slice(0, 12),
      rows.slice(12),
    ]);
  });

  it('uses one table for small orders', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(splitRowsForPrintTables(rows, 3, 2)).toEqual([rows]);
  });

  it('allows three tall tables for large single-order batches', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: i + 1 }));
    const chunks = splitRowsForPrintTables(rows, 3, 1);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(24);
    expect(chunks[1]).toHaveLength(24);
    expect(chunks[2]).toHaveLength(12);
  });
});

describe('rowsPerPrintColumn', () => {
  it('uses a shorter column on multi-order pages', () => {
    expect(rowsPerPrintColumn(2)).toBeLessThan(rowsPerPrintColumn(1));
  });
});

describe('buildCutListPrintCard', () => {
  it('uses compact multi-table layout for large orders on shared pages', () => {
    const sourceRows = [];
    for (let i = 0; i < 22; i++) {
      sourceRows.push(...drawerRows('602516', String(i + 1), String(20 + i), '9', 4));
    }
    sourceRows.push(...drawerRows('602521', '1', '25.94', '6'));
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 23,
      sortedOrders: ['602516', '602521'],
      orderColTotals: { 602516: 22, 602521: 1 },
      sourceRows,
    };

    const html = buildCutListPrintCard('TEST', batch, cols, null, PRINT_TABLES_PER_ORDER);
    expect(html).toContain('cutlist-order-columns--compact');
    expect(html.match(/<thead>/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('uses one table for a small second order on the same page', () => {
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
    expect(html.match(/<thead>/g)?.length).toBe(2);
  });
});

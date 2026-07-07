import { describe, expect, it } from 'vitest';
import { buildCutListPrintCard } from '../src/ui/cutListPrintView.js';
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

describe('buildCutListPrintCard', () => {
  it('renders one full-width table per order stacked vertically', () => {
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
    expect(html).toContain('cutlist-print-flow');
    expect(html).not.toContain('cutlist-order-columns');
    expect(html.match(/cutlist-order-block/g)?.length).toBe(2);
    expect(html.match(/cutlist-table--flow/g)?.length).toBe(2);
    expect(html.match(/<thead>/g)?.length).toBe(2);
    expect(html).toContain('Order 602479');
    expect(html).toContain('Order 602485');
  });

  it('keeps all rows in one table for a large order', () => {
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

    const html = buildCutListPrintCard('TEST', batch, cols);
    expect(html.match(/cutlist-order-block/g)?.length).toBe(1);
    expect(html.match(/cutlist-table--flow/g)?.length).toBe(1);
    expect(html.match(/cutlist-data-row/g)?.length).toBe(32);
  });
});

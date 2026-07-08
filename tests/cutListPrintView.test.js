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
  it('renders one full-width table per order with vertical rows', () => {
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
    expect(html.match(/cutlist-order-block/g)?.length).toBe(1);
    expect(html.match(/class="cutlist-order-column"/g)).toBeNull();
    expect(html.match(/cutlist-order-columns/g)).toBeNull();
    expect(html.match(/<table class="cutlist-table/g)?.length).toBe(1);
    expect(html.match(/<thead>/g)?.length).toBe(1);
  });

  it('renders separate full-width tables for each order in a batch', () => {
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
    expect(html.match(/class="cutlist-order-column"/g)).toBeNull();
    expect(html.match(/<table class="cutlist-table/g)?.length).toBe(2);
    expect(html.match(/<thead>/g)?.length).toBe(2);
  });
});

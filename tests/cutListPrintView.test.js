import { describe, expect, it } from 'vitest';
import {
  buildCutListPrintCard,
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

describe('buildCutListPrintCard', () => {
  it('renders vertically flowing row columns per order for print', () => {
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
    expect(html).toContain('cutlist-order-flow');
    expect(html).toContain('cutlist-flow-row');
    expect(html).toContain('cutlist-flow-header');
    expect(html).not.toContain('cutlist-order-columns');
    expect(html.match(/cutlist-order-block/g)?.length).toBe(2);
    expect(html).toContain('Order 602479');
    expect(html).toContain('Order 602485');
  });

  it('uses four CSS columns for large orders so rows flow top-to-bottom', () => {
    const sourceRows = [];
    for (let i = 0; i < 12; i++) {
      sourceRows.push(...drawerRows('602504', String(i + 1), String(20 + i), '9', 4));
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
    expect(html).toContain('--cutlist-print-cols: 4');
    expect(html.match(/cutlist-flow-row/g)?.length).toBe(12);
    expect(html.match(/cutlist-order-flow/g)?.length).toBe(1);
  });
});

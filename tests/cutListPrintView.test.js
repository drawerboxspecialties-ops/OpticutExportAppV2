import { describe, expect, it } from 'vitest';
import {
  buildCutListPrintCard,
  buildBatchOrdersIndex,
  cutListRowId,
  packCutListPrintFlow,
  packStationBalancedFlow,
  estimateRowsPerPrintColumn,
  estimateStationRowsPerColumn,
  formatPrintBatchOrders,
  PRINT_FLOW_COLUMNS,
  PRINT_ROWS_PER_COLUMN,
  PRINT_HEADER_ORDER_LIMIT,
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

describe('packCutListPrintFlow', () => {
  it('fills column 1 completely before wrapping to column 2', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
    const pages = packCutListPrintFlow(
      [{ order: 'A', titleHtml: 'Order A', contTitleHtml: 'Order A (cont.)', rows }],
      { columnCount: 3, rowsPerColumn: 20, titleCost: 2 }
    );

    expect(pages).toHaveLength(1);
    expect(pages[0][0]).toHaveLength(1);
    expect(pages[0][0][0].rows).toHaveLength(18); // 20 - titleCost
    expect(pages[0][0][0].rowStart).toBe(0);
    expect(pages[0][1]).toHaveLength(1);
    expect(pages[0][1][0].rows).toHaveLength(18); // 20 - cont titleCost
    expect(pages[0][1][0].titleHtml).toBe('Order A (cont.)');
    expect(pages[0][1][0].rowStart).toBe(18);
    expect(pages[0][2][0].rows.map((r) => r.id)).toEqual([37, 38, 39, 40]);
  });

  it('starts the next order under the first table when space remains', () => {
    const pages = packCutListPrintFlow(
      [
        {
          order: 'A',
          titleHtml: 'Order A',
          contTitleHtml: 'Order A (cont.)',
          rows: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}` })),
        },
        {
          order: 'B',
          titleHtml: 'Order B',
          contTitleHtml: 'Order B (cont.)',
          rows: Array.from({ length: 3 }, (_, i) => ({ id: `b${i}` })),
        },
      ],
      { columnCount: 3, rowsPerColumn: 28, titleCost: 2 }
    );

    expect(pages).toHaveLength(1);
    expect(pages[0][0]).toHaveLength(2);
    expect(pages[0][0][0].order).toBe('A');
    expect(pages[0][0][1].order).toBe('B');
    expect(pages[0][0][1].titleHtml).toBe('Order B');
    expect(pages[0][1]).toHaveLength(0);
    expect(pages[0][2]).toHaveLength(0);
  });

  it('uses a second page band after three full columns', () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({ id: i + 1 }));
    const pages = packCutListPrintFlow(
      [{ order: 'A', titleHtml: 'Order A', contTitleHtml: 'Order A (cont.)', rows }],
      { columnCount: 3, rowsPerColumn: 20, titleCost: 2 }
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toHaveLength(PRINT_FLOW_COLUMNS);
  });

  it('skips empty sections without breaking the flow', () => {
    const pages = packCutListPrintFlow(
      [
        { order: 'A', titleHtml: 'Order A', rows: [] },
        {
          order: 'B',
          titleHtml: 'Order B',
          rows: Array.from({ length: 2 }, (_, i) => ({ id: i + 1 })),
        },
      ],
      { columnCount: 3, rowsPerColumn: 28, titleCost: 2 }
    );
    expect(pages[0][0]).toHaveLength(1);
    expect(pages[0][0][0].order).toBe('B');
  });
});

describe('buildCutListPrintCard', () => {
  it('renders a 3-column fluid page and keeps small orders in column 1', () => {
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
    expect(html).toContain('cutlist-print-columns');
    expect(html.match(/cutlist-order-column"/g)?.length).toBe(1);
    expect(html.match(/cutlist-order-column--empty/g)?.length).toBe(2);
    expect(html.match(/cutlist-order-title/g)?.length).toBe(2);
    expect(html.match(/<thead>/g)?.length).toBe(2);
    expect(html).not.toContain('cutlist-order-stack');
    expect(html).not.toContain('cutlist-order-block');
  });

  it('wraps a tall order into later columns with continuation labels', () => {
    const sourceRows = [];
    for (let i = 0; i < PRINT_ROWS_PER_COLUMN + 5; i++) {
      sourceRows.push(...drawerRows('602516', String(i + 1), String(20 + i), '9', 4));
    }
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: PRINT_ROWS_PER_COLUMN + 5,
      sortedOrders: ['602516'],
      orderColTotals: { 602516: PRINT_ROWS_PER_COLUMN + 5 },
      sourceRows,
    };

    const html = buildCutListPrintCard('TEST', batch, cols);
    expect(html.match(/cutlist-order-column"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/<thead>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('cutlist-order-cont');
    expect(html).toContain('(cont.)');
  });

  it('keeps zebra striping continuous across wrapped fragments', () => {
    const sourceRows = [];
    for (let i = 0; i < PRINT_ROWS_PER_COLUMN + 3; i++) {
      sourceRows.push(...drawerRows('602516', String(i + 1), String(20 + i), '9', 4));
    }
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: PRINT_ROWS_PER_COLUMN + 3,
      sortedOrders: ['602516'],
      orderColTotals: { 602516: PRINT_ROWS_PER_COLUMN + 3 },
      sourceRows,
    };

    const html = buildCutListPrintCard('TEST', batch, cols);
    const firstTable = html.split('</table>')[0];
    const firstDataRows = firstTable.match(/cutlist-data-row/g)?.length || 0;
    expect(firstDataRows).toBeGreaterThan(0);

    // Second fragment should continue alt pattern from rowStart.
    const secondFrag = html.split('cutlist-order-fragment')[2] || '';
    if (firstDataRows % 2 === 1) {
      expect(secondFrag).toMatch(/cutlist-data-row"/);
    } else {
      expect(secondFrag).toMatch(/cutlist-data-row cutlist-row-alt/);
    }
  });

  it('summarizes long order lists in the print header', () => {
    const orders = Array.from({ length: PRINT_HEADER_ORDER_LIMIT + 5 }, (_, i) =>
      String(600000 + i)
    );
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: orders.length,
      sortedOrders: orders,
      orderColTotals: Object.fromEntries(orders.map((o) => [o, 1])),
      sourceRows: orders.flatMap((o, i) => drawerRows(o, '1', String(20 + i), '9')),
    };
    const html = buildCutListPrintCard('TEST', batch, cols);
    const headerList = html.match(/print-batch-orders-list">([\s\S]*?)<\/span>/)?.[1] || '';
    expect(headerList).toContain('print-batch-orders-more');
    expect(headerList).toContain('+5 more');
    expect(headerList).not.toContain(orders[orders.length - 1]);
    expect(headerList).toContain(orders[0]);
  });

  it('renders *DFM on rows when front material differs across the file', () => {
    const frontMat = 'FAA: 3/4" Premium White Maple FSC';
    const sideMat = 'FAA: 1/2" Maple White';
    const allRows = [
      ['602648', frontMat, 'F', '4', '19.063', '2', '', '4', 'Bullnose', '3'],
      ['602648', sideMat, 'B', '4', '19.063', '2', '', '4', 'Bullnose', '3'],
      ['602648', sideMat, 'L', '4', '20.876', '2', '', '4', 'Bullnose', '3'],
      ['602648', sideMat, 'R', '4', '20.876', '2', '', '4', 'Bullnose', '3'],
    ];
    const batch = {
      materialName: frontMat,
      topEdge: 'Bullnose',
      totalBoxes: 1,
      sortedOrders: ['602648'],
      orderColTotals: { 602648: 1 },
      sourceRows: [allRows[0]],
    };
    const html = buildCutListPrintCard('TEST', batch, cols, null, { allRows });
    expect(html).toContain('*DFM');
    expect(html).toContain('cutlist-dfm-mark');
  });
});

describe('estimateRowsPerPrintColumn', () => {
  it('leaves fewer rows when the header is denser', () => {
    const base = estimateRowsPerPrintColumn({ orderCount: 1, hasShipDate: false });
    const dense = estimateRowsPerPrintColumn({ orderCount: 40, hasShipDate: true });
    expect(dense).toBeLessThan(base);
    expect(dense).toBeGreaterThanOrEqual(14);
  });
});

describe('formatPrintBatchOrders', () => {
  it('lists every order when under the limit', () => {
    expect(formatPrintBatchOrders({ sortedOrders: ['1', '2'] })).toBe('1, 2');
  });

  it('caps long lists with a +N more marker', () => {
    const orders = Array.from({ length: 15 }, (_, i) => String(i + 1));
    const html = formatPrintBatchOrders({ sortedOrders: orders }, 10);
    expect(html).toContain('+5 more');
    expect(html).toContain('1, 2, 3');
    expect(html).not.toContain(', 15');
  });
});

describe('station checkbox mode', () => {
  it('builds stable row ids', () => {
    expect(
      cutListRowId({
        order: '602648',
        groupId: '3',
        width: '4',
        fbLength: '19.063',
        lrLength: '',
      })
    ).toBe('602648|3|4|19.063|');
  });

  it('renders interactive checkboxes only in station mode', () => {
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 1,
      sortedOrders: ['602479'],
      orderColTotals: { 602479: 1 },
      sourceRows: drawerRows('602479', '1', '30.94', '9'),
    };
    const printHtml = buildCutListPrintCard('TEST', batch, cols);
    const stationHtml = buildCutListPrintCard('TEST', batch, cols, null, { mode: 'station' });
    expect(printHtml).toContain('print-check');
    expect(printHtml).not.toContain('station-check');
    expect(stationHtml).toContain('station-check');
    expect(stationHtml).toContain('data-row-id=');
    expect(stationHtml).not.toContain('print-check');
  });
});

describe('packStationBalancedFlow', () => {
  it('fills all three columns for a large OptiCut-sized list', () => {
    const sections = [
      {
        order: 'A',
        titleHtml: 'Order A',
        contTitleHtml: 'Order A (cont.)',
        rows: Array.from({ length: 39 }, () => ({})),
      },
      {
        order: 'B',
        titleHtml: 'Order B',
        contTitleHtml: 'Order B (cont.)',
        rows: Array.from({ length: 20 }, () => ({})),
      },
      {
        order: 'C',
        titleHtml: 'Order C',
        contTitleHtml: 'Order C (cont.)',
        rows: Array.from({ length: 19 }, () => ({})),
      },
    ];
    const pages = packStationBalancedFlow(sections);
    expect(pages).toHaveLength(1);
    const filled = pages[0].filter((col) => col.length > 0);
    expect(filled).toHaveLength(3);
    const heights = pages[0].map((col) =>
      col.reduce((sum, frag) => sum + 2 + (frag.rows?.length || 0), 0)
    );
    // Columns should be roughly even (not one tall + two empty).
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(20);
  });

  it('is used by station OptiCut HTML (not a single left column)', () => {
    const orders = ['1', '2', '3', '4', '5', '6'];
    const sourceRows = orders.flatMap((order, idx) => {
      const rows = [];
      for (let i = 0; i < 8; i++) {
        rows.push(...drawerRows(order, String(i + 1), String(20 + i), String(4 + (idx % 3))));
      }
      return rows;
    });
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 48,
      sortedOrders: orders,
      orderColTotals: Object.fromEntries(orders.map((o) => [o, 8])),
      sourceRows,
    };
    const html = buildCutListPrintCard('TEST', batch, cols, null, { mode: 'station' });
    const colBlocks = html.match(/cutlist-order-column(?!--empty)/g) || [];
    expect(colBlocks.length).toBeGreaterThanOrEqual(3);
    // Should not leave two trailing empty columns on the only band.
    expect(html).not.toMatch(
      /cutlist-order-column">[\s\S]*cutlist-order-column--empty[\s\S]*cutlist-order-column--empty[\s\S]*<\/div>\s*<\/div>\s*<\/div>$/
    );
  });
});

describe('estimateStationRowsPerColumn', () => {
  it('balances large lists across three columns', () => {
    const sections = [
      { rows: Array.from({ length: 39 }, () => ({})) },
      { rows: Array.from({ length: 20 }, () => ({})) },
      { rows: Array.from({ length: 19 }, () => ({})) },
    ];
    const perCol = estimateStationRowsPerColumn(sections);
    expect(perCol).toBeGreaterThanOrEqual(10);
    expect(perCol).toBeLessThanOrEqual(40);
  });

  it('keeps tiny lists in one column', () => {
    expect(estimateStationRowsPerColumn([{ rows: [{}, {}] }])).toBe(4); // 2 rows + 2 title
  });
});

describe('buildBatchOrdersIndex', () => {
  it('lists every batch with full orders and barcodes', () => {
    const html = buildBatchOrdersIndex(
      {
        PLY_PVC_602480: {
          materialName: 'PF: 12MM Baltic Birch Ply',
          topEdge: 'PVC',
          totalBoxes: 3,
          sortedOrders: ['602480', '602481'],
          orderColTotals: { '602480': 3, '602481': 1 },
          orderGroupBoxTotals: {
            '602480': [
              { groupId: '1', boxes: 2, parts: 8 },
              { groupId: '2', boxes: 1, parts: 3 },
            ],
            '602481': [{ groupId: '1', boxes: 1, parts: 4 }],
          },
        },
        PLY_CFB_602470: {
          materialName: 'PF: 12MM Baltic Birch Ply',
          topEdge: 'CFB',
          totalBoxes: 2,
          sortedOrders: ['602470'],
          isSpecial: true,
          orderColTotals: { '602470': 2 },
        },
      },
      cols
    );
    expect(html).toContain('Batch / Order Lookup');
    expect(html).toContain('PLY_CFB_602470');
    expect(html).toContain('PLY_PVC_602480');
    expect(html).toContain('602480');
    expect(html).toContain('602481');
    expect(html).toContain('(1-2, 2-1)');
    expect(html).toContain('(1-1)');
    expect(html).toContain('(2)');
    expect(html).not.toContain('By order number');
    expect(html).toContain('★ SPECIAL');
    expect(html).toContain('code128-barcode');
    expect(html).toContain('<rect');
  });
});

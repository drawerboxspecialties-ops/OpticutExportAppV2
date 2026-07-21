import { describe, expect, it } from 'vitest';
import { getTrimListPrintSections, trimListRowId } from '../src/logic/trimListPrint.js';
import { buildTrimListPrintCard } from '../src/ui/trimListPrintView.js';
import { mapHeaders } from '../src/logic/headers.js';

const headers = [
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
  'Scoop',
  'Slope',
  'DrillFront',
  'DividersFB',
  'DividersSS',
  'FileSlots',
];
const cols = mapHeaders(headers);

function row({
  order,
  part,
  length,
  qty,
  w,
  drawerWidth,
  groupId = '',
  label = '',
}) {
  const partW = w ?? drawerWidth ?? '6';
  const height = drawerWidth ?? w ?? '6';
  return [
    order,
    'PF: 12MM Baltic Birch Ply',
    part,
    String(partW),
    String(length),
    String(qty),
    label,
    String(height),
    'Clear Foil Bullnose',
    groupId,
    'None',
    'None',
    'None',
    'None',
    'None',
    'None',
  ];
}

describe('getTrimListPrintSections', () => {
  it('shows cut width rounded up and finish width actual, with lengths', () => {
    const batch = {
      sourceRows: [
        row({
          order: '602350',
          part: 'F',
          w: '3.937',
          length: '24.125',
          qty: 4,
          drawerWidth: '3.937',
          groupId: '1',
        }),
        row({
          order: '602350',
          part: 'B',
          w: '3.937',
          length: '24.125',
          qty: 4,
          drawerWidth: '3.937',
          groupId: '1',
        }),
        row({
          order: '602350',
          part: 'L',
          w: '3.875',
          length: '17.6875',
          qty: 4,
          drawerWidth: '3.937',
          groupId: '1',
        }),
        row({
          order: '602350',
          part: 'R',
          w: '3.875',
          length: '17.6875',
          qty: 4,
          drawerWidth: '3.937',
          groupId: '1',
        }),
      ],
    };
    const sections = getTrimListPrintSections(batch, cols);
    expect(sections).toHaveLength(1);
    expect(sections[0].rows[0]).toMatchObject({
      groupId: '1',
      cutWidth: '4',
      finishWidth: '3.937',
      needsTrim: true,
      fbLength: '24.125',
      lrLength: '17.6875',
      parts: 16,
    });
  });

  it('keeps whole-number widths without needing trim', () => {
    const batch = {
      sourceRows: [
        row({ order: '1', part: 'F', length: '20', qty: 4, drawerWidth: '5', groupId: '2' }),
        row({ order: '1', part: 'B', length: '20', qty: 4, drawerWidth: '5', groupId: '2' }),
        row({ order: '1', part: 'L', length: '12', qty: 4, drawerWidth: '5', groupId: '2' }),
        row({ order: '1', part: 'R', length: '12', qty: 4, drawerWidth: '5', groupId: '2' }),
      ],
    };
    const row0 = getTrimListPrintSections(batch, cols)[0].rows[0];
    expect(row0.cutWidth).toBe('5');
    expect(row0.finishWidth).toBe('5');
    expect(row0.needsTrim).toBe(false);
  });
});

describe('trimListRowId', () => {
  it('prefixes trim ids so they never collide with OptiCut checks', () => {
    expect(
      trimListRowId({
        order: '602350',
        groupId: '1',
        cutWidth: '4',
        finishWidth: '3.937',
        fbLength: '24.125',
        lrLength: '17.6875',
      })
    ).toBe('t|602350|1|4|3.937|24.125|17.6875');
  });
});

describe('buildTrimListPrintCard', () => {
  it('renders station trim sheet with Cut W and Finish W columns', () => {
    const batch = {
      materialName: 'PF: 12MM Baltic Birch Ply',
      topEdge: 'PVC',
      totalBoxes: 2,
      sourceRows: [
        row({ order: '9', part: 'F', length: '20', qty: 4, drawerWidth: '3.5', groupId: '1' }),
        row({ order: '9', part: 'B', length: '20', qty: 4, drawerWidth: '3.5', groupId: '1' }),
        row({ order: '9', part: 'L', length: '12', qty: 4, drawerWidth: '3.5', groupId: '1' }),
        row({ order: '9', part: 'R', length: '12', qty: 4, drawerWidth: '3.5', groupId: '1' }),
      ],
    };
    const html = buildTrimListPrintCard('PLY_PVC_9', batch, cols, { mode: 'station' });
    expect(html).toContain('Trim list');
    expect(html).toContain('Cut W');
    expect(html).toContain('Finish W');
    expect(html).toContain('data-trim-sheet');
    expect(html).toContain('station-check');
    expect(html).toContain('3.5');
    expect(html).toContain('4');
  });
});

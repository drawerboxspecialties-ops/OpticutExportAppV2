import { describe, expect, it } from 'vitest';
import {
  prepareBaseExportRow,
  getRoundedExportMergeKey,
  getCutListRowsForExport,
} from '../src/logic/exportRows.js';
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
]);

describe('prepareBaseExportRow', () => {
  it('cleans the material name', () => {
    const row = ['100', 'Baltic Birch™ Prefinished Ply 12M', 'F', '4.5', '20', '1', '1.2', '4.5', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, false);
    expect(out[cols.materialName]).toBe('Baltic Birch Ply PF 12mm');
  });
  it('blanks W and Label', () => {
    const row = ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '1', '1.2', '4.5', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, false);
    expect(out[cols.w]).toBe('');
    expect(out[cols.label]).toBe('');
  });
  it('rounds Width up when roundWidth is true', () => {
    const row = ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '1', '1.2', '3.937', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, true);
    expect(out[cols.width]).toBe('4');
  });
  it('keeps original Width when roundWidth is false', () => {
    const row = ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '1', '1.2', '3.937', 'Clear Foil'];
    const out = prepareBaseExportRow(row, cols, false);
    expect(out[cols.width]).toBe('3.937');
  });
  it('does not mutate the input row', () => {
    const row = ['100', 'Baltic Birch™ Ply 12mm', 'F', '4.5', '20', '1', '1.2', '4.5', 'Clear Foil'];
    const original = [...row];
    prepareBaseExportRow(row, cols, false);
    expect(row).toEqual(original);
  });
});

describe('getRoundedExportMergeKey', () => {
  it('excludes Quantity and Label from the key', () => {
    const a = ['100', 'Mat', 'F', '', '20', '1', 'L1', '4', 'CFB'];
    const b = ['100', 'Mat', 'F', '', '20', '99', 'L2', '4', 'CFB'];
    expect(getRoundedExportMergeKey(a, cols)).toBe(getRoundedExportMergeKey(b, cols));
  });
});

describe('getCutListRowsForExport — rounded-width export', () => {
  it('merges rows that become identical after rounding and sums quantities', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '3.937', 'Clear Foil'],
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '4', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out).toHaveLength(1);
    expect(out[0][cols.quantity]).toBe('12');
    expect(out[0][cols.width]).toBe('4');
  });

  it('records original width quantities in Label when widths differ from rounded width', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '3.937', 'Clear Foil'],
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '4', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out[0][cols.label]).toContain('Rounded from Width');
    expect(out[0][cols.label]).toContain('3.937 x8');
    expect(out[0][cols.label]).toContain('4 x4');
  });

  it('leaves Label blank when no rounding difference occurred', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out[0][cols.label]).toBe('');
  });

  it('blanks W on every exported row', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, true);
    expect(out[0][cols.w]).toBe('');
  });
});

describe('getCutListRowsForExport — non-rounded export', () => {
  it('keeps original widths and does not merge', () => {
    const rows = [
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '8', '1.2', '3.937', 'Clear Foil'],
      ['100', 'Baltic Birch Ply 12mm', 'F', '4.5', '20', '4', '1.2', '4.000000', 'Clear Foil'],
    ];
    const out = getCutListRowsForExport(rows, cols, false);
    expect(out).toHaveLength(2);
    expect(out[0][cols.width]).toBe('3.937');
    expect(out[0][cols.label]).toBe('');
  });
});

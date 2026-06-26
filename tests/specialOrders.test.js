import { describe, expect, it } from 'vitest';
import {
  isSpecialOrderValue,
  getSpecialOrderNumbers,
  SPECIAL_ORDER_COLUMN_KEYS,
} from '../src/logic/specialOrders.js';
import { mapHeaders } from '../src/logic/headers.js';
import { splitDataIntoGroups } from '../src/logic/grouping.js';

describe('isSpecialOrderValue', () => {
  it('treats blank and "none" (any case) as not special', () => {
    expect(isSpecialOrderValue('')).toBe(false);
    expect(isSpecialOrderValue('   ')).toBe(false);
    expect(isSpecialOrderValue('None')).toBe(false);
    expect(isSpecialOrderValue('NONE')).toBe(false);
    expect(isSpecialOrderValue(null)).toBe(false);
    expect(isSpecialOrderValue(undefined)).toBe(false);
  });

  it('treats any other value as special', () => {
    expect(isSpecialOrderValue('Type #1')).toBe(true);
    expect(isSpecialOrderValue('#1     2 Hole')).toBe(true);
    expect(isSpecialOrderValue('1 - Removable')).toBe(true);
    expect(isSpecialOrderValue('Yes')).toBe(true);
  });
});

describe('getSpecialOrderNumbers', () => {
  const headers = [
    'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
    'Laser', 'Scoop', 'Slope', 'DrillFront', 'DividersFB', 'DividersSS', 'FileSlots',
  ];
  const cols = mapHeaders(headers);

  const normalRow = (order) =>
    [order, 'PF: 12MM Baltic Birch Ply', 'F', '6', '25', '1', '', '6', 'Clear Foil Bullnose',
      'Yes', 'None', 'None', 'None', 'None', 'None', 'None'];

  it('flags an order special when any row has a non-none special value', () => {
    const rows = [
      normalRow('100'),
      [...normalRow('200')].map((v, i) => (i === cols.drillFront ? '#1     2 Hole' : v)),
    ];
    const special = getSpecialOrderNumbers(rows, cols);
    expect(special.has('200')).toBe(true);
    expect(special.has('100')).toBe(false);
  });

  it('ignores the Laser column entirely', () => {
    const rows = [
      [...normalRow('300')].map((v, i) => (i === cols.scoop ? 'None' : v)),
    ];
    // Laser is "Yes" in normalRow but must not make the order special.
    expect(getSpecialOrderNumbers(rows, cols).has('300')).toBe(false);
  });

  it('flags the whole order even if only one of its rows is special', () => {
    const rows = [
      normalRow('400'),
      [...normalRow('400')].map((v, i) => (i === cols.fileSlots ? '1" Letter' : v)),
    ];
    expect(getSpecialOrderNumbers(rows, cols).has('400')).toBe(true);
  });

  it('returns an empty set when no special columns exist', () => {
    const basicCols = mapHeaders(['OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge']);
    const rows = [['100', 'MDF', 'F', '6', '24', '1', '', '6', 'PVC White Tape']];
    expect(getSpecialOrderNumbers(rows, basicCols).size).toBe(0);
  });

  it('exposes the documented special column keys (excluding laser)', () => {
    expect(SPECIAL_ORDER_COLUMN_KEYS).toEqual([
      'scoop', 'slope', 'dividersFB', 'dividersSS', 'drillFront', 'fileSlots',
    ]);
    expect(SPECIAL_ORDER_COLUMN_KEYS).not.toContain('laser');
  });
});

describe('splitDataIntoGroups with special-order separation', () => {
  const headers = [
    'OrderNumber', 'MaterialName', 'PartName', 'W', 'Length', 'Quantity', 'Label', 'Width', 'TopEdge',
    'Laser', 'Scoop', 'Slope', 'DrillFront', 'DividersFB', 'DividersSS', 'FileSlots',
  ];
  const cols = mapHeaders(headers);

  const row = (order, overrides = {}) => {
    const base = [order, 'PF: 12MM Baltic Birch Ply', 'F', '6', '25', '1', '', '6', 'Clear Foil Bullnose',
      'Yes', 'None', 'None', 'None', 'None', 'None', 'None'];
    Object.entries(overrides).forEach(([key, value]) => {
      base[cols[key]] = value;
    });
    return base;
  };

  it('separates special orders into SPECIAL_-prefixed batches', () => {
    const rows = [
      row('601881'),
      row('601882', { drillFront: '#1     2 Hole' }),
    ];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, true);
    const keys = Object.keys(groups).sort();
    const specialKeys = keys.filter((k) => k.startsWith('SPECIAL_'));
    const normalKeys = keys.filter((k) => !k.startsWith('SPECIAL_'));
    expect(specialKeys.length).toBe(1);
    expect(normalKeys.length).toBe(1);
    expect(groups[specialKeys[0]].sortedOrders).toContain('601882');
    expect(groups[specialKeys[0]].isSpecial).toBe(true);
    expect(groups[normalKeys[0]].sortedOrders).toContain('601881');
    expect(groups[normalKeys[0]].isSpecial).toBe(false);
  });

  it('does not separate when the flag is off', () => {
    const rows = [
      row('601881'),
      row('601882', { drillFront: '#1     2 Hole' }),
    ];
    const groups = splitDataIntoGroups(rows, cols, 999, {}, false);
    const keys = Object.keys(groups);
    expect(keys.some((k) => k.startsWith('SPECIAL_'))).toBe(false);
  });
});

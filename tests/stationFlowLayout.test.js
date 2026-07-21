import { describe, expect, it } from 'vitest';
import {
  STATION_FLOW_COLUMNS,
  assignFragmentsToColumns,
  stationOrderFragmentKey,
} from '../src/ui/stationFlowLayout.js';

describe('assignFragmentsToColumns', () => {
  it('always targets three column slots', () => {
    expect(STATION_FLOW_COLUMNS).toBe(3);
  });

  it('stacks small orders in column 1 before opening column 2', () => {
    const items = [{ cost: 6 }, { cost: 4 }, { cost: 5 }];
    const cols = assignFragmentsToColumns(items, 3, 22);
    expect(cols[0]).toEqual([0, 1, 2]);
    expect(cols[1]).toEqual([]);
    expect(cols[2]).toEqual([]);
  });

  it('opens the next column when the viewport budget is full', () => {
    const items = [{ cost: 12 }, { cost: 12 }, { cost: 12 }];
    const cols = assignFragmentsToColumns(items, 3, 20);
    expect(cols[0]).toEqual([0]);
    expect(cols[1]).toEqual([1]);
    expect(cols[2]).toEqual([2]);
  });

  it('leaves unused columns empty when there is only one fragment', () => {
    const cols = assignFragmentsToColumns([{ cost: 5 }]);
    expect(cols.filter((c) => c.length > 0)).toHaveLength(1);
    expect(cols[0]).toEqual([0]);
  });
});

describe('stationOrderFragmentKey', () => {
  it('matches primary and continuation titles for the same order', () => {
    expect(stationOrderFragmentKey('Order 602947 - 43 boxes (1-24) ★ SPECIAL')).toBe('602947');
    expect(stationOrderFragmentKey('Order 602947 (cont.)')).toBe('602947');
  });
});

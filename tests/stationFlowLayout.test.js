import { describe, expect, it } from 'vitest';
import {
  STATION_FLOW_COLUMNS,
  assignFragmentsToColumns,
} from '../src/ui/stationFlowLayout.js';

describe('assignFragmentsToColumns', () => {
  it('always targets three columns', () => {
    expect(STATION_FLOW_COLUMNS).toBe(3);
  });

  it('spreads many order fragments across all three columns', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      cost: 2 + (i % 4) + 3,
    }));
    const cols = assignFragmentsToColumns(items);
    expect(cols).toHaveLength(3);
    expect(cols.every((c) => c.length > 0)).toBe(true);
    const heights = cols.map((indexes) =>
      indexes.reduce((sum, i) => sum + items[i].cost, 0)
    );
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(8);
  });

  it('leaves unused columns empty when there is only one fragment', () => {
    const cols = assignFragmentsToColumns([{ cost: 5 }]);
    expect(cols.filter((c) => c.length > 0)).toHaveLength(1);
    expect(cols[0]).toEqual([0]);
  });

  it('fills three columns for a left-packed list (old station HTML shape)', () => {
    // Mimic old print packing: tall stack that used to sit only in column 1.
    const items = [
      { cost: 12 },
      { cost: 6 },
      { cost: 5 },
      { cost: 8 },
      { cost: 4 },
      { cost: 7 },
      { cost: 3 },
      { cost: 9 },
    ];
    const cols = assignFragmentsToColumns(items);
    expect(cols.filter((c) => c.length > 0)).toHaveLength(3);
  });
});

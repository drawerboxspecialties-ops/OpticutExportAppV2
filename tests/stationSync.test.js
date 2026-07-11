import { describe, expect, it } from 'vitest';
import {
  isStationHash,
  stationHashBatchKey,
  stationJobId,
  filterStationJobs,
  uniqueStationMaterials,
  retainActiveStationJobs,
  stationJobExpiryCutoff,
  STATION_JOB_RETENTION_MS,
} from '../src/logic/stationSync.js';

describe('isStationHash', () => {
  it('detects station mode hashes', () => {
    expect(isStationHash('#station')).toBe(true);
    expect(isStationHash('#station/')).toBe(true);
    expect(isStationHash('#station/foo')).toBe(true);
    expect(isStationHash('')).toBe(false);
    expect(isStationHash('#print')).toBe(false);
  });
});

describe('stationHashBatchKey', () => {
  it('reads selected batch from hash', () => {
    expect(stationHashBatchKey('#station')).toBe('');
    expect(stationHashBatchKey('#station/FAA_CFB_602648')).toBe('FAA_CFB_602648');
    expect(stationHashBatchKey('#station/' + encodeURIComponent('A/B'))).toBe('A/B');
  });
});

describe('stationJobId', () => {
  it('sanitizes batch keys for Firestore ids', () => {
    expect(stationJobId('FAA_CFB_602648')).toBe('FAA_CFB_602648');
    expect(stationJobId('A/B#C')).toBe('A_B_C');
  });
});

describe('14-day retention', () => {
  it('uses a 14-day window', () => {
    expect(STATION_JOB_RETENTION_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('keeps recent jobs and drops older than 14 days', () => {
    const now = Date.UTC(2026, 6, 10);
    const jobs = [
      { batchKey: 'new', sentAt: now - 1000 },
      { batchKey: 'edge', sentAt: stationJobExpiryCutoff(now) },
      { batchKey: 'old', sentAt: stationJobExpiryCutoff(now) - 1 },
    ];
    expect(retainActiveStationJobs(jobs, now).map((j) => j.batchKey)).toEqual(['new', 'edge']);
  });
});

describe('filterStationJobs', () => {
  const jobs = [
    {
      batchKey: 'FAA_CFB_602648',
      materialName: 'FAA: 3/4" Maple',
      orders: ['602648'],
    },
    {
      batchKey: 'SLD_CFB_602629',
      materialName: 'PF: 1/2" Maple White',
      orders: ['602629'],
    },
    {
      batchKey: 'SPECIAL_PLY_CFB_602627',
      materialName: 'PF: 12MM Baltic Birch Ply',
      orders: ['602627', '602637', '602649'],
    },
  ];

  it('filters by batch key substring', () => {
    expect(filterStationJobs(jobs, { query: '602648' }).map((j) => j.batchKey)).toEqual([
      'FAA_CFB_602648',
    ]);
    expect(filterStationJobs(jobs, { query: 'SPECIAL' })).toHaveLength(1);
  });

  it('filters by order number', () => {
    expect(filterStationJobs(jobs, { query: '602637' }).map((j) => j.batchKey)).toEqual([
      'SPECIAL_PLY_CFB_602627',
    ]);
  });

  it('filters by material dropdown value', () => {
    expect(
      filterStationJobs(jobs, { material: 'PF: 1/2" Maple White' }).map((j) => j.batchKey)
    ).toEqual(['SLD_CFB_602629']);
  });

  it('combines search and material', () => {
    expect(
      filterStationJobs(jobs, {
        query: '602',
        material: 'PF: 12MM Baltic Birch Ply',
      }).map((j) => j.batchKey)
    ).toEqual(['SPECIAL_PLY_CFB_602627']);
  });
});

describe('uniqueStationMaterials', () => {
  it('returns sorted unique materials', () => {
    expect(
      uniqueStationMaterials([
        { materialName: 'B' },
        { materialName: 'A' },
        { materialName: 'B' },
        { materialName: '' },
      ])
    ).toEqual(['A', 'B']);
  });
});

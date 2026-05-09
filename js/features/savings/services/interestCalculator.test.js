import { describe, it, expect } from 'vitest';
import {
  getPeriodsPerYear,
  periodicRate,
  periodInterest,
  projectedYearlyInterest,
} from './interestCalculator.js';

describe('getPeriodsPerYear', () => {
  it('uses 12 for the accelerated model (1 uke = 1 måned)', () => {
    expect(getPeriodsPerYear('accelerated')).toBe(12);
  });

  it('uses 52 for the realistic model (1 uke = 1 uke)', () => {
    expect(getPeriodsPerYear('realistic')).toBe(52);
  });

  it('defaults to 12 when timeModel is undefined', () => {
    expect(getPeriodsPerYear(undefined)).toBe(12);
  });
});

describe('periodicRate', () => {
  it('converts annual % to a per-period decimal', () => {
    expect(periodicRate(2, 12)).toBeCloseTo(0.001666, 5);
  });

  it('returns 0 for invalid input', () => {
    expect(periodicRate(NaN, 12)).toBe(0);
    expect(periodicRate(2, 0)).toBe(0);
    expect(periodicRate(2, -1)).toBe(0);
  });
});

describe('periodInterest — Math.round vs Math.floor invariant', () => {
  // periodicRate(2, 12) ≈ 0.001666
  const rate = periodicRate(2, 12);

  it('still earns 1 KKr on a 600 KKr balance (round vs floor would both be 1)', () => {
    expect(periodInterest(600, rate)).toBe(1);
  });

  it('rounds 300 * 0.001666 = 0.5 to 1 (Math.round); Math.floor would give 0', () => {
    // 300 * 0.001666 = 0.4998 — actually rounds DOWN to 0 with both!
    // The genuine round-vs-floor case is: 301 * 0.001666 = 0.5014 → round 1, floor 0.
    expect(periodInterest(301, rate)).toBe(1);
  });

  it('rounds away from zero properly: 1000 KKr at 2% / 12 = 1.666... → 2', () => {
    expect(periodInterest(1000, rate)).toBe(2);
  });

  it('returns 0 for empty/negative balances', () => {
    expect(periodInterest(0, rate)).toBe(0);
    expect(periodInterest(-100, rate)).toBe(0);
    expect(periodInterest(50, 0)).toBe(0);
  });

  it('rejects non-numeric input gracefully', () => {
    expect(periodInterest(NaN, rate)).toBe(0);
    expect(periodInterest(100, NaN)).toBe(0);
  });
});

describe('projectedYearlyInterest', () => {
  it('reports yearly interest per account and total', () => {
    const result = projectedYearlyInterest(
      [
        { userId: 's1', balance: 1000 },
        { userId: 's2', balance: 500 },
        { userId: 's3', balance: 0 },
      ],
      2
    );
    expect(result.total).toBe(30); // 20 + 10 + 0
    expect(result.breakdown).toHaveLength(3);
    expect(result.breakdown[0].projectedYearlyInterest).toBe(20);
    expect(result.breakdown[2].projectedYearlyInterest).toBe(0);
  });

  it('handles missing accounts argument', () => {
    expect(projectedYearlyInterest(null, 2)).toEqual({ total: 0, breakdown: [] });
    expect(projectedYearlyInterest(undefined, 2)).toEqual({ total: 0, breakdown: [] });
  });
});

/**
 * Tester for tax-beregningslogikken.
 *
 * Vi mocker dataService og firebaseService slik at vi kan importere
 * taxService uten at Firebase faktisk kjøres. Bare den rene
 * skattelogikken testes her — full integrasjonstesting hører hjemme
 * i en egen test-svit som bruker Firebase-emulatoren.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock browser-globals som services-laget ofte rører ved på import.
vi.stubGlobal('window', {
  addEventListener: () => {},
  dispatchEvent: () => {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.stubGlobal('document', {
  documentElement: { lang: 'no' },
  querySelectorAll: () => [],
  addEventListener: () => {},
});

// Mock data-laget — taxService trenger ikke Firebase for ren math.
vi.mock('../../../shared/core/dataService.js', () => ({
  dataService: {
    getClassroomData: () => null,
    getUserById: () => null,
    getCurrentClassroomId: () => 'demo-classroom',
  },
}));

vi.mock('../../../shared/core/eventBus.js', () => ({
  eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  EVENTS: {},
}));

vi.mock('../../i18n/index.js', () => ({
  languageService: { t: (key) => key },
  default: { t: (key) => key },
}));

const { taxService } = await import('./taxService.js');

describe('taxService.calculateProgressiveTax', () => {
  const standardBrackets = [
    { min: 0, max: 500, rate: 0 },
    { min: 501, max: 1500, rate: 25 },
    { min: 1501, max: Infinity, rate: 35 },
  ];

  it('charges nothing on income below the first bracket cutoff', () => {
    const result = taxService.calculateProgressiveTax(400, standardBrackets);
    expect(result.taxAmount).toBe(0);
  });

  it('only taxes the second bracket once income exceeds 500', () => {
    // 1000 KKr: 0 KKr in 0..500 (0%), 500 KKr in 501..1000 (25%)
    // Bracket sizes are inclusive, so 501..1000 = 500 entries → 125 KKr tax.
    const result = taxService.calculateProgressiveTax(1000, standardBrackets);
    expect(result.taxAmount).toBe(125);
  });

  it('applies all three brackets at high income', () => {
    // 2000 KKr:
    //   0..500 = 501 entries × 0% = 0
    //   501..1500 = 1000 entries × 25% = 250
    //   1501..2000 = 500 entries × 35% = 175
    // Total = 425
    const result = taxService.calculateProgressiveTax(2000, standardBrackets);
    expect(result.taxAmount).toBe(425);
  });

  it('reports a breakdown with the brackets that were applied', () => {
    const result = taxService.calculateProgressiveTax(2000, standardBrackets);
    expect(result.breakdown).toHaveLength(3);
    expect(result.breakdown[0].rate).toBe(0);
    expect(result.breakdown[1].rate).toBe(25);
    expect(result.breakdown[2].rate).toBe(35);
  });

  it('treats Infinity in the top bracket as open-ended', () => {
    const result = taxService.calculateProgressiveTax(5000, standardBrackets);
    // Bracket 3: 1501..5000 = 3500 × 35% = 1225, plus bracket 2 = 250
    expect(result.taxAmount).toBe(1475);
  });

  it('returns a zero effective rate on zero income', () => {
    const result = taxService.calculateProgressiveTax(0, standardBrackets);
    expect(result.effectiveRate).toBe(0);
  });

  it('survives a malformed bracket array without crashing', () => {
    const result = taxService.calculateProgressiveTax(1000, [
      { min: 0, max: null, rate: 'abc' }, // invalid rate, no max
    ]);
    expect(typeof result.taxAmount).toBe('number');
    expect(Number.isFinite(result.taxAmount)).toBe(true);
  });
});

describe('taxService.calculateTax (with cached settings)', () => {
  beforeEach(() => {
    // Stub the cached settings the calculation uses.
    taxService.getSettingsSync = vi.fn();
  });

  it('returns zero tax when the system is disabled', () => {
    taxService.getSettingsSync.mockReturnValue({ enabled: false });
    const result = taxService.calculateTax(1000);
    expect(result.taxAmount).toBe(0);
  });

  it('applies the flat rate when configured', () => {
    taxService.getSettingsSync.mockReturnValue({
      enabled: true,
      type: 'flat',
      flatRate: 20,
    });
    const result = taxService.calculateTax(1000);
    expect(result.taxAmount).toBe(200);
    expect(result.effectiveRate).toBe(20);
  });

  it('honours the deduction parameter', () => {
    taxService.getSettingsSync.mockReturnValue({
      enabled: true,
      type: 'flat',
      flatRate: 25,
    });
    // 1000 - 500 deduction = 500 taxable, 25% = 125
    const result = taxService.calculateTax(1000, 500);
    expect(result.taxAmount).toBe(125);
  });

  it('clamps a negative taxable amount at zero (deduction > income)', () => {
    taxService.getSettingsSync.mockReturnValue({
      enabled: true,
      type: 'flat',
      flatRate: 30,
    });
    const result = taxService.calculateTax(200, 500);
    expect(result.taxAmount).toBe(0);
  });

  it('routes to progressive calculation when configured', () => {
    taxService.getSettingsSync.mockReturnValue({
      enabled: true,
      type: 'progressive',
      brackets: [
        { min: 0, max: 500, rate: 0 },
        { min: 501, max: Infinity, rate: 30 },
      ],
    });
    const result = taxService.calculateTax(1000);
    // 501..1000 = 500 entries × 30% = 150
    expect(result.taxAmount).toBe(150);
  });
});

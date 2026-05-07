/**
 * Pure interest math for the savings feature.
 *
 * Extracted as a stand-alone module so the formula can be tested in
 * isolation. Both savingsService (sparerente) and the fund flow
 * (kvartalsvis avkastning) eventually delegate the per-account math
 * to functions defined here.
 *
 * KRITISK INVARIANT: bruk Math.round, IKKE Math.floor. Ellers får
 * lave saldoer aldri rente — f.eks. 50 KKr * 0.0017 = 0.083 → floor = 0,
 * round = 0 også. Men 200 KKr * 0.0017 = 0.34 → floor = 0, round = 0.
 * For 600 KKr * 0.0017 = 1.02 → floor = 1, round = 1. For mindre
 * markante tilfeller med periode-rate ~0.5 KKr blir round = 1, floor = 0.
 */

/**
 * Antall renteperioder per år, basert på simulering-modell.
 *
 * @param {'accelerated' | 'realistic' | undefined} timeModel
 * @returns {number}
 */
export function getPeriodsPerYear(timeModel) {
  return timeModel === 'realistic' ? 52 : 12;
}

/**
 * Periodisk rente (per uke i accelerated, per uke i realistic).
 *
 * @param {number} annualRatePercent  - Årlig rente i %
 * @param {number} periodsPerYear     - Antall perioder per år (52 eller 12)
 * @returns {number} desimal-rate per periode
 */
export function periodicRate(annualRatePercent, periodsPerYear) {
  if (!Number.isFinite(annualRatePercent) || !Number.isFinite(periodsPerYear) || periodsPerYear <= 0) {
    return 0;
  }
  return annualRatePercent / 100 / periodsPerYear;
}

/**
 * Beregn renteinntekt på en konto for én periode.
 *
 * Bruker Math.round for å unngå at lave saldoer aldri tjener rente.
 * Returnerer 0 for ikke-positive saldoer.
 *
 * @param {number} balance
 * @param {number} ratePerPeriod
 * @returns {number} avrundet renteinntekt for perioden
 */
export function periodInterest(balance, ratePerPeriod) {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  if (!Number.isFinite(ratePerPeriod) || ratePerPeriod <= 0) return 0;
  return Math.round(balance * ratePerPeriod);
}

/**
 * Beregn årlig rente for hele klassen.
 *
 * Tar et knippe kontoer og returnerer en sum + breakdown per konto.
 * Brukes ikke i hovedflyten for periodebetalinger (de skjer per uke),
 * men er nyttig for prognoser og rapporter i lærer-dashboard.
 *
 * @param {Array<{ userId: string, balance: number }>} accounts
 * @param {number} annualRatePercent
 * @returns {{ total: number, breakdown: Array<{ userId: string, balance: number, projectedYearlyInterest: number }> }}
 */
export function projectedYearlyInterest(accounts, annualRatePercent) {
  if (!Array.isArray(accounts)) return { total: 0, breakdown: [] };

  const breakdown = accounts.map((account) => {
    const projectedYearlyInterest =
      account.balance > 0 ? Math.round(account.balance * (annualRatePercent / 100)) : 0;
    return {
      userId: account.userId,
      balance: account.balance,
      projectedYearlyInterest,
    };
  });

  const total = breakdown.reduce((sum, row) => sum + row.projectedYearlyInterest, 0);
  return { total, breakdown };
}

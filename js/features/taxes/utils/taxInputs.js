/**
 * Taxes — rene hjelpefunksjoner for skatteberegning.
 *
 * Ekstrahert fra main.js. Merk: `getNormalizedProgressiveTaxInputs`
 * leser fra DOM og er derfor IKKE flyttet hit (ikke ren).
 */

/**
 * Beregn antall enheter som faller innenfor et inkluderende
 * skattetrinn-intervall.
 *
 * @param {number} income
 * @param {number} minInclusive
 * @param {number | null} [maxInclusive=null]
 * @returns {number}
 */
export function computeTaxableRangeAmount(income, minInclusive, maxInclusive = null) {
  if (!Number.isFinite(income) || income < minInclusive) return 0;
  const upper = maxInclusive === null ? income : Math.min(income, maxInclusive);
  if (upper < minInclusive) return 0;
  return upper - minInclusive + 1;
}

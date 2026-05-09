/**
 * Stats — rene hjelpefunksjoner for beregning og kategorisering.
 *
 * Ekstrahert fra main.js som ledd i refaktoreringen til feature-mapper.
 * Disse funksjonene er rene: ingen `this`, ingen DOM-tilgang og ingen
 * intern state.
 */

/**
 * Returnerer standard antall perioder for en gitt visning.
 *
 * @param {'day' | 'week' | 'month' | 'year'} view
 * @returns {number}
 */
export function getDefaultStatsCount(view) {
  const defaultCount = {
    day: 7,
    week: 8,
    month: 12,
    year: 5,
  };
  return defaultCount[view] || 7;
}

/**
 * Returnerer et menneskelesbart navn på en periode.
 *
 * @param {'day' | 'week' | 'month' | 'year'} view
 * @returns {string}
 */
export function getLoginPeriodLabel(view) {
  const labels = {
    day: 'Dag',
    week: 'Uke',
    month: 'Måned',
    year: 'År',
  };
  return labels[view] || 'Periode';
}

/**
 * Beregn Gini-koeffisient (ulikhets-mål) for en sortert liste verdier.
 * Verdier må være sortert stigende for korrekt resultat.
 *
 * @param {number[]} sortedValues
 * @returns {number}
 */
export function calculateGiniCoefficient(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) return 0;

  const sum = sortedValues.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedValues[i];
  }

  return giniSum / (n * sum);
}

/**
 * Hent ISO-ukenummer fra en dato.
 *
 * @param {Date} date
 * @returns {number}
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Beregn ukentlig transaksjonsvolum fra en liste transaksjoner.
 *
 * @param {Array<{ timestamp?: number|string, createdAt?: number|string, amount?: number }>} transactions
 * @returns {Array<{ week: string|number, volume: number }>}
 */
export function calculateWeeklyTransactionVolume(transactions) {
  const weekMap = new Map();

  transactions.forEach((t) => {
    const date = new Date(t.timestamp || t.createdAt);
    const weekNum = getWeekNumber(date);
    const key = `${date.getFullYear()}-${weekNum}`;
    weekMap.set(key, (weekMap.get(key) || 0) + (t.amount || 0));
  });

  const weeks = Array.from(weekMap.entries())
    .map(([key, volume]) => ({ week: key.split('-')[1], volume }))
    .slice(-8);

  return weeks.length > 0 ? weeks : [{ week: 1, volume: 0 }];
}

/**
 * Kategoriser inntekter basert på beskrivelse i transaksjon.
 *
 * @param {Array<{ amount?: number, toId?: string, description?: string }>} transactions
 * @returns {{ labels: string[], values: number[] }}
 */
export function categorizeIncome(transactions) {
  const categories = {
    'Lønn': 0,
    'Overføringer': 0,
    'Bedrift': 0,
    'Annet': 0,
  };

  transactions.forEach((t) => {
    if (t.amount > 0 && t.toId) {
      const desc = (t.description || '').toLowerCase();
      if (desc.includes('lønn') || desc.includes('salary')) {
        categories['Lønn'] += t.amount;
      } else if (desc.includes('overføring') || desc.includes('transfer')) {
        categories['Overføringer'] += t.amount;
      } else if (desc.includes('bedrift') || desc.includes('business')) {
        categories['Bedrift'] += t.amount;
      } else {
        categories['Annet'] += t.amount;
      }
    }
  });

  return {
    labels: Object.keys(categories),
    values: Object.values(categories),
  };
}

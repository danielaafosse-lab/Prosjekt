/**
 * Businesses — vekstindikator-hjelpere.
 *
 * Ekstrahert fra main.js. Disse er rene funksjoner uten avhengigheter.
 */

/**
 * Beregn prosentvis endring i bedriftssaldo siste 7 dager.
 *
 * @param {{ balance?: number, transactions?: Array<{ date?: string|number, timestamp?: string|number, createdAt?: string|number, amount?: number, type?: string }> }} business
 * @returns {{ growthPct: number, weeklyNetChange: number, previousBalance: number }}
 */
export function getBusinessWeeklyGrowth(business) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const transactions = Array.isArray(business?.transactions) ? business.transactions : [];

  const weeklyNetChange = transactions.reduce((sum, tx) => {
    const txDate = tx?.date || tx?.timestamp || tx?.createdAt;
    if (!txDate) return sum;
    const txTime = new Date(txDate).getTime();
    if (Number.isNaN(txTime) || (now - txTime) > sevenDaysMs) return sum;

    const amount = Math.abs(Number(tx.amount) || 0);
    const sign = tx.type === 'expense' || tx.type === 'withdrawal' || tx.type === 'loss' ? -1 : 1;
    return sum + (sign * amount);
  }, 0);

  const currentBalance = Number(business?.balance) || 0;
  const previousBalance = currentBalance - weeklyNetChange;

  let growthPct = 0;
  if (Math.abs(previousBalance) >= 1) {
    growthPct = (weeklyNetChange / previousBalance) * 100;
  } else if (Math.abs(weeklyNetChange) >= 1) {
    growthPct = weeklyNetChange > 0 ? 100 : -100;
  }

  // Unngå ekstreme utslag i UI-rangering
  growthPct = Math.max(-300, Math.min(300, growthPct));

  return {
    growthPct,
    weeklyNetChange,
    previousBalance,
  };
}

/**
 * Returner pil + fargeklasse + tekst for vekstindikator.
 *
 * @param {number} growthPct
 * @returns {{ arrow: string, className: string, label: string }}
 */
export function getGrowthIndicator(growthPct) {
  if (growthPct >= 2) {
    return { arrow: '⬆️', className: 'text-green-600', label: 'Sterk vekst' };
  }
  if (growthPct >= 0.5) {
    return { arrow: '↗️', className: 'text-cyan-600', label: 'Mild vekst' };
  }
  if (growthPct <= -2) {
    return { arrow: '⬇️', className: 'text-red-600', label: 'Sterk nedgang' };
  }
  if (growthPct <= -0.5) {
    return { arrow: '↘️', className: 'text-orange-600', label: 'Mild nedgang' };
  }
  return { arrow: '➡️', className: 'text-yellow-600', label: 'Flat utvikling' };
}

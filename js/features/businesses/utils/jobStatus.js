/**
 * Businesses — fargehjelper for jobbstatus.
 *
 * Ekstrahert fra main.js.
 */

/**
 * Hent Tailwind-fargeklasse for jobbstatus.
 *
 * @param {'open' | 'offered' | 'active' | 'completed' | string} status
 * @returns {string}
 */
export function getJobStatusColor(status) {
  switch (status) {
    case 'open': return 'border-blue-500';
    case 'offered': return 'border-amber-500';
    case 'active': return 'border-green-500';
    case 'completed': return 'border-gray-400';
    default: return 'border-gray-300';
  }
}

/**
 * Loans — spørrings-hjelpere.
 *
 * Ekstrahert fra main.js. Tar dataService inn som parameter for
 * eksplisitt avhengighet og lett testbarhet.
 */

/**
 * Hent lånesøknader for en bestemt bruker eller bedrift.
 *
 * @param {string} userId
 * @param {{ getLoanApplicationsForUser: (id: string) => Promise<Array<object>> }} dataService
 * @returns {Promise<Array<object>>}
 */
export async function getLoanApplicationsForUser(userId, dataService) {
  return await dataService.getLoanApplicationsForUser(userId);
}

/**
 * Loans — render-hjelper for låne-rad.
 *
 * Ekstrahert fra main.js. Returnerer ren HTML-streng.
 * dataService, businessService og languageService sendes inn for å
 * holde modulen fri for hardkodede avhengigheter.
 */

import { escapeHtml } from '../../../shared/utils/helpers.js';
import { formatCurrency } from '../../../shared/utils/formatters.js';

/**
 * Render en lånerad som HTML.
 *
 * @param {object} loan
 * @param {string} currencySymbol
 * @param {{
 *   dataService: { getUserById: (id: string) => object | null },
 *   businessService: { getBusinessById: (id: string) => object | null },
 *   languageService: { t: (key: string) => string }
 * }} deps
 * @returns {string}
 */
export function renderLoanRow(loan, currencySymbol, deps) {
  const { dataService, businessService, languageService } = deps;

  const borrower = loan.borrowerType === 'student'
    ? dataService.getUserById(loan.borrowerId)
    : businessService.getBusinessById(loan.borrowerId);
  const borrowerName = borrower
    ? (borrower.name || languageService.t('common.unknown'))
    : languageService.t('common.unknown');
  const statusClass = loan.status === 'active'
    ? 'bg-green-100 text-green-800'
    : loan.status === 'overdue'
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-800';
  const statusText = loan.status === 'active'
    ? languageService.t('common.active')
    : loan.status === 'overdue'
      ? languageService.t('loans.overdue')
      : loan.status === 'paid_off'
        ? languageService.t('loans.paidOff')
        : loan.status;

  return `
      <tr class="border-b hover:bg-gray-50">
        <td class="py-3 px-2">${escapeHtml(borrowerName)}</td>
        <td class="py-3 px-2">${formatCurrency(loan.principalAmount, currencySymbol)}</td>
        <td class="py-3 px-2">${formatCurrency(loan.remainingBalance, currencySymbol)}</td>
        <td class="py-3 px-2">${loan.interestRate}%</td>
        <td class="py-3 px-2"><span class="px-2 py-1 rounded text-xs ${statusClass}">${statusText}</span></td>
      </tr>
    `;
}

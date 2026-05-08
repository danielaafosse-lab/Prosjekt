/**
 * taxes controller methods — extracted from EconSimApp.
 * Merged into EconSimApp.prototype in main.js so `this.*` and
 * `window.econSim.method()` continue to work.
 */

import { authService } from '../../auth/index.js';
import { dataService } from '../../../shared/core/dataService.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { formatCurrency, formatDate } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';
import { settingsService } from '../../settings/index.js';
import { taxService, computeTaxableRangeAmount } from '../index.js';
import { languageService } from '../../i18n/index.js';

export const taxesControllerMethods = {
  /**
   * Last skatteoversikt for lærer
   */
  async loadTeacherTax() {
    const balanceEl = document.getElementById('taxAccountBalance');
    const transactionsEl = document.getElementById('taxTransactionsBody');
    const taxThisWeekEl = document.getElementById('taxThisWeek');
    const taxTotalEl = document.getElementById('taxTotal');
    const taxSpentTotalEl = document.getElementById('taxSpentTotal');

    // Refresh taxService cache fra Firebase
    await taxService.loadTaxAccountAsync();

    // Sørg for at settings er lastet
    if (!this.settings) {
      this.settings = await settingsService.getSettings();
    }
    const currencySymbol = this.settings?.currencySymbol || 'KKr';

    if (!(await taxService.isEnabled())) {
      if (balanceEl) { balanceEl.setAttribute('data-i18n', 'ui.deactivated'); balanceEl.textContent = languageService.t('ui.deactivated'); }
      if (transactionsEl) transactionsEl.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 py-8" data-i18n="ui.taxSystemDisabled">${languageService.t('ui.taxSystemDisabled')}</td></tr>`;
      if (taxThisWeekEl) taxThisWeekEl.textContent = `0 ${currencySymbol}`;
      if (taxTotalEl) taxTotalEl.textContent = `0 ${currencySymbol}`;
      if (taxSpentTotalEl) taxSpentTotalEl.textContent = `0 ${currencySymbol}`;
      return;
    }

    // Saldo
    if (balanceEl) {
      balanceEl.textContent = formatCurrency(taxService.getTaxAccountBalance(), currencySymbol);
    }

    // Transaksjoner
    const transactions = taxService.getAllTaxTransactions();

    // Beregn statistikk
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const incomeTransactions = transactions.filter(t => t.type === 'income');
    const expenseTransactions = transactions.filter(t => t.type === 'expense');

    const thisWeekIncome = incomeTransactions
      .filter(t => new Date(t.date) >= oneWeekAgo)
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalIncome = incomeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalExpense = expenseTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Oppdater statistikk-elementer
    if (taxThisWeekEl) taxThisWeekEl.textContent = formatCurrency(thisWeekIncome, currencySymbol);
    if (taxTotalEl) taxTotalEl.textContent = formatCurrency(totalIncome, currencySymbol);
    if (taxSpentTotalEl) taxSpentTotalEl.textContent = formatCurrency(totalExpense, currencySymbol);

    if (transactionsEl) {
      if (transactions.length === 0) {
        transactionsEl.innerHTML = '<tr><td colspan="4" class="text-center text-gray-500 py-8">Ingen skattetransaksjoner</td></tr>';
      } else {
        transactionsEl.innerHTML = transactions.slice(0, 50).map(t => {
          // Bruk fromName direkte fra transaksjonen (Firebase lagrer dette)
          const senderName = t.fromName || t.fromUserId || '-';
          return `
            <tr class="border-b">
              <td class="py-2 px-2 text-sm">${formatDate(t.date)}</td>
              <td class="py-2 px-2 text-sm">${escapeHtml(t.description || '')}</td>
              <td class="py-2 px-2 text-sm">${escapeHtml(senderName)}</td>
              <td class="py-2 px-2 text-sm ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}">
                ${t.type === 'income' ? '+' : ''}${formatCurrency(Math.abs(t.amount), currencySymbol)}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  /**
   * Vis skattemelding detaljer
   */
  async viewTaxStatement(statementId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);

    const statement = inbox.find(m => m.id === statementId);
    if (!statement || statement.type !== 'tax_statement') return;

    // Marker som lest
    try {
      await dataService.markMessageAsRead(statementId, 'inbox');
    } catch (e) {
      console.error('Firebase feilet ved markering av skattemelding som lest:', e);
    }

    // Vis detaljer i en alert eller modal
    let details = `📋 SKATTEMELDING\n\n`;
    details += `Periode: ${statement.period || 'Ukjent'}\n\n`;
    details += `💰 INNTEKTER:\n`;

    if (statement.data?.incomes && statement.data.incomes.length > 0) {
      statement.data.incomes.forEach(inc => {
        details += `  • ${inc.source}: ${formatCurrency(inc.amount, this.settings.currencySymbol)}\n`;
      });
      details += `\n  Total inntekt: ${formatCurrency(statement.data.totalIncome || 0, this.settings.currencySymbol)}\n`;
    } else {
      details += `  Ingen registrerte inntekter\n`;
    }

    details += `\n🏛️ SKATT:\n`;
    details += `  Betalt skatt: ${formatCurrency(statement.data?.totalTax || 0, this.settings.currencySymbol)}\n`;

    if (statement.data?.effectiveRate) {
      details += `  Effektiv skattesats: ${statement.data.effectiveRate}%\n`;
    }

    alert(details);
    await this.loadStudentInbox();
  },

  /**
   * Oppdater dynamiske etiketter for skattetrinn
   */
  getNormalizedProgressiveTaxInputs() {
    const b1MaxEl = document.getElementById('taxBracket1Max');
    const b2MaxEl = document.getElementById('taxBracket2Max');
    const b2RateEl = document.getElementById('taxBracket2Rate');
    const b3RateEl = document.getElementById('taxBracket3Rate');

    let b1Max = parseInt(b1MaxEl?.value, 10);
    if (!Number.isFinite(b1Max)) b1Max = 500;
    b1Max = Math.max(0, b1Max);

    let b2Max = parseInt(b2MaxEl?.value, 10);
    if (!Number.isFinite(b2Max)) b2Max = 1500;
    b2Max = Math.max(b1Max + 1, b2Max);

    let b2Rate = parseInt(b2RateEl?.value, 10);
    if (!Number.isFinite(b2Rate)) b2Rate = 25;
    b2Rate = Math.max(0, Math.min(100, b2Rate));

    let b3Rate = parseInt(b3RateEl?.value, 10);
    if (!Number.isFinite(b3Rate)) b3Rate = 35;
    b3Rate = Math.max(0, Math.min(100, b3Rate));

    return { b1Max, b2Max, b2Rate, b3Rate };
  },

  updateTaxExamplePreview() {
    const exampleEl = document.getElementById('taxExamplePreview');
    if (!exampleEl) return;

    let b1Max = parseInt(document.getElementById('taxBracket1Max')?.value, 10);
    let b2Max = parseInt(document.getElementById('taxBracket2Max')?.value, 10);
    const b2Rate = Math.max(0, Math.min(100, parseInt(document.getElementById('taxBracket2Rate')?.value, 10) || 25));
    const b3Rate = Math.max(0, Math.min(100, parseInt(document.getElementById('taxBracket3Rate')?.value, 10) || 35));

    if (!Number.isFinite(b1Max) || b1Max < 0) b1Max = 0;
    if (!Number.isFinite(b2Max) || b2Max <= b1Max) {
      exampleEl.textContent = languageService.t('settings.taxExample');
      return;
    }

    const exampleIncome = 3000;
    const taxableInBracket2 = computeTaxableRangeAmount(exampleIncome, b1Max + 1, b2Max);
    const taxableInBracket3 = computeTaxableRangeAmount(exampleIncome, b2Max + 1, null);
    const taxInBracket2 = Math.floor(taxableInBracket2 * (b2Rate / 100));
    const taxInBracket3 = Math.floor(taxableInBracket3 * (b3Rate / 100));
    const totalTax = taxInBracket2 + taxInBracket3;

    exampleEl.textContent = `Eks: Ved ${exampleIncome} KKr lønn betales: 0 + (${taxableInBracket2}×${b2Rate}%) + (${taxableInBracket3}×${b3Rate}%) = ${totalTax} KKr i skatt`;
  },

  updateTaxBracketLabels() {
    const b1Raw = parseInt(document.getElementById('taxBracket1Max')?.value, 10);
    const b2Raw = parseInt(document.getElementById('taxBracket2Max')?.value, 10);
    const b1Max = (Number.isFinite(b1Raw) && b1Raw >= 0) ? b1Raw : 500;
    const b2Max = (Number.isFinite(b2Raw) && b2Raw >= 0) ? b2Raw : 1500;

    const bracket2StartEl = document.getElementById('bracket2Start');
    const bracket3StartEl = document.getElementById('bracket3Start');
    if (bracket2StartEl) bracket2StartEl.textContent = (b1Max + 1).toString();
    if (bracket3StartEl) bracket3StartEl.textContent = (b2Max + 1) + '+';

    this.updateTaxExamplePreview();
  },

  /**
   * Utbetal fra skattekonto
   */
  async disburseTaxFunds() {
    const amount = parseInt(prompt(languageService.t('tax.amountToDisburse') || 'Beløp å utbetale:'));
    if (!amount || amount <= 0) return;

    const description = prompt(languageService.t('tax.description') || 'Beskrivelse (f.eks. "Klassetur"):') || languageService.t('tax.disbursement') || 'Utbetaling';

    try {
      await taxService.disburseTaxFunds(amount, description);
      uiManager.showSuccess(languageService.t('msg.paidFromTaxAccount'));
      this.loadTeacherTax();
    } catch (error) {
      uiManager.showError(error.message);
    }
  },
};

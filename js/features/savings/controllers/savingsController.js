/**
 * savings controller methods — extracted from EconSimApp.
 * Merged into EconSimApp.prototype in main.js so `this.*` and
 * `window.econSim.method()` continue to work.
 */

import { authService } from '../../auth/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { formatCurrency } from '../../../shared/utils/formatters.js';
import { savingsService } from '../index.js';
import { languageService } from '../../i18n/index.js';

export const savingsControllerMethods = {
  /**
   * Last sparing/fond for elev
   */
  async loadStudentSavings() {
    const user = authService.getCurrentUser();

    // Oppdater brukskonto i savings-view
    const privateBalanceEl = document.getElementById('savingsPrivateBalance');
    const privateAccountEl = document.getElementById('savingsPrivateAccount');
    if (privateBalanceEl) {
      privateBalanceEl.textContent = formatCurrency(user.balance, this.settings.currencySymbol);
    }
    if (privateAccountEl) {
      privateAccountEl.textContent = user.accountNumber;
    }

    // Sparekonto
    const savingsAccount = savingsService.getSavingsAccountByUser(user.id);
    const savingsBalanceEl = document.getElementById('savingsSavingsBalance');
    const savingsAccountEl = document.getElementById('savingsSavingsAccount');
    const savingsRateEl = document.getElementById('savingsInterestRate');

    if (savingsBalanceEl) {
      savingsBalanceEl.textContent = formatCurrency(savingsAccount?.balance || 0, this.settings.currencySymbol);
    }
    if (savingsAccountEl && savingsAccount) {
      savingsAccountEl.textContent = savingsAccount.accountNumber;
    }
    if (savingsRateEl) {
      const settings = await savingsService.getSettings();
      savingsRateEl.textContent = settings.savings.annualRate + '%';
    }

    // Fondskonto
    const fundAccount = savingsService.getFundAccountByUser(user.id);
    const fundBalanceEl = document.getElementById('savingsFundBalance');
    const fundAccountEl = document.getElementById('savingsFundAccount');
    const fundRateEl = document.getElementById('fundReturnRate');

    if (fundBalanceEl) {
      fundBalanceEl.textContent = formatCurrency(fundAccount?.balance || 0, this.settings.currencySymbol);
    }
    if (fundAccountEl && fundAccount) {
      fundAccountEl.textContent = fundAccount.accountNumber;
    }
    if (fundRateEl) {
      const settings = await savingsService.getSettings();
      fundRateEl.textContent = settings.funds.expectedReturn + '%';
    }

    // Rente- og avkastningshistorikk
    const historyContainer = document.getElementById('interestHistory');
    if (historyContainer) {
      const savingsTx = (savingsAccount?.transactions || [])
        .filter(t => t.type === 'interest')
        .map(t => ({ ...t, source: 'savings' }));
      const fundTx = (fundAccount?.transactions || [])
        .filter(t => t.type === 'return' || t.type === 'loss')
        .map(t => ({ ...t, source: 'fund' }));
      const combined = [...savingsTx, ...fundTx]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);
      if (combined.length === 0) {
        historyContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('common.noHistory')}</p>`;
      } else {
        const cur = this.settings?.currencySymbol || 'KKr';
        historyContainer.innerHTML = combined.map(t => {
          const pos = t.amount >= 0;
          const date = new Date(t.date).toLocaleDateString('nb-NO');
          const icon = t.source === 'savings' ? '🏦' : '📈';
          const label = t.source === 'savings'
            ? languageService.t('savings.interest')
            : (t.amount >= 0 ? languageService.t('savings.return') : '📉 ' + languageService.t('savings.return'));
          const rateStr = (t.rate != null) ? ` (${Number(t.rate).toFixed(1)}% p.a.)` : '';
          return `
            <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
              <div class="flex items-center gap-2">
                <span>${icon}</span>
                <div>
                  <p class="text-sm font-medium">${label}${rateStr}</p>
                  <p class="text-xs text-gray-500">${date}</p>
                </div>
              </div>
              <span class="font-medium ${pos ? 'text-green-600' : 'text-red-600'}">${pos ? '+' : ''}${formatCurrency(t.amount, cur)}</span>
            </div>`;
        }).join('');
      }
    }

    // Last lån hvis eleven har lån
    this.loadStudentLoans();
  },

  /**
   * Sett inn på sparekonto
   */
  async depositToSavings() {
    const amount = parseInt(document.getElementById('savingsDepositAmount')?.value);
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }

    const user = authService.getCurrentUser();
    try {
      await savingsService.depositToSavings(user.id, amount);
      await authService.refreshCurrentUser();
      uiManager.showSuccess(languageService.t('msg.transferredToSavings'));
      document.getElementById('savingsDepositAmount').value = '';
      await this.loadStudentSavings();
      await this.updateBalanceDisplay();
      this.loadStudentAccountsSummary();
    } catch (error) {
      uiManager.showError(error.message);
    }
  },

  /**
   * Ta ut fra sparekonto
   */
  async withdrawFromSavings() {
    const amount = parseInt(document.getElementById('savingsWithdrawAmount')?.value);
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }

    const user = authService.getCurrentUser();
    try {
      await savingsService.withdrawFromSavings(user.id, amount);
      await authService.refreshCurrentUser();
      uiManager.showSuccess(languageService.t('msg.transferredFromSavings'));
      document.getElementById('savingsWithdrawAmount').value = '';
      await this.loadStudentSavings();
      await this.updateBalanceDisplay();
      this.loadStudentAccountsSummary();
    } catch (error) {
      uiManager.showError(error.message);
    }
  },

  /**
   * Sett inn på fondskonto
   */
  async depositToFund() {
    const amount = parseInt(document.getElementById('fundDepositAmount')?.value);
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }

    const user = authService.getCurrentUser();
    try {
      await savingsService.depositToFund(user.id, amount);
      await authService.refreshCurrentUser();
      uiManager.showSuccess(languageService.t('msg.transferredToFund'));
      document.getElementById('fundDepositAmount').value = '';
      await this.loadStudentSavings();
      await this.updateBalanceDisplay();
      this.loadStudentAccountsSummary();
    } catch (error) {
      uiManager.showError(error.message);
    }
  },

  /**
   * Ta ut fra fondskonto
   */
  async withdrawFromFund() {
    const amount = parseInt(document.getElementById('fundWithdrawAmount')?.value);
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }

    const user = authService.getCurrentUser();
    try {
      await savingsService.withdrawFromFund(user.id, amount);
      await authService.refreshCurrentUser();
      uiManager.showSuccess(languageService.t('msg.transferredFromFund'));
      document.getElementById('fundWithdrawAmount').value = '';
      await this.loadStudentSavings();
      await this.updateBalanceDisplay();
      this.loadStudentAccountsSummary();
    } catch (error) {
      uiManager.showError(error.message);
    }
  },
};

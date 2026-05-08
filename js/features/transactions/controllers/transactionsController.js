/**
 * transactions controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 */

import { authService } from '../../auth/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { transactionService } from '../index.js';
import { languageService } from '../../i18n/index.js';
import { formatCurrency, formatRelativeTime, translateTransactionDescription } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const transactionsControllerMethods = {
  /**
   * Håndter pengeoverføring
   */
  async handleTransfer() {
    const accountNumber = document.getElementById('recipientAccount')?.value;
    const amount = document.getElementById('transferAmount')?.value;
    const message = document.getElementById('transferMessage')?.value;
    const form = document.getElementById('transferForm');
    const btn = form?.querySelector('button[type="submit"]');
    const originalHtml = btn?.innerHTML;

    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳...'; }

    try {
      await transactionService.transferMoney(accountNumber, parseFloat(amount), message);
      uiManager.showSuccess(languageService.t('msg.transferSuccess'));
      form?.reset();

      // Oppdater saldo og transaksjoner umiddelbart
      await this.refreshStudentDashboard();
    } catch (error) {
      console.error('Overføring feilet:', error);
      uiManager.showError(error.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
  },

  /**
   * Oppdater balance display
   */
  async updateBalanceDisplay() {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Refresh user data
    await authService.refreshCurrentUser();
    const updatedUser = authService.getCurrentUser();

    if (!updatedUser) return;

    // Oppdater studentBalance (elev dashboard)
    const studentBalanceEl = document.getElementById('studentBalance');
    if (studentBalanceEl) {
      studentBalanceEl.textContent = formatCurrency(updatedUser.balance, this.settings?.currencySymbol || 'KKr');
    }

    // Oppdater currentBalance (legacy)
    const currentBalanceEl = document.getElementById('currentBalance');
    if (currentBalanceEl) {
      currentBalanceEl.textContent = formatCurrency(updatedUser.balance, this.settings?.currencySymbol || 'KKr');
    }
  },

  /**
   * Oppdater currency display på tvers av UI
   */
  updateCurrencyDisplay() {
    document.querySelectorAll('[data-currency]').forEach(el => {
      const amount = parseFloat(el.dataset.amount);
      if (!isNaN(amount)) {
        el.textContent = formatCurrency(amount, this.settings.currencySymbol);
      }
    });
  },

  /**
   * Refresh transaksjoner
   */
  async refreshTransactions() {
    try {
      const transactions = await transactionService.getUserTransactions(10);
      this.renderTransactions(transactions);
    } catch (error) {
      console.error('Feil ved refresh av transaksjoner:', error);
    }
  },

  /**
   * Render transaksjoner
   */
  renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    if (!container) return;

    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-center py-4">${languageService.t('ui.noTransactionsYet')}</p>`;
      return;
    }

    const currentUser = authService.getCurrentUser();

    container.innerHTML = transactions.map(tx => {
      const isSender = tx.senderId === currentUser.id;
      const isRecipient = tx.recipientId === currentUser.id;
      const amountClass = isSender ? 'text-red-600' : 'text-green-600';
      const amountPrefix = isSender ? '-' : '+';
      const translatedMessage = tx.message ? translateTransactionDescription(tx.message) : '';

      return `
        <div class="border-b border-gray-200 py-3">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900">
                ${isSender ? `${languageService.t('transaction.to')} ${tx.recipientName}` : `${languageService.t('transaction.from')} ${tx.senderName}`}
              </p>
              ${translatedMessage ? `<p class="text-sm text-gray-500 mt-1">${translatedMessage}</p>` : ''}
              <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
            </div>
            <div class="text-right">
              <p class="${amountClass} font-semibold">${amountPrefix}${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Last student transaksjoner
   */
  async loadStudentTransactions() {
    try {
      const transactions = await transactionService.getUserTransactions(50);
      const container = document.getElementById('studentTransactions');

      if (!container) return;

      // Cache transaksjonene for søk
      this.cachedStudentTransactions = transactions;

      this.renderStudentTransactions(transactions);
    } catch (error) {
      console.error('Feil ved lasting av transaksjoner:', error);
    }
  },

  /**
   * Render student transaksjoner
   */
  renderStudentTransactions(transactions) {
    const container = document.getElementById('studentTransactions');
    if (!container) return;

    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noTransactionsYet')}</p>`;
      return;
    }

    const user = authService.getCurrentUser();
    container.innerHTML = transactions.map(tx => {
      const isSender = tx.senderId === user.id;
      const amountClass = isSender ? 'text-red-600' : 'text-green-600';
      const amountPrefix = isSender ? '-' : '+';

      // Hent navn og melding
      const rawName = isSender ? tx.recipientName : tx.senderName;
      const rawMessage = tx.message || '';
      const translatedMessage = rawMessage ? translateTransactionDescription(rawMessage) : '';

      // Sjekk om navnet er generisk eller om navnet er lik meldingen (gamle transaksjoner)
      const isGenericName = !rawName || rawName === 'Ukjent' || rawName === 'Unknown' ||
                            rawName === languageService.t('common.unknown');

      // Sjekk om navnet er en transaksjonsbeskrivelse (fra gamle transaksjoner)
      const nameIsDescription = rawName === rawMessage ||
                                rawName === translatedMessage ||
                                translateTransactionDescription(rawName) === translatedMessage;

      // Bestem hva som skal vises
      let displayName, displayMessage;

      if (isGenericName || nameIsDescription) {
        // Bruk meldingen som hovednavn, ikke vis melding separat
        displayName = translatedMessage || rawName || languageService.t('common.unknown');
        displayMessage = '';
      } else {
        // Ekte navn - vis begge hvis de er forskjellige
        displayName = rawName;
        displayMessage = translatedMessage;
      }

      const safeName = escapeHtml(displayName);
      const safeMessage = displayMessage ? escapeHtml(displayMessage) : '';

      return `
        <div class="flex justify-between items-center border-b border-gray-100 py-2">
          <div class="flex-1">
            <p class="text-sm font-medium">${safeName}</p>
            ${safeMessage ? `<p class="text-sm text-gray-600 mt-1">${safeMessage}</p>` : ''}
            <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
          </div>
          <div class="text-right ml-4">
            <p class="${amountClass} font-semibold">${amountPrefix}${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Filtrer student transaksjoner
   */
  filterStudentTransactions(searchTerm) {
    if (!searchTerm) {
      this.renderStudentTransactions(this.cachedStudentTransactions);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = this.cachedStudentTransactions.filter(tx => {
      const senderName = (tx.senderName || '').toLowerCase();
      const recipientName = (tx.recipientName || '').toLowerCase();
      const message = (tx.message || '').toLowerCase();
      const amount = tx.amount.toString();

      return senderName.includes(term) ||
             recipientName.includes(term) ||
             message.includes(term) ||
             amount.includes(term);
    });

    this.renderStudentTransactions(filtered);
  },

  /**
   * Last lærer transaksjoner
   */
  async loadTeacherTransactions() {
    try {
      const transactions = await transactionService.getAllTransactions(100);
      const container = document.getElementById('teacherTransactions');

      if (!container) return;

      // Cache transaksjonene for søk
      this.cachedTeacherTransactions = transactions;

      this.renderTeacherTransactions(transactions);
    } catch (error) {
      console.error('Feil ved lasting av lærer-transaksjoner:', error);
    }
  },

  /**
   * Render lærer transaksjoner
   */
  renderTeacherTransactions(transactions) {
    const container = document.getElementById('teacherTransactions');
    if (!container) return;

    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noTransactionsYet')}</p>`;
      return;
    }

    container.innerHTML = transactions.map(tx => {
      // Råverdier
      const rawSenderName = tx.senderName || '';
      const rawRecipientName = tx.recipientName || '';
      const rawMessage = tx.message || '';

      // Oversett meldingen
      const translatedMessage = rawMessage ? translateTransactionDescription(rawMessage) : '';

      // Sjekk om navn er generiske (Ukjent, Unknown, eller tomme)
      const isGenericSender = !rawSenderName || rawSenderName === 'Ukjent' || rawSenderName === 'Unknown' ||
                              rawSenderName === languageService.t('common.unknown');
      const isGenericRecipient = !rawRecipientName || rawRecipientName === 'Ukjent' || rawRecipientName === 'Unknown' ||
                                  rawRecipientName === languageService.t('common.unknown');

      // Sjekk om navn og melding er like (for å unngå dobbeltvisning av gamle transaksjoner)
      const isSenderSameAsMessage = rawSenderName && rawMessage && (
        rawSenderName.toLowerCase() === rawMessage.toLowerCase() ||
        rawSenderName.toLowerCase() === translatedMessage?.toLowerCase() ||
        translateTransactionDescription(rawSenderName).toLowerCase() === translatedMessage?.toLowerCase()
      );
      const isRecipientSameAsMessage = rawRecipientName && rawMessage && (
        rawRecipientName.toLowerCase() === rawMessage.toLowerCase() ||
        rawRecipientName.toLowerCase() === translatedMessage?.toLowerCase() ||
        translateTransactionDescription(rawRecipientName).toLowerCase() === translatedMessage?.toLowerCase()
      );

      // Bruk ekte navn eller meldingen som fallback
      const senderName = isGenericSender && translatedMessage ? translatedMessage : (rawSenderName || '→');
      const recipientName = isGenericRecipient && translatedMessage ? translatedMessage : (rawRecipientName || '→');

      // Escape all user-generated content to prevent XSS
      const safeSenderName = escapeHtml(senderName);
      const safeRecipientName = escapeHtml(recipientName);
      const safeMessage = translatedMessage ? escapeHtml(translatedMessage) : '';

      // Ikke vis message hvis: begge navn er generiske, ELLER en av navnene er likt meldingen
      const showMessage = safeMessage &&
        !(isGenericSender && isGenericRecipient) &&
        !isSenderSameAsMessage &&
        !isRecipientSameAsMessage;

      return `
        <div class="border-b border-gray-100 py-3">
          <div class="flex justify-between items-start mb-1">
            <div class="flex-1">
              <p class="text-sm font-medium">
                ${safeSenderName} → ${safeRecipientName}
              </p>
              ${showMessage ? `<p class="text-sm text-gray-600 mt-1">${safeMessage}</p>` : ''}
              <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
            </div>
            <div class="text-right ml-4">
              <p class="text-blue-600 font-semibold">${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Filtrer lærer transaksjoner
   */
  filterTeacherTransactions(searchTerm) {
    if (!searchTerm) {
      this.renderTeacherTransactions(this.cachedTeacherTransactions);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = this.cachedTeacherTransactions.filter(tx => {
      const senderName = (tx.senderName || '').toLowerCase();
      const recipientName = (tx.recipientName || '').toLowerCase();
      const message = (tx.message || '').toLowerCase();
      const amount = tx.amount.toString();

      return senderName.includes(term) ||
             recipientName.includes(term) ||
             message.includes(term) ||
             amount.includes(term);
    });

    this.renderTeacherTransactions(filtered);
  },

  /**
   * Last bedriftens transaksjoner
   */
  loadBusinessTransactions(business) {
    const container = document.getElementById('businessTransactionsList');
    if (!container) return;

    if (!business.transactions || business.transactions.length === 0) {
      this.cachedBusinessTransactions = [];
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('business.noTransactions')}</p>`;
      return;
    }

    // Sorter nyeste først og cache
    const sortedTransactions = [...business.transactions].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    this.cachedBusinessTransactions = sortedTransactions;
    this.renderBusinessTransactions(sortedTransactions);
  },

  /**
   * Render bedrifts-transaksjoner
   */
  renderBusinessTransactions(transactions) {
    const container = document.getElementById('businessTransactionsList');
    if (!container) return;

    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('business.noTransactions')}</p>`;
      return;
    }

    container.innerHTML = transactions.map(tx => {
      const isIncome = tx.type === 'income';
      const translatedDescription = translateTransactionDescription(tx.description);
      return `
        <div class="flex justify-between items-center py-2 border-b last:border-0">
          <div>
            <p class="text-sm">${escapeHtml(translatedDescription)}</p>
            <p class="text-xs text-gray-500">${new Date(tx.date).toLocaleDateString('nb-NO')}</p>
          </div>
          <span class="${isIncome ? 'text-green-600' : 'text-red-600'} font-medium">
            ${isIncome ? '+' : '-'}${formatCurrency(tx.amount, this.settings.currencySymbol)}
          </span>
        </div>
      `;
    }).join('');
  },

  /**
   * Filtrer bedrifts-transaksjoner
   */
  filterBusinessTransactions(searchTerm) {
    if (!searchTerm) {
      this.renderBusinessTransactions(this.cachedBusinessTransactions);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = this.cachedBusinessTransactions.filter(tx => {
      const description = (tx.description || '').toLowerCase();
      const amount = tx.amount.toString();

      return description.includes(term) || amount.includes(term);
    });

    this.renderBusinessTransactions(filtered);
  },
};

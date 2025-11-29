/**
 * Transaction Service
 * Håndterer alle transaksjonsoperasjoner
 */

import { dataService } from '../core/dataService.js';
import { authService } from '../core/auth.js';
import { eventBus, EVENTS } from '../core/eventBus.js';
import { validateAmount } from '../utils/validators.js';

class TransactionService {
  /**
   * Overfør penger fra én bruker til en annen
   * @param {string} recipientAccountNumber - Mottakers kontonummer
   * @param {number} amount - Beløp
   * @param {string} message - Valgfri melding
   * @returns {Promise<Object>} - Transaksjon objekt
   */
  async transferMoney(recipientAccountNumber, amount, message = '') {
    try {
      // Valider input
      const amountValidation = validateAmount(amount);
      if (!amountValidation.valid) {
        throw new Error(amountValidation.error);
      }
      
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('Du må være logget inn for å overføre penger');
      }
      
      // Hent mottaker
      const recipient = await dataService.getUserByAccountNumber(recipientAccountNumber);
      if (!recipient) {
        throw new Error('Mottaker ikke funnet');
      }
      
      // Kan ikke sende til seg selv
      if (recipient.id === currentUser.id) {
        throw new Error('Du kan ikke sende penger til deg selv');
      }
      
      // Sjekk at avsender har nok penger (ikke for lærer/bank)
      if (currentUser.type !== 'teacher' && currentUser.balance < amountValidation.value) {
        throw new Error('Ikke nok penger på konto');
      }
      
      // Opprett transaksjon (dette oppdaterer også saldoer)
      const transaction = await dataService.createTransaction({
        senderId: currentUser.id,
        recipientId: recipient.id,
        amount: amountValidation.value,
        message: message.trim()
      });
      
      // Refresh current user data
      await authService.refreshCurrentUser();
      
      // Emit event
      eventBus.emit(EVENTS.TRANSACTION_CREATED, transaction);
      eventBus.emit(EVENTS.BALANCE_UPDATED, currentUser);
      
      return transaction;
    } catch (error) {
      console.error('Feil ved overføring:', error);
      throw error;
    }
  }

  /**
   * Gi penger til en eller flere elever (kun for lærer)
   * @param {Array<string>|string} recipientIds - Mottaker ID(er)
   * @param {number} amount - Beløp per mottaker
   * @param {string} message - Melding
   * @returns {Promise<Array>} - Array av transaksjoner
   */
  async giveMoney(recipientIds, amount, message = 'Utbetaling fra banken') {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan gi penger');
      }
      
      // Valider beløp
      const amountValidation = validateAmount(amount);
      if (!amountValidation.valid) {
        throw new Error(amountValidation.error);
      }
      
      // Konverter til array hvis enkelt ID
      const recipients = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
      
      if (recipients.length === 0) {
        throw new Error('Ingen mottakere valgt');
      }
      
      // Opprett transaksjoner for alle mottakere
      const transactions = [];
      for (const recipientId of recipients) {
        try {
          const recipient = await dataService.getUser(recipientId);
          if (!recipient) {
            console.warn(`Mottaker ${recipientId} ikke funnet, hopper over`);
            continue;
          }
          
          const transaction = await dataService.createTransaction({
            senderId: currentUser.id,
            recipientId: recipient.id,
            amount: amountValidation.value,
            message: message.trim()
          });
          
          transactions.push(transaction);
          eventBus.emit(EVENTS.TRANSACTION_CREATED, transaction);
        } catch (error) {
          console.error(`Feil ved utbetaling til ${recipientId}:`, error);
        }
      }
      
      return transactions;
    } catch (error) {
      console.error('Feil ved utbetaling:', error);
      throw error;
    }
  }

  /**
   * Hent transaksjonshistorikk for nåværende bruker
   * @param {number} limit - Max antall transaksjoner (0 = alle)
   * @returns {Promise<Array>} - Array av transaksjoner
   */
  async getUserTransactions(limit = 0) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('Du må være logget inn');
      }
      
      let transactions = await dataService.getUserTransactions(currentUser.id);
      
      if (limit > 0) {
        transactions = transactions.slice(0, limit);
      }
      
      return transactions;
    } catch (error) {
      console.error('Feil ved henting av transaksjoner:', error);
      throw error;
    }
  }

  /**
   * Hent alle transaksjoner (kun for lærer)
   * @param {number} limit - Max antall transaksjoner (0 = alle)
   * @returns {Promise<Array>} - Array av transaksjoner
   */
  async getAllTransactions(limit = 0) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan se alle transaksjoner');
      }
      
      let transactions = await dataService.getTransactions();
      
      // Sorter etter tid (nyeste først)
      transactions.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      
      if (limit > 0) {
        transactions = transactions.slice(0, limit);
      }
      
      return transactions;
    } catch (error) {
      console.error('Feil ved henting av transaksjoner:', error);
      throw error;
    }
  }

  /**
   * Beregn total inn/ut for en bruker
   * @param {string} userId - Bruker ID (optional, bruker nåværende hvis ikke oppgitt)
   * @returns {Promise<Object>} - { totalIn, totalOut, balance }
   */
  async getUserTransactionStats(userId = null) {
    try {
      const targetUserId = userId || authService.getCurrentUserId();
      if (!targetUserId) {
        throw new Error('Bruker ID mangler');
      }
      
      const transactions = await dataService.getUserTransactions(targetUserId);
      const user = await dataService.getUser(targetUserId);
      
      let totalIn = 0;
      let totalOut = 0;
      
      transactions.forEach(tx => {
        if (tx.recipientId === targetUserId) {
          totalIn += tx.amount;
        }
        if (tx.senderId === targetUserId) {
          totalOut += tx.amount;
        }
      });
      
      return {
        totalIn,
        totalOut,
        balance: user?.balance || 0,
        transactionCount: transactions.length
      };
    } catch (error) {
      console.error('Feil ved beregning av statistikk:', error);
      throw error;
    }
  }
}

// Eksporter singleton instance
export const transactionService = new TransactionService();

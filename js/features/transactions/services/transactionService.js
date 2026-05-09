/**
 * Transaction Service
 * Håndterer alle transaksjonsoperasjoner med classroom isolation
 */

import { dataService } from '../../../shared/core/dataService.js';
import { authService } from '../../auth/index.js';
import { eventBus, EVENTS } from '../../../shared/core/eventBus.js';
import { validateAmount } from '../../../shared/utils/validators.js';
import { classroomService } from '../../classroom/index.js';
import { ACCOUNT_PREFIXES, USER_TYPES } from '../../../shared/config/config.js';
import { languageService } from '../../i18n/index.js';

class TransactionService {
  /**
   * Overfør penger fra én bruker til en annen (innen samme klasserom)
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
        throw new Error(languageService.t('error.mustBeLoggedInToTransfer'));
      }
      
      // Sjekk om det er en spesialkonto (sentralbank/skattekasse)
      const isCentralBank = recipientAccountNumber === ACCOUNT_PREFIXES.centralBank || recipientAccountNumber === '000';
      const isTaxAccount = recipientAccountNumber === ACCOUNT_PREFIXES.taxAccount || recipientAccountNumber === '001';
      
      let recipient;
      
      if (isCentralBank) {
        // Sentralbanken - virtuell konto
        recipient = {
          id: 'central-bank',
          name: languageService.t('accounts.centralBank') || 'Sentralbanken',
          accountNumber: '000',
          type: 'bank',
          classroomId: currentUser.classroomId
        };
      } else if (isTaxAccount) {
        // Skattekassen - virtuell konto
        recipient = {
          id: 'tax-account',
          name: languageService.t('accounts.taxAccount') || 'Skattekassen',
          accountNumber: '001',
          type: 'bank',
          classroomId: currentUser.classroomId
        };
      } else {
        // Hent vanlig mottaker - send med classroomId for å sikre riktig bruker
        recipient = await dataService.getUserByAccountNumber(
          recipientAccountNumber, 
          currentUser.classroomId
        );
        if (!recipient) {
          throw new Error(languageService.t('error.recipientNotFound'));
        }
      }
      
      // Kan ikke sende til seg selv
      if (recipient.id === currentUser.id) {
        throw new Error(languageService.t('error.cannotSendToYourself'));
      }
      
      // Sjekk classroom isolation for studenter
      if (currentUser.type === USER_TYPES.STUDENT) {
        // Studenter kan kun sende til andre i samme klasserom
        // (inkl. sentralbank 000 og skattekasse 001)
        const isBankAccount = isCentralBank || isTaxAccount;
        
        if (!isBankAccount && recipient.classroomId !== currentUser.classroomId) {
          throw new Error(languageService.t('error.canOnlySendToOwnClassroom'));
        }
      }
      
      // Sjekk at avsender har nok penger (ikke for lærer/bank)
      if (currentUser.type !== USER_TYPES.TEACHER && currentUser.balance < amountValidation.value) {
        throw new Error(languageService.t('error.insufficientAccountBalance'));
      }
      
      // Opprett transaksjon (dette oppdaterer også saldoer)
      const transaction = await dataService.createTransaction({
        senderId: currentUser.id,
        recipientId: recipient.id,
        amount: amountValidation.value,
        message: message.trim(),
        classroomId: currentUser.classroomId // Legg til classroom ID
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
   * Gi penger til en eller flere elever (kun for lærer, kun i eget klasserom)
   * @param {Array<string>|string} recipientIds - Mottaker ID(er)
   * @param {number} amount - Beløp per mottaker
   * @param {string} message - Melding
   * @returns {Promise<Array>} - Array av transaksjoner
   */
  async giveMoney(recipientIds, amount, message = 'Utbetaling fra banken') {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanGiveMoney'));
      }
      
      // Hent lærerens klasserom (bruk async for Firebase-støtte)
      let classroom = await classroomService.getClassroomByTeacherAsync(currentUser.id);
      
      // Fallback: bruk currentUser.classroomId hvis classroom ikke finnes
      if (!classroom && currentUser.classroomId) {
        classroom = { id: currentUser.classroomId };
      }
      
      // Valider beløp
      const amountValidation = validateAmount(amount);
      if (!amountValidation.valid) {
        throw new Error(amountValidation.error);
      }
      
      // Konverter til array hvis enkelt ID
      const recipients = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
      
      if (recipients.length === 0) {
        throw new Error(languageService.t('error.noRecipientsSelected'));
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
          
          // Sjekk at mottaker er i samme klasserom
          if (classroom && recipient.classroomId !== classroom.id) {
            console.warn(`Mottaker ${recipientId} er ikke i ditt klasserom, hopper over`);
            continue;
          }
          
          const transaction = await dataService.createTransaction({
            senderId: currentUser.id,
            recipientId: recipient.id,
            amount: amountValidation.value,
            message: message.trim(),
            classroomId: classroom?.id // Legg til classroom ID
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
        throw new Error(languageService.t('error.mustBeLoggedIn'));
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
   * Hent alle transaksjoner i klasserommet (kun for lærer)
   * @param {number} limit - Max antall transaksjoner (0 = alle)
   * @returns {Promise<Array>} - Array av transaksjoner
   */
  async getAllTransactions(limit = 0) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanViewAllTransactions'));
      }
      
      // Hent lærerens klasserom
      const classroom = classroomService.getClassroomByTeacher(currentUser.id);
      const classroomId = classroom?.id || currentUser.classroomId || dataService.getCurrentClassroomIdSync?.();
      
      let transactions = await dataService.getTransactions();
      
      // Filtrer på klasserom hvis det finnes
      if (classroomId) {
        // Hent alle brukere i klasserommet (inkluderer lærer/elev/bank-kontoer)
        const classroomUsers = dataService.getUsersSync().filter(u => u.classroomId === classroomId);
        const classroomUserIds = new Set(classroomUsers.map(u => u.id));
        classroomUserIds.add(currentUser.id); // ekstra sikkerhet
        
        // Filtrer transaksjoner hvor sender eller mottaker er i klasserommet
        transactions = transactions.filter(tx => 
          classroomUserIds.has(tx.senderId) || classroomUserIds.has(tx.recipientId) ||
          tx.classroomId === classroomId
        );
      } else {
        // Hvis klasserom ikke kan fastslås: vis kun lærerens egne transaksjoner (ikke alle)
        transactions = transactions.filter(tx =>
          tx.senderId === currentUser.id || tx.recipientId === currentUser.id
        );
      }
      
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
        throw new Error(languageService.t('error.userIdMissing'));
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

  /**
   * Hent alle transaksjoner for en spesifikk student
   * @param {string} studentId - Student ID
   * @returns {Promise<Array>} - Liste med transaksjoner
   */
  async getStudentTransactions(studentId) {
    try {
      const transactions = await dataService.getTransactions();
      
      // Filtrer transaksjoner hvor studenten er sender eller mottaker
      return transactions.filter(tx => 
        tx.senderId === studentId || 
        tx.recipientId === studentId ||
        tx.fromId === studentId ||
        tx.toId === studentId
      );
    } catch (error) {
      console.error('Feil ved henting av elevtransaksjoner:', error);
      return [];
    }
  }

  /**
   * Hent alle transaksjoner for klasserommet
   * @returns {Promise<Array>} - Liste med transaksjoner
   */
  async getTransactions() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return [];
      
      let transactions = await dataService.getTransactions();
      
      // Filtrer på klasserom hvis læreren har et
      if (currentUser.type === USER_TYPES.TEACHER) {
        const classroom = classroomService.getClassroomByTeacher(currentUser.id);
        if (classroom) {
          const studentsInClassroom = classroomService.getStudentsByClassroom(classroom.id);
          const studentIds = new Set(studentsInClassroom.map(s => s.id));
          studentIds.add(currentUser.id);
          
          transactions = transactions.filter(tx => 
            studentIds.has(tx.senderId) || studentIds.has(tx.recipientId) ||
            studentIds.has(tx.fromId) || studentIds.has(tx.toId) ||
            tx.classroomId === classroom.id
          );
        }
      }
      
      return transactions;
    } catch (error) {
      console.error('Feil ved henting av transaksjoner:', error);
      return [];
    }
  }
}

// Eksporter singleton instance
export const transactionService = new TransactionService();

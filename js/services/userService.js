/**
 * User Service
 * Håndterer brukeradministrasjon (primært for lærere)
 */

import { dataService } from '../core/dataService.js';
import { authService } from '../core/auth.js';
import { eventBus, EVENTS } from '../core/eventBus.js';
import {
  validateUsername,
  validatePassword,
  validateName,
  validateAccountNumber
} from '../utils/validators.js';
import { USER_TYPES } from '../config.js';

class UserService {
  /**
   * Hent alle elever (kun lærer)
   * @returns {Promise<Array>} - Array av elever
   */
  async getAllStudents() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan se alle elever');
      }
      
      const users = await dataService.getUsers();
      return users
        .filter(u => u.type === USER_TYPES.STUDENT)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Feil ved henting av elever:', error);
      throw error;
    }
  }

  /**
   * Legg til ny elev (kun lærer)
   * @param {Object} studentData - { name, username, password, accountNumber }
   * @returns {Promise<Object>} - Opprettet elev
   */
  async addStudent(studentData) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan legge til elever');
      }
      
      // Valider input
      const nameValidation = validateName(studentData.name);
      if (!nameValidation.valid) {
        throw new Error(nameValidation.error);
      }
      
      const usernameValidation = validateUsername(studentData.username);
      if (!usernameValidation.valid) {
        throw new Error(usernameValidation.error);
      }
      
      const passwordValidation = validatePassword(studentData.password);
      if (!passwordValidation.valid) {
        throw new Error(passwordValidation.error);
      }
      
      const accountValidation = validateAccountNumber(studentData.accountNumber);
      if (!accountValidation.valid) {
        throw new Error(accountValidation.error);
      }
      
      // Hent startbalanse fra settings
      const settings = await dataService.getSettings();
      
      // Opprett student
      const student = await dataService.createUser({
        name: studentData.name.trim(),
        username: studentData.username.trim(),
        password: studentData.password, // Blir hashet i dataService
        accountNumber: studentData.accountNumber.trim(),
        type: USER_TYPES.STUDENT,
        balance: settings.startingBalance || 1000
      });
      
      eventBus.emit(EVENTS.USER_CREATED, student);
      return student;
    } catch (error) {
      console.error('Feil ved opprettelse av elev:', error);
      throw error;
    }
  }

  /**
   * Slett elev (kun lærer)
   * @param {string} studentId - Elev ID
   * @returns {Promise<boolean>}
   */
  async deleteStudent(studentId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan slette elever');
      }
      
      // Sjekk at det er en student
      const student = await dataService.getUser(studentId);
      if (!student) {
        throw new Error('Bruker ikke funnet');
      }
      
      if (student.type !== USER_TYPES.STUDENT) {
        throw new Error('Kan kun slette elever');
      }
      
      await dataService.deleteUser(studentId);
      eventBus.emit(EVENTS.USER_DELETED, { userId: studentId });
      return true;
    } catch (error) {
      console.error('Feil ved sletting av elev:', error);
      throw error;
    }
  }

  /**
   * Oppdater elev (kun lærer)
   * @param {string} studentId - Elev ID
   * @param {Object} updates - Oppdateringer
   * @returns {Promise<Object>} - Oppdatert elev
   */
  async updateStudent(studentId, updates) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan oppdatere elever');
      }
      
      // Valider relevante felt
      if (updates.name) {
        const validation = validateName(updates.name);
        if (!validation.valid) throw new Error(validation.error);
        updates.name = updates.name.trim();
      }
      
      if (updates.username) {
        const validation = validateUsername(updates.username);
        if (!validation.valid) throw new Error(validation.error);
        updates.username = updates.username.trim();
      }
      
      if (updates.accountNumber) {
        const validation = validateAccountNumber(updates.accountNumber);
        if (!validation.valid) throw new Error(validation.error);
        updates.accountNumber = updates.accountNumber.trim();
      }
      
      // Ikke tillat endring av type
      if (updates.type) {
        delete updates.type;
      }
      
      const student = await dataService.updateUser(studentId, updates);
      return student;
    } catch (error) {
      console.error('Feil ved oppdatering av elev:', error);
      throw error;
    }
  }

  /**
   * Hent brukerinfo
   * @param {string} userId - Bruker ID
   * @returns {Promise<Object>} - Bruker objekt
   */
  async getUser(userId) {
    try {
      return await dataService.getUser(userId);
    } catch (error) {
      console.error('Feil ved henting av bruker:', error);
      throw error;
    }
  }

  /**
   * Søk etter bruker med kontonummer
   * @param {string} accountNumber - Kontonummer
   * @returns {Promise<Object|null>} - Bruker eller null
   */
  async findByAccountNumber(accountNumber) {
    try {
      return await dataService.getUserByAccountNumber(accountNumber);
    } catch (error) {
      console.error('Feil ved søk etter bruker:', error);
      throw error;
    }
  }

  /**
   * Generer neste ledige kontonummer
   * @returns {Promise<string>} - Neste kontonummer
   */
  async generateNextAccountNumber() {
    try {
      const users = await dataService.getUsers();
      const accountNumbers = users
        .map(u => parseInt(u.accountNumber))
        .filter(num => !isNaN(num))
        .sort((a, b) => b - a);
      
      if (accountNumbers.length === 0) {
        return '101'; // Start med 101 for elever
      }
      
      const highest = accountNumbers[0];
      return (highest + 1).toString().padStart(3, '0');
    } catch (error) {
      console.error('Feil ved generering av kontonummer:', error);
      throw error;
    }
  }

  /**
   * Statistikk for alle elever (kun lærer)
   * @returns {Promise<Object>} - Statistikk
   */
  async getStudentStatistics() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan se statistikk');
      }
      
      const students = await this.getAllStudents();
      
      if (students.length === 0) {
        return {
          totalStudents: 0,
          totalBalance: 0,
          averageBalance: 0,
          highestBalance: 0,
          lowestBalance: 0
        };
      }
      
      const balances = students.map(s => s.balance);
      const totalBalance = balances.reduce((sum, b) => sum + b, 0);
      
      return {
        totalStudents: students.length,
        totalBalance,
        averageBalance: totalBalance / students.length,
        highestBalance: Math.max(...balances),
        lowestBalance: Math.min(...balances)
      };
    } catch (error) {
      console.error('Feil ved henting av statistikk:', error);
      throw error;
    }
  }
}

// Eksporter singleton instance
export const userService = new UserService();

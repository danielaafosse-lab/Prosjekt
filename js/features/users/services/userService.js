/**
 * User Service
 * Håndterer brukeradministrasjon (primært for lærere)
 */

import { dataService } from '../../../shared/core/dataService.js';
import { authService } from '../../auth/index.js';
import { eventBus, EVENTS } from '../../../shared/core/eventBus.js';
import {
  validateUsername,
  validatePassword,
  validateName,
  validateAccountNumber
} from '../../../shared/utils/validators.js';
import { hashPassword } from '../../../shared/utils/helpers.js';
import { USER_TYPES } from '../../../shared/config/config.js';
import { classroomService } from '../../classroom/index.js';
import { languageService } from '../../i18n/index.js';
import { savingsService } from '../../savings/index.js';

class UserService {
  /**
   * Hent alle elever i lærerens klasserom (kun lærer)
   * @returns {Promise<Array>} - Array av elever
   */
  async getAllStudents() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanViewAllStudents'));
      }
      
      // Hent lærerens klasserom fra Firebase
      let classroomId = null;
      
      // Prøv å hente classroom ID fra dataService (Firebase)
      if (dataService.getCurrentClassroomId) {
        classroomId = await dataService.getCurrentClassroomId();
      }
      
      // Fallback: bruk classroomService
      if (!classroomId) {
        const classroom = await classroomService.getClassroomByTeacherAsync(currentUser.id);
        classroomId = classroom?.id;
      }
      
      if (!classroomId) {
        console.warn('⚠️ Ingen klasserom funnet for lærer:', currentUser.id);
        return [];
      }
      
      console.log('📚 Henter elever for klasserom:', classroomId);
      
      // Hent alle brukere fra Firebase
      if (dataService.getUsers) {
        const allUsers = await dataService.getUsers();
        const students = allUsers.filter(u => 
          u.type === 'student' && u.classroomId === classroomId
        );
        console.log('👥 Fant', students.length, 'elever i klasserom');
        return students;
      }
      
      // Fallback til classroomService
      return classroomService.getStudentsByClassroom(classroomId);
    } catch (error) {
      console.error('Feil ved henting av elever:', error);
      throw error;
    }
  }

  /**
   * Legg til ny elev i lærerens klasserom (kun lærer)
   * @param {Object} studentData - { name, username, password, accountNumber }
   * @returns {Promise<Object>} - Opprettet elev
   */
  async addStudent(studentData) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanAddStudents'));
      }
      
      // Hent lærerens klasserom fra Firebase
      let classroom = await classroomService.getClassroomByTeacherAsync(currentUser.id);
      if (!classroom) {
        throw new Error(languageService.t('error.needClassroomToAddStudents'));
      }
      
      console.log('📚 Legger til elev i klasserom:', classroom.id);
      
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
      
      // Generer kontonummer automatisk hvis ikke oppgitt
      let accountNumber = studentData.accountNumber;
      if (!accountNumber) {
        accountNumber = classroomService.generateAccountNumber(classroom.id, 'student');
      }
      
      const accountValidation = validateAccountNumber(accountNumber);
      if (!accountValidation.valid) {
        throw new Error(accountValidation.error);
      }
      
      // Hent startbalanse fra settings
      const settings = await dataService.getSettings();
      
      // Opprett student med classroomId
      const student = await dataService.createUser({
        name: studentData.name.trim(),
        username: studentData.username.trim(),
        password: studentData.password, // Blir hashet i dataService
        initialPassword: studentData.initialPassword || null, // Klartekst for print-liste
        accountNumber: accountNumber.trim(),
        type: USER_TYPES.STUDENT,
        balance: settings.startingBalance || 1000,
        classroomId: classroom.id // Viktig: Koble til klasserom
      });
      
      // Opprett spare- og fondskonto automatisk
      try {
        await savingsService.createSavingsAccount(student.id);
        await savingsService.createFundAccount(student.id);
      } catch (e) {
        console.warn('⚠️ Kunne ikke opprette spare-/fondskonto automatisk:', e.message);
      }

      eventBus.emit(EVENTS.USER_CREATED, student);
      return student;
    } catch (error) {
      console.error('Feil ved opprettelse av elev:', error);
      throw error;
    }
  }

  /**
   * Slett elev (kun lærer, kun i eget klasserom)
   * @param {string} studentId - Elev ID
   * @returns {Promise<boolean>}
   */
  async deleteStudent(studentId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanDeleteStudents'));
      }
      
      // Sjekk at det er en student
      const student = await dataService.getUser(studentId);
      if (!student) {
        throw new Error(languageService.t('error.userNotFound'));
      }
      
      if (student.type !== USER_TYPES.STUDENT) {
        throw new Error(languageService.t('error.canOnlyDeleteStudents'));
      }
      
      // Sjekk at eleven tilhører lærerens klasserom
      const classroom = await classroomService.getClassroomByTeacherAsync(currentUser.id);
      if (!classroom || student.classroomId !== classroom.id) {
        throw new Error(languageService.t('error.canOnlyDeleteFromOwnClassroom'));
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
   * Oppdater elev (kun lærer, kun i eget klasserom)
   * @param {string} studentId - Elev ID
   * @param {Object} updates - Oppdateringer
   * @returns {Promise<Object>} - Oppdatert elev
   */
  async updateStudent(studentId, updates) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanUpdateStudents'));
      }
      
      // Sjekk at eleven tilhører lærerens klasserom
      const student = await dataService.getUser(studentId);
      if (!student) {
        throw new Error(languageService.t('error.studentNotFound'));
      }
      
      const classroom = await classroomService.getClassroomByTeacherAsync(currentUser.id);
      if (!classroom || student.classroomId !== classroom.id) {
        throw new Error(languageService.t('error.canOnlyUpdateFromOwnClassroom'));
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

        // Sjekk om brukernavnet allerede er i bruk av en annen bruker
        const users = dataService.getUsersSync() || [];
        const existingUser = users.find(u =>
          u.username === updates.username && u.id !== studentId
        );
        if (existingUser) {
          throw new Error(languageService.t('error.usernameInUse'));
        }
      }
      
      if (updates.accountNumber) {
        const validation = validateAccountNumber(updates.accountNumber);
        if (!validation.valid) throw new Error(validation.error);
        updates.accountNumber = updates.accountNumber.trim();
      }
      
      // Hash passord hvis det er oppgitt
      if (updates.password) {
        const validation = validatePassword(updates.password);
        if (!validation.valid) throw new Error(validation.error);
        updates.password = await hashPassword(updates.password);
      }
      
      // Ikke tillat endring av type
      if (updates.type) {
        delete updates.type;
      }
      
      const updatedStudent = await dataService.updateUser(studentId, updates);
      return updatedStudent;
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
   * Generer neste ledige kontonummer for lærerens klasserom
   * @returns {Promise<string>} - Neste kontonummer
   */
  async generateNextAccountNumber() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanGenerateAccountNumber'));
      }
      
      // Hent lærerens klasserom
      const classroom = await classroomService.getClassroomByTeacherAsync(currentUser.id);
      if (!classroom) {
        return '101'; // Standard startnummer hvis ingen klasserom
      }
      
      // Bruk classroomService til å generere neste nummer
      return classroomService.generateAccountNumber(classroom.id, 'student');
    } catch (error) {
      console.error('Feil ved generering av kontonummer:', error);
      throw error;
    }
  }

  /**
   * Statistikk for alle elever i klasserommet (kun lærer)
   * @returns {Promise<Object>} - Statistikk
   */
  async getStudentStatistics() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
        throw new Error(languageService.t('error.onlyTeachersCanViewStats'));
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

  /**
   * Synkron versjon av getAllStudents
   * Brukes når du trenger data umiddelbart uten await
   * Filtrerer på lærerens klasserom
   */
  getAllStudentsSync() {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.type !== USER_TYPES.TEACHER) {
      return [];
    }
    
    const classroom = classroomService.getClassroomByTeacher(currentUser.id);
    if (!classroom) {
      return [];
    }
    
    return classroomService.getStudentsByClassroom(classroom.id);
  }
}

// Eksporter singleton instance
export const userService = new UserService();

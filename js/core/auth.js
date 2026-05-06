/**
 * Authentication Service
 * Håndterer brukerautentisering og session management
 */

import { dataService } from './dataService.js';
import { eventBus, EVENTS } from './eventBus.js';
import { hashPassword } from '../utils/helpers.js';
import { STORAGE_KEYS, SUPERADMIN, USER_TYPES } from '../config.js';
import { languageService } from '../services/languageService.js';
import { statsService } from '../services/statsService.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.sessionKey = `${STORAGE_KEYS.session}`;
  }

  /**
   * Initialiser auth - forsøk å gjenopprette session fra localStorage
   */
  async initialize() {
    const savedUserId = localStorage.getItem(this.sessionKey);

    if (savedUserId) {
      try {
        // Superadmin er ikke i Firebase - gjenopprett direkte
        if (savedUserId === SUPERADMIN.id) {
          this.currentUser = { ...SUPERADMIN, type: USER_TYPES.SUPERADMIN };
          if (dataService.setCurrentUserId) dataService.setCurrentUserId(SUPERADMIN.id);
          console.log('✅ Superadmin session gjenopprettet');
          return this.currentUser;
        }

        // Hent fersk brukerdata fra Firebase
        const user = await dataService.getUser(savedUserId);
        if (user) {
          this.currentUser = user;
          if (dataService.setCurrentUserId) dataService.setCurrentUserId(user.id);
          console.log('✅ Session gjenopprettet for:', user.name);
          return user;
        }
      } catch (error) {
        console.warn('⚠️ Kunne ikke gjenopprette session:', error);
      }
      // Session ugyldig - slett den
      localStorage.removeItem(this.sessionKey);
    }

    console.log('🔐 Auth initialisert - venter på innlogging');
    return null;
  }

  /**
   * Logg inn bruker
   * @param {string} username - Brukernavn
   * @param {string} password - Passord (plain text)
   * @returns {Promise<Object|null>} - Bruker objekt eller null hvis feil
   */
  async login(username, password) {
    try {
      const normalizedUsername = username.trim().toLowerCase();
      console.log('🔐 Login forsøk for:', normalizedUsername);

      // Sjekk om det er superadmin
      if (normalizedUsername === SUPERADMIN.username.toLowerCase()) {
        // Hash input-passordet og sammenlign med lagret hash
        const hashedInput = await hashPassword(password);
        if (hashedInput === SUPERADMIN.passwordHash) {
          this.currentUser = {
            ...SUPERADMIN,
            type: USER_TYPES.SUPERADMIN
          };

          // Sett current user ID i dataService for Firebase
          if (dataService.setCurrentUserId) {
            dataService.setCurrentUserId(SUPERADMIN.id);
          }

          // Registrer innlogging for statistikk
          statsService.recordLogin(SUPERADMIN.id, 'superadmin', null);

          // Lagre session
          localStorage.setItem(this.sessionKey, SUPERADMIN.id);

          console.log('✅ Superadmin logget inn');
          eventBus.emit(EVENTS.USER_LOGGED_IN, this.currentUser);
          return this.currentUser;
        } else {
          throw new Error(languageService.t('error.invalidCredentials'));
        }
      }
      
      // Hent bruker fra database (case-insensitive)
      const user = await dataService.getUserByUsername(normalizedUsername);
      console.log('👤 Bruker funnet i database:', user ? user.name : 'IKKE FUNNET');
      
      if (!user) {
        throw new Error(languageService.t('error.invalidCredentials'));
      }
      
      // Hash passord og sammenlign
      const hashedPassword = await hashPassword(password);
      if (user.password !== hashedPassword) {
        throw new Error(languageService.t('error.invalidCredentials'));
      }
      
      this.currentUser = user;

      // Sett current user ID i dataService for Firebase
      if (dataService.setCurrentUserId) {
        dataService.setCurrentUserId(user.id);
      }

      // Lagre session
      localStorage.setItem(this.sessionKey, user.id);

      // Registrer innlogging for statistikk
      const classroomId = user.classroomId || null;
      statsService.recordLogin(user.id, user.type, classroomId);

      console.log('✅ Bruker logget inn og lagret:', user.name);

      // Emit event
      eventBus.emit(EVENTS.USER_LOGGED_IN, user);

      return user;
    } catch (error) {
      console.error('Login feilet:', error);
      throw error;
    }
  }

  /**
   * Logg ut bruker
   */
  logout() {
    const user = this.currentUser;
    this.currentUser = null;

    // Slett session
    localStorage.removeItem(this.sessionKey);

    // Tøm dataService
    if (dataService.setCurrentUserId) {
      dataService.setCurrentUserId(null);
    }
    if (dataService.clearCurrentClassroomId) {
      dataService.clearCurrentClassroomId();
    }

    console.log('👋 Bruker logget ut:', user?.name);

    eventBus.emit(EVENTS.USER_LOGGED_OUT, user);
  }

  /**
   * Sjekk om bruker er logget inn
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.currentUser !== null;
  }

  /**
   * Sjekk om bruker er lærer
   * @returns {boolean}
   */
  isTeacher() {
    return this.currentUser?.type === 'teacher';
  }

  /**
   * Sjekk om bruker er elev
   * @returns {boolean}
   */
  isStudent() {
    return this.currentUser?.type === 'student';
  }

  /**
   * Hent nåværende bruker
   * @returns {Object|null}
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Hent nåværende bruker ID
   * @returns {string|null}
   */
  getCurrentUserId() {
    return this.currentUser?.id || null;
  }

  /**
   * Refresh brukerdata (f.eks. etter balance update)
   * NB: Emitter IKKE BALANCE_UPDATED event for å unngå loop
   */
  async refreshCurrentUser() {
    if (!this.currentUser) return null;
    
    try {
      const updatedUser = await dataService.getUser(this.currentUser.id);
      if (updatedUser) {
        this.currentUser = updatedUser;
        // IKKE emit BALANCE_UPDATED her - forårsaker uendelig loop!
      }
      return updatedUser;
    } catch (error) {
      console.error('Feil ved refresh av bruker:', error);
      return null;
    }
  }

  /**
   * Oppdater nåværende bruker (f.eks. navn)
   * @param {Object} updates - Oppdateringer
   */
  async updateCurrentUser(updates) {
    if (!this.currentUser) {
      throw new Error(languageService.t('error.noUserLoggedIn'));
    }
    
    try {
      const updatedUser = await dataService.updateUser(
        this.currentUser.id,
        updates
      );
      this.currentUser = updatedUser;
      return updatedUser;
    } catch (error) {
      console.error('Feil ved oppdatering av bruker:', error);
      throw error;
    }
  }
}

// Eksporter singleton instance
export const authService = new AuthService();

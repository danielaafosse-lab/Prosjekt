/**
 * Authentication Service
 * Håndterer brukerautentisering og session management
 */

import { dataService } from './dataService.js';
import { eventBus, EVENTS } from './eventBus.js';
import { hashPassword } from '../utils/helpers.js';
import { STORAGE_KEYS } from '../config.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.sessionKey = `${STORAGE_KEYS.session}`;
  }

  /**
   * Initialiser auth - sjekk om bruker allerede er logget inn
   */
  async initialize() {
    try {
      // Bruk localStorage i stedet for sessionStorage for å holde bruker innlogget
      const sessionData = localStorage.getItem(this.sessionKey);
      if (sessionData) {
        const { userId } = JSON.parse(sessionData);
        const user = await dataService.getUser(userId);
        
        if (user) {
          this.currentUser = user;
          eventBus.emit(EVENTS.USER_LOGGED_IN, user);
          console.log('✅ Bruker lastet fra lagret session:', user.name);
          return user;
        } else {
          console.warn('⚠️ Session funnet men bruker eksisterer ikke, clearer session');
          localStorage.removeItem(this.sessionKey);
        }
      }
    } catch (error) {
      console.error('Feil ved initialisering av auth:', error);
    }
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
      // Hent bruker fra database
      const user = await dataService.getUserByUsername(username);
      
      if (!user) {
        throw new Error('Ugyldig brukernavn eller passord');
      }
      
      // Hash passord og sammenlign
      const hashedPassword = await hashPassword(password);
      if (user.password !== hashedPassword) {
        throw new Error('Ugyldig brukernavn eller passord');
      }
      
      // Lagre session i localStorage for å holde bruker innlogget
      this.currentUser = user;
      localStorage.setItem(this.sessionKey, JSON.stringify({
        userId: user.id,
        loginTime: new Date().toISOString()
      }));
      
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
    localStorage.removeItem(this.sessionKey);
    
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
   */
  async refreshCurrentUser() {
    if (!this.currentUser) return null;
    
    try {
      const updatedUser = await dataService.getUser(this.currentUser.id);
      if (updatedUser) {
        this.currentUser = updatedUser;
        eventBus.emit(EVENTS.BALANCE_UPDATED, updatedUser);
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
      throw new Error('Ingen bruker er logget inn');
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

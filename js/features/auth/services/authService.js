/**
 * Authentication Service — Firebase Auth + Custom Tokens
 *
 * Login flow:
 *   1. Klient kaller Cloud Function `authenticateUser` med username + password
 *   2. Cloud Function verifiserer SHA-256(passord) mot users/{uid}.passwordHash
 *   3. Returnerer Firebase Custom Token med claims (userType, classroomId, accountNumber)
 *   4. Klient kjører `signInWithCustomToken(token)` → Firebase Auth setter currentUser
 *   5. `onAuthStateChanged` henter User-doc fra Firestore + dekoder claims
 *
 * Sesjon-persistens:
 *   Firebase Auth bruker IndexedDB (LOCAL persistence). Sesjon overlever sidereload
 *   automatisk uten egen localStorage-håndtering.
 */

import { dataService } from '../../../shared/core/dataService.js';
import { eventBus, EVENTS } from '../../../shared/core/eventBus.js';
import { languageService } from '../../i18n/index.js';
import { statsService } from '../../stats/index.js';

class AuthService {
  constructor() {
    /** @type {object|null} Firestore user-doc */
    this.currentUser = null;
    /** @type {{userType: string|null, classroomId: string|null, accountNumber: string|null}|null} */
    this.currentClaims = null;
    /** @type {Promise<object|null>|null} */
    this._authReady = null;
  }

  /**
   * Sets up Firebase Auth state listener. Returns a promise that resolves
   * after the first onAuthStateChanged callback fires.
   */
  async initialize() {
    if (this._authReady) return this._authReady;

    try {
      // eslint-disable-next-line no-undef
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (err) {
      console.warn('Firebase Auth-persistens kunne ikke settes:', err);
    }

    this._authReady = new Promise((resolve) => {
      let resolved = false;
      // eslint-disable-next-line no-undef
      firebase.auth().onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
          await this._hydrateFromFirebaseUser(firebaseUser);
          eventBus.emit(EVENTS.USER_LOGGED_IN, this.currentUser);
        } else {
          const previous = this.currentUser;
          this.currentUser = null;
          this.currentClaims = null;
          if (dataService.setCurrentUserId) dataService.setCurrentUserId(null);
          if (dataService.clearCurrentClassroomId) dataService.clearCurrentClassroomId();
          if (previous) eventBus.emit(EVENTS.USER_LOGGED_OUT, previous);
        }
        if (!resolved) {
          resolved = true;
          resolve(this.currentUser);
        }
      });
    });

    return this._authReady;
  }

  async _hydrateFromFirebaseUser(firebaseUser) {
    const tokenResult = await firebaseUser.getIdTokenResult();
    this.currentClaims = {
      userType: tokenResult.claims.userType || null,
      classroomId: tokenResult.claims.classroomId || null,
      accountNumber: tokenResult.claims.accountNumber || null,
    };
    this.currentUser = await dataService.getUser(firebaseUser.uid);
    if (dataService.setCurrentUserId) dataService.setCurrentUserId(firebaseUser.uid);
    if (this.currentClaims.classroomId && dataService.setCurrentClassroomId) {
      dataService.setCurrentClassroomId(this.currentClaims.classroomId);
      // Load classroom data into cache (under strenge rules må alle queries
      // filtreres på classroomId — caches er primær kilde for synkron tilgang).
      try {
        await dataService.loadClassroomDataToCache(this.currentClaims.classroomId);
      } catch (err) {
        console.warn('loadClassroomDataToCache feilet ved hydrering:', err.message);
      }
    }
  }

  /**
   * Logger inn via Cloud Function `authenticateUser` + signInWithCustomToken.
   *
   * @param {string} username
   * @param {string} password — plaintext, sendes over HTTPS, verifiseres i Cloud Function
   * @returns {Promise<object|null>} Firestore user-doc
   */
  async login(username, password) {
    const normalized = (username || '').trim().toLowerCase();
    try {
      // eslint-disable-next-line no-undef
      const callable = firebase.app().functions('europe-west1').httpsCallable('authenticateUser');
      const result = await callable({ username: normalized, password });
      const { token } = result.data || {};
      if (!token) throw new Error('auth.noToken');

      // eslint-disable-next-line no-undef
      const credential = await firebase.auth().signInWithCustomToken(token);
      await this._hydrateFromFirebaseUser(credential.user);

      const classroomId = this.currentClaims?.classroomId || null;
      try {
        await statsService.recordLogin(this.currentUser.id, this.currentUser.type, classroomId);
      } catch (err) {
        console.warn('recordLogin feilet (ikke-blokkerende):', err);
      }

      eventBus.emit(EVENTS.USER_LOGGED_IN, this.currentUser);
      return this.currentUser;
    } catch (err) {
      const code = (err && err.code) || '';
      const msg = (err && err.message) || '';
      if (msg.includes('accountLocked') || (code === 'functions/permission-denied' && msg.includes('Locked'))) {
        throw new Error(languageService.t('error.accountLocked') || 'Kontoen din er låst.', { cause: err });
      }
      if (code.includes('not-found') || code.includes('permission-denied') || msg.includes('invalidCredentials')) {
        throw new Error(languageService.t('error.invalidCredentials'), { cause: err });
      }
      throw err;
    }
  }

  async logout() {
    // eslint-disable-next-line no-undef
    await firebase.auth().signOut();
    // onAuthStateChanged handles state cleanup + eventBus emit
  }

  /**
   * Re-fetch user-doc from Firestore (e.g. after balance update).
   */
  async refreshCurrentUser() {
    if (!this.currentUser) return null;
    const updated = await dataService.getUser(this.currentUser.id);
    if (updated) this.currentUser = updated;
    return updated;
  }

  /**
   * Force Firebase Auth-token refresh — needed after admin SDK changes
   * custom claims (e.g. teacher moved between classrooms).
   */
  async refreshClaims() {
    // eslint-disable-next-line no-undef
    const fbUser = firebase.auth().currentUser;
    if (!fbUser) return null;
    const tokenResult = await fbUser.getIdTokenResult(true);
    this.currentClaims = {
      userType: tokenResult.claims.userType || null,
      classroomId: tokenResult.claims.classroomId || null,
      accountNumber: tokenResult.claims.accountNumber || null,
    };
    return this.currentClaims;
  }

  isAuthenticated() { return this.currentUser !== null; }
  isTeacher() { return this.currentClaims?.userType === 'teacher'; }
  isStudent() { return this.currentClaims?.userType === 'student'; }
  isSuperAdmin() { return this.currentClaims?.userType === 'superadmin'; }
  getCurrentUser() { return this.currentUser; }
  getCurrentUserId() { return this.currentUser?.id || null; }
  getCurrentClaims() { return this.currentClaims; }

  async updateCurrentUser(updates) {
    if (!this.currentUser) {
      throw new Error(languageService.t('error.noUserLoggedIn'));
    }
    const updated = await dataService.updateUser(this.currentUser.id, updates);
    this.currentUser = updated;
    return updated;
  }
}

export const authService = new AuthService();

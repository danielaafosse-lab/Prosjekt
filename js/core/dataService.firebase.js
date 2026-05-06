/**
 * DataService - Firebase Implementation
 * 
 * Denne klassen erstatter localStorage-versjonen med Firebase Firestore.
 * Interface er det samme for bakoverkompatibilitet.
 * 
 * Collections i Firestore:
 * - users: Alle brukere (lærere og elever)
 * - transactions: Alle transaksjoner
 * - jobs: Alle jobber
 * - applications: Alle jobbsøknader
 * - classrooms: Alle klasserom
 * - businesses: Alle bedrifter (sub-collections per classroom)
 * - loans: Alle lån (sub-collections per classroom)
 * - savings: Sparekontoer (sub-collections per classroom)
 * - notifications: Varsler (sub-collections per classroom)
 * - settings: Globale innstillinger (deprecated - brukes via classroom.settings)
 */

import { firebaseService } from './firebaseService.js';
import { STORAGE_KEYS, APP_CONFIG, ACCOUNT_PREFIXES, USER_TYPES } from '../config.js';
import { hashPassword } from '../utils/helpers.js';
import { languageService } from '../services/languageService.js';

// Collection names i Firestore
const COLLECTIONS = {
  USERS: 'users',
  TRANSACTIONS: 'transactions',
  JOBS: 'jobs',
  APPLICATIONS: 'applications',
  CLASSROOMS: 'classrooms',
  BUSINESSES: 'businesses',
  LOANS: 'loans',
  SAVINGS: 'savings',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',
  OWNERSHIP_OFFERS: 'ownershipOffers',
  TAX_ACCOUNT: 'taxAccount',
  // Nye collections for meldinger og søknader
  JOB_OFFERS: 'jobOffers',
  JOB_APPLICATIONS: 'jobApplications',
  LOAN_APPLICATIONS: 'loanApplications',
  MESSAGES: 'messages',
  INBOX: 'inbox',
  OUTBOX: 'outbox',  // Sendte meldinger med lest-status
  WEEKLY_SNAPSHOTS: 'weeklySnapshots',  // Ukentlige snapshots for rapporter
  TEACHER_REQUESTS: 'teacherRequests'   // Lærersøknader fra innloggingssiden
};

/**
 * Firebase DataService - samme interface som LocalStorageDataService
 */
class FirebaseDataService {
  constructor() {
    this.initialized = false;
    this._currentUserId = null;
    this._currentClassroomId = null;
    this._usersCache = [];  // Cache for synkron tilgang til brukere
    this._settingsCache = null;  // Cache for settings
    this._loansCache = [];  // Cache for lån
    this._businessesCache = [];  // Cache for bedrifter
    this._savingsCache = [];  // Cache for sparekontoer
    this._fundsCache = [];  // Cache for fondskontoer
    this._applicationsCache = [];  // Cache for jobbsøknader
    this._businessJobApplicationsCache = [];  // Cache for bedriftsjobb-søknader

    // Backwards-compatible cache object
    this.cache = {
      businessJobApplications: []
    };
  }

  /**
   * Initialiser dataservice
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialiser Firebase
      await firebaseService.initialize();
      
      // Sjekk om det finnes data, hvis ikke seed med demo-data
      const users = await firebaseService.getAll(COLLECTIONS.USERS);
      
      if (users.length === 0) {
        console.log('📂 Ingen data i Firebase - initialiserer med demo-data...');
        await this._seedInitialData();
      }
      
      // Cache brukere for synkron tilgang
      this._usersCache = await firebaseService.getAll(COLLECTIONS.USERS);
      console.log(`👥 Cachet ${this._usersCache.length} brukere`);
      
      this.initialized = true;
      console.log('✅ Firebase DataService initialisert');
    } catch (error) {
      console.error('❌ Feil ved initialisering av Firebase DataService:', error);
      throw error;
    }
  }
  
  /**
   * Refresh users cache
   */
  async refreshUsersCache() {
    this._usersCache = await firebaseService.getAll(COLLECTIONS.USERS);
  }

  /**
   * Last og cache alle data for et klasserom
   * Kalles ved login for å forberede synkron tilgang
   */
  async loadClassroomDataToCache(classroomId) {
    if (!classroomId) {
      classroomId = await this.getCurrentClassroomId();
    }
    if (!classroomId) return;

    try {
      console.log(`📦 Laster data for klasserom ${classroomId}...`);

      // Kjør alle queries parallelt for bedre ytelse
      const [users, classroom, businesses, loans, savings, applications, businessJobApps] = await Promise.all([
        firebaseService.getAll(COLLECTIONS.USERS),
        this.getClassroom(classroomId),
        firebaseService.getWhere(COLLECTIONS.BUSINESSES, 'classroomId', '==', classroomId),
        firebaseService.getWhere(COLLECTIONS.LOANS, 'classroomId', '==', classroomId),
        firebaseService.getWhere(COLLECTIONS.SAVINGS, 'classroomId', '==', classroomId),
        firebaseService.getWhere(COLLECTIONS.APPLICATIONS, 'classroomId', '==', classroomId),
        firebaseService.getWhere(COLLECTIONS.JOB_APPLICATIONS, 'classroomId', '==', classroomId)
      ]);

      // Oppdater caches
      this._usersCache = users;
      this._settingsCache = classroom?.settings
        ? { ...APP_CONFIG.defaults, ...classroom.settings }
        : APP_CONFIG.defaults;
      this._businessesCache = businesses;
      this._loansCache = loans;
      this._savingsCache = savings;
      this._applicationsCache = applications;
      this._businessJobApplicationsCache = businessJobApps;

      // Oppdater backwards-compatible cache object
      this.cache.businessJobApplications = businessJobApps;

      console.log(`✅ Cachet: ${users.length} brukere, ${businesses.length} bedrifter, ${loans.length} lån, ${savings.length} sparekontoer, ${applications.length} søknader, ${businessJobApps.length} bedriftsjobb-søknader`);
    } catch (error) {
      console.error('❌ Feil ved lasting av klasseromdata:', error);
    }
  }

  /**
   * Refresh all caches
   */
  async refreshAllCaches() {
    const classroomId = await this.getCurrentClassroomId();
    if (classroomId) {
      await this.loadClassroomDataToCache(classroomId);
    }
  }

  // ==================== SYNC CACHE GETTERS ====================

  /**
   * Hent settings synkront fra cache
   */
  getSettingsCached() {
    return this._settingsCache || APP_CONFIG.defaults;
  }

  /**
   * Hent bedrifter synkront fra cache
   */
  getBusinessesSync() {
    return this._businessesCache || [];
  }

  /**
   * Hent lån synkront fra cache
   */
  getLoansSync() {
    return this._loansCache || [];
  }

  /**
   * Hent sparekontoer synkront fra cache
   */
  getSavingsSync() {
    return this._savingsCache || [];
  }

  /**
   * Oppdater businesses cache
   */
  updateBusinessesCache(businesses) {
    this._businessesCache = businesses;
  }

  /**
   * Oppdater loans cache
   */
  updateLoansCache(loans) {
    this._loansCache = loans;
  }

  /**
   * Hent søknader synkront fra cache
   */
  getApplicationsSync() {
    return this._applicationsCache || [];
  }

  /**
   * Oppdater applications cache
   */
  updateApplicationsCache(applications) {
    this._applicationsCache = applications;
  }

  /**
   * Legg til søknad i cache
   */
  addApplicationToCache(application) {
    this._applicationsCache.push(application);
  }

  /**
   * Oppdater savings cache
   */
  updateSavingsCache(savings) {
    this._savingsCache = savings;
  }

  /**
   * Seed demo-data til Firestore
   */
  async _seedInitialData() {
    try {
      // Last initial-data.json
      const response = await fetch('./data/initial-data.json');
      if (!response.ok) {
        throw new Error('Could not load initial data from initial-data.json');
      }
      
      const jsonData = await response.json();
      console.log('📥 Laster initial data fra JSON:', jsonData);
      
      // Opprett demo-klasserom først
      const demoClassroom = {
        id: 'demo-classroom',
        teacherId: 't1',
        className: jsonData.settings?.className || '7A Demo',
        currencyName: jsonData.settings?.currencyName || 'KlasseKrone',
        currencySymbol: jsonData.settings?.currencySymbol || 'KKr',
        startingBalance: jsonData.settings?.startingBalance || 1000,
        settings: { ...APP_CONFIG.defaults, ...jsonData.settings },
        createdAt: new Date().toISOString()
      };
      
      await firebaseService.create(COLLECTIONS.CLASSROOMS, demoClassroom, 'demo-classroom');
      console.log('✅ Demo-klasserom opprettet');
      
      // Opprett brukere med hashede passord
      for (const user of jsonData.users || []) {
        const hashedPassword = await hashPassword(user.password);
        await firebaseService.create(COLLECTIONS.USERS, {
          ...user,
          password: hashedPassword
        }, user.id);
      }
      console.log('✅ Brukere opprettet:', jsonData.users?.length || 0);
      
      // Opprett transaksjoner
      for (const tx of jsonData.transactions || []) {
        await firebaseService.create(COLLECTIONS.TRANSACTIONS, tx, tx.id);
      }
      console.log('✅ Transaksjoner opprettet:', jsonData.transactions?.length || 0);
      
      // Opprett jobber
      for (const job of jsonData.jobs || []) {
        await firebaseService.create(COLLECTIONS.JOBS, job, job.id);
      }
      console.log('✅ Jobber opprettet:', jsonData.jobs?.length || 0);
      
      console.log('🎉 Initial data seedet til Firebase!');
    } catch (error) {
      console.error('❌ Feil ved seeding av data:', error);
      throw error;
    }
  }

  // ==================== SESSION MANAGEMENT ====================

  /**
   * Sett nåværende bruker ID (kalles av authService)
   */
  setCurrentUserId(userId) {
    this._currentUserId = userId;
  }

  /**
   * Hent nåværende bruker ID
   */
  getCurrentUserId() {
    return this._currentUserId;
  }

  /**
   * Hent classroomId for nåværende bruker
   */
  async getCurrentClassroomId() {
    if (this._currentClassroomId) return this._currentClassroomId;
    
    const userId = this._currentUserId;
    if (!userId) return null;
    
    const user = await this.getUser(userId);
    if (!user) return null;
    
    // Elever har classroomId direkte
    if (user.classroomId) {
      this._currentClassroomId = user.classroomId;
      return user.classroomId;
    }
    
    // Lærere eier klasserom
    if (user.type === 'teacher') {
      const classrooms = await firebaseService.getWhere(COLLECTIONS.CLASSROOMS, 'teacherId', '==', user.id);
      if (classrooms.length > 0) {
        this._currentClassroomId = classrooms[0].id;
        return classrooms[0].id;
      }
    }
    
    return null;
  }

  /**
   * Synkron versjon - bruker cached verdi
   */
  getCurrentClassroomIdSync() {
    return this._currentClassroomId;
  }

  /**
   * Nullstill cached classroom ID og alle caches (ved logout)
   */
  clearCurrentClassroomId() {
    this._currentClassroomId = null;
    this._currentUserId = null;
    this._settingsCache = null;
    this._loansCache = [];
    this._businessesCache = [];
    this._savingsCache = [];
    this._fundsCache = [];
    // Behold usersCache for neste login
  }

  // ==================== HELPER METHODS ====================

  /**
   * Generer unik ID
   */
  _generateId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==================== USER OPERATIONS ====================

  /**
   * Hent alle brukere
   */
  async getUsers() {
    return await firebaseService.getAll(COLLECTIONS.USERS);
  }

  /**
   * Hent bruker by ID - async versjon
   */
  async getUser(userId) {
    return await firebaseService.getById(COLLECTIONS.USERS, userId);
  }

  /**
   * Synkron versjon - bruker cache
   */
  getUserById(userId) {
    if (!userId) return null;
    return this._usersCache.find(u => u.id === userId) || null;
  }

  /**
   * Synkron versjon - NB: Bruker cache
   */
  getUsersSync() {
    return this._usersCache || [];
  }

  /**
   * Hent bruker by username
   */
  async getUserByUsername(username) {
    const normalized = username.toLowerCase();
    // Try exact lowercase match first
    const exact = await firebaseService.getWhere(COLLECTIONS.USERS, 'username', '==', normalized);
    if (exact.length > 0) return exact[0];
    // Fallback: scan all users case-insensitively (handles legacy mixed-case usernames)
    const all = await firebaseService.getAll(COLLECTIONS.USERS);
    return all.find(u => u.username.toLowerCase() === normalized) || null;
  }

  /**
   * Hent bruker by account number
   */
  async getUserByAccountNumber(accountNumber, classroomId = null) {
    if (classroomId) {
      const users = await firebaseService.getWhereMultiple(COLLECTIONS.USERS, [
        { field: 'accountNumber', operator: '==', value: accountNumber },
        { field: 'classroomId', operator: '==', value: classroomId }
      ]);
      return users.length > 0 ? users[0] : null;
    }
    
    const users = await firebaseService.getWhere(COLLECTIONS.USERS, 'accountNumber', '==', accountNumber);
    return users.length > 0 ? users[0] : null;
  }

  /**
   * Opprett ny bruker
   */
  async createUser(userData) {
    // Normaliser brukernavn til lowercase
    userData = { ...userData, username: userData.username.toLowerCase() };

    // Valider at username er unikt
    const existingUser = await this.getUserByUsername(userData.username);
    if (existingUser) {
      throw new Error(languageService.t('error.usernameAlreadyExists'));
    }
    
    // Valider at accountNumber er unikt innenfor klasserom
    if (userData.classroomId) {
      const existingAccount = await this.getUserByAccountNumber(userData.accountNumber, userData.classroomId);
      if (existingAccount) {
        throw new Error(languageService.t('error.accountNumberExistsInClassroom'));
      }
    }
    
    const newUser = {
      ...userData,
      password: await hashPassword(userData.password),
      createdAt: new Date().toISOString()
    };
    
    const userId = userData.id || this._generateId('s');
    const createdUser = await firebaseService.create(COLLECTIONS.USERS, newUser, userId);
    
    // Legg til i cache
    this._usersCache.push({ id: userId, ...newUser });
    
    return createdUser;
  }

  /**
   * Oppdater bruker
   */
  async updateUser(userId, updates) {
    // Fjern undefined verdier
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    
    const result = await firebaseService.update(COLLECTIONS.USERS, userId, cleanUpdates);
    
    // Oppdater cache
    const cacheIndex = this._usersCache.findIndex(u => u.id === userId);
    if (cacheIndex >= 0) {
      this._usersCache[cacheIndex] = { ...this._usersCache[cacheIndex], ...cleanUpdates };
    }
    
    return result;
  }

  /**
   * Slett bruker
   */
  async deleteUser(userId) {
    await firebaseService.delete(COLLECTIONS.USERS, userId);
    // Fjern fra cache
    const cacheIndex = this._usersCache.findIndex(u => u.id === userId);
    if (cacheIndex >= 0) {
      this._usersCache.splice(cacheIndex, 1);
    }
    return true;
  }

  /**
   * Slett klasserom med all tilhørende data
   */
  async deleteClassroom(classroomId) {
    // Slett all data tilknyttet klasserommet
    await this.deleteAllClassroomData(classroomId);
    // Slett selve klasserommet
    return await firebaseService.delete(COLLECTIONS.CLASSROOMS, classroomId);
  }

  /**
   * Slett all data tilknyttet et klasserom
   * Kalles når klasserom eller lærer slettes
   */
  async deleteAllClassroomData(classroomId) {
    console.log(`🗑️ Sletter all data for klasserom: ${classroomId}`);

    try {
      // Samle bruker-IDer i klasserommet for å kunne rydde legacy-transaksjoner uten classroomId
      const classroomUsers = await firebaseService.getWhere(COLLECTIONS.USERS, 'classroomId', '==', classroomId);
      const classroom = await this.getClassroom(classroomId);
      const classroomUserIds = new Set((classroomUsers || []).map(u => u.id));
      if (classroom?.teacherId) {
        classroomUserIds.add(classroom.teacherId);
      }
      for (const user of (classroomUsers || [])) {
        if (user.type === 'teacher') {
          classroomUserIds.add(user.id);
        }
      }

      // Slett bedrifter
      const deletedBusinesses = await firebaseService.deleteWhere(COLLECTIONS.BUSINESSES, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedBusinesses} bedrifter`);

      // Slett lån
      const deletedLoans = await firebaseService.deleteWhere(COLLECTIONS.LOANS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedLoans} lån`);

      // Slett sparekontoer
      const deletedSavings = await firebaseService.deleteWhere(COLLECTIONS.SAVINGS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedSavings} sparekontoer`);

      // Slett jobber
      const deletedJobs = await firebaseService.deleteWhere(COLLECTIONS.JOBS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedJobs} jobber`);

      // Slett vanlige jobbsøknader
      const deletedApplications = await firebaseService.deleteWhere(COLLECTIONS.APPLICATIONS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedApplications} søknader`);

      // Slett jobbtilbud
      const deletedJobOffers = await firebaseService.deleteWhere(COLLECTIONS.JOB_OFFERS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedJobOffers} jobbtilbud`);

      // Slett jobbsøknader
      const deletedJobApps = await firebaseService.deleteWhere(COLLECTIONS.JOB_APPLICATIONS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedJobApps} jobbsøknader`);

      // Slett lånesøknader
      const deletedLoanApps = await firebaseService.deleteWhere(COLLECTIONS.LOAN_APPLICATIONS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedLoanApps} lånesøknader`);

      // Slett meldinger (lærer-meldinger)
      const deletedMessages = await firebaseService.deleteWhere(COLLECTIONS.MESSAGES, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedMessages} meldinger`);

      // Slett innboks-meldinger
      const deletedInbox = await firebaseService.deleteWhere(COLLECTIONS.INBOX, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedInbox} innboks-meldinger`);

      // Slett utboks-meldinger
      const deletedOutbox = await firebaseService.deleteWhere(COLLECTIONS.OUTBOX, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedOutbox} utboks-meldinger`);

      // Slett ukentlige snapshots
      const deletedSnapshots = await firebaseService.deleteWhere(COLLECTIONS.WEEKLY_SNAPSHOTS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedSnapshots} ukentlige snapshots`);

      // Slett transaksjoner
      const deletedTx = await firebaseService.deleteWhere(COLLECTIONS.TRANSACTIONS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedTx} transaksjoner`);

      // Slett legacy-transaksjoner uten classroomId som involverer klasserommets brukere
      let deletedLegacyTx = 0;
      if (classroomUserIds.size > 0) {
        const allTransactions = await firebaseService.getAll(COLLECTIONS.TRANSACTIONS);
        const legacyTransactions = allTransactions.filter(tx => {
          if (tx.classroomId) return false;
          return classroomUserIds.has(tx.senderId) || classroomUserIds.has(tx.recipientId);
        });

        for (const tx of legacyTransactions) {
          await firebaseService.delete(COLLECTIONS.TRANSACTIONS, tx.id);
          deletedLegacyTx++;
        }
      }
      console.log(`  - Slettet ${deletedLegacyTx} legacy-transaksjoner uten classroomId`);

      // Slett notifikasjoner
      const deletedNotifications = await firebaseService.deleteWhere(COLLECTIONS.NOTIFICATIONS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedNotifications} notifikasjoner`);

      // Slett eierandelstilbud
      const deletedOwnershipOffers = await firebaseService.deleteWhere(COLLECTIONS.OWNERSHIP_OFFERS, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedOwnershipOffers} eierandelstilbud`);

      // Slett skattekonto-data
      const deletedTaxAccount = await firebaseService.deleteWhere(COLLECTIONS.TAX_ACCOUNT, 'classroomId', '==', classroomId);
      console.log(`  - Slettet ${deletedTaxAccount} skattekonto-data`);

      console.log(`✅ All data for klasserom ${classroomId} slettet`);
    } catch (error) {
      console.error(`❌ Feil ved sletting av klasseromdata:`, error);
      throw error;
    }
  }

  /**
   * Oppdater brukers saldo
   */
  async updateUserBalance(userId, amount) {
    const user = await this.getUser(userId);
    if (!user) throw new Error(languageService.t('error.userNotFound'));
    
    const newBalance = (user.balance || 0) + amount;
    return await this.updateUser(userId, { balance: newBalance });
  }

  // ==================== TRANSACTION OPERATIONS ====================

  /**
   * Hent alle transaksjoner
   */
  async getTransactions() {
    return await firebaseService.getAll(COLLECTIONS.TRANSACTIONS);
  }

  /**
   * Hent transaksjoner for en bruker
   */
  async getUserTransactions(userId) {
    const allTx = await this.getTransactions();
    return allTx
      .filter(t => t.senderId === userId || t.recipientId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Opprett transaksjon (atomisk med balance updates)
   */
  async createTransaction(transactionData) {
    const { senderId, recipientId, amount, message, classroomId } = transactionData;
    
    // Sjekk om sender/recipient er virtuelle kontoer (bank)
    const isVirtualSender = senderId === 'central-bank' || senderId === 'tax-account';
    const isVirtualRecipient = recipientId === 'central-bank' || recipientId === 'tax-account';
    const isTaxRecipient = recipientId === 'tax-account';
    
    // Hent sender (eller lag virtuell)
    let sender;
    if (isVirtualSender) {
      sender = {
        id: senderId,
        name: senderId === 'central-bank' ? 'Sentralbanken' : 'Skattekassen',
        type: 'bank',
        balance: Infinity
      };
    } else {
      sender = await this.getUser(senderId);
    }
    
    // Hent recipient (eller lag virtuell)
    let recipient;
    if (isVirtualRecipient) {
      recipient = {
        id: recipientId,
        name: recipientId === 'central-bank' ? 'Sentralbanken' : 'Skattekassen',
        type: 'bank',
        balance: 0
      };
    } else {
      recipient = await this.getUser(recipientId);
    }
    
    if (!sender || !recipient) {
      throw new Error(languageService.t('error.senderOrRecipientNotFound'));
    }
    
    // Valider saldo (ikke for lærer/bank)
    if (sender.type !== 'teacher' && sender.type !== 'bank' && sender.balance < amount) {
      throw new Error(languageService.t('error.insufficientAccountBalance'));
    }
    
    // Hent classroomId fra sender hvis ikke oppgitt
    const txClassroomId = classroomId || sender.classroomId || await this.getCurrentClassroomId();
    
    // Opprett transaksjon
    const transaction = {
      senderId,
      senderName: sender.name,
      recipientId,
      recipientName: recipient.name,
      amount,
      message: message || '',
      timestamp: new Date().toISOString(),
      participants: [senderId, recipientId],
      classroomId: txClassroomId
    };
    
    // Bruk Firebase transaction for atomisk operasjon
    const db = firebaseService.getDb();
    
    await db.runTransaction(async (t) => {
      // Oppdater sender saldo (hvis ikke lærer/bank)
      if (sender.type !== 'teacher' && sender.type !== 'bank') {
        const senderRef = db.collection(COLLECTIONS.USERS).doc(senderId);
        t.update(senderRef, { 
          balance: sender.balance - amount,
          updatedAt: new Date().toISOString()
        });
      }
      
      // Oppdater mottaker saldo (kun hvis ikke virtuell)
      if (!isVirtualRecipient) {
        const recipientRef = db.collection(COLLECTIONS.USERS).doc(recipientId);
        t.update(recipientRef, { 
          balance: recipient.balance + amount,
          updatedAt: new Date().toISOString()
        });
      }
    });
    
    // Oppdater users cache etter vellykket Firebase-transaksjon
    if (sender.type !== 'teacher' && sender.type !== 'bank') {
      const senderCacheIndex = this._usersCache.findIndex(u => u.id === senderId);
      if (senderCacheIndex >= 0) {
        this._usersCache[senderCacheIndex].balance = sender.balance - amount;
      }
    }
    if (!isVirtualRecipient) {
      const recipientCacheIndex = this._usersCache.findIndex(u => u.id === recipientId);
      if (recipientCacheIndex >= 0) {
        this._usersCache[recipientCacheIndex].balance = recipient.balance + amount;
      }
    }
    
    // Hvis mottaker er skattekassen, oppdater taxAccount
    if (isTaxRecipient && txClassroomId) {
      await this.addToTaxAccount(txClassroomId, amount, sender.name, message);
    }
    
    // Lagre transaksjonen
    return await firebaseService.create(COLLECTIONS.TRANSACTIONS, transaction);
  }
  
  /**
   * Legg til penger i skattekassen for et klasserom
   */
  async addToTaxAccount(classroomId, amount, fromName, description = '') {
    const db = firebaseService.getDb();
    const taxRef = db.collection(COLLECTIONS.CLASSROOMS).doc(classroomId);
    
    // Hent eksisterende taxAccount data
    const classroomDoc = await taxRef.get();
    const classroomData = classroomDoc.data() || {};
    const taxAccount = classroomData.taxAccount || { balance: 0, transactions: [] };
    
    // Oppdater
    taxAccount.balance = (taxAccount.balance || 0) + amount;
    taxAccount.transactions = taxAccount.transactions || [];
    taxAccount.transactions.push({
      id: Date.now().toString(),
      type: 'income',
      amount: amount,
      fromName: fromName,
      description: description || 'Overføring til skattekassen',
      date: new Date().toISOString()
    });
    
    // Lagre tilbake
    await taxRef.update({ taxAccount: taxAccount });
    console.log(`💰 Skattekasse oppdatert: +${amount} (ny saldo: ${taxAccount.balance})`);
  }

  /**
   * Legg til transaksjon direkte (for businessService etc.)
   */
  async addTransaction(userId, transactionData) {
    const user = await this.getUser(userId);
    
    let senderName = '';
    let recipientName = '';
    
    if (transactionData.type === 'expense') {
      senderName = transactionData.fromName || user?.name || 'Ukjent';
      recipientName = transactionData.toName || transactionData.description || 'Ukjent';
    } else {
      senderName = transactionData.fromName || transactionData.description || 'Ukjent';
      recipientName = transactionData.toName || user?.name || 'Ukjent';
    }
    
    const transaction = {
      senderId: transactionData.type === 'expense' ? userId : null,
      senderName,
      recipientId: transactionData.type === 'income' ? userId : null,
      recipientName,
      amount: transactionData.amount,
      message: transactionData.description || '',
      category: transactionData.category || 'general',
      timestamp: new Date().toISOString()
    };
    
    return await firebaseService.create(COLLECTIONS.TRANSACTIONS, transaction);
  }

  // ==================== JOB OPERATIONS ====================

  /**
   * Hent alle jobber
   */
  async getJobs() {
    return await firebaseService.getAll(COLLECTIONS.JOBS);
  }

  /**
   * Hent jobb by ID
   */
  async getJob(jobId) {
    return await firebaseService.getById(COLLECTIONS.JOBS, jobId);
  }

  /**
   * Opprett ny jobb
   */
  async createJob(jobData) {
    const newJob = {
      title: jobData.title,
      description: jobData.description || '',
      salary: jobData.salary,
      type: jobData.type,
      postedBy: jobData.postedBy,
      classroomId: jobData.classroomId,
      status: jobData.status || 'active',
      assignedTo: jobData.assignedTo || null,
      assignedAt: jobData.assignedTo ? new Date().toISOString() : null,
      completedAt: null,
      lastPaymentAt: null,
      isDirectOffer: jobData.isDirectOffer || false // For direkte jobbtilbud
    };

    return await firebaseService.create(COLLECTIONS.JOBS, newJob);
  }

  /**
   * Oppdater jobb
   */
  async updateJob(jobId, updates) {
    return await firebaseService.update(COLLECTIONS.JOBS, jobId, updates);
  }

  /**
   * Slett jobb
   */
  async deleteJob(jobId) {
    await firebaseService.delete(COLLECTIONS.JOBS, jobId);
    
    // Slett relaterte søknader
    await firebaseService.deleteWhere(COLLECTIONS.APPLICATIONS, 'jobId', '==', jobId);
    
    return true;
  }

  // ==================== APPLICATION OPERATIONS ====================

  /**
   * Hent alle søknader
   */
  async getApplications() {
    return await firebaseService.getAll(COLLECTIONS.APPLICATIONS);
  }

  /**
   * Hent søknader for en jobb
   */
  async getJobApplications(jobId) {
    return await firebaseService.getWhere(COLLECTIONS.APPLICATIONS, 'jobId', '==', jobId);
  }

  /**
   * Hent søknader fra en bruker
   */
  async getUserApplications(userId) {
    return await firebaseService.getWhere(COLLECTIONS.APPLICATIONS, 'applicantId', '==', userId);
  }

  /**
   * Opprett søknad
   */
  async createApplication(applicationData) {
    // Sjekk om bruker allerede har søkt
    const existing = await firebaseService.getWhereMultiple(COLLECTIONS.APPLICATIONS, [
      { field: 'jobId', operator: '==', value: applicationData.jobId },
      { field: 'applicantId', operator: '==', value: applicationData.applicantId },
      { field: 'status', operator: '==', value: 'pending' }
    ]);

    if (existing.length > 0) {
      throw new Error(languageService.t('error.alreadyAppliedForJob'));
    }

    // Legg til classroomId for korrekt filtrering
    const classroomId = await this.getCurrentClassroomId();
    const newApplication = {
      ...applicationData,
      classroomId: classroomId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const created = await firebaseService.create(COLLECTIONS.APPLICATIONS, newApplication);

    // Oppdater cache
    this.addApplicationToCache(created);

    return created;
  }

  /**
   * Oppdater søknad
   */
  async updateApplication(applicationId, updates) {
    const result = await firebaseService.update(COLLECTIONS.APPLICATIONS, applicationId, updates);

    // Oppdater cache
    const cacheIndex = this._applicationsCache.findIndex(a => a.id === applicationId);
    if (cacheIndex >= 0) {
      this._applicationsCache[cacheIndex] = { ...this._applicationsCache[cacheIndex], ...updates };
    }

    return result;
  }

  /**
   * Batch oppdater søknader
   */
  async batchUpdateApplications(updates) {
    const operations = updates.map(({ id, ...updateData }) => ({
      type: 'update',
      collection: COLLECTIONS.APPLICATIONS,
      docId: id,
      data: updateData
    }));

    await firebaseService.batchWrite(operations);

    // Oppdater cache for alle
    for (const { id, ...updateData } of updates) {
      const cacheIndex = this._applicationsCache.findIndex(a => a.id === id);
      if (cacheIndex >= 0) {
        this._applicationsCache[cacheIndex] = { ...this._applicationsCache[cacheIndex], ...updateData };
      }
    }

    return true;
  }

  // ==================== CLASSROOM OPERATIONS ====================

  /**
   * Hent alle klasserom
   */
  async getClassrooms() {
    return await firebaseService.getAll(COLLECTIONS.CLASSROOMS);
  }

  /**
   * Hent klasserom by ID
   */
  async getClassroom(classroomId) {
    return await firebaseService.getById(COLLECTIONS.CLASSROOMS, classroomId);
  }

  /**
   * Opprett klasserom
   */
  async createClassroom(classroomData) {
    const classroomId = classroomData.id || this._generateId('classroom_');
    return await firebaseService.create(COLLECTIONS.CLASSROOMS, classroomData, classroomId);
  }

  /**
   * Oppdater klasserom
   */
  async updateClassroom(classroomId, updates) {
    return await firebaseService.update(COLLECTIONS.CLASSROOMS, classroomId, updates);
  }

  // ==================== CLASSROOM-ISOLATED DATA ====================

  /**
   * Hent data for nåværende klasserom
   * Erstatter localStorage-basert getClassroomData
   */
  async getClassroomData(collectionName) {
    const classroomId = await this.getCurrentClassroomId();
    if (!classroomId) return [];
    
    return await firebaseService.getWhere(collectionName, 'classroomId', '==', classroomId);
  }

  /**
   * Lagre data med classroom ID
   * MERK: For arrays, bruk saveClassroomItems() i stedet
   */
  async saveClassroomData(collectionName, data, docId = null) {
    const classroomId = await this.getCurrentClassroomId();
    
    // Håndter arrays - lagre hvert element separat
    if (Array.isArray(data)) {
      console.log(`📦 Lagrer ${data.length} elementer til ${collectionName}`);
      const results = [];
      for (const item of data) {
        if (item.id) {
          // Oppdater eksisterende
          const updated = await this.saveClassroomItem(collectionName, item);
          results.push(updated);
        } else {
          // Opprett ny
          const created = await this.createClassroomItem(collectionName, item);
          results.push(created);
        }
      }
      return results;
    }
    
    // Enkelt objekt
    const dataWithClassroom = {
      ...data,
      classroomId: classroomId || data.classroomId
    };
    
    if (docId) {
      return await firebaseService.update(collectionName, docId, dataWithClassroom);
    }
    return await firebaseService.create(collectionName, dataWithClassroom);
  }

  /**
   * Opprett enkelt element i classroom-isolert collection
   */
  async createClassroomItem(collectionName, data) {
    const classroomId = await this.getCurrentClassroomId();
    const dataWithClassroom = {
      ...data,
      classroomId: classroomId || data.classroomId
    };
    
    const docId = data.id || this._generateId();
    return await firebaseService.create(collectionName, dataWithClassroom, docId);
  }

  /**
   * Lagre enkelt element i classroom-isolert collection (opprett eller oppdater)
   */
  async saveClassroomItem(collectionName, data) {
    if (!data.id) {
      return await this.createClassroomItem(collectionName, data);
    }

    const classroomId = await this.getCurrentClassroomId();
    const dataWithClassroom = {
      ...data,
      classroomId: classroomId || data.classroomId
    };

    // Bruk set() i stedet for update() for å håndtere både nye og eksisterende dokumenter
    return await firebaseService.set(collectionName, data.id, dataWithClassroom);
  }

  /**
   * Slett enkelt element fra classroom-isolert collection
   */
  async deleteClassroomItem(collectionName, itemId) {
    return await firebaseService.delete(collectionName, itemId);
  }

  /**
   * Hent enkelt element by ID fra classroom-isolert collection
   */
  async getClassroomItem(collectionName, itemId) {
    return await firebaseService.getById(collectionName, itemId);
  }

  // ==================== SETTINGS OPERATIONS ====================

  /**
   * Hent innstillinger for nåværende klasserom
   */
  async getSettings() {
    const classroomId = await this.getCurrentClassroomId();
    
    if (classroomId) {
      const classroom = await this.getClassroom(classroomId);
      if (classroom && classroom.settings) {
        return { ...APP_CONFIG.defaults, ...classroom.settings };
      }
    }
    
    return APP_CONFIG.defaults;
  }

  /**
   * Synkron versjon - bruker cache (kall loadClassroomDataToCache først)
   */
  getSettingsSync() {
    return this._settingsCache || APP_CONFIG.defaults;
  }

  /**
   * Asynkron alias
   */
  async getSettingsAsync() {
    return await this.getSettings();
  }

  /**
   * Oppdater innstillinger
   */
  async updateSettings(updates) {
    const classroomId = await this.getCurrentClassroomId();
    
    if (classroomId) {
      const classroom = await this.getClassroom(classroomId);
      if (classroom) {
        const newSettings = {
          ...APP_CONFIG.defaults,
          ...classroom.settings,
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        const classroomUpdates = { settings: newSettings };
        
        // Oppdater toppnivå-felt
        if (updates.className) classroomUpdates.className = updates.className;
        if (updates.currencyName) classroomUpdates.currencyName = updates.currencyName;
        if (updates.currencySymbol) classroomUpdates.currencySymbol = updates.currencySymbol;
        if (updates.startingBalance) classroomUpdates.startingBalance = updates.startingBalance;
        
        await this.updateClassroom(classroomId, classroomUpdates);
        return newSettings;
      }
    }
    
    return updates;
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Batch oppdater saldoer
   */
  async batchUpdateBalances(balanceUpdates) {
    const operations = [];
    
    for (const { userId, amount } of balanceUpdates) {
      const user = await this.getUser(userId);
      if (user) {
        operations.push({
          type: 'update',
          collection: COLLECTIONS.USERS,
          docId: userId,
          data: { balance: (user.balance || 0) + amount }
        });
      }
    }
    
    await firebaseService.batchWrite(operations);
    return true;
  }

  // ==================== JOB OFFERS ====================

  /**
   * Hent alle jobbtilbud for et klasserom
   */
  async getJobOffers(classroomId = null) {
    const cId = classroomId || await this.getCurrentClassroomId();
    if (!cId) return [];
    return await firebaseService.getWhere(COLLECTIONS.JOB_OFFERS, 'classroomId', '==', cId);
  }

  /**
   * Hent jobbtilbud for en spesifikk bruker
   */
  async getJobOffersForUser(userId) {
    return await firebaseService.getWhere(COLLECTIONS.JOB_OFFERS, 'targetUserId', '==', userId);
  }

  /**
   * Opprett jobbtilbud
   */
  async createJobOffer(offerData) {
    const classroomId = await this.getCurrentClassroomId();
    return await firebaseService.create(COLLECTIONS.JOB_OFFERS, {
      ...offerData,
      classroomId,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Oppdater jobbtilbud
   */
  async updateJobOffer(offerId, updates) {
    return await firebaseService.update(COLLECTIONS.JOB_OFFERS, offerId, updates);
  }

  /**
   * Slett jobbtilbud
   */
  async deleteJobOffer(offerId) {
    return await firebaseService.delete(COLLECTIONS.JOB_OFFERS, offerId);
  }

  /**
   * Slett jobbtilbud for en jobb
   */
  async deleteJobOffersForJob(jobId) {
    return await firebaseService.deleteWhere(COLLECTIONS.JOB_OFFERS, 'jobId', '==', jobId);
  }

  // ==================== JOB APPLICATIONS (Business) ====================

  /**
   * Hent alle bedriftsjobb-søknader for et klasserom
   */
  async getBusinessJobApplications(classroomId = null) {
    const cId = classroomId || await this.getCurrentClassroomId();
    if (!cId) return [];
    return await firebaseService.getWhere(COLLECTIONS.JOB_APPLICATIONS, 'classroomId', '==', cId);
  }

  /**
   * Hent søknader for en spesifikk bedrift
   */
  async getBusinessJobApplicationsForBusiness(businessId) {
    return await firebaseService.getWhere(COLLECTIONS.JOB_APPLICATIONS, 'businessId', '==', businessId);
  }

  /**
   * Hent søknader fra en spesifikk bruker
   */
  async getBusinessJobApplicationsForUser(userId) {
    return await firebaseService.getWhere(COLLECTIONS.JOB_APPLICATIONS, 'applicantId', '==', userId);
  }

  /**
   * Opprett bedriftsjobb-søknad
   */
  async createBusinessJobApplication(applicationData) {
    const classroomId = await this.getCurrentClassroomId();
    const newApplication = {
      ...applicationData,
      classroomId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    const created = await firebaseService.create(COLLECTIONS.JOB_APPLICATIONS, newApplication);

    // Oppdater caches
    this._businessJobApplicationsCache.push(created);
    this.cache.businessJobApplications.push(created);

    return created;
  }

  /**
   * Oppdater bedriftsjobb-søknad
   */
  async updateBusinessJobApplication(applicationId, updates) {
    const result = await firebaseService.update(COLLECTIONS.JOB_APPLICATIONS, applicationId, updates);

    // Oppdater caches
    const cacheIndex = this._businessJobApplicationsCache.findIndex(a => a.id === applicationId);
    if (cacheIndex >= 0) {
      this._businessJobApplicationsCache[cacheIndex] = { ...this._businessJobApplicationsCache[cacheIndex], ...updates };
      this.cache.businessJobApplications[cacheIndex] = this._businessJobApplicationsCache[cacheIndex];
    }

    return result;
  }

  /**
   * Slett bedriftsjobb-søknad
   */
  async deleteBusinessJobApplication(applicationId) {
    const result = await firebaseService.delete(COLLECTIONS.JOB_APPLICATIONS, applicationId);

    // Fjern fra caches
    this._businessJobApplicationsCache = this._businessJobApplicationsCache.filter(a => a.id !== applicationId);
    this.cache.businessJobApplications = this._businessJobApplicationsCache;

    return result;
  }

  /**
   * Slett søknader for en bedrift
   */
  async deleteBusinessJobApplicationsForBusiness(businessId) {
    const result = await firebaseService.deleteWhere(COLLECTIONS.JOB_APPLICATIONS, 'businessId', '==', businessId);

    // Fjern fra caches
    this._businessJobApplicationsCache = this._businessJobApplicationsCache.filter(a => a.businessId !== businessId);
    this.cache.businessJobApplications = this._businessJobApplicationsCache;

    return result;
  }

  // ==================== LOAN APPLICATIONS ====================

  /**
   * Hent alle lånesøknader for et klasserom
   */
  async getLoanApplications(classroomId = null) {
    const cId = classroomId || await this.getCurrentClassroomId();
    if (!cId) return [];
    return await firebaseService.getWhere(COLLECTIONS.LOAN_APPLICATIONS, 'classroomId', '==', cId);
  }

  /**
   * Hent lånesøknader fra en spesifikk bruker
   */
  async getLoanApplicationsForUser(userId) {
    return await firebaseService.getWhere(COLLECTIONS.LOAN_APPLICATIONS, 'applicantId', '==', userId);
  }

  /**
   * Opprett lånesøknad
   */
  async createLoanApplication(applicationData) {
    const classroomId = await this.getCurrentClassroomId();
    return await firebaseService.create(COLLECTIONS.LOAN_APPLICATIONS, {
      ...applicationData,
      classroomId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Oppdater lånesøknad
   */
  async updateLoanApplication(applicationId, updates) {
    return await firebaseService.update(COLLECTIONS.LOAN_APPLICATIONS, applicationId, updates);
  }

  /**
   * Slett lånesøknad
   */
  async deleteLoanApplication(applicationId) {
    return await firebaseService.delete(COLLECTIONS.LOAN_APPLICATIONS, applicationId);
  }

  // ==================== MESSAGES / INBOX ====================

  /**
   * Hent meldinger for en bruker (inbox)
   */
  async getInbox(userId) {
    return await firebaseService.getWhere(COLLECTIONS.INBOX, 'recipientId', '==', userId);
  }

  /**
   * Hent meldinger for en bedrift
   */
  async getBusinessMessages(businessId) {
    return await firebaseService.getWhere(COLLECTIONS.MESSAGES, 'businessId', '==', businessId);
  }

  /**
   * Hent lærermeldinger for et klasserom
   */
  async getTeacherMessages(classroomId = null) {
    const cId = classroomId || await this.getCurrentClassroomId();
    if (!cId) return [];
    return await firebaseService.getWhereMultiple(COLLECTIONS.MESSAGES, [
      { field: 'type', operator: '==', value: 'teacher' },
      { field: 'classroomId', operator: '==', value: cId }
    ]);
  }

  /**
   * Opprett melding i inbox med automatisk utboks-kopi
   */
  async createInboxMessage(messageData) {
    const classroomId = await this.getCurrentClassroomId();
    const timestamp = new Date().toISOString();
    const messageId = this._generateId('msg');

    // Bestem kategori basert på type og sendertype
    const category = this._determineMessageCategory(messageData);

    // Opprett meldingen i innboks
    const inboxMessage = {
      ...messageData,
      id: messageId,
      classroomId,
      category,
      read: false,
      readAt: null,
      createdAt: timestamp
    };

    const created = await firebaseService.create(COLLECTIONS.INBOX, inboxMessage, messageId);

    // Opprett utboks-kopi automatisk (hvis det er en avsender)
    if (messageData.fromId || messageData.senderId) {
      await this.createOutboxEntry({
        originalMessageId: messageId,
        senderId: messageData.fromId || messageData.senderId,
        senderName: messageData.fromName || messageData.senderName,
        senderType: messageData.fromType || messageData.senderType || 'system',
        recipientId: messageData.recipientId,
        recipientName: messageData.recipientName || await this._getRecipientName(messageData.recipientId),
        recipientType: messageData.recipientType || 'student',
        title: messageData.title,
        message: messageData.message,
        messageType: messageData.type,
        category,
        classroomId,
        recipientRead: false,
        recipientReadAt: null,
        createdAt: timestamp
      });
    }

    return created;
  }

  /**
   * Bestem meldingskategori basert på type og avsender
   */
  _determineMessageCategory(messageData) {
    const type = messageData.type || '';
    const fromType = messageData.fromType || messageData.senderType || '';

    // System-kategorier (kontrakter, rapporter, varsler)
    const systemTypes = ['system', 'system_alert', 'contract', 'loan_contract', 'loan_approved',
      'loan_rejected', 'loan_paid_off', 'employment_contract', 'ownership_contract',
      'tax_statement', 'salary', 'fine', 'weekly_report', 'interest'];

    if (systemTypes.includes(type) || fromType === 'system') {
      return 'system';
    }

    // Lån-kategorier
    const loanTypes = ['loan_contract', 'loan_approved', 'loan_rejected', 'loan_paid_off',
      'loan_payment_failed', 'loan_warning', 'loan_reminder'];
    if (loanTypes.includes(type)) {
      return 'loans';
    }

    // Jobb-kategorier
    const jobTypes = ['employment_contract', 'job_offer', 'job_accepted', 'job_completed'];
    if (jobTypes.includes(type)) {
      return 'jobs';
    }

    // Basert på avsendertype
    if (fromType === 'teacher') return 'teacher';
    if (fromType === 'student') return 'students';
    if (fromType === 'business') return 'businesses';

    return 'general';
  }

  /**
   * Hent mottakers navn
   */
  async _getRecipientName(recipientId) {
    if (!recipientId) return 'Ukjent';
    const user = await this.getUser(recipientId);
    return user?.name || user?.username || 'Ukjent';
  }

  /**
   * Opprett bedriftsmelding med automatisk utboks-kopi
   */
  async createBusinessMessage(messageData) {
    const classroomId = await this.getCurrentClassroomId();
    const timestamp = new Date().toISOString();
    const messageId = this._generateId('bm');

    const message = await firebaseService.create(COLLECTIONS.MESSAGES, {
      ...messageData,
      id: messageId,
      classroomId,
      type: 'business',
      read: false,
      createdAt: timestamp
    }, messageId);

    // Opprett utboks-kopi automatisk (hvis det er en avsender)
    if (messageData.fromId || messageData.senderId) {
      await this.createOutboxEntry({
        originalMessageId: messageId,
        senderId: messageData.fromId || messageData.senderId,
        senderName: messageData.fromName || messageData.senderName,
        senderType: messageData.fromType || messageData.senderType || 'student',
        recipientId: messageData.businessId,
        recipientName: messageData.businessName || 'Bedrift',
        recipientType: 'business',
        title: messageData.title,
        message: messageData.message,
        messageType: messageData.type,
        createdAt: timestamp
      });
    }

    return message;
  }

  /**
   * Opprett lærermelding med automatisk utboks-kopi
   */
  async createTeacherMessage(messageData) {
    const classroomId = await this.getCurrentClassroomId();
    const timestamp = new Date().toISOString();
    const messageId = this._generateId('tm');

    const message = await firebaseService.create(COLLECTIONS.MESSAGES, {
      ...messageData,
      id: messageId,
      classroomId,
      type: 'teacher',
      read: false,
      createdAt: timestamp
    }, messageId);

    // Opprett utboks-kopi automatisk (hvis det er en avsender)
    if (messageData.fromId || messageData.senderId) {
      await this.createOutboxEntry({
        originalMessageId: messageId,
        senderId: messageData.fromId || messageData.senderId,
        senderName: messageData.fromName || messageData.senderName,
        senderType: messageData.fromType || messageData.senderType || 'student',
        recipientId: 'teacher',
        recipientName: 'Lærer',
        recipientType: 'teacher',
        title: messageData.title,
        message: messageData.message,
        messageType: messageData.type,
        createdAt: timestamp
      });
    }

    return message;
  }

  /**
   * Marker melding som lest (med readAt timestamp og utboks-oppdatering)
   */
  async markMessageAsRead(messageId, collection = COLLECTIONS.INBOX) {
    const readAt = new Date().toISOString();

    // Oppdater innboks/meldinger med readAt
    await firebaseService.update(collection, messageId, {
      read: true,
      readAt: readAt
    });

    // Oppdater utboks-kopien slik at avsender kan se at meldingen er lest
    await this.updateOutboxReadStatus(messageId, true, readAt);

    return { read: true, readAt };
  }

  // ==================== OUTBOX OPERATIONS ====================

  /**
   * Opprett utboks-innslag
   */
  async createOutboxEntry(entryData) {
    const classroomId = entryData.classroomId || await this.getCurrentClassroomId();
    return await firebaseService.create(COLLECTIONS.OUTBOX, {
      ...entryData,
      classroomId,
      createdAt: entryData.createdAt || new Date().toISOString()
    });
  }

  /**
   * Hent utboks for en bruker (sendte meldinger)
   */
  async getOutbox(senderId) {
    return await firebaseService.getWhere(COLLECTIONS.OUTBOX, 'senderId', '==', senderId);
  }

  /**
   * Hent utboks for en bedrift
   */
  async getBusinessOutbox(businessId) {
    return await firebaseService.getWhere(COLLECTIONS.OUTBOX, 'senderId', '==', businessId);
  }

  /**
   * Oppdater lest-status i utboks
   */
  async updateOutboxReadStatus(originalMessageId, read, readAt = null) {
    try {
      // Finn utboks-innslaget basert på originalMessageId
      const outboxEntries = await firebaseService.getWhere(
        COLLECTIONS.OUTBOX,
        'originalMessageId',
        '==',
        originalMessageId
      );

      if (outboxEntries.length > 0) {
        const entry = outboxEntries[0];
        await firebaseService.update(COLLECTIONS.OUTBOX, entry.id, {
          recipientRead: read,
          recipientReadAt: readAt || new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('Kunne ikke oppdatere utboks lest-status:', error);
      // Ikke kast feil - dette er ikke kritisk
    }
  }

  /**
   * Slett utboks-innslag
   */
  async deleteOutboxEntry(entryId) {
    return await firebaseService.delete(COLLECTIONS.OUTBOX, entryId);
  }

  /**
   * Slett utboks-innslag for en melding
   */
  async deleteOutboxForMessage(originalMessageId) {
    return await firebaseService.deleteWhere(COLLECTIONS.OUTBOX, 'originalMessageId', '==', originalMessageId);
  }

  /**
   * Slett alle utboks-innslag for en bruker
   */
  async deleteOutboxForUser(senderId) {
    return await firebaseService.deleteWhere(COLLECTIONS.OUTBOX, 'senderId', '==', senderId);
  }

  /**
   * Slett melding
   */
  async deleteMessage(messageId, collection = COLLECTIONS.INBOX) {
    return await firebaseService.delete(collection, messageId);
  }

  /**
   * Slett alle meldinger for en bruker
   */
  async deleteInboxForUser(userId) {
    return await firebaseService.deleteWhere(COLLECTIONS.INBOX, 'recipientId', '==', userId);
  }

  /**
   * Slett alle meldinger for en bedrift
   */
  async deleteMessagesForBusiness(businessId) {
    return await firebaseService.deleteWhere(COLLECTIONS.MESSAGES, 'businessId', '==', businessId);
  }

  // ==================== UTILITY ====================

  /**
   * Tøm all data (for testing)
   */
  async clearAll() {
    console.warn('⚠️ clearAll() sletter ALL data i Firebase!');
    // Implementer kun hvis nødvendig for testing
  }

  // ==================== LEGACY SUPPORT ====================
  
  /**
   * For bakoverkompatibilitet med kode som bruker localStorage-keys
   */
  getClassroomStorageKey(baseKey) {
    const classroomId = this._currentClassroomId;
    return classroomId ? `${baseKey}_${classroomId}` : baseKey;
  }

  getClassroomKey(baseKey) {
    return this.getClassroomStorageKey(baseKey);
  }

  /**
   * Legacy: _getFromStorage - For bakoverkompatibilitet
   * Mapper localStorage-nøkler til Firebase collections
   */
  _getFromStorage(key) {
    console.warn(`⚠️ _getFromStorage('${key}') brukes - bør oppdateres til async Firebase-metoder`);
    // Returnerer tom array/objekt for synkrone kall
    // Koden som bruker dette MÅ oppdateres til async
    return [];
  }

  /**
   * Legacy: _saveToStorage - For bakoverkompatibilitet
   * Mapper localStorage-nøkler til Firebase collections
   */
  _saveToStorage(key, data) {
    console.warn(`⚠️ _saveToStorage('${key}') brukes - bør oppdateres til async Firebase-metoder`);
    // For Firebase må vi bruke async metoder
    // Dette er en midlertidig løsning - koden bør oppdateres
    const collectionMap = {
      'econsim_users': COLLECTIONS.USERS,
      'econsim_jobs': COLLECTIONS.JOBS,
      'econsim_transactions': COLLECTIONS.TRANSACTIONS,
      'econsim_applications': COLLECTIONS.APPLICATIONS,
      'econsim_settings': COLLECTIONS.SETTINGS
    };
    
    const collection = collectionMap[key];
    if (collection && Array.isArray(data)) {
      // Asynkron oppdatering i bakgrunnen
      data.forEach(item => {
        if (item.id) {
          firebaseService.update(collection, item.id, item).catch(console.error);
        }
      });
    }
  }

  // ==================== TEACHER REQUEST OPERATIONS ====================

  async createTeacherRequest(requestData) {
    const id = this._generateId('req');
    const record = {
      ...requestData,
      id,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await firebaseService.create(COLLECTIONS.TEACHER_REQUESTS, record, id);
    return record;
  }

  async getTeacherRequests(statusFilter = 'pending') {
    const all = await firebaseService.getAll(COLLECTIONS.TEACHER_REQUESTS);
    if (statusFilter === 'all') return all;
    return all.filter(r => r.status === statusFilter);
  }

  async updateTeacherRequest(requestId, updates) {
    await firebaseService.update(COLLECTIONS.TEACHER_REQUESTS, requestId, updates);
  }

  // ==================== CLOUD SCHEDULER TRIGGER OPERATIONS ====================

  async getCloudSchedulerTriggers() {
    const all = await firebaseService.getAll('schedulerTriggers');
    return all.filter(t => !t.processed);
  }

  async markCloudTriggerProcessed(triggerId) {
    await firebaseService.update('schedulerTriggers', triggerId, { processed: true });
  }
}

// Eksporter singleton instance
export const dataService = new FirebaseDataService();

// Eksporter også collections for andre services
export { COLLECTIONS };

// Eksporter STORAGE_KEYS for bakoverkompatibilitet
export { STORAGE_KEYS } from '../config.js';
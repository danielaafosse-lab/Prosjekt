/**
 * DataService - LocalStorage Implementation
 * 
 * Denne filen inneholder den originale localStorage-versjonen av dataService.
 * Brukes som fallback når Firebase ikke er konfigurert.
 */

import { STORAGE_KEYS, DEMO_USERS, APP_CONFIG, ACCOUNT_PREFIXES, USER_TYPES } from '../config.js';
import { hashPassword } from '../utils/helpers.js';
import { languageService } from '../services/languageService.js';

class LocalStorageDataService {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialiser datalagring med demo-data hvis tomt
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Sjekk om data allerede finnes
      const existingUsers = this._getFromStorage(STORAGE_KEYS.users);
      
      if (!existingUsers || existingUsers.length === 0) {
        console.log('📂 Ingen data i localStorage - laster fra JSON-fil...');
        
        // Prøv å laste fra JSON-fil først
        try {
          // Bruk relativ path som fungerer uansett hvor appen kjører fra
          const response = await fetch('./data/initial-data.json');
          console.log('📥 Fetch response:', response.status, response.statusText);
          if (response.ok) {
            const jsonData = await response.json();
            console.log('✅ JSON-data lastet fra fil:', jsonData);
            
            // Hash passord for brukere fra JSON (hvis de ikke allerede er hashet)
            const usersWithHashedPasswords = await Promise.all(
              (jsonData.users || []).map(async (user) => {
                // SHA-256 hex hash er 64 tegn lang, ren tekst passord er vanligvis kortere
                const isAlreadyHashed = user.password && user.password.length === 64 && /^[a-f0-9]+$/.test(user.password);
                return {
                  ...user,
                  password: isAlreadyHashed ? user.password : await hashPassword(user.password),
                  createdAt: user.createdAt || new Date().toISOString()
                };
              })
            );
            
            // Lagre i localStorage
            this._saveToStorage(STORAGE_KEYS.users, usersWithHashedPasswords);
            this._saveToStorage(STORAGE_KEYS.jobs, jsonData.jobs || []);
            this._saveToStorage(STORAGE_KEYS.transactions, jsonData.transactions || []);
            this._saveToStorage(STORAGE_KEYS.applications, jsonData.applications || []);
            this._saveToStorage(STORAGE_KEYS.settings, jsonData.settings || APP_CONFIG.defaults);
            
            console.log('✅ Initial data lastet fra JSON-fil med hashede passord!');
            this.initialized = true;
            return;
          }
        } catch (jsonError) {
          console.warn('⚠️ Kunne ikke laste JSON-fil, bruker hardkodet demo-data:', jsonError.message);
        }
        
        // Fallback til hardkodet demo-data
        console.log('📋 Initialiserer med hardkodet demo-data...');
        
        // Hash passord for demo-brukere
        const usersWithHashedPasswords = await Promise.all(
          DEMO_USERS.map(async (user) => ({
            ...user,
            password: await hashPassword(user.password),
            createdAt: new Date().toISOString()
          }))
        );
        
        // Initialiser alle collections
        this._saveToStorage(STORAGE_KEYS.users, usersWithHashedPasswords);
        this._saveToStorage(STORAGE_KEYS.transactions, []);
        this._saveToStorage(STORAGE_KEYS.jobs, []);
        this._saveToStorage(STORAGE_KEYS.applications, []);
        this._saveToStorage(STORAGE_KEYS.settings, {
          ...APP_CONFIG.defaults,
          updatedAt: new Date().toISOString()
        });
        
        console.log('Demo-data initialisert (ingen jobber ennå)');
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Feil ved initialisering:', error);
      throw error;
    }
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Les data fra localStorage
   */
  _getFromStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Feil ved lesing fra ${key}:`, error);
      return null;
    }
  }

  /**
   * Lagre data til localStorage
   */
  _saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`Feil ved lagring til ${key}:`, error);
      return false;
    }
  }

  /**
   * Generer unik ID
   */
  _generateId(prefix = '') {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==================== CLASSROOM ISOLATION HELPERS ====================

  /**
   * Generer klasserom-spesifikk storage key
   * @param {string} baseKey - Base storage key (f.eks. 'econsim_loans')
   * @returns {string} - Klasserom-spesifikk key (f.eks. 'econsim_loans_classroom123')
   */
  getClassroomStorageKey(baseKey) {
    const classroomId = this.getCurrentClassroomId();
    return classroomId ? `${baseKey}_${classroomId}` : baseKey;
  }

  /**
   * Hent data med klasserom-isolasjon
   * @param {string} baseKey - Base storage key
   * @returns {any} - Data fra localStorage eller null
   */
  getClassroomData(baseKey) {
    const key = this.getClassroomStorageKey(baseKey);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Lagre data med klasserom-isolasjon
   * @param {string} baseKey - Base storage key
   * @param {any} data - Data som skal lagres
   */
  saveClassroomData(baseKey, data) {
    const key = this.getClassroomStorageKey(baseKey);
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ==================== USER OPERATIONS ====================

  /**
   * Hent alle brukere
   */
  async getUsers() {
    return this._getFromStorage(STORAGE_KEYS.users) || [];
  }

  /**
   * Synkron versjon av getUsers
   */
  getUsersSync() {
    return this._getFromStorage(STORAGE_KEYS.users) || [];
  }

  /**
   * Hent bruker by ID (synkron)
   */
  getUserById(userId) {
    const users = this.getUsersSync();
    return users.find(u => u.id === userId);
  }

  /**
   * Hent bruker by ID
   */
  async getUser(userId) {
    const users = await this.getUsers();
    return users.find(u => u.id === userId);
  }

  /**
   * Hent bruker by username
   */
  async getUserByUsername(username) {
    const users = await this.getUsers();
    return users.find(u => u.username === username);
  }

  /**
   * Hent bruker by account number (filtrer på classroom)
   * 
   * Sentralbank (000) og skattekasse (001) er nå også per klasserom.
   */
  async getUserByAccountNumber(accountNumber, classroomId = null) {
    const users = await this.getUsers();
    
    // Hvis classroomId er oppgitt, alltid filtrer på det (inkl. bank/skatt)
    if (classroomId) {
      return users.find(u => 
        u.accountNumber === accountNumber && 
        u.classroomId === classroomId
      );
    }
    
    // Fallback: returner første match (for bakoverkompatibilitet)
    return users.find(u => u.accountNumber === accountNumber);
  }

  /**
   * Opprett ny bruker
   */
  async createUser(userData) {
    const users = await this.getUsers();
    
    // Valider at username er unikt globalt
    if (users.some(u => u.username === userData.username)) {
      throw new Error(languageService.t('error.usernameAlreadyExists'));
    }
    
    // Valider at accountNumber er unikt INNENFOR samme klasserom
    // (forskjellige klasserom kan ha samme kontonummer)
    if (userData.classroomId) {
      const duplicateInClassroom = users.some(u => 
        u.accountNumber === userData.accountNumber && 
        u.classroomId === userData.classroomId
      );
      if (duplicateInClassroom) {
        throw new Error(languageService.t('error.accountNumberExistsInClassroom'));
      }
    } else {
      // Fallback for brukere uten classroomId (f.eks. lærere uten klasserom)
      if (users.some(u => u.accountNumber === userData.accountNumber && !u.classroomId)) {
        throw new Error(languageService.t('error.accountNumberAlreadyExists'));
      }
    }
    
    const newUser = {
      id: this._generateId('s'),
      ...userData,
      password: await hashPassword(userData.password),
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    this._saveToStorage(STORAGE_KEYS.users, users);
    
    return newUser;
  }

  /**
   * Oppdater bruker
   */
  async updateUser(userId, updates) {
    const users = await this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    
    if (index === -1) {
      throw new Error(languageService.t('error.userNotFound'));
    }
    
    // Fjern undefined verdier fra updates for å unngå å overskrive eksisterende data
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    
    users[index] = {
      ...users[index],
      ...cleanUpdates,
      updatedAt: new Date().toISOString()
    };
    
    this._saveToStorage(STORAGE_KEYS.users, users);
    return users[index];
  }

  /**
   * Slett bruker
   */
  async deleteUser(userId) {
    const users = await this.getUsers();
    const filtered = users.filter(u => u.id !== userId);
    
    if (filtered.length === users.length) {
      throw new Error(languageService.t('error.userNotFound'));
    }
    
    this._saveToStorage(STORAGE_KEYS.users, filtered);
    return true;
  }

  // ==================== TRANSACTION OPERATIONS ====================

  /**
   * Hent alle transaksjoner
   */
  async getTransactions() {
    return this._getFromStorage(STORAGE_KEYS.transactions) || [];
  }

  /**
   * Hent transaksjoner for en bruker
   */
  async getUserTransactions(userId) {
    const transactions = await this.getTransactions();
    return transactions.filter(t => 
      t.senderId === userId || t.recipientId === userId
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Opprett transaksjon (atomisk med balance updates)
   */
  async createTransaction(transactionData) {
    const { senderId, recipientId, amount, message } = transactionData;
    
    // Hent brukere
    const users = await this.getUsers();
    const senderIndex = users.findIndex(u => u.id === senderId);
    const recipientIndex = users.findIndex(u => u.id === recipientId);
    
    if (senderIndex === -1 || recipientIndex === -1) {
      throw new Error(languageService.t('error.senderOrRecipientNotFound'));
    }
    
    const sender = users[senderIndex];
    const recipient = users[recipientIndex];
    
    // Valider at avsender har nok penger (ikke for lærer/bank)
    if (sender.type !== 'teacher' && sender.balance < amount) {
      throw new Error(languageService.t('error.insufficientAccountBalance'));
    }
    
    // Opprett transaksjon
    const transaction = {
      id: this._generateId('tx_'),
      senderId,
      senderName: sender.name,
      recipientId,
      recipientName: recipient.name,
      amount,
      message: message || '',
      timestamp: new Date().toISOString(),
      participants: [senderId, recipientId]
    };
    
    // Oppdater saldoer (atomisk operasjon)
    try {
      if (sender.type !== 'teacher') {
        users[senderIndex].balance -= amount;
      }
      users[recipientIndex].balance += amount;
      
      // Lagre brukere
      this._saveToStorage(STORAGE_KEYS.users, users);
      
      // Lagre transaksjon
      const transactions = await this.getTransactions();
      transactions.push(transaction);
      this._saveToStorage(STORAGE_KEYS.transactions, transactions);
      
      return transaction;
    } catch (error) {
      // Rollback ved feil (i praksis vil localStorage ikke feile her)
      throw new Error(languageService.t('error.transactionFailed') + ': ' + error.message);
    }
  }

  // ==================== JOB OPERATIONS ====================

  /**
   * Hent alle jobber
   */
  async getJobs() {
    return this._getFromStorage(STORAGE_KEYS.jobs) || [];
  }

  /**
   * Hent jobb by ID
   */
  async getJob(jobId) {
    const jobs = await this.getJobs();
    return jobs.find(j => j.id === jobId);
  }

  /**
   * Opprett ny jobb
   */
  async createJob(jobData) {
    console.log('💾 dataService.createJob - Mottatt data:', jobData);
    const jobs = await this.getJobs();
    console.log('📋 Eksisterende jobber:', jobs.length);
    
    const newJob = {
      id: this._generateId('job_'),
      title: jobData.title,
      description: jobData.description || '',
      salary: jobData.salary,
      type: jobData.type,
      postedBy: jobData.postedBy,
      classroomId: jobData.classroomId, // Viktig: Legg til classroomId
      status: jobData.status || 'active',
      assignedTo: jobData.assignedTo || null,
      createdAt: new Date().toISOString(),
      assignedAt: jobData.assignedTo ? new Date().toISOString() : null,
      completedAt: null,
      lastPaymentAt: null
    };
    
    console.log('🆕 Ny jobb objekt:', newJob);
    jobs.push(newJob);
    console.log('📋 Totalt jobber nå:', jobs.length);
    this._saveToStorage(STORAGE_KEYS.jobs, jobs);
    console.log('💾 Lagret til localStorage');
    
    // Verifiser at den ble lagret
    const verifyJobs = await this.getJobs();
    console.log('✅ Verifisering - Jobber i storage:', verifyJobs.length);
    console.log('✅ Jobb opprettet i dataService:', newJob);
    return newJob;
  }

  /**
   * Oppdater jobb
   */
  async updateJob(jobId, updates) {
    const jobs = await this.getJobs();
    const index = jobs.findIndex(j => j.id === jobId);
    
    if (index === -1) {
      throw new Error(languageService.t('error.jobNotFound'));
    }
    
    jobs[index] = {
      ...jobs[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this._saveToStorage(STORAGE_KEYS.jobs, jobs);
    return jobs[index];
  }

  /**
   * Slett jobb
   */
  async deleteJob(jobId) {
    const jobs = await this.getJobs();
    const filtered = jobs.filter(j => j.id !== jobId);
    
    if (filtered.length === jobs.length) {
      throw new Error(languageService.t('error.jobNotFound'));
    }
    
    this._saveToStorage(STORAGE_KEYS.jobs, filtered);
    
    // Slett også relaterte søknader
    const applications = await this.getApplications();
    const filteredApps = applications.filter(a => a.jobId !== jobId);
    this._saveToStorage(STORAGE_KEYS.applications, filteredApps);
    
    return true;
  }

  // ==================== APPLICATION OPERATIONS ====================

  /**
   * Hent alle søknader
   */
  async getApplications() {
    return this._getFromStorage(STORAGE_KEYS.applications) || [];
  }

  /**
   * Hent søknader for en jobb
   */
  async getJobApplications(jobId) {
    const applications = await this.getApplications();
    return applications.filter(a => a.jobId === jobId);
  }

  /**
   * Hent søknader fra en bruker
   */
  async getUserApplications(userId) {
    const applications = await this.getApplications();
    return applications.filter(a => a.applicantId === userId);
  }

  /**
   * Opprett søknad
   */
  async createApplication(applicationData) {
    const applications = await this.getApplications();
    
    // Sjekk om bruker allerede har søkt på denne jobben
    const existing = applications.find(a => 
      a.jobId === applicationData.jobId && 
      a.applicantId === applicationData.applicantId &&
      a.status === 'pending'
    );
    
    if (existing) {
      throw new Error(languageService.t('error.alreadyAppliedForJob'));
    }
    
    const newApplication = {
      id: this._generateId('app_'),
      ...applicationData,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    applications.push(newApplication);
    this._saveToStorage(STORAGE_KEYS.applications, applications);
    
    return newApplication;
  }

  /**
   * Oppdater søknad
   */
  async updateApplication(applicationId, updates) {
    const applications = await this.getApplications();
    const index = applications.findIndex(a => a.id === applicationId);
    
    if (index === -1) {
      throw new Error(languageService.t('error.applicationNotFound'));
    }
    
    applications[index] = {
      ...applications[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this._saveToStorage(STORAGE_KEYS.applications, applications);
    return applications[index];
  }

  /**
   * Batch oppdater flere søknader (for å avvise andre når én godkjennes)
   */
  async batchUpdateApplications(updates) {
    const applications = await this.getApplications();
    
    updates.forEach(({ id, ...updateData }) => {
      const index = applications.findIndex(a => a.id === id);
      if (index !== -1) {
        applications[index] = {
          ...applications[index],
          ...updateData,
          updatedAt: new Date().toISOString()
        };
      }
    });
    
    this._saveToStorage(STORAGE_KEYS.applications, applications);
    return true;
  }

  // ==================== CLASSROOM-ISOLATED STORAGE ====================

  /**
   * Hent klasserom-spesifikk storage key
   * Brukes av alle services for å isolere data per klasserom
   * @param {string} baseKey - Base storage key (f.eks. 'econsim_loans')
   * @returns {string} - Klasserom-spesifikk key (f.eks. 'econsim_loans_classroom123')
   */
  getClassroomKey(baseKey) {
    const classroomId = this.getCurrentClassroomId();
    if (classroomId) {
      return `${baseKey}_${classroomId}`;
    }
    return baseKey; // Fallback til global key hvis ingen klasserom
  }

  /**
   * Hent data fra klasserom-isolert storage
   * @param {string} baseKey - Base storage key
   * @returns {any} - Parsed data eller null
   */
  getClassroomData(baseKey) {
    const key = this.getClassroomKey(baseKey);
    return this._getFromStorage(key);
  }

  /**
   * Lagre data til klasserom-isolert storage
   * @param {string} baseKey - Base storage key
   * @param {any} data - Data å lagre
   */
  saveClassroomData(baseKey, data) {
    const key = this.getClassroomKey(baseKey);
    this._saveToStorage(key, data);
  }

  // ==================== SETTINGS OPERATIONS ====================

  /**
   * Hent classroomId for nåværende bruker
   * Støtter både elever (som har classroomId direkte) og lærere (som eier klasserom)
   */
  getCurrentClassroomId() {
    try {
      // Hent session fra localStorage (authService bruker econsim_session)
      const sessionJson = localStorage.getItem(STORAGE_KEYS.session);
      if (!sessionJson) return null;
      
      const session = JSON.parse(sessionJson);
      const userId = session.userId;
      if (!userId) return null;
      
      // Hent brukeren fra users-listen
      const users = this._getFromStorage(STORAGE_KEYS.users) || [];
      const currentUser = users.find(u => u.id === userId);
      
      if (!currentUser) return null;
      
      // Elever har classroomId direkte
      if (currentUser.classroomId) {
        return currentUser.classroomId;
      }
      
      // Lærere eier klasserom - finn det via teacherId
      if (currentUser.type === 'teacher') {
        const classrooms = this._getFromStorage(STORAGE_KEYS.CLASSROOMS) || [];
        const teacherClassroom = classrooms.find(c => c.teacherId === currentUser.id);
        if (teacherClassroom) {
          return teacherClassroom.id;
        }
      }
      
      return null;
    } catch (e) {
      console.error('Feil ved henting av classroomId:', e);
      return null;
    }
  }

  /**
   * Hent innstillinger for nåværende klasserom (synkron)
   */
  getSettings() {
    // Prøv først å hente fra klasserom
    const classroomId = this.getCurrentClassroomId();
    console.log('📋 getSettings - classroomId:', classroomId);
    
    if (classroomId) {
      const classrooms = this._getFromStorage(STORAGE_KEYS.CLASSROOMS) || [];
      const classroom = classrooms.find(c => c.id === classroomId);
      console.log('📋 getSettings - classroom funnet:', classroom ? classroom.className : 'IKKE FUNNET');
      if (classroom && classroom.settings) {
        console.log('📋 getSettings - returnerer klasserom-innstillinger:', classroom.settings.currencySymbol);
        return { ...APP_CONFIG.defaults, ...classroom.settings };
      }
    }
    
    // Fallback til global settings (for bakoverkompatibilitet)
    console.log('📋 getSettings - FALLBACK til globale innstillinger');
    const settings = this._getFromStorage(STORAGE_KEYS.settings);
    return settings || APP_CONFIG.defaults;
  }

  /**
   * Hent innstillinger (asynkron for bakoverkompatibilitet)
   */
  async getSettingsAsync() {
    return this.getSettings();
  }

  /**
   * Oppdater innstillinger for nåværende klasserom
   */
  async updateSettings(updates) {
    const classroomId = this.getCurrentClassroomId();
    console.log('💾 updateSettings - classroomId:', classroomId);
    console.log('💾 updateSettings - updates:', updates);
    
    if (classroomId) {
      // Oppdater klasserom-spesifikke innstillinger
      const classrooms = this._getFromStorage(STORAGE_KEYS.CLASSROOMS) || [];
      const index = classrooms.findIndex(c => c.id === classroomId);
      console.log('💾 updateSettings - classroom index:', index);
      
      if (index !== -1) {
        classrooms[index].settings = {
          ...APP_CONFIG.defaults,
          ...classrooms[index].settings,
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        // Oppdater også toppnivå-felt på klasserom-objektet
        if (updates.className) classrooms[index].className = updates.className;
        if (updates.currencyName) classrooms[index].currencyName = updates.currencyName;
        if (updates.currencySymbol) classrooms[index].currencySymbol = updates.currencySymbol;
        if (updates.startingBalance) classrooms[index].startingBalance = updates.startingBalance;
        
        this._saveToStorage(STORAGE_KEYS.CLASSROOMS, classrooms);
        console.log('💾 updateSettings - LAGRET til klasserom:', classrooms[index].className);
        return classrooms[index].settings;
      }
    }
    
    // Fallback til global settings
    console.log('💾 updateSettings - FALLBACK til globale innstillinger (FEIL!)');
    const current = this._getFromStorage(STORAGE_KEYS.settings) || APP_CONFIG.defaults;
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this._saveToStorage(STORAGE_KEYS.settings, updated);
    return updated;
  }

  // ==================== BALANCE OPERATIONS ====================

  /**
   * Oppdater brukers saldo (synkron, for businessService)
   */
  updateUserBalance(userId, amount) {
    const users = this._getFromStorage(STORAGE_KEYS.users) || [];
    const index = users.findIndex(u => u.id === userId);
    
    if (index === -1) {
      throw new Error(languageService.t('error.userNotFound'));
    }
    
    users[index].balance = (users[index].balance || 0) + amount;
    users[index].updatedAt = new Date().toISOString();
    
    this._saveToStorage(STORAGE_KEYS.users, users);
    return users[index];
  }

  /**
   * Legg til transaksjon for bruker (for businessService)
   */
  addTransaction(userId, transactionData) {
    const transactions = this._getFromStorage(STORAGE_KEYS.transactions) || [];
    
    // Hent brukerinfo for å få navn og classroomId
    const user = this.getUserById(userId);
    
    // Bestem sender og mottaker basert på type
    let senderName = '';
    let recipientName = '';
    
    if (transactionData.type === 'expense') {
      senderName = transactionData.fromName || user?.name || languageService.t('common.unknown');
      recipientName = transactionData.toName || languageService.t('common.unknown');
    } else {
      senderName = transactionData.fromName || languageService.t('common.unknown');
      recipientName = transactionData.toName || user?.name || languageService.t('common.unknown');
    }
    
    const transaction = {
      id: this._generateId('tx'),
      senderId: transactionData.type === 'expense' ? userId : null,
      senderName: senderName,
      recipientId: transactionData.type === 'income' ? userId : null,
      recipientName: recipientName,
      amount: transactionData.amount,
      message: transactionData.description || '',
      category: transactionData.category || 'general',
      classroomId: user?.classroomId || transactionData.classroomId || this.getCurrentClassroomId(),
      timestamp: new Date().toISOString()
    };
    
    transactions.push(transaction);
    this._saveToStorage(STORAGE_KEYS.transactions, transactions);
    
    return transaction;
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Batch oppdater flere brukeres saldo (for masseutbetalinger)
   */
  async batchUpdateBalances(balanceUpdates) {
    const users = await this.getUsers();
    
    balanceUpdates.forEach(({ userId, amount }) => {
      const index = users.findIndex(u => u.id === userId);
      if (index !== -1) {
        users[index].balance += amount;
        users[index].updatedAt = new Date().toISOString();
      }
    });
    
    this._saveToStorage(STORAGE_KEYS.users, users);
    return true;
  }

  // ==================== UTILITY ====================

  /**
   * Tøm all data (for testing)
   */
  async clearAll() {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    this.initialized = false;
    await this.initialize();
  }
}

// Singleton instance
const dataService = new LocalStorageDataService();

// Eksporter
export { dataService, LocalStorageDataService };

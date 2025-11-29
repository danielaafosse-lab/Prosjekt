/**
 * DataService - Abstrakt data access layer
 * Denne klassen definerer interface for alle dataoperasjoner.
 * Implementasjoner (LocalStorage, SQL, Firebase) må extende denne.
 */

import { STORAGE_KEYS, DEMO_USERS, APP_CONFIG } from '../config.js';
import { hashPassword } from '../utils/helpers.js';

/**
 * LocalStorage implementasjon av DataService
 * Bruker localStorage for all datapersistering
 */
export class LocalStorageDataService {
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
          const response = await fetch('/data/initial-data.json');
          if (response.ok) {
            const jsonData = await response.json();
            console.log('✅ JSON-data lastet fra fil:', jsonData);
            
            // Hash passord for brukere fra JSON (hvis de ikke allerede er hashet)
            const usersWithHashedPasswords = await Promise.all(
              (jsonData.users || []).map(async (user) => {
                // Sjekk om passordet allerede er hashet (starter med $2a$ eller $2b$)
                const isAlreadyHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
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

  // ==================== USER OPERATIONS ====================

  /**
   * Hent alle brukere
   */
  async getUsers() {
    return this._getFromStorage(STORAGE_KEYS.users) || [];
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
   * Hent bruker by account number
   */
  async getUserByAccountNumber(accountNumber) {
    const users = await this.getUsers();
    return users.find(u => u.accountNumber === accountNumber);
  }

  /**
   * Opprett ny bruker
   */
  async createUser(userData) {
    const users = await this.getUsers();
    
    // Valider at username og accountNumber er unike
    if (users.some(u => u.username === userData.username)) {
      throw new Error('Brukernavn eksisterer allerede');
    }
    if (users.some(u => u.accountNumber === userData.accountNumber)) {
      throw new Error('Kontonummer eksisterer allerede');
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
      throw new Error('Bruker ikke funnet');
    }
    
    users[index] = {
      ...users[index],
      ...updates,
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
      throw new Error('Bruker ikke funnet');
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
      throw new Error('Avsender eller mottaker ikke funnet');
    }
    
    const sender = users[senderIndex];
    const recipient = users[recipientIndex];
    
    // Valider at avsender har nok penger (ikke for lærer/bank)
    if (sender.type !== 'teacher' && sender.balance < amount) {
      throw new Error('Ikke nok penger på konto');
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
      throw new Error('Transaksjon feilet: ' + error.message);
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
      throw new Error('Jobb ikke funnet');
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
      throw new Error('Jobb ikke funnet');
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
      throw new Error('Du har allerede søkt på denne jobben');
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
      throw new Error('Søknad ikke funnet');
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

  // ==================== SETTINGS OPERATIONS ====================

  /**
   * Hent innstillinger
   */
  async getSettings() {
    const settings = this._getFromStorage(STORAGE_KEYS.settings);
    return settings || APP_CONFIG.defaults;
  }

  /**
   * Oppdater innstillinger
   */
  async updateSettings(updates) {
    const current = await this.getSettings();
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this._saveToStorage(STORAGE_KEYS.settings, updated);
    return updated;
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

// Eksporter singleton instance
export const dataService = new LocalStorageDataService();

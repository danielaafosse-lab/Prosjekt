/**
 * EconSim Configuration
 * Sentral konfigurasjonsfil for hele applikasjonen
 */

export const APP_CONFIG = {
  name: 'EconSim',
  version: '2.0.0',
  storagePrefix: 'econsim_',
  
  // Default innstillinger
  defaults: {
    className: '7A',
    currencyName: 'KlasseKrone',
    currencySymbol: 'KKr',
    startingBalance: 1000,
    enableBusinesses: false  // Mulighet for elever å starte bedrifter
  },
  
  // Polling intervall for refresh (i millisekunder)
  refreshInterval: 30000, // 30 sekunder
  
  // Validering
  validation: {
    accountNumberLength: 3,
    minUsername: 3,
    maxUsername: 20,
    minPassword: 6,
    minJobTitle: 3,
    maxJobTitle: 100,
    maxDecimals: 2
  }
};

/**
 * Demo brukerdata (hardkodet for lokal testing)
 * I produksjon vil dette komme fra database
 */
export const DEMO_USERS = [
  {
    id: 't1',
    username: 'laerer',
    password: 'passord', // Vil bli hashet ved initialisering
    name: 'Lærer Bank',
    accountNumber: '100',
    type: 'teacher',
    balance: 0 // Banken har "uendelig" penger
  },
  {
    id: 's1',
    username: 'kari123',
    password: 'passord123',
    name: 'Kari Nordmann',
    accountNumber: '101',
    type: 'student',
    balance: 1000
  },
  {
    id: 's2',
    username: 'ola456',
    password: 'passord456',
    name: 'Ola Hansen',
    accountNumber: '102',
    type: 'student',
    balance: 1000
  },
  {
    id: 's3',
    username: 'emma789',
    password: 'passord789',
    name: 'Emma Larsen',
    accountNumber: '103',
    type: 'student',
    balance: 1000
  }
];

/**
 * LocalStorage nøkler
 */
export const STORAGE_KEYS = {
  users: `${APP_CONFIG.storagePrefix}users`,
  transactions: `${APP_CONFIG.storagePrefix}transactions`,
  jobs: `${APP_CONFIG.storagePrefix}jobs`,
  applications: `${APP_CONFIG.storagePrefix}applications`,
  settings: `${APP_CONFIG.storagePrefix}settings`,
  session: `${APP_CONFIG.storagePrefix}session`
};

/**
 * Job statuser
 */
export const JOB_STATUS = {
  OPEN: 'active',       // Ledig jobb (status=active, assignedTo=null)
  ASSIGNED: 'active',   // Tildelt jobb (status=active, assignedTo=studentId)  
  ACTIVE: 'active',     // Alias for both open and assigned
  COMPLETED: 'completed'
};

/**
 * Job typer
 */
export const JOB_TYPES = {
  FIXED: 'fixed',      // Fast jobb som kan betales flere ganger
  PROJECT: 'project'   // Engangsprosjekt
};

/**
 * Søknad statuser
 */
export const APPLICATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
};

/**
 * Brukertyper
 */
export const USER_TYPES = {
  TEACHER: 'teacher',
  STUDENT: 'student'
};

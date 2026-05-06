/**
 * EconSim Configuration
 * Sentral konfigurasjonsfil for hele applikasjonen
 */

export const APP_CONFIG = {
  name: 'EconSim',
  version: '4.0.0',
  storagePrefix: 'econsim_',
  
  // Default innstillinger for nye klasserom
  defaults: {
    className: 'Mitt klasserom',
    currencyName: 'KlasseKrone',
    currencySymbol: 'KKr',
    startingBalance: 1000,
    
    // Bedriftsfunksjoner
    enableBusinesses: false,
    businessStartupCost: 500,        // Egenkapital for å starte bedrift
    businessEmployeeCostFactor: 500, // Beholdning / dette = maks ansatte
    requireJobApproval: true,        // Lærer må godkjenne bedriftsjobber
    
    // Skattesystem
    enableTax: false,
    taxType: 'flat',                 // 'flat' eller 'progressive'
    flatTaxRate: 20,                 // Flat skattesats i %
    progressiveTaxBrackets: [
      { min: 0, max: 500, rate: 0 },
      { min: 501, max: 1500, rate: 25 },
      { min: 1501, max: Infinity, rate: 35 }
    ],
    taxDeduction: 500,               // Fradragsgrense (skattefritt beløp)
    dividendTaxRate: 22,             // Utbytteskatt i %
    
    // Lånesystem
    enableLoans: false,
    loanInterestRate: 5,             // Årlig rente i %
    
    // Spare- og fondssystem
    savingsInterestRate: 2,          // Årlig sparerente i %
    fundReturnRate: 8,               // Årlig fondsavkastning i %
    fundVariation: 3,                // +/- variasjon på fondsavkastning

    // Simuleringsmodell
    simulation: {
      timeModel: 'accelerated'       // 'accelerated' (1 uke = 1 måned) eller 'realistic' (1 uke = 1 uke)
    }
  },
  
  // Kontonummer-struktur per klasserom
  accountRanges: {
    centralBank: '000',      // Sentralbank (utømmelig)
    taxAccount: '001',       // Skattekasse
    students: {              // Elevkontoer
      min: 101,
      max: 199               // Maks 99 elever
    },
    savings: {               // Sparekontoer (følger elev: 103 → 203)
      min: 201,
      max: 299
    },
    funds: {                 // Fondskontoer (følger elev: 103 → 303)
      min: 301,
      max: 399
    },
    businesses: {            // Bedriftskontoer
      min: 501,
      max: 999               // Maks 499 bedrifter
    }
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
    maxDecimals: 2,
    minBusinessName: 2,
    maxBusinessName: 50,
    maxStudentsPerClassroom: 99,
    maxBusinessesPerClassroom: 499
  }
};

/**
 * Kontonummer-prefiks for spesielle kontoer
 */
export const ACCOUNT_PREFIXES = {
  centralBank: '000',    // Sentralbank (utømmelig)
  taxAccount: '001'      // Skattekasse
};

/**
 * Superadmin bruker
 * MERK: Passord er lagret som SHA-256 hash for sikkerhet
 */
export const SUPERADMIN = {
  id: 'superadmin',
  username: 'DanielAlexander',
  passwordHash: '2ab5e704c3ca5eaa7376aeb8faf9493a7baac6fab35b0264d9ff79f8c4804cdb',
  name: 'Superadmin',
  type: 'superadmin'
};

/**
 * Brukertyper
 */
export const USER_TYPES = {
  SUPERADMIN: 'superadmin',
  TEACHER: 'teacher',
  STUDENT: 'student'
};

/**
 * Demo brukerdata (for initial testing - brukes hvis JSON-fil ikke finnes)
 */
export const DEMO_USERS = [
  {
    id: 't1',
    username: 'laerer',
    password: 'passord',
    name: 'Demo Lærer',
    accountNumber: '100',
    type: 'teacher',
    balance: 0,
    classroomId: 'demo-classroom'
  },
  {
    id: 's1',
    username: 'kari123',
    password: 'passord123',
    name: 'Kari Nordmann',
    accountNumber: '101',
    type: 'student',
    balance: 1000,
    classroomId: 'demo-classroom'
  }
];

/**
 * Demo klasserom
 */
export const DEMO_CLASSROOM = {
  id: 'demo-classroom',
  teacherId: 't1',
  className: '7A Demo',
  currencyName: 'KlasseKrone',
  currencySymbol: 'KKr',
  startingBalance: 1000,
  createdAt: new Date().toISOString(),
  settings: { ...APP_CONFIG.defaults, className: '7A Demo' }
};

/**
 * LocalStorage nøkler
 */
export const STORAGE_KEYS = {
  users: `${APP_CONFIG.storagePrefix}users`,
  transactions: `${APP_CONFIG.storagePrefix}transactions`,
  jobs: `${APP_CONFIG.storagePrefix}jobs`,
  applications: `${APP_CONFIG.storagePrefix}applications`,
  settings: `${APP_CONFIG.storagePrefix}settings`,
  session: `${APP_CONFIG.storagePrefix}session`,
  // Multi-tenancy (klasserom)
  CLASSROOMS: `${APP_CONFIG.storagePrefix}classrooms`,
  CENTRAL_BANK: `${APP_CONFIG.storagePrefix}centralBank`,
  // Tjenester
  BUSINESSES: `${APP_CONFIG.storagePrefix}businesses`,
  OWNERSHIP_OFFERS: `${APP_CONFIG.storagePrefix}ownershipOffers`, // Salgstilbud for bedriftseierandeler
  SAVINGS_ACCOUNTS: `${APP_CONFIG.storagePrefix}savings`,
  FUND_ACCOUNTS: `${APP_CONFIG.storagePrefix}funds`,
  LOANS: `${APP_CONFIG.storagePrefix}loans`,
  TAX_ACCOUNT: `${APP_CONFIG.storagePrefix}taxAccount`,
  NOTIFICATIONS: `${APP_CONFIG.storagePrefix}notifications`,
  activityLog: `${APP_CONFIG.storagePrefix}activityLog`,
  taxReports: `${APP_CONFIG.storagePrefix}taxReports`,
  // Statistikk
  STATISTICS: `${APP_CONFIG.storagePrefix}statistics`
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
 * Bedrift statuser
 */
export const BUSINESS_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  CLOSED: 'closed'
};

/**
 * Lån statuser
 */
export const LOAN_STATUS = {
  ACTIVE: 'active',
  PAID_OFF: 'paid_off',
  DEFAULTED: 'defaulted',
  OVERDUE: 'overdue'
};

/**
 * Bedrift status utvidet
 */
export const BUSINESS_STATUS_EXTENDED = {
  PENDING: 'pending',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  CLOSED: 'closed'
};

/**
 * Notifikasjons-typer
 */
export const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  TAX_REPORT: 'tax_report',
  LOAN_REMINDER: 'loan_reminder',
  SALARY: 'salary',
  INTEREST: 'interest'
};

/**
 * Aktivitetslogg-typer
 */
export const ACTIVITY_TYPES = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  TRANSACTION: 'transaction',
  JOB_CREATED: 'job_created',
  JOB_ASSIGNED: 'job_assigned',
  JOB_COMPLETED: 'job_completed',
  SALARY_PAID: 'salary_paid',
  BUSINESS_CREATED: 'business_created',
  BUSINESS_CLOSED: 'business_closed',
  LOAN_CREATED: 'loan_created',
  LOAN_PAYMENT: 'loan_payment',
  TAX_PAID: 'tax_paid',
  SETTINGS_CHANGED: 'settings_changed',
  USER_CREATED: 'user_created',
  USER_DELETED: 'user_deleted'
};

/**
 * Konto-typer
 */
export const ACCOUNT_TYPES = {
  PRIVATE: 'private',
  SAVINGS: 'savings',
  FUND: 'fund',
  BUSINESS: 'business',
  TAX: 'tax'
};

/**
 * Standard innstillinger for tjenestene
 * Brukes når settings ikke er konfigurert
 */
export const DEFAULT_SETTINGS = {
  tax: {
    enabled: false,
    type: 'progressive', // 'flat' eller 'progressive'
    flatRate: 20,
    brackets: [
      { min: 0, max: 500, rate: 0 },
      { min: 501, max: 1500, rate: 25 },
      { min: 1501, max: null, rate: 35 }
    ],
    deductionLimit: 500 // Fradragsgrense
  },
  loans: {
    enabled: false,
    defaultInterestRate: 5, // Årlig rente %
    maxLoanAmount: 5000,
    maxTermWeeks: 12
  },
  businesses: {
    enabled: false,
    startupCost: 500,
    requireApproval: true,
    employeeCostFactor: 500 // balance / dette = maks ansatte
  },
  savings: {
    enabled: true,
    annualRate: 2 // Årlig sparerente %
  },
  funds: {
    enabled: true,
    expectedReturn: 8, // Forventet årlig avkastning %
    variance: 3 // +/- variasjon
  },
  simulation: {
    timeModel: 'accelerated' // 'accelerated' (1 uke = 1 måned) eller 'realistic' (1 uke = 1 uke)
  }
};
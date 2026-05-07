/**
 * EconSim — kjerne-typer som JSDoc @typedef.
 *
 * Disse typene brukes av tsc i checkJs-modus og av IDE-en for autocomplete.
 * Når en service returnerer eller tar en av disse, annoter med
 * @param {import('../../shared/types').User} user (eller hvilket som helst typen).
 *
 * Holdes til kun de mest brukte feltene — ikke en uttømmende katalog.
 * Domene-spesifikke detaljer (f.eks. taxBrackets) hører hjemme i sine
 * respektive features.
 */

/**
 * @typedef {'superadmin' | 'teacher' | 'student'} UserType
 */

/**
 * @typedef {'open' | 'active' | 'completed' | 'cancelled'} JobStatus
 */

/**
 * @typedef {'classic' | 'business'} JobType
 */

/**
 * @typedef {'pending' | 'accepted' | 'rejected' | 'cancelled'} ApplicationStatus
 */

/**
 * @typedef {'active' | 'paid' | 'defaulted'} LoanStatus
 */

/**
 * @typedef {'active' | 'closed' | 'pendingClosure'} BusinessStatus
 */

/**
 * @typedef {'flat' | 'progressive'} TaxType
 */

/**
 * @typedef {Object} TaxBracket
 * @property {number} min
 * @property {number} max          // bruk Infinity for siste trinn
 * @property {number} rate          // prosent (0..100)
 */

/**
 * @typedef {Object} ClassroomSettings
 * @property {string} className
 * @property {string} currencyName
 * @property {string} currencySymbol
 * @property {number} startingBalance
 * @property {boolean} enableBusinesses
 * @property {number} businessStartupCost
 * @property {number} businessEmployeeCostFactor
 * @property {boolean} requireJobApproval
 * @property {boolean} enableTax
 * @property {TaxType} taxType
 * @property {number} flatTaxRate
 * @property {TaxBracket[]} progressiveTaxBrackets
 * @property {number} taxDeduction
 * @property {number} dividendTaxRate
 * @property {boolean} enableLoans
 * @property {number} loanInterestRate
 * @property {number} savingsInterestRate
 * @property {number} fundReturnRate
 * @property {number} fundVariation
 */

/**
 * @typedef {Object} Classroom
 * @property {string} id
 * @property {string} teacherId
 * @property {string} className
 * @property {ClassroomSettings} settings
 * @property {string} createdAt
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} username
 * @property {string} name
 * @property {string} accountNumber  // 3-sifret kontonummer
 * @property {UserType} type
 * @property {number} balance
 * @property {string} classroomId
 * @property {string} [passwordHash]
 * @property {string} [email]
 * @property {string} createdAt
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} SavingsAccount
 * @property {string} id              // 3-sifret kontonummer (201-299)
 * @property {string} ownerId         // userId
 * @property {string} classroomId
 * @property {number} balance
 * @property {string} createdAt
 */

/**
 * @typedef {Object} FundAccount
 * @property {string} id              // 3-sifret kontonummer (301-399)
 * @property {string} ownerId         // userId
 * @property {string} classroomId
 * @property {number} balance
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} classroomId
 * @property {string} from            // accountNumber
 * @property {string} to              // accountNumber
 * @property {number} amount
 * @property {string} description
 * @property {string} type            // 'transfer', 'salary', 'tax', 'interest', etc.
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} classroomId
 * @property {string} title
 * @property {string} description
 * @property {number} salary
 * @property {JobType} jobType
 * @property {JobStatus} status
 * @property {string|null} assignedTo  // userId
 * @property {string} [businessId]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} JobApplication
 * @property {string} id
 * @property {string} classroomId
 * @property {string} jobId
 * @property {string} applicantId     // userId
 * @property {ApplicationStatus} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Loan
 * @property {string} id
 * @property {string} classroomId
 * @property {string} borrowerId      // userId
 * @property {number} principal
 * @property {number} remainingBalance
 * @property {number} interestRate    // årlig %
 * @property {LoanStatus} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} BusinessOwner
 * @property {string} userId
 * @property {number} percentage      // 0..100
 * @property {number} costBasis
 */

/**
 * @typedef {Object} BusinessEmployee
 * @property {string} userId
 * @property {number} salary
 * @property {string} title
 * @property {string} startDate
 */

/**
 * @typedef {Object} Business
 * @property {string} id
 * @property {string} classroomId
 * @property {string} accountNumber   // 501-999
 * @property {string} name
 * @property {BusinessOwner[]} owners
 * @property {BusinessEmployee[]} employees
 * @property {number} balance
 * @property {BusinessStatus} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {string} classroomId
 * @property {string} userId
 * @property {string} type            // 'tax', 'salary', 'loan', 'system', etc.
 * @property {string} title
 * @property {string} message
 * @property {boolean} read
 * @property {string} createdAt
 */

// JSDoc-fil eksporterer ingen runtime-verdier — types er fil-skjema.
export {};

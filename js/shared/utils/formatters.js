/**
 * Formatters
 * Formatteringsfunksjoner for å vise data pent
 */

import languageService from '../../features/i18n/index.js';

/**
 * Formater valuta
 * @param {number} amount - Beløp
 * @param {string} symbol - Valutasymbol
 * @returns {string} - Formatert valutastreng
 */
export function formatCurrency(amount, symbol = 'SKR') {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount) || 0;
  }
  
  // Formater med tusenskille og 2 desimaler
  const formatted = amount.toLocaleString('no-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return `${formatted} ${symbol}`;
}

/**
 * Formater dato til norsk format
 * @param {string|Date} date - Dato å formatere
 * @param {boolean} includeTime - Inkluder tid
 * @returns {string} - Formatert dato
 */
export function formatDate(date, includeTime = false) {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '';
  
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return d.toLocaleString('no-NO', options);
}

/**
 * Formater dato til relativ tid (f.eks. "for 2 timer siden")
 * @param {string|Date} date - Dato å formatere
 * @returns {string} - Relativ tidsstreng
 */
export function formatRelativeTime(date) {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return languageService.t('time.justNow');
  if (diffMin < 60) return languageService.t(diffMin === 1 ? 'time.minuteAgo' : 'time.minutesAgo', { n: diffMin });
  if (diffHour < 24) return languageService.t(diffHour === 1 ? 'time.hourAgo' : 'time.hoursAgo', { n: diffHour });
  if (diffDay < 7) return languageService.t(diffDay === 1 ? 'time.dayAgo' : 'time.daysAgo', { n: diffDay });
  
  return formatDate(d);
}

/**
 * Formater kontonummer med spacing
 * @param {string} accountNumber - Kontonummer
 * @returns {string} - Formatert kontonummer
 */
export function formatAccountNumber(accountNumber) {
  if (!accountNumber) return '';
  return accountNumber.toString().padStart(3, '0');
}

/**
 * Formater transaksjonsmelding
 * @param {Object} transaction - Transaksjon objekt
 * @param {string} currentUserId - Nåværende bruker ID
 * @returns {string} - Formatert melding
 */
export function formatTransactionMessage(transaction, currentUserId) {
  const isSender = transaction.senderId === currentUserId;
  const isRecipient = transaction.recipientId === currentUserId;
  
  let prefix = '';
  if (isSender) {
    prefix = languageService.t('transaction.sentTo', { name: transaction.recipientName });
  } else if (isRecipient) {
    prefix = languageService.t('transaction.receivedFrom', { name: transaction.senderName });
  }
  
  const message = transaction.message ? `: ${transaction.message}` : '';
  return prefix + message;
}

/**
 * Formater jobbstatus til oversatt tekst
 * @param {string} status - Status
 * @returns {string} - Oversatt status
 */
export function formatJobStatus(status) {
  const statusMap = {
    'open': languageService.t('jobStatus.open'),
    'assigned': languageService.t('jobStatus.assigned'),
    'completed': languageService.t('jobStatus.completed')
  };
  return statusMap[status] || status;
}

/**
 * Formater jobbtype til oversatt tekst
 * @param {string} type - Type
 * @returns {string} - Oversatt type
 */
export function formatJobType(type) {
  const typeMap = {
    'fixed': languageService.t('jobType.fixed'),
    'project': languageService.t('jobType.project')
  };
  return typeMap[type] || type;
}

/**
 * Formater søknadsstatus til oversatt tekst
 * @param {string} status - Status
 * @returns {string} - Oversatt status
 */
export function formatApplicationStatus(status) {
  const statusMap = {
    'pending': languageService.t('applicationStatus.pending'),
    'accepted': languageService.t('applicationStatus.accepted'),
    'rejected': languageService.t('applicationStatus.rejected')
  };
  return statusMap[status] || status;
}

/**
 * Formater tall med tusenskille
 * @param {number} num - Tall å formatere
 * @returns {string} - Formatert tall
 */
export function formatNumber(num) {
  if (typeof num !== 'number') {
    num = parseFloat(num) || 0;
  }
  return num.toLocaleString('no-NO');
}

/**
 * Formater fil størrelse
 * @param {number} bytes - Antall bytes
 * @returns {string} - Formatert størrelse
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Formater prosent
 * @param {number} value - Verdi (0-1 eller 0-100)
 * @param {boolean} isDecimal - Er verdien 0-1 (true) eller 0-100 (false)
 * @returns {string} - Formatert prosent
 */
export function formatPercent(value, isDecimal = true) {
  const percent = isDecimal ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

/**
 * Formater initialer fra navn
 * @param {string} name - Fullt navn
 * @returns {string} - Initialer (f.eks. "KN" for "Kari Nordmann")
 */
export function formatInitials(name) {
  if (!name) return '';
  
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Oversett transaksjonsbeskrivelse basert på kjente mønstre
 * Støtter både norsk->engelsk og engelsk->norsk
 * @param {string} description - Opprinnelig beskrivelse
 * @returns {string} - Oversatt beskrivelse
 */
export function translateTransactionDescription(description) {
  if (!description) return '';
  
  // Mapping av norske beskrivelser til oversettelsesnøkler
  const descriptionMappings = [
    // Sparekonto/fondskonto
    { pattern: /^Overført til sparekonto$/i, key: 'transaction.transferredToSavings' },
    { pattern: /^Overført fra sparekonto$/i, key: 'transaction.transferredFromSavings' },
    { pattern: /^Overført til fondskonto$/i, key: 'transaction.transferredToFund' },
    { pattern: /^Overført fra fondskonto$/i, key: 'transaction.transferredFromFund' },
    
    // Lån
    { pattern: /^Lån mottatt \((.+)\)$/i, key: 'transaction.loanReceived', suffix: true },
    { pattern: /^Låneavdrag \((.+)\)$/i, key: 'transaction.loanPayment', suffix: true },
    { pattern: /^Ekstra innbetaling på lån \((.+)\)$/i, key: 'transaction.extraLoanPayment', suffix: true },
    { pattern: /^Delvis låneavdrag \((.+)\) - Manglet (.+)$/i, key: 'transaction.partialLoanPayment', partialLoan: true },
    
    // Lønn
    { pattern: /^Lønn fra (.+)$/i, key: 'transaction.salaryFrom', dynamic: true },
    { pattern: /^Lønn til (.+)$/i, key: 'transaction.salaryTo', dynamic: true },
    { pattern: /^Siste lønn fra (.+) \(stengt\)$/i, key: 'transaction.finalSalaryFromClosed', dynamicClosed: true },
    { pattern: /^Siste lønn fra (.+)$/i, key: 'transaction.finalSalaryFrom', dynamic: true },
    
    // Egenkapital og bedrift
    { pattern: /^Egenkapital fra grunnlegger$/i, key: 'transaction.equityFromFounder' },
    { pattern: /^Egenkapital: (.+)$/i, key: 'transaction.equity', dynamic: true, separator: ': ' },
    { pattern: /^Kapitalinnskudd$/i, key: 'transaction.capitalDeposit' },
    { pattern: /^Overføring til (.+)$/i, key: 'transaction.transferTo', dynamic: true },
    
    // Uttak
    { pattern: /^Uttak$/i, key: 'transaction.withdrawal' },
    { pattern: /^Uttak fra (.+)( \(etter .+ i Utbytteskatt\))?$/i, key: 'transaction.withdrawalFrom', dynamic: true },
    
    // Skatt og utbytte
    { pattern: /^Skattetrekk: (.+)$/i, key: 'transaction.taxDeduction', dynamic: true, separator: ': ' },
    { pattern: /^Utbytteskatt fra (.+) \((.+)\)$/i, key: 'transaction.dividendTaxFrom', dividendTax: true },
    { pattern: /^Utbytte fra nedleggelse av (.+)$/i, key: 'transaction.dividendFromClosure', dynamic: true },
    
    // Aksjer
    { pattern: /^Kjøp av (.+)% andel i (.+)$/i, key: 'transaction.purchaseOfShareIn', shareTransaction: true },
    { pattern: /^Salg av (.+)% eierandel$/i, key: 'transaction.saleOfShareOwnership', dynamic: true },
    { pattern: /^Salg av (.+)% andel i (.+)$/i, key: 'transaction.saleOfShareIn', shareTransaction: true },
    
    // Refusjon
    { pattern: /^Refundert - bedrift avvist - (.+)$/i, key: 'transaction.refundedBusinessRejected', dynamic: true, separator: ' - ' },
    
    // Engelske versjoner
    { pattern: /^Transferred to savings account$/i, key: 'transaction.transferredToSavings' },
    { pattern: /^Transferred from savings account$/i, key: 'transaction.transferredFromSavings' },
    { pattern: /^Transferred to fund account$/i, key: 'transaction.transferredToFund' },
    { pattern: /^Transferred from fund account$/i, key: 'transaction.transferredFromFund' },
    { pattern: /^Loan received \((.+)\)$/i, key: 'transaction.loanReceived', suffix: true },
    { pattern: /^Loan payment \((.+)\)$/i, key: 'transaction.loanPayment', suffix: true },
    { pattern: /^Extra loan payment \((.+)\)$/i, key: 'transaction.extraLoanPayment', suffix: true },
    { pattern: /^Partial loan payment \((.+)\) - Lacked (.+)$/i, key: 'transaction.partialLoanPayment', partialLoan: true },
    { pattern: /^Salary from (.+)$/i, key: 'transaction.salaryFrom', dynamic: true },
    { pattern: /^Salary to (.+)$/i, key: 'transaction.salaryTo', dynamic: true },
    { pattern: /^Final salary from (.+) \(closed\)$/i, key: 'transaction.finalSalaryFromClosed', dynamicClosed: true },
    { pattern: /^Final salary from (.+)$/i, key: 'transaction.finalSalaryFrom', dynamic: true },
    { pattern: /^Equity from founder$/i, key: 'transaction.equityFromFounder' },
    { pattern: /^Equity: (.+)$/i, key: 'transaction.equity', dynamic: true, separator: ': ' },
    { pattern: /^Capital deposit$/i, key: 'transaction.capitalDeposit' },
    { pattern: /^Transfer to (.+)$/i, key: 'transaction.transferTo', dynamic: true },
    { pattern: /^Withdrawal$/i, key: 'transaction.withdrawal' },
    { pattern: /^Withdrawal from (.+)$/i, key: 'transaction.withdrawalFrom', dynamic: true },
    { pattern: /^Tax deduction: (.+)$/i, key: 'transaction.taxDeduction', dynamic: true, separator: ': ' },
    { pattern: /^Dividend tax from (.+) \((.+)\)$/i, key: 'transaction.dividendTaxFrom', dividendTax: true },
    { pattern: /^Dividend from closure of (.+)$/i, key: 'transaction.dividendFromClosure', dynamic: true },
    { pattern: /^Purchase of (.+)% share in (.+)$/i, key: 'transaction.purchaseOfShareIn', shareTransaction: true },
    { pattern: /^Sale of (.+)% ownership$/i, key: 'transaction.saleOfShareOwnership', dynamic: true },
    { pattern: /^Sale of (.+)% share in (.+)$/i, key: 'transaction.saleOfShareIn', shareTransaction: true },
    { pattern: /^Refunded - business rejected - (.+)$/i, key: 'transaction.refundedBusinessRejected', dynamic: true, separator: ' - ' },
  ];
  
  for (const mapping of descriptionMappings) {
    const match = description.match(mapping.pattern);
    if (match) {
      if (mapping.suffix && match[1]) {
        return `${languageService.t(mapping.key)} (${match[1]})`;
      }
      if (mapping.partialLoan && match[1] && match[2]) {
        return `${languageService.t(mapping.key)} (${match[1]}) - ${languageService.t('transaction.lacked')} ${match[2]}`;
      }
      if (mapping.dividendTax && match[1] && match[2]) {
        return `${languageService.t(mapping.key)} ${match[1]} (${match[2]})`;
      }
      if (mapping.shareTransaction && match[1] && match[2]) {
        return `${languageService.t(mapping.key)} ${match[1]}% ${languageService.t('transaction.shareIn')} ${match[2]}`;
      }
      if (mapping.dynamicClosed && match[1]) {
        return `${languageService.t(mapping.key)} ${match[1]} (${languageService.t('transaction.closed')})`;
      }
      if (mapping.dynamic && match[1]) {
        const separator = mapping.separator || ' ';
        return `${languageService.t(mapping.key)}${separator}${match[1]}`;
      }
      return languageService.t(mapping.key);
    }
  }
  
  // Ingen match - returner original beskrivelse
  return description;
}

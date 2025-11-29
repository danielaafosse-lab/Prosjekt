/**
 * Formatters
 * Formatteringsfunksjoner for å vise data pent
 */

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
  
  if (diffSec < 60) return 'nettopp';
  if (diffMin < 60) return `for ${diffMin} ${diffMin === 1 ? 'minutt' : 'minutter'} siden`;
  if (diffHour < 24) return `for ${diffHour} ${diffHour === 1 ? 'time' : 'timer'} siden`;
  if (diffDay < 7) return `for ${diffDay} ${diffDay === 1 ? 'dag' : 'dager'} siden`;
  
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
    prefix = `Sendt til ${transaction.recipientName}`;
  } else if (isRecipient) {
    prefix = `Mottatt fra ${transaction.senderName}`;
  }
  
  const message = transaction.message ? `: ${transaction.message}` : '';
  return prefix + message;
}

/**
 * Formater jobbstatus til norsk
 * @param {string} status - Status
 * @returns {string} - Norsk status
 */
export function formatJobStatus(status) {
  const statusMap = {
    'open': 'Åpen',
    'assigned': 'Tildelt',
    'completed': 'Fullført'
  };
  return statusMap[status] || status;
}

/**
 * Formater jobbtype til norsk
 * @param {string} type - Type
 * @returns {string} - Norsk type
 */
export function formatJobType(type) {
  const typeMap = {
    'fixed': 'Fast jobb',
    'project': 'Prosjekt'
  };
  return typeMap[type] || type;
}

/**
 * Formater søknadsstatus til norsk
 * @param {string} status - Status
 * @returns {string} - Norsk status
 */
export function formatApplicationStatus(status) {
  const statusMap = {
    'pending': 'Venter',
    'accepted': 'Godkjent',
    'rejected': 'Avvist'
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

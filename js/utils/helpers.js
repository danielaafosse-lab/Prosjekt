/**
 * Helper funksjoner
 * Generelle utility-funksjoner brukt på tvers av applikasjonen
 */

/**
 * Hash passord med SHA-256
 * @param {string} password - Passord å hashe
 * @returns {Promise<string>} - Hashet passord
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generer unik ID
 * @param {string} prefix - Prefix for ID
 * @returns {string} - Unik ID
 */
export function generateId(prefix = '') {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Debounce funksjon - forsinker utførelse
 * @param {Function} func - Funksjon å debounce
 * @param {number} wait - Ventetid i ms
 * @returns {Function} - Debounced funksjon
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle funksjon - begrenser utførelsesrate
 * @param {Function} func - Funksjon å throttle
 * @param {number} limit - Minimum tid mellom kall i ms
 * @returns {Function} - Throttled funksjon
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone et objekt
 * @param {*} obj - Objekt å klone
 * @returns {*} - Klonet objekt
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const clonedObj = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

/**
 * Sorter array av objekter etter felt
 * @param {Array} array - Array å sortere
 * @param {string} field - Felt å sortere etter
 * @param {boolean} ascending - Stigende eller synkende
 * @returns {Array} - Sortert array
 */
export function sortBy(array, field, ascending = true) {
  return [...array].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal < bVal) return ascending ? -1 : 1;
    if (aVal > bVal) return ascending ? 1 : -1;
    return 0;
  });
}

/**
 * Filtrer array basert på søkestreng
 * @param {Array} array - Array å filtrere
 * @param {string} searchTerm - Søkestreng
 * @param {Array<string>} fields - Felt å søke i
 * @returns {Array} - Filtrert array
 */
export function filterBySearch(array, searchTerm, fields) {
  if (!searchTerm) return array;
  
  const term = searchTerm.toLowerCase();
  return array.filter(item => 
    fields.some(field => {
      const value = item[field];
      return value && value.toString().toLowerCase().includes(term);
    })
  );
}

/**
 * Sjekk om to objekter er like (shallow comparison)
 * @param {Object} obj1 - Første objekt
 * @param {Object} obj2 - Andre objekt
 * @returns {boolean} - True hvis like
 */
export function shallowEqual(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  return keys1.every(key => obj1[key] === obj2[key]);
}

/**
 * Sleep/delay funksjon
 * @param {number} ms - Millisekunder å vente
 * @returns {Promise} - Promise som resolves etter delay
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncate string til max lengde
 * @param {string} str - String å truncate
 * @param {number} maxLength - Max lengde
 * @param {string} suffix - Suffix å legge til (default '...')
 * @returns {string} - Truncated string
 */
export function truncate(str, maxLength, suffix = '...') {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitaliser første bokstav
 * @param {string} str - String å capitalise
 * @returns {string} - Capitalised string
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Escape HTML for å forhindre XSS
 * @param {string} str - String å escape
 * @returns {string} - Escaped string
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Parse query string til objekt
 * @param {string} queryString - Query string (uten ?)
 * @returns {Object} - Parsed objekt
 */
export function parseQueryString(queryString) {
  const params = {};
  const pairs = queryString.split('&');
  
  pairs.forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  });
  
  return params;
}

/**
 * Check if value is a valid number
 * @param {*} value - Value å sjekke
 * @returns {boolean} - True hvis valid number
 */
export function isValidNumber(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Round to specific decimal places
 * @param {number} value - Verdi å runde
 * @param {number} decimals - Antall desimaler
 * @returns {number} - Rundet verdi
 */
export function roundTo(value, decimals = 2) {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Validators
 * Valideringsfunksjoner for brukerinput
 */

import { APP_CONFIG } from '../config.js';

/**
 * Valider brukernavn
 * @param {string} username - Brukernavn å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateUsername(username) {
  if (!username || username.trim() === '') {
    return { valid: false, error: 'Brukernavn er påkrevd' };
  }
  
  if (username.length < APP_CONFIG.validation.minUsername) {
    return { 
      valid: false, 
      error: `Brukernavn må være minst ${APP_CONFIG.validation.minUsername} tegn` 
    };
  }
  
  if (username.length > APP_CONFIG.validation.maxUsername) {
    return { 
      valid: false, 
      error: `Brukernavn kan ikke være mer enn ${APP_CONFIG.validation.maxUsername} tegn` 
    };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { 
      valid: false, 
      error: 'Brukernavn kan kun inneholde bokstaver, tall og underscore' 
    };
  }
  
  return { valid: true };
}

/**
 * Valider passord
 * @param {string} password - Passord å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validatePassword(password) {
  if (!password || password.trim() === '') {
    return { valid: false, error: 'Passord er påkrevd' };
  }
  
  if (password.length < APP_CONFIG.validation.minPassword) {
    return { 
      valid: false, 
      error: `Passord må være minst ${APP_CONFIG.validation.minPassword} tegn` 
    };
  }
  
  return { valid: true };
}

/**
 * Valider kontonummer
 * @param {string} accountNumber - Kontonummer å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.trim() === '') {
    return { valid: false, error: 'Kontonummer er påkrevd' };
  }
  
  if (accountNumber.length !== APP_CONFIG.validation.accountNumberLength) {
    return { 
      valid: false, 
      error: `Kontonummer må være ${APP_CONFIG.validation.accountNumberLength} siffer` 
    };
  }
  
  if (!/^\d+$/.test(accountNumber)) {
    return { valid: false, error: 'Kontonummer kan kun inneholde tall' };
  }
  
  return { valid: true };
}

/**
 * Valider beløp
 * @param {string|number} amount - Beløp å validere
 * @returns {Object} - { valid: boolean, error: string, value: number }
 */
export function validateAmount(amount) {
  const numAmount = parseFloat(amount);
  
  if (isNaN(numAmount)) {
    return { valid: false, error: 'Beløp må være et tall' };
  }
  
  if (numAmount <= 0) {
    return { valid: false, error: 'Beløp må være større enn 0' };
  }
  
  // Sjekk antall desimaler
  const decimals = (amount.toString().split('.')[1] || '').length;
  if (decimals > APP_CONFIG.validation.maxDecimals) {
    return { 
      valid: false, 
      error: `Beløp kan maksimalt ha ${APP_CONFIG.validation.maxDecimals} desimaler` 
    };
  }
  
  return { valid: true, value: numAmount };
}

/**
 * Valider navn
 * @param {string} name - Navn å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateName(name) {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Navn er påkrevd' };
  }
  
  if (name.length < 2) {
    return { valid: false, error: 'Navn må være minst 2 tegn' };
  }
  
  if (name.length > 100) {
    return { valid: false, error: 'Navn kan ikke være mer enn 100 tegn' };
  }
  
  return { valid: true };
}

/**
 * Valider jobbtittel
 * @param {string} title - Tittel å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateJobTitle(title) {
  if (!title || title.trim() === '') {
    return { valid: false, error: 'Jobbtittel er påkrevd' };
  }
  
  if (title.length < APP_CONFIG.validation.minJobTitle) {
    return { 
      valid: false, 
      error: `Jobbtittel må være minst ${APP_CONFIG.validation.minJobTitle} tegn` 
    };
  }
  
  if (title.length > APP_CONFIG.validation.maxJobTitle) {
    return { 
      valid: false, 
      error: `Jobbtittel kan ikke være mer enn ${APP_CONFIG.validation.maxJobTitle} tegn` 
    };
  }
  
  return { valid: true };
}

/**
 * Valider jobbeskrivelse
 * @param {string} description - Beskrivelse å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateJobDescription(description) {
  // Beskrivelse er valgfri, men hvis gitt må den være innenfor rimelige grenser
  if (description && description.length > 500) {
    return { valid: false, error: 'Beskrivelse kan ikke være mer enn 500 tegn' };
  }
  
  return { valid: true };
}

/**
 * Valider søknadstekst
 * @param {string} text - Søknadstekst å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateApplicationText(text) {
  if (!text || text.trim() === '') {
    return { valid: false, error: 'Søknadstekst er påkrevd' };
  }
  
  if (text.length < 10) {
    return { valid: false, error: 'Søknadstekst må være minst 10 tegn' };
  }
  
  if (text.length > 500) {
    return { valid: false, error: 'Søknadstekst kan ikke være mer enn 500 tegn' };
  }
  
  return { valid: true };
}

/**
 * Valider valutasymbol
 * @param {string} symbol - Symbol å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateCurrencySymbol(symbol) {
  if (!symbol || symbol.trim() === '') {
    return { valid: false, error: 'Valutasymbol er påkrevd' };
  }
  
  if (symbol.length < 1 || symbol.length > 5) {
    return { valid: false, error: 'Valutasymbol må være 1-5 tegn' };
  }
  
  return { valid: true };
}

/**
 * Valider valutanavn
 * @param {string} name - Navn å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateCurrencyName(name) {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Valutanavn er påkrevd' };
  }
  
  if (name.length < 2 || name.length > 50) {
    return { valid: false, error: 'Valutanavn må være 2-50 tegn' };
  }
  
  return { valid: true };
}

/**
 * Valider klassenavn
 * @param {string} name - Klassenavn å validere
 * @returns {Object} - { valid: boolean, error: string }
 */
export function validateClassName(name) {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Klassenavn er påkrevd' };
  }
  
  if (name.length < 1 || name.length > 20) {
    return { valid: false, error: 'Klassenavn må være 1-20 tegn' };
  }
  
  return { valid: true };
}

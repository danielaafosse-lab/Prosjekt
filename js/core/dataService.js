/**
 * DataService - Data Access Layer
 * 
 * Velger mellom Firebase og localStorage basert på konfigurasjon.
 * 
 * VIKTIG: For å bytte til Firebase, endre USE_FIREBASE til true nedenfor.
 * Firebase må være konfigurert i firebaseService.js og SDK må være lastet.
 */

// ============================================================
// KONFIGURASJON: Velg datalager
// ============================================================
const USE_FIREBASE = true;  // true = Firebase (cloud), false = localStorage (lokal)
// ============================================================

// Eksporter riktig dataservice basert på konfigurasjon
export * from './dataService.firebase.js';

console.log('� Datalager: Firebase (cloud) - Data synkroniseres på tvers av enheter');

/**
 * Firebase Service
 * Håndterer all kommunikasjon med Firebase Firestore
 * 
 * VIKTIG: Erstatter localStorage med cloud database
 * MERK: Ikke importer languageService her - det skaper sirkulære avhengigheter
 */

// Firebase konfigurasjon - Oppdatert med EconSim prosjekt
const firebaseConfig = {
  apiKey: "AIzaSyBx3FV9i8KvBMrHgpfJr6EF513YuDn-Zog",
  authDomain: "econsim-5723c.firebaseapp.com",
  projectId: "econsim-5723c",
  storageBucket: "econsim-5723c.firebasestorage.app",
  messagingSenderId: "501287582420",
  appId: "1:501287582420:web:0e411f12bfcbb064cb9941",
  measurementId: "G-KNGTH2HQQ8"
};

// Firebase app og Firestore referanser (initialiseres i initialize())
let app = null;
let db = null;
let initialized = false;

/**
 * Firebase Service Class
 * Tilbyr samme interface som localStorage-versjonen av dataService
 */
class FirebaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialiser Firebase
   * Må kalles før andre metoder brukes
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Sjekk at Firebase SDK er lastet
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK is not loaded. Make sure firebase-app-compat.js is included.');
      }

      // Sjekk at konfigurasjonen er oppdatert
      if (firebaseConfig.apiKey === "SKAL_ERSTATTES") {
        console.error('⚠️ Firebase er ikke konfigurert! Se FIREBASE_SETUP.md for instruksjoner.');
        throw new Error('Firebase configuration is missing. See FIREBASE_SETUP.md.');
      }

      // Initialiser Firebase app (hvis ikke allerede gjort)
      if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
      } else {
        app = firebase.apps[0];
      }

      // Hent Firestore referanse
      this.db = firebase.firestore();

      // Slå på offline-persistens (IndexedDB-basert cache).
      // Reduserer antall Firestore-lesninger dramatisk når en elev/lærer
      // åpner og lukker faner — caching skjer på enhets-nivå.
      // synchronizeTabs lar flere åpne faner dele samme cache uten
      // konflikt. Feiler stille hvis nettleseren ikke støtter det
      // (f.eks. inkognito-modus med IndexedDB blokkert).
      try {
        await this.db.enablePersistence({ synchronizeTabs: true });
        console.info('💾 Firestore offline-persistens aktivert.');
      } catch (persistenceError) {
        if (persistenceError.code === 'failed-precondition') {
          console.warn(
            '⚠️ Offline-persistens kunne ikke aktiveres: flere faner åpne uten synchronizeTabs-støtte.'
          );
        } else if (persistenceError.code === 'unimplemented') {
          console.warn(
            '⚠️ Offline-persistens støttes ikke i denne nettleseren (f.eks. inkognito).'
          );
        } else {
          console.warn('⚠️ Offline-persistens feilet:', persistenceError);
        }
      }

      this.initialized = true;
      console.log('🔥 Firebase initialisert!');
      return true;
    } catch (error) {
      console.error('❌ Feil ved Firebase-initialisering:', error);
      throw error;
    }
  }

  /**
   * Sjekk om Firebase er initialisert
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Hent Firestore database referanse
   */
  getDb() {
    if (!this.db) {
      throw new Error('Firebase is not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // ==================== GENERIC CRUD OPERATIONS ====================

  /**
   * Hent alle dokumenter fra en collection
   * @param {string} collectionName - Navn på collection
   * @returns {Promise<Array>} - Array med dokumenter
   */
  async getAll(collectionName) {
    const db = this.getDb();
    const snapshot = await db.collection(collectionName).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Hent alle dokumenter med filter
   * @param {string} collectionName - Navn på collection
   * @param {string} field - Felt å filtrere på
   * @param {string} operator - Sammenligning ('==', '>', etc.)
   * @param {any} value - Verdi å sammenligne med
   * @returns {Promise<Array>}
   */
  async getWhere(collectionName, field, operator, value) {
    const db = this.getDb();
    const snapshot = await db.collection(collectionName)
      .where(field, operator, value)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Hent alle dokumenter med flere filtre
   * @param {string} collectionName - Navn på collection
   * @param {Array} filters - Array med {field, operator, value} objekter
   * @returns {Promise<Array>}
   */
  async getWhereMultiple(collectionName, filters) {
    const db = this.getDb();
    let query = db.collection(collectionName);
    
    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Hent ett dokument by ID
   * @param {string} collectionName - Navn på collection
   * @param {string} docId - Dokument ID
   * @returns {Promise<Object|null>}
   */
  async getById(collectionName, docId) {
    const db = this.getDb();
    const doc = await db.collection(collectionName).doc(docId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  /**
   * Alias for getById - hent dokument by ID
   */
  async get(collectionName, docId) {
    return this.getById(collectionName, docId);
  }

  /**
   * Sett dokument med spesifikk ID (opprett eller overskriv)
   * @param {string} collectionName - Navn på collection
   * @param {string} docId - Dokument ID
   * @param {Object} data - Data som skal lagres
   * @returns {Promise<Object>} - Lagret dokument med ID
   */
  async set(collectionName, docId, data) {
    const db = this.getDb();
    const timestamp = new Date().toISOString();
    const dataWithTimestamp = {
      ...data,
      updatedAt: timestamp
    };

    // Sjekk om dokumentet eksisterer for å sette createdAt
    const docRef = db.collection(collectionName).doc(docId);
    const existing = await docRef.get();
    if (!existing.exists) {
      dataWithTimestamp.createdAt = timestamp;
    }

    await docRef.set(dataWithTimestamp, { merge: true });
    return { id: docId, ...dataWithTimestamp };
  }

  /**
   * Opprett nytt dokument
   * @param {string} collectionName - Navn på collection
   * @param {Object} data - Data som skal lagres
   * @param {string} customId - Valgfri: Bruk custom ID i stedet for auto-generert
   * @returns {Promise<Object>} - Opprettet dokument med ID
   */
  async create(collectionName, data, customId = null) {
    const db = this.getDb();
    const timestamp = new Date().toISOString();
    const dataWithTimestamp = {
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    let docRef;
    if (customId) {
      docRef = db.collection(collectionName).doc(customId);
      await docRef.set(dataWithTimestamp);
    } else {
      docRef = await db.collection(collectionName).add(dataWithTimestamp);
    }

    return { id: docRef.id, ...dataWithTimestamp };
  }

  /**
   * Oppdater dokument
   * @param {string} collectionName - Navn på collection
   * @param {string} docId - Dokument ID
   * @param {Object} updates - Felt som skal oppdateres
   * @returns {Promise<Object>}
   */
  async update(collectionName, docId, updates) {
    const db = this.getDb();
    const docRef = db.collection(collectionName).doc(docId);
    
    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await docRef.update(dataWithTimestamp);
    
    // Hent oppdatert dokument
    const updated = await docRef.get();
    return { id: updated.id, ...updated.data() };
  }

  /**
   * Slett dokument
   * @param {string} collectionName - Navn på collection
   * @param {string} docId - Dokument ID
   * @returns {Promise<boolean>}
   */
  async delete(collectionName, docId) {
    const db = this.getDb();
    await db.collection(collectionName).doc(docId).delete();
    return true;
  }

  /**
   * Slett alle dokumenter som matcher et filter
   * @param {string} collectionName - Navn på collection
   * @param {string} field - Felt å filtrere på
   * @param {string} operator - Sammenligning
   * @param {any} value - Verdi
   * @returns {Promise<number>} - Antall slettede dokumenter
   */
  async deleteWhere(collectionName, field, operator, value) {
    const db = this.getDb();
    const snapshot = await db.collection(collectionName)
      .where(field, operator, value)
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    return snapshot.docs.length;
  }

  // ==================== BATCH OPERATIONS ====================

  /**
   * Utfør flere operasjoner atomisk (transaksjoner)
   * @param {Function} operations - Funksjon som mottar transaction objekt
   * @returns {Promise<any>}
   */
  async runTransaction(operations) {
    const db = this.getDb();
    return db.runTransaction(operations);
  }

  /**
   * Batch write - oppdater flere dokumenter samtidig
   * @param {Array} operations - Array med {type: 'set'|'update'|'delete', collection, docId, data}
   * @returns {Promise<void>}
   */
  async batchWrite(operations) {
    const db = this.getDb();
    const batch = db.batch();

    for (const op of operations) {
      const docRef = db.collection(op.collection).doc(op.docId);
      
      switch (op.type) {
        case 'set':
          batch.set(docRef, { ...op.data, updatedAt: new Date().toISOString() });
          break;
        case 'update':
          batch.update(docRef, { ...op.data, updatedAt: new Date().toISOString() });
          break;
        case 'delete':
          batch.delete(docRef);
          break;
      }
    }

    await batch.commit();
  }

  // ==================== REAL-TIME LISTENERS ====================

  /**
   * Lytt til endringer i en collection
   * @param {string} collectionName - Navn på collection
   * @param {Function} callback - Funksjon som kalles ved endringer
   * @returns {Function} - Unsubscribe funksjon
   */
  onCollectionChange(collectionName, callback) {
    const db = this.getDb();
    return db.collection(collectionName).onSnapshot(snapshot => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(docs);
    });
  }

  /**
   * Lytt til endringer i ett dokument
   * @param {string} collectionName - Navn på collection
   * @param {string} docId - Dokument ID
   * @param {Function} callback - Funksjon som kalles ved endringer
   * @returns {Function} - Unsubscribe funksjon
   */
  onDocumentChange(collectionName, docId, callback) {
    const db = this.getDb();
    return db.collection(collectionName).doc(docId).onSnapshot(doc => {
      callback(doc.exists ? { id: doc.id, ...doc.data() } : null);
    });
  }

  /**
   * Lytt til endringer med filter
   * @param {string} collectionName - Navn på collection
   * @param {string} field - Felt å filtrere på
   * @param {string} operator - Sammenligning
   * @param {any} value - Verdi
   * @param {Function} callback - Funksjon som kalles ved endringer
   * @returns {Function} - Unsubscribe funksjon
   */
  onQueryChange(collectionName, field, operator, value, callback) {
    const db = this.getDb();
    return db.collection(collectionName)
      .where(field, operator, value)
      .onSnapshot(snapshot => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(docs);
      });
  }
}

// Eksporter singleton instance
export const firebaseService = new FirebaseService();

// Eksporter Firebase config for referanse
export { firebaseConfig };

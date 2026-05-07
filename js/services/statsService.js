/**
 * Statistics Service
 * Håndterer innloggingsstatistikk, geografisk data og brukeraktivitet
 */

import { firebaseService } from '../shared/core/firebaseService.js';

// Collection name for login statistics
const COLLECTIONS = {
  LOGIN_STATS: 'loginStats',
  GEO_STATS: 'geoStats'
};

class StatsService {
  constructor() {
    this._geoCache = null; // Cache for current user's geo data
  }

  /**
   * Hent brukerens IP-adresse og geografiske data
   * Bruker ipapi.co (HTTPS, gratis 1000 req/dag)
   */
  async getGeoData() {
    try {
      // Bruk cached data hvis tilgjengelig
      if (this._geoCache) {
        return this._geoCache;
      }

      // Prøv først ipapi.co (HTTPS-støttet)
      const response = await fetch('https://ipapi.co/json/');

      if (!response.ok) {
        throw new Error('Kunne ikke hente geografisk data');
      }

      const data = await response.json();

      if (data && data.country_name) {
        this._geoCache = {
          ip: data.ip,
          country: data.country_name,
          countryCode: data.country_code,
          region: data.region, // Fylke/region
          city: data.city
        };
        return this._geoCache;
      }

      return null;
    } catch (error) {
      console.warn('⚠️ Kunne ikke hente geografisk data:', error.message);
      return null;
    }
  }

  /**
   * Registrer en innlogging
   * @param {string} userId - Bruker ID
   * @param {string} userType - 'teacher', 'student', eller 'superadmin'
   * @param {string} classroomId - Klasserom ID (null for superadmin)
   */
  async recordLogin(userId, userType, classroomId = null) {
    try {
      const now = new Date();
      const dateKey = this._getDateKey(now);
      const weekKey = this._getWeekKey(now);
      const monthKey = this._getMonthKey(now);
      const yearKey = this._getYearKey(now);

      // Hent geografisk data
      const geoData = await this.getGeoData();

      // Opprett login-record
      const loginRecord = {
        id: `login-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        userType,
        classroomId,
        timestamp: now.toISOString(),
        dateKey,
        weekKey,
        monthKey,
        yearKey,
        geoData: geoData || null
      };

      // Lagre i Firebase
      await firebaseService.set(COLLECTIONS.LOGIN_STATS, loginRecord.id, loginRecord);

      // Oppdater geografisk statistikk hvis vi har data
      if (geoData) {
        await this._updateGeoStats(geoData);
      }

      console.log('📊 Login registrert:', userType, dateKey);
      return loginRecord;
    } catch (error) {
      console.error('❌ Feil ved registrering av login:', error);
      // Ikke kast error - statistikk skal ikke blokkere innlogging
      return null;
    }
  }

  /**
   * Oppdater geografisk statistikk
   */
  async _updateGeoStats(geoData) {
    try {
      const geoKey = `${geoData.countryCode}-${geoData.region || 'unknown'}`;
      const existing = await firebaseService.get(COLLECTIONS.GEO_STATS, geoKey);

      if (existing) {
        await firebaseService.update(COLLECTIONS.GEO_STATS, geoKey, {
          count: (existing.count || 0) + 1,
          lastLogin: new Date().toISOString()
        });
      } else {
        await firebaseService.set(COLLECTIONS.GEO_STATS, geoKey, {
          id: geoKey,
          country: geoData.country,
          countryCode: geoData.countryCode,
          region: geoData.region,
          count: 1,
          firstLogin: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn('⚠️ Kunne ikke oppdatere geo stats:', error);
    }
  }

  /**
   * Hent innloggingsstatistikk for en periode
   * @param {string} period - 'day', 'week', 'month' eller 'year'
   * @param {number|Object} options - Antall perioder eller options { count, selectedKey }
   */
  async getLoginStats(period = 'day', options = 7) {
    try {
      const allLogins = await firebaseService.getAll(COLLECTIONS.LOGIN_STATS);
      const stats = {};

      const defaultCountByPeriod = {
        day: 7,
        week: 8,
        month: 12,
        year: 5
      };

      const count = typeof options === 'number'
        ? options
        : (options?.count ?? defaultCountByPeriod[period] ?? 7);

      const selectedKey = typeof options === 'object' && options?.selectedKey
        ? this.normalizePeriodKey(period, options.selectedKey)
        : null;

      // Generer keys for de siste N periodene
      const keys = selectedKey
        ? [selectedKey]
        : this._generateRecentPeriodKeys(period, count);

      // Initialiser stats for alle keys
      keys.forEach(key => {
        stats[key] = { teachers: 0, students: 0, total: 0 };
      });

      // Tell opp innlogginger
      allLogins.forEach(login => {
        const key = this._resolveLoginPeriodKey(login, period);
        if (stats[key]) {
          if (login.userType === 'teacher') {
            stats[key].teachers++;
          } else if (login.userType === 'student') {
            stats[key].students++;
          }
          stats[key].total++;
        }
      });

      return { keys, stats };
    } catch (error) {
      console.error('❌ Feil ved henting av login stats:', error);
      return { keys: [], stats: {} };
    }
  }

  /**
   * Hent innlogginger per klasserom for valgt periode
   */
  async getClassroomLoginStats(period = 'week', selectedKey = null) {
    try {
      const allLogins = await firebaseService.getAll(COLLECTIONS.LOGIN_STATS);
      const targetKey = selectedKey
        ? this.normalizePeriodKey(period, selectedKey)
        : this._generateRecentPeriodKeys(period, 1)[0];
      const stats = {};

      // Filtrer til valgt periode og grupper per klasserom
      allLogins
        .filter(login => this._resolveLoginPeriodKey(login, period) === targetKey && login.classroomId)
        .forEach(login => {
          if (!stats[login.classroomId]) {
            stats[login.classroomId] = { teachers: 0, students: 0 };
          }
          if (login.userType === 'teacher') {
            stats[login.classroomId].teachers++;
          } else if (login.userType === 'student') {
            stats[login.classroomId].students++;
          }
        });

      return stats;
    } catch (error) {
      console.error('❌ Feil ved henting av classroom login stats:', error);
      return {};
    }
  }

  /**
   * Hent geografisk statistikk for valgt tidsperiode
   */
  async getGeoStats(period = 'day', selectedKey = null, count = 7) {
    try {
      const allLogins = await firebaseService.getAll(COLLECTIONS.LOGIN_STATS);
      const normalizedSelectedKey = selectedKey ? this.normalizePeriodKey(period, selectedKey) : null;
      const keys = normalizedSelectedKey
        ? [normalizedSelectedKey]
        : this._generateRecentPeriodKeys(period, count);
      const allowedKeys = new Set(keys);

      // Grupper etter land
      const byCountry = {};
      const byRegion = {};

      allLogins.forEach(login => {
        if (!login.geoData) return;

        const key = this._resolveLoginPeriodKey(login, period);
        if (!allowedKeys.has(key)) return;

        const { country, countryCode, region } = login.geoData;
        if (!countryCode) return;

        // Per land
        if (!byCountry[countryCode]) {
          byCountry[countryCode] = {
            country: country || countryCode,
            countryCode,
            count: 0
          };
        }
        byCountry[countryCode].count += 1;

        // Per region (kun vis regioner med data)
        if (region && region !== 'unknown') {
          const regionKey = `${countryCode}-${region}`;
          if (!byRegion[regionKey]) {
            byRegion[regionKey] = {
              country: country || countryCode,
              countryCode,
              region,
              count: 0
            };
          }
          byRegion[regionKey].count += 1;
        }
      });

      return {
        countries: Object.values(byCountry).sort((a, b) => b.count - a.count),
        regions: Object.values(byRegion).sort((a, b) => b.count - a.count)
      };
    } catch (error) {
      console.error('❌ Feil ved henting av geo stats:', error);
      return { countries: [], regions: [] };
    }
  }

  /**
   * Nullstill all statistikk
   */
  async resetAllStats() {
    try {
      const logins = await firebaseService.getAll(COLLECTIONS.LOGIN_STATS);
      const geoStats = await firebaseService.getAll(COLLECTIONS.GEO_STATS);

      // Slett alle login records
      for (const login of logins) {
        await firebaseService.delete(COLLECTIONS.LOGIN_STATS, login.id);
      }

      // Slett alle geo stats
      for (const stat of geoStats) {
        await firebaseService.delete(COLLECTIONS.GEO_STATS, stat.id);
      }

      console.log('🗑️ All statistikk nullstilt');
      return true;
    } catch (error) {
      console.error('❌ Feil ved nullstilling av statistikk:', error);
      return false;
    }
  }

  /**
   * Nullstill statistikk for ett klasserom
   */
  async resetClassroomStats(classroomId) {
    try {
      const logins = await firebaseService.getAll(COLLECTIONS.LOGIN_STATS);

      for (const login of logins) {
        if (login.classroomId === classroomId) {
          await firebaseService.delete(COLLECTIONS.LOGIN_STATS, login.id);
        }
      }

      console.log(`🗑️ Statistikk nullstilt for klasserom: ${classroomId}`);
      return true;
    } catch (error) {
      console.error('❌ Feil ved nullstilling av classroom-statistikk:', error);
      return false;
    }
  }

  /**
   * Generer date key (YYYY-MM-DD)
   */
  _getDateKey(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Generer month key (YYYY-MM)
   */
  _getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Generer year key (YYYY)
   */
  _getYearKey(date) {
    return String(date.getFullYear());
  }

  /**
   * Generer week key (YYYY-WXX)
   */
  _getWeekKey(date) {
    const year = date.getFullYear();
    const onejan = new Date(year, 0, 1);
    const weekNum = Math.ceil((((date - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return `${year}-W${weekNum.toString().padStart(2, '0')}`;
  }

  /**
   * Normaliser period key fra input-felter
   */
  normalizePeriodKey(period, value) {
    if (!value) return value;
    const str = String(value).trim();

    if (period === 'week') {
      const match = str.match(/^(\d{4})-W?(\d{1,2})$/i);
      if (!match) return str;
      return `${match[1]}-W${match[2].padStart(2, '0')}`;
    }

    if (period === 'month') {
      const match = str.match(/^(\d{4})-(\d{1,2})$/);
      if (!match) return str;
      return `${match[1]}-${match[2].padStart(2, '0')}`;
    }

    if (period === 'year') {
      return str.slice(0, 4);
    }

    return str;
  }

  /**
   * Hent tilgjengelige perioder fra faktiske innlogginger
   */
  async getAvailablePeriodKeys(period = 'week') {
    try {
      const allLogins = await firebaseService.getAll(COLLECTIONS.LOGIN_STATS);
      const keys = new Set();

      allLogins.forEach(login => {
        const key = this._resolveLoginPeriodKey(login, period);
        if (key) {
          keys.add(key);
        }
      });

      return Array.from(keys).sort().reverse();
    } catch (error) {
      console.error('❌ Feil ved henting av tilgjengelige perioder:', error);
      return [];
    }
  }

  /**
   * Generer liste med periodenøkler bakover i tid
   */
  _generateRecentPeriodKeys(period = 'day', count = 7) {
    const now = new Date();
    const keys = [];

    for (let i = count - 1; i >= 0; i--) {
      const date = new Date(now);

      if (period === 'day') {
        date.setDate(date.getDate() - i);
        keys.push(this._getDateKey(date));
      } else if (period === 'week') {
        date.setDate(date.getDate() - (i * 7));
        keys.push(this._getWeekKey(date));
      } else if (period === 'month') {
        date.setMonth(date.getMonth() - i);
        keys.push(this._getMonthKey(date));
      } else if (period === 'year') {
        date.setFullYear(date.getFullYear() - i);
        keys.push(this._getYearKey(date));
      }
    }

    return keys;
  }

  /**
   * Hent periodenøkkel fra login-record (med fallback for eldre data)
   */
  _resolveLoginPeriodKey(login, period = 'day') {
    if (!login) return null;

    if (period === 'day') {
      if (login.dateKey) return login.dateKey;
    } else if (period === 'week') {
      if (login.weekKey) return this.normalizePeriodKey('week', login.weekKey);
    } else if (period === 'month') {
      if (login.monthKey) return this.normalizePeriodKey('month', login.monthKey);
    } else if (period === 'year') {
      if (login.yearKey) return this.normalizePeriodKey('year', login.yearKey);
    }

    // Fallback for eldre records uten period keys
    if (login.timestamp) {
      const date = new Date(login.timestamp);
      if (!Number.isNaN(date.getTime())) {
        if (period === 'day') return this._getDateKey(date);
        if (period === 'week') return this._getWeekKey(date);
        if (period === 'month') return this._getMonthKey(date);
        if (period === 'year') return this._getYearKey(date);
      }
    }

    return null;
  }

  /**
   * Hent flagg-emoji for landkode
   */
  getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🏳️';

    // Konverter landkode til regional indicator symbols
    const offset = 127397;
    const codePoints = [...countryCode.toUpperCase()].map(c => c.charCodeAt(0) + offset);
    return String.fromCodePoint(...codePoints);
  }

  /**
   * Hent fylkesskjold/ikon for norske fylker
   */
  getNorwegianCountyShield(region) {
    const shields = {
      'Oslo': '🦁',
      'Rogaland': '⚔️',
      'Møre og Romsdal': '🌊',
      'Nordland': '🦅',
      'Viken': '🏛️',
      'Innlandet': '🌲',
      'Vestfold og Telemark': '⛵',
      'Agder': '🌅',
      'Vestland': '🐟',
      'Trøndelag': '🦌',
      'Troms og Finnmark': '❄️'
    };
    return shields[region] || '🏔️';
  }
}

// Eksporter singleton
export const statsService = new StatsService();

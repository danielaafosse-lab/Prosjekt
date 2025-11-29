/**
 * Settings Service
 * Håndterer app-innstillinger
 */

import { dataService } from '../core/dataService.js';
import { authService } from '../core/auth.js';
import { eventBus, EVENTS } from '../core/eventBus.js';
import {
  validateClassName,
  validateCurrencyName,
  validateCurrencySymbol,
  validateAmount
} from '../utils/validators.js';

class SettingsService {
  constructor() {
    this.currentSettings = null;
  }

  /**
   * Hent nåværende innstillinger
   * @returns {Promise<Object>} - Innstillinger
   */
  async getSettings() {
    try {
      if (!this.currentSettings) {
        this.currentSettings = await dataService.getSettings();
      }
      return this.currentSettings;
    } catch (error) {
      console.error('Feil ved henting av innstillinger:', error);
      throw error;
    }
  }

  /**
   * Oppdater innstillinger (kun lærer)
   * @param {Object} updates - Oppdateringer
   * @returns {Promise<Object>} - Oppdaterte innstillinger
   */
  async updateSettings(updates) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan oppdatere innstillinger');
      }
      
      // Valider relevante felt
      if (updates.className !== undefined) {
        const validation = validateClassName(updates.className);
        if (!validation.valid) throw new Error(validation.error);
        updates.className = updates.className.trim();
      }
      
      if (updates.currencyName !== undefined) {
        const validation = validateCurrencyName(updates.currencyName);
        if (!validation.valid) throw new Error(validation.error);
        updates.currencyName = updates.currencyName.trim();
      }
      
      if (updates.currencySymbol !== undefined) {
        const validation = validateCurrencySymbol(updates.currencySymbol);
        if (!validation.valid) throw new Error(validation.error);
        updates.currencySymbol = updates.currencySymbol.trim().toUpperCase();
      }
      
      if (updates.startingBalance !== undefined) {
        const validation = validateAmount(updates.startingBalance);
        if (!validation.valid) throw new Error(`Startbalanse: ${validation.error}`);
        updates.startingBalance = validation.value;
      }
      
      this.currentSettings = await dataService.updateSettings(updates);
      eventBus.emit(EVENTS.SETTINGS_UPDATED, this.currentSettings);
      
      return this.currentSettings;
    } catch (error) {
      console.error('Feil ved oppdatering av innstillinger:', error);
      throw error;
    }
  }

  /**
   * Hent valutasymbol
   * @returns {Promise<string>} - Valutasymbol
   */
  async getCurrencySymbol() {
    const settings = await this.getSettings();
    return settings.currencySymbol || 'SKR';
  }

  /**
   * Hent valutanavn
   * @returns {Promise<string>} - Valutanavn
   */
  async getCurrencyName() {
    const settings = await this.getSettings();
    return settings.currencyName || 'Skolekroner';
  }

  /**
   * Hent klassenavn
   * @returns {Promise<string>} - Klassenavn
   */
  async getClassName() {
    const settings = await this.getSettings();
    return settings.className || 'Klasse';
  }

  /**
   * Hent startbalanse for nye elever
   * @returns {Promise<number>} - Startbalanse
   */
  async getStartingBalance() {
    const settings = await this.getSettings();
    return settings.startingBalance || 1000;
  }

  /**
   * Refresh innstillinger fra database
   * @returns {Promise<Object>} - Oppdaterte innstillinger
   */
  async refresh() {
    this.currentSettings = null;
    return await this.getSettings();
  }
}

// Eksporter singleton instance
export const settingsService = new SettingsService();

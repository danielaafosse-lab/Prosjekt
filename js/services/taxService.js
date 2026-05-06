/**
 * Tax Service - Håndterer skattesystemet
 * 
 * Features:
 * - Progressiv og flat skatt
 * - Fradrag for lønnsutbetalinger
 * - Skatteoppgjør og oversikt
 * - Skattekonto (000)
 * 
 * VIKTIG: Bruker klasserom-isolert storage for multi-tenancy
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../config.js';
import { dataService } from '../core/dataService.js';
import { eventBus } from '../core/eventBus.js';
import { languageService } from './languageService.js';

class TaxService {
    constructor() {
        // Ikke last taxAccount i constructor - gjøres dynamisk per klasserom
        this._taxAccountCache = null;
        this._cacheClassroomId = null;
        this._settingsCache = null; // Cache for synkrone settings-oppslag
    }

    /**
     * Hent skattekonto synkront fra cache
     * Bruk loadTaxAccountAsync() først for å fylle cache
     */
    getTaxAccountSync() {
        return this._taxAccountCache || { accountNumber: '001', balance: 0, transactions: [] };
    }

    /**
     * Last inn skattekonto fra lagring (klasserom-isolert) - SYNKRON versjon
     * Returnerer cache eller default
     */
    loadTaxAccount() {
        // Sjekk om cache er gyldig
        if (this._taxAccountCache !== null) {
            return this._taxAccountCache;
        }
        
        // Default tom skattekonto (async lasting gjøres via loadTaxAccountAsync)
        const defaultAccount = {
            accountNumber: '001',
            balance: 0,
            transactions: []
        };
        return defaultAccount;
    }
    
    /**
     * Last inn skattekonto asynkront fra Firebase
     */
    async loadTaxAccountAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this._taxAccountCache = { accountNumber: '001', balance: 0, transactions: [] };
                return this._taxAccountCache;
            }
            
            // Hent fra classroom-dokumentet
            if (dataService.getClassroom) {
                const classroom = await dataService.getClassroom(classroomId);
                if (classroom && classroom.taxAccount) {
                    this._taxAccountCache = classroom.taxAccount;
                    this._cacheClassroomId = classroomId;
                    return this._taxAccountCache;
                }
            }
            
            // Default tom skattekonto
            this._taxAccountCache = { accountNumber: '001', balance: 0, transactions: [] };
            this._cacheClassroomId = classroomId;
            return this._taxAccountCache;
        } catch (e) {
            console.error('Feil ved lasting av taxAccount:', e);
            this._taxAccountCache = { accountNumber: '001', balance: 0, transactions: [] };
            return this._taxAccountCache;
        }
    }
    
    /**
     * Refresh cache - for å hente nyeste data
     */
    async refreshCache() {
        this._taxAccountCache = null;
        this._settingsCache = null;
        await this.loadTaxAccountAsync();
        await this.loadSettingsAsync();
    }
    
    /**
     * Last inn settings asynkront og cache dem
     */
    async loadSettingsAsync() {
        const settings = await dataService.getSettings();
        this._settingsCache = settings.tax || DEFAULT_SETTINGS.tax;
        return this._settingsCache;
    }

    /**
     * Hent taxAccount (med lazy loading)
     */
    get taxAccount() {
        return this.loadTaxAccount();
    }

    /**
     * Lagre skattekonto til Firebase (klasserom-isolert)
     */
    async saveTaxAccount() {
        const account = this._taxAccountCache || this.loadTaxAccount();
        const classroomId = await dataService.getCurrentClassroomId();
        
        if (classroomId) {
            // Lagre som del av classroom-dokumentet i Firebase
            await dataService.updateClassroom(classroomId, { taxAccount: account });
            console.log('💾 TaxAccount lagret til Firebase');
        } else {
            // Fallback til localStorage
            await dataService.saveClassroomData(STORAGE_KEYS.TAX_ACCOUNT, account);
        }
    }

    /**
     * Hent gjeldende skatteinnstillinger (async)
     */
    async getSettings() {
        const settings = await dataService.getSettings();
        this._settingsCache = settings.tax || DEFAULT_SETTINGS.tax;
        return this._settingsCache;
    }
    
    /**
     * Hent cached settings (synkron) - brukes av calculateTax
     * Returnerer default hvis cache ikke er lastet
     */
    getSettingsSync() {
        if (this._settingsCache) {
            return this._settingsCache;
        }
        console.warn('⚠️ taxService.getSettingsSync() kalt før async init - bruker defaults');
        return DEFAULT_SETTINGS.tax;
    }

    /**
     * Sjekk om skattesystemet er aktivert
     */
    async isEnabled() {
        const settings = await this.getSettings();
        return settings.enabled;
    }

    /**
     * Beregn skatt basert på inntekt
     * MERK: Bruker cached settings for synkron operasjon
     * Sørg for at loadSettingsAsync() er kalt ved innlogging
     * @param {number} income - Bruttoinntekt
     * @param {number} deductions - Fradrag (valgfritt)
     * @returns {object} - { taxAmount, effectiveRate, breakdown }
     */
    calculateTax(income, deductions = 0) {
        const settings = this.getSettingsSync();
        
        if (!settings.enabled || income <= 0) {
            return { taxAmount: 0, effectiveRate: 0, breakdown: [] };
        }

        const taxableIncome = Math.max(0, income - deductions);

        if (settings.type === 'flat') {
            const taxAmount = Math.floor(taxableIncome * (settings.flatRate / 100));
            return {
                taxAmount,
                effectiveRate: settings.flatRate,
                breakdown: [{
                    bracket: 'Flat skatt',
                    rate: settings.flatRate,
                    amount: taxAmount
                }]
            };
        }

        // Progressiv skatt
        return this.calculateProgressiveTax(taxableIncome, settings.brackets);
    }

    /**
     * Beregn progressiv skatt
     */
    calculateProgressiveTax(income, brackets) {
            let totalTax = 0;
            const breakdown = [];

            const normalizedBrackets = [];
            let previousMax = null;

            for (const rawBracket of (brackets || [])) {
                let min = Number.isFinite(rawBracket?.min)
                    ? rawBracket.min
                    : (previousMax !== null ? previousMax + 1 : 0);

                if (previousMax !== null && min <= previousMax) {
                    min = previousMax + 1;
                }

                let max = rawBracket?.max;
                if (max !== null && !Number.isFinite(max)) {
                    max = null;
                }
                if (max !== null && max < min) {
                    max = min;
                }

                const rate = Number.isFinite(rawBracket?.rate) ? rawBracket.rate : 0;

                normalizedBrackets.push({ min, max, rate });
                previousMax = max === null ? previousMax : max;
            }

            for (const bracket of normalizedBrackets) {
                if (income < bracket.min) continue;

                const upperBound = bracket.max === null ? income : Math.min(income, bracket.max);
                const bracketSize = upperBound >= bracket.min
                    ? (upperBound - bracket.min + 1)
                    : 0;

                if (bracketSize <= 0) continue;

                const taxInBracket = Math.floor(bracketSize * (bracket.rate / 100));
                totalTax += taxInBracket;

                breakdown.push({
                    bracket: bracket.max === null
                        ? `${bracket.min}+ KKr`
                        : `${bracket.min}-${bracket.max} KKr`,
                    rate: bracket.rate,
                    taxableAmount: bracketSize,
                    amount: taxInBracket
                });
            }

        const effectiveRate = income > 0 ? (totalTax / income) * 100 : 0;

        return {
            taxAmount: totalTax,
            effectiveRate: Math.round(effectiveRate * 10) / 10,
            breakdown
        };
    }

    /**
     * Trekk skatt fra en transaksjon (lønn)
     * @param {string} userId - Bruker-ID
     * @param {number} grossAmount - Bruttobeløp
     * @param {string} description - Beskrivelse av transaksjonen
     * @returns {object} - { netAmount, taxAmount, grossAmount }
     */
    async witholdTax(userId, grossAmount, description = 'Lønn') {
        const taxResult = this.calculateTax(grossAmount);
        
        if (taxResult.taxAmount > 0) {
            // Legg til skatt i skattekontoen
            this.taxAccount.balance += taxResult.taxAmount;
            this.taxAccount.transactions.push({
                id: Date.now().toString(),
                type: 'income',
                amount: taxResult.taxAmount,
                fromUserId: userId,
                description: `${languageService.t('transaction.taxDeduction')}: ${description}`,
                grossAmount,
                effectiveRate: taxResult.effectiveRate,
                date: new Date().toISOString()
            });
            await this.saveTaxAccount();

            eventBus.emit('tax:collected', {
                userId,
                taxAmount: taxResult.taxAmount,
                grossAmount
            });
        }

        return {
            grossAmount,
            taxAmount: taxResult.taxAmount,
            netAmount: grossAmount - taxResult.taxAmount,
            effectiveRate: taxResult.effectiveRate
        };
    }

    /**
     * Hent skattehistorikk for en bruker
     */
    getUserTaxHistory(userId) {
        return this.taxAccount.transactions.filter(t => t.fromUserId === userId);
    }

    /**
     * Hent total skatt betalt av en bruker
     */
    getUserTotalTax(userId) {
        const history = this.getUserTaxHistory(userId);
        return history.reduce((sum, t) => sum + t.amount, 0);
    }

    /**
     * Hent skattekonto saldo
     */
    getTaxAccountBalance() {
        return this.taxAccount.balance;
    }

    /**
     * Hent alle skattetransaksjoner
     */
    getAllTaxTransactions() {
        return [...this.taxAccount.transactions].reverse();
    }

    /**
     * Utbetal fra skattekontoen (f.eks. til felles formål)
     */
    async disburseTaxFunds(amount, description, toUserId = null) {
        if (amount > this.taxAccount.balance) {
            throw new Error(languageService.t('error.insufficientTaxFunds'));
        }

        this.taxAccount.balance -= amount;
        this.taxAccount.transactions.push({
            id: Date.now().toString(),
            type: 'expense',
            amount: -amount,
            toUserId,
            description,
            date: new Date().toISOString()
        });
        await this.saveTaxAccount();

        eventBus.emit('tax:disbursed', { amount, description, toUserId });

        return { success: true, newBalance: this.taxAccount.balance };
    }

    /**
     * Generer skatteoppgave for en bruker
     */
    generateTaxStatement(userId) {
        const user = dataService.getUserById(userId);
        if (!user) return null;

        const taxHistory = this.getUserTaxHistory(userId);
        const totalTax = this.getUserTotalTax(userId);
        const totalGrossIncome = taxHistory.reduce((sum, t) => sum + (t.grossAmount || 0), 0);

        return {
            userId,
            userName: user.name,
            period: {
                start: taxHistory.length > 0 ? taxHistory[0].date : null,
                end: taxHistory.length > 0 ? taxHistory[taxHistory.length - 1].date : null
            },
            summary: {
                totalGrossIncome,
                totalTax,
                effectiveRate: totalGrossIncome > 0 
                    ? Math.round((totalTax / totalGrossIncome) * 1000) / 10 
                    : 0
            },
            transactions: taxHistory,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Nullstill skattekonto
     */
    async reset() {
        this._taxAccountCache = {
            accountNumber: '000',
            balance: 0,
            transactions: []
        };
        this._cacheClassroomId = dataService.getCurrentClassroomId();
        await this.saveTaxAccount();
    }

    /**
     * Hent all skattedata (for statistikk)
     */
    getTaxData() {
        const account = this.taxAccount;
        return {
            balance: account.balance,
            history: account.transactions.filter(t => t.type === 'income'),
            spending: account.transactions.filter(t => t.type === 'expense')
        };
    }

    /**
     * Tvunget refresh av cache (f.eks. ved bytte av klasserom)
     */
    refreshCache() {
        this._taxAccountCache = null;
        this._cacheClassroomId = null;
    }
}

export const taxService = new TaxService();

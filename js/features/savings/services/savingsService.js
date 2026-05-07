/**
 * Savings Service - Håndterer sparekonto og fondskonto
 * 
 * Features:
 * - Sparekonto (2XX) med fast rente (2% årlig)
 * - Fondskonto (3XX) med variabel avkastning (8% ±3%)
 * - Automatisk renteutbetaling hver mandag (uke = måned)
 * - Innskudd og uttak
 * 
 * VIKTIG: Bruker klasserom-isolert storage for multi-tenancy
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../../shared/config/config.js';
import { dataService } from '../../../shared/core/dataService.js';
import { eventBus } from '../../../shared/core/eventBus.js';
import { languageService } from '../../i18n/index.js';

class SavingsService {
    constructor() {
        // Ikke last kontoer i constructor - gjøres dynamisk per klasserom
        this._savingsCache = null;
        this._fundsCache = null;
        this._cacheClassroomId = null;
        this._initialized = false;
    }

    /**
     * Initialiser savingsService - må kalles etter innlogging
     */
    async initialize() {
        try {
            await this.loadSavingsAccountsAsync();
            await this.loadFundAccountsAsync();
            this._initialized = true;
            console.log('✅ SavingsService initialisert med', 
                this._savingsCache?.length || 0, 'sparekontoer og',
                this._fundsCache?.length || 0, 'fondskontoer');
        } catch (e) {
            console.warn('⚠️ SavingsService initialisering feilet:', e);
            this._savingsCache = [];
            this._fundsCache = [];
        }
    }

    /**
     * Last inn sparekontoer asynkront fra Firebase
     */
    async loadSavingsAccountsAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this._savingsCache = [];
                return [];
            }
            
            if (dataService.getClassroomData) {
                const data = await dataService.getClassroomData(STORAGE_KEYS.SAVINGS_ACCOUNTS);
                this._savingsCache = data || [];
                this._cacheClassroomId = classroomId;
                return this._savingsCache;
            }
            
            // Fallback - sett tom cache
            this._savingsCache = [];
            return [];
        } catch (e) {
            console.error('Feil ved lasting av sparekontoer:', e);
            this._savingsCache = [];
            return [];
        }
    }

    /**
     * Last inn fondskontoer asynkront fra Firebase
     */
    async loadFundAccountsAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this._fundsCache = [];
                return [];
            }
            
            if (dataService.getClassroomData) {
                const data = await dataService.getClassroomData(STORAGE_KEYS.FUND_ACCOUNTS);
                this._fundsCache = data || [];
                return this._fundsCache;
            }
            
            // Fallback - sett tom cache
            this._fundsCache = [];
            return [];
        } catch (e) {
            console.error('Feil ved lasting av fondskontoer:', e);
            this._fundsCache = [];
            return [];
        }
    }

    /**
     * Last inn sparekontoer fra lagring - SYNKRON versjon bruker cache
     */
    loadSavingsAccounts() {
        if (this._savingsCache !== null) {
            return this._savingsCache;
        }
        console.warn('⚠️ loadSavingsAccounts() kalt før async init');
        return [];
    }

    /**
     * Last inn fondskontoer fra lagring - SYNKRON versjon bruker cache
     */
    loadFundAccounts() {
        if (this._fundsCache !== null) {
            return this._fundsCache;
        }
        console.warn('⚠️ loadFundAccounts() kalt før async init');
        return [];
    }

    /**
     * Hent savingsAccounts (med lazy loading)
     */
    get savingsAccounts() {
        return this.loadSavingsAccounts();
    }

    /**
     * Hent fundAccounts (med lazy loading)
     */
    get fundAccounts() {
        return this.loadFundAccounts();
    }

    /**
     * Lagre sparekontoer (klasserom-isolert)
     */
    async saveSavingsAccounts() {
        const accounts = this._savingsCache || [];
        for (const account of accounts) {
            await dataService.saveClassroomItem(STORAGE_KEYS.SAVINGS_ACCOUNTS, account);
        }
    }

    /**
     * Lagre enkelt sparekonto
     */
    async saveSavingsAccount(account) {
        const index = this._savingsCache.findIndex(a => a.id === account.id);
        if (index !== -1) {
            this._savingsCache[index] = account;
        } else {
            this._savingsCache.push(account);
        }
        // Oppdater dataService cache
        dataService.updateSavingsCache(this._savingsCache);
        await dataService.saveClassroomItem(STORAGE_KEYS.SAVINGS_ACCOUNTS, account);
    }

    /**
     * Lagre fondskontoer (klasserom-isolert)
     */
    async saveFundAccounts() {
        const accounts = this._fundsCache || [];
        for (const account of accounts) {
            await dataService.saveClassroomItem(STORAGE_KEYS.FUND_ACCOUNTS, account);
        }
    }

    /**
     * Lagre enkelt fondskonto
     */
    async saveFundAccount(account) {
        const index = this._fundsCache.findIndex(a => a.id === account.id);
        if (index !== -1) {
            this._fundsCache[index] = account;
        } else {
            this._fundsCache.push(account);
        }
        // Oppdater dataService cache (bruker samme for savings og funds)
        dataService.updateSavingsCache([...this._savingsCache, ...this._fundsCache]);
        await dataService.saveClassroomItem(STORAGE_KEYS.FUND_ACCOUNTS, account);
    }

    /**
     * Hent innstillinger
     */
    async getSettings() {
        const settings = await dataService.getSettings();
        return {
            savings: settings.savings || DEFAULT_SETTINGS.savings,
            funds: settings.funds || DEFAULT_SETTINGS.funds,
            simulation: settings.simulation || DEFAULT_SETTINGS.simulation || { timeModel: 'accelerated' }
        };
    }

    /**
     * Antall perioder per år basert på valgt tidsmodell
     */
    getPeriodsPerYear(timeModel) {
        return timeModel === 'realistic' ? 52 : 12;
    }

    /**
     * Enkel normalfordelt tilfeldig verdi (Box-Muller)
     */
    randomNormal() {
        let u = 0;
        let v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    /**
     * Generer kontonummer
     */
    generateAccountNumber(type) {
        const accounts = type === 'savings' ? this.savingsAccounts : this.fundAccounts;
        const prefix = type === 'savings' ? 200 : 300;
        
        if (accounts.length === 0) return prefix.toString();
        
        const numbers = accounts.map(a => parseInt(a.accountNumber) || prefix - 1);
        return (Math.max(...numbers) + 1).toString();
    }

    // ==================== SPAREKONTO ====================

    /**
     * Opprett sparekonto for bruker
     * Kontonummer følger brukerens hovedkonto: 101 -> 201
     */
    async createSavingsAccount(userId) {
        // Sjekk om bruker allerede har sparekonto
        const existing = this.getSavingsAccountByUser(userId);
        if (existing) {
            throw new Error(languageService.t('error.userAlreadyHasSavingsAccount'));
        }

        const user = dataService.getUserById(userId);
        if (!user) throw new Error(languageService.t('error.userNotFound'));

        // Generer kontonummer basert på brukerens hovedkonto (101 -> 201)
        const baseNumber = parseInt(user.accountNumber) || 101;
        const savingsAccountNumber = (baseNumber + 100).toString(); // 101 -> 201

        const account = {
            id: `SAV-${Date.now()}`,
            accountNumber: savingsAccountNumber,
            userId,
            classroomId: user.classroomId,
            balance: 0,
            interestEarned: 0,
            transactions: [],
            createdAt: new Date().toISOString()
        };

        this._savingsCache.push(account);
        await this.saveSavingsAccount(account);

        eventBus.emit('savings:created', account);
        return account;
    }

    /**
     * Hent sparekonto for bruker
     */
    getSavingsAccountByUser(userId) {
        return this.savingsAccounts.find(a => a.userId === userId);
    }

    /**
     * Sett inn på sparekonto
     */
    async depositToSavings(userId, amount) {
        let account = this.getSavingsAccountByUser(userId);
        
        // Opprett konto hvis den ikke finnes
        if (!account) {
            account = await this.createSavingsAccount(userId);
        }

        const user = dataService.getUserById(userId);
        if (!user || user.balance < amount) {
            throw new Error(languageService.t('error.insufficientCheckingBalance'));
        }

        // Trekk fra brukskonto
        await dataService.updateUserBalance(userId, -amount);
        await dataService.addTransaction(userId, {
            type: 'expense',
            amount,
            description: languageService.t('transaction.transferredToSavings'),
            toName: languageService.t('student.savingsAccount'),
            category: 'savings_transfer'
        });

        // Legg til på sparekonto
        account.balance += amount;
        account.transactions.push({
            id: Date.now().toString(),
            type: 'deposit',
            amount,
            date: new Date().toISOString()
        });

        await this.saveSavingsAccount(account);
        eventBus.emit('savings:deposit', { account, amount });

        return account;
    }

    /**
     * Ta ut fra sparekonto
     */
    async withdrawFromSavings(userId, amount) {
        const account = this.getSavingsAccountByUser(userId);
        if (!account) throw new Error(languageService.t('error.noSavingsAccountFound'));

        if (account.balance < amount) {
            throw new Error(languageService.t('error.insufficientSavingsBalance'));
        }

        // Trekk fra sparekonto
        account.balance -= amount;
        account.transactions.push({
            id: Date.now().toString(),
            type: 'withdrawal',
            amount,
            date: new Date().toISOString()
        });

        // Legg til på brukskonto
        await dataService.updateUserBalance(userId, amount);
        await dataService.addTransaction(userId, {
            type: 'income',
            amount,
            description: languageService.t('transaction.transferredFromSavings'),
            fromName: languageService.t('student.savingsAccount'),
            category: 'savings_transfer'
        });

        await this.saveSavingsAccount(account);
        eventBus.emit('savings:withdrawal', { account, amount });

        return account;
    }

    // ==================== FONDSKONTO ====================

    /**
     * Opprett fondskonto for bruker
     * Kontonummer følger brukerens hovedkonto: 101 -> 301
     */
    async createFundAccount(userId) {
        const existing = this.getFundAccountByUser(userId);
        if (existing) {
            throw new Error(languageService.t('error.userAlreadyHasFundAccount'));
        }

        const user = dataService.getUserById(userId);
        if (!user) throw new Error(languageService.t('error.userNotFound'));

        // Generer kontonummer basert på brukerens hovedkonto (101 -> 301)
        const baseNumber = parseInt(user.accountNumber) || 101;
        const fundAccountNumber = (baseNumber + 200).toString(); // 101 -> 301

        const account = {
            id: `FUND-${Date.now()}`,
            accountNumber: fundAccountNumber,
            userId,
            classroomId: user.classroomId,
            balance: 0,
            costBasis: 0, // Kostpris - for gevinstberegning
            totalReturns: 0,
            transactions: [],
            createdAt: new Date().toISOString()
        };

        this._fundsCache.push(account);
        await this.saveFundAccount(account);

        eventBus.emit('fund:created', account);
        return account;
    }

    /**
     * Hent fondskonto for bruker
     */
    getFundAccountByUser(userId) {
        return this.fundAccounts.find(a => a.userId === userId);
    }

    /**
     * Sett inn på fondskonto
     */
    async depositToFund(userId, amount) {
        let account = this.getFundAccountByUser(userId);
        
        if (!account) {
            account = await this.createFundAccount(userId);
        }

        const user = dataService.getUserById(userId);
        if (!user || user.balance < amount) {
            throw new Error(languageService.t('error.insufficientCheckingBalance'));
        }

        // Trekk fra brukskonto
        await dataService.updateUserBalance(userId, -amount);
        await dataService.addTransaction(userId, {
            type: 'expense',
            amount,
            description: languageService.t('transaction.transferredToFund'),
            toName: languageService.t('student.fundAccount'),
            category: 'fund_transfer'
        });

        // Legg til på fondskonto
        account.balance += amount;
        account.transactions.push({
            id: Date.now().toString(),
            type: 'deposit',
            amount,
            date: new Date().toISOString()
        });

        await this.saveFundAccount(account);
        eventBus.emit('fund:deposit', { account, amount });

        return account;
    }

    /**
     * Ta ut fra fondskonto
     */
    async withdrawFromFund(userId, amount) {
        const account = this.getFundAccountByUser(userId);
        if (!account) throw new Error(languageService.t('error.noFundAccountFound'));

        if (account.balance < amount) {
            throw new Error(languageService.t('error.insufficientFundBalance'));
        }

        // Trekk fra fondskonto
        account.balance -= amount;
        account.transactions.push({
            id: Date.now().toString(),
            type: 'withdrawal',
            amount,
            date: new Date().toISOString()
        });

        // Legg til på brukskonto
        await dataService.updateUserBalance(userId, amount);
        await dataService.addTransaction(userId, {
            type: 'income',
            amount,
            description: languageService.t('transaction.transferredFromFund'),
            fromName: languageService.t('student.fundAccount'),
            category: 'fund_transfer'
        });

        await this.saveFundAccount(account);
        eventBus.emit('fund:withdrawal', { account, amount });

        return account;
    }

    // ==================== RENTEPROSESSERING ====================

    /**
     * Prosesser ukentlig rente for sparekontoer
     * Kalles hver mandag (1 uke = 1 måned)
     */
    async processWeeklySavingsInterest() {
        const settings = await this.getSettings();
        const periodsPerYear = this.getPeriodsPerYear(settings.simulation?.timeModel);
        const periodRate = settings.savings.annualRate / 100 / periodsPerYear;
        const results = [];

        for (const account of this.savingsAccounts) {
            if (account.balance > 0) {
                const interest = Math.round(account.balance * periodRate);

                if (interest > 0) {
                    account.balance += interest;
                    account.interestEarned += interest;
                    account.transactions.push({
                        id: Date.now().toString() + account.id,
                        type: 'interest',
                        amount: interest,
                        rate: settings.savings.annualRate,
                        date: new Date().toISOString()
                    });

                    results.push({
                        userId: account.userId,
                        interest,
                        newBalance: account.balance
                    });
                }
            }
        }

        await this.saveSavingsAccounts();
        eventBus.emit('savings:interestPaid', results);

        return results;
    }

    /**
     * Prosesser ukentlig avkastning for fondskontoer
     * Avkastning varierer: baseRate ±variance
     */
    async processWeeklyFundReturns() {
        const settings = await this.getSettings();
        const results = [];
        const periodsPerYear = this.getPeriodsPerYear(settings.simulation?.timeModel);
        const annualMean = (settings.funds.expectedReturn || 0) / 100;
        const annualVolatility = Math.max(0, (settings.funds.variance || 0) / 100);

        // Konverter til periodisk drift/volatilitet
        const periodMean = annualMean / periodsPerYear;
        const periodVolatility = annualVolatility / Math.sqrt(periodsPerYear);

        for (const account of this.fundAccounts) {
            if (account.balance > 0) {
                // Mer realistisk: forventet drift + stokastisk sjokk (kan bli både + og -)
                const shock = this.randomNormal() * periodVolatility;
                const periodReturnRate = periodMean + shock;
                const effectiveAnnualizedRate = periodReturnRate * periodsPerYear * 100;

                const returns = Math.floor(account.balance * periodReturnRate);
                
                // Avkastning kan være negativ!
                account.balance += returns;
                account.totalReturns += returns;
                
                // Sørg for at saldo ikke går under 0
                if (account.balance < 0) {
                    account.balance = 0;
                }

                account.transactions.push({
                    id: Date.now().toString() + account.id,
                    type: returns >= 0 ? 'return' : 'loss',
                    amount: returns,
                    rate: effectiveAnnualizedRate,
                    date: new Date().toISOString()
                });

                results.push({
                    userId: account.userId,
                    returns,
                    effectiveRate: effectiveAnnualizedRate,
                    newBalance: account.balance
                });
            }
        }

        await this.saveFundAccounts();
        eventBus.emit('fund:returnsPaid', results);

        return results;
    }

    /**
     * Prosesser alle ukentlige operasjoner
     */
    async processWeekly() {
        const savingsResults = await this.processWeeklySavingsInterest();
        const fundResults = await this.processWeeklyFundReturns();

        return {
            savings: savingsResults,
            funds: fundResults
        };
    }

    // ==================== HJELPEMETODER ====================

    /**
     * Hent alle sparekontoer
     */
    getAllSavingsAccounts() {
        return [...this.savingsAccounts];
    }

    /**
     * Hent alle fondskontoer
     */
    getAllFundAccounts() {
        return [...this.fundAccounts];
    }

    /**
     * Hent total saldo for en bruker (spare + fond)
     */
    getUserTotalSavings(userId) {
        const savings = this.getSavingsAccountByUser(userId);
        const fund = this.getFundAccountByUser(userId);

        return {
            savings: savings?.balance || 0,
            fund: fund?.balance || 0,
            total: (savings?.balance || 0) + (fund?.balance || 0)
        };
    }

    /**
     * Hent kontohistorikk
     */
    getAccountHistory(accountId) {
        const savings = this.savingsAccounts.find(a => a.id === accountId);
        if (savings) return savings.transactions;

        const fund = this.fundAccounts.find(a => a.id === accountId);
        if (fund) return fund.transactions;

        return [];
    }

    /**
     * Nullstill alle kontoer
     */
    async reset() {
        this._savingsCache = [];
        this._fundsCache = [];
        await this.saveSavingsAccounts();
        await this.saveFundAccounts();
    }

    /**
     * Tving omlasting av cache (for når klasserom endres)
     */
    refreshCache() {
        this._savingsCache = null;
        this._fundsCache = null;
        this._cacheClassroomId = null;
    }
}

export const savingsService = new SavingsService();

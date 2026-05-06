/**
 * Loan Service - Håndterer lånesystemet
 * 
 * Features:
 * - Opprett lån med nedbetalingsplan
 * - Automatisk rentepåslag
 * - Nedbetaling av lån
 * - Lånehistorikk
 * 
 * VIKTIG: Bruker klasserom-isolert storage for multi-tenancy
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, LOAN_STATUS } from '../config.js';
import { dataService } from '../core/dataService.js';
import { authService } from '../core/auth.js';
import { eventBus } from '../core/eventBus.js';
import { classroomService } from './classroomService.js';
import { languageService } from './languageService.js';
import { notificationService } from './notificationService.js';
import { settingsService } from './settingsService.js';

class LoanService {
    constructor() {
        // Ikke last lån i constructor - gjøres dynamisk per klasserom
        this._loansCache = null;
        this._cacheClassroomId = null;
        this._initialized = false;
    }

    /**
     * Initialiser loanService - må kalles etter innlogging
     */
    async initialize() {
        try {
            await this.loadLoansAsync();
            this._initialized = true;
            console.log('✅ LoanService initialisert med', this._loansCache?.length || 0, 'lån');
        } catch (e) {
            console.warn('⚠️ LoanService initialisering feilet:', e);
            this._loansCache = [];
        }
    }

    /**
     * Hent classroomId for nåværende bruker (synkron fra cache)
     * Bruker dataService for konsistent tilgang
     */
    getCurrentClassroomId() {
        return dataService.getCurrentClassroomIdSync();
    }

    /**
     * Last inn lån asynkront fra Firebase
     */
    async loadLoansAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this._loansCache = [];
                return [];
            }
            
            if (dataService.getClassroomData) {
                const data = await dataService.getClassroomData(STORAGE_KEYS.LOANS);
                this._loansCache = data || [];
                this._cacheClassroomId = classroomId;
                console.log('💰 Lastet', this._loansCache.length, 'lån fra Firebase');
                return this._loansCache;
            }
            
            // Fallback - sett tom cache
            this._loansCache = [];
            return [];
        } catch (e) {
            console.error('Feil ved lasting av lån:', e);
            this._loansCache = [];
            return [];
        }
    }

    /**
     * Last inn lån fra lagring (klasserom-isolert) - SYNKRON versjon bruker cache
     */
    loadLoans() {
        // Returner cache hvis tilgjengelig
        if (this._loansCache !== null) {
            return this._loansCache;
        }
        
        // Synkron fallback - returnerer tom array
        console.warn('⚠️ loadLoans() kalt før async init - returnerer tom array');
        return [];
    }

    /**
     * Hent loans (med lazy loading)
     */
    get loans() {
        return this.loadLoans();
    }

    /**
     * Lagre lån (klasserom-isolert)
     */
    async saveLoans() {
        const loans = this._loansCache || [];
        // Lagre hvert lån individuelt til Firebase
        for (const loan of loans) {
            await dataService.saveClassroomItem(STORAGE_KEYS.LOANS, loan);
        }
    }

    /**
     * Lagre enkelt lån til Firebase
     */
    async saveLoan(loan) {
        // Oppdater lokal cache
        const index = this._loansCache.findIndex(l => l.id === loan.id);
        if (index !== -1) {
            this._loansCache[index] = loan;
        } else {
            this._loansCache.push(loan);
        }
        // Oppdater dataService cache
        dataService.updateLoansCache(this._loansCache);
        // Lagre til Firebase
        await dataService.saveClassroomItem(STORAGE_KEYS.LOANS, loan);
    }

    /**
     * Hent låneinnstillinger
     */
    async getSettings() {
        const settings = await dataService.getSettings();
        return settings.loans || DEFAULT_SETTINGS.loans;
    }

    /**
     * Sjekk om lånesystemet er aktivert
     */
    async isEnabled() {
        const settings = await this.getSettings();
        return settings.enabled;
    }

    /**
     * Opprett et nytt lån
     */
    async createLoan(borrowerId, borrowerType, amount, termWeeks, interestRate = null) {
        const settings = await this.getSettings();
        
        if (!settings.enabled) {
            throw new Error('Lånesystemet er ikke aktivert');
        }

        // Hent classroomId fra låntaker
        let classroomId = this.getCurrentClassroomId();
        if (borrowerType === 'student') {
            const borrower = dataService.getUserById(borrowerId);
            if (borrower?.classroomId) {
                classroomId = borrower.classroomId;
            }
        }

        const rate = interestRate !== null ? interestRate : settings.defaultInterestRate;
        const monthlyRate = rate / 100 / 12;
        
        // Beregn månedlig avdrag (annuitet)
        let monthlyPayment;
        if (monthlyRate === 0) {
            monthlyPayment = amount / termWeeks;
        } else {
            monthlyPayment = amount * (monthlyRate * Math.pow(1 + monthlyRate, termWeeks)) 
                / (Math.pow(1 + monthlyRate, termWeeks) - 1);
        }
        monthlyPayment = Math.ceil(monthlyPayment);

        const totalPayment = monthlyPayment * termWeeks;
        const totalInterest = totalPayment - amount;

        const loan = {
            id: `LOAN-${Date.now()}`,
            borrowerId,
            borrowerType, // 'student' eller 'business'
            classroomId: classroomId, // Koble til klasserom
            principalAmount: amount,
            remainingBalance: amount,
            interestRate: rate,
            termWeeks,
            monthlyPayment,
            totalInterest,
            paymentsRemaining: termWeeks,
            paymentsMade: 0,
            paymentHistory: [],
            status: LOAN_STATUS.ACTIVE,
            createdAt: new Date().toISOString(),
            nextPaymentDate: this.calculateNextPaymentDate()
        };

        this.loans.push(loan);
        await this.saveLoan(loan);

        // Utbetal lånebeløpet til låntaker
        if (borrowerType === 'student') {
            await dataService.updateUserBalance(borrowerId, amount);
            await dataService.addTransaction(borrowerId, {
                type: 'income',
                amount,
                description: `${languageService.t('transaction.loanReceived')} (${loan.id})`,
                fromName: languageService.t('common.bank'),
                category: 'loan'
            });
        }
        // For bedrifter håndteres dette i businessService

        eventBus.emit('loan:created', loan);

        return loan;
    }

    /**
     * Beregn neste betalingsdato (neste mandag)
     */
    calculateNextPaymentDate() {
        const now = new Date();
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        const nextMonday = new Date(now);
        nextMonday.setDate(now.getDate() + daysUntilMonday);
        nextMonday.setHours(8, 0, 0, 0);
        return nextMonday.toISOString();
    }

    /**
     * Betal på et lån
     */
    async makePayment(loanId, amount, fromAccountId = null) {
        const loan = this.getLoanById(loanId);
        if (!loan) {
            throw new Error(languageService.t('error.loanNotFound'));
        }

        if (loan.status !== LOAN_STATUS.ACTIVE) {
            throw new Error(languageService.t('error.loanNotActive'));
        }

        if (amount <= 0) {
            throw new Error(languageService.t('error.amountMustBePositive'));
        }

        // Sjekk at låntaker har nok penger
        if (loan.borrowerType === 'student') {
            const user = dataService.getUserById(loan.borrowerId);
            if (!user || user.balance < amount) {
                throw new Error(languageService.t('error.insufficientFunds'));
            }
        }

        const paymentAmount = Math.min(amount, loan.remainingBalance);
        
        // Oppdater lånet
        loan.remainingBalance -= paymentAmount;
        loan.paymentsMade++;
        loan.paymentsRemaining = Math.max(0, loan.paymentsRemaining - 1);
        
        loan.paymentHistory.push({
            date: new Date().toISOString(),
            amount: paymentAmount,
            remainingAfter: loan.remainingBalance
        });

        // Trekk fra låntakers konto
        if (loan.borrowerType === 'student') {
            await dataService.updateUserBalance(loan.borrowerId, -paymentAmount);
            await dataService.addTransaction(loan.borrowerId, {
                type: 'expense',
                amount: paymentAmount,
                description: `${languageService.t('transaction.loanPayment')} (${loan.id})`,
                toName: languageService.t('common.bank'),
                category: 'loan_payment'
            });
        }

        // Sjekk om lånet er nedbetalt
        if (loan.remainingBalance <= 0) {
            loan.status = LOAN_STATUS.PAID_OFF;
            loan.paidOffAt = new Date().toISOString();
            
            // Send melding om fullført lån
            this.sendLoanCompletedNotification(loan);
            
            eventBus.emit('loan:paidOff', loan);
        } else {
            loan.nextPaymentDate = this.calculateNextPaymentDate();
        }

        await this.saveLoan(loan);
        eventBus.emit('loan:payment', { loan, amount: paymentAmount });

        return {
            success: true,
            amountPaid: paymentAmount,
            remainingBalance: loan.remainingBalance,
            isPaidOff: loan.status === LOAN_STATUS.PAID_OFF
        };
    }

    /**
     * Send varsel om fullført lån
     */
    sendLoanCompletedNotification(loan) {
        // Hent settings for valutasymbol
        const settings = settingsService.getSettingsSync() || {};
        const currencySymbol = settings.currencySymbol || 'KKr';
        
        // Finn låntakers navn
        let borrowerName = 'Ukjent';
        if (loan.borrowerType === 'student') {
            const user = dataService.getUserById(loan.borrowerId);
            borrowerName = user?.name || 'Ukjent elev';
            
            // Send til eleven via notificationService
            notificationService.create({
                userId: loan.borrowerId,
                type: 'loan_completed',
                title: languageService.t('loan.completedTitle'),
                message: languageService.t('loan.completedMessage', {
                    amount: loan.amount,
                    total: loan.totalPayment,
                    currency: currencySymbol
                }),
                icon: '🎉'
            });
        }
        
        // Emit event for lærervarsel
        eventBus.emit('loan:completed', {
            loanId: loan.id,
            borrowerId: loan.borrowerId,
            borrowerName,
            amount: loan.amount,
            totalPayment: loan.totalPayment,
            paymentsMade: loan.paymentsMade,
            currencySymbol
        });
    }

    /**
     * Prosesser automatiske avdrag (kalles hver mandag kl 08:00)
     * Hvis eleven ikke har nok penger:
     * 1. Trekk det som er tilgjengelig fra kontoen
     * 2. Lånet reduseres kun med det som faktisk ble betalt
     * 3. Beregn nytt avdrag basert på gjenværende gjeld og nedbetalingstid
     * (Lånet øker IKKE, men avdraget blir høyere siden mindre ble nedbetalt)
     */
    async processWeeklyPayments() {
        const activeLoans = this.getActiveLoans();
        const results = [];

        for (const loan of activeLoans) {
            try {
                let availableBalance = 0;
                let borrowerName = 'Ukjent';

                if (loan.borrowerType === 'student') {
                    const user = dataService.getUserById(loan.borrowerId);
                    if (user) {
                        availableBalance = user.balance;
                        borrowerName = user.name;
                    }
                }

                const requiredPayment = loan.monthlyPayment;
                
                if (availableBalance >= requiredPayment) {
                    // Full betaling mulig
                    const result = this.makePayment(loan.id, requiredPayment);
                    results.push({
                        loanId: loan.id,
                        borrowerId: loan.borrowerId,
                        borrowerName,
                        success: true,
                        fullPayment: true,
                        ...result
                    });
                } else {
                    // Delvis eller ingen betaling - trekk det som er tilgjengelig
                    const actualPayment = availableBalance;
                    const shortage = requiredPayment - actualPayment;
                    
                    if (actualPayment > 0) {
                        // Trekk tilgjengelig beløp fra kontoen
                        if (loan.borrowerType === 'student') {
                            dataService.updateUserBalance(loan.borrowerId, -actualPayment);
                            dataService.addTransaction(loan.borrowerId, {
                                type: 'expense',
                                amount: actualPayment,
                                description: `${languageService.t('transaction.partialLoanPayment')} (${loan.id}) - ${languageService.t('transaction.lacked')} ${shortage}`,
                                toName: languageService.t('common.bank'),
                                category: 'loan_payment'
                            });
                        }
                        
                        // Reduser lånet kun med det som faktisk ble betalt
                        loan.remainingBalance -= actualPayment;
                        loan.paymentHistory.push({
                            date: new Date().toISOString(),
                            amount: actualPayment,
                            remainingAfter: loan.remainingBalance,
                            wasPartial: true,
                            shortage
                        });
                    }
                    
                    // Reduser gjenværende betalinger (en uke har gått)
                    loan.paymentsRemaining = Math.max(0, loan.paymentsRemaining - 1);
                    
                    // Beregn nytt ukentlig avdrag basert på gjenværende gjeld og tid
                    // Siden mindre ble nedbetalt, vil avdraget bli høyere
                    if (loan.paymentsRemaining > 0) {
                        const rate = loan.interestRate / 100 / 12;
                        if (rate === 0) {
                            loan.monthlyPayment = Math.ceil(loan.remainingBalance / loan.paymentsRemaining);
                        } else {
                            loan.monthlyPayment = Math.ceil(
                                loan.remainingBalance * (rate * Math.pow(1 + rate, loan.paymentsRemaining)) 
                                / (Math.pow(1 + rate, loan.paymentsRemaining) - 1)
                            );
                        }
                    }
                    
                    loan.nextPaymentDate = this.calculateNextPaymentDate();
                    await this.saveLoan(loan);

                    // Send melding til innboks
                    await this.sendPaymentShortageNotification(loan.borrowerId, loan.borrowerType, {
                        loanId: loan.id,
                        requiredPayment,
                        paidAmount: actualPayment,
                        shortage,
                        newMonthlyPayment: loan.monthlyPayment,
                        newRemainingBalance: loan.remainingBalance
                    });
                    
                    results.push({
                        loanId: loan.id,
                        borrowerId: loan.borrowerId,
                        borrowerName,
                        success: true,
                        fullPayment: false,
                        paidAmount: actualPayment,
                        shortage,
                        newMonthlyPayment: loan.monthlyPayment,
                        newRemainingBalance: loan.remainingBalance
                    });

                    eventBus.emit('loan:partialPayment', { loan, shortage });
                }
            } catch (error) {
                results.push({
                    loanId: loan.id,
                    borrowerId: loan.borrowerId,
                    success: false,
                    reason: error.message
                });
            }
        }

        return results;
    }

    /**
     * Send varsel til innboks om manglende betaling
     */
    async sendPaymentShortageNotification(borrowerId, borrowerType, details) {
        // Hent settings for valutasymbol
        const settings = dataService.getSettingsSync() || {};
        const currencySymbol = settings.currencySymbol || 'KKr';

        // Finn låntakers navn
        let borrowerName = languageService.t('common.unknown');
        if (borrowerType === 'student') {
            const user = dataService.getUserById(borrowerId);
            borrowerName = user?.name || languageService.t('common.unknown');
        }

        if (borrowerType === 'student') {
            // Send til eleven via notificationService
            await notificationService.create({
                userId: borrowerId,
                type: 'loan_payment_failed',
                title: languageService.t('loans.insufficientFundsTitle'),
                message: `${languageService.t('loans.insufficientFundsMsg1')} ${details.requiredPayment} ${currencySymbol}. ` +
                         `${details.paidAmount > 0 ? `${languageService.t('loans.insufficientFundsMsg2')} ${details.paidAmount} ${currencySymbol} ${languageService.t('loans.insufficientFundsMsg3')} ` : `${languageService.t('loans.insufficientFundsMsg4')} `}` +
                         `${languageService.t('loans.insufficientFundsMsg5')} ${details.shortage} ${currencySymbol} ${languageService.t('loans.insufficientFundsMsg6')} ${details.newMonthlyPayment} ${currencySymbol}. ` +
                         `${languageService.t('loans.remainingDebtLabel')}: ${details.newRemainingBalance} ${currencySymbol}.`,
                icon: '⚠️'
            });
        }

        // Send til læreren via Firebase
        await dataService.createTeacherMessage({
            type: 'loan_payment_failed',
            category: 'loans',
            title: `${languageService.t('loans.teacherShortageTitle')}: ${borrowerName}`,
            message: `${borrowerName} ${languageService.t('loans.insufficientFundsMsg1').toLowerCase()} ${details.requiredPayment} ${currencySymbol}.\n\n` +
                     `${languageService.t('loans.requiredAmount')}: ${details.requiredPayment} ${currencySymbol}\n` +
                     `${languageService.t('loans.paid')}: ${details.paidAmount} ${currencySymbol}\n` +
                     `${languageService.t('loans.lacked')}: ${details.shortage} ${currencySymbol}\n\n` +
                     `${languageService.t('loans.newWeeklyInstallment')}: ${details.newMonthlyPayment} ${currencySymbol}\n` +
                     `${languageService.t('loans.remainingDebtLabel')}: ${details.newRemainingBalance} ${currencySymbol}`,
            fromName: 'System',
            fromType: 'system',
            loanId: details.loanId
        });

        eventBus.emit('inbox:newMessage', { borrowerId, type: 'loan_shortage' });
    }

    /**
     * Hent lån etter ID (filtrer på classroom)
     */
    getLoanById(loanId) {
        const classroomId = this.getCurrentClassroomId();
        return this.loans.find(l => 
            l.id === loanId && 
            (!classroomId || l.classroomId === classroomId)
        );
    }

    /**
     * Hent alle lån (kun i nåværende classroom)
     */
    getAllLoans() {
        const classroomId = this.getCurrentClassroomId();
        if (!classroomId) return [...this.loans];
        return this.loans.filter(l => l.classroomId === classroomId);
    }

    /**
     * Hent aktive lån (kun i nåværende classroom)
     */
    getActiveLoans() {
        const classroomId = this.getCurrentClassroomId();
        return this.loans.filter(l => 
            (l.status === LOAN_STATUS.ACTIVE || l.status === LOAN_STATUS.OVERDUE) &&
            (!classroomId || l.classroomId === classroomId)
        );
    }

    /**
     * Hent lån for en spesifikk låntaker (kun i nåværende classroom)
     */
    getLoansByBorrower(borrowerId, borrowerType = 'student') {
        const classroomId = this.getCurrentClassroomId();
        return this.loans.filter(l => 
            l.borrowerId === borrowerId && 
            l.borrowerType === borrowerType &&
            (!classroomId || l.classroomId === classroomId)
        );
    }

    /**
     * Hent total gjeld for en låntaker (kun i nåværende classroom)
     */
    getTotalDebt(borrowerId, borrowerType = 'student') {
        const loans = this.getLoansByBorrower(borrowerId, borrowerType);
        return loans.reduce((sum, loan) => {
            if (loan.status === LOAN_STATUS.ACTIVE || loan.status === LOAN_STATUS.OVERDUE) {
                return sum + loan.remainingBalance;
            }
            return sum;
        }, 0);
    }

    /**
     * Beregn lånedetaljer for forhåndsvisning
     */
    calculateLoanPreview(amount, termWeeks, interestRate) {
        const monthlyRate = interestRate / 100 / 12;
        
        let monthlyPayment;
        if (monthlyRate === 0) {
            monthlyPayment = amount / termWeeks;
        } else {
            monthlyPayment = amount * (monthlyRate * Math.pow(1 + monthlyRate, termWeeks)) 
                / (Math.pow(1 + monthlyRate, termWeeks) - 1);
        }
        monthlyPayment = Math.ceil(monthlyPayment);

        const totalPayment = monthlyPayment * termWeeks;
        const totalInterest = totalPayment - amount;

        return {
            monthlyPayment,
            totalPayment,
            totalInterest,
            effectiveRate: ((totalPayment / amount) - 1) * 100
        };
    }

    /**
     * Betal ekstra på lånet (elev-initiert)
     * Beregner nytt avdrag basert på gjenværende nedbetalingstid
     */
    async makeExtraPayment(loanId, amount) {
        const loan = this.getLoanById(loanId);
        if (!loan) {
            throw new Error(languageService.t('error.loanNotFound'));
        }

        if (loan.status === LOAN_STATUS.PAID_OFF) {
            throw new Error(languageService.t('error.loanAlreadyPaidOff'));
        }

        if (amount <= 0) {
            throw new Error(languageService.t('error.amountMustBePositive'));
        }

        // Sjekk at låntaker har nok penger
        if (loan.borrowerType === 'student') {
            const user = dataService.getUserById(loan.borrowerId);
            if (!user || user.balance < amount) {
                throw new Error(languageService.t('error.insufficientFunds'));
            }
        }

        const paymentAmount = Math.min(amount, loan.remainingBalance);
        
        // Oppdater lånet
        loan.remainingBalance -= paymentAmount;
        
        loan.paymentHistory.push({
            date: new Date().toISOString(),
            amount: paymentAmount,
            remainingAfter: loan.remainingBalance,
            isExtraPayment: true
        });

        // Trekk fra låntakers konto
        if (loan.borrowerType === 'student') {
            dataService.updateUserBalance(loan.borrowerId, -paymentAmount);
            dataService.addTransaction(loan.borrowerId, {
                type: 'expense',
                amount: paymentAmount,
                description: `${languageService.t('transaction.extraLoanPayment')} (${loan.id})`,
                toName: languageService.t('common.bank'),
                category: 'loan_extra_payment'
            });
        }

        // Sjekk om lånet er nedbetalt
        if (loan.remainingBalance <= 0) {
            loan.status = LOAN_STATUS.PAID_OFF;
            loan.paidOffAt = new Date().toISOString();
            loan.monthlyPayment = 0;
            eventBus.emit('loan:paidOff', loan);
        } else if (loan.paymentsRemaining > 0) {
            // Beregn nytt månedlig avdrag basert på gjenværende tid
            const rate = loan.interestRate / 100 / 12;
            if (rate === 0) {
                loan.monthlyPayment = Math.ceil(loan.remainingBalance / loan.paymentsRemaining);
            } else {
                loan.monthlyPayment = Math.ceil(
                    loan.remainingBalance * (rate * Math.pow(1 + rate, loan.paymentsRemaining)) 
                    / (Math.pow(1 + rate, loan.paymentsRemaining) - 1)
                );
            }
        }

        await this.saveLoan(loan);
        eventBus.emit('loan:extraPayment', { loan, amount: paymentAmount });

        return {
            success: true,
            amountPaid: paymentAmount,
            remainingBalance: loan.remainingBalance,
            newMonthlyPayment: loan.monthlyPayment,
            isPaidOff: loan.status === LOAN_STATUS.PAID_OFF
        };
    }

    /**
     * Slett et lån (kun for admin)
     */
    async deleteLoan(loanId) {
        const loans = this.loans;
        const index = loans.findIndex(l => l.id === loanId);
        if (index === -1) {
            throw new Error('Lån ikke funnet');
        }

        const loan = loans[index];
        loans.splice(index, 1);
        this._loansCache = loans;
        // Oppdater dataService cache
        dataService.updateLoansCache(this._loansCache);
        await dataService.deleteClassroomItem(STORAGE_KEYS.LOANS, loanId);

        eventBus.emit('loan:deleted', loan);
        return true;
    }

    /**
     * Nullstill alle lån
     */
    async reset() {
        this._loansCache = [];
        this._cacheClassroomId = await dataService.getCurrentClassroomId();
        await this.saveLoans();
    }

    /**
     * Hent alle lån for statistikk (alias for loans getter)
     */
    async getLoans() {
        return this.loans;
    }

    /**
     * Tvunget refresh av cache (f.eks. ved bytte av klasserom)
     */
    refreshCache() {
        this._loansCache = null;
        this._cacheClassroomId = null;
    }
}

export const loanService = new LoanService();

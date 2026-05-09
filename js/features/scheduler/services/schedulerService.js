/**
 * Scheduler Service - Håndterer automatiske ukentlige prosesser
 * 
 * Features:
 * - Sjekk om det er mandag 08:00
 * - Prosesser renter på sparekontoer
 * - Prosesser avkastning på fond
 * - Prosesser låneavdrag
 * - Send varslinger
 * - Ukentlig økonomisk rapport til lærer
 */

import { STORAGE_KEYS } from '../../../shared/config/config.js';
import { savingsService } from '../../savings/index.js';
import { loanService } from '../../loans/index.js';
import { notificationService } from '../../notifications/index.js';
import { eventBus, EVENTS } from '../../../shared/core/eventBus.js';
import { businessService } from '../../businesses/index.js';
import { dataService } from '../../../shared/core/dataService.js';
import { taxService } from '../../taxes/index.js';
import { transactionService } from '../../transactions/index.js';

class SchedulerService {
    constructor() {
        this.lastProcessedWeek = 0;
        this.checkInterval = null;
        this._initialized = false;
    }

    /**
     * Initialiser scheduler - må kalles etter innlogging
     */
    async initialize() {
        await this.loadLastProcessedWeekAsync();
        this._initialized = true;
        console.log('✅ SchedulerService initialisert, sist prosessert uke:', this.lastProcessedWeek);
        // Sjekk om Cloud Scheduler har lagt ut en trigger mens ingen var innlogget
        await this.checkCloudTriggers();
    }

    /**
     * Sjekk om Cloud Functions har lagt ut ventende scheduler-triggere
     */
    async checkCloudTriggers() {
        try {
            // eslint-disable-next-line no-undef
            if (typeof firebase !== 'undefined' && !firebase.auth().currentUser) {
                return; // Skipper polling når ingen er innlogget — ellers feiler reads under strenge rules
            }
            if (!dataService.getCloudSchedulerTriggers) return;
            const triggers = await dataService.getCloudSchedulerTriggers();
            for (const trigger of triggers) {
                if (trigger.processed) continue;
                if (trigger.type === 'weekly') {
                    console.log('☁️ Cloud trigger funnet: ukentlig prosessering', trigger.weekKey);
                    await this.forceProcess();
                } else if (trigger.type === 'monthly') {
                    console.log('☁️ Cloud trigger funnet: månedlig prosessering', trigger.monthKey);
                    await this.forceMonthlyProcess();
                }
                await dataService.markCloudTriggerProcessed(trigger.id);
            }
        } catch (e) {
            console.warn('⚠️ Feil ved sjekk av cloud triggers:', e.message);
        }
    }

    /**
     * Last siste prosesserte uke fra Firebase (klasserom-isolert)
     */
    async loadLastProcessedWeekAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this.lastProcessedWeek = 0;
                return 0;
            }

            const classroom = await dataService.getClassroom(classroomId);
            if (classroom && classroom.lastProcessedWeek !== undefined) {
                this.lastProcessedWeek = classroom.lastProcessedWeek;
            } else {
                this.lastProcessedWeek = 0;
            }
            return this.lastProcessedWeek;
        } catch (e) {
            console.error('Feil ved lasting av lastProcessedWeek:', e);
            this.lastProcessedWeek = 0;
            return 0;
        }
    }

    /**
     * Last siste prosesserte uke (synkron - bruker cache)
     * @deprecated Bruk loadLastProcessedWeekAsync() i stedet
     */
    loadLastProcessedWeek() {
        return this.lastProcessedWeek;
    }

    /**
     * Lagre siste prosesserte uke til Firebase (klasserom-isolert)
     */
    async saveLastProcessedWeek(week) {
        this.lastProcessedWeek = week;
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (classroomId) {
                await dataService.updateClassroom(classroomId, { lastProcessedWeek: week });
            }
        } catch (e) {
            console.error('Feil ved lagring av lastProcessedWeek:', e);
        }
    }

    /**
     * Hent ukenummer fra dato
     */
    getWeekNumber(date = new Date()) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Sjekk om det er mandag
     */
    isMonday(date = new Date()) {
        return date.getDay() === 1;
    }

    /**
     * Sjekk om klokken er etter 08:00
     */
    isAfter8AM(date = new Date()) {
        return date.getHours() >= 8;
    }

    /**
     * Sjekk om ukentlig prosessering skal kjøres
     */
    shouldProcess() {
        const now = new Date();
        const currentWeek = this.getWeekNumber(now);
        
        // Kjør kun på mandager etter kl 08:00
        if (!this.isMonday(now) || !this.isAfter8AM(now)) {
            return false;
        }

        // Sjekk om vi allerede har prosessert denne uken
        if (currentWeek <= this.lastProcessedWeek) {
            return false;
        }

        return true;
    }

    /**
     * Kjør ukentlig prosessering
     */
    async processWeekly() {
        // eslint-disable-next-line no-undef
        if (typeof firebase !== 'undefined' && !firebase.auth().currentUser) {
            return { processed: false, reason: 'Not signed in' };
        }
        if (!this.shouldProcess()) {
            return { processed: false, reason: 'Not time yet' };
        }

        console.log('🗓️ Kjører ukentlig prosessering...');
        const results = {
            processed: true,
            timestamp: new Date().toISOString(),
            savings: null,
            funds: null,
            loans: null,
            taxStatements: false
        };

        try {
            // 1. Prosesser sparerenter
            results.savings = await savingsService.processWeeklySavingsInterest();
            console.log('💰 Sparerenter prosessert:', results.savings);

            // 2. Prosesser fondsavkastning
            results.funds = await savingsService.processWeeklyFundReturns();
            console.log('📈 Fondsavkastning prosessert:', results.funds);

            // 3. Prosesser låneavdrag
            results.loans = await loanService.processWeeklyPayments();
            console.log('🏦 Låneavdrag prosessert:', results.loans);

            // 4. Sjekk kvartalsvis skattemelding (hver 12. uke)
            await this.checkQuarterlyTaxStatements();

            // 5. Generer ukentlig rapport til lærer
            await this.generateWeeklyReport(results);
            console.log('📊 Ukentlig rapport generert');

            // 6. Send individuelle ukesrapporter til elever
            await this.generateStudentWeeklyReports();
            console.log('📊 Individuelle elevrapporter sendt');

            // 7. Send ukesrapporter til bedrifter
            await this.generateBusinessWeeklyReports();
            console.log('📊 Bedriftsrapporter sendt');

            // Oppdater siste prosesserte uke
            const currentWeek = this.getWeekNumber();
            await this.saveLastProcessedWeek(currentWeek);

            // Send event
            eventBus.emit('scheduler:weeklyProcessed', results);

            // Broadcast systemvarsel
            await notificationService.broadcastSystem(
                'Ukentlig oppdatering',
                'Renter, fondsavkastning og låneavdrag er prosessert.',
                '📅'
            );

            console.log('✅ Ukentlig prosessering fullført');
            return results;

        } catch (error) {
            console.error('❌ Feil ved ukentlig prosessering:', error);
            return {
                processed: false,
                error: error.message
            };
        }
    }

    /**
     * Manuell trigger av ukentlig prosessering (for lærer)
     */
    async forceProcess() {
        console.log('🔧 Manuell ukentlig prosessering...');

        const results = {
            processed: true,
            timestamp: new Date().toISOString(),
            savings: null,
            funds: null,
            loans: null,
            forced: true
        };

        try {
            results.savings = await savingsService.processWeeklySavingsInterest();
            results.funds = await savingsService.processWeeklyFundReturns();
            results.loans = await loanService.processWeeklyPayments();

            // Generer ukentlig rapport også ved manuell prosessering
            await this.generateWeeklyReport(results);

            eventBus.emit('scheduler:weeklyProcessed', results);

            return results;
        } catch (error) {
            console.error('Feil ved manuell prosessering:', error);
            throw error;
        }
    }

    /**
     * Månedlig prosessering (realistisk modus, 1. i måneden)
     * Identisk med ukentlig prosessering — renter/fond/lån behandles på periodeslutt uansett modus
     */
    async forceMonthlyProcess() {
        return this.forceProcess();
    }

    /**
     * Start periodisk sjekk. Polling stoppes automatisk på logout for å
     * unngå "permission-denied" mot strenge Firestore-rules.
     */
    start() {
        // Sjekk umiddelbart (er auth-gated internt)
        this.processWeekly();

        // Sjekk hver time
        this.checkInterval = setInterval(() => {
            this.processWeekly();
        }, 60 * 60 * 1000); // Hver time

        // Lytt på logout for å stoppe polling
        if (!this._eventListenersAttached) {
            eventBus.on(EVENTS.USER_LOGGED_OUT, () => this.stop());
            eventBus.on(EVENTS.USER_LOGGED_IN, () => {
                if (!this.checkInterval) this.start();
            });
            this._eventListenersAttached = true;
        }

        console.log('⏰ Scheduler startet');
    }

    /**
     * Stopp periodisk sjekk
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('⏹️ Scheduler stoppet');
    }

    /**
     * Hent status
     */
    getStatus() {
        const now = new Date();
        return {
            currentWeek: this.getWeekNumber(now),
            lastProcessedWeek: this.lastProcessedWeek,
            isMonday: this.isMonday(now),
            isAfter8AM: this.isAfter8AM(now),
            shouldProcess: this.shouldProcess(),
            isRunning: this.checkInterval !== null
        };
    }

    /**
     * Generer ukentlig økonomisk rapport til lærer
     */
    async generateWeeklyReport(processingResults) {
        console.log('📊 Genererer ukentlig rapport...');
        
        const settings = await dataService.getSettings();
        const currencySymbol = settings?.currencySymbol || 'KKr';
        const currentWeek = this.getWeekNumber();
        
        try {
            // Hent alle bedrifter
            const businesses = businessService.getAllBusinesses();
            
            // Hent alle brukere (for total pengemengde)
            const users = dataService.getUsersSync() || [];
            const students = users.filter(u => u.type === 'student');
            
            // Beregn statistikk
            const totalStudentBalance = students.reduce((sum, s) => sum + (s.balance || 0), 0);
            const totalBusinessBalance = businesses.reduce((sum, b) => sum + (b.balance || 0), 0);
            const totalEmployees = businesses.reduce((sum, b) => sum + (b.employees?.length || 0), 0);
            
            // Hent aktive lån
            const loans = loanService.getAllLoans();
            const activeLoans = loans.filter(l => l.status === 'active');
            const totalLoanDebt = activeLoans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0);
            
            // Hent skattekonto
            const taxAccount = taxService.getTaxAccountSync() || { balance: 0 };
            const taxBalance = taxAccount.balance || 0;
            
            // Bygg bedriftsliste
            const businessList = businesses.map(b => {
                const canPaySalaries = b.employees?.every(e => b.balance >= e.salary) ?? true;
                const totalSalaries = b.employees?.reduce((sum, e) => sum + e.salary, 0) || 0;
                return {
                    name: b.name,
                    emoji: b.emoji || '🏢',
                    balance: b.balance || 0,
                    employees: b.employees?.length || 0,
                    totalSalaries,
                    canPaySalaries,
                    warning: !canPaySalaries && totalSalaries > 0
                };
            }).sort((a, b) => b.balance - a.balance);
            
            // Formater bedriftsliste
            const businessListText = businessList.length > 0 
                ? businessList.map(b => {
                    const warningEmoji = b.warning ? ' ⚠️' : '';
                    return `• ${b.emoji} **${b.name}**: ${b.balance} ${currencySymbol}${warningEmoji}\n  └ ${b.employees} ansatte, lønn: ${b.totalSalaries} ${currencySymbol}/uke`;
                }).join('\n')
                : '_Ingen bedrifter registrert_';
            
            // Bygg rapport-melding
            const reportMessage = `## 📊 Ukentlig økonomisk rapport - Uke ${currentWeek}

### 💰 Pengemengde i omløp
| Kategori | Beløp |
|----------|-------|
| Elever (privat) | ${totalStudentBalance} ${currencySymbol} |
| Bedrifter | ${totalBusinessBalance} ${currencySymbol} |
| Skattekasse | ${taxBalance} ${currencySymbol} |
| **Total** | **${totalStudentBalance + totalBusinessBalance + taxBalance} ${currencySymbol}** |

### 🏦 Lån
- Aktive lån: ${activeLoans.length}
- Total utestående gjeld: ${totalLoanDebt} ${currencySymbol}

### 🏢 Bedrifter (${businesses.length})
${businessListText}

### 📈 Ukens prosessering
- Sparerenter utbetalt: ${processingResults?.savings?.processed || 0} konto(er)
- Fondsavkastning: ${processingResults?.funds?.processed || 0} fond
- Låneavdrag trukket: ${processingResults?.loans?.processed || 0} lån

---
*Rapporten er automatisk generert ${new Date().toLocaleDateString('nb-NO')} kl. ${new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}*`;

            // Opprett rapport-melding via Firebase
            const report = await dataService.createTeacherMessage({
                type: 'weekly_report',
                category: 'system',
                title: `📊 Ukentlig rapport - Uke ${currentWeek}`,
                message: reportMessage,
                weekNumber: currentWeek,
                data: {
                    totalStudentBalance,
                    totalBusinessBalance,
                    taxBalance,
                    activeLoans: activeLoans.length,
                    totalLoanDebt,
                    businesses: businessList
                }
            });

            console.log('✅ Ukentlig rapport generert og sendt til lærer');
            eventBus.emit('scheduler:weeklyReportGenerated', report);

            return report;
        } catch (error) {
            console.error('❌ Feil ved generering av ukentlig rapport:', error);
            return null;
        }
    }

    /**
     * Send individuell ukesrapport til hver elev
     */
    async generateStudentWeeklyReports() {
        console.log('📊 Genererer individuelle elevrapporter...');

        const settings = await dataService.getSettings();
        const currencySymbol = settings?.currencySymbol || 'KKr';
        const currentWeek = this.getWeekNumber();
        const classroomId = await dataService.getCurrentClassroomId();

        if (!classroomId) return;

        try {
            // Hent forrige ukes snapshot
            const lastSnapshot = await this.getLastWeeklySnapshot(classroomId);

            // Hent alle elever
            const users = dataService.getUsersSync() || [];
            const students = users
                .filter(u => u.type === 'student' && u.classroomId === classroomId)
                .map(s => ({ ...s, balance: s.balance || 0 }))
                .sort((a, b) => b.balance - a.balance);

            if (students.length === 0) return;

            // Beregn rangering
            const totalStudents = students.length;

            for (let i = 0; i < students.length; i++) {
                const student = students[i];
                const rank = i + 1;

                // Finn forrige ukes saldo
                const lastBalance = lastSnapshot?.students?.[student.id]?.balance || student.balance;
                const change = student.balance - lastBalance;
                const changePercent = lastBalance > 0 ? Math.round((change / lastBalance) * 100) : 0;

                // Beregn endring i rangering
                const lastRank = lastSnapshot?.students?.[student.id]?.rank || rank;
                const rankChange = lastRank - rank; // Positiv = bedre rangering

                // Bygg rapport-melding
                const changeEmoji = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
                const rankEmoji = rankChange > 0 ? '⬆️' : rankChange < 0 ? '⬇️' : '➡️';

                const reportMessage = `
📊 UKENTLIG FORMUESRAPPORT - UKE ${currentWeek}
═══════════════════════════════════════

💰 Din formue: ${student.balance} ${currencySymbol}
${changeEmoji} Endring: ${change >= 0 ? '+' : ''}${change} ${currencySymbol} (${changePercent >= 0 ? '+' : ''}${changePercent}%)

🏆 Din rangering: ${rank} av ${totalStudents} elever
${rankEmoji} Endring: ${rankChange > 0 ? '+' : ''}${rankChange} plasser

───────────────────────────────────────
Neste rapport kommer mandag kl 08:00
`.trim();

                // Send rapport til eleven
                await dataService.createInboxMessage({
                    recipientId: student.id,
                    title: `📊 Ukesrapport - Uke ${currentWeek}`,
                    message: reportMessage,
                    type: 'weekly_report',
                    fromName: '🏦 EconSim System',
                    fromType: 'system',
                    category: 'system'
                });
            }

            // Lagre snapshot for neste uke
            await this.saveWeeklySnapshot(classroomId, students, currentWeek);

            console.log(`✅ Sendt ukesrapport til ${students.length} elever`);
        } catch (error) {
            console.error('❌ Feil ved generering av elevrapporter:', error);
        }
    }

    /**
     * Send ukesrapport til hver bedrift
     */
    async generateBusinessWeeklyReports() {
        console.log('📊 Genererer bedriftsrapporter...');

        const settings = await dataService.getSettings();
        const currencySymbol = settings?.currencySymbol || 'KKr';
        const currentWeek = this.getWeekNumber();
        const classroomId = await dataService.getCurrentClassroomId();

        if (!classroomId) return;

        try {
            // Hent forrige ukes snapshot
            const lastSnapshot = await this.getLastWeeklySnapshot(classroomId);

            // Hent alle aktive bedrifter
            const businesses = businessService.getBusinessesByClassroom(classroomId)
                .filter(b => b.isActive !== false);

            for (const business of businesses) {
                // Finn forrige ukes saldo
                const lastBalance = lastSnapshot?.businesses?.[business.id]?.balance || business.balance || 0;
                const change = (business.balance || 0) - lastBalance;

                // Beregn lønnskostnader
                const employees = business.employees || [];
                const totalSalaries = employees.reduce((sum, e) => sum + (e.salary || 0), 0);

                const changeEmoji = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';

                const reportMessage = `
📊 UKENTLIG BEDRIFTSRAPPORT - UKE ${currentWeek}
═══════════════════════════════════════

🏢 ${business.emoji || '🏢'} ${business.name}

💰 Beholdning: ${business.balance || 0} ${currencySymbol}
${changeEmoji} Endring: ${change >= 0 ? '+' : ''}${change} ${currencySymbol}

👥 Ansatte: ${employees.length}
💸 Ukentlige lønnskostnader: ${totalSalaries} ${currencySymbol}

───────────────────────────────────────
Neste rapport kommer mandag kl 08:00
`.trim();

                // Send rapport til bedriften
                await dataService.createBusinessMessage({
                    businessId: business.id,
                    title: `📊 Ukesrapport - Uke ${currentWeek}`,
                    message: reportMessage,
                    type: 'weekly_report',
                    fromName: '🏦 EconSim System',
                    fromType: 'system',
                    category: 'system'
                });
            }

            console.log(`✅ Sendt ukesrapport til ${businesses.length} bedrifter`);
        } catch (error) {
            console.error('❌ Feil ved generering av bedriftsrapporter:', error);
        }
    }

    /**
     * Hent forrige ukes snapshot
     */
    async getLastWeeklySnapshot(classroomId) {
        try {
            const snapshots = await dataService.getClassroomData('weeklySnapshots');
            if (!snapshots || snapshots.length === 0) return null;

            // Sorter etter uke og returner nyeste
            snapshots.sort((a, b) => b.weekNumber - a.weekNumber);
            return snapshots[0];
        } catch (error) {
            console.warn('Kunne ikke hente forrige snapshot:', error);
            return null;
        }
    }

    /**
     * Lagre snapshot for denne uken
     */
    async saveWeeklySnapshot(classroomId, students, weekNumber) {
        try {
            const snapshot = {
                classroomId,
                weekNumber,
                createdAt: new Date().toISOString(),
                students: {},
                businesses: {}
            };

            // Lagre elev-data
            students.forEach((student, index) => {
                snapshot.students[student.id] = {
                    balance: student.balance || 0,
                    rank: index + 1
                };
            });

            // Lagre bedrifts-data
            const businesses = businessService.getBusinessesByClassroom(classroomId);
            businesses.forEach(b => {
                snapshot.businesses[b.id] = {
                    balance: b.balance || 0
                };
            });

            await dataService.saveClassroomData('weeklySnapshots', snapshot);
            console.log(`✅ Snapshot lagret for uke ${weekNumber}`);
        } catch (error) {
            console.warn('Kunne ikke lagre snapshot:', error);
        }
    }

    /**
     * Sjekk og generer kvartalsvis skattemelding (hver 12. uke)
     */
    async checkQuarterlyTaxStatements() {
        const currentWeek = this.getWeekNumber();

        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) return;

            const classroom = await dataService.getClassroom(classroomId);
            const lastQuarterWeek = classroom?.lastQuarterWeek || 0;

            // Sjekk om 12 uker har gått
            if (currentWeek - lastQuarterWeek >= 12 || lastQuarterWeek === 0) {
                await this.generateQuarterlyTaxStatements();
                await dataService.updateClassroom(classroomId, { lastQuarterWeek: currentWeek });
            }
        } catch (e) {
            console.error('Feil ved sjekk av kvartalsvise skattemeldinger:', e);
        }
    }

    /**
     * Generer skattemeldinger for alle elever
     */
    async generateQuarterlyTaxStatements() {
        console.log('📋 Genererer kvartalsvise skattemeldinger...');
        
        // Hent alle brukere (elever)
        const users = dataService.getUsersSync() || [];
        const students = users.filter(u => u.type === 'student');
        
        const quarterEndDate = new Date();
        const quarterStartDate = new Date();
        quarterStartDate.setDate(quarterStartDate.getDate() - 84); // 12 uker tilbake
        
        const periodString = `${quarterStartDate.toLocaleDateString('nb-NO')} - ${quarterEndDate.toLocaleDateString('nb-NO')}`;
        
        // Hent alle transaksjoner
        const allTransactions = await transactionService.getAllTransactions();
        
        // Hent skattekonto
        const taxAccount = taxService.getTaxAccountSync();
        
        for (const student of students) {
            // Filtrer transaksjoner for denne studenten
            const studentTransactions = allTransactions.filter(t => 
                (t.recipientId === student.id || t.senderId === student.id) &&
                new Date(t.createdAt) >= quarterStartDate &&
                new Date(t.createdAt) <= quarterEndDate
            );
            
            // Beregn inntekter fra lønn
            const incomeTransactions = studentTransactions.filter(t => 
                t.recipientId === student.id && 
                (t.message?.includes('Lønn') || t.message?.includes('lønn') || t.category === 'salary')
            );
            
            const incomes = [];
            let totalIncome = 0;
            
            // Grupper inntekter etter kilde
            const incomeBySource = {};
            incomeTransactions.forEach(t => {
                const source = t.message?.replace('Lønn for: ', '') || 'Annen inntekt';
                if (!incomeBySource[source]) {
                    incomeBySource[source] = 0;
                }
                incomeBySource[source] += t.amount;
                totalIncome += t.amount;
            });
            
            Object.entries(incomeBySource).forEach(([source, amount]) => {
                incomes.push({ source, amount });
            });
            
            // Hent skattebetaling fra taxService-transaksjoner
            const userTaxTransactions = taxAccount.transactions?.filter(t => 
                t.fromUserId === student.id &&
                new Date(t.date) >= quarterStartDate &&
                new Date(t.date) <= quarterEndDate
            ) || [];
            
            const totalTax = userTaxTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
            const effectiveRate = totalIncome > 0 ? Math.round((totalTax / totalIncome) * 100 * 10) / 10 : 0;
            
            // Opprett skattemelding via notificationService
            notificationService.create({
                userId: student.id,
                type: 'tax_statement',
                title: '📋 Kvartalsvis skattemelding',
                message: `Din skattemelding for perioden ${periodString} er klar.`,
                icon: '📋'
            });
        }
        
        console.log(`✅ Skattemeldinger generert for ${students.length} elever`);
        eventBus.emit('tax:statementsGenerated', { count: students.length });
    }

    /**
     * Nullstill scheduler (klasserom-isolert)
     */
    async reset() {
        this.lastProcessedWeek = 0;
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (classroomId) {
                await dataService.updateClassroom(classroomId, {
                    lastProcessedWeek: 0,
                    lastQuarterWeek: 0
                });
            }
        } catch (e) {
            console.error('Feil ved reset av scheduler:', e);
        }
    }

    /**
     * Tving omlasting av cache (for når klasserom endres)
     */
    refreshCache() {
        this.lastProcessedWeek = 0;
        this._initialized = false;
    }
}

export const schedulerService = new SchedulerService();

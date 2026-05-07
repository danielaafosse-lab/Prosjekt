/**
 * Business Service - Håndterer bedriftssystemet
 * 
 * Features:
 * - Opprett bedrifter med eiere
 * - Ansettelser med begrensning (balance/500)
 * - Lønn til ansatte
 * - Overføring mellom privatkontoer og bedriftskonto
 * - Selg eierandeler
 * 
 * VIKTIG: Bruker klasserom-isolert storage for multi-tenancy
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, BUSINESS_STATUS } from '../../../shared/config/config.js';
import { dataService } from '../../../shared/core/dataService.js';
import { authService } from '../../auth/index.js';
import { eventBus } from '../../../shared/core/eventBus.js';
import { classroomService } from '../../classroom/index.js';
import { languageService } from '../../i18n/index.js';

class BusinessService {
    constructor() {
        // Ikke last bedrifter i constructor - gjøres dynamisk per klasserom
        this._businessesCache = null;
        this._cacheClassroomId = null;
        this._ownershipOffersCache = [];
        this.nextAccountNumber = 501;
        this._initialized = false;
    }

    /**
     * Initialiser businessService - må kalles etter innlogging
     */
    async initialize() {
        try {
            await this.loadBusinessesAsync();
            await this.loadOwnershipOffersAsync();
            this._initialized = true;
            console.log('✅ BusinessService initialisert med', this._businessesCache?.length || 0, 'bedrifter');
        } catch (e) {
            console.warn('⚠️ BusinessService initialisering feilet:', e);
            this._businessesCache = [];
            this._ownershipOffersCache = [];
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
     * Last inn bedrifter asynkront fra Firebase
     */
    async loadBusinessesAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this._businessesCache = [];
                return [];
            }
            
            // Last fra Firebase
            if (dataService.getClassroomData) {
                const data = await dataService.getClassroomData(STORAGE_KEYS.BUSINESSES);
                this._businessesCache = data || [];
                this._cacheClassroomId = classroomId;
                this.nextAccountNumber = this.calculateNextAccountNumber();
                console.log('📦 Lastet', this._businessesCache.length, 'bedrifter fra Firebase');
                return this._businessesCache;
            }
            
            // Fallback - sett tom cache
            this._businessesCache = [];
            return [];
        } catch (e) {
            console.error('Feil ved lasting av bedrifter:', e);
            this._businessesCache = [];
            return [];
        }
    }

    /**
     * Last inn bedrifter fra lagring (klasserom-isolert) - SYNKRON versjon bruker cache
     */
    loadBusinesses() {
        // Returner cache hvis tilgjengelig
        if (this._businessesCache !== null) {
            return this._businessesCache;
        }
        
        // Synkron fallback - returnerer tom array (data lastes async)
        console.warn('⚠️ loadBusinesses() kalt før async init - returnerer tom array');
        return [];
    }

    /**
     * Hent businesses (med lazy loading)
     */
    get businesses() {
        return this.loadBusinesses();
    }

    /**
     * Lagre alle bedrifter til Firebase (brukes ved bulk-operasjoner)
     * @deprecated Bruk saveBusiness() for individuelle oppdateringer
     */
    async saveBusinesses() {
        const businesses = this._businessesCache || [];
        // Lagre hvert element individuelt til Firebase
        for (const business of businesses) {
            await dataService.saveClassroomItem(STORAGE_KEYS.BUSINESSES, business);
        }
    }

    /**
     * Lagre en enkelt bedrift til Firebase
     */
    async saveBusiness(business) {
        // Oppdater lokal cache
        const businesses = this.businesses;
        const index = businesses.findIndex(b => b.id === business.id);
        if (index !== -1) {
            businesses[index] = business;
        } else {
            businesses.push(business);
        }
        this._businessesCache = businesses;
        
        // Oppdater dataService cache
        dataService.updateBusinessesCache(businesses);
        
        // Lagre til Firebase
        await dataService.saveClassroomItem(STORAGE_KEYS.BUSINESSES, business);
    }

    /**
     * Slett en bedrift fra Firebase
     */
    async deleteBusiness(businessId) {
        // Oppdater cache
        this._businessesCache = this._businessesCache.filter(b => b.id !== businessId);
        // Oppdater dataService cache
        dataService.updateBusinessesCache(this._businessesCache);
        // Slett fra Firebase
        await dataService.deleteClassroomItem(STORAGE_KEYS.BUSINESSES, businessId);
    }

    /**
     * Beregn neste kontonummer (5XX for bedrifter)
     */
    calculateNextAccountNumber() {
        const businesses = this._businessesCache || [];
        if (businesses.length === 0) return 501;
        const maxNumber = Math.max(...businesses.map(b => parseInt(b.accountNumber) || 500));
        return maxNumber + 1;
    }

    /**
     * Hent bedriftsinnstillinger
     */
    async getSettings() {
        const settings = await dataService.getSettings();
        return settings.businesses || DEFAULT_SETTINGS.businesses || {
            enabled: false,
            startupCost: 500,
            employeeCostFactor: 500,
            requireApproval: true
        };
    }

    /**
     * Sjekk om bedriftssystemet er aktivert
     */
    async isEnabled() {
        const settings = await this.getSettings();
        return settings.enabled;
    }

    /**
     * Opprett ny bedrift med classroomId
     * @param {string} name - Bedriftsnavn
     * @param {string} founderId - Grunnlegger ID
     * @param {string} logo - Logo som data-URL eller emoji
     * @param {string} description - Beskrivelse
     */
    async createBusiness(name, founderId, logo = '', description = '') {
        const settings = await this.getSettings();
        
        if (!settings.enabled) {
            throw new Error(languageService.t('error.businessSystemNotEnabled'));
        }

        const founder = await dataService.getUser(founderId);
        if (!founder) {
            throw new Error(languageService.t('error.founderNotFound'));
        }

        if (founder.balance < settings.startupCost) {
            throw new Error(`Du trenger minst ${settings.startupCost} KKr for å starte en bedrift`);
        }

        // Hent classroomId fra grunnlegger
        const classroomId = founder.classroomId || this.getCurrentClassroomId();

        // Trekk startkapital fra grunnlegger
        await dataService.updateUserBalance(founderId, -settings.startupCost);
        await dataService.addTransaction(founderId, {
            type: 'expense',
            amount: settings.startupCost,
            description: `${languageService.t('transaction.equity')}: ${name}`,
            category: 'business_investment',
            fromName: founder.name,
            toName: name
        });

        const business = {
            id: `BIZ-${Date.now()}`,
            accountNumber: this.nextAccountNumber.toString(),
            name,
            logo: logo || '', // Kan være data-URL for bilde eller tom
            emoji: logo && !logo.startsWith('data:') ? logo : '🏢', // Bakoverkompatibilitet
            description,
            balance: settings.startupCost,
            classroomId: classroomId, // Viktig: Koble til klasserom
            owners: [{
                userId: founderId,
                percentage: 100,
                costBasis: settings.startupCost, // Viktig: Lagre kostpris for gevinstberegning
                joinedAt: new Date().toISOString()
            }],
            employees: [],
            jobs: [],
            transactions: [{
                id: Date.now().toString(),
                type: 'income',
                amount: settings.startupCost,
                fromUserId: founderId,
                description: languageService.t('transaction.equityFromFounder'),
                date: new Date().toISOString()
            }],
            status: settings.requireApproval ? BUSINESS_STATUS.PENDING : BUSINESS_STATUS.ACTIVE,
            createdAt: new Date().toISOString()
        };

        this._businessesCache.push(business);
        this.nextAccountNumber++;
        await this.saveBusiness(business);

        eventBus.emit('business:created', business);

        return business;
    }

    /**
     * Godkjenn en bedrift
     */
    async approveBusiness(businessId) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        business.status = BUSINESS_STATUS.ACTIVE;
        await this.saveBusiness(business);

        eventBus.emit('business:approved', business);
        return business;
    }

    /**
     * Avslå en bedrift
     */
    async rejectBusiness(businessId, reason = '') {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        business.status = BUSINESS_STATUS.REJECTED;
        business.rejectionReason = reason;
        
        // Refunder startkapitalen
        const settings = await this.getSettings();
        const founder = business.owners[0];
        if (founder) {
            dataService.updateUserBalance(founder.userId, settings.startupCost);
            dataService.addTransaction(founder.userId, {
                type: 'income',
                amount: settings.startupCost,
                description: `${languageService.t('transaction.refundedBusinessRejected')} - ${business.name}`,
                fromName: languageService.t('common.bank'),
                category: 'business_refund'
            });
        }

        await this.saveBusiness(business);
        eventBus.emit('business:rejected', business);
        return business;
    }

    /**
     * Beregn maks antall ansatte for en bedrift
     */
    calculateMaxEmployees(businessId) {
        const business = this.getBusinessById(businessId);
        if (!business) return 0;

        const settings = this.getSettings();
        return Math.floor(business.balance / settings.employeeCostFactor);
    }

    /**
     * Ansett en person i bedriften
     */
    async hireEmployee(businessId, userId, salary, title = 'Ansatt') {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));
        if (business.status !== BUSINESS_STATUS.ACTIVE) throw new Error(languageService.t('error.businessNotActive'));

        const user = dataService.getUserById(userId);
        if (!user) throw new Error(languageService.t('error.userNotFound'));

        // Sjekk om brukeren allerede er ansatt
        if (business.employees.some(e => e.userId === userId)) {
            throw new Error(languageService.t('error.alreadyEmployed'));
        }

        // Sjekk ansattbegrensning
        const maxEmployees = this.calculateMaxEmployees(businessId);
        if (business.employees.length >= maxEmployees) {
            throw new Error(`Bedriften kan maks ha ${maxEmployees} ansatte med nåværende saldo`);
        }

        business.employees.push({
            userId,
            title,
            salary,
            hiredAt: new Date().toISOString()
        });

        await this.saveBusiness(business);
        eventBus.emit('business:employeeHired', { business, userId, title, salary });

        return business;
    }

    /**
     * Si opp en ansatt
     */
    async fireEmployee(businessId, userId) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const empIndex = business.employees.findIndex(e => e.userId === userId);
        if (empIndex === -1) throw new Error(languageService.t('error.employeeNotFound'));

        const employee = business.employees[empIndex];
        business.employees.splice(empIndex, 1);
        await this.saveBusiness(business);

        eventBus.emit('business:employeeFired', { business, userId });
        return business;
    }

    /**
     * Utbetal lønn til alle ansatte
     */
    async payEmployees(businessId) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const results = [];
        let totalPaid = 0;

        for (const employee of business.employees) {
            if (business.balance >= employee.salary) {
                // Trekk fra bedriftens konto
                business.balance -= employee.salary;
                
                // Hent ansatt-info for korrekt navn
                const employeeUser = dataService.getUserById(employee.userId);
                const employeeName = employeeUser?.name || employee.title || languageService.t('common.unknown');
                
                // Betal til ansatt (med eventuell skattetrekk)
                const netSalary = employee.salary; // taxService håndterer skatt separat
                
                try {
                    dataService.updateUserBalance(employee.userId, netSalary);
                    dataService.addTransaction(employee.userId, {
                        type: 'income',
                        amount: netSalary,
                        description: `${languageService.t('transaction.salaryFrom')} ${business.name}`,
                        fromName: business.name,
                        toName: employeeName,
                        category: 'salary'
                    });
                } catch (err) {
                    console.error('Feil ved lønnsutbetaling til ansatt:', employee.userId, err);
                    results.push({
                        userId: employee.userId,
                        employeeName: employee.title,
                        amount: employee.salary,
                        success: false,
                        reason: err.message
                    });
                    continue;
                }

                business.transactions.push({
                    id: Date.now().toString() + employee.userId,
                    type: 'expense',
                    amount: employee.salary,
                    toUserId: employee.userId,
                    description: `${languageService.t('transaction.salaryTo')} ${employeeName}`,
                    date: new Date().toISOString()
                });

                totalPaid += employee.salary;
                results.push({
                    userId: employee.userId,
                    amount: employee.salary,
                    success: true
                });
            } else {
                results.push({
                    userId: employee.userId,
                    employeeName: employee.title,
                    amount: employee.salary,
                    success: false,
                    reason: 'Ikke nok midler'
                });
            }
        }

        await this.saveBusiness(business);
        eventBus.emit('business:salariesPaid', { business, totalPaid, results });
        
        // Send varsel til lærer hvis noen lønninger ikke kunne betales
        const failedPayments = results.filter(r => !r.success);
        if (failedPayments.length > 0) {
            this.sendSalaryFailureNotification(business, failedPayments);
        }

        return { totalPaid, results };
    }

    /**
     * Send varsel til lærer om at bedrift ikke kunne betale lønn
     */
    async sendSalaryFailureNotification(business, failedPayments) {
        const settings = await dataService.getSettings();
        const currencySymbol = settings?.currencySymbol || 'KKr';
        
        // Bygg liste over ansatte som ikke fikk lønn
        const failedList = failedPayments.map(f => 
            `• ${f.employeeName || 'Ansatt'}: ${f.amount} ${currencySymbol}`
        ).join('\n');
        
        const totalUnpaid = failedPayments.reduce((sum, f) => sum + f.amount, 0);
        const shortfall = totalUnpaid - business.balance;
        
        // Send til læreren via Firebase
        await dataService.createTeacherMessage({
            type: 'salary_failure',
            category: 'employees',
            title: `⚠️ Lønnsutbetaling feilet: ${business.name}`,
            message: `Bedriften "${business.name}" kunne ikke betale lønn til ${failedPayments.length} ansatt(e).

**Manglende utbetalinger:**
${failedList}

**Total ubetalt:** ${totalUnpaid} ${currencySymbol}
**Bedriftens saldo:** ${business.balance} ${currencySymbol}
**Mangler:** ${shortfall > 0 ? shortfall : 0} ${currencySymbol}

Bedriften trenger mer kapital for å kunne betale sine ansatte.`,
            businessId: business.id,
            businessName: business.name,
            failedPayments: failedPayments.length,
            totalUnpaid: totalUnpaid,
            businessBalance: business.balance
        });

        console.log(`⚠️ Lønnsvarsel sendt til lærer for bedrift: ${business.name}`);
    }

    /**
     * Overfør penger til/fra bedriften
     * Ved uttak utover innskudd betales utbytteskatt
     */
    async transfer(businessId, userId, amount, direction = 'to_business', description = '') {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const user = dataService.getUserById(userId);
        if (!user) throw new Error(languageService.t('error.userNotFound'));

        // Sjekk at brukeren er eier
        const ownerInfo = business.owners.find(o => o.userId === userId);
        if (!ownerInfo) {
            throw new Error(languageService.t('error.onlyOwnersCanTransfer'));
        }

        // Initialiser kapitalinnskudd-sporing hvis ikke finnes
        if (ownerInfo.capitalContributions === undefined) {
            ownerInfo.capitalContributions = 0;
        }

        if (direction === 'to_business') {
            if (user.balance < amount) throw new Error(languageService.t('error.insufficientPersonalFunds'));

            // Oppdater kapitalinnskudd
            ownerInfo.capitalContributions += amount;

            await dataService.updateUserBalance(userId, -amount);
            await dataService.addTransaction(userId, {
                type: 'expense',
                amount,
                description: description || `${languageService.t('transaction.transferTo')} ${business.name}`,
                category: 'business_transfer'
            });

            business.balance += amount;
            business.transactions.push({
                id: Date.now().toString(),
                type: 'income',
                amount,
                fromUserId: userId,
                description: description || languageService.t('transaction.capitalDeposit'),
                date: new Date().toISOString()
            });
        } else {
            if (business.balance < amount) throw new Error(languageService.t('error.insufficientBusinessFunds'));

            // Beregn skatt på uttak utover innskudd (utbytte) - kun hvis skatt er aktivert
            let taxAmount = 0;
            let netAmount = amount;
            let taxableAmount = 0;
            
            const settings = await dataService.getSettings();
            const taxEnabled = settings.tax?.enabled || false;
            
            // Hvis uttaket overstiger kapitalinnskuddet, er overskuddet utbytte
            if (taxEnabled && amount > ownerInfo.capitalContributions) {
                taxableAmount = amount - ownerInfo.capitalContributions;
                const taxRate = (settings.tax?.dividendTaxRate || 0) / 100;
                taxAmount = Math.floor(taxableAmount * taxRate);
                netAmount = amount - taxAmount;
                
                // Nullstill kapitalinnskudd (alt er tatt ut + utbytte)
                ownerInfo.capitalContributions = 0;
            } else if (amount <= ownerInfo.capitalContributions) {
                // Reduser kapitalinnskudd
                ownerInfo.capitalContributions -= amount;
            } else {
                // Skatt ikke aktivert - bare oppdater kapitalinnskudd
                ownerInfo.capitalContributions = Math.max(0, ownerInfo.capitalContributions - amount);
            }

            business.balance -= amount;
            business.transactions.push({
                id: Date.now().toString(),
                type: 'expense',
                amount,
                toUserId: userId,
                description: description || languageService.t('transaction.withdrawal') + (taxAmount > 0 ? ` (${languageService.t('transaction.dividendTax')}: ${taxAmount})` : ''),
                date: new Date().toISOString()
            });

            // Gi brukeren netto beløp
            await dataService.updateUserBalance(userId, netAmount);
            await dataService.addTransaction(userId, {
                type: 'income',
                amount: netAmount,
                description: description || `${languageService.t('transaction.withdrawalFrom')} ${business.name}` + (taxAmount > 0 ? ` (${languageService.t('transaction.after')} ${taxAmount} ${languageService.t('transaction.in')} ${languageService.t('transaction.dividendTax')})` : ''),
                category: 'business_transfer'
            });

            // Betal skatt til skattekassen (kun hvis skatt er aktivert og beløp > 0)
            if (taxEnabled && taxAmount > 0) {
                const classroomId = user.classroomId;
                const taxAccount = await dataService.getUserByAccountNumber('001', classroomId);
                if (taxAccount) {
                    await dataService.updateUserBalance(taxAccount.id, taxAmount);
                    await dataService.addTransaction(taxAccount.id, {
                        type: 'income',
                        amount: taxAmount,
                        description: `${languageService.t('transaction.dividendTaxFrom')} ${user.name} (${business.name})`,
                        category: 'dividend_tax',
                        fromUserId: userId
                    });
                }
            }

            await this.saveBusiness(business);
            eventBus.emit('business:transfer', { business, userId, amount, direction, taxAmount, netAmount });

            return { business, taxAmount, netAmount, taxableAmount };
        }

        await this.saveBusiness(business);
        eventBus.emit('business:transfer', { business, userId, amount, direction });

        return business;
    }

    /**
     * Selg eierandel
     */
    async sellOwnership(businessId, sellerId, buyerId, percentage, price) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const sellerOwner = business.owners.find(o => o.userId === sellerId);
        if (!sellerOwner) throw new Error(languageService.t('error.sellerNotOwner'));

        if (percentage > sellerOwner.percentage) {
            throw new Error(`Du kan maks selge ${sellerOwner.percentage}%`);
        }

        const buyer = dataService.getUserById(buyerId);
        if (!buyer) throw new Error(languageService.t('error.buyerNotFound'));
        
        const seller = dataService.getUserById(sellerId);

        if (buyer.balance < price) {
            throw new Error(languageService.t('error.buyerInsufficientFunds'));
        }

        // Overfør penger
        dataService.updateUserBalance(buyerId, -price);
        dataService.addTransaction(buyerId, {
            type: 'expense',
            amount: price,
            description: `${languageService.t('transaction.purchaseOfShareIn')} ${percentage}% ${languageService.t('transaction.shareIn')} ${business.name}`,
            category: 'business_ownership',
            fromName: buyer.name,
            toName: seller?.name || 'Ukjent'
        });

        // Pengene går til bedriften (ikke selger)
        business.balance += price;
        business.transactions.push({
            id: Date.now().toString(),
            type: 'income',
            amount: price,
            fromUserId: buyerId,
            description: `${languageService.t('transaction.saleOfShare')} ${percentage}% ${languageService.t('transaction.ownership')}`,
            date: new Date().toISOString()
        });

        // Oppdater eierskap
        sellerOwner.percentage -= percentage;
        if (sellerOwner.percentage <= 0) {
            business.owners = business.owners.filter(o => o.userId !== sellerId);
        }

        const existingBuyer = business.owners.find(o => o.userId === buyerId);
        if (existingBuyer) {
            existingBuyer.percentage += percentage;
        } else {
            business.owners.push({
                userId: buyerId,
                percentage,
                joinedAt: new Date().toISOString()
            });
        }

        await this.saveBusiness(business);
        eventBus.emit('business:ownershipSold', { 
            business, sellerId, buyerId, percentage, price 
        });

        return business;
    }

    /**
     * Legg til en jobb i bedriften
     */
    async addJob(businessId, jobData) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const job = {
            id: `JOB-${Date.now()}`,
            ...jobData,
            businessId,
            createdAt: new Date().toISOString()
        };

        business.jobs.push(job);
        await this.saveBusiness(business);

        eventBus.emit('business:jobAdded', { business, job });
        return job;
    }

    /**
     * Fjern en jobb fra bedriften
     */
    async removeJob(businessId, jobId) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        business.jobs = business.jobs.filter(j => j.id !== jobId);
        await this.saveBusiness(business);

        return business;
    }

    /**
     * Hent bedrift etter ID (filtrer på classroom)
     */
    getBusinessById(businessId) {
        const classroomId = this.getCurrentClassroomId();
        return this.businesses.find(b => 
            b.id === businessId && 
            (!classroomId || b.classroomId === classroomId)
        );
    }

    /**
     * Hent bedrift etter kontonummer (filtrer på classroom)
     */
    getBusinessByAccountNumber(accountNumber) {
        const classroomId = this.getCurrentClassroomId();
        return this.businesses.find(b => 
            b.accountNumber === accountNumber &&
            (!classroomId || b.classroomId === classroomId)
        );
    }

    /**
     * Hent alle bedrifter (kun i nåværende classroom)
     */
    getAllBusinesses() {
        const classroomId = this.getCurrentClassroomId();
        if (!classroomId) return [...this.businesses];
        return this.businesses.filter(b => b.classroomId === classroomId);
    }

    /**
     * Hent alle bedrifter i et spesifikt klasserom
     */
    getBusinessesByClassroom(classroomId) {
        if (!classroomId) return [];
        return this.businesses.filter(b => 
            b.classroomId === classroomId && 
            b.status === BUSINESS_STATUS.ACTIVE
        );
    }

    /**
     * Hent aktive bedrifter (kun i nåværende classroom)
     */
    getActiveBusinesses() {
        const classroomId = this.getCurrentClassroomId();
        return this.businesses.filter(b => 
            b.status === BUSINESS_STATUS.ACTIVE &&
            (!classroomId || b.classroomId === classroomId)
        );
    }

    /**
     * Hent bedrifter som venter på godkjenning (kun i nåværende classroom)
     */
    getPendingBusinesses() {
        const classroomId = this.getCurrentClassroomId();
        return this.businesses.filter(b => 
            b.status === BUSINESS_STATUS.PENDING &&
            (!classroomId || b.classroomId === classroomId)
        );
    }

    /**
     * Hent bedrifter der brukeren er eier (kun i nåværende classroom)
     */
    getBusinessesByOwner(userId) {
        const classroomId = this.getCurrentClassroomId();
        return this.businesses.filter(b => 
            b.owners.some(o => o.userId === userId) && 
            b.status !== BUSINESS_STATUS.REJECTED &&
            (!classroomId || b.classroomId === classroomId)
        );
    }

    /**
     * Hent bedrifter der brukeren er ansatt (kun i nåværende classroom)
     */
    getBusinessesByEmployee(userId) {
        const classroomId = this.getCurrentClassroomId();
        return this.businesses.filter(b => 
            b.employees.some(e => e.userId === userId) &&
            b.status === BUSINESS_STATUS.ACTIVE &&
            (!classroomId || b.classroomId === classroomId)
        );
    }

    /**
     * Sjekk om bruker er eier av en bedrift
     */
    isOwner(businessId, userId) {
        const business = this.getBusinessById(businessId);
        return business?.owners.some(o => o.userId === userId);
    }

    /**
     * Sjekk om bruker er ansatt i en bedrift
     */
    isEmployee(businessId, userId) {
        const business = this.getBusinessById(businessId);
        return business?.employees.some(e => e.userId === userId);
    }

    /**
     * Hent brukerens ansettelsesinfo (kun i nåværende classroom)
     */
    getUserEmploymentInfo(userId) {
        const employments = [];
        const classroomId = this.getCurrentClassroomId();
        
        for (const business of this.businesses) {
            if (business.status !== BUSINESS_STATUS.ACTIVE) continue;
            // Filtrer på classroom
            if (classroomId && business.classroomId !== classroomId) continue;

            const owner = business.owners.find(o => o.userId === userId);
            if (owner) {
                employments.push({
                    businessId: business.id,
                    businessName: business.name,
                    type: 'owner',
                    percentage: owner.percentage
                });
            }

            const employee = business.employees.find(e => e.userId === userId);
            if (employee) {
                employments.push({
                    businessId: business.id,
                    businessName: business.name,
                    type: 'employee',
                    title: employee.title,
                    salary: employee.salary
                });
            }
        }

        return employments;
    }

    // ==================== SALGSTILBUD SYSTEM ====================

    /**
     * Last salgstilbud asynkront fra Firebase
     */
    async loadOwnershipOffersAsync() {
        try {
            const classroomId = await dataService.getCurrentClassroomId();
            if (!classroomId) {
                this._ownershipOffersCache = [];
                return [];
            }
            
            if (dataService.getClassroomData) {
                const data = await dataService.getClassroomData(STORAGE_KEYS.OWNERSHIP_OFFERS);
                this._ownershipOffersCache = data || [];
                return this._ownershipOffersCache;
            }
            
            this._ownershipOffersCache = [];
            return [];
        } catch (e) {
            console.error('Feil ved lasting av ownership offers:', e);
            this._ownershipOffersCache = [];
            return [];
        }
    }

    /**
     * Last salgstilbud fra cache (synkron)
     */
    loadOwnershipOffers() {
        // Returner cache - alltid et array
        return this._ownershipOffersCache || [];
    }

    /**
     * Lagre salgstilbud (klasserom-isolert)
     */
    async saveOwnershipOffers(offers) {
        this._ownershipOffersCache = offers;
        // Lagre hvert tilbud individuelt til Firebase
        for (const offer of offers) {
            await dataService.saveClassroomItem(STORAGE_KEYS.OWNERSHIP_OFFERS, offer);
        }
    }

    /**
     * Opprett salgstilbud for eierandel
     * Pengene går til selger (minus skatt på gevinst)
     */
    async createOwnershipOffer(businessId, sellerId, buyerAccountNumber, percentage, price) {
        const business = this.getBusinessById(businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const sellerOwner = business.owners.find(o => o.userId === sellerId);
        if (!sellerOwner) throw new Error(languageService.t('error.notOwnerOfBusiness'));

        if (percentage > sellerOwner.percentage) {
            throw new Error(`Du kan maks selge ${sellerOwner.percentage}%`);
        }

        if (percentage <= 0) {
            throw new Error(languageService.t('error.percentMustBePositive'));
        }

        if (price <= 0) {
            throw new Error(languageService.t('error.priceMustBePositive'));
        }

        // Finn kjøper basert på kontonummer (må være i samme klasserom)
        const classroomId = this.getCurrentClassroomId();
        const users = dataService.getUsersSync() || [];
        const buyer = users.find(u =>
            u.accountNumber === buyerAccountNumber &&
            u.classroomId === classroomId &&
            u.type === 'student'
        );

        if (!buyer) {
            throw new Error(languageService.t('error.buyerNotInClassroom'));
        }

        if (buyer.id === sellerId) {
            throw new Error(languageService.t('error.cannotSellToYourself'));
        }

        // Beregn selgers kostpris for denne andelen
        const sellerCostBasis = this.getOwnerCostBasis(businessId, sellerId);
        const percentageSold = percentage / 100;
        const costBasisForSale = sellerCostBasis * percentageSold;

        const offers = this.loadOwnershipOffers();
        
        const offer = {
            id: `OFFER-${Date.now()}`,
            businessId,
            businessName: business.name,
            sellerId,
            buyerId: buyer.id,
            buyerName: buyer.name,
            percentage,
            price,
            costBasis: costBasisForSale, // For skatteberegning
            classroomId,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        offers.push(offer);
        await this.saveOwnershipOffers(offers);

        eventBus.emit('business:offerCreated', offer);
        return offer;
    }

    /**
     * Hent kostpris for en eiers investering i bedriften
     */
    getOwnerCostBasis(businessId, ownerId) {
        const business = this.getBusinessById(businessId);
        if (!business) return 0;

        const owner = business.owners.find(o => o.userId === ownerId);
        if (!owner) return 0;

        // Kostpris er lagret på eieren, eller beregnes fra opprinnelig investering
        return owner.costBasis || 0;
    }

    /**
     * Hent ventende tilbud for en kjøper
     */
    getPendingOffersForBuyer(buyerId) {
        const offers = this.loadOwnershipOffers();
        const classroomId = this.getCurrentClassroomId();
        return offers.filter(o => 
            o.buyerId === buyerId && 
            o.status === 'pending' &&
            o.classroomId === classroomId
        );
    }

    /**
     * Hent tilbud sendt av en selger
     */
    getOffersBySeller(sellerId) {
        const offers = this.loadOwnershipOffers();
        const classroomId = this.getCurrentClassroomId();
        return offers.filter(o => 
            o.sellerId === sellerId && 
            o.classroomId === classroomId
        );
    }

    /**
     * Godkjenn salgstilbud
     * Beregner skatt på gevinst (pris - kostpris)
     */
    async acceptOwnershipOffer(offerId) {
        const offers = this.loadOwnershipOffers();
        const offerIndex = offers.findIndex(o => o.id === offerId);
        
        if (offerIndex === -1) throw new Error(languageService.t('error.offerNotFound'));
        
        const offer = offers[offerIndex];
        if (offer.status !== 'pending') throw new Error(languageService.t('error.offerNoLongerActive'));

        const business = this.getBusinessById(offer.businessId);
        if (!business) throw new Error(languageService.t('error.businessNotFound'));

        const buyer = dataService.getUserById(offer.buyerId);
        if (!buyer) throw new Error(languageService.t('error.buyerNotFound'));
        
        const seller = dataService.getUserById(offer.sellerId);

        if (buyer.balance < offer.price) {
            throw new Error(languageService.t('error.insufficientFundsForShare'));
        }

        const sellerOwner = business.owners.find(o => o.userId === offer.sellerId);
        if (!sellerOwner || sellerOwner.percentage < offer.percentage) {
            throw new Error(languageService.t('error.sellerNoLongerOwnsShare'));
        }

        // Beregn skatt på gevinst (kun hvis skatt er aktivert)
        const settings = await dataService.getSettings();
        let taxAmount = 0;
        let netToSeller = offer.price;
        
        if (settings.tax?.enabled) {
            const gain = Math.max(0, offer.price - (offer.costBasis || 0));
            const taxRate = settings.tax?.dividendTaxRate || 22; // Samme sats som utbytte
            taxAmount = Math.round((gain * taxRate) / 100);
            netToSeller = offer.price - taxAmount;
        }

        // Trekk penger fra kjøper
        dataService.updateUserBalance(offer.buyerId, -offer.price);
        dataService.addTransaction(offer.buyerId, {
            type: 'expense',
            amount: offer.price,
            description: `${languageService.t('transaction.purchaseOfShareIn')} ${offer.percentage}% ${languageService.t('transaction.shareIn')} ${business.name}`,
            category: 'business_ownership',
            fromName: buyer.name,
            toName: seller?.name || 'Ukjent'
        });

        // Gi penger til selger (etter skatt)
        dataService.updateUserBalance(offer.sellerId, netToSeller);
        dataService.addTransaction(offer.sellerId, {
            type: 'income',
            amount: netToSeller,
            description: `${languageService.t('transaction.saleOfShare')} ${offer.percentage}% ${languageService.t('transaction.shareIn')} ${business.name}` + 
                (taxAmount > 0 ? ` (${languageService.t('tax.tax')}: ${taxAmount})` : ''),
            category: 'business_ownership',
            fromName: buyer.name,
            toName: seller?.name || 'Ukjent'
        });

        // Betal skatt til skattekassen via Firebase
        if (taxAmount > 0) {
            const classroomId = offer.classroomId;
            await dataService.addToTaxAccount(classroomId, taxAmount, seller.name, `Kapitalgevinstskatt fra salg av eierandel i ${business.name}`);
        }

        // Oppdater eierskap
        sellerOwner.percentage -= offer.percentage;
        if (sellerOwner.percentage <= 0) {
            business.owners = business.owners.filter(o => o.userId !== offer.sellerId);
        }

        // Oppdater eller legg til kjøper
        const existingBuyer = business.owners.find(o => o.userId === offer.buyerId);
        if (existingBuyer) {
            existingBuyer.percentage += offer.percentage;
            existingBuyer.costBasis = (existingBuyer.costBasis || 0) + offer.price;
        } else {
            business.owners.push({
                userId: offer.buyerId,
                percentage: offer.percentage,
                costBasis: offer.price, // Kjøpers kostpris = kjøpspris
                joinedAt: new Date().toISOString()
            });
        }

        // Lagre transaksjon på bedriften
        business.transactions.push({
            id: Date.now().toString(),
            type: 'ownership_transfer',
            fromUserId: offer.sellerId,
            toUserId: offer.buyerId,
            percentage: offer.percentage,
            price: offer.price,
            taxPaid: taxAmount,
            date: new Date().toISOString()
        });

        // Oppdater tilbudsstatus
        offer.status = 'accepted';
        offer.acceptedAt = new Date().toISOString();
        offer.taxPaid = taxAmount;
        
        await this.saveBusiness(business);
        await this.saveOwnershipOffers(offers);

        eventBus.emit('business:offerAccepted', { offer, taxPaid: taxAmount });
        return { offer, taxPaid: taxAmount, netToSeller };
    }

    /**
     * Avslå salgstilbud
     */
    async rejectOwnershipOffer(offerId) {
        const offers = this.loadOwnershipOffers();
        const offerIndex = offers.findIndex(o => o.id === offerId);
        
        if (offerIndex === -1) throw new Error(languageService.t('error.offerNotFound'));
        
        const offer = offers[offerIndex];
        if (offer.status !== 'pending') throw new Error(languageService.t('error.offerNoLongerActive'));

        offer.status = 'rejected';
        offer.rejectedAt = new Date().toISOString();
        
        await this.saveOwnershipOffers(offers);
        eventBus.emit('business:offerRejected', offer);
        
        return offer;
    }

    /**
     * Kanseller salgstilbud (av selger)
     */
    async cancelOwnershipOffer(offerId, userId) {
        const offers = this.loadOwnershipOffers();
        const offerIndex = offers.findIndex(o => o.id === offerId);
        
        if (offerIndex === -1) throw new Error(languageService.t('error.offerNotFound'));
        
        const offer = offers[offerIndex];
        if (offer.sellerId !== userId) throw new Error(languageService.t('error.cannotCancelOthersOffer'));
        if (offer.status !== 'pending') throw new Error(languageService.t('error.offerNoLongerActive'));

        offer.status = 'cancelled';
        offer.cancelledAt = new Date().toISOString();
        
        await this.saveOwnershipOffers(offers);
        eventBus.emit('business:offerCancelled', offer);
        
        return offer;
    }

    /**
     * Nullstill alle bedrifter
     */
    async reset() {
        this._businessesCache = [];
        this._cacheClassroomId = await dataService.getCurrentClassroomId();
        this.nextAccountNumber = 501;
        await this.saveBusinesses();
        await this.saveOwnershipOffers([]); // Nullstill også tilbud
    }

    /**
     * Hent alle bedrifter for statistikk
     */
    async getBusinesses() {
        return this.businesses;
    }

    /**
     * Tvunget refresh av cache (f.eks. ved bytte av klasserom)
     */
    refreshCache() {
        this._businessesCache = null;
        this._cacheClassroomId = null;
    }
}

export const businessService = new BusinessService();

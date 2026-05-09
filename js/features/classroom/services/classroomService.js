/**
 * Classroom Service - Håndterer klasserom (multi-tenancy)
 * 
 * Hver lærer har sitt eget klasserom med isolert økonomi.
 * Elever tilhører ett klasserom og kan ikke interagere med andre klasserom.
 * 
 * Kontonummerstruktur per klasserom:
 * - 000: Sentralbank (utømmelig)
 * - 001: Skattekasse
 * - 101-199: Elever (maks 99)
 * - 201-299: Sparekontoer (følger elevnummer)
 * - 301-399: Fondskontoer (følger elevnummer)
 * - 501-999: Bedrifter (maks 499)
 */

import { STORAGE_KEYS, APP_CONFIG, SUPERADMIN, DEMO_CLASSROOM, DEMO_USERS } from '../../../shared/config/config.js';
import { hashPassword } from '../../../shared/utils/helpers.js';
import { languageService } from '../../i18n/index.js';
import { dataService } from '../../../shared/core/dataService.js';

class ClassroomService {
    constructor() {
        this.classrooms = this.loadClassrooms();
        this.centralBanks = this.loadCentralBanks();
        this._firebaseClassrooms = null; // Cache for Firebase classrooms
    }

    // ==================== LOADING ====================

    loadClassrooms() {
        const data = localStorage.getItem(STORAGE_KEYS.CLASSROOMS);
        return data ? JSON.parse(data) : [];
    }

    loadCentralBanks() {
        const data = localStorage.getItem(STORAGE_KEYS.CENTRAL_BANK);
        return data ? JSON.parse(data) : {};
    }

    /**
     * Lagre classrooms synkront til localStorage og async til Firebase
     * Returnerer et Promise som kan avventes der det er mulig
     */
    saveClassrooms() {
        // Lagre til localStorage for bakoverkompatibilitet (sync)
        localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(this.classrooms));
        
        // Oppdater cache
        this._firebaseClassrooms = [...this.classrooms];
        
        // Lagre til Firebase asynkront (fire-and-forget for sync contexts)
        return this._saveClassroomsToFirebase();
    }

    async _saveClassroomsToFirebase() {
        for (const classroom of this.classrooms) {
            try {
                await dataService.updateClassroom(classroom.id, classroom);
            } catch (error) {
                // Hvis oppdatering feiler, prøv å opprette
                try {
                    await dataService.createClassroom(classroom);
                } catch (createError) {
                    console.error('Kunne ikke lagre classroom til Firebase:', classroom.id, createError);
                }
            }
        }
    }

    /**
     * Lagre centralBanks synkront til localStorage og async til Firebase
     */
    saveCentralBanks() {
        // Lagre til localStorage for bakoverkompatibilitet (sync)
        localStorage.setItem(STORAGE_KEYS.CENTRAL_BANK, JSON.stringify(this.centralBanks));
        
        // Lagre til Firebase asynkront (fire-and-forget for sync contexts)
        return this._saveCentralBanksToFirebase();
    }

    async _saveCentralBanksToFirebase() {
        // CentralBanks lagres som del av classroom i Firebase
        for (const classroomId of Object.keys(this.centralBanks)) {
            try {
                await dataService.updateClassroom(classroomId, {
                    centralBank: this.centralBanks[classroomId]
                });
            } catch (error) {
                console.error('Kunne ikke lagre centralBank til Firebase:', classroomId, error);
            }
        }
    }

    // ==================== INITIALIZATION ====================

    async initialize() {
        // Last Firebase classrooms hvis tilgjengelig
        try {
            if (dataService.getClassrooms) {
                this._firebaseClassrooms = await dataService.getClassrooms();
                console.log('📚 Lastet klasserom fra Firebase:', this._firebaseClassrooms?.length || 0);
            }
        } catch (e) {
            console.warn('Kunne ikke laste Firebase classrooms:', e);
        }
        
        // Sjekk om superadmin finnes
        const users = this.getUsers();
        const superadminExists = users.some(u => u.type === 'superadmin');
        
        if (!superadminExists) {
            // Superadmin opprettes nå serverside av migrateAuthSchema Cloud Function
            // (i Firestore: users/superadmin med korrekt passwordHash). Klient-fallback
            // beholdes ikke — forsøker man dette uten migrering vil det feile på rules.
            console.log('🔑 Superadmin mangler — kjør migrateAuthSchema Cloud Function');
        }

        // Opprett demo klasserom hvis ingen finnes
        if (this.classrooms.length === 0) {
            console.log('📚 Oppretter demo klasserom...');
            await this.createDemoClassroom();
        }

        console.log(`✅ ClassroomService initialisert med ${this.classrooms.length} klasserom`);
    }

    async createDemoClassroom() {
        const users = this.getUsers();
        
        // Finn eller opprett demo lærer
        let demoTeacher = users.find(u => u.id === 't1');
        if (!demoTeacher) {
            const hashedPassword = await hashPassword('passord');
            demoTeacher = {
                id: 't1',
                username: 'laerer',
                passwordHash: hashedPassword,
                name: 'Demo Lærer',
                type: 'teacher',
                classroomId: 'demo-classroom',
                locked: false,
                createdAt: new Date().toISOString()
            };
            users.push(demoTeacher);
        } else {
            demoTeacher.classroomId = 'demo-classroom';
        }

        // Opprett klasserom
        const classroom = {
            id: 'demo-classroom',
            teacherId: 't1',
            className: '7A Demo',
            currencyName: 'KlasseKrone',
            currencySymbol: 'KKr',
            startingBalance: 1000,
            nextStudentNumber: 101,
            nextBusinessNumber: 501,
            createdAt: new Date().toISOString(),
            settings: { ...APP_CONFIG.defaults, className: '7A Demo' }
        };
        this.classrooms.push(classroom);

        // Opprett sentralbank for klasserommet
        this.centralBanks[classroom.id] = {
            accountNumber: '000',
            transactions: [],
            statistics: {
                totalSalariesPaid: 0,
                totalLoansGiven: 0,
                totalLoanInterestEarned: 0,
                totalPaymentsReceived: 0
            }
        };

        // Opprett sentralbank og skattekasse som bruker-kontoer for demo
        const centralBankUser = {
            id: `bank-${classroom.id}`,
            username: `sentralbank-${classroom.id}`,
            name: 'Sentralbanken',
            type: 'bank',
            subType: 'centralbank',
            classroomId: classroom.id,
            accountNumber: '000',
            balance: Infinity,
            createdAt: new Date().toISOString()
        };
        users.push(centralBankUser);

        const taxAccountUser = {
            id: `tax-${classroom.id}`,
            username: `skattekasse-${classroom.id}`,
            name: 'Skattekassen',
            type: 'bank',
            subType: 'taxaccount',
            classroomId: classroom.id,
            accountNumber: '001',
            balance: 0,
            createdAt: new Date().toISOString()
        };
        users.push(taxAccountUser);

        // Opprett demo elever
        const demoStudents = [
            { name: 'Kari Nordmann', username: 'kari123', password: 'passord123' },
            { name: 'Ola Hansen', username: 'ola456', password: 'passord456' },
            { name: 'Emma Larsen', username: 'emma789', password: 'passord789' }
        ];

        for (const studentData of demoStudents) {
            const hashedPassword = await hashPassword(studentData.password);
            const accountNumber = classroom.nextStudentNumber.toString();
            
            const student = {
                id: `s${classroom.nextStudentNumber - 100}`,
                username: studentData.username,
                passwordHash: hashedPassword,
                name: studentData.name,
                type: 'student',
                classroomId: classroom.id,
                accountNumber: accountNumber,
                balance: classroom.startingBalance,
                locked: false,
                createdAt: new Date().toISOString()
            };
            
            users.push(student);
            classroom.nextStudentNumber++;
        }

        await this.saveUsers(users);
        await this.saveClassrooms();
        await this.saveCentralBanks();
    }

    // ==================== CLASSROOM OPERATIONS ====================

    /**
     * Opprett nytt klasserom for lærer
     */
    async createClassroom(teacherId, className, settings = {}) {
        const classroomId = `classroom-${Date.now()}`;
        
        const classroom = {
            id: classroomId,
            teacherId,
            className,
            currencyName: settings.currencyName || APP_CONFIG.defaults.currencyName,
            currencySymbol: settings.currencySymbol || APP_CONFIG.defaults.currencySymbol,
            startingBalance: settings.startingBalance || APP_CONFIG.defaults.startingBalance,
            nextStudentNumber: 101,
            nextBusinessNumber: 501,
            createdAt: new Date().toISOString(),
            settings: { ...APP_CONFIG.defaults, ...settings, className }
        };

        this.classrooms.push(classroom);

        // Opprett sentralbank og skattekasse for klasserommet
        this.centralBanks[classroomId] = {
            accountNumber: '000',
            transactions: [],
            statistics: {
                totalSalariesPaid: 0,
                totalLoansGiven: 0,
                totalLoanInterestEarned: 0,
                totalPaymentsReceived: 0
            }
        };

        // Opprett sentralbank og skattekasse som bruker-kontoer
        const users = this.getUsers();
        
        // Sentralbank (konto 000) - utømmelig kilde
        const centralBankUser = {
            id: `bank-${classroomId}`,
            username: `sentralbank-${classroomId}`,
            name: 'Sentralbanken',
            type: 'bank',
            subType: 'centralbank',
            classroomId: classroomId,
            accountNumber: '000',
            balance: Infinity, // Utømmelig
            createdAt: new Date().toISOString()
        };
        users.push(centralBankUser);

        // Skattekasse (konto 001) - samler inn skatt
        const taxAccountUser = {
            id: `tax-${classroomId}`,
            username: `skattekasse-${classroomId}`,
            name: 'Skattekassen',
            type: 'bank',
            subType: 'taxaccount',
            classroomId: classroomId,
            accountNumber: '001',
            balance: 0,
            createdAt: new Date().toISOString()
        };
        users.push(taxAccountUser);

        // Oppdater lærerens classroomId
        const teacherIndex = users.findIndex(u => u.id === teacherId);
        if (teacherIndex !== -1) {
            users[teacherIndex].classroomId = classroomId;
        }
        
        await this.saveUsers(users);
        await this.saveClassrooms();
        await this.saveCentralBanks();

        return classroom;
    }

    /**
     * Hent klasserom by ID
     * Returnerer lokal kopi for å sikre at endringer (som nextStudentNumber) persisteres
     */
    getClassroomById(classroomId) {
        // Reload fra localStorage for å få siste endringer
        this.classrooms = this.loadClassrooms();

        // Sjekk lokal cache først (prioriter lokale endringer)
        let localClassroom = this.classrooms.find(c => c.id === classroomId);

        // Hvis vi har Firebase-data og ingen lokal, bruk Firebase
        if (!localClassroom && this._firebaseClassrooms?.length > 0) {
            const fbClassroom = this._firebaseClassrooms.find(c => c.id === classroomId);
            if (fbClassroom) {
                // Kopier til lokal cache
                localClassroom = { ...fbClassroom };
                this.classrooms.push(localClassroom);
                localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(this.classrooms));
            }
        }

        // Synkroniser Firebase cache med lokal for konsistens
        if (localClassroom && this._firebaseClassrooms) {
            const fbIndex = this._firebaseClassrooms.findIndex(c => c.id === classroomId);
            if (fbIndex >= 0) {
                this._firebaseClassrooms[fbIndex] = localClassroom;
            }
        }

        return localClassroom;
    }

    /**
     * Hent klasserom for lærer
     * Sjekker Firebase først, deretter localStorage
     */
    getClassroomByTeacher(teacherId) {
        // Sjekk Firebase cache først
        if (this._firebaseClassrooms?.length > 0) {
            const fbClassroom = this._firebaseClassrooms.find(c => c.teacherId === teacherId);
            if (fbClassroom) return fbClassroom;
        }
        // Fallback til localStorage
        this.classrooms = this.loadClassrooms();
        return this.classrooms.find(c => c.teacherId === teacherId);
    }
    
    /**
     * Async versjon som henter fra Firebase
     */
    async getClassroomByTeacherAsync(teacherId) {
        try {
            if (dataService.getClassrooms) {
                const classrooms = await dataService.getClassrooms();
                this._firebaseClassrooms = classrooms;
                const found = classrooms.find(c => c.teacherId === teacherId);
                if (found) return found;
            }
        } catch (e) {
            console.warn('Firebase classroom lookup failed:', e);
        }
        // Fallback
        return this.getClassroomByTeacher(teacherId);
    }

    /**
     * Hent alle klasserom
     */
    getAllClassrooms() {
        // Prefer Firebase data
        if (this._firebaseClassrooms?.length > 0) {
            return [...this._firebaseClassrooms];
        }
        return [...this.classrooms];
    }

    /**
     * Oppdater klasserom innstillinger
     */
    async updateClassroomSettings(classroomId, newSettings) {
        const classroom = this.getClassroomById(classroomId);
        if (!classroom) throw new Error(languageService.t('error.classroomNotFound'));

        Object.assign(classroom, {
            ...newSettings,
            settings: { ...classroom.settings, ...newSettings }
        });

        await this.saveClassrooms();
        return classroom;
    }

    // ==================== STUDENT OPERATIONS ====================

    /**
     * Legg til elev i klasserom
     * Oppretter også sparekonto (2XX) og fondskonto (3XX)
     */
    async addStudent(classroomId, name, username, password) {
        const classroom = this.getClassroomById(classroomId);
        if (!classroom) throw new Error(languageService.t('error.classroomNotFound'));

        // Initialiser nextStudentNumber hvis den mangler (for eldre klasserom)
        if (classroom.nextStudentNumber === undefined || classroom.nextStudentNumber === null) {
            const students = this.getStudentsByClassroom(classroomId);
            let maxNum = 100;
            students.forEach(s => {
                const accNum = parseInt(s.accountNumber, 10);
                if (!isNaN(accNum) && accNum >= 101 && accNum <= 199 && accNum > maxNum) {
                    maxNum = accNum;
                }
            });
            classroom.nextStudentNumber = maxNum + 1;
        }

        // Sjekk maks antall elever
        if (classroom.nextStudentNumber > APP_CONFIG.accountRanges.students.max) {
            throw new Error(languageService.t('error.maxStudentsReached'));
        }

        // Sjekk at brukernavn er unikt globalt
        const users = this.getUsers();
        if (users.some(u => u.username === username)) {
            throw new Error(languageService.t('error.usernameInUse'));
        }

        const hashedPassword = await hashPassword(password);
        const studentNumber = classroom.nextStudentNumber;
        const accountNumber = studentNumber.toString(); // f.eks. "101"
        const savingsAccountNumber = (studentNumber + 100).toString(); // f.eks. "201"
        const fundAccountNumber = (studentNumber + 200).toString(); // f.eks. "301"

        // Hovedkonto (brukskonto)
        const student = {
            id: `student-${Date.now()}`,
            username,
            passwordHash: hashedPassword,
            name,
            type: 'student',
            classroomId,
            accountNumber,
            savingsAccountNumber, // Referanse til sparekonto
            fundAccountNumber, // Referanse til fondskonto
            balance: classroom.startingBalance,
            savingsBalance: 0, // Saldo på sparekonto
            fundBalance: 0, // Saldo på fondskonto
            fundShares: 0, // Antall fondsandeler
            fundCostBasis: 0, // Kostpris for fondsandeler (for gevinstberegning)
            locked: false,
            createdAt: new Date().toISOString()
        };

        users.push(student);
        classroom.nextStudentNumber++;

        await this.saveUsers(users);
        await this.saveClassrooms();

        return student;
    }

    /**
     * Hent elever i klasserom
     */
    getStudentsByClassroom(classroomId) {
        const users = this.getUsers();
        return users.filter(u => u.type === 'student' && u.classroomId === classroomId);
    }

    /**
     * Fjern elev fra klasserom
     */
    async removeStudent(studentId) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === studentId && u.type === 'student');
        if (index === -1) throw new Error(languageService.t('error.studentNotFound'));

        users.splice(index, 1);
        await this.saveUsers(users);
        return true;
    }

    // ==================== CENTRAL BANK OPERATIONS ====================

    /**
     * Hent sentralbank for klasserom
     */
    getCentralBank(classroomId) {
        if (!this.centralBanks[classroomId]) {
            this.centralBanks[classroomId] = {
                accountNumber: '000',
                transactions: [],
                statistics: {
                    totalSalariesPaid: 0,
                    totalLoansGiven: 0,
                    totalLoanInterestEarned: 0,
                    totalPaymentsReceived: 0
                }
            };
            this.saveCentralBanks();
        }
        return this.centralBanks[classroomId];
    }

    /**
     * Registrer transaksjon i sentralbank
     */
    recordCentralBankTransaction(classroomId, transaction) {
        const bank = this.getCentralBank(classroomId);
        bank.transactions.push({
            ...transaction,
            timestamp: new Date().toISOString()
        });

        // Oppdater statistikk basert på type
        switch (transaction.type) {
            case 'salary':
                bank.statistics.totalSalariesPaid += Math.abs(transaction.amount);
                break;
            case 'loan_given':
                bank.statistics.totalLoansGiven += Math.abs(transaction.amount);
                break;
            case 'loan_interest':
                bank.statistics.totalLoanInterestEarned += Math.abs(transaction.amount);
                break;
            case 'payment_received':
                bank.statistics.totalPaymentsReceived += Math.abs(transaction.amount);
                break;
        }

        this.saveCentralBanks();
        return bank;
    }

    /**
     * Hent sentralbank statistikk
     */
    getCentralBankStatistics(classroomId) {
        const bank = this.getCentralBank(classroomId);
        return bank.statistics;
    }

    /**
     * Hent sentralbank transaksjoner
     */
    getCentralBankTransactions(classroomId, limit = 50) {
        const bank = this.getCentralBank(classroomId);
        return bank.transactions.slice(-limit).reverse();
    }

    // ==================== ACCOUNT NUMBER HELPERS ====================

    /**
     * Generer neste ledige kontonummer for en gitt type i klasserommet
     * @param {string} classroomId - Klasserom ID
     * @param {string} type - 'student', 'savings', 'fund', 'business'
     * @returns {string} - Neste ledige kontonummer
     */
    generateAccountNumber(classroomId, type = 'student') {
        // Reload fra localStorage for å få absolutt siste data
        this.classrooms = this.loadClassrooms();
        let classroom = this.classrooms.find(c => c.id === classroomId);

        // Fallback til Firebase-cache hvis ikke i localStorage
        if (!classroom && this._firebaseClassrooms?.length > 0) {
            const fbClassroom = this._firebaseClassrooms.find(c => c.id === classroomId);
            if (fbClassroom) {
                classroom = { ...fbClassroom };
                this.classrooms.push(classroom);
            }
        }

        if (!classroom) throw new Error(languageService.t('error.classroomNotFound'));

        switch (type) {
            case 'student': {
                // Initialiser nextStudentNumber hvis den mangler (for eldre klasserom)
                if (classroom.nextStudentNumber === undefined || classroom.nextStudentNumber === null) {
                    // Finn høyeste eksisterende studentnummer i klasserommet
                    const students = this.getStudentsByClassroom(classroomId);
                    let maxNum = 100;
                    students.forEach(s => {
                        const accNum = parseInt(s.accountNumber, 10);
                        if (!isNaN(accNum) && accNum >= 101 && accNum <= 199 && accNum > maxNum) {
                            maxNum = accNum;
                        }
                    });
                    classroom.nextStudentNumber = maxNum + 1;
                    console.log(`🔢 Initialiserte nextStudentNumber til ${classroom.nextStudentNumber} basert på eksisterende elever`);
                }
                if (classroom.nextStudentNumber > APP_CONFIG.accountRanges.students.max) {
                    throw new Error(languageService.t('error.maxStudentsReachedShort'));
                }
                const studentNumber = classroom.nextStudentNumber.toString();
                classroom.nextStudentNumber++;

                // Lagre umiddelbart til localStorage OG oppdater Firebase-cache
                const classroomIndex = this.classrooms.findIndex(c => c.id === classroomId);
                if (classroomIndex >= 0) {
                    this.classrooms[classroomIndex] = classroom;
                }
                localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(this.classrooms));

                // Oppdater Firebase-cache
                if (this._firebaseClassrooms) {
                    const fbIndex = this._firebaseClassrooms.findIndex(c => c.id === classroomId);
                    if (fbIndex >= 0) {
                        this._firebaseClassrooms[fbIndex] = { ...classroom };
                    }
                }

                // Lagre til Firebase i bakgrunnen
                this._saveClassroomsToFirebase().catch(err =>
                    console.error('Kunne ikke lagre klasserom til Firebase:', err)
                );

                console.log(`🔢 Genererte kontonummer ${studentNumber}, neste er ${classroom.nextStudentNumber}`);
                return studentNumber;
            }

            case 'business':
                return this.getNextBusinessAccountNumber(classroomId);

            default:
                throw new Error(`Ukjent kontotype: ${type}`);
        }
    }

    /**
     * Generer sparekonto-nummer basert på privatkonto
     * Elev 103 → Sparekonto 203
     */
    getSavingsAccountNumber(privateAccountNumber) {
        const lastTwo = privateAccountNumber.slice(-2);
        return `2${lastTwo}`;
    }

    /**
     * Generer fondskonto-nummer basert på privatkonto
     * Elev 103 → Fondskonto 303
     */
    getFundAccountNumber(privateAccountNumber) {
        const lastTwo = privateAccountNumber.slice(-2);
        return `3${lastTwo}`;
    }

    /**
     * Hent neste bedriftskontonummer
     */
    getNextBusinessAccountNumber(classroomId) {
        const classroom = this.getClassroomById(classroomId);
        if (!classroom) throw new Error(languageService.t('error.classroomNotFound'));

        // Initialiser nextBusinessNumber hvis den mangler (for eldre klasserom)
        if (classroom.nextBusinessNumber === undefined || classroom.nextBusinessNumber === null) {
            classroom.nextBusinessNumber = APP_CONFIG.accountRanges.businesses.min || 501;
        }

        if (classroom.nextBusinessNumber > APP_CONFIG.accountRanges.businesses.max) {
            throw new Error(languageService.t('error.maxBusinessesReached'));
        }

        const accountNumber = classroom.nextBusinessNumber.toString();
        classroom.nextBusinessNumber++;
        this.saveClassrooms();

        return accountNumber;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Hent alle brukere - bruker dataService cache for Firebase-støtte
     */
    getUsers() {
        // Bruk dataService sin cache for Firebase-kompatibilitet
        if (dataService.getUsersSync) {
            return dataService.getUsersSync();
        }
        // Fallback til localStorage hvis dataService ikke er initialisert
        const data = localStorage.getItem(STORAGE_KEYS.users);
        return data ? JSON.parse(data) : [];
    }

    /**
     * Lagre brukere - oppdaterer både cache og Firebase
     */
    async saveUsers(users) {
        // Oppdater via dataService for Firebase-støtte
        for (const user of users) {
            if (user.id) {
                try {
                    await dataService.updateUser(user.id, user);
                } catch (e) {
                    // Bruker finnes kanskje ikke ennå - prøv å opprette
                    try {
                        await dataService.createUser(user);
                    } catch (createError) {
                        console.warn('Kunne ikke oppdatere/opprette bruker:', user.id, createError);
                    }
                }
            }
        }
        // Oppdater også localStorage for bakoverkompatibilitet
        localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
        // Refresh cache
        await dataService.refreshUsersCache();
    }

    /**
     * Sjekk om bruker tilhører klasserom
     */
    userBelongsToClassroom(userId, classroomId) {
        const users = this.getUsers();
        const user = users.find(u => u.id === userId);
        return user && user.classroomId === classroomId;
    }

    /**
     * Sjekk om to brukere er i samme klasserom
     */
    usersInSameClassroom(userId1, userId2) {
        const users = this.getUsers();
        const user1 = users.find(u => u.id === userId1);
        const user2 = users.find(u => u.id === userId2);
        return user1 && user2 && user1.classroomId === user2.classroomId;
    }
}

export const classroomService = new ClassroomService();

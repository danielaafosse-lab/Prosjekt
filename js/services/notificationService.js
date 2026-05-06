/**
 * Notification Service - Håndterer meldinger og varsler
 * 
 * Features:
 * - Systemvarsler
 * - Bruker-til-bruker meldinger
 * - Automatiske varsler (lønn, skatt, rente, etc.)
 * 
 * VIKTIG: Bruker klasserom-isolert storage for multi-tenancy
 */

import { STORAGE_KEYS } from '../config.js';
import { dataService } from '../core/dataService.js';
import { eventBus } from '../core/eventBus.js';

class NotificationService {
    constructor() {
        // Ikke last notifikasjoner i constructor - gjøres dynamisk per klasserom
        this._notificationsCache = null;
        this._cacheClassroomId = null;
        this.setupEventListeners();
    }

    /**
     * Last inn notifikasjoner asynkront fra Firebase
     */
    async loadNotificationsAsync() {
        try {
            const currentClassroomId = await dataService.getCurrentClassroomId();
            if (!currentClassroomId) {
                this._notificationsCache = [];
                this._cacheClassroomId = null;
                return [];
            }

            // Sjekk cache
            if (this._notificationsCache !== null && this._cacheClassroomId === currentClassroomId) {
                return this._notificationsCache;
            }

            const data = await dataService.getClassroomData(STORAGE_KEYS.NOTIFICATIONS);
            this._notificationsCache = data || [];
            this._cacheClassroomId = currentClassroomId;
            return this._notificationsCache;
        } catch (e) {
            console.error('Feil ved lasting av notifikasjoner:', e);
            this._notificationsCache = [];
            return [];
        }
    }

    /**
     * Last inn notifikasjoner fra cache (synkron) - KREVER at loadNotificationsAsync() er kalt først
     */
    loadNotifications() {
        if (this._notificationsCache !== null) {
            return this._notificationsCache;
        }
        console.warn('⚠️ loadNotifications() kalt før async init - returnerer tom array');
        return [];
    }

    /**
     * Hent notifications (med lazy loading fra cache)
     */
    get notifications() {
        return this.loadNotifications();
    }

    /**
     * Initialiser notificationService - må kalles etter innlogging
     */
    async initialize() {
        await this.loadNotificationsAsync();
        console.log('✅ NotificationService initialisert med', this._notificationsCache?.length || 0, 'notifikasjoner');
    }

    /**
     * Lagre notifikasjoner (klasserom-isolert)
     */
    async saveNotifications() {
        const notifications = this._notificationsCache || [];
        try {
            await dataService.saveClassroomData(STORAGE_KEYS.NOTIFICATIONS, notifications);
        } catch (e) {
            console.error('Feil ved lagring av notifikasjoner:', e);
        }
    }

    /**
     * Sett opp event listeners for automatiske varsler
     */
    setupEventListeners() {
        // Lønn utbetalt
        eventBus.on('salary:paid', (data) => {
            this.create({
                userId: data.userId,
                type: 'income',
                title: 'Lønn mottatt',
                message: `Du har mottatt ${data.amount} KKr i lønn for "${data.jobTitle}"`,
                icon: '💰'
            });
        });

        // Skatt trukket
        eventBus.on('tax:collected', (data) => {
            this.create({
                userId: data.userId,
                type: 'tax',
                title: 'Skattetrekk',
                message: `Det er trukket ${data.taxAmount} KKr i skatt fra din lønn`,
                icon: '🏛️'
            });
        });

        // Lån opprettet
        eventBus.on('loan:created', (loan) => {
            this.create({
                userId: loan.borrowerId,
                type: 'loan',
                title: 'Lån innvilget',
                message: `Du har mottatt et lån på ${loan.principalAmount} KKr. Ukentlig avdrag: ${loan.monthlyPayment} KKr`,
                icon: '🏦'
            });
        });

        // Lån nedbetalt
        eventBus.on('loan:paidOff', (loan) => {
            this.create({
                userId: loan.borrowerId,
                type: 'loan',
                title: 'Lån nedbetalt!',
                message: `Gratulerer! Du har nedbetalt lånet ditt fullstendig.`,
                icon: '🎉'
            });
        });

        // Lån forsinket
        eventBus.on('loan:overdue', (loan) => {
            this.create({
                userId: loan.borrowerId,
                type: 'warning',
                title: 'Låneavdrag forfalt',
                message: `Du har ikke nok penger til å betale avdraget på ${loan.monthlyPayment} KKr. Vennligst sørg for dekning.`,
                icon: '⚠️'
            });
        });

        // Bedrift godkjent
        eventBus.on('business:approved', (business) => {
            business.owners.forEach(owner => {
                this.create({
                    userId: owner.userId,
                    type: 'business',
                    title: 'Bedrift godkjent',
                    message: `"${business.name}" er nå godkjent og aktiv!`,
                    icon: '✅'
                });
            });
        });

        // Ansatt
        eventBus.on('business:employeeHired', (data) => {
            this.create({
                userId: data.userId,
                type: 'business',
                title: 'Du er ansatt!',
                message: `Du er ansatt som ${data.title} i ${data.business.name}. Lønn: ${data.salary} KKr/uke`,
                icon: '🎉'
            });
        });

        // Oppsagt
        eventBus.on('business:employeeFired', (data) => {
            this.create({
                userId: data.userId,
                type: 'warning',
                title: 'Oppsigelse',
                message: `Du er ikke lenger ansatt i ${data.business.name}`,
                icon: '📋'
            });
        });

        // Rente utbetalt
        eventBus.on('savings:interestPaid', (results) => {
            results.forEach(r => {
                if (r.interest > 0) {
                    this.create({
                        userId: r.userId,
                        type: 'savings',
                        title: 'Renter godskrevet',
                        message: `${r.interest} KKr er godskrevet din sparekonto`,
                        icon: '💵'
                    });
                }
            });
        });

        // Fondsavkastning
        eventBus.on('fund:returnsPaid', (results) => {
            results.forEach(r => {
                const icon = r.returns >= 0 ? '📈' : '📉';
                const title = r.returns >= 0 ? 'Positiv avkastning' : 'Negativ avkastning';
                this.create({
                    userId: r.userId,
                    type: 'fund',
                    title,
                    message: `Fondet ditt har ${r.returns >= 0 ? 'økt' : 'sunket'} med ${Math.abs(r.returns)} KKr (${r.effectiveRate.toFixed(1)}%)`,
                    icon
                });
            });
        });
    }

    /**
     * Opprett en ny notifikasjon
     */
    async create({ userId, type, title, message, icon = '📬', fromUserId = null }) {
        const notification = {
            id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId,
            type,
            title,
            message,
            icon,
            fromUserId,
            read: false,
            createdAt: new Date().toISOString()
        };

        // Oppdater cache og lagre
        if (this._notificationsCache === null) {
            this._notificationsCache = [];
        }
        this._notificationsCache.push(notification);
        await this.saveNotifications();

        eventBus.emit('notification:created', notification);
        return notification;
    }

    /**
     * Hent notifikasjoner for en bruker
     */
    getByUser(userId, unreadOnly = false) {
        let userNotifs = this.notifications.filter(n => n.userId === userId);
        
        if (unreadOnly) {
            userNotifs = userNotifs.filter(n => !n.read);
        }

        return userNotifs.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    /**
     * Hent antall uleste notifikasjoner
     */
    getUnreadCount(userId) {
        return this.notifications.filter(n => 
            n.userId === userId && !n.read
        ).length;
    }

    /**
     * Marker notifikasjon som lest
     */
    async markAsRead(notificationId) {
        const notif = this.notifications.find(n => n.id === notificationId);
        if (notif) {
            notif.read = true;
            await this.saveNotifications();
            eventBus.emit('notification:read', notif);
        }
        return notif;
    }

    /**
     * Marker alle notifikasjoner som lest for en bruker
     */
    async markAllAsRead(userId) {
        const userNotifs = this.notifications.filter(n => n.userId === userId);
        userNotifs.forEach(n => n.read = true);
        await this.saveNotifications();
        eventBus.emit('notification:allRead', userId);
    }

    /**
     * Slett en notifikasjon
     */
    async delete(notificationId) {
        const index = this.notifications.findIndex(n => n.id === notificationId);
        if (index !== -1) {
            this._notificationsCache.splice(index, 1);
            await this.saveNotifications();
        }
    }

    /**
     * Slett alle notifikasjoner for en bruker
     */
    async deleteAllForUser(userId) {
        this._notificationsCache = this._notificationsCache.filter(n => n.userId !== userId);
        await this.saveNotifications();
    }

    /**
     * Send melding fra en bruker til en annen
     */
    async sendMessage(fromUserId, toUserId, message) {
        return await this.create({
            userId: toUserId,
            type: 'message',
            title: 'Ny melding',
            message,
            icon: '💬',
            fromUserId
        });
    }

    /**
     * Send systemvarsel til alle brukere i klasserommet
     */
    async broadcastSystem(title, message, icon = '📢') {
        const users = dataService.getUsersSync() || [];
        const classroomId = dataService.getCurrentClassroomIdSync();
        const results = [];

        for (const user of users) {
            // Kun send til elever i samme klasserom
            if (user.type === 'student' && (!classroomId || user.classroomId === classroomId)) {
                const notification = await this.create({
                    userId: user.id,
                    type: 'system',
                    title,
                    message,
                    icon
                });
                results.push(notification);
            }
        }

        return results;
    }

    /**
     * Nullstill alle notifikasjoner
     */
    async reset() {
        this._notificationsCache = [];
        await this.saveNotifications();
    }

    /**
     * Tving omlasting av cache (for når klasserom endres)
     */
    refreshCache() {
        this._notificationsCache = null;
        this._cacheClassroomId = null;
    }
}

export const notificationService = new NotificationService();

/**
 * Main Application Entry Point
 * Initialiserer og starter hele applikasjonen
 */

// Services brukt direkte fra bootstrap-laget (init, dashboards, login).
// Feature-controllers (på prototype-merge under) importerer sine egne avhengigheter.
import { dataService } from './shared/core/dataService.js';
import { authService } from './features/auth/index.js';
import { eventBus, EVENTS } from './shared/core/eventBus.js';
import { uiManager } from './shared/ui/uiManager.js';
import { transactionService } from './features/transactions/index.js';
import { jobService } from './features/jobs/index.js';
import { userService } from './features/users/index.js';
import { settingsService } from './features/settings/index.js';
import { taxService } from './features/taxes/index.js';
import { loanService } from './features/loans/index.js';
import { businessService } from './features/businesses/index.js';
import { savingsService } from './features/savings/index.js';
import { notificationService } from './features/notifications/index.js';
import { schedulerService } from './features/scheduler/index.js';
import { classroomService } from './features/classroom/index.js';
import { languageService } from './features/i18n/index.js';
import { statsService } from './features/stats/index.js';
import { formatCurrency } from './shared/utils/formatters.js';
import { escapeHtml, hashPassword } from './shared/utils/helpers.js';
import { APP_CONFIG } from './shared/config/config.js';

// Feature controllers — merged into EconSimApp.prototype below
import { savingsControllerMethods } from './features/savings/controllers/savingsController.js';
import { taxesControllerMethods } from './features/taxes/controllers/taxesController.js';
import { classroomControllerMethods } from './features/classroom/controllers/classroomController.js';
import { i18nControllerMethods } from './features/i18n/controllers/i18nController.js';
import { transactionsControllerMethods } from './features/transactions/controllers/transactionsController.js';
import { loansControllerMethods } from './features/loans/controllers/loansController.js';
import { usersControllerMethods } from './features/users/controllers/usersController.js';
import { authControllerMethods } from './features/auth/controllers/authController.js';
import { notificationsControllerMethods } from './features/notifications/controllers/notificationsController.js';
import { statsControllerMethods } from './features/stats/controllers/statsController.js';
import { jobsControllerMethods } from './features/jobs/controllers/jobsController.js';
import { businessesControllerMethods } from './features/businesses/controllers/businessesController.js';

// Eksporter språkfunksjon globalt for HTML onclick
window.setLanguage = (lang) => {
  languageService.setLanguage(lang);
};

/**
 * Main App Class
 */
class EconSimApp {
  constructor() {
    this.settings = null;
    this.currentClassroom = null;
    this.refreshInterval = null;
    // Cache for transaksjoner (for søk/filtrering)
    this.cachedStudentTransactions = [];
    this.cachedTeacherTransactions = [];
    this.cachedBusinessTransactions = [];
    // Login statistics
    this.loginStatsChart = null;
    this.loginStatsView = 'day'; // 'day', 'week', 'month' eller 'year'
    this.loginStatsFilterKey = null;
    this.currentTeacherScreen = 'overview';
    this.currentStudentScreen = 'overview';
  }

  /**
   * Initialiser applikasjonen
   */
  async init() {
    try {
      console.log('🚀 EconSim v4.0 starter...');

      // Eksporter reset-funksjon globalt for debugging
      window.resetEconSim = () => this.resetAllData();

      // Initialiser språktjeneste først (før UI)
      languageService.initialize();
      console.log('🌐 Språktjeneste initialisert');
      
      // Registrer observer for å oppdatere UI ved språkendring
      languageService.addObserver(() => this.onLanguageChange());

      // Initialiser UI manager
      uiManager.init();

      // Initialiser dataservice
      await dataService.initialize();

      // Initialiser klasserom-service (multi-tenancy)
      await classroomService.initialize();
      console.log('📚 ClassroomService initialisert');

      // Sikre at demo-eleven Kari alltid finnes med kjent innlogging
      await this.ensureDemoKariAccess();

      // Sikre at demo-lærer, demo-klasserom og demo-elever er korrekt koblet sammen
      await this.ensureDemoClassroomIntegrity();

      // Hent innstillinger (defaults)
      this.settings = await settingsService.getSettings();
      console.log('⚙️ Innstillinger lastet:', this.settings);

      // Start scheduler for automatiske prosesser
      schedulerService.start();
      console.log('⏰ Scheduler startet');

      // Sjekk URL for e-postbekreftelsestoken
      await this.checkEmailVerificationToken();

      // Initialiser auth og sjekk om bruker allerede er logget inn
      const user = await authService.initialize();
      
      if (user) {
        console.log('✅ Bruker allerede logget inn:', user.name, '- Type:', user.type);
        
        // Initialiser tjenester som trenger bruker-kontekst
        await this.initializeUserServices();
        
        // Vis riktig dashboard basert på brukertype
        if (user.type === 'superadmin') {
          await this.showSuperadminDashboard();
        } else if (user.type === 'teacher') {
          await this.showTeacherDashboard();
        } else {
          await this.showStudentDashboard();
        }
      } else {
        // Vis login screen
        console.log('📝 Viser login-skjerm');
        console.log('💡 Tips: Bruk resetEconSim() i konsollen for å resette all data');
      }

      // Setup event listeners
      this.setupEventListeners();

      console.log('✨ EconSim v4.0 klar!');
    } catch (error) {
      console.error('❌ Feil ved initialisering:', error);
      uiManager.showError(languageService.t('error.startupFailed'));
    }
  }

  /**
   * Initialiser tjenester som trenger bruker-kontekst
   * Kalles etter at bruker er logget inn
   */
  async initializeUserServices() {
    console.log('🔧 Initialiserer bruker-tjenester...');

    // Last all data til cache først for synkron tilgang
    try {
      await dataService.loadClassroomDataToCache();
      console.log('📦 DataService cache lastet');
    } catch (error) {
      console.error('❌ DataService cache feilet:', error);
    }

    // Initialiser alle tjenester PARALLELT for bedre ytelse
    const serviceInitPromises = [
      { name: 'BusinessService', icon: '🏢', fn: () => businessService.initialize() },
      { name: 'LoanService', icon: '💰', fn: () => loanService.initialize() },
      { name: 'SavingsService', icon: '💵', fn: () => savingsService.initialize() },
      { name: 'TaxService', icon: '🏛️', fn: async () => {
        await taxService.loadTaxAccountAsync();
        await taxService.loadSettingsAsync();
      }},
      { name: 'NotificationService', icon: '🔔', fn: () => notificationService.initialize() },
      { name: 'SchedulerService', icon: '⏰', fn: () => schedulerService.initialize() },
      { name: 'Settings', icon: '⚙️', fn: async () => {
        this.settings = await settingsService.getSettings();
      }}
    ];

    const results = await Promise.allSettled(
      serviceInitPromises.map(async (service) => {
        await service.fn();
        console.log(`${service.icon} ${service.name} initialisert`);
        return service.name;
      })
    );

    // Logg eventuelle feil
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`❌ ${serviceInitPromises[index].name} feilet:`, result.reason);
      }
    });

    console.log('✅ Alle tjenester initialisert');
  }

  /**
   * Reset all data - for debugging
   */
  async resetAllData() {
    if (confirm(languageService.t('confirm.resetData'))) {
      console.log('🗑️ Sletter all data fra Firebase og localStorage...');

      // Slett Firebase-data via dataService
      try {
        // Slett alle jobbtilbud
        const jobOffers = await dataService.getJobOffers();
        for (const offer of jobOffers) {
          await dataService.deleteJobOffer(offer.id);
        }

        // Slett alle bedriftsjobb-søknader
        const jobApps = await dataService.getBusinessJobApplications();
        for (const app of jobApps) {
          await dataService.deleteBusinessJobApplication(app.id);
        }

        // Slett alle lånesøknader
        const loanApps = await dataService.getLoanApplications();
        for (const app of loanApps) {
          await dataService.deleteLoanApplication(app.id);
        }

        console.log('✅ Firebase-data slettet');
      } catch (error) {
        console.error('❌ Feil ved sletting av Firebase-data:', error);
      }

      // Slett alle econsim_ keys fra localStorage (legacy data)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('econsim_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('🗑️ Slettet', keysToRemove.length, 'nøkler fra localStorage');

      // Reload siden
      location.reload();
    }
  }

  /**
   * Setup event listeners for UI
   */
  setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    // Password visibility toggle
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
      togglePassword.addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
          const type = passwordInput.type === 'password' ? 'text' : 'password';
          passwordInput.type = type;
          togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
        }
      });
    }

    // Logout button
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="logout"]')) {
        this.handleLogout();
      }
    });

    // Student: manuell refresh av dashboard-data
    const studentRefreshBtn = document.getElementById('studentRefreshBtn');
    if (studentRefreshBtn) {
      studentRefreshBtn.addEventListener('click', async () => {
        await this.refreshStudentDashboardManually(studentRefreshBtn);
      });
    }

    // Transfer money form
    const transferForm = document.getElementById('transferForm');
    if (transferForm) {
      transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleTransfer();
      });
    }

    // Listen to balance updates
    eventBus.on(EVENTS.BALANCE_UPDATED, async () => {
      await this.updateBalanceDisplay();
      // Oppdater også Mine kontoer sammendraget
      if (authService.isStudent()) {
        await this.loadStudentAccountsSummary();
      }
    });

    // Listen to settings updates
    eventBus.on(EVENTS.SETTINGS_UPDATED, (settings) => {
      this.settings = settings;
      this.updateCurrencyDisplay();
    });

    // Apply for job form
    const applicationForm = document.getElementById('applicationForm');
    if (applicationForm) {
      applicationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleJobApplication();
      });
    }

    // Edit job form
    const editJobForm = document.getElementById('editJobForm');
    if (editJobForm) {
      editJobForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleEditJob();
      });
    }

    // Partial payment form
    const partialPaymentForm = document.getElementById('partialPaymentForm');
    if (partialPaymentForm) {
      partialPaymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handlePartialPayment();
      });
    }

    // Create loan form
    const createLoanForm = document.getElementById('createLoanForm');
    if (createLoanForm) {
      createLoanForm.addEventListener('submit', (e) => this.createLoan(e));
      // Oppdater forhåndsvisning ved endringer
      ['loanAmount', 'loanTermWeeks', 'loanInterestRate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => this.updateLoanPreview());
      });
    }

    // Extra loan payment form (student)
    const extraLoanPaymentForm = document.getElementById('extraLoanPaymentForm');
    if (extraLoanPaymentForm) {
      extraLoanPaymentForm.addEventListener('submit', (e) => this.submitExtraLoanPayment(e));
    }

    // Create business form
    const createBusinessForm = document.getElementById('createBusinessForm');
    if (createBusinessForm) {
      createBusinessForm.addEventListener('submit', (e) => this.createBusiness(e));
    }

    // Edit student form
    const editStudentForm = document.getElementById('editStudentForm');
    if (editStudentForm) {
      editStudentForm.addEventListener('submit', (e) => this.saveEditedStudent(e));
    }

    // Settings form
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }

    // Student settings form (elev innstillinger inkl. passordendring)
    const studentSettingsForm = document.getElementById('studentSettingsForm');
    if (studentSettingsForm) {
      studentSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveStudentSettings();
      });
    }

    // Business management forms (student businesses)
    const hireEmployeeForm = document.getElementById('hireEmployeeForm');
    if (hireEmployeeForm) {
      hireEmployeeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.hireEmployee(e);
      });
    }

    const createBusinessJobForm = document.getElementById('createBusinessJobForm');
    if (createBusinessJobForm) {
      createBusinessJobForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.createBusinessJob(e);
      });
    }

    // Salg av eierandel fra tab
    const sellOwnershipForm = document.getElementById('sellOwnershipForm');
    if (sellOwnershipForm) {
      sellOwnershipForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitOwnershipOffer(e);
      });
    }

    // Salg av eierandel fra modal
    const sellOwnershipModalForm = document.getElementById('sellOwnershipModalForm');
    if (sellOwnershipModalForm) {
      sellOwnershipModalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.sendOwnershipOffer(e);
      });
    }

    // Bedriftsmelding-skjema
    const businessMessageForm = document.getElementById('businessMessageForm');
    if (businessMessageForm) {
      businessMessageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.sendBusinessMessage(e);
      });
    }

    // Lærersøknad-skjema (innloggingssiden)
    const teacherRequestForm = document.getElementById('teacherRequestForm');
    if (teacherRequestForm) {
      teacherRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitTeacherRequest();
      });
    }

    // Lærermelding-skjema
    const teacherMessageForm = document.getElementById('teacherMessageForm');
    if (teacherMessageForm) {
      teacherMessageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.sendTeacherMessage(e);
      });
    }

    // Student lånesøknad-skjema
    const studentLoanApplicationForm = document.getElementById('studentLoanApplicationForm');
    if (studentLoanApplicationForm) {
      studentLoanApplicationForm.addEventListener('submit', (e) => this.submitStudentLoanApplication(e));
    }

    // Bedrift lånesøknad-skjema
    const businessLoanApplicationForm = document.getElementById('businessLoanApplicationForm');
    if (businessLoanApplicationForm) {
      businessLoanApplicationForm.addEventListener('submit', (e) => this.submitBusinessLoanApplication(e));
    }

    // Bedrift kjøp/betal-skjema
    const businessPurchaseForm = document.getElementById('businessPurchaseForm');
    if (businessPurchaseForm) {
      businessPurchaseForm.addEventListener('submit', (e) => this.handleBusinessPurchase(e));
    }

    // Rediger bedrift-skjema
    const editBusinessForm = document.getElementById('editBusinessForm');
    if (editBusinessForm) {
      editBusinessForm.addEventListener('submit', (e) => this.handleEditBusiness(e));
    }

    // Rediger bedrift logo-upload
    const editBusinessLogoInput = document.getElementById('editBusinessLogoInput');
    if (editBusinessLogoInput) {
      editBusinessLogoInput.addEventListener('change', (e) => this.handleEditBusinessLogo(e));
    }

    // Start sanntid badge-oppdatering (polling hvert 30. sekund)
    this.startBadgePolling();

    // Settings toggles
    this.setupSettingsToggles();
  }

  // startBadgePolling, updateAllBadges — moved to features/notifications/controllers/notificationsController.js

  /**
   * Sett opp toggle-logikk for innstillinger
   */
  setupSettingsToggles() {
    // Tax toggle
    const enableTax = document.getElementById('settingsEnableTax');
    const taxOptions = document.getElementById('taxOptions');
    if (enableTax && taxOptions) {
      enableTax.addEventListener('change', () => {
        taxOptions.classList.toggle('hidden', !enableTax.checked);
      });
    }

    // Tax type radio buttons
    const taxTypeRadios = document.getElementsByName('taxType');
    const flatTaxOptions = document.getElementById('flatTaxOptions');
    const progressiveTaxOptions = document.getElementById('progressiveTaxOptions');
    const deductionOptions = document.getElementById('deductionOptions');
    
    taxTypeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (flatTaxOptions && progressiveTaxOptions) {
          flatTaxOptions.classList.toggle('hidden', radio.value !== 'flat');
          progressiveTaxOptions.classList.toggle('hidden', radio.value !== 'progressive');
        }
        // Skjul fradragsgrense ved progressiv skatt
        if (deductionOptions) {
          deductionOptions.classList.toggle('hidden', radio.value === 'progressive');
        }
      });
    });

    // Loan toggle
    const enableLoans = document.getElementById('settingsEnableLoans');
    const loanOptions = document.getElementById('loanOptions');
    if (enableLoans && loanOptions) {
      enableLoans.addEventListener('change', () => {
        loanOptions.classList.toggle('hidden', !enableLoans.checked);
      });
    }

    // Business toggle
    const enableBusinesses = document.getElementById('settingsEnableBusinesses');
    const businessOptions = document.getElementById('businessOptions');
    if (enableBusinesses && businessOptions) {
      enableBusinesses.addEventListener('change', () => {
        businessOptions.classList.toggle('hidden', !enableBusinesses.checked);
      });
    }
  }

  /**
   * Refresh alle tjeneste-cacher for riktig klasserom
   * Kalles ved login for å sikre at hver bruker ser sine egne data
   */
  async refreshAllServiceCaches() {
    console.log('🔄 Refresher alle tjeneste-cacher for nytt klasserom...');
    
    // Initialiser tjenester med async Firebase-lasting
    await this.initializeUserServices();
    
    // Refresh legacy cacher
    if (typeof taxService.refreshCache === 'function') {
      taxService.refreshCache();
    }
    if (typeof notificationService.refreshCache === 'function') {
      notificationService.refreshCache();
    }
    
    console.log('✅ Alle tjeneste-cacher refreshet');
  }

  /**
   * Vis student dashboard
   */
  async showStudentDashboard() {
    // Refresh brukerdata først for å få nyeste saldo
    await authService.refreshCurrentUser();
    const user = authService.getCurrentUser();
    
    // Hent klasserom-info
    const classroom = classroomService.getClassroomById(user.classroomId);
    this.currentClassroom = classroom;
    
    // Hent alltid ferske innstillinger for klasserommet
    this.settings = await settingsService.getSettings();
    
    // Skjul alle dashboards, vis student dashboard
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('superadminDashboard')?.classList.add('hidden');
    document.getElementById('teacherDashboard')?.classList.add('hidden');
    document.getElementById('studentDashboard').classList.remove('hidden');
    
    // Fyll inn brukerinfo
    document.getElementById('studentName').textContent = user.name;
    document.getElementById('studentAccountNumber').textContent = user.accountNumber;
    document.getElementById('studentBalance').textContent = formatCurrency(user.balance, this.settings?.currencySymbol || 'KKr');
    
    // Vis klasserom-navn (bruk settings som er oppdatert fra Firebase)
    const classroomNameEl = document.getElementById('studentClassroomName');
    if (classroomNameEl) {
      classroomNameEl.textContent = this.settings?.className || classroom?.className || '';
    }
    
    // Vis/skjul bedrifter-knappen basert på innstillinger
    // Støtter begge settingsstrukturer: settings.businesses.enabled og settings.enableBusinesses
    const businessesBtn = document.getElementById('studentBusinessesBtn');
    if (businessesBtn) {
      const businessesEnabled = this.settings?.businesses?.enabled || this.settings?.enableBusinesses;
      if (businessesEnabled) {
        businessesBtn.classList.remove('hidden');
      } else {
        businessesBtn.classList.add('hidden');
      }
    }

    // Vis/skjul lån-knappen basert på innstillinger
    const loansBtn = document.getElementById('studentLoansBtn');
    if (loansBtn) {
      const loansEnabled = this.settings?.loans?.enabled;
      if (loansEnabled) {
        loansBtn.classList.remove('hidden');
      } else {
        loansBtn.classList.add('hidden');
      }
    }
    
    // Vis oversikt som standard
    this.showStudentScreen('overview');
    
    // Last transaksjoner og oppsummering
    await this.loadStudentTransactions();
    await this.loadStudentActiveJobsSummary();
    await this.loadStudentAccountsSummary();

    // Oppdater innboks-badge
    await this.updateInboxBadge();
  }

  /**
   * Last sammendrag av elevens kontoer
   */
  async loadStudentAccountsSummary() {
    const user = authService.getCurrentUser();
    const container = document.getElementById('studentAccountsSummary');
    if (!container) return;
    
    // Hent lån fra loanService
    const allLoans = loanService.getLoansByBorrower(user.id);
    const activeLoans = allLoans.filter(l => l.status === 'active');
    const totalLoanDebt = activeLoans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0);
    
    const currencySymbol = this.settings?.currencySymbol || 'kr';
    
    // Hent saldoer fra savingsService for oppdaterte verdier
    const savingsAccountObj = savingsService.getSavingsAccountByUser(user.id);
    const fundAccountObj = savingsService.getFundAccountByUser(user.id);
    
    // Beregn total
    const mainAccount = user.balance || 0;
    const savingsAccount = savingsAccountObj?.balance || 0;
    const fundAccount = fundAccountObj?.balance || 0;
    const total = mainAccount + savingsAccount + fundAccount - totalLoanDebt;
    
    let html = `
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span>💳 ${languageService.t('student.privateAccount')}:</span>
          <span class="font-medium">${formatCurrency(mainAccount, currencySymbol)}</span>
        </div>
        <div class="flex justify-between">
          <span>🏦 ${languageService.t('student.savingsAccount')}:</span>
          <span class="font-medium text-blue-600">${formatCurrency(savingsAccount, currencySymbol)}</span>
        </div>
        <div class="flex justify-between">
          <span>📈 ${languageService.t('student.fundAccount')}:</span>
          <span class="font-medium text-green-600">${formatCurrency(fundAccount, currencySymbol)}</span>
        </div>`;
    
    if (activeLoans.length > 0) {
      html += `
        <div class="flex justify-between">
          <span>🏦 ${languageService.t('loans.title')}:</span>
          <span class="font-medium text-red-600">-${formatCurrency(totalLoanDebt, currencySymbol)}</span>
        </div>`;
    }
    
    html += `
        <div class="border-t pt-2 mt-2 flex justify-between">
          <span class="font-medium">${languageService.t('common.sum')}:</span>
          <span class="font-bold ${total >= 0 ? 'text-green-600' : 'text-red-600'}">${formatCurrency(total, currencySymbol)}</span>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  /**
   * Last sammendrag av aktive jobber for elev
   */
  async loadStudentActiveJobsSummary() {
    const user = authService.getCurrentUser();
    const allJobs = await jobService.getJobs();
    const myActiveJobs = allJobs.filter(job => job.status === 'active' && job.assignedTo === user.id);
    
    // Hent også bedriftsjobber fra business.employees
    const allBusinesses = businessService.getBusinessesByClassroom(this.currentClassroom?.id);
    const myBusinessJobs = [];
    
    for (const business of allBusinesses) {
      const employeeRecord = (business.employees || []).find(e => e.userId === user.id);
      if (employeeRecord) {
        myBusinessJobs.push({
          title: employeeRecord.title,
          salary: employeeRecord.salary,
          type: 'permanent', // Bedriftsjobber er alltid faste stillinger
          businessId: business.id,
          businessName: business.name,
          businessLogo: business.logo,
          isBusinessJob: true
        });
      }
    }
    
    // Kombiner begge typer jobber
    const allMyActiveJobs = [...myActiveJobs, ...myBusinessJobs];
    
    const container = document.getElementById('studentActiveJobsSummary');
    if (!container) return;
    
    if (allMyActiveJobs.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('jobs.noActiveJobs')}</p>`;
    } else {
      container.innerHTML = allMyActiveJobs.map(job => {
        const salaryLabel = job.type === 'project' ? languageService.t('jobs.perProject') : languageService.t('jobs.perWeek');
        // Finn bedriften for å få logo, eller vis "Staten" for lærerjobber
        const business = job.isBusinessJob ? null : (job.businessId ? businessService.getBusinessById(job.businessId) : null);
        const isTeacherJob = !job.isBusinessJob && (!job.businessId || job.isTeacherJob);
        const businessLogo = job.isBusinessJob 
          ? (job.businessLogo || '💼')
          : (isTeacherJob ? '🏛️' : (business?.logo || '💼'));
        const businessName = job.isBusinessJob 
          ? job.businessName 
          : (isTeacherJob 
            ? languageService.t('common.state')
            : (business?.name || languageService.t('common.unknownEmployer')));
        
        // Sjekk om logo er base64-bilde eller emoji
        const logoHtml = businessLogo.startsWith('data:') 
          ? `<img src="${businessLogo}" alt="Logo" class="w-8 h-8 rounded object-cover">`
          : `<span class="text-2xl">${businessLogo}</span>`;
        
        return `
          <div class="p-2 bg-gray-50 rounded flex items-center gap-3">
            ${logoHtml}
            <div class="flex-1">
              <p class="font-medium text-sm">${escapeHtml(job.title)}</p>
              <p class="text-xs text-gray-500">${escapeHtml(businessName)}</p>
              <p class="text-xs text-green-600">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  /**
   * Vis teacher dashboard
   */
  async showTeacherDashboard() {
    const user = authService.getCurrentUser();
    
    // Hent klasserom-info
    let classroom = classroomService.getClassroomByTeacher(user.id);
    
    // Opprett klasserom hvis lærer ikke har et
    if (!classroom) {
      console.log('📚 Oppretter klasserom for lærer...');
      classroom = await classroomService.createClassroom(user.id, languageService.t('teacher.myClassroom'));
    }
    
    this.currentClassroom = classroom;
    
    // Hent ferske innstillinger fra lagring (ikke fra classroom-objektet direkte)
    this.settings = await settingsService.getSettings();
    
    // Skjul alle dashboards, vis teacher dashboard
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('superadminDashboard')?.classList.add('hidden');
    document.getElementById('studentDashboard')?.classList.add('hidden');
    document.getElementById('teacherDashboard').classList.remove('hidden');
    
    // Fyll inn brukerinfo
    document.getElementById('teacherName').textContent = user.name;
    
    // Vis klasserom-navn (bruk settings som er oppdatert fra Firebase)
    const classroomNameEl = document.getElementById('teacherClassroomName');
    if (classroomNameEl) {
      classroomNameEl.textContent = this.settings?.className || classroom.className;
    }
    
    // Vis oversikt som standard
    this.showTeacherScreen('overview');
    
    // Last elever i dropdown
    await this.loadStudentsDropdown();
    
    // Last eleveoversikt
    await this.loadStudentsTable();
    
    // Last transaksjonshistorikk
    await this.loadTeacherTransactions();
    
    // Setup teacher buttons
    this.setupTeacherButtons();
  }

  /**
   * Vis superadmin dashboard
   */
  async showSuperadminDashboard() {
    const user = authService.getCurrentUser();
    
    // Skjul alle andre dashboards
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('studentDashboard')?.classList.add('hidden');
    document.getElementById('teacherDashboard')?.classList.add('hidden');
    document.getElementById('superadminDashboard').classList.remove('hidden');
    
    // Fyll inn brukerinfo
    document.getElementById('superadminName').textContent = user.name;

    // Hent alltid ferske klasserom fra Firebase for korrekt visning/sletting
    await this.refreshClassroomCacheFromFirebase();
    
    // Last statistikk
    await this.loadSuperadminStats();

    // Synk periode-kontroller med valgt visning
    await this.syncLoginStatsFilterControls();

    // Last innloggingsstatistikk
    await this.loadLoginStats();

    // Last geografisk statistikk
    await this.loadGeoStats();

    // Last lærersøknader
    await this.loadTeacherRequests();

    // Last lærerliste (med innloggingstall)
    await this.loadTeachersList();

    // Last klasserom-liste
    await this.loadAllClassrooms();
  }

  // loadSuperadminStats, loadLoginStats, switchLoginStatsView, loadGeoStats —
  // moved to features/stats/controllers/statsController.js

  // loadAllClassrooms, deleteClassroomAsSuperadmin, refreshClassroomCacheFromFirebase
  // — moved to features/classroom/controllers/classroomController.js

  /**
   * Refresh lærer dashboard
   */
  async refreshTeacherDashboard() {
    const user = authService.getCurrentUser();
    if (!user || user.type !== 'teacher') return;
    
    // Oppdater eleveoversikt
    await this.loadStudentsTable();
    
    // Oppdater elev-dropdown for "Gi penger"
    await this.loadStudentsDropdown();
    
    // Oppdater transaksjoner
    await this.loadTeacherTransactions();
    
    // Oppdater jobber hvis på jobb-skjermen
    const jobsScreen = document.getElementById('teacherJobsScreen');
    if (jobsScreen && !jobsScreen.classList.contains('hidden')) {
      await this.loadTeacherJobs();
    }
  }

  /**
   * Tving refresh av lærer-dashboard uten å logge ut
   */
  async refreshTeacherDashboardManually(buttonElement = null) {
    const refreshBtn = buttonElement || document.getElementById('teacherRefreshBtn');
    const refreshHtml = `🔄 <span data-i18n="btn.refresh">${languageService.t('btn.refresh')}</span>`;
    const refreshingText = `⏳ ${languageService.t('btn.refreshing')}`;

    try {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = refreshingText;
      }

      await this.refreshAllServiceCaches();
      await authService.refreshCurrentUser();

      const user = authService.getCurrentUser();
      const classroom = classroomService.getClassroomByTeacher(user.id);
      this.currentClassroom = classroom;
      this.settings = await settingsService.getSettings();

      const classroomNameEl = document.getElementById('teacherClassroomName');
      if (classroomNameEl) {
        classroomNameEl.textContent = this.settings?.className || classroom?.className || '';
      }

      await this.loadStudentsDropdown();
      await this.loadStudentsTable();
      await this.loadTeacherTransactions();

      this.showTeacherScreen(this.currentTeacherScreen || 'overview');
      await this.updateAllBadges();

      uiManager.showSuccess('Lærerdata oppdatert');
    } catch (error) {
      console.error('Feil ved manuell lærer-refresh:', error);
      uiManager.showError('Kunne ikke oppdatere lærerdata');
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = refreshHtml;
      }
    }
  }

  /**
   * Tving refresh av elev-dashboard uten å logge ut
   */
  async refreshStudentDashboardManually(buttonElement = null) {
    const refreshBtn = buttonElement || document.getElementById('studentRefreshBtn');
    const refreshHtml = `🔄 <span data-i18n="btn.refresh">${languageService.t('btn.refresh')}</span>`;
    const refreshingText = `⏳ ${languageService.t('btn.refreshing')}`;

    try {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = refreshingText;
      }

      await this.refreshAllServiceCaches();
      await authService.refreshCurrentUser();

      const user = authService.getCurrentUser();
      const classroom = classroomService.getClassroomById(user.classroomId);
      this.currentClassroom = classroom;

      // Hent alltid ferske innstillinger (sikrer riktig valuta fra lærerens settings)
      this.settings = await settingsService.getSettings();

      document.getElementById('studentName').textContent = user.name;
      document.getElementById('studentAccountNumber').textContent = user.accountNumber;
      document.getElementById('studentBalance').textContent = formatCurrency(user.balance, this.settings?.currencySymbol || 'KKr');

      const classroomNameEl = document.getElementById('studentClassroomName');
      if (classroomNameEl) {
        classroomNameEl.textContent = this.settings?.className || classroom?.className || '';
      }

      await this.loadStudentTransactions();
      await this.loadStudentActiveJobsSummary();
      await this.loadStudentAccountsSummary();

      // Synk visning av lån-/bedriftsfaner med oppdaterte innstillinger
      const loansBtn = document.getElementById('studentLoansBtn');
      if (loansBtn) {
        const loansEnabled = this.settings?.loans?.enabled;
        loansBtn.classList.toggle('hidden', !loansEnabled);
      }
      const businessesBtn = document.getElementById('studentBusinessesBtn');
      if (businessesBtn) {
        const businessesEnabled = this.settings?.businesses?.enabled || this.settings?.enableBusinesses;
        businessesBtn.classList.toggle('hidden', !businessesEnabled);
      }

      const loansEnabled = this.settings?.loans?.enabled;
      const targetScreen = (this.currentStudentScreen === 'loans' && !loansEnabled)
        ? 'overview'
        : (this.currentStudentScreen || 'overview');

      this.showStudentScreen(targetScreen);
      await this.updateInboxBadge();
      await this.updateAllBadges();

      uiManager.showSuccess('Elevdata oppdatert');
    } catch (error) {
      console.error('Feil ved manuell elev-refresh:', error);
      uiManager.showError('Kunne ikke oppdatere elevdata');
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = refreshHtml;
      }
    }
  }

  // [extracted to features/jobs/controllers/jobsController.js]

  // formatLoginPeriodLabel, syncLoginStatsFilterControls —
  // moved to features/stats/controllers/statsController.js

  /**
   * Vis modal for å opprette jobb
   */
  async showCreateJobModal() {
    // Last elever til dropdown
    const students = await userService.getAllStudents();
    const select = document.getElementById('jobAssignStudent');
    
    select.innerHTML = `<option value="">${languageService.t('ui.selectStudentDash')}</option>` +
      students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    // Sett valutasymbol
    const currencyLabel = document.getElementById('jobCurrencyLabel');
    if (currencyLabel) {
      currencyLabel.textContent = this.settings?.currencySymbol || 'KKr';
    }
    
    // Reset form og skjul direkte tilbud-seksjon
    document.getElementById('createJobForm')?.reset();
    document.getElementById('jobDirectOfferSection')?.classList.add('hidden');
    document.getElementById('jobOfferType').value = 'open';
    
    // Vis modal
    document.getElementById('createJobModal').classList.remove('hidden');
  }
  
  /**
   * Toggle visning av direkte tilbud-seksjon (lærer)
   */
  toggleJobDirectOffer() {
    const offerType = document.getElementById('jobOfferType')?.value;
    const directSection = document.getElementById('jobDirectOfferSection');
    
    if (offerType === 'direct') {
      directSection?.classList.remove('hidden');
    } else {
      directSection?.classList.add('hidden');
    }
  }

  /**
   * Opprett jobb
   */
  async handleCreateJob() {
    // Forhindre dobbel-innsending
    if (this._isCreatingJob) {
      console.log('⚠️ Jobb-opprettelse allerede pågår, ignorerer...');
      return;
    }
    this._isCreatingJob = true;

    console.log('═══════════════════════════════════════');
    console.log('🎯 handleCreateJob STARTER');
    console.log('═══════════════════════════════════════');

    // Les verdier fra form
    const titleEl = document.getElementById('jobTitle');
    const descEl = document.getElementById('jobDescription');
    const salaryEl = document.getElementById('jobSalary');
    const typeEl = document.getElementById('jobType');
    const offerTypeEl = document.getElementById('jobOfferType');
    const assignEl = document.getElementById('jobAssignStudent');
    
    const title = titleEl?.value;
    const description = descEl?.value;
    const salaryRaw = salaryEl?.value;
    const salary = parseInt(salaryRaw);
    const type = typeEl?.value;
    const offerType = offerTypeEl?.value || 'open';
    const targetStudentId = assignEl?.value || null;

    console.log('📝 Form verdier:');
    console.log('  - title:', title);
    console.log('  - description:', description);
    console.log('  - salary:', salary);
    console.log('  - type:', type);
    console.log('  - offerType:', offerType);
    console.log('  - targetStudentId:', targetStudentId);

    if (!title || !salary || !type) {
      uiManager.showError(languageService.t('error.fillRequiredFields'));
      this._isCreatingJob = false;
      return;
    }

    // Hvis direkte tilbud, må en elev være valgt
    if (offerType === 'direct' && !targetStudentId) {
      uiManager.showError(languageService.t('error.selectStudentForOffer'));
      this._isCreatingJob = false;
      return;
    }

    console.log('✅ Validering OK');

    try {
      // Når det er et direkte tilbud, marker jobben slik at den ikke vises i åpne stillinger
      const isDirectOffer = offerType === 'direct' && targetStudentId;

      const jobData = {
        title,
        description,
        salary,
        type,
        status: 'active',
        assignedTo: null,
        isDirectOffer: isDirectOffer  // Marker at dette er et direkte tilbud
      };

      console.log('📤 Sender jobData til jobService.createJob:', jobData);
      const job = await jobService.createJob(jobData);
      console.log('✅ Jobb opprettet med ID:', job.id);

      // Hvis direkte tilbud, send jobbtilbud
      if (offerType === 'direct' && targetStudentId) {
        const targetStudent = dataService.getUserById(targetStudentId);
        const user = authService.getCurrentUser();
        const classroom = classroomService.getClassroomByTeacher(user.id);
        
        const jobOffer = {
          id: 'joffer_' + Date.now(),
          jobId: job.id,
          jobTitle: title,
          jobType: type,
          salary: salary,
          employeeId: targetStudentId,
          employeeName: targetStudent?.name || languageService.t('common.unknown'),
          classroomId: classroom?.id,
          status: 'pending',
          isTeacherJob: true,
          createdAt: new Date().toISOString()
        };

        await dataService.createJobOffer(jobOffer);

        uiManager.showSuccess(`${languageService.t('msg.jobOfferSentTo')} ${targetStudent?.name}!`);
      } else {
        uiManager.showSuccess(type === 'project' ? languageService.t('msg.projectCreated') : languageService.t('msg.fixedJobCreated'));
      }
      
      // Skjul modal og reset form
      document.getElementById('createJobModal').classList.add('hidden');
      document.getElementById('createJobForm').reset();
      
      // Refresh jobber
      await this.loadTeacherJobs();
    } catch (error) {
      console.error('Feil ved opprettelse av jobb:', error);
      uiManager.showError(error.message || languageService.t('error.couldNotCreateJob'));
    } finally {
      // Reset flag for å tillate ny jobb-opprettelse
      this._isCreatingJob = false;
    }
  }

  /**
   * Vis teacher screen
   */
  showTeacherScreen(screen) {
    this.currentTeacherScreen = screen;
    const screens = ['overview', 'jobs', 'loans', 'businesses', 'tax', 'messages'];
    const buttons = {
      overview: document.getElementById('teacherOverviewBtn'),
      jobs: document.getElementById('teacherJobsBtn'),
      loans: document.getElementById('teacherLoansBtn'),
      businesses: document.getElementById('teacherBusinessesBtn'),
      tax: document.getElementById('teacherTaxBtn'),
      messages: document.getElementById('teacherMessagesBtn')
    };

    // Oppdater knapper
    screens.forEach(s => {
      const btn = buttons[s];
      if (btn) {
        const isMessages = s === 'messages';
        btn.className = s === screen 
          ? `flex-1 min-w-[100px] bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm${isMessages ? ' relative' : ''}`
          : `flex-1 min-w-[100px] bg-white hover:bg-gray-200 text-gray-800 py-2 rounded-lg text-sm${isMessages ? ' relative' : ''}`;
      }
    });

    // Vis riktig screen
    screens.forEach(s => {
      const screenEl = document.getElementById(`teacher${s.charAt(0).toUpperCase() + s.slice(1)}Screen`);
      if (screenEl) {
        screenEl.classList.toggle('hidden', s !== screen);
      }
    });

    // Last data for screen
    switch (screen) {
      case 'jobs':
        this.loadTeacherJobs();
        break;
      case 'loans':
        this.loadTeacherLoans();
        break;
      case 'businesses':
        this.loadTeacherBusinesses();
        break;
      case 'tax':
        this.loadTeacherTax();
        break;
      case 'messages':
        this.loadTeacherMessages();
        break;
    }
  }

  /**
   * Vis student screen
   */
  showStudentScreen(screen) {
    if (screen === 'loans' && !this.settings?.loans?.enabled) {
      screen = 'overview';
    }

    this.currentStudentScreen = screen;
    const screens = ['overview', 'inbox', 'jobs', 'savings', 'loans', 'businesses', 'settings'];
    const buttons = {
      overview: document.getElementById('studentOverviewBtn'),
      inbox: document.getElementById('studentInboxBtn'),
      jobs: document.getElementById('studentJobsBtn'),
      savings: document.getElementById('studentSavingsBtn'),
      loans: document.getElementById('studentLoansBtn'),
      businesses: document.getElementById('studentBusinessesBtn'),
      settings: document.getElementById('studentSettingsBtn')
    };

    // Oppdater knapper
    screens.forEach(s => {
      const btn = buttons[s];
      if (btn) {
        if (s === screen) {
          btn.className = btn.className.replace(/bg-white hover:bg-gray-200 text-gray-800/g, 'bg-blue-600 hover:bg-blue-700 text-white');
        } else {
          btn.className = btn.className.replace(/bg-blue-600 hover:bg-blue-700 text-white/g, 'bg-white hover:bg-gray-200 text-gray-800');
        }
      }
    });

    // Vis riktig screen
    screens.forEach(s => {
      const screenEl = document.getElementById(`student${s.charAt(0).toUpperCase() + s.slice(1)}Screen`);
      if (screenEl) {
        screenEl.classList.toggle('hidden', s !== screen);
      }
    });

    // Last data for screen
    switch (screen) {
      case 'inbox':
        this.loadStudentInbox();
        break;
      case 'jobs':
        this.loadStudentJobs();
        this.loadJobOffers(); // Last jobbtilbud
        break;
      case 'savings':
        this.loadStudentSavings();
        break;
      case 'loans':
        this.loadStudentLoansScreen();
        break;
      case 'businesses':
        this.loadStudentBusinesses();
        break;
      case 'settings':
        this.loadStudentSettings();
        break;
    }
  }

  /**
   * Last elevinnstillinger (fyll inn brukerdata)
   */
  loadStudentSettings() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const nameField = document.getElementById('studentProfileName');
    const usernameField = document.getElementById('studentProfileUsername');

    if (nameField) nameField.value = user.name || '';
    if (usernameField) usernameField.value = user.username || '';

    // Tøm passordfelter
    ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  /**
   * Gi penger til elev
   */
  async handleGiveMoney() {
    const recipientId = document.getElementById('giveMoneyRecipient')?.value;
    const amount = parseInt(document.getElementById('giveMoneyAmount')?.value);
    const message = document.getElementById('giveMoneyMessage')?.value?.trim() || languageService.t('msg.paymentFromTeacher');
    const form = document.getElementById('giveMoneyForm');
    const btn = form?.querySelector('button[type="submit"]');
    const originalHtml = btn?.innerHTML;

    if (!recipientId || !amount) {
      uiManager.showError(languageService.t('error.fillAllFields'));
      return;
    }

    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳...'; }

    try {
      let recipientIds = [];
      
      // Sjekk om "Alle elever" er valgt
      if (recipientId === '__ALL__') {
        const students = await userService.getAllStudents();
        recipientIds = students.map(s => s.id);
        console.log('📢 Betaler til alle', recipientIds.length, 'elever');
      } else {
        recipientIds = [recipientId];
      }
      
      // Korrekt API-kall: giveMoney(recipientIds, amount, message)
      await transactionService.giveMoney(recipientIds, amount, message);
      
      const successMessage = recipientId === '__ALL__' 
        ? `${formatCurrency(amount, this.settings.currencySymbol)} ${languageService.t('msg.givenToAllStudents') || 'utbetalt til alle elever'}`
        : `${formatCurrency(amount, this.settings.currencySymbol)} ${languageService.t('msg.givenToStudent')}`;
      
      uiManager.showSuccess(successMessage);
      
      // Reset form
      document.getElementById('giveMoneyForm')?.reset();
      
      // Oppdater dashboard umiddelbart
      await this.refreshTeacherDashboard();
    } catch (error) {
      console.error('Feil ved gi penger:', error);
      uiManager.showError(error.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
  }

  // [extracted to features/jobs/controllers/jobsController.js]

  /**
   * Refresh student dashboard
   */
  async refreshStudentDashboard() {
    const user = authService.getCurrentUser();
    if (!user || user.type !== 'student') return;
    
    // Refresh bruker for oppdatert saldo
    await authService.refreshCurrentUser();
    const updatedUser = authService.getCurrentUser();
    
    // Oppdater saldo
    const balanceEl = document.getElementById('studentBalance');
    if (balanceEl) {
      balanceEl.textContent = formatCurrency(updatedUser.balance, this.settings.currencySymbol);
    }
    
    // Oppdater transaksjoner
    await this.loadStudentTransactions();
    
    // Oppdater jobber hvis på jobb-skjermen
    const jobsScreen = document.getElementById('studentJobsScreen');
    if (jobsScreen && !jobsScreen.classList.contains('hidden')) {
      await this.loadStudentJobs();
    }
  }

  /**
   * Start auto-refresh (simulerer sanntid)
   */
  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      if (authService.isAuthenticated()) {
        await this.updateBalanceDisplay();
        
        // Refresh transactions hvis vi er på transaction-skjermen
        const currentScreen = uiManager.getCurrentScreen();
        if (currentScreen === 'studentDashboard' || currentScreen === 'teacherDashboard') {
          // Kun refresh hvis nødvendig
        }
      }
    }, APP_CONFIG.refreshInterval);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // onLanguageChange — moved to features/i18n/controllers/i18nController.js

  // [extracted to features/jobs/controllers/jobsController.js]

  /**
   * Eksporter all data til JSON-fil (kan lagres manuelt)
   */
  exportDataToJSON() {
    try {
      const data = {
        users: dataService._getFromStorage('econsim_users') || [],
        jobs: dataService._getFromStorage('econsim_jobs') || [],
        transactions: dataService._getFromStorage('econsim_transactions') || [],
        applications: dataService._getFromStorage('econsim_applications') || [],
        settings: dataService._getFromStorage('econsim_settings') || {}
      };

      // Konverter til JSON
      const jsonString = JSON.stringify(data, null, 2);
      
      // Opprett blob og download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `econsim-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      uiManager.showSuccess(languageService.t('msg.dataExported'));
      console.log('📥 Data eksportert:', data);
    } catch (error) {
      console.error('Feil ved eksport:', error);
      uiManager.showError(languageService.t('error.exportFailed'));
    }
  }

  /**
   * Importer data fra JSON-fil
   */
  async importDataFromJSON(event) {
    try {
      const file = event.target.files[0];
      if (!file) return;

      console.log('📂 Laster opp fil:', file.name);

      // Les filen
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          console.log('📋 JSON-data lastet:', jsonData);

          // Valider at filen har riktig struktur
          if (!jsonData.users || !Array.isArray(jsonData.users)) {
            throw new Error(languageService.t('error.invalidJsonFile'));
          }

          // Bekreft import
          const userCount = jsonData.users.length;
          const jobCount = (jsonData.jobs || []).length;
          const txCount = (jsonData.transactions || []).length;

          if (!confirm(
            `${languageService.t('confirm.loadDataFromFile')}\n\n` +
            `${languageService.t('confirm.replaceAllData')}\n\n` +
            `${languageService.t('common.contains')}:\n` +
            `- ${userCount} ${languageService.t('common.users')}\n` +
            `- ${jobCount} ${languageService.t('common.jobs')}\n` +
            `- ${txCount} ${languageService.t('common.transactions')}\n\n` +
            `${languageService.t('confirm.areYouSure')}`
          )) {
            return;
          }

          // Lagre direkte til localStorage (passord er allerede hashet i eksportert fil)
          dataService._saveToStorage('econsim_users', jsonData.users);
          dataService._saveToStorage('econsim_jobs', jsonData.jobs || []);
          dataService._saveToStorage('econsim_transactions', jsonData.transactions || []);
          dataService._saveToStorage('econsim_applications', jsonData.applications || []);
          dataService._saveToStorage('econsim_settings', jsonData.settings || {});

          console.log('✅ Data importert!');
          uiManager.showSuccess(languageService.t('msg.dataLoaded'));

          // Vent litt, så reload
          setTimeout(() => {
            location.reload();
          }, 1500);

        } catch (parseError) {
          console.error('Feil ved parsing av JSON:', parseError);
          uiManager.showError(languageService.t('error.invalidJsonFile') + ': ' + parseError.message);
        }
      };

      reader.onerror = () => {
        console.error('Feil ved lesing av fil');
        uiManager.showError(languageService.t('error.couldNotReadFile'));
      };

      reader.readAsText(file);

      // Reset file input
      event.target.value = '';

    } catch (error) {
      console.error('Feil ved import:', error);
      uiManager.showError(languageService.t('error.importFailed'));
    }
  }

  /**
   * Reset til initial data fra JSON-fil
   */
  async resetToInitialData() {
    try {
      console.log('🔄 Resetter til initial data...');
      
      // Tøm localStorage
      localStorage.clear();
      
      uiManager.showSuccess(languageService.t('msg.dataReset'));
      
      // Vent litt, så reload
      setTimeout(() => {
        location.reload();
      }, 1000);
    } catch (error) {
      console.error('Feil ved reset:', error);
      uiManager.showError(languageService.t('error.resetFailed'));
    }
  }

  /**
   * Reset demo-klasserommet til initial data (kun demo-konto t1)
   */
  async resetDemoClassroom() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.id !== 't1') {
        uiManager.showError(languageService.t('error.unauthorized'));
        return;
      }

      // Bekreftelse
      const confirmMsg = languageService.t('confirm.resetDemoClassroom') || 
        '🔄 Dette vil tilbakestille demo-klasserommet til standard demo-data.\n\nAlle endringer du har gjort vil bli slettet.\n\nEr du sikker?';
      
      if (!confirm(confirmMsg)) {
        return;
      }

      console.log('� Resetter demo-klasserom...');
      const demoClassroomId = 'demo-classroom';

      // Last initial data først for å vite hvilke demo-elever som skal gjenopprettes
      const response = await fetch('data/initial-data.json');
      if (!response.ok) {
        throw new Error('Kunne ikke laste initial-data.json');
      }
      const initialData = await response.json();

      const initialDemoStudents = (initialData.users || []).filter(
        u => u.type === 'student' && u.classroomId === demoClassroomId
      );

      // Sørg for at kari123 ALLTID finnes, selv om initial-data endres
      const kariIndex = initialDemoStudents.findIndex(s => s.username === 'kari123');
      if (kariIndex >= 0) {
        // Tving kjent demo-innlogging for Kari
        initialDemoStudents[kariIndex] = {
          ...initialDemoStudents[kariIndex],
          id: initialDemoStudents[kariIndex].id || 's1',
          username: 'kari123',
          password: 'passord123',
          name: initialDemoStudents[kariIndex].name || 'Kari Nordmann',
          accountNumber: initialDemoStudents[kariIndex].accountNumber || '101',
          type: 'student',
          classroomId: demoClassroomId
        };
      } else {
        initialDemoStudents.push({
          id: 's1',
          username: 'kari123',
          password: 'passord123',
          name: 'Kari Nordmann',
          accountNumber: '101',
          type: 'student',
          balance: 1000,
          classroomId: demoClassroomId
        });
      }

      // 1. Slett all demo-klassedata (transaksjoner, jobber, bedrifter, lån, søknader, meldinger, osv.)
      // Kjøres før elevsletting for å fange opp legacy transaksjoner knyttet til elev-IDer
      await dataService.deleteAllClassroomData(demoClassroomId);

      // 2. Slett alle elever i demo-klasserommet
      const users = dataService.getUsersSync();
      const studentsToDelete = users.filter(u => u.classroomId === demoClassroomId && u.type === 'student');
      for (const student of studentsToDelete) {
        await dataService.deleteUser(student.id);
      }
      console.log(`✅ Slettet ${studentsToDelete.length} elever`);

      // 3. Opprett demo-elever på nytt fra initial data
      for (const student of initialDemoStudents) {
        // Rydd opp eventuelle gamle brukere med samme brukernavn
        const existingByUsername = await dataService.getUserByUsername(student.username);
        if (existingByUsername) {
          await dataService.deleteUser(existingByUsername.id);
        }
        await dataService.createUser(student);
      }
      console.log(`✅ Gjenopprettet ${initialDemoStudents.length} demo-elever (kari123 = passord123)`);

      // 4. Gjenopprett demo-innstillinger
      if (initialData.settings) {
        const classroom = await dataService.getClassroom(demoClassroomId);
        if (classroom) {
          const mergedSettings = { ...APP_CONFIG.defaults, ...initialData.settings };
          await dataService.updateClassroom(demoClassroomId, {
            className: mergedSettings.className,
            currencyName: mergedSettings.currencyName,
            currencySymbol: mergedSettings.currencySymbol,
            startingBalance: mergedSettings.startingBalance,
            settings: mergedSettings
          });
        }
      }

      // 5. Nullstill login-statistikk for demo-klasserom
      await statsService.resetClassroomStats(demoClassroomId);

      // 6. Oppdater caches
      await dataService.refreshUsersCache();
      await dataService.loadClassroomDataToCache(demoClassroomId);

      // 7. Sikre korrekt kobling mellom demo-lærer, klasserom og demo-elever
      await this.ensureDemoClassroomIntegrity();

      uiManager.showSuccess(languageService.t('msg.demoClassroomReset') || 'Demo-klasserom tilbakestilt!');
      
      // Vent litt, så reload
      setTimeout(() => {
        location.reload();
      }, 1000);
    } catch (error) {
      console.error('Feil ved reset av demo-klasserom:', error);
      uiManager.showError(languageService.t('error.resetFailed'));
    }
  }

  /**
   * Sikrer at demo-elev Kari alltid finnes med kjent innlogging
   */
  async ensureDemoKariAccess() {
    try {
      const hashedKariPassword = await hashPassword('passord123');
      const existingKari = await dataService.getUserByUsername('kari123');

      if (existingKari) {
        const updates = {
          type: 'student',
          classroomId: 'demo-classroom',
          password: hashedKariPassword,
          name: existingKari.name || 'Kari Nordmann',
          accountNumber: existingKari.accountNumber || '101'
        };

        // behold eksisterende saldo hvis den finnes, ellers bruk demo-startsaldo
        if (typeof existingKari.balance !== 'number') {
          updates.balance = 1000;
        }

        await dataService.updateUser(existingKari.id, updates);
      } else {
        await dataService.createUser({
          id: 's1',
          username: 'kari123',
          password: 'passord123',
          name: 'Kari Nordmann',
          accountNumber: '101',
          type: 'student',
          balance: 1000,
          classroomId: 'demo-classroom'
        });
      }

      await dataService.refreshUsersCache();
      console.log('✅ Kari demo-innlogging verifisert (kari123/passord123)');
    } catch (error) {
      console.warn('⚠️ Kunne ikke verifisere Kari demo-innlogging:', error);
    }
  }

  /**
   * Sikrer at demo-lærer, demo-klasserom og demo-elever er korrekt koblet sammen
   */
  async ensureDemoClassroomIntegrity() {
    try {
      const demoClassroomId = 'demo-classroom';
      const demoTeacherId = 't1';

      const response = await fetch('data/initial-data.json');
      if (!response.ok) {
        throw new Error('Kunne ikke laste initial-data.json');
      }
      const initialData = await response.json();

      const initialSettings = { ...APP_CONFIG.defaults, ...(initialData.settings || {}) };

      // 1) Sørg for at demo-klasserom finnes og peker på demo-lærer
      const existingClassroom = await dataService.getClassroom(demoClassroomId);
      if (existingClassroom) {
        await dataService.updateClassroom(demoClassroomId, {
          teacherId: demoTeacherId,
          className: initialSettings.className,
          currencyName: initialSettings.currencyName,
          currencySymbol: initialSettings.currencySymbol,
          startingBalance: initialSettings.startingBalance,
          settings: initialSettings,
          nextStudentNumber: existingClassroom.nextStudentNumber || 101,
          nextBusinessNumber: existingClassroom.nextBusinessNumber || 501
        });
      } else {
        await dataService.createClassroom({
          id: demoClassroomId,
          teacherId: demoTeacherId,
          className: initialSettings.className,
          currencyName: initialSettings.currencyName,
          currencySymbol: initialSettings.currencySymbol,
          startingBalance: initialSettings.startingBalance,
          nextStudentNumber: 101,
          nextBusinessNumber: 501,
          settings: initialSettings,
          createdAt: new Date().toISOString()
        });
      }

      // 2) Sørg for at demo-lærer finnes og er koblet til demo-klasserom
      const existingTeacher = await dataService.getUserByUsername('laerer');
      if (existingTeacher) {
        await dataService.updateUser(existingTeacher.id, {
          type: 'teacher',
          classroomId: demoClassroomId,
          name: existingTeacher.name || 'Demo Lærer',
          accountNumber: existingTeacher.accountNumber || '100'
        });
      } else {
        await dataService.createUser({
          id: demoTeacherId,
          username: 'laerer',
          password: 'passord',
          name: 'Demo Lærer',
          accountNumber: '100',
          type: 'teacher',
          balance: 0,
          classroomId: demoClassroomId
        });
      }

      // 3) Sørg for at alle demo-elever fra initial-data er koblet til demo-klasserom
      const initialDemoStudents = (initialData.users || []).filter(
        u => u.type === 'student' && u.classroomId === demoClassroomId
      );

      for (const student of initialDemoStudents) {
        const existingByUsername = await dataService.getUserByUsername(student.username);
        if (existingByUsername) {
          await dataService.updateUser(existingByUsername.id, {
            type: 'student',
            classroomId: demoClassroomId,
            name: student.name || existingByUsername.name,
            accountNumber: student.accountNumber || existingByUsername.accountNumber
          });
        }
      }

      await dataService.refreshUsersCache();
      console.log('✅ Demo-lærer, demo-klasserom og demo-elever er verifisert/koblet');
    } catch (error) {
      console.warn('⚠️ Kunne ikke verifisere demo-koblinger:', error);
    }
  }

  /**
   * Vis bekreftelsesdialog for sletting av klasse
   */
  async showDeleteClassConfirmation() {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || currentUser.type !== 'teacher') {
      uiManager.showError(languageService.t('error.onlyTeachersCanDelete'));
      return;
    }

    // Hent antall elever, jobber og bedrifter for å vise i advarselen
    const students = await userService.getAllStudents();
    const jobs = await jobService.getJobs();
    const businesses = businessService.getActiveBusinesses();
    const loans = loanService.getAllLoans();

    const message = `⚠️ ${languageService.t('confirm.deleteClassWarning')}\n\n` +
      `${languageService.t('confirm.willDelete')}:\n` +
      `• ${students.length} ${languageService.t('common.students')}\n` +
      `• ${jobs.length} ${languageService.t('common.jobs')}\n` +
      `• ${businesses.length} ${languageService.t('common.businesses')}\n` +
      `• ${loans.length} ${languageService.t('common.loans')}\n` +
      `• ${languageService.t('confirm.allTransactionsAndApplications')}\n` +
      `• ${languageService.t('confirm.allSavingsAndFunds')}\n` +
      `• ${languageService.t('confirm.allSettings')}\n\n` +
      `${languageService.t('confirm.classWillBeNew')}\n` +
      `${languageService.t('confirm.cannotUndo')}\n\n` +
      `${languageService.t('confirm.areYouSure')}`;

    if (confirm(message)) {
      // Ekstra bekreftelse
      const finalConfirm = confirm(languageService.t('confirm.lastChance'));
      if (finalConfirm) {
        await this.deleteClassData();
      }
    }
  }

  /**
   * Slett all klassedata (elever, bedrifter, lån, innstillinger)
   */
  async deleteClassData() {
    try {
      console.log('🗑️ Sletter all klassedata...');
      const classroomId = dataService.getCurrentClassroomId();

      if (!classroomId) {
        uiManager.showError(languageService.t('error.couldNotFindClassroom'));
        return;
      }

      // 1. Slett all klasseromsdata først (inkl. transaksjoner/statistikkgrunnlag)
      // Kjøres før elevsletting for å fange legacy transaksjoner uten classroomId
      await dataService.deleteAllClassroomData(classroomId);

      // 2. Slett alle elever i klasserommet
      const users = dataService.getUsersSync();
      const studentsToDelete = users.filter(u => u.classroomId === classroomId && u.type === 'student');
      for (const student of studentsToDelete) {
        await dataService.deleteUser(student.id);
      }
      console.log(`✅ Slettet ${studentsToDelete.length} elever`);

      // 3. Nullstill login-statistikk for klasserommet
      await statsService.resetClassroomStats(classroomId);
      console.log('✅ Nullstilt login-statistikk');

      // 4. Reset innstillinger til standard
      const defaultSettings = { ...APP_CONFIG.defaults };
      await settingsService.updateSettings(defaultSettings);
      console.log('✅ Innstillinger tilbakestilt');

      // 5. Reset klasserom-nummerering og klasserom-felt i Firebase
      await dataService.updateClassroom(classroomId, {
        className: defaultSettings.className,
        currencyName: defaultSettings.currencyName,
        currencySymbol: defaultSettings.currencySymbol,
        startingBalance: defaultSettings.startingBalance,
        settings: defaultSettings,
        nextStudentNumber: 101,
        nextBusinessNumber: 501
      });
      console.log('✅ Klasserom-nummerering tilbakestilt');

      // 6. Refresh alle cacher
      await dataService.refreshUsersCache();
      await dataService.loadClassroomDataToCache(classroomId);
      await this.refreshAllServiceCaches();

      // Lukk settings-modal
      document.getElementById('settingsModal').classList.add('hidden');

      uiManager.showSuccess(languageService.t('msg.classDeleted'));

      // Refresh dashboard
      await this.showTeacherDashboard();

    } catch (error) {
      console.error('Feil ved sletting av klasse:', error);
      uiManager.showError(languageService.t('error.deleteFailed') + ': ' + error.message);
    }
  }

  // getNormalizedProgressiveTaxInputs, updateTaxExamplePreview, updateTaxBracketLabels
  // — moved to features/taxes/controllers/taxesController.js

  /**
   * Vis innstillingsmodal
   */
  async showSettingsModal() {
    try {
      const settings = await settingsService.getSettings();
      const students = await userService.getAllStudents();
      const currentUser = authService.getCurrentUser();

      // Lærerens kontoinformasjon
      if (currentUser) {
        const nameEl = document.getElementById('settingsTeacherName');
        const usernameEl = document.getElementById('settingsTeacherUsername');
        const passwordEl = document.getElementById('settingsTeacherPassword');
        const passwordConfirmEl = document.getElementById('settingsTeacherPasswordConfirm');
        const emailEl = document.getElementById('settingsTeacherEmail');

        // Sjekk om dette er demo-kontoen (t1)
        const isDemoAccount = currentUser.id === 't1';

        // Navn
        if (nameEl) {
          nameEl.value = currentUser.name || '';
          nameEl.disabled = isDemoAccount;
          if (isDemoAccount) {
            nameEl.classList.add('bg-gray-100', 'cursor-not-allowed');
          } else {
            nameEl.classList.remove('bg-gray-100', 'cursor-not-allowed');
          }
        }

        if (usernameEl) {
          usernameEl.value = currentUser.username || '';
          usernameEl.disabled = isDemoAccount;
          if (isDemoAccount) {
            usernameEl.classList.add('bg-gray-100', 'cursor-not-allowed');
            usernameEl.title = languageService.t('settings.demoAccountLocked');
          } else {
            usernameEl.classList.remove('bg-gray-100', 'cursor-not-allowed');
            usernameEl.title = '';
          }
        }

        // E-post og verifikasjonsstatus
        if (emailEl) {
          emailEl.value = currentUser.email || '';
          emailEl.disabled = isDemoAccount;
        }
        await this.updateEmailVerificationStatus(currentUser);
        
        // Passord-feltene skal alltid være tomme
        if (passwordEl) {
          passwordEl.value = '';
          passwordEl.disabled = isDemoAccount;
          if (isDemoAccount) {
            passwordEl.classList.add('bg-gray-100', 'cursor-not-allowed');
            passwordEl.title = languageService.t('settings.demoAccountLocked');
          } else {
            passwordEl.classList.remove('bg-gray-100', 'cursor-not-allowed');
            passwordEl.title = '';
          }
        }
        if (passwordConfirmEl) {
          passwordConfirmEl.value = '';
          passwordConfirmEl.disabled = isDemoAccount;
          if (isDemoAccount) {
            passwordConfirmEl.classList.add('bg-gray-100', 'cursor-not-allowed');
            passwordConfirmEl.title = languageService.t('settings.demoAccountLocked');
          } else {
            passwordConfirmEl.classList.remove('bg-gray-100', 'cursor-not-allowed');
            passwordConfirmEl.title = '';
          }
        }
        
        // Vis/skjul melding om demo-konto
        let demoNote = document.getElementById('demoAccountNote');
        if (isDemoAccount) {
          if (!demoNote) {
            demoNote = document.createElement('p');
            demoNote.id = 'demoAccountNote';
            demoNote.className = 'text-xs text-amber-600 mt-2';
            demoNote.innerHTML = `⚠️ ${languageService.t('settings.demoAccountNote')}`;
            usernameEl?.parentElement?.parentElement?.parentElement?.appendChild(demoNote);
          }
        } else if (demoNote) {
          demoNote.remove();
        }
        
        // Vis/skjul riktig seksjon basert på demo-konto
        const deleteClassSection = document.getElementById('deleteClassSection');
        const resetDemoSection = document.getElementById('resetDemoSection');
        if (deleteClassSection && resetDemoSection) {
          if (isDemoAccount) {
            deleteClassSection.classList.add('hidden');
            resetDemoSection.classList.remove('hidden');
          } else {
            deleteClassSection.classList.remove('hidden');
            resetDemoSection.classList.add('hidden');
          }
        }
      }

      // Grunnleggende innstillinger
      document.getElementById('settingsClassName').value = settings.className || '7A';
      document.getElementById('settingsCurrencyName').value = settings.currencyName || 'KlasseKrone';
      document.getElementById('settingsCurrencySymbol').value = settings.currencySymbol || 'KKr';
      document.getElementById('settingsStartingBalance').value = settings.startingBalance || 1000;

      // Skattesystem
      const taxSettings = settings.tax || {};
      const enableTaxEl = document.getElementById('settingsEnableTax');
      const taxOptionsEl = document.getElementById('taxOptions');
      if (enableTaxEl) {
        enableTaxEl.checked = taxSettings.enabled || false;
        if (taxOptionsEl) {
          taxOptionsEl.classList.toggle('hidden', !taxSettings.enabled);
        }
      }
      
      // Tax type
      const taxTypeRadios = document.getElementsByName('taxType');
      taxTypeRadios.forEach(radio => {
        radio.checked = radio.value === (taxSettings.type || 'flat');
      });
      
      // Flat tax
      const flatTaxRateEl = document.getElementById('settingsFlatTaxRate');
      const flatTaxOptionsEl = document.getElementById('flatTaxOptions');
      if (flatTaxRateEl) flatTaxRateEl.value = taxSettings.flatRate || 20;
      if (flatTaxOptionsEl) flatTaxOptionsEl.classList.toggle('hidden', taxSettings.type === 'progressive');
      
      // Progressive tax brackets
      const progressiveTaxOptionsEl = document.getElementById('progressiveTaxOptions');
      if (progressiveTaxOptionsEl) progressiveTaxOptionsEl.classList.toggle('hidden', taxSettings.type !== 'progressive');
      
      // Fradragsgrense (skjul ved progressiv skatt)
      const deductionOptionsEl = document.getElementById('deductionOptions');
      if (deductionOptionsEl) deductionOptionsEl.classList.toggle('hidden', taxSettings.type === 'progressive');
      
      const b1MaxEl = document.getElementById('taxBracket1Max');
      const b2RateEl = document.getElementById('taxBracket2Rate');
      const b2MaxEl = document.getElementById('taxBracket2Max');
      const b3RateEl = document.getElementById('taxBracket3Rate');

      if (taxSettings.brackets && taxSettings.brackets.length >= 3) {
        if (b1MaxEl) b1MaxEl.value = taxSettings.brackets[0].max || 500;
        if (b2RateEl) b2RateEl.value = taxSettings.brackets[1].rate || 25;
        if (b2MaxEl) b2MaxEl.value = taxSettings.brackets[1].max || 1500;
        if (b3RateEl) b3RateEl.value = taxSettings.brackets[2].rate || 35;
      }

      // Legg til event listeners for dynamisk oppdatering (kun én gang)
      [b1MaxEl, b2MaxEl, b2RateEl, b3RateEl].forEach(el => {
        if (el && el.dataset.taxPreviewBound !== 'true') {
          el.dataset.taxPreviewBound = 'true';
          el.addEventListener('input', () => this.updateTaxBracketLabels());
        }
      });

      // Validering av grenseverdier ved blur/Enter (ikke under skriving)
      [b1MaxEl, b2MaxEl].forEach(el => {
        if (el && el.dataset.taxValidateBound !== 'true') {
          el.dataset.taxValidateBound = 'true';
          const validate = () => {
            const b1 = parseInt(document.getElementById('taxBracket1Max')?.value, 10);
            const b2 = parseInt(document.getElementById('taxBracket2Max')?.value, 10);
            const currency = this.settings?.currencySymbol || 'KKr';
            if (Number.isFinite(b1) && Number.isFinite(b2) && b2 <= b1) {
              uiManager.showError(languageService.t('settings.bracketOrderError', { b1, b2, currency }));
            }
          };
          el.addEventListener('blur', validate);
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); validate(); } });
        }
      });

      // Oppdater dynamiske grenseverdier + eksempel uansett (også når brackets mangler i settings)
      this.updateTaxBracketLabels();
      
      const deductionEl = document.getElementById('settingsTaxDeduction');
      const dividendEl = document.getElementById('settingsDividendTax');
      if (deductionEl) deductionEl.value = taxSettings.deductionLimit || 100;
      if (dividendEl) dividendEl.value = taxSettings.dividendTaxRate || 22;

      // Lånesystem
      const loanSettings = settings.loans || {};
      const enableLoansEl = document.getElementById('settingsEnableLoans');
      const loanOptionsEl = document.getElementById('loanOptions');
      if (enableLoansEl) {
        enableLoansEl.checked = loanSettings.enabled || false;
        if (loanOptionsEl) {
          loanOptionsEl.classList.toggle('hidden', !loanSettings.enabled);
        }
      }
      const loanRateEl = document.getElementById('settingsLoanInterestRate');
      if (loanRateEl) loanRateEl.value = loanSettings.defaultInterestRate || 5;

      // Spare- og fond
      const savingsSettings = settings.savings || {};
      const fundsSettings = settings.funds || {};
      const savingsRateEl = document.getElementById('settingsSavingsRate');
      const fundRateEl = document.getElementById('settingsFundRate');
      const timeModelEl = document.getElementById('settingsTimeModel');
      if (savingsRateEl) savingsRateEl.value = savingsSettings.annualRate || 2;
      if (fundRateEl) fundRateEl.value = fundsSettings.expectedReturn || 8;
      if (timeModelEl) {
        timeModelEl.value = settings.simulation?.timeModel || 'accelerated';
      }

      // Bedriftssystem
      const businessSettings = settings.businesses || {};
      const enableBusinessesEl = document.getElementById('settingsEnableBusinesses');
      const businessOptionsEl = document.getElementById('businessOptions');
      if (enableBusinessesEl) {
        enableBusinessesEl.checked = businessSettings.enabled || false;
        if (businessOptionsEl) {
          businessOptionsEl.classList.toggle('hidden', !businessSettings.enabled);
        }
      }
      const startupCostEl = document.getElementById('settingsBusinessStartupCost');
      const empFactorEl = document.getElementById('settingsEmployeeCostFactor');
      const reqApprovalEl = document.getElementById('settingsRequireJobApproval');
      if (startupCostEl) startupCostEl.value = businessSettings.startupCost || 500;
      if (empFactorEl) empFactorEl.value = businessSettings.employeeCostFactor || 500;
      if (reqApprovalEl) reqApprovalEl.checked = businessSettings.requireApproval !== false;

      // Last elevliste
      this.renderStudentList(students);

      // Vis modal
      document.getElementById('settingsModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved lasting av innstillinger:', error);
      uiManager.showError(languageService.t('error.couldNotLoadSettings'));
    }
  }

  // ==================== LÅN FUNKSJONER ====================
  // Loan controller methods (loadTeacherLoans, showLoanCategory, showCreateLoanModal,
  // updateLoanPreview, createLoan, generateLoanContract, deleteLoan,
  // showApproveLoanModal, approveLoanApplication, showRejectLoanModal,
  // rejectLoanApplication) are extracted to features/loans/controllers/loansController.js
  // and merged onto EconSimApp.prototype via Object.assign at the bottom of this file.

  // ==================== BEDRIFT FUNKSJONER ====================

  // [extracted to features/businesses/controllers/businessesController.js]

  // [extracted to features/jobs/controllers/jobsController.js]

  // [extracted to features/businesses/controllers/businessesController.js]

  // Tidligere fantes en eldre, synkron showSellOwnershipModal her som
  // ble skygget av den asynkrone versjonen lenger nede. Beholdt
  // funksjonalitet (currency-formatering og loadModalOwnershipOffers)
  // er flyttet inn i den aktive versjonen.

  // [extracted to features/businesses/controllers/businessesController.js]

  // [extracted to features/jobs/controllers/jobsController.js]

  // [extracted to features/businesses/controllers/businessesController.js]

  // ==================== SPARING/FOND FUNKSJONER ====================

  // loadStudentSavings — moved to features/savings/controllers/savingsController.js

  // ==================== INNBOKS FUNKSJONER ====================

  // loadStudentInbox, updateCategoryBadge, renderInboxCategory, showInboxCategory,
  // renderOutboxCategory, loadMessageRecipients, sendStudentMessage, deleteMessage,
  // updateInboxBadge, openMessage, replyToMessage, openStudentReplyForm,
  // openBusinessReplyForm, openTeacherReplyForm, printMessage, markMessageAsRead,
  // markAllAsRead — moved to features/notifications/controllers/notificationsController.js

  // viewTaxStatement — moved to features/taxes/controllers/taxesController.js

  // ==================== SLUTT INNBOKS ====================

  /**
   * Lagre elevens innstillinger (inkludert passordendring)
   */
  async saveStudentSettings() {
    const user = authService.getCurrentUser();
    if (!user) {
      uiManager.showError(languageService.t('error.mustBeLoggedIn'));
      return;
    }

    try {
      const updates = {};
      
      // Hent brukernavn (kan endres)
      const newUsername = document.getElementById('studentProfileUsername')?.value?.trim();
      if (newUsername && newUsername !== user.username) {
        // Sjekk om brukernavn er ledig
        const allUsers = classroomService.getUsers();
        if (allUsers.some(u => u.username === newUsername && u.id !== user.id)) {
          uiManager.showError(languageService.t('error.usernameInUse'));
          return;
        }
        updates.username = newUsername;
      }

      // Passordendring
      const currentPassword = document.getElementById('currentPassword')?.value;
      const newPassword = document.getElementById('newPassword')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      
      if (currentPassword || newPassword || confirmPassword) {
        // Alle felt må fylles ut
        if (!currentPassword || !newPassword || !confirmPassword) {
          uiManager.showError(languageService.t('error.fillAllPasswordFields'));
          return;
        }
        
        // Bekreft passord matcher
        if (newPassword !== confirmPassword) {
          uiManager.showError(languageService.t('error.passwordMismatch'));
          return;
        }
        
        // Sjekk lengde
        if (newPassword.length < 6) {
          uiManager.showError(languageService.t('error.passwordTooShort'));
          return;
        }
        
        // Verifiser nåværende passord
        const { hashPassword, verifyPassword } = await import('./shared/utils/helpers.js');
        const isPasswordCorrect = await verifyPassword(currentPassword, user.password);
        if (!isPasswordCorrect) {
          uiManager.showError(languageService.t('error.currentPasswordWrong'));
          return;
        }
        
        // Hash nytt passord og fjern initialPassword (ikke lenger gyldig)
        updates.password = await hashPassword(newPassword);
        updates.initialPassword = null;
      }

      // Oppdater bruker hvis det er endringer
      if (Object.keys(updates).length > 0) {
        await dataService.updateUser(user.id, updates);
        await authService.refreshCurrentUser();
        
        // Tøm passord-feltene
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        uiManager.showSuccess(languageService.t('msg.settingsSaved'));
      } else {
        uiManager.showSuccess(languageService.t('msg.noChangesToSave'));
      }
    } catch (error) {
      console.error('Feil ved lagring av innstillinger:', error);
      uiManager.showError(error.message);
    }
  }

  // depositToSavings, withdrawFromSavings, depositToFund, withdrawFromFund
  // — moved to features/savings/controllers/savingsController.js

  // ==================== SKATT FUNKSJONER ====================

  // loadTeacherTax — moved to features/taxes/controllers/taxesController.js

  // loadTeacherMessages, updateTeacherCategoryBadge, renderTeacherInboxCategory,
  // showTeacherInboxCategory, renderTeacherOutboxCategory, deleteTeacherMessage,
  // sendTeacherMessage, openTeacherMessage, markTeacherMessageAsRead,
  // markAllTeacherMessagesAsRead, updateTeacherMessagesBadge —
  // moved to features/notifications/controllers/notificationsController.js

  // disburseTaxFunds — moved to features/taxes/controllers/taxesController.js

  /**
   * Lagre innstillinger
   */
  async saveSettings() {
    try {
      const currentUser = authService.getCurrentUser();
      const isDemoAccount = currentUser?.id === 't1';
      
      // Håndter endring av navn, brukernavn og passord (kun for ikke-demo-kontoer)
      const newName = isDemoAccount ? null : document.getElementById('settingsTeacherName')?.value?.trim();
      const newUsername = isDemoAccount ? null : document.getElementById('settingsTeacherUsername')?.value?.trim();
      const newPassword = isDemoAccount ? null : document.getElementById('settingsTeacherPassword')?.value;
      const confirmPassword = isDemoAccount ? null : document.getElementById('settingsTeacherPasswordConfirm')?.value;

      // Valider brukernavn
      if (newUsername && newUsername !== currentUser.username) {
        // Sjekk om brukernavnet allerede er i bruk
        const existingUser = await dataService.getUserByUsername(newUsername);
        if (existingUser && existingUser.id !== currentUser.id) {
          uiManager.showError(languageService.t('error.usernameInUse'));
          return;
        }
      }
      
      // Valider passord
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          uiManager.showError(languageService.t('error.passwordMismatch'));
          return;
        }
        if (newPassword.length < 4) {
          uiManager.showError(languageService.t('error.passwordMin4Chars'));
          return;
        }
      }

      // Hent tax type
      const taxTypeRadios = document.getElementsByName('taxType');
      let taxType = 'flat';
      for (const radio of taxTypeRadios) {
        if (radio.checked) {
          taxType = radio.value;
          break;
        }
      }

      const newSettings = {
        // Grunnleggende
        className: document.getElementById('settingsClassName')?.value?.trim() || '7A',
        currencyName: document.getElementById('settingsCurrencyName')?.value?.trim() || 'KlasseKrone',
        currencySymbol: document.getElementById('settingsCurrencySymbol')?.value?.trim() || 'KKr',
        startingBalance: parseInt(document.getElementById('settingsStartingBalance')?.value) || 1000,
        
        // Skattesystem
        tax: {
          enabled: document.getElementById('settingsEnableTax')?.checked || false,
          type: taxType,
          flatRate: parseInt(document.getElementById('settingsFlatTaxRate')?.value) || 20,
          brackets: [
            (() => {
              const { b1Max, b2Max, b2Rate, b3Rate } = this.getNormalizedProgressiveTaxInputs();
              return { min: 0, max: b1Max, rate: 0 };
            })(),
            (() => {
              const { b1Max, b2Max, b2Rate } = this.getNormalizedProgressiveTaxInputs();
              return { min: b1Max + 1, max: b2Max, rate: b2Rate };
            })(),
            (() => {
              const { b2Max, b3Rate } = this.getNormalizedProgressiveTaxInputs();
              return { min: b2Max + 1, max: null, rate: b3Rate };
            })()
          ],
          deductionLimit: parseInt(document.getElementById('settingsTaxDeduction')?.value) || 100,
          dividendTaxRate: parseInt(document.getElementById('settingsDividendTax')?.value) || 22
        },
        
        // Lånesystem
        loans: {
          enabled: document.getElementById('settingsEnableLoans')?.checked || false,
          defaultInterestRate: parseFloat(document.getElementById('settingsLoanInterestRate')?.value) || 5
        },
        
        // Spare- og fondssystem
        savings: {
          enabled: true,
          annualRate: parseFloat(document.getElementById('settingsSavingsRate')?.value) || 2
        },
        funds: {
          enabled: true,
          expectedReturn: parseFloat(document.getElementById('settingsFundRate')?.value) || 8,
          variance: 3
        },

        // Tidsmodell for rente/avkastning
        simulation: {
          timeModel: document.getElementById('settingsTimeModel')?.value || 'accelerated'
        },
        
        // Bedriftssystem
        businesses: {
          enabled: document.getElementById('settingsEnableBusinesses')?.checked || false,
          startupCost: parseInt(document.getElementById('settingsBusinessStartupCost')?.value) || 500,
          employeeCostFactor: parseInt(document.getElementById('settingsEmployeeCostFactor')?.value) || 500,
          requireApproval: document.getElementById('settingsRequireJobApproval')?.checked !== false
        }
      };

      // Valider
      if (!newSettings.className || !newSettings.currencyName || !newSettings.currencySymbol) {
        uiManager.showError(languageService.t('error.fillAllFields'));
        return;
      }

      if (newSettings.startingBalance < 0) {
        uiManager.showError(languageService.t('error.startCapitalPositive'));
        return;
      }

      // Lagre
      await settingsService.updateSettings(newSettings);
      
      // Oppdater lærerens navn, brukernavn og passord hvis endret
      const userUpdates = {};
      if (newName && newName !== currentUser.name) {
        userUpdates.name = newName;
      }
      if (newUsername && newUsername !== currentUser.username) {
        userUpdates.username = newUsername;
      }
      if (newPassword) {
        // Hash passordet før lagring
        userUpdates.password = await hashPassword(newPassword);
      }
      if (Object.keys(userUpdates).length > 0) {
        await dataService.updateUser(currentUser.id, userUpdates);
        // Oppdater session med nye brukerdata
        await authService.refreshCurrentUser();

        // Oppdater navn-visning i dashboard hvis endret
        if (userUpdates.name) {
          const teacherNameEl = document.getElementById('teacherName');
          if (teacherNameEl) teacherNameEl.textContent = userUpdates.name;
        }
      }
      
      // Oppdater applikasjons-settings og refresh fra lagring
      this.settings = await settingsService.getSettings();

      uiManager.showSuccess(languageService.t('msg.settingsSaved'));
      
      // Oppdater valutavisning i hele UI
      this.updateCurrencyDisplay();
      
      // Lukk modal
      document.getElementById('settingsModal').classList.add('hidden');

      // Refresh dashboard for å vise nye innstillinger
      const user = authService.getCurrentUser();
      if (user.type === 'teacher') {
        await this.showTeacherDashboard();
      }
    } catch (error) {
      console.error('Feil ved lagring av innstillinger:', error);
      uiManager.showError(error.message);
    }
  }

  // showStatisticsModal, loadStatisticsData, renderStatsStudentTable,
  // renderStatisticsCharts, printStatistics, exportStatisticsToExcel,
  // showStudentStatistics, loadStudentStatisticsData, renderStudentExpenseChart —
  // moved to features/stats/controllers/statsController.js

}

// Slå sammen feature controllers inn på EconSimApp.prototype slik at
// `this.*`-semantikk og inline `window.econSim.method()`-kall fortsatt virker.
Object.assign(
  EconSimApp.prototype,
  savingsControllerMethods,
  taxesControllerMethods,
  classroomControllerMethods,
  i18nControllerMethods,
  transactionsControllerMethods,
  loansControllerMethods,
  usersControllerMethods,
  authControllerMethods,
  notificationsControllerMethods,
  statsControllerMethods,
  jobsControllerMethods,
  businessesControllerMethods,
);

// Start applikasjonen når DOM er klar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new EconSimApp();
    app.init();

    // Gjør app tilgjengelig globalt for debugging
    window.econSim = app;
  });
} else {
  const app = new EconSimApp();
  app.init();
  window.econSim = app;
}

export default EconSimApp;


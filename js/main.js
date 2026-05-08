/**
 * Main Application Entry Point
 * Initialiserer og starter hele applikasjonen
 */

import { dataService } from './shared/core/dataService.js';
import { authService } from './features/auth/index.js';
import { eventBus, EVENTS } from './shared/core/eventBus.js';
import { uiManager } from './shared/ui/uiManager.js';
import { transactionService } from './features/transactions/index.js';
import {
  jobService,
  getPendingJobOffers as getPendingJobOffersUtil,
} from './features/jobs/index.js';
import {
  userService,
  generateUniqueUsername as generateUniqueUsernameUtil,
} from './features/users/index.js';
import { settingsService } from './features/settings/index.js';
import {
  taxService,
  computeTaxableRangeAmount,
} from './features/taxes/index.js';
import {
  loanService,
  getLoanApplicationsForUser as getLoanApplicationsForUserUtil,
  renderLoanRow as renderLoanRowUtil,
} from './features/loans/index.js';
import {
  businessService,
  getBusinessWeeklyGrowth,
  getGrowthIndicator,
  getJobStatusColor,
} from './features/businesses/index.js';
import { savingsService } from './features/savings/index.js';
import {
  notificationService,
  formatMessageForPrint,
} from './features/notifications/index.js';
import { schedulerService } from './features/scheduler/index.js';
import { classroomService } from './features/classroom/index.js';
import { languageService } from './features/i18n/index.js';
import {
  statsService,
  getDefaultStatsCount,
  getLoginPeriodLabel,
  calculateGiniCoefficient,
  calculateWeeklyTransactionVolume,
  categorizeIncome,
} from './features/stats/index.js';
import { emailService } from './features/email/index.js';
import { formatCurrency, formatDate, formatRelativeTime, translateTransactionDescription } from './shared/utils/formatters.js';
import { escapeHtml, hashPassword } from './shared/utils/helpers.js';
import { APP_CONFIG, DEFAULT_SETTINGS, USER_TYPES, STORAGE_KEYS } from './shared/config/config.js';

// Feature controllers — merged into EconSimApp.prototype below
import { savingsControllerMethods } from './features/savings/controllers/savingsController.js';
import { taxesControllerMethods } from './features/taxes/controllers/taxesController.js';
import { classroomControllerMethods } from './features/classroom/controllers/classroomController.js';
import { i18nControllerMethods } from './features/i18n/controllers/i18nController.js';

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

  /**
   * Start polling for badge-oppdateringer
   */
  async startBadgePolling() {
    // Oppdater badges umiddelbart
    await this.updateAllBadges();

    // Poll hvert 30. sekund (redusert fra 5s for å spare server-ressurser)
    this.badgePollingInterval = setInterval(async () => {
      await this.updateAllBadges();
    }, 30000);
  }

  /**
   * Oppdater alle badges
   */
  async updateAllBadges() {
    const user = authService.getCurrentUser();
    if (!user) return;

    if (user.role === 'student') {
      await this.updateInboxBadge();
      await this.updateJobsBadge();
    } else if (user.role === 'teacher') {
      await this.updateTeacherMessagesBadge();
    }

    // Oppdater bedriftsmeldinger-badge hvis relevant
    if (this.selectedBusinessId) {
      await this.updateBusinessMessagesBadge(this.selectedBusinessId);
    }
  }

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
   * Håndter login
   */
  async handleLogin() {
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value;
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');
    const loginError = document.getElementById('loginError');
    const loginErrorText = document.getElementById('loginErrorText');

    console.log('🔐 handleLogin kalt med:', { username, passwordLength: password?.length });

    // Hide previous errors
    if (loginError) loginError.classList.add('hidden');

    // Show loading state
    if (loginBtn) loginBtn.disabled = true;
    if (loginBtnText) loginBtnText.textContent = languageService.t('ui.loggingIn');
    if (loginSpinner) loginSpinner.classList.remove('hidden');

    try {
      const user = await authService.login(username, password);
      console.log('✅ Logget inn som:', user.name, '- Type:', user.type);
      
      // Refresh alle tjeneste-cacher for riktig klasserom
      await this.refreshAllServiceCaches();
      
      // Refresh settings for riktig klasserom
      this.settings = await settingsService.getSettings();
      console.log('⚙️ Innstillinger lastet for klasserom:', this.settings.className);
      
      // Form cleares automatically on success
      document.getElementById('loginForm')?.reset();

      // Vis riktig dashboard basert på brukertype
      if (user.type === 'superadmin') {
        await this.showSuperadminDashboard();
      } else if (user.type === 'teacher') {
        await this.showTeacherDashboard();
      } else {
        await this.showStudentDashboard();
      }

      // Oppdater notification-badges ETTER at dashboard er vist
      // Dette sikrer at badges vises umiddelbart ved innlogging
      await this.updateAllBadges();
    } catch (error) {
      console.error('Login feilet:', error);
      
      // Show error message inline
      if (loginError && loginErrorText) {
        loginErrorText.textContent = error.message || languageService.t('error.wrongCredentials');
        loginError.classList.remove('hidden');
      } else {
        uiManager.showError(error.message || languageService.t('error.wrongCredentials'));
      }
    } finally {
      // Reset button state
      if (loginBtn) loginBtn.disabled = false;
      if (loginBtnText) loginBtnText.textContent = languageService.t('login.button');
      if (loginSpinner) loginSpinner.classList.add('hidden');
    }
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

  /**
   * Last superadmin statistikk
   */
  async loadSuperadminStats() {
    await this.refreshClassroomCacheFromFirebase();
    const classrooms = classroomService.getAllClassrooms();
    const users = classroomService.getUsers();

    const teachers = users.filter(u => u.type === 'teacher');
    const students = users.filter(u => u.type === 'student');

    document.getElementById('totalClassrooms').textContent = classrooms.length;
    document.getElementById('totalTeachers').textContent = teachers.length;
    document.getElementById('totalStudents').textContent = students.length;
  }

  /**
   * Last innloggingsstatistikk og vis i graf
   */
  async loadLoginStats() {
    try {
      const { keys, stats } = await statsService.getLoginStats(this.loginStatsView, {
        count: getDefaultStatsCount(this.loginStatsView),
        selectedKey: this.loginStatsFilterKey
      });

      // Beregn totaler
      let totalTeachers = 0;
      let totalStudents = 0;
      keys.forEach(key => {
        totalTeachers += stats[key]?.teachers || 0;
        totalStudents += stats[key]?.students || 0;
      });

      // Oppdater totaltall
      document.getElementById('statsTeacherLogins').textContent = totalTeachers;
      document.getElementById('statsStudentLogins').textContent = totalStudents;

      // Oppdater valgt periode-tekst
      const selectedLabelEl = document.getElementById('statsSelectedPeriodLabel');
      if (selectedLabelEl) {
        if (keys.length === 1) {
          selectedLabelEl.textContent = `Valgt: ${this.formatLoginPeriodLabel(keys[0], this.loginStatsView)}`;
        } else {
          selectedLabelEl.textContent = `Viser siste ${keys.length} ${getLoginPeriodLabel(this.loginStatsView).toLowerCase()}(r)`;
        }
      }

      // Formater labels basert på view
      const labels = keys.map(key => this.formatLoginPeriodLabel(key, this.loginStatsView));

      const teacherData = keys.map(key => stats[key]?.teachers || 0);
      const studentData = keys.map(key => stats[key]?.students || 0);

      // Opprett eller oppdater chart
      const ctx = document.getElementById('loginStatsChart');
      if (!ctx) return;

      if (this.loginStatsChart) {
        this.loginStatsChart.destroy();
      }

      this.loginStatsChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Lærere',
              data: teacherData,
              borderColor: '#16a34a',
              backgroundColor: 'rgba(22, 163, 74, 0.1)',
              tension: 0.3,
              fill: true
            },
            {
              label: 'Elever',
              data: studentData,
              borderColor: '#d97706',
              backgroundColor: 'rgba(217, 119, 6, 0.1)',
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('❌ Feil ved lasting av login stats:', error);
    }
  }

  /**
   * Bytt mellom dag/uke/måned/år visning
   */
  async switchLoginStatsView(view) {
    this.loginStatsView = view;
    this.loginStatsFilterKey = null;

    // Oppdater knapper
    const viewButtons = {
      day: document.getElementById('statsViewDay'),
      week: document.getElementById('statsViewWeek'),
      month: document.getElementById('statsViewMonth'),
      year: document.getElementById('statsViewYear')
    };

    Object.entries(viewButtons).forEach(([key, btn]) => {
      if (!btn) return;
      if (key === view) {
        btn.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
        btn.classList.add('bg-purple-600', 'text-white');
      } else {
        btn.classList.remove('bg-purple-600', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
      }
    });

    await this.syncLoginStatsFilterControls();

    // Last stats på nytt
    await this.loadLoginStats();
    await this.loadGeoStats();
    await this.loadTeacherRequests();
    await this.loadTeachersList();
  }

  /**
   * Last geografisk statistikk
   */
  async loadGeoStats() {
    try {
      const { countries, regions } = await statsService.getGeoStats(
        this.loginStatsView,
        this.loginStatsFilterKey,
        getDefaultStatsCount(this.loginStatsView)
      );

      // Vis land
      const countriesContainer = document.getElementById('geoStatsCountries');
      if (countriesContainer) {
        if (countries.length === 0) {
          countriesContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen data ennå</p>';
        } else {
          countriesContainer.innerHTML = countries.map(c => `
            <div class="flex items-center justify-between bg-gray-50 p-2 rounded">
              <div class="flex items-center gap-2">
                <span class="text-xl">${statsService.getCountryFlag(c.countryCode)}</span>
                <span class="text-sm font-medium">${escapeHtml(c.country)}</span>
              </div>
              <span class="text-sm text-gray-600 font-bold">${c.count}</span>
            </div>
          `).join('');
        }
      }

      // Vis fylker (kun norske)
      const regionsContainer = document.getElementById('geoStatsRegions');
      if (regionsContainer) {
        const norwegianRegions = regions.filter(r => r.countryCode === 'NO');
        if (norwegianRegions.length === 0) {
          regionsContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen data ennå</p>';
        } else {
          regionsContainer.innerHTML = norwegianRegions.map(r => `
            <div class="flex items-center justify-between bg-gray-50 p-2 rounded">
              <div class="flex items-center gap-2">
                <span class="text-xl">${statsService.getNorwegianCountyShield(r.region)}</span>
                <span class="text-sm font-medium">${escapeHtml(r.region)}</span>
              </div>
              <span class="text-sm text-gray-600 font-bold">${r.count}</span>
            </div>
          `).join('');
        }
      }
    } catch (error) {
      console.error('❌ Feil ved lasting av geo stats:', error);
    }
  }

  /**
   * Last lærerliste for superadmin
   */
  async loadTeachersList() {
    const users = classroomService.getUsers();
    const teachers = users.filter(u => u.type === 'teacher');
    const container = document.getElementById('teachersList');

    if (!container) return;

    if (teachers.length === 0) {
      container.innerHTML = `<p class="text-gray-500">${languageService.t('ui.noTeachersRegistered')}</p>`;
      return;
    }

    // Hent innloggingsstatistikk per klasserom
    const classroomStats = await statsService.getClassroomLoginStats(this.loginStatsView, this.loginStatsFilterKey);

    container.innerHTML = teachers.map(teacher => {
      const classroom = classroomService.getClassroomByTeacher(teacher.id);
      const studentCount = classroom
        ? classroomService.getStudentsByClassroom(classroom.id).length
        : 0;

      // Hent innloggingstall for dette klasserommet
      const loginStats = classroom && classroomStats[classroom.id]
        ? classroomStats[classroom.id]
        : { teachers: 0, students: 0 };

      const isDemoTeacher = teacher.id === 't1';

      return `
        <div class="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
          <div class="flex-1">
            <p class="font-medium">${escapeHtml(teacher.name)}</p>
            <p class="text-sm text-gray-500">@${escapeHtml(teacher.username)}</p>
            <p class="text-sm text-blue-600">${classroom ? `📚 ${escapeHtml(classroom.className)} • ${studentCount} ${languageService.t('roles.students')}` : `❌ ${languageService.t('ui.noClassroom')}`}</p>
          </div>
          ${classroom ? `
          <div class="text-center px-4">
            <p class="text-xs text-gray-500">Innlogginger (${getLoginPeriodLabel(this.loginStatsView).toLowerCase()})</p>
            <p class="text-sm">
              <span class="text-green-600 font-medium" title="Lærer">${loginStats.teachers}</span>
              <span class="text-gray-400">/</span>
              <span class="text-amber-600 font-medium" title="Elever">${loginStats.students}</span>
            </p>
          </div>
          ` : ''}
          ${isDemoTeacher
            ? '<span class="text-xs text-gray-400 px-2">Beskyttet demo-lærer</span>'
            : `<button onclick="window.econSim.deleteTeacher('${teacher.id}')" class="text-red-600 hover:text-red-800 p-2" title="${languageService.t('ui.deleteTeacher')}">🗑️</button>`}
        </div>
      `;
    }).join('');
  }

  // loadAllClassrooms, deleteClassroomAsSuperadmin, refreshClassroomCacheFromFirebase
  // — moved to features/classroom/controllers/classroomController.js

  /**
   * Opprett ny lærer (superadmin)
   */
  /**
   * Send lærersøknad (fra innloggingssiden)
   */
  async submitTeacherRequest() {
    const name = document.getElementById('reqTeacherName')?.value?.trim();
    const school = document.getElementById('reqTeacherSchool')?.value?.trim();
    const email = document.getElementById('reqTeacherEmail')?.value?.trim();
    const className = document.getElementById('reqTeacherClass')?.value?.trim();
    const message = document.getElementById('reqTeacherMessage')?.value?.trim();
    const statusEl = document.getElementById('teacherRequestStatus');

    if (!name || !school || !email) {
      if (statusEl) {
        statusEl.textContent = languageService.t('error.fillAllFields');
        statusEl.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700';
        statusEl.classList.remove('hidden');
      }
      return;
    }

    const submitBtn = document.querySelector('#teacherRequestForm button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await dataService.createTeacherRequest({ name, school, email, className, message });
      if (statusEl) {
        statusEl.textContent = languageService.t('teacherRequest.sent');
        statusEl.className = 'p-3 rounded-lg text-sm bg-green-50 text-green-700';
        statusEl.classList.remove('hidden');
      }
      document.getElementById('teacherRequestForm').reset();
      setTimeout(() => {
        document.getElementById('teacherRequestModal').classList.add('hidden');
        if (statusEl) statusEl.classList.add('hidden');
      }, 3000);
    } catch (error) {
      console.error('Feil ved sending av lærersøknad:', error);
      if (statusEl) {
        statusEl.textContent = languageService.t('teacherRequest.error');
        statusEl.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700';
        statusEl.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  /**
   * Last lærersøknader (superadmin)
   */
  async loadTeacherRequests() {
    const container = document.getElementById('teacherRequestsList');
    const badge = document.getElementById('teacherRequestsBadge');
    if (!container) return;

    try {
      const requests = await dataService.getTeacherRequests('pending');

      if (badge) {
        if (requests.length > 0) {
          badge.textContent = requests.length;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      if (requests.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('superadmin.noTeacherRequests')}</p>`;
        return;
      }

      container.innerHTML = requests.map(req => `
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="font-semibold">${escapeHtml(req.name)}</p>
              <p class="text-sm text-gray-600">🏫 ${escapeHtml(req.school)}</p>
              <p class="text-sm text-gray-600">📧 ${escapeHtml(req.email)}</p>
              ${req.className ? `<p class="text-sm text-gray-600">📚 Klasse: ${escapeHtml(req.className)}</p>` : ''}
              ${req.message ? `<p class="text-sm text-gray-500 mt-1 italic">"${escapeHtml(req.message)}"</p>` : ''}
              <p class="text-xs text-gray-400 mt-1">${formatDate(req.createdAt)}</p>
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <button onclick="window.econSim.approveTeacherRequest('${req.id}')"
              class="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm">
              ✅ ${languageService.t('superadmin.approveRequest')}
            </button>
            <button onclick="window.econSim.rejectTeacherRequest('${req.id}')"
              class="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-1.5 rounded-lg text-sm">
              ✗ ${languageService.t('superadmin.rejectRequest')}
            </button>
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Feil ved lasting av lærersøknader:', error);
      container.innerHTML = `<p class="text-red-500 text-sm">Feil ved lasting av søknader</p>`;
    }
  }

  /**
   * Godkjenn lærersøknad (superadmin) — oppretter lærerkonto
   */
  async approveTeacherRequest(requestId) {
    try {
      const requests = await dataService.getTeacherRequests('pending');
      const req = requests.find(r => r.id === requestId);
      if (!req) { uiManager.showError('Søknad ikke funnet'); return; }

      const username = req.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || `laerer${Date.now()}`;
      const password = Math.random().toString(36).slice(2, 10);

      document.getElementById('newTeacherName').value = req.name;
      document.getElementById('newTeacherUsername').value = username;
      document.getElementById('newTeacherPassword').value = password;

      await dataService.updateTeacherRequest(requestId, { status: 'approved', approvedAt: new Date().toISOString() });
      await this.createTeacher();
      await this.loadTeacherRequests();
      uiManager.showSuccess(`Lærer "${req.name}" opprettet. Brukernavn: ${username} / Passord: ${password}`);
    } catch (error) {
      console.error('Feil ved godkjenning av søknad:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Avslå lærersøknad (superadmin)
   */
  async rejectTeacherRequest(requestId) {
    if (!confirm('Avslå denne søknaden?')) return;
    try {
      await dataService.updateTeacherRequest(requestId, { status: 'rejected', rejectedAt: new Date().toISOString() });
      await this.loadTeacherRequests();
      uiManager.showSuccess('Søknad avslått.');
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  async createTeacher() {
    const name = document.getElementById('newTeacherName')?.value?.trim();
    const username = document.getElementById('newTeacherUsername')?.value?.trim();
    const password = document.getElementById('newTeacherPassword')?.value;
    
    if (!name || !username || !password) {
      uiManager.showError(languageService.t('error.fillAllFields'));
      return;
    }
    
    if (password.length < 6) {
      uiManager.showError(languageService.t('error.passwordTooShort'));
      return;
    }
    
    try {
      const users = classroomService.getUsers();

      // Sjekk at brukernavn er unikt
      if (users.some(u => u.username === username)) {
        uiManager.showError(languageService.t('error.usernameTaken'));
        return;
      }

      // Password sendes i klartekst - createUser i dataService hasher det
      const newTeacher = {
        id: `teacher-${Date.now()}`,
        username,
        password: password,
        name,
        type: 'teacher',
        createdAt: new Date().toISOString()
      };
      
      users.push(newTeacher);
      classroomService.saveUsers(users);
      
      uiManager.showSuccess(`"${name}" ${languageService.t('msg.teacherCreatedName')}`);
      
      // Tøm skjema
      document.getElementById('newTeacherName').value = '';
      document.getElementById('newTeacherUsername').value = '';
      document.getElementById('newTeacherPassword').value = '';
      
      // Refresh lister
      await this.loadSuperadminStats();
      await this.loadTeachersList();
    } catch (error) {
      console.error('Feil ved opprettelse av lærer:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Slett lærer (superadmin)
   */
  async deleteTeacher(teacherId) {
    if (teacherId === 't1') {
      uiManager.showError('Demo-lærer kan ikke slettes.');
      return;
    }

    if (!confirm(languageService.t('confirm.deleteTeacher'))) {
      return;
    }

    try {
      // Finn ALLE lærerens klasserom direkte fra Firebase (robust mot cache-avvik)
      const allClassrooms = await dataService.getClassrooms();
      const teacherClassrooms = allClassrooms.filter(c => c.teacherId === teacherId);

      // Slett alle tilhørende klasserom + brukere i hvert klasserom
      for (const classroom of teacherClassrooms) {
        // Slett alle brukere i klasserommet (elever + bank/skatt-kontoer)
        const users = classroomService.getUsers();
        const usersToDelete = users.filter(u => u.classroomId === classroom.id);
        for (const user of usersToDelete) {
          await dataService.deleteUser(user.id);
        }

        // Slett selve klasserommet med all klassedata
        await dataService.deleteClassroom(classroom.id);

        // Fjern fra lokal cache
        const classroomIdx = classroomService.classrooms.findIndex(c => c.id === classroom.id);
        if (classroomIdx !== -1) {
          classroomService.classrooms.splice(classroomIdx, 1);
        }
      }

      // Slett læreren fra Firebase
      await dataService.deleteUser(teacherId);

      uiManager.showSuccess(languageService.t('msg.teacherAndClassroomDeleted'));

      // Refresh lister
      await this.loadSuperadminStats();
      await this.loadTeachersList();
      await this.loadAllClassrooms();
    } catch (error) {
      console.error('Feil ved sletting av lærer:', error);
      uiManager.showError(error.message);
    }
  }

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
   * Håndter logout
   */
  handleLogout() {
    uiManager.confirm(languageService.t('confirm.logout'), () => {
      authService.logout();
      this.currentClassroom = null;
      
      // Refresh alle cacher for å unngå at data fra forrige bruker vises
      this.refreshAllServiceCaches();
      
      console.log('✅ Logget ut');
      
      // Vis login screen
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('studentDashboard').classList.add('hidden');
      document.getElementById('teacherDashboard').classList.add('hidden');
      document.getElementById('superadminDashboard').classList.add('hidden');
    });
  }

  /**
   * Håndter pengeoverføring
   */
  async handleTransfer() {
    const accountNumber = document.getElementById('recipientAccount')?.value;
    const amount = document.getElementById('transferAmount')?.value;
    const message = document.getElementById('transferMessage')?.value;
    const form = document.getElementById('transferForm');
    const btn = form?.querySelector('button[type="submit"]');
    const originalHtml = btn?.innerHTML;

    if (btn?.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳...'; }

    try {
      await transactionService.transferMoney(accountNumber, parseFloat(amount), message);
      uiManager.showSuccess(languageService.t('msg.transferSuccess'));
      form?.reset();

      // Oppdater saldo og transaksjoner umiddelbart
      await this.refreshStudentDashboard();
    } catch (error) {
      console.error('Overføring feilet:', error);
      uiManager.showError(error.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
  }

  /**
   * Oppdater balance display
   */
  async updateBalanceDisplay() {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Refresh user data
    await authService.refreshCurrentUser();
    const updatedUser = authService.getCurrentUser();

    if (!updatedUser) return;

    // Oppdater studentBalance (elev dashboard)
    const studentBalanceEl = document.getElementById('studentBalance');
    if (studentBalanceEl) {
      studentBalanceEl.textContent = formatCurrency(updatedUser.balance, this.settings?.currencySymbol || 'KKr');
    }

    // Oppdater currentBalance (legacy)
    const currentBalanceEl = document.getElementById('currentBalance');
    if (currentBalanceEl) {
      currentBalanceEl.textContent = formatCurrency(updatedUser.balance, this.settings?.currencySymbol || 'KKr');
    }
  }

  /**
   * Oppdater currency display på tvers av UI
   */
  updateCurrencyDisplay() {
    document.querySelectorAll('[data-currency]').forEach(el => {
      const amount = parseFloat(el.dataset.amount);
      if (!isNaN(amount)) {
        el.textContent = formatCurrency(amount, this.settings.currencySymbol);
      }
    });
  }

  /**
   * Refresh transaksjoner
   */
  async refreshTransactions() {
    try {
      const transactions = await transactionService.getUserTransactions(10);
      this.renderTransactions(transactions);
    } catch (error) {
      console.error('Feil ved refresh av transaksjoner:', error);
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

  /**
   * Render transaksjoner
   */
  renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    if (!container) return;

    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-center py-4">${languageService.t('ui.noTransactionsYet')}</p>`;
      return;
    }

    const currentUser = authService.getCurrentUser();
    
    container.innerHTML = transactions.map(tx => {
      const isSender = tx.senderId === currentUser.id;
      const isRecipient = tx.recipientId === currentUser.id;
      const amountClass = isSender ? 'text-red-600' : 'text-green-600';
      const amountPrefix = isSender ? '-' : '+';
      const translatedMessage = tx.message ? translateTransactionDescription(tx.message) : '';

      return `
        <div class="border-b border-gray-200 py-3">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900">
                ${isSender ? `${languageService.t('transaction.to')} ${tx.recipientName}` : `${languageService.t('transaction.from')} ${tx.senderName}`}
              </p>
              ${translatedMessage ? `<p class="text-sm text-gray-500 mt-1">${translatedMessage}</p>` : ''}
              <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
            </div>
            <div class="text-right">
              <p class="${amountClass} font-semibold">${amountPrefix}${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Last student transaksjoner
   */
  async loadStudentTransactions() {
    try {
      const transactions = await transactionService.getUserTransactions(50);
      const container = document.getElementById('studentTransactions');
      
      if (!container) return;
      
      // Cache transaksjonene for søk
      this.cachedStudentTransactions = transactions;
      
      this.renderStudentTransactions(transactions);
    } catch (error) {
      console.error('Feil ved lasting av transaksjoner:', error);
    }
  }

  /**
   * Render student transaksjoner
   */
  renderStudentTransactions(transactions) {
    const container = document.getElementById('studentTransactions');
    if (!container) return;
    
    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noTransactionsYet')}</p>`;
      return;
    }
    
    const user = authService.getCurrentUser();
    container.innerHTML = transactions.map(tx => {
      const isSender = tx.senderId === user.id;
      const amountClass = isSender ? 'text-red-600' : 'text-green-600';
      const amountPrefix = isSender ? '-' : '+';
      
      // Hent navn og melding
      const rawName = isSender ? tx.recipientName : tx.senderName;
      const rawMessage = tx.message || '';
      const translatedMessage = rawMessage ? translateTransactionDescription(rawMessage) : '';
      
      // Sjekk om navnet er generisk eller om navnet er lik meldingen (gamle transaksjoner)
      const isGenericName = !rawName || rawName === 'Ukjent' || rawName === 'Unknown' || 
                            rawName === languageService.t('common.unknown');
      
      // Sjekk om navnet er en transaksjonsbeskrivelse (fra gamle transaksjoner)
      const nameIsDescription = rawName === rawMessage || 
                                rawName === translatedMessage ||
                                translateTransactionDescription(rawName) === translatedMessage;
      
      // Bestem hva som skal vises
      let displayName, displayMessage;
      
      if (isGenericName || nameIsDescription) {
        // Bruk meldingen som hovednavn, ikke vis melding separat
        displayName = translatedMessage || rawName || languageService.t('common.unknown');
        displayMessage = '';
      } else {
        // Ekte navn - vis begge hvis de er forskjellige
        displayName = rawName;
        displayMessage = translatedMessage;
      }
      
      const safeName = escapeHtml(displayName);
      const safeMessage = displayMessage ? escapeHtml(displayMessage) : '';
      
      return `
        <div class="flex justify-between items-center border-b border-gray-100 py-2">
          <div class="flex-1">
            <p class="text-sm font-medium">${safeName}</p>
            ${safeMessage ? `<p class="text-sm text-gray-600 mt-1">${safeMessage}</p>` : ''}
            <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
          </div>
          <div class="text-right ml-4">
            <p class="${amountClass} font-semibold">${amountPrefix}${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Filtrer student transaksjoner
   */
  filterStudentTransactions(searchTerm) {
    if (!searchTerm) {
      this.renderStudentTransactions(this.cachedStudentTransactions);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = this.cachedStudentTransactions.filter(tx => {
      const senderName = (tx.senderName || '').toLowerCase();
      const recipientName = (tx.recipientName || '').toLowerCase();
      const message = (tx.message || '').toLowerCase();
      const amount = tx.amount.toString();
      
      return senderName.includes(term) || 
             recipientName.includes(term) || 
             message.includes(term) ||
             amount.includes(term);
    });
    
    this.renderStudentTransactions(filtered);
  }

  /**
   * Last lærer transaksjoner
   */
  async loadTeacherTransactions() {
    try {
      const transactions = await transactionService.getAllTransactions(100);
      const container = document.getElementById('teacherTransactions');
      
      if (!container) return;
      
      // Cache transaksjonene for søk
      this.cachedTeacherTransactions = transactions;
      
      this.renderTeacherTransactions(transactions);
    } catch (error) {
      console.error('Feil ved lasting av lærer-transaksjoner:', error);
    }
  }

  /**
   * Render lærer transaksjoner
   */
  renderTeacherTransactions(transactions) {
    const container = document.getElementById('teacherTransactions');
    if (!container) return;
    
    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noTransactionsYet')}</p>`;
      return;
    }
    
    container.innerHTML = transactions.map(tx => {
      // Råverdier
      const rawSenderName = tx.senderName || '';
      const rawRecipientName = tx.recipientName || '';
      const rawMessage = tx.message || '';
      
      // Oversett meldingen
      const translatedMessage = rawMessage ? translateTransactionDescription(rawMessage) : '';
      
      // Sjekk om navn er generiske (Ukjent, Unknown, eller tomme)
      const isGenericSender = !rawSenderName || rawSenderName === 'Ukjent' || rawSenderName === 'Unknown' || 
                              rawSenderName === languageService.t('common.unknown');
      const isGenericRecipient = !rawRecipientName || rawRecipientName === 'Ukjent' || rawRecipientName === 'Unknown' || 
                                  rawRecipientName === languageService.t('common.unknown');
      
      // Sjekk om navn og melding er like (for å unngå dobbeltvisning av gamle transaksjoner)
      const isSenderSameAsMessage = rawSenderName && rawMessage && (
        rawSenderName.toLowerCase() === rawMessage.toLowerCase() ||
        rawSenderName.toLowerCase() === translatedMessage?.toLowerCase() ||
        translateTransactionDescription(rawSenderName).toLowerCase() === translatedMessage?.toLowerCase()
      );
      const isRecipientSameAsMessage = rawRecipientName && rawMessage && (
        rawRecipientName.toLowerCase() === rawMessage.toLowerCase() ||
        rawRecipientName.toLowerCase() === translatedMessage?.toLowerCase() ||
        translateTransactionDescription(rawRecipientName).toLowerCase() === translatedMessage?.toLowerCase()
      );
      
      // Bruk ekte navn eller meldingen som fallback
      const senderName = isGenericSender && translatedMessage ? translatedMessage : (rawSenderName || '→');
      const recipientName = isGenericRecipient && translatedMessage ? translatedMessage : (rawRecipientName || '→');
      
      // Escape all user-generated content to prevent XSS
      const safeSenderName = escapeHtml(senderName);
      const safeRecipientName = escapeHtml(recipientName);
      const safeMessage = translatedMessage ? escapeHtml(translatedMessage) : '';
      
      // Ikke vis message hvis: begge navn er generiske, ELLER en av navnene er likt meldingen
      const showMessage = safeMessage && 
        !(isGenericSender && isGenericRecipient) &&
        !isSenderSameAsMessage &&
        !isRecipientSameAsMessage;
      
      return `
        <div class="border-b border-gray-100 py-3">
          <div class="flex justify-between items-start mb-1">
            <div class="flex-1">
              <p class="text-sm font-medium">
                ${safeSenderName} → ${safeRecipientName}
              </p>
              ${showMessage ? `<p class="text-sm text-gray-600 mt-1">${safeMessage}</p>` : ''}
              <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
            </div>
            <div class="text-right ml-4">
              <p class="text-blue-600 font-semibold">${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Filtrer lærer transaksjoner
   */
  filterTeacherTransactions(searchTerm) {
    if (!searchTerm) {
      this.renderTeacherTransactions(this.cachedTeacherTransactions);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = this.cachedTeacherTransactions.filter(tx => {
      const senderName = (tx.senderName || '').toLowerCase();
      const recipientName = (tx.recipientName || '').toLowerCase();
      const message = (tx.message || '').toLowerCase();
      const amount = tx.amount.toString();
      
      return senderName.includes(term) || 
             recipientName.includes(term) || 
             message.includes(term) ||
             amount.includes(term);
    });
    
    this.renderTeacherTransactions(filtered);
  }

  /**
   * Last lærer jobber (alle kategorier)
   */
  async loadTeacherJobs() {
    try {
      console.log('🔄 Laster lærer-jobber...');
      const user = authService.getCurrentUser();
      const classroom = classroomService.getClassroomByTeacher(user.id);
      const classroomId = classroom?.id;
      
      // Hent statens jobber
      const stateJobs = await jobService.getJobs();
      const stateJobsWithMarker = stateJobs.map(job => ({
        ...job,
        isBusinessJob: false,
        employer: `🏛️ ${languageService.t('ui.theState')}`
      }));
      
      // Hent bedriftsjobber
      const allBusinesses = businessService.getAllBusinesses();
      const businesses = allBusinesses.filter(b => 
        b.classroomId === classroomId && 
        b.status === 'active'
      );
      
      const businessJobs = [];
      for (const business of businesses) {
        if (business.jobs && business.jobs.length > 0) {
          for (const job of business.jobs) {
            businessJobs.push({
              ...job,
              isBusinessJob: true,
              businessId: business.id,
              businessName: business.name,
              businessEmoji: business.emoji,
              businessLogo: business.logo,
              employer: `${business.emoji || '🏢'} ${business.name}`
            });
          }
        }
      }
      
      // Kombiner alle jobber
      const allJobs = [...stateJobsWithMarker, ...businessJobs];
      console.log('📋 Totalt', allJobs.length, 'jobber (stat:', stateJobs.length, ', bedrift:', businessJobs.length, ')');
      const jobsBannerEl = document.getElementById('teacherJobsBannerCount');
      if (jobsBannerEl) jobsBannerEl.textContent = allJobs.length;

      // Tilgjengelige (ledige) - sortert med nyeste først
      // Filtrer ut jobber som er direkte tilbud (disse vises som jobbtilbud i stedet)
      const availableJobs = allJobs
        .filter(job => {
          if (job.isBusinessJob) return job.status === 'open';
          // Ikke vis direkte tilbud i åpne stillinger
          if (job.isDirectOffer) return false;
          return job.status === 'active' && !job.assignedTo;
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      console.log('🆓 Tilgjengelige jobber:', availableJobs.length);
      const availableContainer = document.getElementById('teacherAvailableJobs');
      if (availableContainer) {
        if (availableJobs.length === 0) {
          availableContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noAvailableJobs')}</p>`;
        } else {
          availableContainer.innerHTML = availableJobs.map(job => this.renderTeacherJobCard(job, 'available')).join('');
        }
      }

      // Aktive (ansatte) - sortert med nyest tildelt først
      const activeJobs = allJobs
        .filter(job => {
          if (job.isBusinessJob) return job.status === 'active' && job.assignedTo;
          return job.status === 'active' && job.assignedTo;
        })
        .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt));
      console.log('⚙️ Aktive jobber:', activeJobs.length);
      const activeContainer = document.getElementById('teacherActiveJobs');
      if (activeContainer) {
        if (activeJobs.length === 0) {
          activeContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noActiveJobs')}</p>`;
        } else {
          activeContainer.innerHTML = activeJobs.map(job => this.renderTeacherJobCard(job, 'active')).join('');
        }
      }

      // Avsluttede - sortert med nyest avsluttet først
      const completedJobs = allJobs
        .filter(job => job.status === 'completed')
        .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));
      console.log('✅ Avsluttede jobber:', completedJobs.length);
      const completedContainer = document.getElementById('teacherCompletedJobs');
      if (completedContainer) {
        if (completedJobs.length === 0) {
          completedContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noCompletedJobs')}</p>`;
        } else {
          completedContainer.innerHTML = completedJobs.map(job => this.renderTeacherJobCard(job, 'completed')).join('');
        }
      }
      
      console.log('✅ Lærer-jobber lastet');
    } catch (error) {
      console.error('❌ Feil ved lasting av jobber:', error);
    }
  }

  /**
   * Render lærer jobb-kort
   */
  renderTeacherJobCard(job, category) {
    const typeLabel = job.type === 'project' ? '📋 ' + languageService.t('modal.project') : '🔄 ' + languageService.t('modal.fixedJob');
    const salaryLabel = job.type === 'project' ? '/' + languageService.t('jobs.completed') : '/' + languageService.t('time.week');
    const employerLabel = job.employer || '🏛️ ' + languageService.t('common.state');
    
    // Hent søknader fra Firebase cache
    const allApplications = dataService.getApplicationsSync() || [];
    const applications = allApplications.filter(app => app.jobId === job.id);
    const applicationCount = applications.length;
    
    // Bedriftsjobber skal ikke ha handlinger fra lærer
    const isBusinessJob = job.isBusinessJob === true;
    
    return `
      <div class="border border-gray-200 rounded-lg p-4 ${isBusinessJob ? 'bg-blue-50' : ''}">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <h4 class="font-semibold text-lg">${job.title}</h4>
            <p class="text-sm text-gray-600">${job.description || languageService.t('common.noDescription')}</p>
            <p class="text-xs text-gray-500 mt-1">${languageService.t('jobs.employer')}: ${employerLabel}</p>
          </div>
          <span class="text-xs bg-gray-100 px-2 py-1 rounded">${typeLabel}</span>
        </div>
        <p class="text-sm font-medium text-green-600 mb-2">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
        ${job.assignedToName ? `<p class="text-sm text-gray-600 mb-3">👤 ${job.assignedToName}</p>` : ''}
        
        ${!isBusinessJob ? `
        <div class="flex flex-col gap-2">
          ${category === 'available' ? `
            <button onclick="window.econSim.showApplications('${job.id}')" 
              class="w-full text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded">
              📋 ${languageService.t('teacher.viewApplications')} ${applicationCount > 0 ? `(${applicationCount})` : ''}
            </button>
            <div class="flex gap-2">
              <button onclick="window.econSim.showEditJobModal('${job.id}')" 
                class="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded">
                ✏️ ${languageService.t('btn.edit')}
              </button>
              <button onclick="window.econSim.deleteJob('${job.id}')" 
                class="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded">
                🗑️ ${languageService.t('btn.delete')}
              </button>
            </div>
          ` : ''}
          
          ${category === 'active' ? `
            <div class="flex gap-2">
              <button onclick="window.econSim.payJobSalary('${job.id}', this)"
                class="flex-1 text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded">
                💵 ${languageService.t('teacher.paySalary')}
              </button>
              <button onclick="window.econSim.showPartialPaymentModal('${job.id}')" 
                class="flex-1 text-sm bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded">
                📊 ${languageService.t('modal.partialPayment')}
              </button>
            </div>
            <div class="flex gap-2">
              <button onclick="window.econSim.showEditJobModal('${job.id}')" 
                class="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded">
                ✏️ ${languageService.t('btn.edit')}
              </button>
              <button onclick="window.econSim.endJob('${job.id}')" 
                class="flex-1 text-sm bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded">
                ✅ ${languageService.t('jobs.endJob')}
              </button>
            </div>
          ` : ''}
          
          ${category === 'completed' ? `
            <button onclick="window.econSim.republishJob('${job.id}')" 
              class="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded">
              ♻️ ${languageService.t('jobs.republish')}
            </button>
          ` : ''}
        </div>
        ` : `<p class="text-xs text-gray-400 italic">${languageService.t('ui.managedByBusiness')}</p>`}
      </div>
    `;
  }

  /**
   * Last elev jobber (alle kategorier) - inkludert bedriftsjobber
   */
  async loadStudentJobs() {
    try {
      const user = authService.getCurrentUser();
      const allJobs = await jobService.getJobs();

      // Hent også bedriftsjobber fra ALLE bedrifter i klasserommet
      const classroomId = user.classroomId;

      // Refresh bedrifter fra Firebase for å få nyeste jobber
      await businessService.loadBusinessesAsync();

      // Hent ALLE bedrifter (inkludert egne) for å se jobbene, men filtrer senere
      const allBusinesses = businessService.getAllBusinesses();
      const businesses = allBusinesses.filter(b => 
        b.classroomId === classroomId && 
        b.status === 'active'
      );
      
      console.log('loadStudentJobs - Fant', businesses.length, 'bedrifter i klasserom', classroomId);
      
      const businessJobs = [];
      
      for (const business of businesses) {
        console.log('Sjekker bedrift:', business.name, '- Har jobs:', business.jobs?.length || 0);
        
        // Vis alle jobber, inkludert fra egne bedrifter (elever kan ansette seg selv)
        if (business.jobs && business.jobs.length > 0) {
          for (const job of business.jobs) {
            console.log('  Jobb:', job.title, '- Status:', job.status);
            if (job.status === 'open') {
              businessJobs.push({
                ...job,
                isBusinessJob: true,
                businessId: business.id,
                businessName: business.name,
                businessEmoji: business.emoji,
                businessLogo: business.logo,
                employer: `${business.emoji || '🏢'} ${business.name}`
              });
            }
          }
        }
      }
      
      console.log('Totalt', businessJobs.length, 'åpne bedriftsjobber funnet');
      
      // Marker statens jobber
      const stateJobs = allJobs.map(job => ({
        ...job,
        isBusinessJob: false,
        employer: `🏛️ ${languageService.t('ui.theState')}`
      }));
      
      // Kombiner alle jobber
      const combinedJobs = [...stateJobs, ...businessJobs];
      
      // Tilgjengelige (ledige) - sortert med nyeste først
      // Filtrer ut jobber som er direkte tilbud (disse vises som jobbtilbud i stedet)
      const availableJobs = combinedJobs
        .filter(job => {
          if (job.isBusinessJob) return job.status === 'open';
          // Ikke vis direkte tilbud i åpne stillinger
          if (job.isDirectOffer) return false;
          return job.status === 'active' && !job.assignedTo;
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const availableContainer = document.getElementById('studentAvailableJobs');
      if (availableContainer) {
        if (availableJobs.length === 0) {
          availableContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('jobs.noAvailableJobs')}</p>`;
        } else {
          availableContainer.innerHTML = availableJobs.map(job => this.renderStudentJobCard(job, 'available')).join('');
        }
      }

      // Hent aktive bedriftsjobber (der eleven er ansatt)
      // Sjekk BÅDE job.assignedTo OG business.employees for å fange alle tilfeller
      const myActiveBusinessJobs = [];
      const addedJobIds = new Set(); // Unngå duplikater
      
      for (const business of businesses) {
        // Metode 1: Sjekk job.assignedTo
        if (business.jobs) {
          for (const job of business.jobs) {
            if (job.status === 'active' && job.assignedTo === user.id) {
              if (!addedJobIds.has(job.id)) {
                addedJobIds.add(job.id);
                myActiveBusinessJobs.push({
                  ...job,
                  isBusinessJob: true,
                  businessId: business.id,
                  businessName: business.name,
                  businessEmoji: business.emoji,
                  businessLogo: business.logo,
                  employer: `${business.emoji || '🏢'} ${business.name}`
                });
              }
            }
          }
        }
        
        // Metode 2: Sjekk business.employees (for jobber som ikke er oppdatert med assignedTo)
        const employeeRecord = (business.employees || []).find(e => e.userId === user.id);
        if (employeeRecord) {
          // Lag en pseudo-jobb basert på employee record
          const pseudoJobId = `emp_${business.id}_${user.id}`;
          if (!addedJobIds.has(pseudoJobId)) {
            // Sjekk om det finnes en jobb med matchende tittel som ikke allerede er lagt til
            const matchingJob = (business.jobs || []).find(j => 
              j.assignedTo === user.id || 
              (j.title === employeeRecord.title && j.status === 'active')
            );
            
            if (!matchingJob || !addedJobIds.has(matchingJob?.id)) {
              addedJobIds.add(matchingJob?.id || pseudoJobId);
              myActiveBusinessJobs.push({
                id: matchingJob?.id || pseudoJobId,
                title: employeeRecord.title,
                salary: employeeRecord.salary,
                type: 'permanent',
                status: 'active',
                isBusinessJob: true,
                businessId: business.id,
                businessName: business.name,
                businessEmoji: business.emoji,
                businessLogo: business.logo,
                employer: `${business.emoji || '🏢'} ${business.name}`,
                hiredAt: employeeRecord.hiredAt
              });
            }
          }
        }
      }

      // Mine aktive jobber - inkluderer både statens og bedriftsjobber
      const myActiveStateJobs = stateJobs
        .filter(job => job.status === 'active' && job.assignedTo === user.id);
      const myActiveJobs = [...myActiveStateJobs, ...myActiveBusinessJobs]
        .sort((a, b) => new Date(b.assignedAt || b.hiredAt || b.createdAt) - new Date(a.assignedAt || a.hiredAt || a.createdAt));
      const activeContainer = document.getElementById('studentActiveJobs');
      
      const activeHTML = myActiveJobs.length === 0 
        ? `<p class="text-gray-500 text-sm">${languageService.t('ui.noActiveJobs')}</p>`
        : myActiveJobs.map(job => this.renderStudentJobCard(job, 'active')).join('');
      
      if (activeContainer) activeContainer.innerHTML = activeHTML;
      const studentJobsBannerEl = document.getElementById('studentJobsBannerCount');
      if (studentJobsBannerEl) studentJobsBannerEl.textContent = myActiveJobs.length;
      // Ikke skriv til activeSummary her - det håndteres av loadStudentActiveJobsSummary()

      // Hent tidligere bedriftsjobber
      const myPreviousBusinessJobs = [];
      for (const business of businesses) {
        if (business.jobs) {
          for (const job of business.jobs) {
            if (job.status === 'completed' && job.assignedTo === user.id) {
              myPreviousBusinessJobs.push({
                ...job,
                isBusinessJob: true,
                businessId: business.id,
                businessName: business.name,
                businessEmoji: business.emoji,
                businessLogo: business.logo,
                employer: `${business.emoji || '🏢'} ${business.name}`
              });
            }
          }
        }
      }

      // Tidligere jobber - inkluderer både statens og bedriftsjobber
      const previousStateJobs = stateJobs
        .filter(job => job.status === 'completed' && job.assignedTo === user.id);
      const previousJobs = [...previousStateJobs, ...myPreviousBusinessJobs]
        .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));
      const previousContainer = document.getElementById('studentPreviousJobs');
      if (previousContainer) {
        if (previousJobs.length === 0) {
          previousContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('jobs.noPreviousJobs')}</p>`;
        } else {
          previousContainer.innerHTML = previousJobs.map(job => this.renderStudentJobCard(job, 'previous')).join('');
        }
      }

      // Vis jobbsøknadshistorikk
      this.loadJobApplicationsHistory(user.id, businesses);
      
      // Oppdater jobber-badge for jobbtilbud
      this.updateJobsBadge();
    } catch (error) {
      console.error('Feil ved lasting av jobber:', error);
    }
  }

  /**
   * Vis jobbsøknadshistorikk
   */
  async loadJobApplicationsHistory(userId, businesses) {
    const container = document.getElementById('studentJobApplications');
    if (!container) return;

    // Hent alle søknader fra Firebase
    const applications = await dataService.getBusinessJobApplications();
    const myApplications = applications.filter(a => a.applicantId === userId);

    // Hent også søknader til statens jobber
    const stateApplications = dataService._getFromStorage('econsim_applications') || [];
    const myStateApplications = stateApplications.filter(a => a.applicantId === userId);

    if (myApplications.length === 0 && myStateApplications.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noApplicationsSent')}</p>`;
      return;
    }

    // Kombiner og sorter
    const allMyApplications = [
      ...myApplications.map(a => ({ ...a, isBusinessJob: true })),
      ...myStateApplications.map(a => ({ ...a, isBusinessJob: false }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = allMyApplications.map(app => {
      let jobTitle = app.jobTitle || languageService.t('common.unknownJob');
      let employer = '🏛️ ' + languageService.t('common.state');
      
      if (app.isBusinessJob) {
        const business = businesses.find(b => b.id === app.businessId);
        if (business) {
          const job = business.jobs?.find(j => j.id === app.jobId);
          jobTitle = job?.title || languageService.t('common.unknownJob');
          employer = `${business.emoji || '🏢'} ${business.name}`;
        }
      } else {
        // For statens jobber
        const stateJob = dataService._getFromStorage('econsim_jobs')?.find(j => j.id === app.jobId);
        if (stateJob) {
          jobTitle = stateJob.title;
        }
      }

      // Status badge
      let statusBadge;
      let bgClass;
      switch (app.status) {
        case 'pending':
          statusBadge = `<span class="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">⏳ ${languageService.t('ui.statusPending')}</span>`;
          bgClass = 'bg-yellow-50 border-yellow-200';
          break;
        case 'accepted':
        case 'hired':
          statusBadge = `<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">✅ ${languageService.t('ui.statusApproved')}</span>`;
          bgClass = 'bg-green-50 border-green-200';
          break;
        case 'rejected':
          statusBadge = `<span class="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">❌ ${languageService.t('ui.statusRejected')}</span>`;
          bgClass = 'bg-red-50 border-red-200';
          break;
        default:
          statusBadge = `<span class="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded">❓ ${languageService.t('ui.statusUnknown')}</span>`;
          bgClass = 'bg-gray-50 border-gray-200';
      }

      return `
        <div class="p-4 rounded-lg border ${bgClass}">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="font-medium">${escapeHtml(jobTitle)}</h4>
              <p class="text-sm text-gray-600">${employer}</p>
            </div>
            ${statusBadge}
          </div>
          <p class="text-xs text-gray-500">${languageService.t('ui.sent')}: ${formatRelativeTime(new Date(app.createdAt))}</p>
          ${app.text ? `<p class="text-sm text-gray-600 mt-2 italic">"${escapeHtml(app.text.substring(0, 100))}${app.text.length > 100 ? '...' : ''}"</p>` : ''}
        </div>
      `;
    }).join('');
  }
  
  /**
   * Oppdater badge for jobbtilbud
   */
  async updateJobsBadge() {
    const user = authService.getCurrentUser();
    const badge = document.getElementById('jobsBadge');
    if (!badge || !user) return;

    // Tell KUN ventende jobbtilbud (direkte ansettelser fra bedriftseier/lærer)
    const jobOffers = await getPendingJobOffersUtil(user.id, { dataService, classroomService, authService }) || [];

    const totalNotifications = jobOffers.length;
    
    if (totalNotifications > 0) {
      badge.textContent = totalNotifications > 9 ? '9+' : totalNotifications;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /**
   * Render elev jobb-kort
   */
  renderStudentJobCard(job, category) {
    const sourceLabel = job.isBusinessJob ? '🏢 ' + languageService.t('business.title') : '🏛️ ' + languageService.t('common.state');
    const jobTypeLabel = job.type === 'project' ? '📋 ' + languageService.t('modal.project') : '🔄 ' + languageService.t('modal.fixedJob');
    const salaryLabel = job.type === 'project' ? '' : '/' + languageService.t('time.week');
    
    // Sjekk om eleven har søkt på denne jobben
    const user = authService.getCurrentUser();

    // For bedriftsjobber, sjekk i jobApplications (synkront fra cache)
    // For statens jobber, sjekk i applications cache
    let hasApplied;
    if (job.isBusinessJob) {
      // Bruk synkron cache-tilgang siden denne kalles fra render
      const businessApplications = dataService.cache?.businessJobApplications || [];
      hasApplied = businessApplications.some(app =>
        app.jobId === job.id && app.applicantId === user.id && app.status === 'pending'
      );
    } else {
      // Bruk synkron cache fra dataService
      const allApplications = dataService.getApplicationsSync();
      const myApplication = allApplications.find(app => app.jobId === job.id && app.applicantId === user.id);
      hasApplied = !!myApplication;
    }
    
    // Vis bedriftslogo hvis tilgjengelig
    const employerDisplay = job.isBusinessJob 
      ? (job.businessLogo 
          ? `<img src="${job.businessLogo}" alt="${escapeHtml(job.businessName)}" class="w-5 h-5 rounded inline-block mr-1"> ${escapeHtml(job.businessName)}`
          : `${job.businessEmoji || '🏢'} ${escapeHtml(job.businessName)}`)
      : '🏛️ ' + languageService.t('common.state');
    
    return `
      <div class="border border-gray-200 rounded-lg p-4">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <p class="text-xs text-gray-500 mb-1">${employerDisplay}</p>
            <h4 class="font-semibold text-lg">${escapeHtml(job.title)}</h4>
            <p class="text-sm text-gray-600">${escapeHtml(job.description || languageService.t('common.noDescription'))}</p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-xs bg-gray-100 px-2 py-1 rounded">${sourceLabel}</span>
            <span class="text-xs ${job.type === 'project' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} px-2 py-1 rounded">${jobTypeLabel}</span>
          </div>
        </div>
        <p class="text-sm font-medium text-green-600">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
        
        ${category === 'available' ? `
          ${hasApplied ? `
            <div class="mt-3 space-y-2">
              <button disabled 
                class="w-full bg-gray-400 text-white px-3 py-2 rounded cursor-not-allowed">
                ✅ ${languageService.t('jobs.applicationSent')}
              </button>
              ${job.isBusinessJob ? `
                <button onclick="window.econSim.applyForBusinessJob('${job.businessId}', '${job.id}')" 
                  class="w-full bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm">
                  ✏️ ${languageService.t('jobs.editApplication')}
                </button>
              ` : `
                <button onclick="window.econSim.showEditApplicationModal('${job.id}')" 
                  class="w-full bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm">
                  ✏️ ${languageService.t('ui.editApplication')}
                </button>
              `}
            </div>
          ` : `
            ${job.isBusinessJob ? `
              <button onclick="window.econSim.applyForBusinessJob('${job.businessId}', '${job.id}')" 
                class="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded">
                📝 ${languageService.t('btn.apply')}
              </button>
            ` : `
              <button onclick="window.econSim.showApplicationModal('${job.id}')" 
                class="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded">
                📝 ${languageService.t('btn.apply')}
              </button>
            `}
          `}
        ` : ''}
        ${category === 'active' ? `
          <div class="mt-3 flex flex-col gap-2">
            <p class="text-xs text-gray-500">✅ ${languageService.t('jobs.youHaveThisJob')}</p>
            <button onclick="window.econSim.quitJob('${job.id}', ${job.isBusinessJob})" 
              class="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm">
              🚪 ${languageService.t('jobs.quitJob')}
            </button>
          </div>
        ` : ''}
        ${category === 'previous' ? `
          <p class="text-xs text-gray-500 mt-2">${languageService.t('jobs.ended')}: ${formatDate(job.completedAt || job.updatedAt)}</p>
        ` : ''}
      </div>
    `;
  }

  /**
   * Søk på jobb
   */
  async applyForJob(jobId) {
    try {
      await jobService.applyForJob(jobId);
      uiManager.showSuccess(languageService.t('msg.applicationSent'));
      // Refresh jobber umiddelbart
      await this.loadStudentJobs();
    } catch (error) {
      console.error('Feil ved søking på jobb:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Last elever til dropdown
   */
  async loadStudentsDropdown() {
    try {
      console.log('📋 Laster elever til dropdown...');
      const students = await userService.getAllStudents();
      console.log('👥 Elever hentet:', students.length);
      
      const select = document.getElementById('giveMoneyRecipient');
      
      if (!select) {
        console.error('⚠️ Dropdown-element ikke funnet!');
        return;
      }
      
      // Legg til "Alle elever" som første valg etter placeholder
      let options = `<option value="">${languageService.t('ui.selectStudent')}</option>`;
      
      if (students.length > 0) {
        options += `<option value="__ALL__">📢 ${languageService.t('ui.allStudents') || 'Alle elever'} (${students.length})</option>`;
      }
      
      options += students.map(student => 
        `<option value="${student.id}">${student.name} (${student.accountNumber})</option>`
      ).join('');
      
      select.innerHTML = options;
      
      console.log('✅ Dropdown oppdatert med', students.length, 'elever');
    } catch (error) {
      console.error('❌ Feil ved lasting av elever:', error);
    }
  }

  /**
   * Last eleveoversikt
   */
  async loadStudentsTable() {
    try {
      const students = await userService.getAllStudents();
      const container = document.getElementById('studentsTable');
      
      if (!container) return;
      
      if (students.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('teacher.noStudentsYet')}</p>`;
        return;
      }
      
      container.innerHTML = `
        <table class="w-full table-fixed">
          <thead class="bg-gray-50">
            <tr>
              <th class="w-2/5 px-2 py-2 text-left text-sm font-semibold">${languageService.t('common.name')}</th>
              <th class="w-1/5 px-2 py-2 text-center text-sm font-semibold whitespace-nowrap">${languageService.t('common.accountNr')}</th>
              <th class="w-2/5 px-2 py-2 text-right text-sm font-semibold">${languageService.t('common.balance')} (${languageService.t('common.total')})</th>
              <th class="w-1/5 px-2 py-2 text-right text-sm font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            ${students.map(student => {
              const savingsAccount = savingsService.getSavingsAccountByUser(student.id);
              const fundAccount = savingsService.getFundAccountByUser(student.id);
              const checkingBalance = student.balance || 0;
              const savingsBalance = savingsAccount?.balance || 0;
              const fundBalance = fundAccount?.balance || 0;
              const totalBalance =
                checkingBalance +
                savingsBalance +
                fundBalance;

              return `
              <tr class="border-t border-gray-100">
                <td class="px-2 py-2 truncate">${escapeHtml(student.name)}</td>
                <td class="px-2 py-2 text-center">${student.accountNumber}</td>
                <td class="px-2 py-2 text-right font-semibold whitespace-nowrap">${formatCurrency(totalBalance, this.settings.currencySymbol)}</td>
                <td class="px-2 py-2 text-right">
                  <button
                    type="button"
                    onclick="window.econSim.toggleStudentFinanceDetails('${student.id}')"
                    class="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                    id="studentDetailsBtn-${student.id}">
                    ${languageService.t('btn.details') || 'Vis detaljer'}
                  </button>
                </td>
              </tr>
              <tr id="studentDetailsRow-${student.id}" class="hidden bg-gray-50 border-b border-gray-100">
                <td colspan="4" class="px-2 py-2 text-xs text-gray-600">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <p>💳 ${languageService.t('student.privateAccount')}: <span class="font-medium">${formatCurrency(checkingBalance, this.settings.currencySymbol)}</span></p>
                    <p>🏦 ${languageService.t('student.savingsAccount')}: <span class="font-medium">${formatCurrency(savingsBalance, this.settings.currencySymbol)}</span></p>
                    <p>📈 ${languageService.t('student.fundAccount')}: <span class="font-medium">${formatCurrency(fundBalance, this.settings.currencySymbol)}</span></p>
                  </div>
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (error) {
      console.error('Feil ved lasting av elever:', error);
    }
  }

  /**
   * Toggle detaljvisning for elevens kontoer i lærerens eleveoversikt
   */
  toggleStudentFinanceDetails(studentId) {
    const row = document.getElementById(`studentDetailsRow-${studentId}`);
    const btn = document.getElementById(`studentDetailsBtn-${studentId}`);
    if (!row || !btn) return;

    const isHidden = row.classList.contains('hidden');
    row.classList.toggle('hidden', !isHidden);
    btn.textContent = isHidden
      ? (languageService.t('btn.hideDetails') || 'Skjul detaljer')
      : (languageService.t('btn.details') || 'Vis detaljer');
  }



  /**
   * Setup teacher buttons
   */
  setupTeacherButtons() {
    // Give money form
    const giveMoneyForm = document.getElementById('giveMoneyForm');
    if (giveMoneyForm) {
      giveMoneyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleGiveMoney();
      });
    }

    // Create job button
    const createJobBtn = document.getElementById('createJobBtn');
    if (createJobBtn) {
      createJobBtn.addEventListener('click', async () => {
        await this.showCreateJobModal();
      });
    }

    // Create job form
    const createJobForm = document.getElementById('createJobForm');
    if (createJobForm) {
      createJobForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCreateJob();
      });
    }

    // Pay all salaries button (med debounce for å forhindre dobbelt-klikk)
    const payAllBtn = document.getElementById('payAllSalariesBtn');
    if (payAllBtn) {
      payAllBtn.addEventListener('click', async () => {
        if (payAllBtn.disabled) return;
        payAllBtn.disabled = true;
        payAllBtn.textContent = languageService.t('teacher.payingOut');
        try {
          await this.payAllSalaries();
        } finally {
          payAllBtn.disabled = false;
          payAllBtn.textContent = '💵 ' + languageService.t('teacher.paySalaryAll');
        }
      });
    }

    // Export data button
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportDataToJSON();
      });
    }

    // Import data button
    const importFile = document.getElementById('importDataFile');
    if (importFile) {
      importFile.addEventListener('change', async (e) => {
        await this.importDataFromJSON(e);
      });
    }

    // Delete class button (teacher)
    const deleteClassBtn = document.getElementById('deleteClassBtn');
    if (deleteClassBtn) {
      deleteClassBtn.addEventListener('click', async () => {
        await this.showDeleteClassConfirmation();
      });
    }

    // Reset demo classroom button (demo account only)
    const resetDemoBtn = document.getElementById('resetDemoBtn');
    if (resetDemoBtn) {
      resetDemoBtn.addEventListener('click', async () => {
        await this.resetDemoClassroom();
      });
    }

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', async () => {
        await this.showSettingsModal();
      });
    }

    // Settings form
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.saveSettings();
      });
    }

    // Student admin button
    const studentAdminBtn = document.getElementById('studentAdminBtn');
    if (studentAdminBtn) {
      studentAdminBtn.addEventListener('click', async () => {
        await this.showStudentAdminModal();
      });
    }

    // Add student button
    const addStudentBtn = document.getElementById('addStudentBtn');
    if (addStudentBtn) {
      addStudentBtn.addEventListener('click', async () => {
        await this.addNewStudent();
      });
    }

    // Auto-generate username when first/last name changes
    const firstNameInput = document.getElementById('newStudentFirstName');
    const lastNameInput = document.getElementById('newStudentLastName');
    if (firstNameInput) {
      firstNameInput.addEventListener('input', () => this.updateGeneratedUsername());
    }
    if (lastNameInput) {
      lastNameInput.addEventListener('input', () => this.updateGeneratedUsername());
    }

    // Student search
    const studentSearchInput = document.getElementById('studentSearchInput');
    if (studentSearchInput) {
      studentSearchInput.addEventListener('input', (e) => {
        this.filterStudentList(e.target.value);
      });
    }

    // Superadmin: velg spesifikk periode for statistikk
    const statsPeriodPicker = document.getElementById('statsPeriodPicker');
    if (statsPeriodPicker) {
      statsPeriodPicker.addEventListener('change', async (e) => {
        const value = e.target.value;
        this.loginStatsFilterKey = value
          ? statsService.normalizePeriodKey(this.loginStatsView, value)
          : null;

        await this.loadLoginStats();
        await this.loadGeoStats();
        await this.loadTeachersList();
      });
    }

    const statsPeriodSelect = document.getElementById('statsPeriodSelect');
    if (statsPeriodSelect) {
      statsPeriodSelect.addEventListener('change', async (e) => {
        const value = e.target.value;
        this.loginStatsFilterKey = value
          ? statsService.normalizePeriodKey(this.loginStatsView, value)
          : null;

        await this.loadLoginStats();
        await this.loadGeoStats();
        await this.loadTeachersList();
      });
    }

    const clearStatsPeriodBtn = document.getElementById('clearStatsPeriodBtn');
    if (clearStatsPeriodBtn) {
      clearStatsPeriodBtn.addEventListener('click', async () => {
        this.loginStatsFilterKey = null;
        await this.syncLoginStatsFilterControls();
        await this.loadLoginStats();
        await this.loadGeoStats();
        await this.loadTeachersList();
      });
    }

    // Superadmin: manuell refresh av dashboard-data
    const superadminRefreshBtn = document.getElementById('superadminRefreshBtn');
    if (superadminRefreshBtn) {
      superadminRefreshBtn.addEventListener('click', async () => {
        const refreshHtml = `🔄 <span data-i18n="btn.refresh">${languageService.t('btn.refresh')}</span>`;
        const refreshingText = `⏳ ${languageService.t('btn.refreshing')}`;
        superadminRefreshBtn.disabled = true;
        superadminRefreshBtn.textContent = refreshingText;

        try {
          await this.refreshClassroomCacheFromFirebase();
          await this.loadSuperadminStats();
          await this.syncLoginStatsFilterControls();
          await this.loadLoginStats();
          await this.loadGeoStats();
          await this.loadTeachersList();
          await this.loadAllClassrooms();
          uiManager.showSuccess('Superadmin-data oppdatert');
        } catch (error) {
          console.error('Feil ved manuell superadmin-refresh:', error);
          uiManager.showError('Kunne ikke oppdatere superadmin-data');
        } finally {
          superadminRefreshBtn.disabled = false;
          superadminRefreshBtn.innerHTML = refreshHtml;
        }
      });
    }

    // Teacher: manuell refresh av dashboard-data
    const teacherRefreshBtn = document.getElementById('teacherRefreshBtn');
    if (teacherRefreshBtn && teacherRefreshBtn.dataset.bound !== 'true') {
      teacherRefreshBtn.dataset.bound = 'true';
      teacherRefreshBtn.addEventListener('click', async () => {
        await this.refreshTeacherDashboardManually(teacherRefreshBtn);
      });
    }
  }

  /**
   * Formater periodenøkkel for visning i UI/graf
   */
  formatLoginPeriodLabel(key, view) {
    if (!key) return '';

    if (view === 'day') {
      const parts = key.split('-');
      return parts.length === 3 ? `${parts[2]}.${parts[1]}` : key;
    }

    if (view === 'week') {
      const weekNum = key.split('-W')[1] || key;
      return `Uke ${weekNum}`;
    }

    if (view === 'month') {
      const parts = key.split('-');
      return parts.length === 2 ? `${parts[1]}.${parts[0]}` : key;
    }

    return key;
  }

  /**
   * Synkroniser input-kontroll for periodevalg med aktiv visning
   */
  async syncLoginStatsFilterControls() {
    const picker = document.getElementById('statsPeriodPicker');
    const select = document.getElementById('statsPeriodSelect');
    if (!picker && !select) return;

    if (this.loginStatsView === 'day') {
      if (picker) {
        picker.classList.remove('hidden');
        picker.type = 'date';
        picker.placeholder = 'Velg dag';
      }
      if (select) {
        select.classList.add('hidden');
      }
    } else {
      if (picker) {
        picker.classList.add('hidden');
      }
      if (select) {
        select.classList.remove('hidden');
      }
    }

    if (picker) {
      if (this.loginStatsFilterKey && this.loginStatsView === 'day') {
        picker.value = this.loginStatsFilterKey;
      } else {
        picker.value = '';
      }
    }

    const periodNameEl = document.getElementById('statsPeriodPickerLabel');
    if (periodNameEl) {
      periodNameEl.textContent = getLoginPeriodLabel(this.loginStatsView);
    }

    // Hint med siste tilgjengelige perioder
    const availableKeys = await statsService.getAvailablePeriodKeys(this.loginStatsView);

    // Fyll dropdown for uke/måned/år
    if (select && this.loginStatsView !== 'day') {
      select.innerHTML = `<option value="">Velg ${getLoginPeriodLabel(this.loginStatsView).toLowerCase()}...</option>` +
        availableKeys.map(key => `<option value="${key}">${this.formatLoginPeriodLabel(key, this.loginStatsView)}</option>`).join('');

      if (this.loginStatsFilterKey) {
        select.value = this.loginStatsFilterKey;
      }
    }

    const optionsHintEl = document.getElementById('statsPeriodHint');
    if (optionsHintEl) {
      if (availableKeys.length === 0) {
        optionsHintEl.textContent = 'Ingen perioder registrert ennå';
      } else {
        const preview = availableKeys
          .slice(0, 3)
          .map(k => this.formatLoginPeriodLabel(k, this.loginStatsView))
          .join(', ');
        optionsHintEl.textContent = `Tilgjengelig: ${preview}${availableKeys.length > 3 ? ' ...' : ''}`;
      }
    }
  }

  /**
   * Vis elevadministrasjon modal
   */
  async showStudentAdminModal() {
    try {
      const students = await userService.getAllStudents();
      this.allStudentsForAdmin = students; // Lagre for filtrering
      this.renderStudentAdminList(students);
      
      // Tøm skjemafelter
      const firstNameInput = document.getElementById('newStudentFirstName');
      const lastNameInput = document.getElementById('newStudentLastName');
      const usernameInput = document.getElementById('newStudentUsername');
      const passwordInput = document.getElementById('newStudentPassword');
      
      if (firstNameInput) firstNameInput.value = '';
      if (lastNameInput) lastNameInput.value = '';
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      
      document.getElementById('studentAdminModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved lasting av elever:', error);
      uiManager.showError(languageService.t('error.couldNotLoadStudents'));
    }
  }

  /**
   * Render elevliste i admin modal
   */
  renderStudentAdminList(students) {
    const container = document.getElementById('studentAdminList');
    if (!container) return;

    if (students.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-4">Ingen elever funnet</p>';
      return;
    }

    container.innerHTML = students.map(student => `
      <div class="flex items-center justify-between bg-white p-3 rounded-lg border hover:shadow-sm transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <span class="text-blue-600 font-bold">${student.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p class="font-medium">${escapeHtml(student.name)}</p>
            <p class="text-sm text-gray-500">@${escapeHtml(student.username)} • Konto: ${student.accountNumber}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-green-600 font-medium mr-2">${formatCurrency(student.balance, this.settings?.currencySymbol || 'KKr')}</span>
          <button onclick="window.econSim.showEditStudentModal('${student.id}')" class="text-blue-600 hover:text-blue-800 p-1" title="Rediger">
            ✏️
          </button>
          <button onclick="window.econSim.confirmDeleteStudent('${student.id}', '${escapeHtml(student.name)}')" class="text-red-600 hover:text-red-800 p-1" title="Slett">
            🗑️
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Filtrer elevliste basert på søk
   */
  filterStudentList(searchTerm) {
    if (!this.allStudentsForAdmin) return;
    
    const filtered = this.allStudentsForAdmin.filter(student => 
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.accountNumber.includes(searchTerm)
    );
    
    this.renderStudentAdminList(filtered);
  }

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

  /**
   * Gi lønn til alle
   */
  async payAllSalaries() {
    console.log('💰 Betaler lønn til alle...');
    try {
      const result = await jobService.payAllActiveSalaries();
      console.log('Resultat:', result);
      
      if (result.successful.length > 0) {
        uiManager.showSuccess(`${languageService.t('msg.salaryPaidToStudents')} ${result.successful.length} ${languageService.t('msg.students')}`);
        // Refresh dashboard umiddelbart
        await this.refreshTeacherDashboard();
      } else {
        uiManager.showInfo(languageService.t('jobs.noActiveJobsToPayFor'));
      }
      
      if (result.failed.length > 0) {
        uiManager.showError(`${result.failed.length} ${languageService.t('error.paymentsFailed')}`);
      }
    } catch (error) {
      console.error('❌ Feil ved utbetaling av lønn:', error);
      uiManager.showError(error.message || languageService.t('error.loadFailed'));
    }
  }

  /**
   * Betal lønn for en jobb (med debounce)
   */
  async payJobSalary(jobId, btn = null) {
    // Forhindre doble klikk
    if (this._payingJob === jobId) return;
    this._payingJob = jobId;
    const originalHtml = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }

    console.log('💵 Betaler lønn for jobb:', jobId);
    try {
      const result = await jobService.payJobSalary(jobId);
      
      // Bygg melding med skatteinfo
      let message = languageService.t('msg.salaryPaid');
      if (result.taxInfo) {
        const currencySymbol = this.settings?.currencySymbol || 'KKr';
        message = languageService.t('msg.salaryPaidWithTax', {
          gross: `${result.taxInfo.grossAmount} ${currencySymbol}`,
          tax: `${result.taxInfo.taxAmount} ${currencySymbol}`,
          net: `${result.taxInfo.netAmount} ${currencySymbol}`
        });
      }
      
      // Sjekk om det var en prosjektjobb som ble fullført
      if (result.job.type === 'project') {
        message += ' ' + languageService.t('msg.projectCompleted');
      } else {
        message += '!';
      }
      
      uiManager.showSuccess(message);
      
      // Refresh alt umiddelbart
      await this.loadStudentsTable();
      await this.loadTeacherJobs();
    } catch (error) {
      console.error('❌ Feil ved utbetaling:', error);
      uiManager.showError(error.message || languageService.t('error.couldNotPaySalary'));
    } finally {
      this._payingJob = null;
      if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
  }

  /**
   * Vis modal for delvis utbetaling
   */
  async showPartialPaymentModal(jobId) {
    try {
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        uiManager.showError(languageService.t('error.jobNotFound'));
        return;
      }

      document.getElementById('partialPaymentJobId').value = jobId;
      document.getElementById('partialPaymentJobTitle').textContent = job.title;
      document.getElementById('partialPaymentEmployeeName').textContent = job.assignedToName || languageService.t('common.unknown');
      document.getElementById('partialPaymentFullAmount').textContent = formatCurrency(job.salary, this.settings?.currencySymbol || 'KKr');
      document.getElementById('partialPaymentAmount').value = '';
      document.getElementById('partialPaymentAmount').max = job.salary;
      document.getElementById('partialPaymentReason').value = '';
      
      document.getElementById('partialPaymentModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved visning av delvis utbetaling:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Håndter delvis utbetaling
   */
  async handlePartialPayment() {
    const jobId = document.getElementById('partialPaymentJobId').value;
    const amount = parseInt(document.getElementById('partialPaymentAmount').value);
    const reason = document.getElementById('partialPaymentReason').value.trim();

    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.amountMustBePositive'));
      return;
    }

    if (!reason) {
      uiManager.showError(languageService.t('error.reasonRequired'));
      return;
    }

    try {
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job || !job.assignedTo) {
        uiManager.showError(languageService.t('error.jobNotAssigned'));
        return;
      }

      // Beregn skatt hvis aktivert
      let netAmount = amount;
      let taxInfo = null;
      
      if (await taxService.isEnabled()) {
        taxInfo = await taxService.witholdTax(job.assignedTo, amount, `Delvis lønn for: ${job.title} (${reason})`);
        netAmount = taxInfo.netAmount;
      }

      // Overfør netto penger
      await transactionService.giveMoney(
        job.assignedTo,
        netAmount,
        taxInfo 
          ? `${languageService.t('msg.partialSalaryFor')}: ${job.title} - ${reason} (${languageService.t('msg.afterTax')} ${taxInfo.taxAmount})`
          : `${languageService.t('msg.partialSalaryFor')}: ${job.title} - ${reason}`
      );

      let message = `${formatCurrency(amount, this.settings?.currencySymbol || 'KKr')} ${languageService.t('msg.paidOut')}`;
      if (taxInfo) {
        message += ` (${formatCurrency(taxInfo.taxAmount, this.settings?.currencySymbol || 'KKr')} ${languageService.t('msg.inTax')})`;
      }
      uiManager.showSuccess(message);
      
      document.getElementById('partialPaymentModal').classList.add('hidden');
      
      // Refresh
      await this.loadStudentsTable();
      await this.loadTeacherJobs();
    } catch (error) {
      console.error('Feil ved delvis utbetaling:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Avslutt jobb
   */
  async endJob(jobId) {
    console.log('🛑 Avslutter jobb:', jobId);
    uiManager.confirm(languageService.t('confirm.endJob'), async () => {
      try {
        await jobService.endJob(jobId);
        uiManager.showSuccess(languageService.t('msg.jobEnded'));
        // Refresh jobber umiddelbart
        await this.loadTeacherJobs();
        await this.loadStudentJobs();
      } catch (error) {
        console.error('❌ Feil ved avslutting av jobb:', error);
        uiManager.showError(error.message || languageService.t('error.updateFailed'));
      }
    });
  }

  /**
   * Re-publiser jobb
   */
  async republishJob(jobId) {
    console.log('♻️ Re-publiserer jobb:', jobId);
    try {
      await jobService.republishJob(jobId);
      uiManager.showSuccess(languageService.t('msg.jobRepublished'));
      // Refresh jobber umiddelbart
      await this.loadTeacherJobs();
      await this.loadStudentJobs();
    } catch (error) {
      console.error('❌ Feil ved re-publisering:', error);
      uiManager.showError(error.message || languageService.t('error.updateFailed'));
    }
  }

  /**
   * Slett jobb
   */
  async deleteJob(jobId) {
    console.log('🗑️ Sletter jobb:', jobId);
    uiManager.confirm(languageService.t('confirm.deleteJob'), async () => {
      try {
        await jobService.deleteJob(jobId);
        uiManager.showSuccess(languageService.t('msg.jobDeleted'));
        // Refresh jobber umiddelbart
        await this.loadTeacherJobs();
      } catch (error) {
        console.error('❌ Feil ved sletting:', error);
        uiManager.showError(error.message || languageService.t('error.deleteFailed'));
      }
    });
  }

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

  /**
   * Vis søknadsmodal
   */
  async showApplicationModal(jobId) {
    try {
      // Hent alle jobber og finn den spesifikke jobben
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        uiManager.showError(languageService.t('error.jobNotFound'));
        return;
      }

      const salaryLabel = job.type === 'project' ? '/utført' : '/uke';
      
      // Fyll inn jobbinfo
      document.getElementById('applyJobId').value = jobId;
      document.getElementById('applyJobInfo').innerHTML = `
        <h4 class="font-semibold">${job.title}</h4>
        <p class="text-sm text-gray-600">${job.description}</p>
        <p class="text-sm font-medium text-green-600 mt-2">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
      `;

      document.getElementById('applicationModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved visning av søknadsmodal:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis modal for å endre søknad
   */
  async showEditApplicationModal(jobId) {
    try {
      const user = authService.getCurrentUser();
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        uiManager.showError(languageService.t('error.jobNotFound'));
        return;
      }

      // Finn eksisterende søknad
      const allApplications = dataService._getFromStorage('econsim_applications') || [];
      const myApplication = allApplications.find(app => app.jobId === jobId && app.applicantId === user.id);
      
      if (!myApplication) {
        uiManager.showError(languageService.t('error.applicationNotFound'));
        return;
      }

      const salaryLabel = job.type === 'project' ? '/utført' : '/uke';

      // Fyll inn jobbinfo og eksisterende søknadstekst
      document.getElementById('applyJobId').value = jobId;
      document.getElementById('applyJobInfo').innerHTML = `
        <h4 class="font-semibold">${job.title}</h4>
        <p class="text-sm text-gray-600">${job.description}</p>
        <p class="text-sm font-medium text-green-600 mt-2">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
        <p class="text-xs text-orange-600 mt-2">${languageService.t('ui.editingExistingApplication')}</p>
      `;
      
      // Fyll inn eksisterende søknadstekst
      document.getElementById('applicationText').value = myApplication.applicationText;

      document.getElementById('applicationModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved visning av endre-søknadsmodal:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Send søknad
   */
  async handleJobApplication() {
    const jobId = document.getElementById('applyJobId').value;
    const businessId = document.getElementById('applyBusinessId')?.value;
    const text = document.getElementById('applicationText').value;
    const user = authService.getCurrentUser();

    try {
      // Sjekk om det er en bedriftsjobb
      if (businessId) {
        // Håndter bedriftsjobb-søknad
        const applications = await dataService.getBusinessJobApplications();
        const existingApp = applications.find(a => a.jobId === jobId && a.applicantId === user.id);

        const application = {
          id: existingApp ? existingApp.id : `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          jobId: jobId,
          businessId: businessId,
          applicantId: user.id,
          applicantName: user.name,
          text: text,
          status: 'pending',
          createdAt: existingApp ? existingApp.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (existingApp) {
          await dataService.updateBusinessJobApplication(application.id, application);
          uiManager.showSuccess(languageService.t('msg.applicationUpdated'));
        } else {
          await dataService.createBusinessJobApplication(application);
          uiManager.showSuccess(languageService.t('msg.applicationSent'));
        }
      } else {
        // Håndter statlig jobb-søknad (eksisterende logikk)
        const allApplications = await dataService.getApplications();
        const isUpdate = allApplications.some(app => app.jobId === jobId && app.applicantId === user.id);

        await jobService.applyForJob(jobId, text);
        uiManager.showSuccess(isUpdate ? languageService.t('msg.applicationUpdated') : languageService.t('msg.applicationSent'));
      }
      
      document.getElementById('applicationModal').classList.add('hidden');
      document.getElementById('applicationForm').reset();
      // Nullstill businessId for neste gang
      if (document.getElementById('applyBusinessId')) {
        document.getElementById('applyBusinessId').value = '';
      }
      
      // Refresh student jobs
      await this.loadStudentJobs();
    } catch (error) {
      console.error('Feil ved sending av søknad:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis redigeringsmodal
   */
  async showEditJobModal(jobId) {
    try {
      // Hent jobben fra dataService
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        uiManager.showError(languageService.t('error.jobNotFound'));
        return;
      }

      document.getElementById('editJobId').value = job.id;
      document.getElementById('editJobTitle').value = job.title;
      document.getElementById('editJobDescription').value = job.description || '';
      document.getElementById('editJobSalary').value = job.salary;

      // Last elever til dropdown
      const students = await userService.getAllStudents();
      const assignSelect = document.getElementById('editJobAssignedTo');
      assignSelect.innerHTML = `<option value="">${languageService.t('modal.openPosition')}</option>` +
        students.map(s => `<option value="${s.id}" ${job.assignedTo === s.id ? 'selected' : ''}>${s.name}</option>`).join('');

      document.getElementById('editJobModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved visning av redigeringsmodal:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Lagre redigert jobb
   */
  async handleEditJob() {
    const jobId = document.getElementById('editJobId').value;
    const title = document.getElementById('editJobTitle').value;
    const description = document.getElementById('editJobDescription').value;
    const salary = parseInt(document.getElementById('editJobSalary').value);
    const targetStudentId = document.getElementById('editJobAssignedTo').value || null;

    try {
      // Hent nåværende jobb for å sammenligne assignedTo
      const jobs = await jobService.getJobs();
      const currentJob = jobs.find(j => j.id === jobId);
      
      // Oppdater grunnleggende info
      await jobService.updateJob(jobId, { title, description, salary });
      
      // Håndter tildeling via jobbtilbud hvis det endres
      if (currentJob && currentJob.assignedTo !== targetStudentId) {
        if (targetStudentId && !currentJob.assignedTo) {
          // Send jobbtilbud til ny elev
          const targetStudent = dataService.getUserById(targetStudentId);
          const user = authService.getCurrentUser();
          const classroom = classroomService.getClassroomByTeacher(user.id);
          
          const jobOffer = {
            id: 'joffer_' + Date.now(),
            jobId: jobId,
            jobTitle: title,
            jobType: currentJob.type || 'fixed',
            salary: salary,
            employeeId: targetStudentId,
            employeeName: targetStudent?.name || languageService.t('common.unknown'),
            classroomId: classroom?.id,
            status: 'pending',
            isTeacherJob: true,
            createdAt: new Date().toISOString()
          };

          await dataService.createJobOffer(jobOffer);

          uiManager.showSuccess(`${languageService.t('msg.sent')} ${targetStudent?.name}!`);
        } else if (!targetStudentId && currentJob.assignedTo) {
          // Fjern tildeling (re-publiser jobben)
          await jobService.republishJob(jobId);
          uiManager.showSuccess(languageService.t('msg.jobUpdatedAndRepublished'));
        } else {
          uiManager.showSuccess(languageService.t('msg.jobUpdated'));
        }
      } else {
        uiManager.showSuccess(languageService.t('msg.jobUpdated'));
      }
      
      document.getElementById('editJobModal').classList.add('hidden');
      
      // Refresh jobs
      await this.loadTeacherJobs();
    } catch (error) {
      console.error('Feil ved redigering av jobb:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis søknader for en jobb
   */
  async showApplications(jobId) {
    try {
      const applications = await jobService.getJobApplications(jobId);
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      const container = document.getElementById('applicationsContainer');
      
      if (applications.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-center py-4">${languageService.t('ui.noApplicationsYet')}</p>`;
      } else {
        container.innerHTML = `
          <div class="mb-4">
            <h4 class="font-semibold">${job.title}</h4>
            <p class="text-sm text-gray-600">${applications.length} ${languageService.t('ui.applicationsCount')}</p>
          </div>
          ${applications.map(app => `
            <div class="border border-gray-200 rounded-lg p-4 mb-3">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <p class="font-semibold">${app.studentName}</p>
                  <p class="text-xs text-gray-500">${formatRelativeTime(app.createdAt)}</p>
                </div>
                <span class="text-xs px-2 py-1 rounded ${
                  app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  app.status === 'accepted' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }">
                  ${app.status === 'pending' ? '⏳ ' + languageService.t('common.pending') : app.status === 'accepted' ? '✅ ' + languageService.t('common.approved') : '❌ ' + languageService.t('common.rejected')}
                </span>
              </div>
              <p class="text-sm text-gray-700 mb-3">${app.applicationText}</p>
              ${app.status === 'pending' ? `
                <div class="flex gap-2">
                  <button 
                    onclick="window.econSim.acceptApplication('${app.id}')"
                    class="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2 rounded">
                    ✅ ${languageService.t('ui.approve')}
                  </button>
                  <button 
                    onclick="window.econSim.rejectApplication('${app.id}', '${jobId}')"
                    class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded">
                    ❌ ${languageService.t('btn.reject')}
                  </button>
                </div>
              ` : ''}
            </div>
          `).join('')}
        `;
      }

      document.getElementById('viewApplicationsModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved visning av søknader:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Godkjenn søknad
   */
  async acceptApplication(applicationId) {
    try {
      // Hent søknad og jobb-detaljer før godkjenning
      const applications = dataService.getApplicationsSync();
      const application = applications.find(a => a.id === applicationId);
      const job = await dataService.getJob(application?.jobId);

      await jobService.acceptApplication(applicationId);

      // Send jobbkontrakt til eleven
      if (application && job) {
        await this.generateStateJobContract(job, application.applicantId, application.applicantName);
      }

      uiManager.showSuccess(languageService.t('msg.applicationApproved'));

      // Lukk modal og refresh
      document.getElementById('viewApplicationsModal').classList.add('hidden');
      await this.loadTeacherJobs();
    } catch (error) {
      console.error('Feil ved godkjenning av søknad:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Avvis søknad
   */
  async rejectApplication(applicationId, jobId) {
    try {
      await jobService.rejectApplication(applicationId);
      uiManager.showSuccess(languageService.t('msg.applicationRejected'));
      
      // Refresh søknader for denne jobben
      await this.showApplications(jobId);
    } catch (error) {
      console.error('Feil ved avvisning av søknad:', error);
      uiManager.showError(error.message);
    }
  }

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

  /**
   * Render elevliste i innstillinger
   */
  renderStudentList(students) {
    const container = document.getElementById('studentListContainer');
    if (!container) return;
    
    if (students.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Ingen elever enda</p>';
      return;
    }

    container.innerHTML = students.map(student => `
      <div class="flex justify-between items-center bg-white p-3 rounded border">
        <div>
          <p class="font-medium">${escapeHtml(student.name)}</p>
          <p class="text-xs text-gray-500">@${escapeHtml(student.username)} • Konto: ${student.accountNumber}</p>
        </div>
        <div class="flex gap-2">
          <button 
            onclick="window.econSim.showEditStudentModal('${student.id}')"
            class="text-blue-600 hover:text-blue-800 px-2 py-1 text-sm">
            ✏️
          </button>
          <button 
            onclick="window.econSim.confirmDeleteStudent('${student.id}', '${escapeHtml(student.name)}')"
            class="text-red-600 hover:text-red-800 px-2 py-1 text-sm">
            🗑️
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Vis rediger elev modal
   */
  async showEditStudentModal(studentId) {
    const user = dataService.getUserById(studentId);
    if (!user) {
      uiManager.showError(languageService.t('error.studentNotFound'));
      return;
    }

    document.getElementById('editStudentId').value = user.id;
    document.getElementById('editStudentName').value = user.name;
    document.getElementById('editStudentUsername').value = user.username;
    document.getElementById('editStudentPassword').value = '';
    document.getElementById('editStudentBalance').value = user.balance;
    
    document.getElementById('editStudentModal').classList.remove('hidden');
  }

  /**
   * Lagre redigert elev
   */
  async saveEditedStudent(e) {
    e.preventDefault();
    
    const studentId = document.getElementById('editStudentId').value;
    const name = document.getElementById('editStudentName').value.trim();
    const username = document.getElementById('editStudentUsername').value.trim();
    const password = document.getElementById('editStudentPassword').value;
    const balance = parseInt(document.getElementById('editStudentBalance').value);
    
    if (!name || !username) {
      uiManager.showError(languageService.t('error.nameAndUsernameRequired'));
      return;
    }
    
    try {
      await userService.updateStudent(studentId, {
        name,
        username,
        password: password || undefined, // Bare oppdater hvis angitt
        balance
      });
      
      uiManager.showSuccess(languageService.t('msg.studentUpdated'));
      document.getElementById('editStudentModal').classList.add('hidden');
      
      // Refresh elevliste
      const students = await userService.getAllStudents();
      this.renderStudentList(students);
      
      // Refresh hovedtabell
      await this.loadStudentsTable();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  // ==================== LÅN FUNKSJONER ====================

  /**
   * Last lån for lærer
   */
  async loadTeacherLoans() {
    const containerStudents = document.getElementById('loansTableBodyStudents');
    const containerBusinesses = document.getElementById('loansTableBodyBusinesses');
    const applicationsContainer = document.getElementById('loanApplicationsList');
    if (!containerStudents && !containerBusinesses) return;

    // Sørg for at settings er lastet
    if (!this.settings) {
      this.settings = await settingsService.getSettings();
    }
    const currencySymbol = this.settings?.currencySymbol || 'KKr';

    if (!(await loanService.isEnabled())) {
      const disabledMsg = languageService.t('ui.loanSystemDisabled');
      if (containerStudents) containerStudents.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-8">${disabledMsg}</td></tr>`;
      if (containerBusinesses) containerBusinesses.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-8">${disabledMsg}</td></tr>`;
      if (applicationsContainer) applicationsContainer.innerHTML = `<p class="text-gray-500 text-sm">${disabledMsg}</p>`;
      return;
    }

    // Last lånesøknader
    if (applicationsContainer) {
      const globalApplications = await dataService.getLoanApplications();
      const pendingApplications = globalApplications.filter(a => a.status === 'pending');
      
      if (pendingApplications.length === 0) {
        applicationsContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noPendingLoanApplications')}</p>`;
      } else {
        applicationsContainer.innerHTML = pendingApplications.map(app => `
          <div class="bg-amber-50 border border-amber-200 p-4 rounded-lg">
            <div class="flex justify-between items-start">
              <div>
                <p class="font-medium">${escapeHtml(app.applicantName)} ${app.applicantType === 'business' ? '(' + languageService.t('common.business') + ')' : ''}</p>
                <p class="text-sm text-gray-600">${languageService.t('ui.applyingFor')}: <strong>${formatCurrency(app.amount, currencySymbol)}</strong></p>
                <p class="text-sm text-gray-600 mt-1">${languageService.t('loans.purpose')}: ${escapeHtml(app.purpose)}</p>
                <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(new Date(app.createdAt))}</p>
              </div>
              <div class="flex gap-2">
                <button onclick="window.econSim.showApproveLoanModal('${app.id}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                  ✅ ${languageService.t('btn.approve')}
                </button>
                <button onclick="window.econSim.showRejectLoanModal('${app.id}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">
                  ❌ ${languageService.t('btn.reject')}
                </button>
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    const loans = loanService.getAllLoans();
    
    // Del opp lån i elever og bedrifter
    const studentLoans = loans.filter(l => l.borrowerType === 'student');
    const businessLoans = loans.filter(l => l.borrowerType === 'business');
    
    // Oppdater statistikk-elementer
    const totalLoansAmountEl = document.getElementById('totalLoansAmount');
    const activeLoansCountEl = document.getElementById('activeLoansCount');
    const totalInterestEarnedEl = document.getElementById('totalInterestEarned');
    
    const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'overdue');
    const totalLoaned = loans.reduce((sum, l) => sum + (l.principalAmount || 0), 0);
    const totalInterest = loans.reduce((sum, l) => sum + ((l.principalAmount - l.remainingBalance) > 0 ? (l.principalAmount - l.remainingBalance) : 0), 0);
    
    if (totalLoansAmountEl) totalLoansAmountEl.textContent = formatCurrency(totalLoaned, currencySymbol);
    if (activeLoansCountEl) activeLoansCountEl.textContent = activeLoans.length;
    if (totalInterestEarnedEl) totalInterestEarnedEl.textContent = formatCurrency(totalInterest, currencySymbol);
    const loansBannerEl = document.getElementById('teacherLoansBannerCount');
    if (loansBannerEl) loansBannerEl.textContent = activeLoans.length;
    
    // Oppdater kategori-badges
    const studentBadge = document.getElementById('loanBadgeStudents');
    const businessBadge = document.getElementById('loanBadgeBusinesses');
    if (studentBadge) studentBadge.textContent = studentLoans.length > 0 ? `(${studentLoans.length})` : '';
    if (businessBadge) businessBadge.textContent = businessLoans.length > 0 ? `(${businessLoans.length})` : '';
    
    // Render student loans
    if (containerStudents) {
      if (studentLoans.length === 0) {
        containerStudents.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-8">${languageService.t('teacher.noStudentLoans')}</td></tr>`;
      } else {
        containerStudents.innerHTML = studentLoans.map(loan => renderLoanRowUtil(loan, currencySymbol, { dataService, businessService, languageService })).join('');
      }
    }
    
    // Render business loans
    if (containerBusinesses) {
      if (businessLoans.length === 0) {
        containerBusinesses.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-8">${languageService.t('teacher.noBusinessLoans')}</td></tr>`;
      } else {
        containerBusinesses.innerHTML = businessLoans.map(loan => renderLoanRowUtil(loan, currencySymbol, { dataService, businessService, languageService })).join('');
      }
    }
  }
  
  /**
   * Vis lånekategori (elever/bedrifter)
   */
  showLoanCategory(category) {
    const categories = ['Students', 'Businesses'];
    const categoryMap = { 'students': 'Students', 'businesses': 'Businesses' };
    const cat = categoryMap[category] || category;
    
    categories.forEach(c => {
      const container = document.getElementById(`loanCategory${c}`);
      const tab = document.getElementById(`loanTab${c}`);
      if (container && tab) {
        if (c === cat) {
          container.classList.remove('hidden');
          tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.remove('text-gray-500');
        } else {
          container.classList.add('hidden');
          tab.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.add('text-gray-500');
        }
      }
    });
  }

  /**
   * Vis opprett lån modal
   */
  async showCreateLoanModal() {
    const modal = document.getElementById('createLoanModal');
    const borrowerSelect = document.getElementById('loanBorrower');
    const interestInput = document.getElementById('loanInterestRate');
    
    // Fyll inn standard rente
    const settings = await loanService.getSettings();
    interestInput.value = settings.defaultInterestRate;

    // Fyll inn låntaker-alternativer
    const students = userService.getAllStudentsSync();
    const businesses = businessService.getActiveBusinesses();
    
    let options = `<option value="">${languageService.t('ui.selectBorrower')}</option>`;
    options += `<optgroup label="${languageService.t('roles.students')}">`;
    students.forEach(s => {
      options += `<option value="student:${s.id}">${escapeHtml(s.name)}</option>`;
    });
    options += '</optgroup>';
    
    if (businesses.length > 0) {
      options += `<optgroup label="${languageService.t('btn.businesses')}">`;
      businesses.forEach(b => {
        options += `<option value="business:${b.id}">${escapeHtml(b.name)}</option>`;
      });
      options += '</optgroup>';
    }
    
    borrowerSelect.innerHTML = options;
    modal.classList.remove('hidden');
    
    // Oppdater forhåndsvisning ved endringer
    this.updateLoanPreview();
  }

  /**
   * Oppdater låneforhåndsvisning
   */
  updateLoanPreview() {
    const amount = parseInt(document.getElementById('loanAmount')?.value) || 0;
    const termWeeks = parseInt(document.getElementById('loanTermWeeks')?.value) || 4;
    const interestRate = parseFloat(document.getElementById('loanInterestRate')?.value) || 5;
    
    if (amount > 0) {
      const preview = loanService.calculateLoanPreview(amount, termWeeks, interestRate);
      document.getElementById('monthlyPaymentPreview').textContent = 
        formatCurrency(preview.monthlyPayment, this.settings.currencySymbol);
      document.getElementById('totalPaymentPreview').textContent = 
        formatCurrency(preview.totalPayment, this.settings.currencySymbol);
    }
  }

  /**
   * Opprett lån
   */
  async createLoan(e) {
    e.preventDefault();
    
    const borrowerValue = document.getElementById('loanBorrower').value;
    const amount = parseInt(document.getElementById('loanAmount').value);
    const termWeeks = parseInt(document.getElementById('loanTermWeeks').value);
    const interestRate = parseFloat(document.getElementById('loanInterestRate').value);
    
    if (!borrowerValue || !amount || !termWeeks) {
      uiManager.showError(languageService.t('error.fillAllFields'));
      return;
    }
    
    const [borrowerType, borrowerId] = borrowerValue.split(':');
    
    try {
      const loan = await loanService.createLoan(borrowerId, borrowerType, amount, termWeeks, interestRate);

      // Generer og send lånekontrakt
      await this.generateLoanContract(loan, borrowerId, borrowerType);

      uiManager.showSuccess(languageService.t('msg.loanCreated'));
      document.getElementById('createLoanModal').classList.add('hidden');
      document.getElementById('createLoanForm').reset();
      this.loadTeacherLoans();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Generer og send lånekontrakt
   */
  async generateLoanContract(loan, borrowerId, borrowerType, teacherReason = '') {
    const today = new Date();
    const dateStr = today.toLocaleDateString('nb-NO');
    
    // Finn låntaker-navn
    let borrowerName = languageService.t('common.unknown');
    if (borrowerType === 'student') {
      const student = dataService.getUserById(borrowerId);
      borrowerName = student?.name || languageService.t('common.unknownStudent');
    } else if (borrowerType === 'business') {
      const business = businessService.getBusinessById(borrowerId);
      borrowerName = business ? `${business.emoji || '🏢'} ${business.name}` : languageService.t('common.unknownBusiness');
    }

    // Hent låneverdier (støtt begge navnekonvensjoner)
    const loanAmount = loan.principalAmount || loan.amount || 0;
    const weeklyPayment = loan.monthlyPayment || loan.weeklyPayment || 0;
    const totalPayment = weeklyPayment * loan.termWeeks;
    const totalInterest = loan.totalInterest || (totalPayment - loanAmount);

    // Beregn nedbetalingsplan
    let paymentSchedule = '';
    let remainingBalance = totalPayment;
    
    for (let week = 1; week <= loan.termWeeks; week++) {
      const payment = week === loan.termWeeks ? remainingBalance : weeklyPayment;
      remainingBalance -= payment;
      paymentSchedule += `  ${languageService.t('loans.weekNumber', { week })}: ${formatCurrency(payment, this.settings.currencySymbol)} → ${languageService.t('loans.remainingBalance')}: ${formatCurrency(Math.max(0, remainingBalance), this.settings.currencySymbol)}\n`;
    }

    const reasonText = teacherReason ? `\n${languageService.t('loans.messageFromTeacher', { message: teacherReason })}\n` : '';

    const combinedMessage = `
${languageService.t('loans.congratsApproved')}

${languageService.t('loans.applicationApproved', { amount: formatCurrency(loanAmount, this.settings.currencySymbol) })}
${reasonText}
${languageService.t('loans.moneyDeposited')}

═══════════════════════════════════════

${languageService.t('loans.loanContract')}

${languageService.t('loans.agreementBetween')}
• ${languageService.t('loans.lender')}: ${languageService.t('loans.classroomBank')}
• ${languageService.t('loans.borrower')}: ${borrowerName}

${languageService.t('loans.loanDetailsLabel')}
• ${languageService.t('loans.amount')}: ${formatCurrency(loanAmount, this.settings.currencySymbol)}
• ${languageService.t('loans.interest')}: ${loan.interestRate}%
• ${languageService.t('loans.duration')}: ${loan.termWeeks} ${languageService.t('loans.weeksUnit')}
• ${languageService.t('loans.weeklyInstallment')}: ${formatCurrency(weeklyPayment, this.settings.currencySymbol)}
• ${languageService.t('loans.totalRepayment')}: ${formatCurrency(totalPayment, this.settings.currencySymbol)}

${languageService.t('loans.terms')}
- ${languageService.t('loans.term1')}
- ${languageService.t('loans.term2')}
- ${languageService.t('loans.term3')}

${languageService.t('loans.issueDate')}: ${dateStr}
${languageService.t('loans.loanId')}: ${loan.id}

${languageService.t('loans.signedDigitally')} ${dateStr}

═══════════════════════════════════════

${languageService.t('loans.repaymentPlan')}

${paymentSchedule.trim()}

───────────────────────────────────────
${languageService.t('loans.totalRepaymentLabel')}: ${formatCurrency(totalPayment, this.settings.currencySymbol)}
${languageService.t('loans.ofWhichInterest')}: ${formatCurrency(totalInterest, this.settings.currencySymbol)}
    `.trim();

    const contractId = `loancontract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const approvedTitle = languageService.t('loans.approvedTitle', { amount: formatCurrency(loanAmount, this.settings.currencySymbol) });
    
    // Send til låntaker (elev eller bedrift)
    if (borrowerType === 'student') {
      await dataService.createInboxMessage({
        id: contractId + '_borrower',
        recipientId: borrowerId,  // Fikset: bruker recipientId i stedet for userId
        title: approvedTitle,
        message: combinedMessage,
        type: 'loan_approved',
        fromName: languageService.t('loans.theBank'),
        fromType: 'system',
        read: false,
        createdAt: new Date().toISOString()
      });
    } else if (borrowerType === 'business') {
      await dataService.createBusinessMessage({
        id: contractId + '_borrower',
        businessId: borrowerId,
        title: approvedTitle,
        message: combinedMessage,
        type: 'loan_approved',
        senderName: languageService.t('loans.theBank'),
        senderType: 'system',
        read: false,
        createdAt: new Date().toISOString()
      });
    }

    // Send til lærer (i lån-kategorien)
    await dataService.createTeacherMessage({
      id: contractId + '_teacher',
      title: languageService.t('loans.newContractTitle', { borrower: borrowerName }),
      message: combinedMessage,
      type: 'loan_contract',
      fromName: languageService.t('loans.bank'),
      fromType: 'system',
      category: 'loans',
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Slett lån
   */
  async deleteLoan(loanId) {
    if (!confirm(languageService.t('confirm.deleteLoan'))) return;
    
    try {
      loanService.deleteLoan(loanId);
      uiManager.showSuccess(languageService.t('msg.loanDeleted'));
      this.loadTeacherLoans();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis modal for å godkjenne lånesøknad
   */
  async showApproveLoanModal(applicationId) {
    const applications = await dataService.getLoanApplications();
    const app = applications.find(a => a.id === applicationId);
    
    if (!app) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }
    
    // Bruk standard rente fra innstillinger
    const settings = await loanService.getSettings();
    const defaultRate = settings.defaultInterestRate || 5;
    const defaultTerm = 4; // Standard 4 uker
    
    const html = `
      <div id="approveLoanModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">✅ ${languageService.t('ui.approveLoanApplication')}</h3>
          
          <div class="bg-gray-50 p-4 rounded-lg mb-4">
            <p class="text-sm"><strong>${languageService.t('ui.applicantLabel')}:</strong> ${escapeHtml(app.applicantName)}</p>
            <p class="text-sm"><strong>${languageService.t('common.amount')}:</strong> ${formatCurrency(app.amount, this.settings.currencySymbol)}</p>
            <p class="text-sm"><strong>${languageService.t('loans.purpose')}:</strong> ${escapeHtml(app.purpose)}</p>
          </div>
          
          <form id="approveLoanForm" class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">${languageService.t('loans.term')} (${languageService.t('loans.weeks')})</label>
              <input type="number" id="approvedLoanTerm" min="1" max="52" value="${defaultTerm}" class="w-full px-3 py-2 border rounded-lg" required>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">${languageService.t('loans.interest')} (%)</label>
              <input type="number" id="approvedLoanRate" min="0" max="100" step="0.5" value="${defaultRate}" class="w-full px-3 py-2 border rounded-lg" required>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">${languageService.t('ui.reason')} (${languageService.t('student.message').replace(' (valgfritt)', '')})</label>
              <textarea id="approvedLoanReason" rows="2" class="w-full px-3 py-2 border rounded-lg" placeholder="${languageService.t('modal.reasonPlaceholder')}"></textarea>
            </div>
            <div class="flex gap-3">
              <button type="button" onclick="document.getElementById('approveLoanModal').remove()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg">
                ${languageService.t('btn.cancel')}
              </button>
              <button type="submit" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg">
                ${languageService.t('ui.approve')}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    document.getElementById('approveLoanForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const termWeeks = parseInt(document.getElementById('approvedLoanTerm').value);
      const interestRate = parseFloat(document.getElementById('approvedLoanRate').value);
      const reason = document.getElementById('approvedLoanReason').value.trim();
      this.approveLoanApplication(applicationId, termWeeks, interestRate, reason);
    });
  }

  /**
   * Godkjenn lånesøknad
   */
  async approveLoanApplication(applicationId, termWeeks, interestRate, reason) {
    const applications = await dataService.getLoanApplications();
    const app = applications.find(a => a.id === applicationId);

    if (!app) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }

    try {
      // Opprett lånet
      const loan = await loanService.createLoan(app.applicantId, app.applicantType, app.amount, termWeeks, interestRate);

      // Generer og send lånekontrakt med gratulasjon og nedbetalingsplan (kombinert melding)
      await this.generateLoanContract(loan, app.applicantId, app.applicantType, reason);

      // Oppdater søknaden
      await dataService.updateLoanApplication(applicationId, {
        ...app,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        reason: reason
      });
      
      // Lukk modal og oppdater visning
      document.getElementById('approveLoanModal')?.remove();
      uiManager.showSuccess(`${languageService.t('msg.loanApprovedFor')} ${app.applicantName}!`);
      this.loadTeacherLoans();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis modal for å avslå lånesøknad
   */
  async showRejectLoanModal(applicationId) {
    const applications = await dataService.getLoanApplications();
    const app = applications.find(a => a.id === applicationId);
    
    if (!app) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }
    
    const html = `
      <div id="rejectLoanModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">❌ ${languageService.t('ui.rejectLoanApplication')}</h3>
          
          <div class="bg-gray-50 p-4 rounded-lg mb-4">
            <p class="text-sm"><strong>${languageService.t('ui.applicantLabel')}:</strong> ${escapeHtml(app.applicantName)}</p>
            <p class="text-sm"><strong>${languageService.t('common.amount')}:</strong> ${formatCurrency(app.amount, this.settings.currencySymbol)}</p>
            <p class="text-sm"><strong>${languageService.t('loans.purpose')}:</strong> ${escapeHtml(app.purpose)}</p>
          </div>
          
          <form id="rejectLoanForm" class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">${languageService.t('ui.reason')} (${languageService.t('student.message').replace(' (valgfritt)', '')})</label>
              <textarea id="rejectLoanReason" rows="3" class="w-full px-3 py-2 border rounded-lg" placeholder="${languageService.t('modal.reasonPlaceholder')}"></textarea>
            </div>
            <div class="flex gap-3">
              <button type="button" onclick="document.getElementById('rejectLoanModal').remove()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg">
                ${languageService.t('btn.cancel')}
              </button>
              <button type="submit" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg">
                ${languageService.t('btn.reject')}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
    
    document.getElementById('rejectLoanForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const reason = document.getElementById('rejectLoanReason').value.trim();
      this.rejectLoanApplication(applicationId, reason);
    });
  }

  /**
   * Avslå lånesøknad
   */
  async rejectLoanApplication(applicationId, reason) {
    const applications = await dataService.getLoanApplications();
    const app = applications.find(a => a.id === applicationId);

    if (!app) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }

    // Oppdater søknaden
    await dataService.updateLoanApplication(applicationId, {
      ...app,
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      reason: reason
    });
    
    // Send melding til søker
    const messageTitle = '❌ Lånesøknad avslått';
    const messageText = `Din søknad om lån på ${formatCurrency(app.amount, this.settings.currencySymbol)} ble dessverre avslått.
${reason ? `\nBegrunnelse fra lærer: ${reason}` : ''}

Du kan søke på nytt med et annet beløp eller formål.`;
    
    if (app.applicantType === 'student') {
      try {
        await dataService.createInboxMessage({
          recipientId: app.applicantId,
          title: messageTitle,
          message: messageText,
          type: 'loan_rejected',
          fromName: '🏛️ Klasserombanken',
          fromType: 'system'
        });
      } catch (e) {
        console.error('Firebase feilet ved opprettelse av inbox-melding:', e);
      }
    } else if (app.applicantType === 'business') {
      try {
        await dataService.createBusinessMessage({
          businessId: app.applicantId,
          title: messageTitle,
          message: messageText,
          type: 'loan_rejected',
          senderName: '🏛️ Klasserombanken',
          senderType: 'system'
        });
      } catch (e) {
        console.error('Firebase feilet ved opprettelse av business-melding:', e);
      }
    }
    
    // Lukk modal og oppdater visning
    document.getElementById('rejectLoanModal')?.remove();
    uiManager.showSuccess(`${languageService.t('msg.loanRejectedFrom')} ${app.applicantName} ${languageService.t('msg.rejected')}`);
    this.loadTeacherLoans();
  }

  // ==================== BEDRIFT FUNKSJONER ====================

  /**
   * Last bedrifter for lærer
   */
  async loadTeacherBusinesses() {
    const pendingContainer = document.getElementById('pendingBusinessesList');
    const allContainer = document.getElementById('allBusinessesTableBody');
    
    // Sørg for at settings er lastet
    if (!this.settings) {
      this.settings = await settingsService.getSettings();
    }
    const currencySymbol = this.settings?.currencySymbol || 'KKr';
    
    // Statistikk-elementer
    const activeBusinessCountEl = document.getElementById('activeBusinessCount');
    const totalBusinessRevenueEl = document.getElementById('totalBusinessRevenue');
    const totalBusinessEmployeesEl = document.getElementById('totalBusinessEmployees');
    
    if (!(await businessService.isEnabled())) {
      const disabledMsg = languageService.t('ui.businessSystemDisabled');
      if (pendingContainer) pendingContainer.innerHTML = `<p class="text-gray-500">${disabledMsg}</p>`;
      if (allContainer) allContainer.innerHTML = `<tr><td colspan="7" class="text-center text-gray-500 py-8">${disabledMsg}</td></tr>`;
      if (activeBusinessCountEl) activeBusinessCountEl.textContent = '0';
      if (totalBusinessRevenueEl) totalBusinessRevenueEl.textContent = `0 ${currencySymbol}`;
      if (totalBusinessEmployeesEl) totalBusinessEmployeesEl.textContent = '0';
      return;
    }
    
    // Hent alle bedrifter for statistikk
    const allBusinesses = businessService.getAllBusinesses();
    const activeBusiensses = allBusinesses.filter(b => b.status === 'active');
    const totalRevenue = activeBusiensses.reduce((sum, b) => sum + (b.balance || 0), 0);
    const totalEmployees = activeBusiensses.reduce((sum, b) => sum + (b.employees?.length || 0), 0);
    
    // Oppdater statistikk
    if (activeBusinessCountEl) activeBusinessCountEl.textContent = activeBusiensses.length;
    if (totalBusinessRevenueEl) totalBusinessRevenueEl.textContent = formatCurrency(totalRevenue, currencySymbol);
    if (totalBusinessEmployeesEl) totalBusinessEmployeesEl.textContent = totalEmployees;
    const bussBannerEl = document.getElementById('teacherBusinessesBannerCount');
    if (bussBannerEl) bussBannerEl.textContent = activeBusiensses.length;

    // Ventende godkjenninger
    const pending = businessService.getPendingBusinesses();
    if (pendingContainer) {
      if (pending.length === 0) {
        pendingContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('teacher.noPendingApprovals')}</p>`;
      } else {
        pendingContainer.innerHTML = pending.map(b => {
          const founder = dataService.getUserById(b.owners[0]?.userId);
          const logoDisplay = b.logo 
            ? `<img src="${b.logo}" alt="${escapeHtml(b.name)}" class="w-8 h-8 rounded object-cover inline-block mr-2">`
            : (b.emoji || '🏢');
          return `
            <div class="bg-amber-50 p-3 rounded-lg flex justify-between items-center">
              <div class="flex items-center">
                ${b.logo ? logoDisplay : `<span class="mr-2">${logoDisplay}</span>`}
                <div>
                  <p class="font-medium">${escapeHtml(b.name)}</p>
                  <p class="text-xs text-gray-600">${languageService.t('business.founder')}: ${founder?.name || languageService.t('common.unknown')}</p>
                </div>
              </div>
              <div class="flex gap-2">
                <button onclick="window.econSim.approveBusiness('${b.id}')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm">✓</button>
                <button onclick="window.econSim.rejectBusiness('${b.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">✗</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Alle bedrifter
    const all = businessService
      .getAllBusinesses()
      .filter(b => b.status !== 'pending')
      .map(b => {
        const growth = getBusinessWeeklyGrowth(b);
        return { ...b, _growth: growth };
      })
      .sort((a, b) => b._growth.growthPct - a._growth.growthPct);

    if (allContainer) {
      if (all.length === 0) {
        allContainer.innerHTML = `<tr><td colspan="7" class="text-center text-gray-500 py-8">${languageService.t('teacher.noBusinessesRegistered')}</td></tr>`;
      } else {
        allContainer.innerHTML = all.map(b => {
          const statusClass = b.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
          const statusText = b.status === 'active' ? languageService.t('common.active') : b.status;
          const { growthPct } = b._growth;
          const indicator = getGrowthIndicator(growthPct);
          const growthText = `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`;
          const logoDisplay = b.logo 
            ? `<img src="${b.logo}" alt="${escapeHtml(b.name)}" class="w-6 h-6 rounded object-cover inline-block mr-2">`
            : (b.emoji || '🏢') + ' ';
          
          // Vis eiere med prosentandeler
          const ownersDisplay = (b.owners || []).map(owner => {
            const user = dataService.getUserById(owner.userId);
            const name = user ? (user.name || user.username) : languageService.t('common.unknown');
            return `${escapeHtml(name)} (${owner.percentage}%)`;
          }).join(', ') || languageService.t('common.none');
          
          return `
            <tr class="border-b hover:bg-gray-50">
              <td class="py-3 px-2 flex items-center">${logoDisplay}${escapeHtml(b.name)}</td>
              <td class="py-3 px-2 text-xs">${ownersDisplay}</td>
              <td class="py-3 px-2">${b.accountNumber}</td>
              <td class="py-3 px-2">${formatCurrency(b.balance, currencySymbol)}</td>
              <td class="py-3 px-2">
                <span class="font-medium ${indicator.className}" title="${indicator.label}">${indicator.arrow} ${growthText}</span>
              </td>
              <td class="py-3 px-2">${b.employees.length}</td>
              <td class="py-3 px-2"><span class="px-2 py-1 rounded text-xs ${statusClass}">${statusText}</span></td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  /**
   * Godkjenn bedrift
   */
  async approveBusiness(businessId) {
    try {
      await businessService.approveBusiness(businessId);
      uiManager.showSuccess(languageService.t('msg.businessApproved'));
      await this.loadTeacherBusinesses();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Avslå bedrift
   */
  async rejectBusiness(businessId) {
    const reason = prompt(languageService.t('business.reasonForRejection') || 'Årsak til avslag (valgfritt):');
    try {
      await businessService.rejectBusiness(businessId, reason || '');
      uiManager.showSuccess(languageService.t('msg.businessRejected'));
      await this.loadTeacherBusinesses();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Last bedrifter for elev - med faner og detaljvisning
   */
  async loadStudentBusinesses() {
    const user = authService.getCurrentUser();
    const businessTabsContainer = document.getElementById('businessTabs');
    const noBusinessesMessage = document.getElementById('noBusinessesMessage');
    const employmentContainer = document.getElementById('myEmploymentsList');
    const pendingOffersSection = document.getElementById('pendingOffersSection');
    
    if (!(await businessService.isEnabled())) {
      if (businessTabsContainer) businessTabsContainer.innerHTML = '';
      if (noBusinessesMessage) {
        noBusinessesMessage.textContent = languageService.t('ui.businessSystemDisabled');
        noBusinessesMessage.classList.remove('hidden');
      }
      if (employmentContainer) employmentContainer.innerHTML = '';
      return;
    }

    // Last ventende tilbud (kjøpstilbud og jobbtilbud)
    this.loadPendingOffers();

    // Mine bedrifter (eier)
    const myBusinesses = businessService.getBusinessesByOwner(user.id);
    const bussBannerEl2 = document.getElementById('studentBusinessesBannerCount');
    if (bussBannerEl2) bussBannerEl2.textContent = myBusinesses.length;

    // Vis faner for bedrifter
    if (businessTabsContainer) {
      if (myBusinesses.length === 0) {
        businessTabsContainer.innerHTML = '';
        if (noBusinessesMessage) noBusinessesMessage.classList.remove('hidden');
        document.getElementById('selectedBusinessDetails')?.classList.add('hidden');
      } else {
        if (noBusinessesMessage) noBusinessesMessage.classList.add('hidden');
        businessTabsContainer.innerHTML = myBusinesses.map((b, index) => {
          // Sjekk om logo er base64-bilde eller emoji
          const logoHtml = b.logo && b.logo.startsWith('data:') 
            ? `<img src="${b.logo}" alt="Logo" class="w-8 h-8 rounded object-cover">`
            : `<span class="text-2xl">${b.logo || '🏢'}</span>`;
          
          return `
          <button onclick="window.econSim.selectBusiness('${b.id}')" 
            class="business-select-btn px-6 py-3 rounded-lg font-medium flex items-center gap-3 shadow-md hover:shadow-lg transition-shadow ${index === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-300'}"
            data-business-id="${b.id}">
            ${logoHtml}
            <span>${escapeHtml(b.name)}</span>
          </button>
        `}).join('');
        
        // Velg første bedrift automatisk
        if (!this.selectedBusinessId && myBusinesses.length > 0) {
          this.selectBusiness(myBusinesses[0].id);
        } else if (this.selectedBusinessId) {
          // Oppdater valgt bedrift
          this.selectBusiness(this.selectedBusinessId);
        }
      }
    }

    // Mine ansettelser
    const employments = businessService.getUserEmploymentInfo(user.id);
    const employeeJobs = employments.filter(e => e.type === 'employee');
    if (employmentContainer) {
      if (employeeJobs.length === 0) {
        employmentContainer.innerHTML = '<p class="text-gray-500 text-sm">Du er ikke ansatt i noen bedrifter</p>';
      } else {
        employmentContainer.innerHTML = employeeJobs.map(e => `
          <div class="bg-gray-50 p-3 rounded">
            <p class="font-medium">${escapeHtml(e.businessName)}</p>
            <p class="text-sm text-gray-600">${e.title}</p>
            <p class="text-sm text-green-600">${formatCurrency(e.salary, this.settings.currencySymbol)}/uke</p>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Last tilgjengelige bedriftsjobber (beholdes for eventuell fremtidig bruk)
   */
  loadAvailableBusinessJobs() {
    const container = document.getElementById('availableBusinessJobs');
    if (!container) return;

    const user = authService.getCurrentUser();
    const classroomId = user.classroomId;
    
    // Hent alle bedrifter i klasserommet
    const businesses = businessService.getBusinessesByClassroom(classroomId);
    
    // Samle alle åpne jobber fra alle bedrifter (ikke mine egne)
    const availableJobs = [];
    for (const business of businesses) {
      // Ikke vis jobber fra egne bedrifter
      const isOwner = business.owners.some(o => o.userId === user.id);
      if (isOwner) continue;
      
      if (business.jobs && business.jobs.length > 0) {
        for (const job of business.jobs) {
          if (job.status === 'open') {
            availableJobs.push({
              ...job,
              businessName: business.name,
              businessEmoji: business.emoji,
              businessLogo: business.logo
            });
          }
        }
      }
    }
    
    if (availableJobs.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Ingen ledige bedriftsjobber</p>';
      return;
    }
    
    container.innerHTML = availableJobs.map(job => {
      const businessDisplay = job.businessLogo 
        ? `<img src="${job.businessLogo}" alt="${escapeHtml(job.businessName)}" class="w-8 h-8 rounded object-cover inline-block mr-2">`
        : (job.businessEmoji || '🏢');
      const jobTypeBadge = job.type === 'project' 
        ? `<span class="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">${languageService.t('jobs.project')}</span>`
        : `<span class="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">${languageService.t('jobs.permanent')}</span>`;
      const salaryLabel = job.type === 'project' ? '' : languageService.t('jobs.perWeek');
      
      return `
        <div class="bg-gray-50 p-4 rounded-lg">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-medium flex items-center">${businessDisplay} ${escapeHtml(job.businessName)}</p>
              <p class="text-lg font-semibold">${escapeHtml(job.title)}${jobTypeBadge}</p>
              ${job.description ? `<p class="text-sm text-gray-600">${escapeHtml(job.description)}</p>` : ''}
              <p class="text-sm text-green-600 mt-1">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
            </div>
            <button onclick="window.econSim.applyForBusinessJob('${job.businessId}', '${job.id}')" 
              class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
              Søk
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Vis søknadsmodal for bedriftsjobb
   */
  async applyForBusinessJob(businessId, jobId) {
    try {
      const user = authService.getCurrentUser();
      const business = businessService.getBusinessById(businessId);
      const job = business?.jobs?.find(j => j.id === jobId);
      
      if (!business || !job) {
        uiManager.showError(languageService.t('error.jobNotFound'));
        return;
      }
      
      // Sjekk om det finnes eksisterende søknad (for redigering)
      const applications = await dataService.getBusinessJobApplications();
      const existingApplication = applications.find(a => a.jobId === jobId && a.applicantId === user.id && a.status === 'pending');
      
      const salaryLabel = job.type === 'project' ? '/utført' : '/uke';
      
      // Fyll inn jobbinfo
      document.getElementById('applyJobId').value = jobId;
      document.getElementById('applyBusinessId').value = businessId;
      document.getElementById('applicationText').value = existingApplication?.text || '';
      document.getElementById('applyJobInfo').innerHTML = `
        <p class="text-xs text-gray-500 mb-1">${business.emoji || '🏢'} ${escapeHtml(business.name)}</p>
        <h4 class="font-semibold">${escapeHtml(job.title)}</h4>
        <p class="text-sm text-gray-600">${escapeHtml(job.description || languageService.t('common.noDescription'))}</p>
        <p class="text-sm font-medium text-green-600 mt-2">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
        ${existingApplication ? '<p class="text-sm text-purple-600 mt-2">✏️ Du redigerer din eksisterende søknad</p>' : ''}
      `;
      
      document.getElementById('applicationModal').classList.remove('hidden');
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Last ventende tilbud (kjøpstilbud på eierandeler og jobbtilbud)
   */
  async loadPendingOffers() {
    const user = authService.getCurrentUser();
    const section = document.getElementById('pendingOffersSection');
    const list = document.getElementById('pendingOffersList');

    // Oppdater alltid jobber-badge
    await this.updateJobsBadge();

    if (!section || !list) return;

    // Hent kjøpstilbud
    const ownershipOffers = businessService.getPendingOffersForBuyer(user.id);

    // Hent jobbtilbud (direkte ansettelser)
    const jobOffers = await getPendingJobOffersUtil(user.id, { dataService, classroomService, authService });

    const allOffers = [
      ...ownershipOffers.map(o => ({ ...o, offerType: 'ownership' })),
      ...jobOffers.map(o => ({ ...o, offerType: 'job' }))
    ];
    
    if (allOffers.length === 0) {
      section.classList.add('hidden');
      return;
    }
    
    section.classList.remove('hidden');
    list.innerHTML = allOffers.map(offer => {
      if (offer.offerType === 'ownership') {
        return `
          <div class="bg-white p-4 rounded-lg border border-amber-300">
            <div class="flex justify-between items-start">
              <div>
                <p class="font-bold">📝 Kjøpstilbud: ${offer.percentage}% av ${escapeHtml(offer.businessName)}</p>
                <p class="text-sm text-gray-600">Pris: ${formatCurrency(offer.price, this.settings.currencySymbol)}</p>
              </div>
              <div class="flex gap-2">
                <button onclick="window.econSim.acceptOwnershipOffer('${offer.id}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                  ✓ Godta
                </button>
                <button onclick="window.econSim.rejectOwnershipOffer('${offer.id}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">
                  ✕ Avslå
                </button>
              </div>
            </div>
          </div>
        `;
      } else {
        const jobTypeBadge = offer.jobType === 'project' 
          ? `<span class="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">${languageService.t('jobs.projectJob')}</span>`
          : `<span class="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">${languageService.t('jobs.permanentPosition')}</span>`;
        const salaryLabel = offer.jobType === 'project' ? '' : languageService.t('jobs.perWeek');
        
        // Vis hvem tilbudet er fra
        const fromLabel = offer.isTeacherJob 
          ? `🏛️ ${languageService.t('common.stateTeacher')}`
          : (offer.businessName ? `🏢 ${escapeHtml(offer.businessName)}` : `🏢 ${languageService.t('common.business')}`);
        
        return `
          <div class="bg-white p-4 rounded-lg border border-amber-300">
            <div class="flex justify-between items-start">
              <div>
                <p class="font-bold">💼 ${languageService.t('jobs.jobOffer')}: ${escapeHtml(offer.jobTitle)}${jobTypeBadge}</p>
                <p class="text-sm text-gray-600">${languageService.t('common.from')}: ${fromLabel} • ${languageService.t('jobs.salary')}: ${formatCurrency(offer.salary, this.settings.currencySymbol)}${salaryLabel}</p>
              </div>
              <div class="flex gap-2">
                <button onclick="window.econSim.acceptJobOffer('${offer.id}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                  ✓ ${languageService.t('jobs.accept')}
                </button>
                <button onclick="window.econSim.rejectJobOffer('${offer.id}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">
                  ✕ ${languageService.t('jobs.decline')}
                </button>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  /**
   * Last jobbtilbud for jobbskjermen
   */
  async loadJobOffers() {
    const user = authService.getCurrentUser();
    const section = document.getElementById('jobOffersSection');
    const list = document.getElementById('jobOffersList');

    if (!section || !list) return;

    const jobOffers = await getPendingJobOffersUtil(user.id, { dataService, classroomService, authService });
    
    if (jobOffers.length === 0) {
      section.classList.add('hidden');
      return;
    }
    
    section.classList.remove('hidden');
    list.innerHTML = jobOffers.map(offer => {
      const jobTypeBadge = offer.jobType === 'project' 
        ? `<span class="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">${languageService.t('jobs.projectJob')}</span>`
        : `<span class="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">${languageService.t('jobs.permanentPosition')}</span>`;
      const salaryLabel = offer.jobType === 'project' ? '' : languageService.t('jobs.perWeek');
      
      // Vis hvem tilbudet er fra
      const fromLabel = offer.isTeacherJob 
        ? `🏛️ ${languageService.t('common.stateTeacher')}`
        : (offer.businessName ? `🏢 ${escapeHtml(offer.businessName)}` : `🏢 ${languageService.t('common.business')}`);
      
      return `
        <div class="bg-white p-4 rounded-lg border border-amber-300">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-bold">💼 ${escapeHtml(offer.jobTitle)}${jobTypeBadge}</p>
              <p class="text-sm text-gray-600">${languageService.t('common.from')}: ${fromLabel}</p>
              <p class="text-sm text-green-600 font-medium">${formatCurrency(offer.salary, this.settings.currencySymbol)}${salaryLabel}</p>
            </div>
            <div class="flex gap-2">
              <button onclick="window.econSim.acceptJobOffer('${offer.id}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm">
                ✓ ${languageService.t('jobs.accept')}
              </button>
              <button onclick="window.econSim.rejectJobOffer('${offer.id}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">
                ✕ ${languageService.t('jobs.decline')}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Velg bedrift og vis detaljer
   */
  selectBusiness(businessId) {
    this.selectedBusinessId = businessId;
    const business = businessService.getBusinessById(businessId);
    const user = authService.getCurrentUser();
    
    if (!business) {
      document.getElementById('selectedBusinessDetails')?.classList.add('hidden');
      return;
    }
    
    // Oppdater fane-knapper
    document.querySelectorAll('.business-select-btn').forEach(btn => {
      if (btn.dataset.businessId === businessId) {
        btn.className = 'business-select-btn px-6 py-3 rounded-lg font-medium flex items-center gap-3 shadow-md hover:shadow-lg transition-shadow bg-blue-600 text-white';
      } else {
        btn.className = 'business-select-btn px-6 py-3 rounded-lg font-medium flex items-center gap-3 shadow-md hover:shadow-lg transition-shadow bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-300';
      }
    });
    
    // Vis detaljer
    const detailsSection = document.getElementById('selectedBusinessDetails');
    detailsSection?.classList.remove('hidden');
    
    // Oppdater header - bruk logo hvis tilgjengelig
    const emojiContainer = document.getElementById('selectedBusinessEmoji');
    if (emojiContainer) {
      if (business.logo) {
        emojiContainer.innerHTML = `<img src="${business.logo}" alt="${escapeHtml(business.name)}" class="w-12 h-12 rounded-lg object-cover">`;
      } else {
        emojiContainer.textContent = business.emoji || '🏢';
      }
    }
    document.getElementById('selectedBusinessName').textContent = business.name;
    document.getElementById('selectedBusinessDesc').textContent = business.description || languageService.t('common.noDescription');
    document.getElementById('selectedBusinessAccount').textContent = business.accountNumber;
    document.getElementById('selectedBusinessBalance').textContent = formatCurrency(business.balance, this.settings.currencySymbol);
    
    // Eierskap
    const ownersContainer = document.getElementById('selectedBusinessOwners');
    ownersContainer.innerHTML = business.owners.map(o => {
      const owner = dataService.getUserById(o.userId);
      const isMe = o.userId === user.id;
      return `
        <span class="px-3 py-1 rounded-full text-sm ${isMe ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
          ${isMe ? '👤 Du' : (owner?.name || 'Ukjent')}: ${o.percentage}%
        </span>
      `;
    }).join('');
    
    // Eierandel info for salg
    const myOwnership = business.owners.find(o => o.userId === user.id);
    document.getElementById('myOwnershipPercentage').textContent = `${myOwnership?.percentage || 0}%`;
    document.getElementById('myOwnershipCostBasis').textContent = formatCurrency(myOwnership?.costBasis || 0, this.settings.currencySymbol);
    document.getElementById('sellPercentage').max = myOwnership?.percentage || 0;
    
    // Maks ansatte info
    const maxEmployees = businessService.calculateMaxEmployees(businessId);
    document.getElementById('maxEmployeesInfo').textContent = 
      `Ansatte: ${business.employees.length} / ${maxEmployees} (basert på bedriftens saldo)`;
    
    // Last inn transaksjoner (standard fane)
    this.showBusinessTab('transactions');
  }

  /**
   * Vis bedriftsfane
   */
  async showBusinessTab(tabName) {
    // Oppdater knapper
    document.querySelectorAll('.business-tab-btn').forEach(btn => {
      const isMessages = btn.dataset.tab === 'messages';
      const isLoans = btn.dataset.tab === 'loans';
      if (btn.dataset.tab === tabName) {
        btn.className = `business-tab-btn bg-blue-600 text-white px-4 py-2 rounded-lg text-sm${(isMessages || isLoans) ? ' relative' : ''}`;
      } else {
        btn.className = `business-tab-btn bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm${(isMessages || isLoans) ? ' relative' : ''}`;
      }
    });
    
    // Skjul alle faner
    document.querySelectorAll('.business-tab-content').forEach(tab => {
      tab.classList.add('hidden');
    });
    
    // Vis valgt fane
    const tabElement = document.getElementById(`business${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
    tabElement?.classList.remove('hidden');
    
    // Last data for fanen
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) return;
    
    switch (tabName) {
      case 'transactions':
        this.loadBusinessTransactions(business);
        break;
      case 'employees':
        // Last både ansatte og jobbutlysninger
        this.loadBusinessEmployees(business);
        await this.loadBusinessJobs(business);
        break;
      case 'messages':
        this.loadBusinessMessages(business);
        break;
      case 'ownership':
        this.loadBusinessOwnershipOffers(business);
        break;
      case 'transfer':
        // Overføringer trenger ikke ekstra lasting - input-felt er allerede der
        break;
      case 'loans':
        this.loadBusinessLoans(business);
        break;
    }
  }

  /**
   * Last bedriftens transaksjoner
   */
  loadBusinessTransactions(business) {
    const container = document.getElementById('businessTransactionsList');
    if (!container) return;
    
    if (!business.transactions || business.transactions.length === 0) {
      this.cachedBusinessTransactions = [];
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('business.noTransactions')}</p>`;
      return;
    }
    
    // Sorter nyeste først og cache
    const sortedTransactions = [...business.transactions].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    this.cachedBusinessTransactions = sortedTransactions;
    this.renderBusinessTransactions(sortedTransactions);
  }

  /**
   * Render bedrifts-transaksjoner
   */
  renderBusinessTransactions(transactions) {
    const container = document.getElementById('businessTransactionsList');
    if (!container) return;
    
    if (transactions.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('business.noTransactions')}</p>`;
      return;
    }
    
    container.innerHTML = transactions.map(tx => {
      const isIncome = tx.type === 'income';
      const translatedDescription = translateTransactionDescription(tx.description);
      return `
        <div class="flex justify-between items-center py-2 border-b last:border-0">
          <div>
            <p class="text-sm">${escapeHtml(translatedDescription)}</p>
            <p class="text-xs text-gray-500">${new Date(tx.date).toLocaleDateString('nb-NO')}</p>
          </div>
          <span class="${isIncome ? 'text-green-600' : 'text-red-600'} font-medium">
            ${isIncome ? '+' : '-'}${formatCurrency(tx.amount, this.settings.currencySymbol)}
          </span>
        </div>
      `;
    }).join('');
  }

  /**
   * Filtrer bedrifts-transaksjoner
   */
  filterBusinessTransactions(searchTerm) {
    if (!searchTerm) {
      this.renderBusinessTransactions(this.cachedBusinessTransactions);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = this.cachedBusinessTransactions.filter(tx => {
      const description = (tx.description || '').toLowerCase();
      const amount = tx.amount.toString();
      
      return description.includes(term) || amount.includes(term);
    });
    
    this.renderBusinessTransactions(filtered);
  }

  /**
   * Last bedriftens ansatte
   */
  async loadBusinessEmployees(business) {
    const container = document.getElementById('businessEmployeesList');
    if (!container) return;
    
    // Oppdater kapasitetsinfo i separat element
    const maxEmployees = businessService.calculateMaxEmployees(business.id);
    const maxInfoElement = document.getElementById('maxEmployeesInfo');
    if (maxInfoElement) {
      maxInfoElement.textContent = languageService.t('ui.employeesInfo', { current: business.employees?.length || 0, max: maxEmployees });
    }
    
    let html = '';
    
    // Vis sendte jobbtilbud (venter på svar)
    const allOffers = await dataService.getJobOffers();
    const sentOffers = allOffers.filter(o => o.businessId === business.id && o.status === 'pending');
    
    if (sentOffers.length > 0) {
      html += `
        <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 class="font-medium text-blue-800 mb-3">📤 ${languageService.t('business.sentOffers')} (${sentOffers.length})</h4>
          <div class="space-y-2">
            ${sentOffers.map(offer => `
              <div class="flex justify-between items-center bg-white p-3 rounded border">
                <div>
                  <p class="font-medium">${escapeHtml(offer.employeeName)}</p>
                  <p class="text-sm text-gray-600">${languageService.t('jobs.jobOffer')}: ${escapeHtml(offer.jobTitle)}</p>
                </div>
                <span class="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded">${languageService.t('common.pending')}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    // Vis ansatte
    if (!business.employees || business.employees.length === 0) {
      html += `<p class="text-gray-500 text-sm">${languageService.t('business.noEmployees')}</p>`;
    } else {
      html += '<div class="space-y-2">';
      html += business.employees.map(emp => {
        const employee = dataService.getUserById(emp.userId);
        return `
          <div class="flex justify-between items-center bg-gray-50 p-3 rounded">
            <div>
              <p class="font-medium">${employee?.name || languageService.t('common.unknown')}</p>
              <p class="text-sm text-gray-600">${emp.title}</p>
            </div>
            <div class="text-right">
              <p class="text-green-600 font-medium">${formatCurrency(emp.salary, this.settings.currencySymbol)}${languageService.t('jobs.perWeek')}</p>
              <button onclick="window.econSim.fireEmployee('${business.id}', '${emp.userId}')" 
                class="text-red-600 hover:text-red-800 text-xs">${languageService.t('business.fireEmployee')}</button>
            </div>
          </div>
        `;
      }).join('');
      html += '</div>';
    }
    
    container.innerHTML = html;
  }

  /**
   * Last bedriftens jobbutlysninger
   */
  async loadBusinessJobs(business) {
    const container = document.getElementById('businessJobsList');
    if (!container) return;

    if (!business.jobs || business.jobs.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('ui.noJobListings')}</p>`;
      return;
    }

    // Grupper jobber etter status - vis kun ÅPNE stillinger her
    // Aktive og fullførte jobber vises i Ansatte-seksjonen
    const openJobs = business.jobs.filter(j => j.status === 'open');
    const offeredJobs = business.jobs.filter(j => j.status === 'offered');

    let html = '';

    // Åpne stillinger
    if (openJobs.length > 0) {
      const openJobCards = await Promise.all(openJobs.map(job => this.renderBusinessJobCard(business, job)));
      html += `<div class="mb-4"><h4 class="text-sm font-medium text-gray-600 mb-2">🔍 ${languageService.t('modal.openPosition')}</h4>`;
      html += openJobCards.join('');
      html += '</div>';
    }

    // Ventende tilbud
    if (offeredJobs.length > 0) {
      const offeredJobCards = await Promise.all(offeredJobs.map(job => this.renderBusinessJobCard(business, job)));
      html += `<div class="mb-4"><h4 class="text-sm font-medium text-gray-600 mb-2">📩 ${languageService.t('business.pendingOffers')}</h4>`;
      html += offeredJobCards.join('');
      html += '</div>';
    }

    if (!html) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('business.noJobListings')}</p>`;
    } else {
      container.innerHTML = html;
    }
  }
  
  /**
   * Render et jobbkort for bedriften
   */
  async renderBusinessJobCard(business, job) {
    const jobTypeBadge = job.type === 'project' 
      ? `<span class="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded ml-2">${languageService.t('jobs.project')}</span>`
      : `<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded ml-2">${languageService.t('jobs.permanent')}</span>`;
    const salaryLabel = job.type === 'project' ? '' : languageService.t('jobs.perWeek');
    
    // Hent ansatt-info hvis jobben er aktiv
    let assignedInfo = '';
    if (job.assignedTo) {
      const employee = dataService.getUserById(job.assignedTo);
      assignedInfo = `<p class="text-sm text-blue-600">👤 ${employee?.name || languageService.t('common.unknownEmployee')}</p>`;
    }
    
    // Hent søknader for denne jobben
    const applications = await dataService.getBusinessJobApplications();
    const jobApplications = applications.filter(a => a.jobId === job.id && a.status === 'pending');
    
    let applicationsHtml = '';
    if (job.status === 'open' && jobApplications.length > 0) {
      applicationsHtml = `
        <div class="mt-3 border-t pt-2">
          <p class="text-xs font-medium text-gray-600 mb-2">📨 ${languageService.t('business.applications')} (${jobApplications.length}):</p>
          ${jobApplications.map(app => `
            <div class="bg-white p-2 rounded border mb-2">
              <p class="font-medium text-sm">${escapeHtml(app.applicantName)}</p>
              <p class="text-xs text-gray-600 italic">"${escapeHtml(app.text?.substring(0, 100) || languageService.t('common.noApplicationText'))}${app.text?.length > 100 ? '...' : ''}"</p>
              <div class="flex gap-2 mt-2">
                <button onclick="window.econSim.viewBusinessApplication('${app.id}')" 
                  class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 border rounded">📖 ${languageService.t('business.readApplication')}</button>
                <button onclick="window.econSim.hireApplicant('${business.id}', '${job.id}', '${app.id}')" 
                  class="text-green-600 hover:text-green-800 text-xs px-2 py-1 border rounded">✅ ${languageService.t('business.hire')}</button>
                <button onclick="window.econSim.rejectBusinessJobApplication('${app.id}')"
                  class="text-red-600 hover:text-red-800 text-xs px-2 py-1 border rounded">❌ ${languageService.t('business.reject')}</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (job.status === 'open' && jobApplications.length === 0) {
      applicationsHtml = `<p class="text-xs text-gray-400 mt-2">${languageService.t('business.noApplicationsYet')}</p>`;
    }
    
    // Handlingsknapper basert på status
    let actions = '';
    if (job.status === 'open') {
      actions = `
        <div class="flex gap-2 mt-2">
          <button onclick="window.econSim.editBusinessJob('${business.id}', '${job.id}')" 
            class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 border rounded">✏️ ${languageService.t('btn.edit')}</button>
          <button onclick="window.econSim.removeBusinessJob('${business.id}', '${job.id}')" 
            class="text-red-600 hover:text-red-800 text-xs px-2 py-1 border rounded">🗑️ ${languageService.t('btn.delete')}</button>
        </div>`;
    } else if (job.status === 'offered') {
      actions = `
        <div class="flex gap-2 mt-2">
          <button onclick="window.econSim.cancelBusinessJobOffer('${business.id}', '${job.id}')" 
            class="text-orange-600 hover:text-orange-800 text-xs px-2 py-1 border rounded">↩️ ${languageService.t('business.withdrawOffer')}</button>
        </div>`;
    } else if (job.status === 'active') {
      actions = `
        <div class="flex gap-2 mt-2">
          <button onclick="window.econSim.endBusinessJob('${business.id}', '${job.id}')" 
            class="text-orange-600 hover:text-orange-800 text-xs px-2 py-1 border rounded">⏹️ ${languageService.t('jobs.endJob')}</button>
        </div>`;
    } else if (job.status === 'completed') {
      actions = `
        <div class="flex gap-2 mt-2">
          <button onclick="window.econSim.reopenBusinessJob('${business.id}', '${job.id}')" 
            class="text-green-600 hover:text-green-800 text-xs px-2 py-1 border rounded">🔄 ${languageService.t('business.reopenJob')}</button>
          <button onclick="window.econSim.removeBusinessJob('${business.id}', '${job.id}')" 
            class="text-red-600 hover:text-red-800 text-xs px-2 py-1 border rounded">🗑️ ${languageService.t('btn.delete')}</button>
        </div>`;
    }
    
    return `
      <div class="bg-gray-50 p-3 rounded mb-2 border-l-4 ${getJobStatusColor(job.status)}">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <p class="font-medium">${escapeHtml(job.title)}${jobTypeBadge}</p>
            ${job.description ? `<p class="text-sm text-gray-600">${escapeHtml(job.description)}</p>` : ''}
            <p class="text-sm text-green-600 font-medium">${formatCurrency(job.salary, this.settings.currencySymbol)}${salaryLabel}</p>
            ${assignedInfo}
          </div>
        </div>
        ${actions}
        ${applicationsHtml}
      </div>
    `;
  }
  
  /**
   * Rediger bedriftsjobb
   */
  editBusinessJob(businessId, jobId) {
    const business = businessService.getBusinessById(businessId);
    if (!business || !business.jobs) return;
    
    const job = business.jobs.find(j => j.id === jobId);
    if (!job) return;
    
    // Fyll inn skjemaet med eksisterende data
    document.getElementById('businessJobTitle').value = job.title || '';
    document.getElementById('businessJobDescription').value = job.description || '';
    document.getElementById('businessJobSalary').value = job.salary || '';
    document.getElementById('businessJobType').value = job.type || 'fixed';
    document.getElementById('businessJobOfferType').value = 'open';
    
    // Skjul direkte tilbud-seksjonen
    document.getElementById('businessJobDirectOfferSection')?.classList.add('hidden');
    
    // Sett valutasymbol
    const settings = settingsService.getSettings();
    const currencyLabel = document.getElementById('businessJobCurrencyLabel');
    if (currencyLabel) {
      currencyLabel.textContent = settings?.currency || 'KKr';
    }
    
    // Lagre jobb-ID for oppdatering
    this.editingBusinessJobId = jobId;
    
    // Endre modal-tittel og knappetekst
    const modal = document.getElementById('createBusinessJobModal');
    const title = modal.querySelector('h3');
    if (title) title.textContent = '✏️ ' + languageService.t('teacher.editJob');
    
    const submitBtn = modal.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = languageService.t('btn.saveChanges');
    
    modal.classList.remove('hidden');
  }
  
  /**
   * Avslutt bedriftsjobb
   */
  async endBusinessJob(businessId, jobId) {
    const business = businessService.getBusinessById(businessId);
    if (!business || !business.jobs) return;
    
    const job = business.jobs.find(j => j.id === jobId);
    if (!job) return;
    
    // Fjern ansatt fra jobben
    if (job.assignedTo) {
      const employee = business.employees?.find(e => e.userId === job.assignedTo);
      if (employee) {
        // Fjern fra ansatte
        business.employees = business.employees.filter(e => e.userId !== job.assignedTo);
      }
    }
    
    job.status = 'completed';
    job.assignedTo = null;
    job.completedAt = new Date().toISOString();
    
    businessService.saveBusiness(business);
    await this.loadBusinessJobs(business);
    this.loadBusinessEmployees(business);
    uiManager.showSuccess(languageService.t('msg.jobEnded'));
  }

  /**
   * Legg bedriftsjobb ut på nytt
   */
  async reopenBusinessJob(businessId, jobId) {
    const business = businessService.getBusinessById(businessId);
    if (!business || !business.jobs) return;

    const job = business.jobs.find(j => j.id === jobId);
    if (!job) return;

    job.status = 'open';
    job.assignedTo = null;
    job.completedAt = null;

    businessService.saveBusiness(business);
    await this.loadBusinessJobs(business);
    uiManager.showSuccess(languageService.t('msg.jobRepublished'));
  }
  
  /**
   * Trekk tilbake jobbtilbud
   */
  async cancelBusinessJobOffer(businessId, jobId) {
    const business = businessService.getBusinessById(businessId);
    if (!business || !business.jobs) return;

    const job = business.jobs.find(j => j.id === jobId);
    if (!job) return;

    // Fjern tilbudet fra econsim_jobOffers
    try {
      const offers = await dataService.getJobOffers();
      const offerToDelete = offers.find(o => o.jobId === jobId);
      if (offerToDelete && offerToDelete.id) {
        await dataService.deleteJobOffer(offerToDelete.id);
      }
    } catch (e) {
      console.error('Firebase feilet ved sletting av jobbtilbud:', e);
    }

    // Sett jobben tilbake til åpen
    job.status = 'open';
    businessService.saveBusiness(business);

    await this.loadBusinessJobs(business);
    uiManager.showSuccess(languageService.t('msg.jobOfferWithdrawn'));
  }

  /**
   * Vis full søknad i modal
   */
  async viewBusinessApplication(applicationId) {
    const applications = await dataService.getBusinessJobApplications();
    const app = applications.find(a => a.id === applicationId);
    
    if (!app) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }
    
    // Finn jobben for å vise tittel
    const business = businessService.getBusinessById(app.businessId);
    const job = business?.jobs?.find(j => j.id === app.jobId);
    
    const modalContent = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="viewApplicationModal">
        <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
          <h3 class="text-lg font-semibold mb-4">📨 ${languageService.t('ui.jobApplication')}</h3>
          <div class="mb-4">
            <p class="text-sm text-gray-500">${languageService.t('ui.applicant')}:</p>
            <p class="font-medium">${escapeHtml(app.applicantName)}</p>
          </div>
          <div class="mb-4">
            <p class="text-sm text-gray-500">${languageService.t('jobs.position')}:</p>
            <p class="font-medium">${escapeHtml(job?.title || languageService.t('common.unknownJob'))}</p>
          </div>
          <div class="mb-4">
            <p class="text-sm text-gray-500">${languageService.t('ui.applicationsLabel')}:</p>
            <p class="bg-gray-50 p-3 rounded text-sm">${escapeHtml(app.text || languageService.t('ui.noApplicationText'))}</p>
          </div>
          <div class="mb-4">
            <p class="text-xs text-gray-400">${languageService.t('modal.appliedDate')}: ${formatDate(app.createdAt)}</p>
          </div>
          <div class="flex gap-2 justify-end">
            <button onclick="document.getElementById('viewApplicationModal').remove()" 
              class="px-4 py-2 border rounded hover:bg-gray-50">${languageService.t('btn.close')}</button>
            <button onclick="window.econSim.rejectBusinessJobApplication('${app.id}'); document.getElementById('viewApplicationModal').remove();"
              class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">❌ ${languageService.t('btn.reject')}</button>
            <button onclick="window.econSim.hireApplicant('${app.businessId}', '${app.jobId}', '${app.id}'); document.getElementById('viewApplicationModal').remove();" 
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">✅ ${languageService.t('btn.hire')}</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalContent);
  }

  /**
   * Ansett en søker
   */
  async hireApplicant(businessId, jobId, applicationId) {
    const business = businessService.getBusinessById(businessId);
    if (!business || !business.jobs) {
      uiManager.showError(languageService.t('error.businessNotFound'));
      return;
    }

    const job = business.jobs.find(j => j.id === jobId);
    if (!job) {
      uiManager.showError(languageService.t('error.jobNotFound'));
      return;
    }

    // Sjekk om det finnes ventende tilbud på denne jobben
    const existingOffers = await dataService.getJobOffers();
    const pendingOffer = existingOffers.find(o => o.jobId === jobId && o.status === 'pending');
    if (pendingOffer) {
      uiManager.showError(`${languageService.t('error.offerAlreadySentTo')} ${pendingOffer.employeeName}. ${languageService.t('error.withdrawOfferFirst')}`);
      return;
    }

    // Hent søknaden
    const applications = await dataService.getBusinessJobApplications();
    const appIndex = applications.findIndex(a => a.id === applicationId);

    if (appIndex === -1) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }

    const app = applications[appIndex];

    // Oppdater jobben
    job.status = 'active';
    job.assignedTo = app.applicantId;
    job.assignedAt = new Date().toISOString();

    // Legg til i ansatte-liste hvis ikke allerede der
    if (!business.employees) business.employees = [];
    if (!business.employees.some(e => e.userId === app.applicantId)) {
      business.employees.push({
        userId: app.applicantId,
        title: job.title,
        salary: job.salary,
        hiredAt: new Date().toISOString()
      });
    }

    businessService.saveBusiness(business);

    // Oppdater søknaden til akseptert og avslå andre søknader
    try {
      await dataService.updateBusinessJobApplication(applicationId, {
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });

      // Avslå alle andre søknader på samme jobb og send avslag-meldinger
      for (const a of applications) {
        if (a.jobId === jobId && a.id !== applicationId && a.status === 'pending') {
          await dataService.updateBusinessJobApplication(a.id, {
            status: 'rejected',
            updatedAt: new Date().toISOString()
          });

          // Send avslag-melding
          await this.sendJobNotification(a.applicantId, {
            title: `Søknad avslått: ${job.title}`,
            message: `Beklager, din søknad til stillingen "${job.title}" hos ${business.emoji || '🏢'} ${business.name} ble ikke godkjent. En annen søker ble valgt.`,
            type: 'job_rejected'
          });
        }
      }
    } catch (e) {
      console.error('Firebase feilet ved oppdatering av søknader:', e);
    }

    // Send melding til den ansatte
    await this.sendJobNotification(app.applicantId, {
      title: `🎉 Du er ansatt: ${job.title}`,
      message: `Gratulerer! Din søknad til stillingen "${job.title}" hos ${business.emoji || '🏢'} ${business.name} er godkjent. Du er nå ansatt!`,
      type: 'job_accepted'
    });

    // Generer og send arbeidskontrakt
    await this.generateEmploymentContract(business, job, app.applicantId, app.applicantName);

    await this.loadBusinessJobs(business);
    this.loadBusinessEmployees(business);
    uiManager.showSuccess(`${app.applicantName} ${languageService.t('msg.hiredAs')} ${job.title}!`);
  }

  /**
   * Send jobbnotifikasjon til elev
   */
  async sendJobNotification(userId, notification) {
    try {
      await dataService.createInboxMessage({
        recipientId: userId,
        title: notification.title,
        message: notification.message,
        type: notification.type || 'job_notification'
      });
    } catch (e) {
      console.error('Firebase feilet ved opprettelse av jobbnotifikasjon:', e);
    }
  }

  /**
   * Generer og send arbeidskontrakt (kombinert med gratulasjonsmelding)
   */
  async generateEmploymentContract(business, job, employeeId, employeeName) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('nb-NO');
    const jobTypeLabel = job.type === 'project' ? languageService.t('jobs.projectJob') : languageService.t('jobs.permanentPosition');
    const salaryLabel = job.type === 'project' ? languageService.t('jobs.projectFee') : languageService.t('jobs.weeklySalary');
    const descriptionSection = job.description ? `\n${languageService.t('jobs.jobDescription')}:\n${job.description}\n` : '';
    const businessName = `${business.emoji || '🏢'} ${business.name}`;

    const congratsAndContract = `
${languageService.t('jobs.congratsNewJob')}

${languageService.t('jobs.gotPosition', { position: job.title, company: businessName })}

────────────────────────────────

${languageService.t('jobs.employmentContract')}

${languageService.t('jobs.agreementBetween')}
• ${languageService.t('jobs.employer')}: ${businessName}
• ${languageService.t('jobs.employee')}: ${employeeName}

${languageService.t('jobs.position')}: ${job.title}
${languageService.t('jobs.jobType')}: ${jobTypeLabel}
${salaryLabel}: ${formatCurrency(job.salary, this.settings.currencySymbol)}${job.type === 'project' ? '' : ' ' + languageService.t('jobs.perWeekLabel')}
${descriptionSection}
${languageService.t('jobs.startDate')}: ${dateStr}

${languageService.t('jobs.contractTerms')}
- ${languageService.t('jobs.contractTerm1')}
- ${languageService.t('jobs.contractTerm2')}
- ${languageService.t('jobs.contractTerm3')}

${languageService.t('jobs.signedDigitally')} ${dateStr}
    `.trim();

    // Send til arbeidstaker (kombinert gratulasjon + kontrakt)
    try {
      await dataService.createInboxMessage({
        recipientId: employeeId,
        title: languageService.t('jobs.congratsGotJobTitle', { position: job.title }),
        message: congratsAndContract,
        type: 'employment_contract',
        fromName: businessName,
        fromType: 'business'
      });
    } catch (e) {
      console.error('Firebase feilet ved opprettelse av arbeidskontrakt (inbox):', e);
    }

    // Send til bedriften
    try {
      await dataService.createBusinessMessage({
        businessId: business.id,
        title: languageService.t('jobs.newEmployeeTitle', { name: employeeName }),
        message: `${languageService.t('jobs.acceptedPosition', { name: employeeName, position: job.title })}\n\n` + congratsAndContract,
        type: 'employment_contract',
        senderName: 'System',
        senderType: 'system'
      });
    } catch (e) {
      console.error('Firebase feilet ved opprettelse av arbeidskontrakt (business):', e);
    }
  }

  /**
   * Generer jobbkontrakt for statsjobber (lærer-opprettede jobber)
   */
  async generateStateJobContract(job, employeeId, employeeName) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('nb-NO');
    const salaryLabel = job.type === 'project' ? languageService.t('jobs.perProject') : languageService.t('jobs.perWeek');
    const typeLabel = job.type === 'project' ? languageService.t('modal.project') : languageService.t('modal.fixedJob');

    const contractMessage = `
${languageService.t('jobs.congratsNewJob')}

═══════════════════════════════════════

${languageService.t('jobs.employmentContract')}

${languageService.t('jobs.agreementBetween')}
• ${languageService.t('jobs.employer')}: 🏛️ ${languageService.t('ui.theState')}
• ${languageService.t('jobs.employee')}: ${employeeName}

${languageService.t('jobs.jobDetails')}
• ${languageService.t('jobs.position')}: ${job.title}
• ${languageService.t('modal.jobType')}: ${typeLabel}
• ${languageService.t('modal.salary')}: ${formatCurrency(job.salary, this.settings.currencySymbol)} ${salaryLabel}
${job.description ? `• ${languageService.t('common.description')}: ${job.description}` : ''}

${languageService.t('jobs.terms')}
- ${languageService.t('jobs.contractTerm1')}
- ${languageService.t('jobs.contractTerm2')}
- ${languageService.t('jobs.contractTerm3')}

${languageService.t('jobs.signedDigitally')} ${dateStr}
    `.trim();

    try {
      await dataService.createInboxMessage({
        recipientId: employeeId,
        title: languageService.t('jobs.congratsGotJobTitle', { position: job.title }),
        message: contractMessage,
        type: 'employment_contract',
        fromName: `🏛️ ${languageService.t('ui.theState')}`,
        fromType: 'system'
      });
    } catch (e) {
      console.error('Feil ved opprettelse av statsjobb-kontrakt:', e);
    }
  }

  /**
   * Avslå en bedriftsjobb-søknad.
   * Renamet fra rejectApplication for å unngå kollisjon med
   * den vanlige jobb-versjonen lenger oppe i klassen — JS sin
   * "siste definisjon vinner"-regel skygget over den, så vanlige
   * jobbavslag rutet feil før denne fiksen.
   */
  async rejectBusinessJobApplication(applicationId) {
    const applications = await dataService.getBusinessJobApplications();
    const appIndex = applications.findIndex(a => a.id === applicationId);

    if (appIndex === -1) {
      uiManager.showError(languageService.t('error.applicationNotFound'));
      return;
    }

    const app = applications[appIndex];

    try {
      await dataService.updateBusinessJobApplication(applicationId, {
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Firebase feilet ved avslag av søknad:', e);
    }

    // Send avslag-melding til søker
    const business = businessService.getBusinessById(app.businessId);
    const job = business?.jobs?.find(j => j.id === app.jobId);

    if (business && job) {
      await this.sendJobNotification(app.applicantId, {
        title: `Søknad avslått: ${job.title}`,
        message: `Beklager, din søknad til stillingen "${job.title}" hos ${business.emoji || '🏢'} ${business.name} ble ikke godkjent.`,
        type: 'job_rejected'
      });
    }

    // Refresh business jobs
    if (business) {
      await this.loadBusinessJobs(business);
    }

    uiManager.showSuccess(languageService.t('msg.applicationRejected'));
  }

  /**
   * Last sendte salgstilbud
   */
  loadBusinessOwnershipOffers(business) {
    const container = document.getElementById('sentOwnershipOffers');
    if (!container) return;
    
    const user = authService.getCurrentUser();
    const offers = businessService.getOffersBySeller(user.id).filter(o => o.businessId === business.id);
    
    if (offers.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Ingen sendte tilbud</p>';
      return;
    }
    
    container.innerHTML = offers.map(offer => {
      const statusColors = {
        pending: 'bg-amber-100 text-amber-800',
        accepted: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800'
      };
      const statusText = {
        pending: 'Venter',
        accepted: 'Godtatt',
        rejected: 'Avslått',
        cancelled: 'Kansellert'
      };
      
      return `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
          <div>
            <span>${offer.percentage}% til ${offer.buyerName}</span>
            <span class="text-gray-500 ml-2">${formatCurrency(offer.price, this.settings.currencySymbol)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 rounded text-xs ${statusColors[offer.status]}">${statusText[offer.status]}</span>
            ${offer.status === 'pending' ? `
              <button onclick="window.econSim.cancelOwnershipOffer('${offer.id}')" class="text-red-600 hover:text-red-800 text-xs">Avbryt</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Last bedriftens lån
   */
  async loadBusinessLoans(business) {
    const activeLoansContainer = document.getElementById('businessActiveLoans');
    const applicationsContainer = document.getElementById('businessLoanApplications');
    
    if (!business) return;
    
    if (!(await loanService.isEnabled())) {
      if (activeLoansContainer) {
        activeLoansContainer.innerHTML = '<p class="text-amber-600">⚠️ Lånesystemet er ikke aktivert</p>';
      }
      return;
    }

    // Last aktive lån for bedriften
    const loans = loanService.getLoansByBorrower(business.id);
    
    if (activeLoansContainer) {
      if (loans.length === 0) {
        activeLoansContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('loans.noActiveLoans')}</p>`;
      } else {
        activeLoansContainer.innerHTML = loans.map(loan => {
          const statusClass = loan.status === 'active' ? 'bg-green-100 text-green-800' : 
                             loan.status === 'paid_off' ? 'bg-blue-100 text-blue-800' :
                             'bg-amber-100 text-amber-800';
          const statusText = loan.status === 'active' ? languageService.t('loans.statusActive') : 
                            loan.status === 'paid_off' ? languageService.t('loans.statusPaidOff') : languageService.t('loans.statusOverdue');
          
          return `
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <p class="font-medium">${languageService.t('loans.loan')}: ${formatCurrency(loan.principalAmount, this.settings.currencySymbol)}</p>
                  <p class="text-sm text-gray-600">${languageService.t('loans.remainingLabel')}: <strong>${formatCurrency(loan.remainingBalance, this.settings.currencySymbol)}</strong></p>
                  <p class="text-sm text-gray-600">${languageService.t('loans.weeklyInstallmentLabel')}: ${formatCurrency(loan.monthlyPayment, this.settings.currencySymbol)}</p>
                  <p class="text-xs text-gray-500">${languageService.t('loans.interest')}: ${loan.interestRate}%</p>
                </div>
                <span class="px-2 py-1 rounded text-xs ${statusClass}">${statusText}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Last lånesøknader
    if (applicationsContainer) {
      const applications = await getLoanApplicationsForUserUtil(business.id, dataService);
      if (applications.length === 0) {
        applicationsContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('loans.noApplicationsSent')}</p>`;
      } else {
        applicationsContainer.innerHTML = applications.map(app => {
          const statusClass = app.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                             app.status === 'approved' ? 'bg-green-100 text-green-800' :
                             'bg-red-100 text-red-800';
          const statusText = app.status === 'pending' ? languageService.t('common.pending') :
                            app.status === 'approved' ? languageService.t('common.approved') : languageService.t('common.rejected');
          
          return `
            <div class="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
              <div>
                <p class="font-medium">${formatCurrency(app.amount, this.settings.currencySymbol)}</p>
                <p class="text-xs text-gray-500">${escapeHtml(app.purpose?.substring(0, 50) || languageService.t('common.noDescription'))}...</p>
              </div>
              <span class="px-2 py-1 rounded text-xs ${statusClass}">${statusText}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  /**
   * Send lånesøknad for bedrift
   */
  async submitBusinessLoanApplication(e) {
    e.preventDefault();
    
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) {
      uiManager.showError(languageService.t('error.noBusinessSelected'));
      return;
    }
    
    const user = authService.getCurrentUser();
    const amount = parseInt(document.getElementById('businessLoanAmount').value);
    const purpose = document.getElementById('businessLoanPurpose').value.trim();
    
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }
    
    if (!purpose) {
      uiManager.showError(languageService.t('error.loanPurposeRequired'));
      return;
    }
    
    // Opprett lånesøknad
    const application = {
      applicantId: business.id,
      applicantName: `${business.emoji || '🏢'} ${business.name}`,
      applicantType: 'business',
      amount,
      purpose,
      status: 'pending'
    };

    try {
      await dataService.createLoanApplication(application);
    } catch (e) {
      console.error('Firebase feilet ved opprettelse av lånesøknad:', e);
    }
    
    // Reset form
    document.getElementById('businessLoanApplicationForm').reset();
    
    uiManager.showSuccess(languageService.t('msg.loanApplicationSent'));
    this.loadBusinessLoans(business);
  }

  /**
   * Vis modal for redigering av bedrift
   */
  showEditBusinessModal() {
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) {
      uiManager.showError(languageService.t('error.businessNotFound'));
      return;
    }
    
    // Fyll inn nåværende verdier
    document.getElementById('editBusinessName').value = business.name || '';
    document.getElementById('editBusinessDescription').value = business.description || '';
    
    // Sjekk om logo er base64-bilde eller emoji
    const isBase64Logo = business.logo && business.logo.startsWith('data:');
    document.getElementById('editBusinessEmoji').value = isBase64Logo ? '🏢' : (business.logo || '🏢');
    document.getElementById('editBusinessLogoData').value = isBase64Logo ? business.logo : '';
    
    // Oppdater logo-preview
    const previewEl = document.getElementById('editBusinessLogoPreview');
    if (previewEl) {
      if (isBase64Logo) {
        previewEl.innerHTML = `<img src="${business.logo}" alt="Logo" class="w-full h-full object-cover rounded-lg">`;
      } else {
        previewEl.innerHTML = `<span class="text-4xl">${business.logo || '🏢'}</span>`;
      }
    }
    
    // Vis modal
    document.getElementById('editBusinessModal').classList.remove('hidden');
  }

  /**
   * Håndter logo-opplasting for redigering av bedrift
   */
  handleEditBusinessLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 500 * 1024) {
      uiManager.showError(languageService.t('error.logoTooLarge'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const logoData = event.target.result;
      document.getElementById('editBusinessLogoData').value = logoData;
      const previewEl = document.getElementById('editBusinessLogoPreview');
      if (previewEl) {
        previewEl.innerHTML = `<img src="${logoData}" alt="Logo" class="w-full h-full object-cover rounded-lg">`;
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * Vis bekreftelse for nedlegging av bedrift
   */
  showCloseBusinessConfirm() {
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) return;
    
    document.getElementById('closeBusinessName').textContent = business.name;
    document.getElementById('editBusinessModal').classList.add('hidden');
    document.getElementById('closeBusinessModal').classList.remove('hidden');
  }

  /**
   * Håndter redigering av bedrift
   */
  async handleEditBusiness(e) {
    e.preventDefault();
    
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) {
      uiManager.showError(languageService.t('error.noBusinessSelected'));
      return;
    }
    
    const user = authService.getCurrentUser();
    if (!user) return;
    
    // Sjekk om bruker er eier
    const ownership = business.owners?.find(o => o.userId === user.id);
    if (!ownership) {
      uiManager.showError(languageService.t('error.notOwner'));
      return;
    }
    
    const newName = document.getElementById('editBusinessName').value.trim();
    const newEmoji = document.getElementById('editBusinessEmoji').value.trim() || '🏢';
    const newDescription = document.getElementById('editBusinessDescription').value.trim();
    const newLogoData = document.getElementById('editBusinessLogoData').value;
    
    if (!newName) {
      uiManager.showError(languageService.t('error.businessNeedsName'));
      return;
    }
    
    // Oppdater bedriften
    business.name = newName;
    business.description = newDescription;
    
    // Hvis nytt bilde er lastet opp, bruk det som logo
    if (newLogoData) {
      business.logo = newLogoData;
      business.emoji = '🏢'; // Standard emoji for når bilde brukes
    } else {
      // Bruk emoji som logo (ikke base64)
      business.logo = newEmoji;
      business.emoji = newEmoji;
    }
    
    businessService.saveBusinesses();
    
    // Lukk modal
    document.getElementById('editBusinessModal').classList.add('hidden');
    
    // Oppdater visning
    this.renderStudentDashboard();
    this.selectBusiness(business.id);
    
    uiManager.showSuccess(languageService.t('msg.businessInfoUpdated'));
  }

  /**
   * Bekreft nedlegging av bedrift
   */
  async confirmCloseBusiness() {
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) {
      uiManager.showError(languageService.t('error.businessNotFound'));
      return;
    }
    
    const user = authService.getCurrentUser();
    if (!user) return;
    
    // Sjekk om bruker er eier
    const ownership = business.owners?.find(o => o.userId === user.id);
    if (!ownership) {
      uiManager.showError(languageService.t('error.notOwner'));
      return;
    }
    
    // Lukk modal
    document.getElementById('closeBusinessModal').classList.add('hidden');
    
    const employees = business.employees || [];
    const owners = business.owners || [];
    const balance = business.balance || 0;
    
    // Hent alle brukere (synkront)
    const allUsers = dataService.getUsersSync();
    
    // 1. Betal lønn til alle ansatte
    let totalSalaries = 0;
    for (const emp of employees) {
      const employee = allUsers.find(u => u.id === emp.userId);
      if (employee && emp.salary > 0) {
        const salaryToPay = Math.min(emp.salary, business.balance);
        employee.balance = (employee.balance || 0) + salaryToPay;
        business.balance -= salaryToPay;
        totalSalaries += salaryToPay;
        
        // Legg til transaksjon for ansatt
        transactionService.addTransaction({
          userId: employee.id,
          type: 'salary',
          amount: salaryToPay,
          description: `${languageService.t('transaction.finalSalaryFrom')} ${business.name} (${languageService.t('transaction.closed')})`,
          date: new Date().toISOString()
        });
      }
    }
    
    // 2. Fordel gjenværende som utbytte til eierne
    const remainingBalance = business.balance;
    for (const owner of owners) {
      const ownerUser = allUsers.find(u => u.id === owner.userId);
      if (ownerUser && remainingBalance > 0) {
        const share = owner.percentage / 100;
        const dividend = Math.floor(remainingBalance * share);
        
        if (dividend > 0) {
          ownerUser.balance = (ownerUser.balance || 0) + dividend;
          
          // Legg til transaksjon
          transactionService.addTransaction({
            userId: ownerUser.id,
            type: 'dividend',
            amount: dividend,
            description: `${languageService.t('transaction.dividendFromClosure')} ${business.name}`,
            date: new Date().toISOString()
          });
        }
      }
    }
    
    // 3. Fjern alle ansattes jobber
    for (const emp of employees) {
      const employee = allUsers.find(u => u.id === emp.userId);
      if (employee) {
        employee.jobs = (employee.jobs || []).filter(j => j.businessId !== business.id);
      }
    }
    
    // 4. Lagre brukere
    dataService._saveToStorage('econsim_users', allUsers);
    
    // 5. Slett bedriften
    const businesses = businessService.getBusinesses();
    const index = businesses.findIndex(b => b.id === business.id);
    if (index !== -1) {
      businesses.splice(index, 1);
      businessService.saveBusinesses();
    }
    
    // Gå tilbake til dashboard
    uiManager.showSuccess(`${business.name} ${languageService.t('msg.businessClosed')}`);
    this.selectedBusinessId = null;
    this.renderStudentDashboard();
    document.getElementById('businessDetailScreen').classList.add('hidden');
    document.getElementById('studentMainView').classList.remove('hidden');
  }

  /**
   * Håndter kjøp/betaling fra bedrift
   */
  async handleBusinessPurchase(e) {
    e.preventDefault();
    
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) {
      uiManager.showError(languageService.t('error.noBusinessSelected'));
      return;
    }
    
    const accountNumber = document.getElementById('businessPurchaseAccountNumber').value.trim();
    const amount = parseInt(document.getElementById('businessPurchaseAmount').value);
    const description = document.getElementById('businessPurchaseDescription').value.trim() || 'Betaling fra bedrift';
    
    if (!accountNumber) {
      uiManager.showError(languageService.t('error.enterRecipientAccount'));
      return;
    }
    
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }
    
    if (amount > business.balance) {
      uiManager.showError(languageService.t('error.businessInsufficientFunds'));
      return;
    }
    
    try {
      // Finn mottaker
      const recipient = await dataService.getUserByAccountNumber(accountNumber);
      if (!recipient) {
        uiManager.showError(languageService.t('error.recipientNotFound'));
        return;
      }
      
      // Trekk fra bedriftens konto
      business.balance -= amount;
      business.transactions.push({
        id: Date.now().toString(),
        type: 'expense',
        amount,
        toUserId: recipient.id,
        description: `${description} ${languageService.t('transaction.to')} ${recipient.name}`,
        date: new Date().toISOString()
      });
      businessService.saveBusinesses();
      
      // Legg til på mottakers konto
      await dataService.updateUserBalance(recipient.id, amount);
      await dataService.addTransaction(recipient.id, {
        type: 'income',
        amount,
        description: `${description} ${languageService.t('transaction.from')} ${business.name}`,
        category: 'business_payment'
      });
      
      // Oppdater UI
      document.getElementById('selectedBusinessBalance').textContent = formatCurrency(business.balance, this.settings.currencySymbol);
      document.getElementById('businessPurchaseForm').reset();
      
      // Oppdater transaksjoner
      this.loadBusinessTransactions(business);
      
      uiManager.showSuccess(`${formatCurrency(amount, this.settings.currencySymbol)} ${languageService.t('msg.transferredTo')} ${recipient.name}!`);
    } catch (error) {
      console.error('Feil ved bedriftsbetaling:', error);
      uiManager.showError(error.message);
    }
  }

  // Tidligere fantes en eldre, synkron showSellOwnershipModal her som
  // ble skygget av den asynkrone versjonen lenger nede. Beholdt
  // funksjonalitet (currency-formatering og loadModalOwnershipOffers)
  // er flyttet inn i den aktive versjonen.

  /**
   * Last sendte eierandel-tilbud i modal
   */
  loadModalOwnershipOffers(business) {
    const container = document.getElementById('modalSentOwnershipOffers');
    if (!container) return;
    
    const user = authService.getCurrentUser();
    const offers = businessService.getOffersBySeller(user.id).filter(o => o.businessId === business.id);
    
    if (offers.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Ingen sendte tilbud</p>';
      return;
    }
    
    container.innerHTML = offers.map(offer => {
      const statusColors = {
        pending: 'bg-amber-100 text-amber-800',
        accepted: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800'
      };
      const statusText = {
        pending: 'Venter',
        accepted: 'Godtatt',
        rejected: 'Avslått',
        cancelled: 'Kansellert'
      };
      
      return `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
          <div>
            <span>${offer.percentage}% til ${offer.buyerName}</span>
            <span class="text-gray-500 ml-2">${formatCurrency(offer.price, this.settings.currencySymbol)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 rounded text-xs ${statusColors[offer.status]}">${statusText[offer.status]}</span>
            ${offer.status === 'pending' ? `
              <button onclick="window.econSim.cancelOwnershipOffer('${offer.id}')" class="text-red-600 hover:text-red-800 text-xs">Avbryt</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Last bedriftens meldinger med nye kategorier
   */
  async loadBusinessMessages(business) {
    const recipientSelect = document.getElementById('businessMessageRecipient');

    if (!business) return;

    // Last meldinger fra Firebase
    const messages = await dataService.getBusinessMessages(business.id);
    const outbox = await dataService.getBusinessOutbox(business.id);

    // Oppdater badge
    await this.updateBusinessMessagesBadge(business.id);

    // Kategoriser meldinger i 5 kategorier:
    // System: kontrakter, rapporter, varsler (automatiske systemgenererte meldinger)
    const systemTypes = ['system', 'tax_statement', 'contract', 'system_alert', 'salary', 'fine',
      'ownership_contract', 'loan_approved', 'loan_rejected', 'loan_paid_off', 'loan_contract',
      'employment_contract', 'weekly_report', 'interest', 'tax', 'loan', 'loan_application',
      'loan_payment', 'salary_paid', 'business_creation'];

    const systemMessages = messages.filter(m =>
      systemTypes.includes(m.type) || m.fromType === 'system' || m.senderType === 'system'
    );

    // Lærer: meldinger fra lærer
    const teacherMessages = messages.filter(m =>
      (m.fromType === 'teacher' || m.senderType === 'teacher') && !systemTypes.includes(m.type)
    );

    // Elever: meldinger fra elever
    const studentMessages = messages.filter(m =>
      (m.fromType === 'student' || m.senderType === 'student') && !systemTypes.includes(m.type)
    );

    // Bedrifter: meldinger fra andre bedrifter
    const businessMessages = messages.filter(m =>
      (m.fromType === 'business' || m.senderType === 'business') && !systemTypes.includes(m.type)
    );

    // Oppdater kategori-badges
    this.updateBizCategoryBadge('System', systemMessages);
    this.updateBizCategoryBadge('Teacher', teacherMessages);
    this.updateBizCategoryBadge('Students', studentMessages);
    this.updateBizCategoryBadge('Businesses', businessMessages);

    // Render kategoriene
    this.renderBizInboxCategory('System', systemMessages, 'systemmeldinger');
    this.renderBizInboxCategory('Teacher', teacherMessages, 'meldinger fra lærer');
    this.renderBizInboxCategory('Students', studentMessages, 'meldinger fra elever');
    this.renderBizInboxCategory('Businesses', businessMessages, 'meldinger fra andre bedrifter');

    // Render utboks
    this.renderBizOutboxCategory('Outbox', outbox, 'sendte meldinger');
    
    // Fyll inn mottakere (elever i klasserommet + læreren + andre bedrifter)
    if (recipientSelect) {
      const user = authService.getCurrentUser();
      const classroomId = user.classroomId || dataService.getCurrentClassroomIdSync();
      const classroom = classroomService.getClassroomById(classroomId);
      
      // Hent elever fra klasserommet
      const students = classroomService.getStudentsByClassroom(classroomId) || [];
      
      // Hent læreren
      const teacherId = classroom?.teacherId;
      const teacher = teacherId ? dataService.getUserById(teacherId) : null;

      // Hent andre bedrifter via businessService
      const allBusinesses = businessService.getBusinessesByClassroom(classroomId);
      const otherBusinesses = allBusinesses.filter(b => b.id !== business.id && b.isActive !== false);
      
      let options = `<option value="">${languageService.t('inbox.selectRecipient')}</option>`;
      
      // Legg til læreren først
      if (teacher) {
        options += `<optgroup label="📚 ${languageService.t('role.teacher')}">`;
        options += `<option value="teacher_${teacher.id}">👨‍🏫 ${escapeHtml(teacher.name)} (${languageService.t('role.teacher')})</option>`;
        options += `</optgroup>`;
      }
      
      // Legg til ansatte som egen gruppe
      const employees = business.employees || [];
      if (employees.length > 0) {
        options += `<optgroup label="👥 ${languageService.t('business.employees')}">`;
        employees.forEach(emp => {
          // Sjekk både emp.userId og emp.studentId for bakoverkompatibilitet
          const empUserId = emp.userId || emp.studentId;
          const empUser = dataService.getUserById(empUserId);
          if (empUser) {
            options += `<option value="employee_${empUser.id}">👷 ${escapeHtml(empUser.name)}</option>`;
          }
        });
        options += `</optgroup>`;
      }
      
      // Legg til andre elever (ekskluder seg selv og ansatte)
      const employeeIds = employees.map(e => e.userId || e.studentId);
      const otherStudents = students.filter(s => s.id !== user.id && !employeeIds.includes(s.id));
      if (otherStudents.length > 0) {
        options += `<optgroup label="👤 ${languageService.t('inbox.otherStudents')}">`;
        otherStudents.forEach(student => {
          options += `<option value="student_${student.id}">👤 ${escapeHtml(student.name)}</option>`;
        });
        options += `</optgroup>`;
      }

      // Legg til andre bedrifter
      if (otherBusinesses.length > 0) {
        options += `<optgroup label="🏢 ${languageService.t('inbox.otherBusinesses')}">`;
        otherBusinesses.forEach(biz => {
          options += `<option value="business_${biz.id}">${biz.emoji || '🏢'} ${escapeHtml(biz.name)}</option>`;
        });
        options += `</optgroup>`;
      }
      
      recipientSelect.innerHTML = options;
    }
  }

  /**
   * Oppdater badge for en bedriftskategori
   */
  updateBizCategoryBadge(category, messages) {
    const unreadCount = messages.filter(m => !m.read).length;
    const badge = document.getElementById(`bizInboxBadge${category}`);
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  /**
   * Render meldinger i en bedriftskategori
   */
  renderBizInboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`bizInboxCategory${category}`);
    if (!container) return;

    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) return;

    if (messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('inbox.noMessagesPrefix')} ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    const sortedMessages = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = sortedMessages.map(msg => {
      const isSystem = category === 'System';
      const bgClass = msg.read ? 'bg-gray-50 border-gray-200' : (isSystem ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200');
      const textClass = msg.read ? 'text-gray-700' : (isSystem ? 'text-green-800' : 'text-blue-800');
      
      return `
        <div class="p-3 rounded-lg border ${bgClass} cursor-pointer hover:shadow-md transition-shadow" onclick="window.econSim.openBusinessMessage('${business.id}', '${msg.id}')">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm ${textClass}">${escapeHtml(msg.title || msg.senderName || languageService.t('common.unknown'))}</span>
              ${msg.senderName ? `<span class="text-xs text-gray-500 block">${languageService.t('common.from')}: ${escapeHtml(msg.senderName)}</span>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
              <button onclick="event.stopPropagation(); window.econSim.deleteBusinessMessage('${business.id}', '${msg.id}')" class="text-red-400 hover:text-red-600" title="${languageService.t('common.delete')}">🗑️</button>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message)}</p>
          ${!msg.read ? `<span class="inline-block mt-1 text-xs text-blue-600">● ${languageService.t('inbox.unread')}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Vis en bedriftsinnboks-kategori
   */
  showBusinessInboxCategory(category) {
    const categories = ['System', 'Teacher', 'Students', 'Businesses', 'Outbox'];
    const categoryMap = {
      'system': 'System',
      'teacher': 'Teacher',
      'students': 'Students',
      'businesses': 'Businesses',
      'outbox': 'Outbox'
    };
    const cat = categoryMap[category] || category;

    categories.forEach(c => {
      const container = document.getElementById(`bizInboxCategory${c}`);
      const tab = document.getElementById(`bizInboxTab${c}`);
      if (container && tab) {
        if (c === cat) {
          container.classList.remove('hidden');
          tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.remove('text-gray-500');
        } else {
          container.classList.add('hidden');
          tab.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.add('text-gray-500');
        }
      }
    });
  }

  /**
   * Render utboks for bedrift (sendte meldinger) med lest-status
   */
  renderBizOutboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`bizInboxCategory${category}`);
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">Ingen ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const readStatus = msg.recipientRead
        ? `<span class="text-green-500" title="Lest ${msg.recipientReadAt ? new Date(msg.recipientReadAt).toLocaleDateString('nb-NO') : ''}">✓ Lest</span>`
        : `<span class="text-gray-400" title="Ikke lest ennå">◯ Ulest</span>`;

      return `
        <div class="p-3 rounded-lg border bg-gray-50 border-gray-200">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm text-gray-700">${escapeHtml(msg.title)}</span>
              <span class="text-xs text-gray-500 block">Til: ${escapeHtml(msg.recipientName || 'Ukjent')}</span>
            </div>
            <div class="flex items-center gap-2">
              ${readStatus}
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message?.substring(0, 100) || '')}${msg.message?.length > 100 ? '...' : ''}</p>
        </div>
      `;
    }).join('');
  }

  /**
   * Slett en bedriftsmelding
   */
  async deleteBusinessMessage(businessId, messageId) {
    if (!confirm(languageService.t('confirm.deleteMessage'))) return;

    try {
      await dataService.deleteMessage(messageId, 'messages');
      // Slett også utboks-kopien hvis den finnes
      await dataService.deleteOutboxForMessage(messageId);
      uiManager.showSuccess(languageService.t('msg.messageDeleted'));
    } catch (e) {
      console.error('Firebase feilet ved sletting av bedriftsmelding:', e);
      uiManager.showError('Kunne ikke slette meldingen. Prøv igjen.');
    }

    const business = businessService.getBusinessById(businessId);
    if (business) {
      this.loadBusinessMessages(business);
    }
  }

  /**
   * Send melding fra bedrift
   */
  async sendBusinessMessage(e) {
    e.preventDefault();
    
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) {
      uiManager.showError(languageService.t('error.businessNotFound'));
      return;
    }
    
    const recipientValue = document.getElementById('businessMessageRecipient').value;
    const subjectText = document.getElementById('businessMessageSubject')?.value?.trim() || 'Melding fra bedrift';
    const messageText = document.getElementById('businessMessageText').value.trim();
    
    if (!recipientValue) {
      uiManager.showError(languageService.t('error.selectRecipient'));
      return;
    }
    
    if (!messageText) {
      uiManager.showError(languageService.t('error.writeMessage'));
      return;
    }
    
    // Parse mottaker (format: "type_id" - ID kan inneholde underscores)
    const separatorIndex = recipientValue.indexOf('_');
    const recipientType = recipientValue.substring(0, separatorIndex);
    const recipientId = recipientValue.substring(separatorIndex + 1);

    console.log('📧 Mottaker:', { recipientType, recipientId, originalValue: recipientValue });

    // Håndter bedrift-til-bedrift meldinger
    if (recipientType === 'business') {
      try {
        await dataService.createBusinessMessage({
          businessId: recipientId,
          senderId: business.id,
          senderName: `${business.emoji || '🏢'} ${business.name}`,
          senderType: 'business',
          title: subjectText,
          message: messageText,
          type: 'business_message'
        });
      } catch (e) {
        console.error('Firebase feilet ved sending av business-melding:', e);
      }
      document.getElementById('businessMessageForm').reset();

      const targetBiz = businessService.getBusinessById(recipientId);
      uiManager.showSuccess(`${languageService.t('msg.messageSentTo')} ${targetBiz?.name || languageService.t('common.business')}`);
      return;
    }

    // Håndter melding til lærer
    if (recipientType === 'teacher') {
      try {
        await dataService.createTeacherMessage({
          senderId: business.id,
          senderName: `${business.emoji || '🏢'} ${business.name}`,
          senderType: 'business',
          fromType: 'business',
          title: subjectText,
          message: messageText,
          type: 'business_message'
        });
      } catch (e) {
        console.error('Firebase feilet ved sending av lærermelding:', e);
      }
      document.getElementById('businessMessageForm').reset();
      uiManager.showSuccess(languageService.t('msg.messageSentToTeacher'));
      return;
    }

    const recipient = dataService.getUserById(recipientId);

    if (!recipient) {
      uiManager.showError(languageService.t('error.studentNotFound'));
      return;
    }

    // Opprett melding til elev/ansatt
    try {
      await dataService.createInboxMessage({
        recipientId: recipientId,
        title: subjectText,
        message: messageText,
        fromName: `${business.emoji || '🏢'} ${business.name}`,
        fromId: business.id,
        fromType: 'business',
        type: recipientType === 'employee' ? 'employer_message' : 'business_message'
      });
    } catch (e) {
      console.error('Firebase feilet ved sending av melding til elev:', e);
    }

    // Reset skjema
    document.getElementById('businessMessageForm').reset();

    uiManager.showSuccess(`${languageService.t('msg.messageSentTo')} ${recipient.name}`);
  }

  /**
   * Marker bedriftsmelding som lest
   */
  async markBusinessMessageAsRead(businessId, messageId) {
    try {
      await dataService.markMessageAsRead(messageId, 'messages');

      const business = businessService.getBusinessById(businessId);
      if (business) {
        await this.loadBusinessMessages(business);
      }
    } catch (e) {
      console.error('Firebase feilet ved markering av melding som lest:', e);
    }
  }

  /**
   * Åpne bedriftsmelding i modal for visning og utskrift
   */
  async openBusinessMessage(businessId, messageId) {
    const messages = await dataService.getBusinessMessages(businessId);
    const message = messages.find(m => m.id === messageId);

    if (!message) {
      uiManager.showError(languageService.t('error.messageNotFound'));
      return;
    }

    // Marker som lest
    if (!message.read) {
      try {
        await dataService.markMessageAsRead(messageId, 'messages');
        const business = businessService.getBusinessById(businessId);
        if (business) {
          await this.loadBusinessMessages(business);
        }
      } catch (e) {
        console.error('Firebase feilet ved markering av melding som lest:', e);
      }
    }

    // Vis modal
    const modal = document.getElementById('messageViewModal');
    const titleEl = document.getElementById('messageViewTitle');
    const fromEl = document.getElementById('messageViewFrom');
    const dateEl = document.getElementById('messageViewDate');
    const contentEl = document.getElementById('messageViewContent');
    
    if (modal && titleEl && contentEl) {
      titleEl.textContent = message.title || languageService.t('inbox.message');
      if (fromEl) fromEl.textContent = message.senderName ? `${languageService.t('common.from')}: ${message.senderName}` : '';
      if (dateEl) dateEl.textContent = `${languageService.t('common.date')}: ${formatDate(new Date(message.createdAt))}`;
      contentEl.innerHTML = escapeHtml(message.message).replace(/\n/g, '<br>');
      
      // Lagre melding-info for svar (støtter både fromId/senderId varianter)
      this.currentMessageId = messageId;
      const msgSenderId = message.senderId || message.fromId;
      const msgSenderType = message.senderType || message.fromType;
      const msgSenderName = message.senderName || message.fromName;

      this.currentReplyContext = {
        type: 'business',
        businessId: businessId,
        originalMessage: message,
        senderId: msgSenderId,
        senderType: msgSenderType,
        senderName: msgSenderName
      };

      // Vis/skjul svar-knapp basert på meldingstype
      const noReplyTypes = ['system', 'system_alert', 'contract', 'loan_contract', 'loan_application',
        'loan_approved', 'loan_rejected', 'loan_payment', 'tax', 'fine', 'salary_paid',
        'ownership_contract', 'business_creation'];
      const replyBtn = document.getElementById('messageReplyBtn');
      if (replyBtn) {
        if (msgSenderId && msgSenderType && !noReplyTypes.includes(message.type)) {
          replyBtn.classList.remove('hidden');
        } else {
          replyBtn.classList.add('hidden');
        }
      }
      
      modal.classList.remove('hidden');
    }
  }

  /**
   * Marker alle bedriftsmeldinger som lest
   */
  async markAllBusinessMessagesAsRead() {
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) return;

    const messages = await dataService.getBusinessMessages(business.id);

    try {
      for (const m of messages) {
        if (!m.read) {
          await dataService.markMessageAsRead(m.id, 'messages');
        }
      }
    } catch (e) {
      console.error('Firebase feilet ved markering av alle meldinger som lest:', e);
    }

    await this.loadBusinessMessages(business);
    uiManager.showSuccess(languageService.t('msg.allMessagesRead'));
  }

  /**
   * Oppdater badge for bedriftsmeldinger
   */
  async updateBusinessMessagesBadge(businessId) {
    const badge = document.getElementById('businessMessagesBadge');
    if (!badge) return;

    const messages = await dataService.getBusinessMessages(businessId);
    const unreadCount = messages.filter(m => !m.read).length;
    
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /**
   * Vis opprett bedrift modal
   */
  async showCreateBusinessModal() {
    const modal = document.getElementById('createBusinessModal');
    const settings = await businessService.getSettings();
    document.getElementById('startupCostDisplay').textContent = 
      formatCurrency(settings.startupCost, this.settings.currencySymbol);
    
    // Reset logo preview
    const preview = document.getElementById('businessLogoPreview');
    if (preview) {
      preview.innerHTML = '🏢';
    }
    document.getElementById('businessLogoData').value = '';
    
    // Setup logo input handler
    const logoInput = document.getElementById('businessLogoInput');
    if (logoInput && !logoInput.hasAttribute('data-handler-attached')) {
      logoInput.setAttribute('data-handler-attached', 'true');
      logoInput.addEventListener('change', (e) => this.handleBusinessLogoUpload(e));
    }
    
    modal.classList.remove('hidden');
  }

  /**
   * Håndter opplasting av bedriftslogo
   */
  handleBusinessLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Sjekk filstørrelse (max 500KB)
    if (file.size > 500 * 1024) {
      uiManager.showError(languageService.t('error.imageTooLarge'));
      return;
    }
    
    // Sjekk filtype
    if (!file.type.startsWith('image/')) {
      uiManager.showError(languageService.t('error.onlyImagesAllowed'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      
      // Oppdater forhåndsvisning
      const preview = document.getElementById('businessLogoPreview');
      preview.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-lg" alt="Logo">`;
      
      // Lagre data-URL
      document.getElementById('businessLogoData').value = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Opprett bedrift
   */
  async createBusiness(e) {
    e.preventDefault();
    const user = authService.getCurrentUser();
    
    const name = document.getElementById('businessName').value.trim();
    const logoData = document.getElementById('businessLogoData').value || '';
    const description = document.getElementById('businessDescription').value.trim();
    
    if (!name) {
      uiManager.showError(languageService.t('error.businessNameRequired'));
      return;
    }
    
    try {
      const business = await businessService.createBusiness(name, user.id, logoData, description);
      uiManager.showSuccess(languageService.t('msg.businessCreated') + ' ' + (business.status === 'pending' ? languageService.t('business.pendingApproval') : ''));
      document.getElementById('createBusinessModal').classList.add('hidden');
      document.getElementById('createBusinessForm').reset();
      document.getElementById('businessLogoPreview').innerHTML = '🏢';
      document.getElementById('businessLogoData').value = '';
      await this.loadStudentBusinesses();
      this.updateBalanceDisplay();
      await this.loadStudentTransactions(); // Oppdater transaksjonshistorikk
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis ansett direkte modal
   */
  showHireEmployeeModal() {
    document.getElementById('hireEmployeeModal').classList.remove('hidden');
  }

  /**
   * Ansett en elev direkte (sender jobbtilbud)
   */
  async hireEmployee(e) {
    e.preventDefault();
    
    const accountNumber = document.getElementById('hireEmployeeAccount').value.trim();
    const title = document.getElementById('hireEmployeeTitle').value.trim();
    const salary = parseInt(document.getElementById('hireEmployeeSalary').value);
    const businessId = this.selectedBusinessId;
    
    if (!accountNumber || !title || !salary || !businessId) {
      uiManager.showError(languageService.t('error.fillAllFields'));
      return;
    }
    
    try {
      const user = authService.getCurrentUser();
      const classroomId = user.classroomId;
      
      // Finn eleven
      const employee = dataService.getUserByAccountNumber(accountNumber, classroomId);
      if (!employee) {
        uiManager.showError(languageService.t('error.studentNotFoundByAccount'));
        return;
      }
      
      if (employee.id === user.id) {
        uiManager.showError(languageService.t('error.cannotHireSelf'));
        return;
      }
      
      const business = businessService.getBusinessById(businessId);
      if (!business) {
        uiManager.showError(languageService.t('error.businessNotFound'));
        return;
      }
      
      // Opprett jobbtilbud
      const offer = {
        businessId: businessId,
        businessName: business.name,
        employerId: user.id,
        targetUserId: employee.id,
        employeeName: employee.name,
        title: title,
        salary: salary,
        status: 'pending'
      };

      try {
        await dataService.createJobOffer(offer);
      } catch (e) {
        console.error('Firebase feilet ved opprettelse av jobbtilbud:', e);
      }

      uiManager.showSuccess(`${languageService.t('msg.jobOfferSentTo')} ${employee.name}`);
      document.getElementById('hireEmployeeModal').classList.add('hidden');
      document.getElementById('hireEmployeeForm').reset();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis opprett bedriftsjobb modal
   */
  showCreateBusinessJobModal() {
    console.log('showCreateBusinessJobModal called, selectedBusinessId:', this.selectedBusinessId);
    
    if (!this.selectedBusinessId) {
      uiManager.showError(languageService.t('error.noBusinessSelected'));
      return;
    }
    
    // Sett valutasymbol
    const currencyLabel = document.getElementById('businessJobCurrencyLabel');
    if (currencyLabel) {
      currencyLabel.textContent = this.settings?.currencySymbol || 'KKr';
    }
    
    // Reset redigeringsmodus
    this.editingBusinessJobId = null;
    
    // Reset modal-tittel og knappetekst
    const modal = document.getElementById('createBusinessJobModal');
    console.log('Modal element:', modal);
    
    if (!modal) {
      console.error('createBusinessJobModal not found!');
      uiManager.showError(languageService.t('error.couldNotOpenForm'));
      return;
    }
    
    const title = modal.querySelector('h3');
    if (title) title.textContent = '💼 ' + languageService.t('ui.newJobListing');
    const submitBtn = modal.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = languageService.t('ui.publish');
    
    // Reset skjemaet
    const form = document.getElementById('createBusinessJobForm');
    if (form) form.reset();
    
    // Reset jobbtype til default
    const jobTypeSelect = document.getElementById('businessJobType');
    if (jobTypeSelect) {
      jobTypeSelect.value = 'fixed';
    }
    
    // Reset utlysningstype
    const offerTypeSelect = document.getElementById('businessJobOfferType');
    if (offerTypeSelect) {
      offerTypeSelect.value = 'open';
    }
    
    // Skjul direkte tilbud-seksjonen
    const directSection = document.getElementById('businessJobDirectOfferSection');
    if (directSection) {
      directSection.classList.add('hidden');
    }
    
    // Last elevliste for direkte tilbud
    this.loadBusinessJobStudentOptions();
    
    modal.classList.remove('hidden');
    console.log('Modal should now be visible');
  }
  
  /**
   * Toggle direkte tilbud-seksjonen
   */
  toggleBusinessJobDirectOffer() {
    const offerType = document.getElementById('businessJobOfferType')?.value;
    const directSection = document.getElementById('businessJobDirectOfferSection');
    
    if (directSection) {
      if (offerType === 'direct') {
        directSection.classList.remove('hidden');
      } else {
        directSection.classList.add('hidden');
      }
    }
  }
  
  /**
   * Last elevliste for direkte jobbtilbud (inkludert seg selv)
   */
  loadBusinessJobStudentOptions() {
    const select = document.getElementById('businessJobTargetStudent');
    if (!select) return;
    
    const user = authService.getCurrentUser();
    const classroomId = user.classroomId;
    
    // Hent alle elever i klassen (inkludert seg selv - kan ansette seg selv)
    const allStudents = classroomService.getStudentsByClassroom(classroomId);
    
    select.innerHTML = `<option value="">${languageService.t('ui.selectStudentDash')}</option>`;
    allStudents.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      // Marker seg selv i listen
      const selfLabel = student.id === user.id ? ' ' + languageService.t('ui.self') : '';
      option.textContent = `${student.name} (${student.accountNumber})${selfLabel}`;
      select.appendChild(option);
    });
    
    console.log(`Loaded ${allStudents.length} students for business job offers (inkl. seg selv)`);
  }

  /**
   * Opprett en jobbutlysning for bedriften
   */
  async createBusinessJob(e) {
    e.preventDefault();
    
    const title = document.getElementById('businessJobTitle').value.trim();
    const description = document.getElementById('businessJobDescription').value.trim();
    const salary = parseInt(document.getElementById('businessJobSalary').value);
    const jobType = document.getElementById('businessJobType')?.value || 'fixed';
    const offerType = document.getElementById('businessJobOfferType')?.value || 'open';
    const targetStudentId = document.getElementById('businessJobTargetStudent')?.value;
    const businessId = this.selectedBusinessId;
    
    if (!title || !salary || !businessId) {
      uiManager.showError(languageService.t('error.fillRequiredFields'));
      return;
    }
    
    // Valider direkte tilbud
    if (offerType === 'direct' && !targetStudentId) {
      uiManager.showError(languageService.t('error.mustSelectStudentForOffer'));
      return;
    }
    
    try {
      const user = authService.getCurrentUser();
      const classroomId = user.classroomId;
      const business = businessService.getBusinessById(businessId);
      
      if (!business) {
        uiManager.showError(languageService.t('error.businessNotFound'));
        return;
      }
      
      // Legg til jobb i bedriftens jobliste
      if (!business.jobs) business.jobs = [];
      
      // Sjekk om vi redigerer en eksisterende jobb
      if (this.editingBusinessJobId) {
        const existingJob = business.jobs.find(j => j.id === this.editingBusinessJobId);
        if (existingJob) {
          existingJob.title = title;
          existingJob.description = description;
          existingJob.salary = salary;
          existingJob.type = jobType;
          
          businessService.saveBusiness(business);
          uiManager.showSuccess(languageService.t('msg.jobUpdated'));
          
          document.getElementById('createBusinessJobModal').classList.add('hidden');
          document.getElementById('createBusinessJobForm').reset();
          this.editingBusinessJobId = null;
          await this.loadBusinessJobs(business);
          return;
        }
      }
      
      const job = {
        id: 'bj_' + Date.now(),
        title: title,
        description: description,
        salary: salary,
        type: jobType, // 'fixed' eller 'project'
        offerType: offerType, // 'open' eller 'direct'
        businessId: businessId,
        businessName: business.name,
        businessLogo: business.logo,
        businessEmoji: business.emoji,
        classroomId: classroomId,
        createdAt: new Date().toISOString(),
        status: offerType === 'direct' ? 'offered' : 'open'
      };
      
      business.jobs.push(job);
      businessService.saveBusiness(business);
      
      // Hvis direkte tilbud, opprett jobbtilbud til eleven
      if (offerType === 'direct' && targetStudentId) {
        const targetStudent = dataService.getUserById(targetStudentId);

        const jobOffer = {
          jobId: job.id,
          businessId: businessId,
          businessName: business.name,
          businessLogo: business.logo,
          businessEmoji: business.emoji,
          jobTitle: title,
          jobType: jobType,
          salary: salary,
          targetUserId: targetStudentId,
          employeeName: targetStudent?.name || languageService.t('common.unknown'),
          status: 'pending',
          isBusinessJob: true
        };

        try {
          await dataService.createJobOffer(jobOffer);
        } catch (e) {
          console.error('Firebase feilet ved opprettelse av jobbtilbud:', e);
        }

        uiManager.showSuccess(languageService.t('msg.offerSent'));
      } else {
        uiManager.showSuccess(languageService.t('msg.jobListingCreated'));
      }
      
      document.getElementById('createBusinessJobModal').classList.add('hidden');
      document.getElementById('createBusinessJobForm').reset();
      this.editingBusinessJobId = null;
      await this.loadBusinessJobs(business);
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Vis selg eierandel modal.
   * Slått sammen fra to tidligere versjoner — én var skygget av den
   * andre, slik at currency-formatering og lasting av sendte tilbud
   * aldri kjørte. Begge er nå med her.
   */
  async showSellOwnershipModal() {
    const user = authService.getCurrentUser();
    const business = businessService.getBusinessById(this.selectedBusinessId);

    if (!business) {
      uiManager.showError(languageService.t('error.noBusinessSelected'));
      return;
    }

    const myOwnership = business.owners.find(o => o.userId === user.id);
    if (!myOwnership) {
      uiManager.showError(languageService.t('error.notOwner'));
      return;
    }

    document.getElementById('sellBusinessId').value = business.id;
    document.getElementById('modalMyOwnershipPercentage').textContent = `${myOwnership.percentage || 0}%`;
    document.getElementById('modalSellPercentage').max = myOwnership.percentage || 0;
    document.getElementById('modalMyOwnershipCostBasis').textContent = formatCurrency(
      myOwnership.costBasis || 0,
      this.settings.currencySymbol
    );

    // Nullstill skjemaet
    document.getElementById('modalBuyerAccountNumber').value = '';
    document.getElementById('modalSellPercentage').value = '';
    document.getElementById('modalSellPrice').value = '';

    // Last sendte tilbud (var glemt før — bare den synkrone versjonen
    // gjorde dette, og den var skygget).
    this.loadModalOwnershipOffers(business);

    document.getElementById('sellOwnershipModal').classList.remove('hidden');
  }

  /**
   * Send salgstilbud for eierandel (fra modal - velger kjøper fra dropdown)
   */
  async sendOwnershipOffer(e) {
    e.preventDefault();
    
    const businessId = document.getElementById('sellBusinessId').value;
    const buyerAccount = document.getElementById('modalBuyerAccountNumber').value.trim();
    const percentage = parseInt(document.getElementById('modalSellPercentage').value);
    const price = parseInt(document.getElementById('modalSellPrice').value);
    
    if (!businessId || !buyerAccount || !percentage || !price) {
      uiManager.showError(languageService.t('error.fillAllFields'));
      return;
    }
    
    try {
      const user = authService.getCurrentUser();
      const business = businessService.getBusinessById(businessId);
      
      if (!business) {
        uiManager.showError(languageService.t('error.invalidBusiness'));
        return;
      }
      
      // Sjekk at selger eier nok
      const myOwnership = business.owners.find(o => o.userId === user.id);
      if (!myOwnership || myOwnership.percentage < percentage) {
        uiManager.showError(languageService.t('error.notEnoughSharesOwned'));
        return;
      }
      
      await businessService.createOwnershipOffer(businessId, user.id, buyerAccount, percentage, price);
      uiManager.showSuccess(languageService.t('msg.offerSent'));
      document.getElementById('sellOwnershipModal').classList.add('hidden');
      document.getElementById('sellOwnershipModalForm').reset();
      this.loadStudentBusinesses();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Send salgstilbud for eierandel (fra tab - bruker kontonummer)
   */
  async submitOwnershipOffer(e) {
    e.preventDefault();
    
    const businessId = this.selectedBusinessId;
    const buyerAccount = document.getElementById('buyerAccountNumber').value.trim();
    const percentage = parseInt(document.getElementById('sellPercentage').value);
    const price = parseInt(document.getElementById('sellPrice').value);
    
    if (!buyerAccount || !percentage || !price) {
      uiManager.showError(languageService.t('error.fillAllFields'));
      return;
    }
    
    try {
      const user = authService.getCurrentUser();
      await businessService.createOwnershipOffer(businessId, user.id, buyerAccount, percentage, price);
      uiManager.showSuccess(languageService.t('msg.offerSent'));
      document.getElementById('sellOwnershipForm').reset();
      this.loadBusinessOwnershipOffers(businessService.getBusinessById(businessId));
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Godta kjøpstilbud på eierandel
   */
  async acceptOwnershipOffer(offerId) {
    try {
      const result = businessService.acceptOwnershipOffer(offerId);
      uiManager.showSuccess(`${languageService.t('business.ownershipBought')} ${result.taxPaid > 0 ? `${languageService.t('common.taxPaid')}: ${formatCurrency(result.taxPaid, this.settings.currencySymbol)}` : ''}`);
      this.loadStudentBusinesses();
      this.updateBalanceDisplay();
      await this.loadStudentTransactions(); // Oppdater transaksjonshistorikk
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Avslå kjøpstilbud
   */
  async rejectOwnershipOffer(offerId) {
    try {
      businessService.rejectOwnershipOffer(offerId);
      uiManager.showSuccess(languageService.t('msg.offerRejected'));
      this.loadPendingOffers();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Godta jobbtilbud (fra lærer eller bedrift)
   */
  async acceptJobOffer(offerId) {
    try {
      const offers = await dataService.getJobOffers();
      const offerIndex = offers.findIndex(o => o.id === offerId);
      
      if (offerIndex === -1) {
        uiManager.showError(languageService.t('error.notFound'));
        return;
      }
      
      const offer = offers[offerIndex];
      
      // Håndter lærerjobb
      if (offer.isTeacherJob) {
        // For lærerjobber: oppdater jobben direkte i dataService (ikke via jobService.assignJob som krever lærer)
        const job = await dataService.getJob(offer.jobId);
        if (!job) {
          uiManager.showError(languageService.t('error.jobNoLongerExists'));
          try {
            await dataService.deleteJobOffer(offerId);
          } catch (e) {
            console.error('Firebase feilet ved sletting av jobbtilbud:', e);
          }
          this.loadPendingOffers();
          return;
        }

        if (job.assignedTo) {
          uiManager.showError(languageService.t('error.jobAlreadyAssigned'));
          try {
            await dataService.deleteJobOffer(offerId);
          } catch (e) {
            console.error('Firebase feilet ved sletting av jobbtilbud:', e);
          }
          this.loadPendingOffers();
          return;
        }

        // Oppdater jobben direkte
        await dataService.updateJob(offer.jobId, {
          assignedTo: offer.employeeId,
          assignedToName: offer.employeeName,
          assignedAt: new Date().toISOString(),
          isDirectOffer: false  // Fjern flagget siden tilbudet er akseptert
        });

        // Oppdater tilbudsstatus
        try {
          await dataService.updateJobOffer(offerId, { status: 'accepted' });
        } catch (e) {
          console.error('Firebase feilet ved oppdatering av jobbtilbud:', e);
        }

        // Send jobbkontrakt til eleven
        await this.generateStateJobContract(job, offer.employeeId, offer.employeeName);

        uiManager.showSuccess(`${languageService.t('msg.youAreNowHiredAs')} ${offer.jobTitle} ${languageService.t('msg.atState')}`);
        await this.updateJobsBadge();
        await this.loadPendingOffers();
        await this.loadJobOffers();
        await this.loadStudentJobs();
        return;
      }
      
      // Håndter bedriftsjobb
      const business = businessService.getBusinessById(offer.businessId);

      if (!business) {
        uiManager.showError(languageService.t('error.businessNoLongerExists'));
        try {
          await dataService.deleteJobOffer(offerId);
        } catch (e) {
          console.error('Firebase feilet ved sletting av jobbtilbud:', e);
        }
        this.loadPendingOffers();
        this.loadJobOffers();
        return;
      }

      // Sjekk at bedriften har plass til flere ansatte
      const maxEmployees = businessService.calculateMaxEmployees(offer.businessId);
      if (business.employees.length >= maxEmployees) {
        uiManager.showError(languageService.t('error.businessFullEmployees'));
        return;
      }

      // Ansett brukeren (businessId, userId, salary, title)
      businessService.hireEmployee(offer.businessId, offer.employeeId, offer.salary, offer.jobTitle);

      // Oppdater jobbstatusen til 'active' og sett assignedTo
      if (business.jobs) {
        const jobIndex = business.jobs.findIndex(j => j.id === offer.jobId);
        if (jobIndex !== -1) {
          business.jobs[jobIndex].status = 'active';
          business.jobs[jobIndex].assignedTo = offer.employeeId;
          business.jobs[jobIndex].assignedToName = offer.employeeName;
          business.jobs[jobIndex].assignedAt = new Date().toISOString();
          businessService.saveBusinesses();
        }
      }

      // Oppdater tilbudsstatus
      try {
        await dataService.updateJobOffer(offerId, { status: 'accepted' });
      } catch (e) {
        console.error('Firebase feilet ved oppdatering av jobbtilbud:', e);
      }

      // Avvis andre søknader på samme jobb
      const applications = await dataService.getBusinessJobApplications();
      try {
        for (const app of applications) {
          if (app.jobId === offer.jobId && app.status === 'pending') {
            await dataService.updateBusinessJobApplication(app.id, { status: 'rejected' });
          }
        }
        // Oppdater denne søknaden til "accepted" og marker som sett
        if (offer.applicationId) {
          await dataService.updateBusinessJobApplication(offer.applicationId, {
            status: 'accepted',
            seenByApplicant: true
          });
        }
      } catch (e) {
        console.error('Firebase feilet ved oppdatering av søknader:', e);
      }

      // Generer og send arbeidskontrakt
      await this.generateEmploymentContract(business, { id: offer.jobId, title: offer.jobTitle, description: offer.jobDescription, salary: offer.salary, type: offer.jobType }, offer.employeeId, offer.employeeName);
      
      uiManager.showSuccess(`${languageService.t('msg.youAreNowHiredAs')} ${offer.jobTitle} ${languageService.t('msg.at')} ${offer.businessName}!`);
      await this.updateJobsBadge();
      await this.loadPendingOffers();
      await this.loadJobOffers();
      await this.loadStudentBusinesses();
      await this.loadStudentJobs(); // Oppdater jobber-fanen inkl. "Mine aktive jobber"
      await this.loadStudentActiveJobsSummary(); // Oppdater "Mine aktive jobber" i oversikten
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Avslå jobbtilbud
   */
  async rejectJobOffer(offerId) {
    try {
      const offers = await dataService.getJobOffers();
      const offer = offers.find(o => o.id === offerId);

      if (!offer) {
        uiManager.showError(languageService.t('error.offerNotFound'));
        return;
      }

      // Marker tilbudet som avslått
      try {
        await dataService.updateJobOffer(offerId, { status: 'rejected' });
      } catch (e) {
        console.error('Firebase feilet ved avslag av jobbtilbud:', e);
      }

      // For lærerjobber: gjør jobben tilgjengelig igjen i åpne stillinger
      if (offer.isTeacherJob && offer.jobId) {
        try {
          await dataService.updateJob(offer.jobId, { isDirectOffer: false });
        } catch (e) {
          console.error('Feil ved oppdatering av jobb:', e);
        }
      }

      // For bedriftsjobber, oppdater søknaden
      if (!offer.isTeacherJob && offer.applicationId) {
        try {
          await dataService.updateBusinessJobApplication(offer.applicationId, {
            status: 'rejected',
            seenByApplicant: true
          });
        } catch (e) {
          console.error('Firebase feilet ved oppdatering av søknad:', e);
        }
      }

      uiManager.showSuccess(languageService.t('msg.jobOfferRejected'));
      this.updateJobsBadge();
      this.loadPendingOffers();
      this.loadJobOffers();
      this.loadStudentJobs();  // Oppdater jobblisten i tilfelle jobben nå er synlig
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Si opp en jobb (fra elevens side) — åpner oppsigelsesmodal
   */
  quitJob(jobId, isBusinessJob) {
    document.getElementById('quitJobId').value = jobId;
    document.getElementById('quitJobIsBusinessJob').value = isBusinessJob ? '1' : '0';
    document.getElementById('quitJobMessage').value = '';
    document.getElementById('quitJobModal').classList.remove('hidden');
  }

  /**
   * Bekreft oppsigelse (fra modal)
   */
  async confirmQuitJob() {
    const jobId = document.getElementById('quitJobId').value;
    const isBusinessJob = document.getElementById('quitJobIsBusinessJob').value === '1';
    const quitMessage = document.getElementById('quitJobMessage').value.trim();

    document.getElementById('quitJobModal').classList.add('hidden');

    try {
      const user = authService.getCurrentUser();

      if (isBusinessJob) {
        const allBusinesses = businessService.getAllBusinesses();
        let foundBusiness = null;
        let foundJob = null;

        for (const business of allBusinesses) {
          if (business.jobs) {
            const job = business.jobs.find(j => j.id === jobId);
            if (job) {
              foundBusiness = business;
              foundJob = job;
              break;
            }
          }
        }

        if (!foundBusiness || !foundJob) {
          uiManager.showError(languageService.t('error.jobNotFound'));
          return;
        }

        foundJob.status = 'completed';
        foundJob.completedAt = new Date().toISOString();
        foundJob.quitByEmployee = true;
        foundJob.quitMessage = quitMessage || null;
        foundJob.assignedTo = null;

        if (foundJob.type === 'fixed') {
          foundBusiness.employees = foundBusiness.employees.filter(e =>
            !(e.title === foundJob.title && e.userId === user.id)
          );
        }

        businessService.saveBusiness(foundBusiness);

        // Varsle læreren
        const teacherNote = quitMessage
          ? `${user.name} har sagt opp jobben "${foundJob.title}" i ${foundBusiness.name}. Begrunnelse: ${quitMessage}`
          : `${user.name} har sagt opp jobben "${foundJob.title}" i ${foundBusiness.name}.`;
        await dataService.createTeacherMessage({ type: 'job_quit', fromId: user.id, fromName: user.name, title: `Oppsigelse: ${foundJob.title}`, message: teacherNote }).catch(() => {});

        uiManager.showSuccess(languageService.t('msg.youQuitJob'));
      } else {
        const jobs = await dataService.getJobs();
        const jobIndex = jobs.findIndex(j => j.id === jobId);

        if (jobIndex === -1) {
          uiManager.showError(languageService.t('error.jobNotFound'));
          return;
        }

        const job = jobs[jobIndex];
        if (job.assignedTo !== user.id) {
          uiManager.showError(languageService.t('error.youDontHaveThisJob'));
          return;
        }

        jobs[jobIndex] = {
          ...job,
          status: 'completed',
          completedAt: new Date().toISOString(),
          quitByEmployee: true,
          quitMessage: quitMessage || null,
          assignedTo: null,
          assignedToName: null
        };

        await dataService.updateJob(job.id, jobs[jobIndex]).catch(() => {
          dataService._saveToStorage('econsim_jobs', jobs);
        });

        // Varsle læreren
        const teacherNote = quitMessage
          ? `${user.name} har sagt opp jobben "${job.title}". Begrunnelse: ${quitMessage}`
          : `${user.name} har sagt opp jobben "${job.title}".`;
        await dataService.createTeacherMessage({ type: 'job_quit', fromId: user.id, fromName: user.name, title: `Oppsigelse: ${job.title}`, message: teacherNote }).catch(() => {});

        uiManager.showSuccess(languageService.t('jobs.jobQuit'));
      }

      await this.loadStudentJobs();
    } catch (error) {
      console.error('Feil ved oppsigelse:', error);
      uiManager.showError(error.message || languageService.t('jobs.couldNotQuit'));
    }
  }

  /**
   * Send jobbtilbud til søker (i stedet for direkte ansettelse)
   */
  async sendJobOffer(applicationId) {
    try {
      const applications = await dataService.getBusinessJobApplications();
      const appIndex = applications.findIndex(a => a.id === applicationId);
      
      if (appIndex === -1) {
        uiManager.showError(languageService.t('error.applicationNotFound'));
        return;
      }
      
      const app = applications[appIndex];
      const business = businessService.getBusinessById(app.businessId);
      const job = business?.jobs?.find(j => j.id === app.jobId);
      
      if (!business || !job) {
        uiManager.showError(languageService.t('error.businessOrJobNoLongerExists'));
        try {
          await dataService.deleteBusinessJobApplication(applicationId);
        } catch (e) {
          console.error('Firebase feilet ved sletting av søknad:', e);
        }
        return;
      }

      // Sjekk at bedriften har plass til flere ansatte
      const maxEmployees = businessService.calculateMaxEmployees(business.id);
      if (business.employees.length >= maxEmployees) {
        uiManager.showError(languageService.t('error.businessFullEmployees'));
        return;
      }

      // Sjekk om tilbud allerede er sendt til denne søkeren
      const existingOffers = await dataService.getJobOffers();
      if (existingOffers.some(o => o.applicationId === applicationId && o.status === 'pending')) {
        uiManager.showError(languageService.t('error.offerAlreadySent'));
        return;
      }

      // Sjekk om det allerede finnes et ventende tilbud på denne jobben til noen andre
      const existingJobOffer = existingOffers.find(o => o.jobId === app.jobId && o.status === 'pending');
      if (existingJobOffer) {
        uiManager.showError(`${languageService.t('error.offerAlreadySentTo')} ${existingJobOffer.employeeName}. ${languageService.t('error.withdrawExistingFirst')}`);
        return;
      }

      // Opprett jobbtilbud
      const jobOffer = {
        applicationId: applicationId,
        jobId: app.jobId,
        businessId: app.businessId,
        businessName: business.name,
        businessLogo: business.logo,
        businessEmoji: business.emoji,
        jobTitle: job.title,
        jobDescription: job.description || '',
        jobType: job.type || 'fixed',
        salary: job.salary,
        targetUserId: app.applicantId,
        employeeName: app.applicantName,
        status: 'pending'
      };

      try {
        await dataService.createJobOffer(jobOffer);

        // Marker søknaden som "tilbud sendt"
        await dataService.updateBusinessJobApplication(applicationId, {
          status: 'offer_sent'
        });
      } catch (e) {
        console.error('Firebase feilet ved opprettelse av jobbtilbud:', e);
      }
      
      uiManager.showSuccess(`${languageService.t('msg.jobOfferSentTo')} ${app.applicantName}!`);
      this.loadBusinessEmployees(businessService.getBusinessById(business.id));
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Avslå jobbsøknad
   */
  async rejectJobApplication(applicationId) {
    try {
      const applications = await dataService.getBusinessJobApplications();
      const app = applications.find(a => a.id === applicationId);

      if (!app) {
        uiManager.showError(languageService.t('error.applicationNotFound'));
        return;
      }

      try {
        await dataService.updateBusinessJobApplication(applicationId, {
          status: 'rejected'
        });
      } catch (e) {
        console.error('Firebase feilet ved avslag av jobbsøknad:', e);
      }

      uiManager.showSuccess(languageService.t('msg.applicationRejected'));
      this.loadBusinessEmployees(businessService.getBusinessById(app.businessId));
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Kanseller eget tilbud
   */
  async cancelOwnershipOffer(offerId) {
    try {
      const user = authService.getCurrentUser();
      businessService.cancelOwnershipOffer(offerId, user.id);
      uiManager.showSuccess(languageService.t('msg.offerCancelled'));
      this.loadBusinessOwnershipOffers(businessService.getBusinessById(this.selectedBusinessId));
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Sett inn penger i bedrift
   */
  async depositToBusiness() {
    const amount = parseInt(document.getElementById('depositToBusinessAmount').value);
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }

    try {
      const user = authService.getCurrentUser();
      await businessService.transfer(this.selectedBusinessId, user.id, amount, 'to_business');
      await authService.refreshCurrentUser(); // Refresh brukerdata etter overføring
      uiManager.showSuccess(languageService.t('msg.moneyDepositedToBusiness'));
      document.getElementById('depositToBusinessAmount').value = '';
      this.selectBusiness(this.selectedBusinessId);
      this.updateBalanceDisplay();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Ta ut penger fra bedrift
   */
  async withdrawFromBusiness() {
    const amount = parseInt(document.getElementById('withdrawFromBusinessAmount').value);
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }

    try {
      const user = authService.getCurrentUser();
      const result = await businessService.transfer(this.selectedBusinessId, user.id, amount, 'from_business');
      await authService.refreshCurrentUser(); // Refresh brukerdata etter overføring

      if (result.taxAmount > 0) {
        uiManager.showSuccess(`${languageService.t('business.withdrawal')}: ${formatCurrency(result.netAmount, this.settings.currencySymbol)} (${languageService.t('business.dividendTax')}: ${formatCurrency(result.taxAmount, this.settings.currencySymbol)})`);
      } else {
        uiManager.showSuccess(languageService.t('msg.moneyWithdrawnFromBusiness'));
      }

      document.getElementById('withdrawFromBusinessAmount').value = '';
      this.selectBusiness(this.selectedBusinessId);
      this.updateBalanceDisplay();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Utbetal lønn til ansatte
   */
  async payBusinessSalaries() {
    try {
      const result = await businessService.payEmployees(this.selectedBusinessId);
      if (result.totalPaid > 0) {
        uiManager.showSuccess(`${languageService.t('msg.salaryPaid')} ${formatCurrency(result.totalPaid, this.settings.currencySymbol)}`);
      } else {
        uiManager.showError(languageService.t('error.noSalaryPaid'));
      }
      this.selectBusiness(this.selectedBusinessId);
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Si opp ansatt
   */
  fireEmployee(businessId, userId) {
    document.getElementById('fireEmployeeBusinessId').value = businessId;
    document.getElementById('fireEmployeeUserId').value = userId;
    document.getElementById('fireEmployeeMessage').value = '';
    document.getElementById('fireEmployeeModal').classList.remove('hidden');
  }

  async confirmFireEmployee() {
    const businessId = document.getElementById('fireEmployeeBusinessId').value;
    const userId = document.getElementById('fireEmployeeUserId').value;
    const fireMessage = document.getElementById('fireEmployeeMessage').value.trim();

    document.getElementById('fireEmployeeModal').classList.add('hidden');

    try {
      const business = businessService.getBusinessById(businessId);
      const firedUser = dataService.getUserById(userId);

      await businessService.fireEmployee(businessId, userId);

      // Send varsel til den oppsagte
      if (firedUser) {
        const empNote = fireMessage
          ? `Du er avsluttet fra jobben din i ${business?.name || 'bedriften'}. Beskjed fra arbeidsgiver: ${fireMessage}`
          : `Du er avsluttet fra jobben din i ${business?.name || 'bedriften'}.`;
        notificationService.create({ userId: firedUser.id, type: 'warning', title: '📋 Ansettelse avsluttet', message: empNote, icon: '📋' });
      }

      uiManager.showSuccess(languageService.t('business.employeeFired'));
      if (business) this.loadBusinessEmployees(business);
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  /**
   * Fjern bedriftsjobb
   */
  async removeBusinessJob(businessId, jobId) {
    try {
      businessService.removeJob(businessId, jobId);
      uiManager.showSuccess(languageService.t('msg.jobListingRemoved'));
      await this.loadBusinessJobs(businessService.getBusinessById(businessId));
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  // ==================== SPARING/FOND FUNKSJONER ====================

  // loadStudentSavings — moved to features/savings/controllers/savingsController.js

  /**
   * Last studentens lån - DEPRECATED: Lån vises nå kun i Lån-fanen via loadStudentLoansScreen()
   * Beholdt for bakoverkompatibilitet, kaller nå loadStudentLoansScreen()
   */
  async loadStudentLoans() {
    // Videresend til loadStudentLoansScreen som håndterer alt
    await this.loadStudentLoansScreen();
  }

  /**
   * Last studentens lån-skjerm (ny skjerm)
   */
  async loadStudentLoansScreen() {
    const user = authService.getCurrentUser();
    const activeLoansContainer = document.getElementById('studentActiveLoans');
    const applicationsContainer = document.getElementById('studentLoanApplications');
    
    if (!(await loanService.isEnabled())) {
      if (activeLoansContainer) activeLoansContainer.innerHTML = '';
      if (applicationsContainer) applicationsContainer.innerHTML = '';
      return;
    }

    // Last aktive lån
    const loans = loanService.getLoansByBorrower(user.id);
    const activeStudentLoans = loans.filter(l => l.status === 'active' || l.status === 'overdue');
    const totalStudentDebt = activeStudentLoans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0);
    const loanBannerEl = document.getElementById('studentLoansBannerDebt');
    if (loanBannerEl) loanBannerEl.textContent = formatCurrency(totalStudentDebt, this.settings?.currencySymbol || 'KKr');

    if (activeLoansContainer) {
      if (loans.length === 0) {
        activeLoansContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('loans.noActiveLoans')}</p>`;
      } else {
        activeLoansContainer.innerHTML = loans.map(loan => {
          const statusClass = loan.status === 'active' ? 'bg-green-100 text-green-800' : 
                             loan.status === 'paid_off' ? 'bg-blue-100 text-blue-800' :
                             'bg-amber-100 text-amber-800';
          const statusText = loan.status === 'active' ? languageService.t('loans.statusActive') : 
                            loan.status === 'paid_off' ? languageService.t('loans.statusPaidOff') : languageService.t('loans.statusOverdue');
          
          return `
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="flex justify-between items-start mb-3">
                <div>
                  <p class="font-medium">${languageService.t('loans.loan')}: ${formatCurrency(loan.principalAmount, this.settings.currencySymbol)}</p>
                  <p class="text-sm text-gray-600">${languageService.t('loans.remainingLabel')}: <strong>${formatCurrency(loan.remainingBalance, this.settings.currencySymbol)}</strong></p>
                  <p class="text-sm text-gray-600">${languageService.t('loans.weeklyInstallmentLabel')}: ${formatCurrency(loan.monthlyPayment, this.settings.currencySymbol)}</p>
                  <p class="text-xs text-gray-500">${languageService.t('loans.weeksRemaining')}: ${loan.paymentsRemaining} • ${languageService.t('loans.interest')}: ${loan.interestRate}%</p>
                  ${loan.purpose ? `<p class="text-xs text-gray-500 mt-1">${languageService.t('loans.purpose')}: ${escapeHtml(loan.purpose)}</p>` : ''}
                </div>
                <span class="px-2 py-1 rounded text-xs ${statusClass}">${statusText}</span>
              </div>
              ${loan.status !== 'paid_off' ? `
                <button onclick="window.econSim.showExtraPaymentModal('${loan.id}')" 
                  class="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm">
                  ${languageService.t('loans.payExtraOnLoan')}
                </button>
              ` : ''}
            </div>
          `;
        }).join('');
      }
    }

    // Last lånesøknader
    if (applicationsContainer) {
      const applications = await getLoanApplicationsForUserUtil(user.id, dataService);
      if (applications.length === 0) {
        applicationsContainer.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('loans.noApplicationsSent')}</p>`;
      } else {
        applicationsContainer.innerHTML = applications.map(app => {
          const statusClass = app.status === 'pending' ? 'bg-amber-100 text-amber-800' : 
                             app.status === 'approved' ? 'bg-green-100 text-green-800' :
                             'bg-red-100 text-red-800';
          const statusText = app.status === 'pending' ? languageService.t('common.pending') : 
                            app.status === 'approved' ? languageService.t('common.approved') : languageService.t('common.rejected');
          
          return `
            <div class="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
              <div>
                <p class="font-medium">${formatCurrency(app.amount, this.settings.currencySymbol)}</p>
                <p class="text-xs text-gray-500">${escapeHtml(app.purpose?.substring(0, 50) || languageService.t('common.noDescription'))}...</p>
                <p class="text-xs text-gray-400">${new Date(app.createdAt).toLocaleDateString('nb-NO')}</p>
              </div>
              <span class="px-2 py-1 rounded text-xs ${statusClass}">${statusText}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  /**
   * Send lånesøknad (elev)
   */
  async submitStudentLoanApplication(e) {
    e.preventDefault();

    if (!(await loanService.isEnabled())) {
      uiManager.showError(languageService.t('error.loanSystemNotEnabled') || 'Lånesystemet er ikke aktivert');
      return;
    }
    
    const user = authService.getCurrentUser();
    const amount = parseInt(document.getElementById('loanApplicationAmount').value);
    const purpose = document.getElementById('loanApplicationPurpose').value.trim();
    
    if (!amount || amount <= 0) {
      uiManager.showError(languageService.t('error.invalidAmount'));
      return;
    }
    
    if (!purpose) {
      uiManager.showError(languageService.t('error.loanPurposeRequired'));
      return;
    }
    
    // Opprett lånesøknad
    const application = {
      applicantId: user.id,
      applicantName: user.name,
      applicantType: 'student',
      amount,
      purpose,
      status: 'pending'
    };

    try {
      await dataService.createLoanApplication(application);
    } catch (e) {
      console.error('Firebase feilet ved opprettelse av lånesøknad:', e);
    }
    
    // Reset form
    document.getElementById('studentLoanApplicationForm').reset();
    
    uiManager.showSuccess(languageService.t('msg.loanApplicationSent'));
    this.loadStudentLoansScreen();
  }

  /**
   * Vis modal for ekstra innbetaling på lån
   */
  showExtraPaymentModal(loanId) {
    const loan = loanService.getLoanById(loanId);
    if (!loan) {
      uiManager.showError(languageService.t('error.loanNotFound'));
      return;
    }

    const user = authService.getCurrentUser();
    
    document.getElementById('extraPaymentLoanId').value = loanId;
    document.getElementById('extraPaymentRemainingBalance').textContent = formatCurrency(loan.remainingBalance, this.settings.currencySymbol);
    document.getElementById('extraPaymentCurrentInstallment').textContent = formatCurrency(loan.monthlyPayment, this.settings.currencySymbol);
    document.getElementById('extraPaymentWeeksRemaining').textContent = loan.paymentsRemaining;
    document.getElementById('extraPaymentAvailableBalance').textContent = formatCurrency(user.balance, this.settings.currencySymbol);
    document.getElementById('extraPaymentAmount').value = '';
    document.getElementById('extraPaymentPreview').classList.add('hidden');
    
    document.getElementById('extraLoanPaymentModal').classList.remove('hidden');
    
    // Legg til event listener for forhåndsvisning
    const amountInput = document.getElementById('extraPaymentAmount');
    amountInput.oninput = () => this.updateExtraPaymentPreview(loan);
  }

  /**
   * Oppdater forhåndsvisning for ekstra innbetaling
   */
  updateExtraPaymentPreview(loan) {
    const amount = parseInt(document.getElementById('extraPaymentAmount').value) || 0;
    const previewEl = document.getElementById('extraPaymentPreview');
    
    if (amount <= 0) {
      previewEl.classList.add('hidden');
      return;
    }

    const newRemaining = Math.max(0, loan.remainingBalance - amount);
    let newInstallment = 0;
    
    if (newRemaining > 0 && loan.paymentsRemaining > 0) {
      const rate = loan.interestRate / 100 / 12;
      if (rate === 0) {
        newInstallment = Math.ceil(newRemaining / loan.paymentsRemaining);
      } else {
        newInstallment = Math.ceil(
          newRemaining * (rate * Math.pow(1 + rate, loan.paymentsRemaining)) 
          / (Math.pow(1 + rate, loan.paymentsRemaining) - 1)
        );
      }
    }

    document.getElementById('newRemainingAfterPayment').textContent = formatCurrency(newRemaining, this.settings.currencySymbol);
    document.getElementById('newInstallmentAfterPayment').textContent = formatCurrency(newInstallment, this.settings.currencySymbol);
    previewEl.classList.remove('hidden');
  }

  /**
   * Utfør ekstra innbetaling på lån
   */
  async submitExtraLoanPayment(e) {
    e.preventDefault();
    
    const loanId = document.getElementById('extraPaymentLoanId').value;
    const amount = parseInt(document.getElementById('extraPaymentAmount').value);
    
    if (!loanId || !amount || amount <= 0) {
      uiManager.showError(languageService.t('error.enterValidAmount'));
      return;
    }

    try {
      const result = loanService.makeExtraPayment(loanId, amount);
      
      let message = `${languageService.t('loans.paidOnLoan')}: ${formatCurrency(result.amountPaid, this.settings.currencySymbol)}!`;
      if (result.isPaidOff) {
        message = languageService.t('loans.congratsLoanPaidOff');
      } else {
        message += ` ${languageService.t('loans.newWeeklyInstallment')}: ${formatCurrency(result.newMonthlyPayment, this.settings.currencySymbol)}`;
      }
      
      uiManager.showSuccess(message);
      document.getElementById('extraLoanPaymentModal').classList.add('hidden');
      
      // Oppdater visninger
      await this.loadStudentLoans();
      await this.refreshStudentDashboard();
    } catch (error) {
      uiManager.showError(error.message);
    }
  }

  // ==================== INNBOKS FUNKSJONER ====================

  /**
   * Last studentens innboks med nye kategorier
   */
  async loadStudentInbox() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);
    const outbox = await dataService.getOutbox(user.id);

    // Oppdater badge
    this.updateInboxBadge();

    // Kategoriser meldinger i 5 kategorier:
    // System: kontrakter, rapporter, varsler (automatiske systemgenererte meldinger)
    const systemTypes = ['system', 'tax_statement', 'contract', 'system_alert', 'salary', 'fine',
      'ownership_contract', 'loan_approved', 'loan_rejected', 'loan_paid_off', 'loan_contract',
      'employment_contract', 'weekly_report', 'interest'];

    const systemMessages = inbox.filter(m =>
      systemTypes.includes(m.type) || m.fromType === 'system'
    );

    // Lærer: meldinger fra lærer
    const teacherMessages = inbox.filter(m =>
      m.fromType === 'teacher' && !systemTypes.includes(m.type)
    );

    // Bedrifter: meldinger fra bedrifter
    const businessMessages = inbox.filter(m =>
      m.fromType === 'business' && !systemTypes.includes(m.type)
    );

    // Elever: meldinger fra andre elever
    const studentMessages = inbox.filter(m =>
      m.fromType === 'student' && !systemTypes.includes(m.type)
    );

    // Oppdater kategori-badges
    this.updateCategoryBadge('System', systemMessages);
    this.updateCategoryBadge('Teacher', teacherMessages);
    this.updateCategoryBadge('Businesses', businessMessages);
    this.updateCategoryBadge('Students', studentMessages);

    // Vis meldinger i hver kategori
    this.renderInboxCategory('System', systemMessages, 'systemmeldinger');
    this.renderInboxCategory('Teacher', teacherMessages, 'meldinger fra lærer');
    this.renderInboxCategory('Businesses', businessMessages, 'meldinger fra bedrifter');
    this.renderInboxCategory('Students', studentMessages, 'meldinger fra medelever');

    // Render utboks
    this.renderOutboxCategory('Outbox', outbox, 'sendte meldinger');

    // Last inn mottakerliste for å sende meldinger
    this.loadMessageRecipients();
  }

  /**
   * Oppdater badge for en kategori
   */
  updateCategoryBadge(category, messages) {
    const unreadCount = messages.filter(m => !m.read).length;
    const badge = document.getElementById(`inboxBadge${category}`);
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  /**
   * Render meldinger i en kategori
   */
  renderInboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`inboxCategory${category}`);
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('inbox.noMessagesPrefix')} ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const isSystem = category === 'System';
      const bgClass = msg.read ? 'bg-gray-50 border-gray-200' : (isSystem ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200');
      const textClass = msg.read ? 'text-gray-700' : (isSystem ? 'text-green-800' : 'text-blue-800');
      
      let fromLabel = '';
      if (msg.fromName) {
        fromLabel = `<span class="text-xs text-gray-500">${languageService.t('common.from')}: ${escapeHtml(msg.fromName)}</span>`;
      }
      
      // Forkortet melding for visning
      const shortMessage = msg.message.length > 100 ? msg.message.substring(0, 100) + '...' : msg.message;
      
      return `
        <div class="p-4 rounded-lg border ${bgClass} cursor-pointer hover:shadow-md transition-shadow" onclick="window.econSim.openMessage('${msg.id}')">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="font-medium ${textClass}">${escapeHtml(msg.title)}</h4>
              ${fromLabel}
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
              <button onclick="event.stopPropagation(); window.econSim.deleteMessage('${msg.id}')" class="text-red-400 hover:text-red-600" title="Slett">🗑️</button>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(shortMessage)}</p>
          ${!msg.read ? '<span class="inline-block mt-2 text-xs text-blue-600">● Ulest</span>' : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Vis en innboks-kategori (elev)
   */
  showInboxCategory(category) {
    const categories = ['System', 'Teacher', 'Businesses', 'Students', 'Outbox'];
    const categoryMap = {
      'system': 'System',
      'teacher': 'Teacher',
      'businesses': 'Businesses',
      'students': 'Students',
      'outbox': 'Outbox'
    };
    const cat = categoryMap[category] || category;

    categories.forEach(c => {
      const container = document.getElementById(`inboxCategory${c}`);
      const tab = document.getElementById(`inboxTab${c}`);
      if (container && tab) {
        if (c === cat) {
          container.classList.remove('hidden');
          tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.remove('text-gray-500');
        } else {
          container.classList.add('hidden');
          tab.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.add('text-gray-500');
        }
      }
    });
  }

  /**
   * Render utboks (sendte meldinger) med lest-status
   */
  renderOutboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`inboxCategory${category}`);
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">Ingen ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const readStatus = msg.recipientRead
        ? `<span class="text-green-500" title="Lest ${msg.recipientReadAt ? new Date(msg.recipientReadAt).toLocaleDateString('nb-NO') : ''}">✓ Lest</span>`
        : `<span class="text-gray-400" title="Ikke lest ennå">◯ Ulest</span>`;

      return `
        <div class="p-3 rounded-lg border bg-gray-50 border-gray-200">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm text-gray-700">${escapeHtml(msg.title)}</span>
              <span class="text-xs text-gray-500 block">Til: ${escapeHtml(msg.recipientName || 'Ukjent')}</span>
            </div>
            <div class="flex items-center gap-2">
              ${readStatus}
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message?.substring(0, 100) || '')}${msg.message?.length > 100 ? '...' : ''}</p>
        </div>
      `;
    }).join('');
  }

  /**
   * Last inn mottakerliste for å sende meldinger
   */
  async loadMessageRecipients() {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Hent classroomId og classroom korrekt
    const classroomId = await dataService.getCurrentClassroomId();
    if (!classroomId) return;
    
    const classroom = classroomService.getClassroomById(classroomId);
    if (!classroom) return;

    // Hent alle brukere i DETTE klasserommet
    const classroomUsers = classroomService.getUsers().filter(u => u.classroomId === classroomId);

    // Lærer - finn læreren via classroom.teacherId
    const teacherGroup = document.getElementById('teacherRecipientGroup');
    if (teacherGroup) {
      teacherGroup.label = `📚 ${languageService.t('role.teacher')}`;
      const teacher = dataService.getUserById(classroom.teacherId);
      if (teacher) {
        teacherGroup.innerHTML = `<option value="teacher:${teacher.id}">👩‍🏫 ${escapeHtml(teacher.name || teacher.username)}</option>`;
      } else {
        teacherGroup.innerHTML = `<option disabled>${languageService.t('inbox.noTeacher')}</option>`;
      }
    }

    // Medelever (kun elever i samme klasserom, ikke meg selv)
    const studentGroup = document.getElementById('studentRecipientGroup');
    if (studentGroup) {
      studentGroup.label = `👥 ${languageService.t('inbox.classmates')}`;
      const students = classroomUsers.filter(u => (u.type === 'student' || u.role === 'student') && u.id !== user.id);
      if (students.length > 0) {
        studentGroup.innerHTML = students.map(s => 
          `<option value="student:${s.id}">👤 ${escapeHtml(s.name || s.username)}</option>`
        ).join('');
      } else {
        studentGroup.innerHTML = `<option disabled>${languageService.t('inbox.noClassmates')}</option>`;
      }
    }

    // Bedrifter (kun bedrifter i dette klasserommet - hentes fra businessService)
    const businessGroup = document.getElementById('businessRecipientGroup');
    if (businessGroup) {
      businessGroup.label = `🏢 ${languageService.t('common.businesses')}`;
      const businesses = businessService.getBusinessesByClassroom(classroomId).filter(b => b.isActive !== false);
      if (businesses.length > 0) {
        businessGroup.innerHTML = businesses.map(b => 
          `<option value="business:${b.id}">🏢 ${escapeHtml(b.name)}</option>`
        ).join('');
      } else {
        businessGroup.innerHTML = `<option disabled>${languageService.t('inbox.noBusinesses')}</option>`;
      }
    }
  }

  /**
   * Send melding fra elev — funksjonaliteten er fjernet.
   * Elever får bare varsler nå (system-meldinger fra banken og lærer-
   * kunngjøringer); peer-to-peer-meldinger ble fjernet i en tidligere
   * versjon. Metoden beholdes som no-op for å unngå at gammel HTML
   * eller event-binding kaster feil hvis den fortsatt refererer hit.
   */
  async sendStudentMessage() {
    return;
  }

  /**
   * Slett en melding
   */
  async deleteMessage(messageId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    if (!confirm(languageService.t('confirm.deleteMessage'))) return;

    try {
      await dataService.deleteMessage(messageId, 'inbox');
      // Slett også utboks-kopien hvis den finnes
      await dataService.deleteOutboxForMessage(messageId);
      uiManager.showSuccess(languageService.t('msg.messageDeleted'));
    } catch (e) {
      console.error('Firebase feilet ved sletting av melding:', e);
      uiManager.showError('Kunne ikke slette meldingen. Prøv igjen.');
    }

    await this.loadStudentInbox();
  }

  /**
   * Oppdater innboks-badge
   */
  async updateInboxBadge() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);
    const unreadCount = inbox.filter(m => !m.read).length;
    
    const badge = document.getElementById('inboxBadge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  /**
   * Åpne melding i modal for lesing
   */
  async openMessage(messageId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);

    const msg = inbox.find(m => m.id === messageId);
    if (!msg) return;

    // Marker som lest
    if (!msg.read) {
      try {
        await dataService.markMessageAsRead(messageId, 'inbox');
        await this.loadStudentInbox();
        await this.updateInboxBadge();
      } catch (e) {
        console.error('Firebase feilet ved markering av melding som lest:', e);
      }
    }
    
    // Vis i modal
    document.getElementById('messageViewTitle').textContent = msg.title;
    document.getElementById('messageViewFrom').textContent = msg.fromName ? `${languageService.t('common.from')}: ${msg.fromName}` : '';
    document.getElementById('messageViewDate').textContent = `${languageService.t('common.date')}: ${new Date(msg.createdAt).toLocaleDateString('nb-NO', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    document.getElementById('messageViewContent').textContent = msg.message;
    
    // Lagre melding-info for svar og print (støtter både fromId/senderId varianter)
    this.currentMessageId = messageId;
    const msgSenderId = msg.fromId || msg.senderId;
    const msgSenderType = msg.fromType || msg.senderType;
    const msgSenderName = msg.fromName || msg.senderName;

    this.currentReplyContext = {
      type: 'student',
      originalMessage: msg,
      senderId: msgSenderId,
      senderType: msgSenderType,
      senderName: msgSenderName
    };

    // Vis/skjul svar-knapp basert på meldingstype
    // Automatiske meldinger (kontrakter, systemvarsler) skal ikke ha svar-knapp
    const noReplyTypes = ['system', 'system_alert', 'contract', 'loan_contract', 'employment_contract',
      'ownership_contract', 'tax_statement', 'salary', 'fine', 'loan_approved', 'loan_rejected', 'loan_paid_off'];
    const replyBtn = document.getElementById('messageReplyBtn');
    if (replyBtn) {
      if (msgSenderId && msgSenderType && !noReplyTypes.includes(msg.type)) {
        replyBtn.classList.remove('hidden');
      } else {
        replyBtn.classList.add('hidden');
      }
    }
    
    document.getElementById('messageViewModal').classList.remove('hidden');
  }

  /**
   * Svar på melding
   */
  replyToMessage() {
    const ctx = this.currentReplyContext;
    if (!ctx || !ctx.originalMessage) {
      uiManager.showError(languageService.t('error.cannotReply'));
      return;
    }

    const user = authService.getCurrentUser();
    if (!user) return;

    const origMsg = ctx.originalMessage;
    const origDate = new Date(origMsg.createdAt).toLocaleDateString('nb-NO', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Bygg svar-tittel med "Re:" prefiks
    let replyTitle = origMsg.title || '';
    if (!replyTitle.toLowerCase().startsWith('re:')) {
      replyTitle = `${languageService.t('inbox.replyPrefix')} ${replyTitle}`;
    }

    // Bygg original melding-sitat
    const quotedMessage = `\n\n${languageService.t('inbox.originalMessage')}\n${languageService.t('inbox.from')}: ${ctx.senderName || languageService.t('common.unknown')}\n${languageService.t('inbox.date')}: ${origDate}\n\n${origMsg.message}`;

    // Lukk meldingsvisning
    document.getElementById('messageViewModal').classList.add('hidden');

    // Åpne riktig svar-grensesnitt basert på kontekst
    if (ctx.type === 'student') {
      // Elev svarer - åpne student innboks-tab med forhåndsutfylt data
      this.openStudentReplyForm(ctx, replyTitle, quotedMessage);
    } else if (ctx.type === 'business') {
      // Bedrift svarer
      this.openBusinessReplyForm(ctx, replyTitle, quotedMessage);
    } else if (ctx.type === 'teacher') {
      // Lærer svarer
      this.openTeacherReplyForm(ctx, replyTitle, quotedMessage);
    }
  }

  /**
   * Åpne svarskjema for elev
   */
  openStudentReplyForm(ctx, replyTitle, quotedMessage) {
    // Forhåndsutfyll felter
    const recipientSelect = document.getElementById('studentMessageRecipient');
    const subjectInput = document.getElementById('studentMessageSubject');
    const bodyInput = document.getElementById('studentMessageBody');
    
    if (recipientSelect) {
      // Sett mottaker basert på avsendertype
      const recipientValue = `${ctx.senderType}:${ctx.senderId}`;
      recipientSelect.value = recipientValue;
    }
    
    if (subjectInput) subjectInput.value = replyTitle;
    if (bodyInput) {
      bodyInput.value = quotedMessage;
      // Sett fokus øverst i tekstfeltet
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }
    
    // Scroll til skriv melding-seksjonen
    const sendSection = document.getElementById('studentMessageRecipient')?.closest('.bg-white');
    if (sendSection) sendSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Åpne svarskjema for bedrift
   */
  openBusinessReplyForm(ctx, replyTitle, quotedMessage) {
    // Sørg for at innboks-tab er synlig
    this.showBusinessTab('inbox');
    
    // Forhåndsutfyll felter
    const recipientSelect = document.getElementById('businessMessageRecipient');
    const subjectInput = document.getElementById('businessMessageSubject');
    const bodyInput = document.getElementById('businessMessageBody');
    
    if (recipientSelect) {
      // Sett mottaker basert på avsendertype (teacher_, student_, employee_, business_)
      let recipientValue = '';
      if (ctx.senderType === 'teacher') {
        recipientValue = `teacher_${ctx.senderId}`;
      } else if (ctx.senderType === 'student') {
        recipientValue = `student_${ctx.senderId}`;
      } else if (ctx.senderType === 'business') {
        recipientValue = `business_${ctx.senderId}`;
      }
      recipientSelect.value = recipientValue;
    }
    
    if (subjectInput) subjectInput.value = replyTitle;
    if (bodyInput) {
      bodyInput.value = quotedMessage;
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }
  }

  /**
   * Åpne svarskjema for lærer
   */
  openTeacherReplyForm(ctx, replyTitle, quotedMessage) {
    // Forhåndsutfyll felter
    const recipientSelect = document.getElementById('teacherMessageRecipient');
    const subjectInput = document.getElementById('teacherMessageSubject');
    const bodyInput = document.getElementById('teacherMessageBody');
    
    if (recipientSelect) {
      // Sett mottaker basert på avsendertype
      let recipientValue = '';
      if (ctx.senderType === 'student') {
        recipientValue = `student:${ctx.senderId}`;
      } else if (ctx.senderType === 'business') {
        recipientValue = `business:${ctx.senderId}`;
      }
      recipientSelect.value = recipientValue;
    }
    
    if (subjectInput) subjectInput.value = replyTitle;
    if (bodyInput) {
      bodyInput.value = quotedMessage;
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }
    
    // Scroll til skriv melding-seksjonen
    const sendSection = document.getElementById('teacherMessageForm');
    if (sendSection) sendSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Skriv ut melding med forbedret formatering
   */
  printMessage() {
    const title = document.getElementById('messageViewTitle').textContent;
    const from = document.getElementById('messageViewFrom').textContent;
    const date = document.getElementById('messageViewDate').textContent;
    const content = document.getElementById('messageViewContent').textContent;

    // Konverter innhold til HTML-format (bevar linjeskift)
    const formattedContent = formatMessageForPrint(content);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 30px;
            line-height: 1.5;
            color: #333;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 8px;
            color: #1a1a1a;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 8px;
          }
          .meta {
            color: #666;
            font-size: 13px;
            margin-bottom: 24px;
          }
          .meta p { margin: 4px 0; }
          .content {
            white-space: pre-wrap;
            word-wrap: break-word;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.6;
          }
          .content .separator {
            border-top: 1px dashed #ccc;
            margin: 16px 0;
          }
          .content .header-line {
            font-weight: bold;
            color: #1a1a1a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 8px 12px;
            text-align: left;
            font-size: 11px;
          }
          th {
            background: #f3f4f6;
            font-weight: 600;
          }
          tr:nth-child(even) { background: #f9fafb; }
          @media print {
            body { margin: 0; padding: 20px; }
            .content { background: white; border: 1px solid #ccc; }
          }
          .logo {
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #888;
            border-top: 1px solid #e5e7eb;
            padding-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="logo">🏦 EconSim</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          <p>${escapeHtml(from)}</p>
          <p>${escapeHtml(date)}</p>
        </div>
        <div class="content">${formattedContent}</div>
        <div class="footer">
          Skrevet ut fra EconSim - ${new Date().toLocaleDateString('nb-NO')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  /**
   * Marker melding som lest
   */
  async markMessageAsRead(messageId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    try {
      await dataService.markMessageAsRead(messageId, 'inbox');
      await this.loadStudentInbox();
      await this.updateInboxBadge();
    } catch (e) {
      console.error('Firebase feilet ved markering av melding som lest:', e);
    }
  }

  /**
   * Marker alle meldinger som lest
   */
  async markAllAsRead() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);

    try {
      for (const m of inbox) {
        if (!m.read) {
          await dataService.markMessageAsRead(m.id, 'inbox');
        }
      }
    } catch (e) {
      console.error('Firebase feilet ved markering av alle meldinger som lest:', e);
    }

    await this.loadStudentInbox();
    await this.updateInboxBadge();
    uiManager.showSuccess(languageService.t('msg.allMessagesRead'));
  }

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

  /**
   * Last meldinger for lærer med nye kategorier
   */
  async loadTeacherMessages() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const recipientSelect = document.getElementById('teacherMessageRecipient');

    // Last meldinger fra Firebase (for lærer)
    const messages = await dataService.getTeacherMessages();
    const outbox = await dataService.getOutbox(user.id);

    // Oppdater badge
    await this.updateTeacherMessagesBadge();

    // Kategoriser meldinger i 6 kategorier:
    // System: ukesrapporter, økonomioversikt, varsler
    const systemTypes = ['economy_report', 'weekly_report', 'system_alert'];
    const systemMessages = messages.filter(m => systemTypes.includes(m.type));

    // Lån: lånekontrakter, nedbetalingsplaner
    const loanTypes = ['loan_contract', 'loan_payment_failed', 'loan_completed', 'loan_warning', 'loan_approved', 'loan_rejected'];
    const loanMessages = messages.filter(m =>
      loanTypes.includes(m.type) || m.category === 'loans'
    );

    // Jobb: arbeidskontrakter
    const jobTypes = ['employment_contract', 'job_offer', 'job_accepted', 'job_completed', 'salary_failure', 'job_quit'];
    const jobMessages = messages.filter(m =>
      jobTypes.includes(m.type) || m.category === 'jobs'
    );

    // Bedrifter: meldinger fra bedrifter
    const businessMessages = messages.filter(m =>
      m.fromType === 'business' &&
      !loanTypes.includes(m.type) &&
      !jobTypes.includes(m.type) &&
      !systemTypes.includes(m.type)
    );

    // Elever: meldinger fra elever
    const studentMessages = messages.filter(m =>
      m.fromType === 'student' &&
      !loanTypes.includes(m.type) &&
      !jobTypes.includes(m.type) &&
      !systemTypes.includes(m.type)
    );

    // Oppdater kategori-badges
    this.updateTeacherCategoryBadge('System', systemMessages);
    this.updateTeacherCategoryBadge('Loans', loanMessages);
    this.updateTeacherCategoryBadge('Jobs', jobMessages);
    this.updateTeacherCategoryBadge('Businesses', businessMessages);
    this.updateTeacherCategoryBadge('Students', studentMessages);

    // Render kategoriene
    this.renderTeacherInboxCategory('System', systemMessages, 'systemmeldinger');
    this.renderTeacherInboxCategory('Loans', loanMessages, 'lånemeldinger');
    this.renderTeacherInboxCategory('Jobs', jobMessages, 'jobbmeldinger');
    this.renderTeacherInboxCategory('Businesses', businessMessages, 'meldinger fra bedrifter');
    this.renderTeacherInboxCategory('Students', studentMessages, 'meldinger fra elever');

    // Render utboks
    this.renderTeacherOutboxCategory('Outbox', outbox, 'sendte meldinger');

    // Fyll inn mottakere (elever i klasserommet + bedrifter)
    if (recipientSelect) {
      const classroom = classroomService.getClassroomByTeacher(user.id);
      const students = classroomService.getStudentsByClassroom(classroom?.id) || [];
      const businesses = classroom?.id ? businessService.getBusinessesByClassroom(classroom.id).filter(b => b.isActive !== false) : [];
      
      let options = `<option value="">${languageService.t('inbox.selectRecipient')}</option>`;
      options += `<option value="all">📢 ${languageService.t('common.allStudents')}</option>`;
      
      // Elever
      const studentGroup = document.getElementById('teacherStudentRecipientGroup');
      if (studentGroup) {
        studentGroup.label = `👤 ${languageService.t('common.students')}`;
        if (students.length > 0) {
          studentGroup.innerHTML = students.map(s => 
            `<option value="student:${s.id}">👤 ${escapeHtml(s.name)}</option>`
          ).join('');
        } else {
          studentGroup.innerHTML = `<option disabled>${languageService.t('inbox.noStudents')}</option>`;
        }
      }

      // Bedrifter
      const businessGroup = document.getElementById('teacherBusinessRecipientGroup');
      if (businessGroup) {
        businessGroup.label = `🏢 ${languageService.t('common.businesses')}`;
        if (businesses.length > 0) {
          businessGroup.innerHTML = businesses.map(b => 
            `<option value="business:${b.id}">${b.emoji || '🏢'} ${escapeHtml(b.name)}</option>`
          ).join('');
        } else {
          businessGroup.innerHTML = `<option disabled>${languageService.t('inbox.noBusinesses')}</option>`;
        }
      }
    }
  }

  /**
   * Oppdater badge for en lærerkategori
   */
  updateTeacherCategoryBadge(category, messages) {
    const unreadCount = messages.filter(m => !m.read).length;
    const badge = document.getElementById(`teacherInboxBadge${category}`);
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  /**
   * Render meldinger i en lærerkategori
   */
  renderTeacherInboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`teacherInboxCategory${category}`);
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('inbox.noMessagesPrefix')} ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    const sortedMessages = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = sortedMessages.map(msg => {
      const isSystem = category === 'System';
      const bgClass = msg.read ? 'bg-gray-50 border-gray-200' : (isSystem ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200');
      const textClass = msg.read ? 'text-gray-700' : (isSystem ? 'text-green-800' : 'text-blue-800');
      
      // Escape melding for JSON
      const msgData = JSON.stringify({
        id: msg.id,
        title: msg.title || languageService.t('inbox.message'),
        message: msg.message,
        fromName: msg.fromName || '',
        createdAt: msg.createdAt,
        type: msg.type || 'general'
      }).replace(/'/g, "\\'");
      
      return `
        <div class="p-3 rounded-lg border ${bgClass} cursor-pointer hover:shadow-md transition-shadow" onclick="window.econSim.openTeacherMessage('${msg.id}')">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm ${textClass}">${escapeHtml(msg.title || languageService.t('inbox.message'))}</span>
              ${msg.fromName ? `<span class="text-xs text-gray-500 block">${languageService.t('common.from')}: ${escapeHtml(msg.fromName)}</span>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
              <button onclick="event.stopPropagation(); window.econSim.deleteTeacherMessage('${msg.id}')" class="text-red-400 hover:text-red-600" title="${languageService.t('common.delete')}">🗑️</button>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message)}</p>
          ${!msg.read ? `<span class="inline-block mt-1 text-xs text-blue-600">● ${languageService.t('inbox.unread')}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Vis en lærerinnboks-kategori
   */
  showTeacherInboxCategory(category) {
    const categories = ['System', 'Loans', 'Jobs', 'Businesses', 'Students', 'Outbox'];
    const categoryMap = {
      'system': 'System',
      'loans': 'Loans',
      'jobs': 'Jobs',
      'businesses': 'Businesses',
      'students': 'Students',
      'outbox': 'Outbox'
    };
    const cat = categoryMap[category] || category;

    categories.forEach(c => {
      const container = document.getElementById(`teacherInboxCategory${c}`);
      const tab = document.getElementById(`teacherInboxTab${c}`);
      if (container && tab) {
        if (c === cat) {
          container.classList.remove('hidden');
          tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.remove('text-gray-500');
        } else {
          container.classList.add('hidden');
          tab.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.add('text-gray-500');
        }
      }
    });
  }

  /**
   * Render utboks for lærer (sendte meldinger) med lest-status
   */
  renderTeacherOutboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`teacherInboxCategory${category}`);
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">Ingen ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const readStatus = msg.recipientRead
        ? `<span class="text-green-500" title="Lest ${msg.recipientReadAt ? new Date(msg.recipientReadAt).toLocaleDateString('nb-NO') : ''}">✓ Lest</span>`
        : `<span class="text-gray-400" title="Ikke lest ennå">◯ Ulest</span>`;

      return `
        <div class="p-3 rounded-lg border bg-gray-50 border-gray-200">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm text-gray-700">${escapeHtml(msg.title)}</span>
              <span class="text-xs text-gray-500 block">Til: ${escapeHtml(msg.recipientName || 'Ukjent')}</span>
            </div>
            <div class="flex items-center gap-2">
              ${readStatus}
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message?.substring(0, 100) || '')}${msg.message?.length > 100 ? '...' : ''}</p>
        </div>
      `;
    }).join('');
  }

  /**
   * Slett en lærermelding
   */
  async deleteTeacherMessage(messageId) {
    if (!confirm(languageService.t('confirm.deleteMessage'))) return;

    try {
      await dataService.deleteMessage(messageId, 'messages');
      // Slett også utboks-kopien hvis den finnes
      await dataService.deleteOutboxForMessage(messageId);
      uiManager.showSuccess(languageService.t('msg.messageDeleted'));
    } catch (e) {
      console.error('Firebase feilet ved sletting av lærermelding:', e);
      uiManager.showError('Kunne ikke slette meldingen. Prøv igjen.');
    }

    await this.loadTeacherMessages();
  }

  /**
   * Send melding fra lærer
   */
  async sendTeacherMessage(e) {
    e.preventDefault();
    
    const user = authService.getCurrentUser();
    if (!user) return;
    
    const recipientValue = document.getElementById('teacherMessageRecipient').value;
    const title = document.getElementById('teacherMessageTitle').value.trim();
    const messageText = document.getElementById('teacherMessageText').value.trim();
    
    if (!recipientValue) {
      uiManager.showError(languageService.t('error.noStudentSelected'));
      return;
    }
    
    if (!title) {
      uiManager.showError(languageService.t('error.writeTitle'));
      return;
    }
    
    if (!messageText) {
      uiManager.showError(languageService.t('error.writeMessage'));
      return;
    }
    
    const classroom = classroomService.getClassroomByTeacher(user.id);
    const senderName = `👨‍🏫 ${user.name} (${languageService.t('role.teacher')})`;

    const sendToStudent = async (recipient) => {
      await dataService.createInboxMessage({
        recipientId: recipient.id,
        title: title,
        message: messageText,
        fromName: senderName,
        fromId: user.id,
        fromType: 'teacher',
        type: 'teacher_announcement'
      });
    };

    const sendToBusiness = async (businessId) => {
      await dataService.createBusinessMessage({
        businessId,
        senderId: user.id,
        senderName,
        senderType: 'teacher',
        fromType: 'teacher',
        title,
        message: messageText,
        type: 'teacher_announcement'
      });
    };

    let studentRecipients = [];
    let businessRecipients = [];

    if (recipientValue === 'all_students_businesses' || recipientValue === 'all') {
      studentRecipients = classroomService.getStudentsByClassroom(classroom?.id) || [];
      businessRecipients = businessService.getAllBusinesses().filter(b => b.status === 'active').map(b => b.id);
    } else if (recipientValue === 'all_students') {
      studentRecipients = classroomService.getStudentsByClassroom(classroom?.id) || [];
    } else if (recipientValue === 'all_businesses') {
      businessRecipients = businessService.getAllBusinesses().filter(b => b.status === 'active').map(b => b.id);
    } else if (recipientValue.startsWith('student:')) {
      const studentId = recipientValue.split(':')[1];
      const student = dataService.getUserById(studentId);
      if (student) studentRecipients = [student];
    } else {
      const student = dataService.getUserById(recipientValue);
      if (student) studentRecipients = [student];
    }

    if (studentRecipients.length === 0 && businessRecipients.length === 0) {
      uiManager.showError(languageService.t('error.noRecipientsFound'));
      return;
    }

    for (const recipient of studentRecipients) {
      await sendToStudent(recipient).catch(e => console.error(`Feil sending til ${recipient.name}:`, e));
    }
    for (const bizId of businessRecipients) {
      await sendToBusiness(bizId).catch(e => console.error(`Feil sending til bedrift ${bizId}:`, e));
    }

    document.getElementById('teacherMessageForm').reset();

    const totalCount = studentRecipients.length + businessRecipients.length;
    const msg = totalCount === 1 && studentRecipients.length === 1
      ? `${languageService.t('msg.messageSentTo')} ${studentRecipients[0].name}`
      : `Kunngjøring sendt til ${totalCount} mottakere`;
    uiManager.showSuccess(msg);
  }

  /**
   * Åpne lærermelding i modal
   */
  async openTeacherMessage(messageId) {
    const messages = await dataService.getTeacherMessages();
    const message = messages.find(m => m.id === messageId);

    if (!message) {
      uiManager.showError(languageService.t('error.messageNotFound'));
      return;
    }

    // Marker som lest
    if (!message.read) {
      try {
        await dataService.markMessageAsRead(messageId, 'messages');
        await this.loadTeacherMessages();
      } catch (e) {
        console.error('Firebase feilet ved markering av lærermelding som lest:', e);
      }
    }
    
    // Vis modal
    const modal = document.getElementById('messageViewModal');
    const titleEl = document.getElementById('messageViewTitle');
    const fromEl = document.getElementById('messageViewFrom');
    const dateEl = document.getElementById('messageViewDate');
    const contentEl = document.getElementById('messageViewContent');
    
    if (modal && titleEl && contentEl) {
      titleEl.textContent = message.title || languageService.t('inbox.message');
      if (fromEl) fromEl.textContent = message.fromName ? `${languageService.t('common.from')}: ${message.fromName}` : '';
      if (dateEl) dateEl.textContent = `${languageService.t('common.date')}: ${formatDate(new Date(message.createdAt))}`;
      contentEl.innerHTML = escapeHtml(message.message).replace(/\n/g, '<br>');
      
      // Lagre melding-info for svar (støtter både fromId/senderId varianter)
      this.currentMessageId = messageId;
      const msgSenderId = message.fromId || message.senderId;
      const msgSenderType = message.fromType || message.senderType;
      const msgSenderName = message.fromName || message.senderName;

      this.currentReplyContext = {
        type: 'teacher',
        originalMessage: message,
        senderId: msgSenderId,
        senderType: msgSenderType,
        senderName: msgSenderName
      };

      // Vis/skjul svar-knapp basert på meldingstype
      const noReplyTypes = ['system', 'system_alert', 'economy_report', 'weekly_report',
        'loan_contract', 'loan_payment_failed', 'loan_completed', 'loan_warning', 'salary_failure'];
      const replyBtn = document.getElementById('messageReplyBtn');
      if (replyBtn) {
        if (msgSenderId && msgSenderType && !noReplyTypes.includes(message.type)) {
          replyBtn.classList.remove('hidden');
        } else {
          replyBtn.classList.add('hidden');
        }
      }
      
      modal.classList.remove('hidden');
    }
  }

  /**
   * Marker lærermelding som lest
   */
  async markTeacherMessageAsRead(messageId) {
    try {
      await dataService.markMessageAsRead(messageId, 'messages');
      await this.loadTeacherMessages();
    } catch (e) {
      console.error('Firebase feilet ved markering av lærermelding som lest:', e);
    }
  }

  /**
   * Marker alle lærermeldinger som lest
   */
  async markAllTeacherMessagesAsRead() {
    const messages = await dataService.getTeacherMessages();

    try {
      for (const m of messages) {
        if (!m.read) {
          await dataService.markMessageAsRead(m.id, 'messages');
        }
      }
    } catch (e) {
      console.error('Firebase feilet ved markering av alle lærermeldinger som lest:', e);
    }

    await this.loadTeacherMessages();
    uiManager.showSuccess(languageService.t('msg.allMessagesRead'));
  }

  /**
   * Oppdater badge for lærermeldinger
   */
  async updateTeacherMessagesBadge() {
    const badge = document.getElementById('teacherMessagesBadge');
    const badge2 = document.getElementById('teacherMessagesBadge2');

    const messages = await dataService.getTeacherMessages();
    const unreadCount = messages.filter(m => !m.read).length;
    
    // Oppdater begge badges
    [badge, badge2].forEach(b => {
      if (!b) return;
      if (unreadCount > 0) {
        b.textContent = unreadCount > 9 ? '9+' : unreadCount;
        b.classList.remove('hidden');
      } else {
        b.classList.add('hidden');
      }
    });
  }

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

  // ============================================
  // STATISTIKK-FUNKSJONER
  // ============================================

  /**
   * Vis statistikkmodal for lærer
   */
  async showStatisticsModal() {
    try {
      const modal = document.getElementById('statisticsModal');
      if (!modal) return;
      
      modal.classList.remove('hidden');
      await this.loadStatisticsData();
    } catch (error) {
      console.error('Feil ved lasting av statistikk:', error);
      uiManager.showError(languageService.t('error.couldNotLoadStats'));
    }
  }

  /**
   * Last all statistikkdata
   */
  async loadStatisticsData() {
    const settings = await settingsService.getSettings();
    const currencySymbol = settings.currencySymbol || 'SKR';
    const students = await userService.getAllStudents();
    const transactions = await transactionService.getTransactions();
    const jobs = await jobService.getJobs();
    const loans = settings.loans?.enabled ? await loanService.getLoans() : [];
    const businessesEnabled = settings.businesses?.enabled || settings.enableBusinesses;
    const businesses = businessesEnabled ? await businessService.getBusinesses() : [];
    const taxData = await taxService.getTaxData();
    
    // Beregn økonomi-statistikk
    const totalMoney = students.reduce((sum, s) => sum + (s.balance || 0), 0);
    const avgBalance = students.length > 0 ? totalMoney / students.length : 0;
    
    // Beregn median
    const sortedBalances = students.map(s => s.balance || 0).sort((a, b) => a - b);
    const midIndex = Math.floor(sortedBalances.length / 2);
    const medianBalance = sortedBalances.length > 0 
      ? (sortedBalances.length % 2 !== 0 
        ? sortedBalances[midIndex] 
        : (sortedBalances[midIndex - 1] + sortedBalances[midIndex]) / 2)
      : 0;
    
    // Beregn Gini-koeffisient
    const gini = calculateGiniCoefficient(sortedBalances);
    
    // Oppdater UI-elementer
    document.getElementById('statsTotalMoney').textContent = formatCurrency(totalMoney, currencySymbol);
    document.getElementById('statsAvgBalance').textContent = formatCurrency(avgBalance, currencySymbol);
    document.getElementById('statsMedianBalance').textContent = formatCurrency(medianBalance, currencySymbol);
    document.getElementById('statsGiniCoeff').textContent = gini.toFixed(2);
    
    // Lånestatistikk
    const totalLoanAmount = loans.reduce((sum, l) => sum + (l.originalAmount || l.amount || 0), 0);
    const remainingLoan = loans.reduce((sum, l) => sum + (l.amount || 0), 0);
    const loanInterest = loans.reduce((sum, l) => sum + (l.totalInterest || 0), 0);
    const activeLoans = loans.filter(l => l.amount > 0).length;
    
    document.getElementById('statsLoanTotal').textContent = formatCurrency(totalLoanAmount, currencySymbol);
    document.getElementById('statsLoanRemaining').textContent = formatCurrency(remainingLoan, currencySymbol);
    document.getElementById('statsLoanInterest').textContent = formatCurrency(loanInterest, currencySymbol);
    document.getElementById('statsActiveLoans').textContent = activeLoans;
    
    // Bedriftsstatistikk
    const activeBusinesses = businesses.filter(b => b.status === 'active').length;
    const totalBusinessValue = businesses.reduce((sum, b) => sum + (b.capital || 0), 0);
    const totalEmployees = businesses.reduce((sum, b) => sum + (b.employees?.length || 0), 0);
    const totalSalaries = businesses.reduce((sum, b) => sum + ((b.employees?.length || 0) * (b.baseSalary || 0)), 0);
    
    document.getElementById('statsBusinessCount').textContent = activeBusinesses;
    document.getElementById('statsBusinessValue').textContent = formatCurrency(totalBusinessValue, currencySymbol);
    document.getElementById('statsBusinessEmployees').textContent = totalEmployees;
    document.getElementById('statsBusinessSalaries').textContent = formatCurrency(totalSalaries, currencySymbol);
    
    // Skattestatistikk
    const totalTaxCollected = taxData.history?.reduce((sum, h) => sum + (h.amount || 0), 0) || 0;
    const taxBalance = taxData.balance || 0;
    const taxSpent = taxData.spending?.reduce((sum, s) => sum + (s.amount || 0), 0) || 0;
    const avgTax = students.length > 0 ? totalTaxCollected / students.length : 0;
    
    document.getElementById('statsTaxCollected').textContent = formatCurrency(totalTaxCollected, currencySymbol);
    document.getElementById('statsTaxBalance').textContent = formatCurrency(taxBalance, currencySymbol);
    document.getElementById('statsTaxSpent').textContent = formatCurrency(taxSpent, currencySymbol);
    document.getElementById('statsAvgTax').textContent = formatCurrency(avgTax, currencySymbol);
    
    // Opprett elevtabell
    await this.renderStatsStudentTable(students, transactions, loans);
    
    // Tegn grafer
    this.renderStatisticsCharts(students, transactions, taxData);
  }

  /**
   * Render statistikktabell for elever
   */
  async renderStatsStudentTable(students, transactions, loans) {
    const tbody = document.getElementById('statsStudentTableBody');
    if (!tbody) return;
    
    const settings = await settingsService.getSettings();
    const currencySymbol = settings.currencySymbol || 'SKR';
    
    // Beregn inntekter/utgifter per elev
    const studentStats = students.map(student => {
      const studentTrans = transactions.filter(t => t.fromId === student.id || t.toId === student.id);
      const income = studentTrans
        .filter(t => t.toId === student.id && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      const expenses = studentTrans
        .filter(t => t.fromId === student.id && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      const savingsBalance = student.savingsBalance || 0;
      const loanAmount = loans.filter(l => l.borrowerId === student.id).reduce((sum, l) => sum + (l.principalAmount || l.amount || 0), 0);
      
      return {
        name: student.name,
        balance: student.balance || 0,
        income,
        expenses,
        savings: savingsBalance,
        loan: loanAmount
      };
    });
    
    // Sorter etter saldo (høyest først)
    studentStats.sort((a, b) => b.balance - a.balance);
    
    tbody.innerHTML = studentStats.map(s => `
      <tr class="border-b hover:bg-gray-50">
        <td class="py-2 px-3">${escapeHtml(s.name)}</td>
        <td class="py-2 px-3 text-right">${formatCurrency(s.balance, currencySymbol)}</td>
        <td class="py-2 px-3 text-right text-green-600">${formatCurrency(s.income, currencySymbol)}</td>
        <td class="py-2 px-3 text-right text-red-600">${formatCurrency(s.expenses, currencySymbol)}</td>
        <td class="py-2 px-3 text-right text-blue-600">${formatCurrency(s.savings, currencySymbol)}</td>
        <td class="py-2 px-3 text-right text-amber-600">${formatCurrency(s.loan, currencySymbol)}</td>
      </tr>
    `).join('');
  }

  /**
   * Tegn statistikk-grafer med Chart.js
   */
  renderStatisticsCharts(students, transactions, taxData) {
    // Destroy existing charts
    if (this._statsCharts) {
      Object.values(this._statsCharts).forEach(chart => chart?.destroy());
    }
    this._statsCharts = {};
    
    // 1. Formuefordeling (Bar Chart)
    const wealthCtx = document.getElementById('wealthChart')?.getContext('2d');
    if (wealthCtx) {
      const sortedStudents = [...students].sort((a, b) => (b.balance || 0) - (a.balance || 0));
      this._statsCharts.wealth = new Chart(wealthCtx, {
        type: 'bar',
        data: {
          labels: sortedStudents.slice(0, 15).map(s => s.name.split(' ')[0]),
          datasets: [{
            label: 'Saldo',
            data: sortedStudents.slice(0, 15).map(s => s.balance || 0),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
    
    // 2. Transaksjonsvolum per uke (Line Chart)
    const volumeCtx = document.getElementById('volumeChart')?.getContext('2d');
    if (volumeCtx) {
      const weeklyVolume = calculateWeeklyTransactionVolume(transactions);
      this._statsCharts.volume = new Chart(volumeCtx, {
        type: 'line',
        data: {
          labels: weeklyVolume.map(w => `Uke ${w.week}`),
          datasets: [{
            label: 'Transaksjoner',
            data: weeklyVolume.map(w => w.volume),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
    }
    
    // 3. Inntektsfordeling (Pie Chart)
    const incomeCtx = document.getElementById('incomeChart')?.getContext('2d');
    if (incomeCtx) {
      const incomeTypes = categorizeIncome(transactions);
      this._statsCharts.income = new Chart(incomeCtx, {
        type: 'doughnut',
        data: {
          labels: incomeTypes.labels,
          datasets: [{
            data: incomeTypes.values,
            backgroundColor: [
              'rgba(59, 130, 246, 0.7)',
              'rgba(34, 197, 94, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(139, 92, 246, 0.7)',
              'rgba(239, 68, 68, 0.7)'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }
    
    // 4. Skatteinntekter (Bar Chart)
    const taxCtx = document.getElementById('taxChart')?.getContext('2d');
    if (taxCtx) {
      const taxHistory = taxData.history || [];
      const last10 = taxHistory.slice(-10);
      this._statsCharts.tax = new Chart(taxCtx, {
        type: 'bar',
        data: {
          labels: last10.map((h, i) => `#${i + 1}`),
          datasets: [{
            label: languageService.t('stats.taxCollected'),
            data: last10.map(h => h.amount || 0),
            backgroundColor: 'rgba(139, 92, 246, 0.7)',
            borderColor: 'rgb(139, 92, 246)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  }

  /**
   * Print statistikk
   */
  printStatistics() {
    const content = document.getElementById('statisticsContent');
    if (!content) return;
    
    // Opprett et midlertidig print-vindu
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>EconSim Statistikk</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h2, h3, h4 { margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0; }
          .stat-box { text-align: center; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
          .stat-label { font-size: 12px; color: #666; }
          .stat-value { font-size: 18px; font-weight: bold; }
          canvas { max-width: 100%; height: auto !important; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h2>📈 EconSim Statistikk - ${new Date().toLocaleDateString('nb-NO')}</h2>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    
    // Vent på at innholdet lastes før print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }

  /**
   * Eksporter statistikk til Excel (CSV)
   */
  async exportStatisticsToExcel() {
    try {
      const students = await userService.getAllStudents();
      const transactions = await transactionService.getTransactions();
      const loans = await loanService.getLoans();
      
      // Opprett CSV-data
      let csv = '\ufeff'; // BOM for UTF-8
      csv += 'EconSim Statistikk - ' + new Date().toLocaleDateString('nb-NO') + '\n\n';
      
      // Elevoversikt
      csv += 'ELEVOVERSIKT\n';
      csv += 'Navn;Saldo;Total inntekt;Total utgift;Sparing;Lån\n';
      
      students.forEach(student => {
        const studentTrans = transactions.filter(t => t.fromId === student.id || t.toId === student.id);
        const income = studentTrans
          .filter(t => t.toId === student.id && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0);
        const expenses = studentTrans
          .filter(t => t.fromId === student.id && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0);
        const loanAmount = loans.filter(l => l.borrowerId === student.id).reduce((sum, l) => sum + (l.principalAmount || l.amount || 0), 0);
        
        csv += `${student.name};${student.balance || 0};${income};${expenses};${student.savingsBalance || 0};${loanAmount}\n`;
      });
      
      csv += '\n';
      
      // Oppsummering
      const totalMoney = students.reduce((sum, s) => sum + (s.balance || 0), 0);
      const avgBalance = students.length > 0 ? totalMoney / students.length : 0;
      
      csv += 'OPPSUMMERING\n';
      csv += `Total pengemengde;${totalMoney}\n`;
      csv += `Gjennomsnittlig saldo;${avgBalance.toFixed(2)}\n`;
      csv += `Antall elever;${students.length}\n`;
      csv += `Antall transaksjoner;${transactions.length}\n`;
      csv += `Aktive lån;${loans.filter(l => l.amount > 0).length}\n`;
      
      // Last ned fil
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `econsim-statistikk-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      uiManager.showSuccess(languageService.t('msg.statsExportedCsv'));
    } catch (error) {
      console.error('Feil ved eksport:', error);
      uiManager.showError(languageService.t('error.exportFailed'));
    }
  }

  /**
   * Vis statistikkmodal for elev
   */
  async showStudentStatistics() {
    try {
      const modal = document.getElementById('studentStatisticsModal');
      if (!modal) return;
      
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;
      
      modal.classList.remove('hidden');
      await this.loadStudentStatisticsData(currentUser);
    } catch (error) {
      console.error('Feil ved lasting av elevstatistikk:', error);
      uiManager.showError(languageService.t('error.couldNotLoadStats'));
    }
  }

  /**
   * Last statistikkdata for elev
   */
  async loadStudentStatisticsData(student) {
    const settings = await settingsService.getSettings();
    const currencySymbol = settings.currencySymbol || 'SKR';
    const transactions = await transactionService.getStudentTransactions(student.id);
    
    // Beregn inntekter og utgifter
    let totalIncome = 0;
    let totalExpenses = 0;
    let wageIncome = 0;
    let taxPaid = 0;
    
    const expenseCategories = {
      'Overføringer': 0,
      'Lån': 0,
      'Bedrift': 0,
      'Skatt': 0,
      'Annet': 0
    };
    
    transactions.forEach(t => {
      if (t.toId === student.id && t.amount > 0) {
        totalIncome += t.amount;
        const desc = (t.description || '').toLowerCase();
        if (desc.includes('lønn') || desc.includes('salary')) {
          wageIncome += t.amount;
        }
      }
      if (t.fromId === student.id && t.amount > 0) {
        totalExpenses += t.amount;
        const desc = (t.description || '').toLowerCase();
        if (desc.includes('skatt') || desc.includes('tax')) {
          taxPaid += t.amount;
          expenseCategories['Skatt'] += t.amount;
        } else if (desc.includes('lån') || desc.includes('loan') || desc.includes('nedbetaling')) {
          expenseCategories['Lån'] += t.amount;
        } else if (desc.includes('bedrift') || desc.includes('business')) {
          expenseCategories['Bedrift'] += t.amount;
        } else if (desc.includes('overføring') || desc.includes('transfer')) {
          expenseCategories['Overføringer'] += t.amount;
        } else {
          expenseCategories['Annet'] += t.amount;
        }
      }
    });
    
    // Oppdater UI med riktig valutasymbol
    document.getElementById('studentStatsIncome').textContent = formatCurrency(totalIncome, currencySymbol);
    document.getElementById('studentStatsExpenses').textContent = formatCurrency(totalExpenses, currencySymbol);
    document.getElementById('studentStatsSavings').textContent = formatCurrency(student.savingsBalance || 0, currencySymbol);
    document.getElementById('studentStatsAvailable').textContent = formatCurrency(student.balance || 0, currencySymbol);
    
    // Detaljer
    const wagesEl = document.getElementById('studentStatsWages');
    const taxEl = document.getElementById('studentStatsTaxPaid');
    if (wagesEl) wagesEl.textContent = formatCurrency(wageIncome, currencySymbol);
    if (taxEl) taxEl.textContent = formatCurrency(taxPaid, currencySymbol);
    
    // Tegn utgifts-pie chart
    this.renderStudentExpenseChart(expenseCategories);
  }

  /**
   * Tegn utgiftsfordeling for elev
   */
  renderStudentExpenseChart(categories) {
    const ctx = document.getElementById('studentPieChart')?.getContext('2d');
    if (!ctx) return;
    
    // Destroy existing chart
    if (this._studentPieChart) {
      this._studentPieChart.destroy();
    }
    
    const labels = Object.keys(categories).filter(k => categories[k] > 0);
    const values = labels.map(k => categories[k]);
    
    if (values.length === 0) {
      // No expenses yet
      return;
    }
    
    this._studentPieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(139, 92, 246, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(107, 114, 128, 0.7)'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  /**
   * Oppdater brukernavn-feltet når fornavn/etternavn endres
   */
  async updateGeneratedUsername() {
    const firstName = document.getElementById('newStudentFirstName')?.value?.trim();
    const lastName = document.getElementById('newStudentLastName')?.value?.trim();
    const usernameField = document.getElementById('newStudentUsername');
    
    if (!firstName || !lastName || firstName.length < 2 || lastName.length < 2) {
      if (usernameField) usernameField.value = '';
      return;
    }
    
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return;
    
    const teacherName = currentUser.name.split(' ')[0]; // Bare fornavn
    const username = await generateUniqueUsernameUtil(teacherName, firstName, lastName, dataService);
    
    if (usernameField) {
      usernameField.value = username;
    }
  }

  /**
   * Legg til ny elev (med debounce for å forhindre doble klikk)
   */
  async addNewStudent() {
    // Forhindre doble klikk
    if (this._addingStudent) {
      console.log('⏳ Elev-opprettelse pågår allerede...');
      return;
    }
    this._addingStudent = true;

    try {
      const firstName = document.getElementById('newStudentFirstName')?.value?.trim();
      const lastName = document.getElementById('newStudentLastName')?.value?.trim();

      if (!firstName || !lastName) {
        uiManager.showError(languageService.t('error.fillAllFields'));
        this._addingStudent = false;
        return;
      }

      if (firstName.length < 2 || lastName.length < 2) {
        uiManager.showError(languageService.t('error.firstLastNameMin2Chars'));
        this._addingStudent = false;
        return;
      }

      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        uiManager.showError(languageService.t('error.mustBeLoggedIn'));
        this._addingStudent = false;
        return;
      }

      // Generer unikt brukernavn og tilfeldig passord
      const teacherName = currentUser.name.split(' ')[0];
      const username = await generateUniqueUsernameUtil(teacherName, firstName, lastName, dataService);
      const password = emailService.generatePassword();

      // Fullt navn
      const fullName = `${firstName} ${lastName}`;

      // La userService håndtere kontonummer og klasseromskobling
      const newStudent = await userService.addStudent({
        name: fullName,
        username,
        password,
        initialPassword: password   // Lagres i klartekst for print-liste
        // accountNumber genereres automatisk i userService
      });

      uiManager.showSuccess(`${languageService.t('msg.studentCreated')} ${fullName}!\n${languageService.t('common.username')}: ${username}`);

      // Tøm feltene
      document.getElementById('newStudentFirstName').value = '';
      document.getElementById('newStudentLastName').value = '';
      document.getElementById('newStudentUsername').value = '';

      // Refresh elevliste i modal OG hovedsiden
      await this.showStudentAdminModal();
      await this.refreshTeacherDashboard();
    } catch (error) {
      console.error('Feil ved opprettelse av elev:', error);
      uiManager.showError(error.message);
    } finally {
      // Alltid reset debounce-flagget
      this._addingStudent = false;
    }
  }

  /**
   * Bekreft sletting av elev
   */
  async confirmDeleteStudent(studentId, studentName) {
    if (confirm(`${languageService.t('confirm.deleteStudentName')} ${studentName}?\n\n${languageService.t('confirm.dataWillBeKept')}`)) {
      await this.deleteStudent(studentId);
    }
  }

  /**
   * Slett elev
   */
  async deleteStudent(studentId) {
    try {
      await userService.deleteStudent(studentId);
      uiManager.showSuccess(languageService.t('msg.studentRemoved'));

      // Refresh elevliste i innstillinger-modal
      const students = await userService.getAllStudents();
      this.renderStudentList(students);

      // Refresh elevoversikt på dashboardet
      await this.loadStudentsTable();

      // Refresh andre steder som viser elever
      await this.refreshTeacherDashboard();
    } catch (error) {
      console.error('Feil ved sletting av elev:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Print-liste over elever med innloggingsinformasjon
   */
  async printStudentList() {
    try {
      const students = await userService.getAllStudents();
      const classroom = this.currentClassroom;
      const className = classroom?.className || languageService.t('teacher.myClassroom');
      const currency = this.settings?.currencySymbol || 'KKr';
      const date = new Date().toLocaleDateString('nb-NO');

      const rows = students.map(s => {
        const pwd = s.initialPassword || `(${languageService.t('teacher.passwordChangedByStudent') || 'endret av elev'})`;
        return `<tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:6px 10px;">${escapeHtml(s.name)}</td>
          <td style="padding:6px 10px;">${s.accountNumber}</td>
          <td style="padding:6px 10px;">${escapeHtml(s.username)}</td>
          <td style="padding:6px 10px;">${pwd}</td>
        </tr>`;
      }).join('');

      const win = window.open('', '_blank', 'width=800,height=600');
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>EconSim – ${escapeHtml(className)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h2 { margin-bottom: 4px; }
          p { color: #666; margin-bottom: 16px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
          @media print { button { display: none; } }
        </style></head><body>
        <h2>EconSim – ${escapeHtml(className)}</h2>
        <p>${date} &nbsp;|&nbsp; ${students.length} elever &nbsp;|&nbsp; Valuta: ${currency}</p>
        <table>
          <thead><tr>
            <th>Navn</th><th>Kontonr.</th><th>Brukernavn</th><th>Passord</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <br>
        <button onclick="window.print()" style="padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Skriv ut</button>
      </body></html>`);
      win.document.close();
    } catch (error) {
      console.error('Feil ved print-liste:', error);
      uiManager.showError(error.message);
    }
  }

  // ==================== E-POST OG PASSORDGJENOPPRETTING ====================

  /**
   * Oppdater e-post verifikasjonsstatus i UI
   */
  async updateEmailVerificationStatus(user) {
    const notVerifiedEl = document.getElementById('emailNotVerified');
    const verifiedEl = document.getElementById('emailVerified');
    const pendingEl = document.getElementById('emailPending');
    const verifyBtn = document.getElementById('verifyEmailBtn');

    // Skjul alle først
    if (notVerifiedEl) notVerifiedEl.classList.add('hidden');
    if (verifiedEl) verifiedEl.classList.add('hidden');
    if (pendingEl) pendingEl.classList.add('hidden');

    if (!user) return;

    // Sjekk verifikasjonsstatus
    const verified = await emailService.getVerifiedEmail(user.id);
    const pending = await emailService.getPendingVerification(user.id);

    if (verified) {
      if (verifiedEl) verifiedEl.classList.remove('hidden');
      if (verifyBtn) {
        verifyBtn.textContent = 'Bekreftet ✓';
        verifyBtn.disabled = true;
        verifyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        verifyBtn.classList.add('bg-green-600', 'cursor-not-allowed');
      }
    } else if (pending) {
      if (pendingEl) pendingEl.classList.remove('hidden');
      if (verifyBtn) {
        verifyBtn.textContent = 'Send på nytt';
        verifyBtn.disabled = false;
      }
    } else {
      if (notVerifiedEl && user.email) notVerifiedEl.classList.remove('hidden');
      if (verifyBtn) {
        verifyBtn.textContent = 'Bekreft e-post';
        verifyBtn.disabled = false;
        verifyBtn.classList.remove('bg-green-600', 'cursor-not-allowed');
        verifyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      }
    }
  }

  /**
   * Send e-postbekreftelse
   */
  async sendEmailVerification() {
    const user = authService.getCurrentUser();
    if (!user) {
      uiManager.showError('Du må være logget inn');
      return;
    }

    const emailEl = document.getElementById('settingsTeacherEmail');
    const email = emailEl?.value?.trim();

    if (!email) {
      uiManager.showError('Skriv inn e-postadressen din først');
      return;
    }

    // Enkel e-postvalidering
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      uiManager.showError('Ugyldig e-postadresse');
      return;
    }

    try {
      // Lagre e-post på brukeren
      await dataService.updateUser(user.id, { email });
      await authService.refreshCurrentUser();

      // Opprett verifikasjon
      const result = await emailService.createEmailVerification(user.id, email);
      const verifyUrl = result.verifyUrl;

      // Send e-post via Cloud Function
      const emailSent = await emailService.sendVerificationEmail(email, verifyUrl);

      if (emailSent) {
        uiManager.showSuccess(languageService.t('email.verificationSent') || `Bekreftelseslenke sendt til ${email}!`);
      } else {
        // Fallback: Vis lenken direkte hvis e-post feiler
        uiManager.showInfo(languageService.t('email.verificationCreated') || 'Bekreftelseslenke opprettet');
        const message = `📧 E-post kunne ikke sendes.\n\nKlikk på lenken for å bekrefte:\n${verifyUrl}\n\nLenken er gyldig i 24 timer.`;
        alert(message);
      }

      // Oppdater status
      await this.updateEmailVerificationStatus(user);
    } catch (error) {
      console.error('Feil ved sending av bekreftelse:', error);
      uiManager.showError(languageService.t('error.couldNotSendVerification') || 'Kunne ikke sende bekreftelse. Prøv igjen.');
    }
  }

  /**
   * Vis glemt passord modal
   */
  showForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    const resultEl = document.getElementById('forgotPasswordResult');
    const emailEl = document.getElementById('forgotPasswordEmail');

    if (modal) {
      modal.classList.remove('hidden');
    }
    if (resultEl) {
      resultEl.classList.add('hidden');
    }
    if (emailEl) {
      emailEl.value = '';
    }
  }

  /**
   * Be om passordgjenoppretting
   */
  async requestPasswordReset() {
    const emailEl = document.getElementById('forgotPasswordEmail');
    const resultEl = document.getElementById('forgotPasswordResult');
    const email = emailEl?.value?.trim();

    if (!email) {
      uiManager.showError('Skriv inn e-postadressen din');
      return;
    }

    // Enkel e-postvalidering
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      uiManager.showError('Ugyldig e-postadresse');
      return;
    }

    try {
      // Vis "sender..."-melding
      if (resultEl) {
        resultEl.innerHTML = `<p class="text-blue-600">📧 Sender e-post...</p>`;
        resultEl.classList.remove('hidden', 'bg-red-50', 'bg-green-50');
        resultEl.classList.add('bg-blue-50');
      }

      const result = await emailService.requestPasswordReset(email);

      if (!result.success) {
        if (resultEl) {
          resultEl.innerHTML = `<p class="text-red-600">❌ ${result.error}</p>`;
          resultEl.classList.remove('hidden', 'bg-blue-50');
          resultEl.classList.add('bg-red-50');
          resultEl.classList.remove('bg-green-50');
        }
        return;
      }

      // Oppdater brukerens passord i Firebase
      await dataService.updateUser(result.userId, {
        password: await hashPassword(result.newPassword)
      });

      // Send nytt passord via e-post
      const emailSent = await emailService.sendPasswordResetEmail(result.email, result.newPassword);

      // Marker reset som brukt
      await emailService.usePasswordReset(result.resetId);

      // Vis suksessmelding (uten å vise passordet)
      if (resultEl) {
        if (emailSent) {
          resultEl.innerHTML = `
            <div class="text-green-700">
              <p class="font-bold mb-2">✅ Nytt passord sendt!</p>
              <p class="mb-2">Et nytt passord er sendt til:</p>
              <p class="bg-white border-2 border-green-300 rounded p-3 font-medium text-center">${escapeHtml(result.email)}</p>
              <p class="text-sm mt-2">Sjekk innboksen din (og spam-mappen) og bruk det nye passordet for å logge inn.</p>
            </div>
          `;
        } else {
          // E-post feilet, men passord ble oppdatert
          resultEl.innerHTML = `
            <div class="text-yellow-700">
              <p class="font-bold mb-2">⚠️ Passord oppdatert, men e-post kunne ikke sendes</p>
              <p class="text-sm">Kontakt administrator for å få ditt nye passord.</p>
            </div>
          `;
          resultEl.classList.remove('bg-green-50');
          resultEl.classList.add('bg-yellow-50');
        }
        resultEl.classList.remove('hidden', 'bg-red-50', 'bg-blue-50');
        if (emailSent) resultEl.classList.add('bg-green-50');
      }
    } catch (error) {
      console.error('Feil ved passordgjenoppretting:', error);
      if (resultEl) {
        resultEl.innerHTML = `<p class="text-red-600">❌ Noe gikk galt. Prøv igjen.</p>`;
        resultEl.classList.remove('hidden', 'bg-blue-50');
        resultEl.classList.add('bg-red-50');
      }
    }
  }

  /**
   * Sjekk URL for e-postbekreftelsestoken
   */
  async checkEmailVerificationToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('verify');

    if (!verifyToken) return;

    try {
      const result = await emailService.verifyEmail(verifyToken);
      const modal = document.getElementById('emailVerifyModal');
      const successEl = document.getElementById('emailVerifySuccess');
      const errorEl = document.getElementById('emailVerifyError');

      if (result.success) {
        if (successEl) successEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
      } else {
        if (successEl) successEl.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
      }

      if (modal) modal.classList.remove('hidden');

      // Fjern token fra URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Feil ved e-postverifisering:', error);
    }
  }
}

// Slå sammen feature controllers inn på EconSimApp.prototype slik at
// `this.*`-semantikk og inline `window.econSim.method()`-kall fortsatt virker.
Object.assign(
  EconSimApp.prototype,
  savingsControllerMethods,
  taxesControllerMethods,
  classroomControllerMethods,
  i18nControllerMethods,
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


/**
 * Main Application Entry Point
 * Initialiserer og starter hele applikasjonen
 */

import { dataService } from './core/dataService.js';
import { authService } from './core/auth.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { uiManager } from './ui/uiManager.js';
import { transactionService } from './services/transactionService.js';
import { jobService } from './services/jobService.js';
import { userService } from './services/userService.js';
import { settingsService } from './services/settingsService.js';
import { formatCurrency, formatDate, formatRelativeTime } from './utils/formatters.js';
import { APP_CONFIG } from './config.js';

/**
 * Main App Class
 */
class EconSimApp {
  constructor() {
    this.settings = null;
    this.refreshInterval = null;
  }

  /**
   * Initialiser applikasjonen
   */
  async init() {
    try {
      console.log('🚀 EconSim starter...');

      // Initialiser UI manager
      uiManager.init();

      // Initialiser dataservice
      await dataService.initialize();

      // Hent innstillinger
      this.settings = await settingsService.getSettings();
      console.log('⚙️ Innstillinger lastet:', this.settings);

      // Initialiser auth og sjekk om bruker allerede er logget inn
      const user = await authService.initialize();
      
      if (user) {
        console.log('✅ Bruker allerede logget inn:', user.name);
        // Vis riktig dashboard
        if (user.type === 'teacher') {
          await this.showTeacherDashboard();
        } else {
          await this.showStudentDashboard();
        }
      } else {
        // Vis login screen
        console.log('📝 Viser login-skjerm');
      }

      // Setup event listeners
      this.setupEventListeners();

      console.log('✨ EconSim klar!');
    } catch (error) {
      console.error('❌ Feil ved initialisering:', error);
      uiManager.showError('Feil ved oppstart av applikasjon');
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

    // Logout button
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="logout"]')) {
        this.handleLogout();
      }
    });

    // Transfer money form
    const transferForm = document.getElementById('transferForm');
    if (transferForm) {
      transferForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleTransfer();
      });
    }

    // Listen to balance updates
    eventBus.on(EVENTS.BALANCE_UPDATED, () => {
      this.updateBalanceDisplay();
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
  }

  /**
   * Håndter login
   */
  async handleLogin() {
    const username = document.getElementById('username')?.value;
    const password = document.getElementById('password')?.value;

    try {
      const user = await authService.login(username, password);
      console.log('✅ Logget inn som:', user.name);
      
      // Form cleares automatically on success
      document.getElementById('loginForm')?.reset();
      
      // Vis riktig dashboard
      if (user.type === 'teacher') {
        await this.showTeacherDashboard();
      } else {
        await this.showStudentDashboard();
      }
    } catch (error) {
      console.error('Login feilet:', error);
      uiManager.showError(error.message || 'Feil brukernavn eller passord');
    }
  }

  /**
   * Vis student dashboard
   */
  async showStudentDashboard() {
    const user = authService.getCurrentUser();
    
    // Skjul login, vis student dashboard
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('studentDashboard').classList.remove('hidden');
    
    // Fyll inn brukerinfo
    document.getElementById('studentName').textContent = user.name;
    document.getElementById('studentAccountNumber').textContent = user.accountNumber;
    document.getElementById('studentBalance').textContent = formatCurrency(user.balance, this.settings.currencySymbol);
    
    // Vis oversikt som standard
    this.showStudentScreen('overview');
    
    // Last transaksjoner og oppsummering
    await this.loadStudentTransactions();
    await this.loadStudentActiveJobsSummary();
  }

  /**
   * Last sammendrag av aktive jobber for elev
   */
  async loadStudentActiveJobsSummary() {
    const user = authService.getCurrentUser();
    const allJobs = await jobService.getJobs();
    const myActiveJobs = allJobs.filter(job => job.status === 'active' && job.assignedTo === user.id);
    
    const container = document.getElementById('studentActiveJobsSummary');
    if (!container) return;
    
    if (myActiveJobs.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Ingen aktive jobber</p>';
    } else {
      container.innerHTML = myActiveJobs.map(job => `
        <div class="p-2 bg-gray-50 rounded">
          <p class="font-medium text-sm">${job.title}</p>
          <p class="text-xs text-green-600">${formatCurrency(job.salary, this.settings.currencySymbol)}/måned</p>
        </div>
      `).join('');
    }
  }

  /**
   * Vis teacher dashboard
   */
  async showTeacherDashboard() {
    const user = authService.getCurrentUser();
    
    // Skjul login, vis teacher dashboard
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('teacherDashboard').classList.remove('hidden');
    
    // Fyll inn brukerinfo
    document.getElementById('teacherName').textContent = user.name;
    
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
   * Refresh lærer dashboard
   */
  async refreshTeacherDashboard() {
    const user = authService.getCurrentUser();
    if (!user || user.type !== 'teacher') return;
    
    // Oppdater eleveoversikt
    await this.loadStudentsTable();
    
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
    uiManager.confirm('Er du sikker på at du vil logge ut?', () => {
      authService.logout();
      console.log('✅ Logget ut');
      
      // Vis login screen
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('studentDashboard').classList.add('hidden');
      document.getElementById('teacherDashboard').classList.add('hidden');
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

    try {
      await transactionService.transferMoney(accountNumber, parseFloat(amount), message);
      uiManager.showSuccess('Penger overført!');
      form?.reset();
      
      // Oppdater saldo og transaksjoner umiddelbart
      await this.refreshStudentDashboard();
    } catch (error) {
      console.error('Overføring feilet:', error);
      uiManager.showError(error.message);
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

    const balanceEl = document.getElementById('currentBalance');
    if (balanceEl && updatedUser) {
      balanceEl.textContent = formatCurrency(updatedUser.balance, this.settings.currencySymbol);
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
   * Render transaksjoner
   */
  renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    if (!container) return;

    if (transactions.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-4">Ingen transaksjoner ennå</p>';
      return;
    }

    const currentUser = authService.getCurrentUser();
    
    container.innerHTML = transactions.map(tx => {
      const isSender = tx.senderId === currentUser.id;
      const isRecipient = tx.recipientId === currentUser.id;
      const amountClass = isSender ? 'text-red-600' : 'text-green-600';
      const amountPrefix = isSender ? '-' : '+';

      return `
        <div class="border-b border-gray-200 py-3">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900">
                ${isSender ? `Til ${tx.recipientName}` : `Fra ${tx.senderName}`}
              </p>
              ${tx.message ? `<p class="text-sm text-gray-500 mt-1">${tx.message}</p>` : ''}
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
      const transactions = await transactionService.getUserTransactions(10);
      const container = document.getElementById('studentTransactions');
      
      if (!container) return;
      
      if (transactions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Ingen transaksjoner ennå</p>';
        return;
      }
      
      const user = authService.getCurrentUser();
      container.innerHTML = transactions.map(tx => {
        const isSender = tx.senderId === user.id;
        const amountClass = isSender ? 'text-red-600' : 'text-green-600';
        const amountPrefix = isSender ? '-' : '+';
        
        return `
          <div class="flex justify-between items-center border-b border-gray-100 py-2">
            <div class="flex-1">
              <p class="text-sm font-medium">${isSender ? tx.recipientName : tx.senderName}</p>
              ${tx.message ? `<p class="text-sm text-gray-600 mt-1">${tx.message}</p>` : ''}
              <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
            </div>
            <div class="text-right ml-4">
              <p class="${amountClass} font-semibold">${amountPrefix}${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Feil ved lasting av transaksjoner:', error);
    }
  }

  /**
   * Last lærer transaksjoner
   */
  async loadTeacherTransactions() {
    try {
      const transactions = await transactionService.getAllTransactions(20);
      const container = document.getElementById('teacherTransactions');
      
      if (!container) return;
      
      if (transactions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Ingen transaksjoner ennå</p>';
        return;
      }
      
      container.innerHTML = transactions.map(tx => {
        return `
          <div class="border-b border-gray-100 py-3">
            <div class="flex justify-between items-start mb-1">
              <div class="flex-1">
                <p class="text-sm font-medium">
                  ${tx.senderName} → ${tx.recipientName}
                </p>
                ${tx.message ? `<p class="text-sm text-gray-600 mt-1">${tx.message}</p>` : ''}
                <p class="text-xs text-gray-400 mt-1">${formatRelativeTime(tx.timestamp)}</p>
              </div>
              <div class="text-right ml-4">
                <p class="text-blue-600 font-semibold">${formatCurrency(tx.amount, this.settings.currencySymbol)}</p>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (error) {
      console.error('Feil ved lasting av lærer-transaksjoner:', error);
    }
  }

  /**
   * Last lærer jobber (alle kategorier)
   */
  async loadTeacherJobs() {
    try {
      console.log('🔄 Laster lærer-jobber...');
      const allJobs = await jobService.getJobs();
      console.log('📋 Totalt', allJobs.length, 'jobber hentet:', allJobs);
      
      // Tilgjengelige (ledige) - sortert med nyeste først
      const availableJobs = allJobs
        .filter(job => job.status === 'active' && !job.assignedTo)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      console.log('🆓 Tilgjengelige jobber:', availableJobs.length);
      const availableContainer = document.getElementById('teacherAvailableJobs');
      if (availableContainer) {
        if (availableJobs.length === 0) {
          availableContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen ledige jobber</p>';
        } else {
          availableContainer.innerHTML = availableJobs.map(job => this.renderTeacherJobCard(job, 'available')).join('');
        }
      }

      // Aktive (ansatte) - sortert med nyest tildelt først
      const activeJobs = allJobs
        .filter(job => job.status === 'active' && job.assignedTo)
        .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt));
      console.log('⚙️ Aktive jobber:', activeJobs.length);
      const activeContainer = document.getElementById('teacherActiveJobs');
      if (activeContainer) {
        if (activeJobs.length === 0) {
          activeContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen aktive jobber</p>';
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
          completedContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen avsluttede jobber</p>';
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
    const typeLabel = job.type === 'project' ? '📋 Prosjekt' : '🔄 Fast';
    
    // Hent antall søknader for denne jobben (synkront fra localStorage)
    const allApplications = dataService._getFromStorage('econsim_applications') || [];
    const applications = allApplications.filter(app => app.jobId === job.id);
    const applicationCount = applications.length;
    
    return `
      <div class="border border-gray-200 rounded-lg p-4">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <h4 class="font-semibold text-lg">${job.title}</h4>
            <p class="text-sm text-gray-600">${job.description || 'Ingen beskrivelse'}</p>
          </div>
          <span class="text-xs bg-gray-100 px-2 py-1 rounded">${typeLabel}</span>
        </div>
        <p class="text-sm font-medium text-green-600 mb-2">${formatCurrency(job.salary, this.settings.currencySymbol)}/måned</p>
        ${job.assignedToName ? `<p class="text-sm text-gray-600 mb-3">👤 ${job.assignedToName}</p>` : ''}
        
        <div class="flex flex-col gap-2">
          <div class="flex gap-2">
            ${category === 'active' ? `
              <button onclick="window.econSim.payJobSalary('${job.id}')" 
                class="flex-1 text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded">
                💰 Betal lønn
              </button>
              <button onclick="window.econSim.endJob('${job.id}')" 
                class="flex-1 text-sm bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded">
                ✅ Avslutt
              </button>
            ` : ''}
            ${category === 'completed' ? `
              <button onclick="window.econSim.republishJob('${job.id}')" 
                class="flex-1 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded">
                ♻️ Legg ut på nytt
              </button>
            ` : ''}
            ${category === 'available' ? `
              <button onclick="window.econSim.deleteJob('${job.id}')" 
                class="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded">
                🗑️ Slett
              </button>
            ` : ''}
          </div>
          
          ${category !== 'completed' ? `
            <div class="flex gap-2">
              <button onclick="window.econSim.showEditJobModal('${job.id}')" 
                class="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded">
                ✏️ Rediger
              </button>
              ${category === 'available' ? `
                <button onclick="window.econSim.showApplications('${job.id}')" 
                  class="flex-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded">
                  📋 Se søknader ${applicationCount > 0 ? `(${applicationCount})` : ''}
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Last elev jobber (alle kategorier)
   */
  async loadStudentJobs() {
    try {
      const user = authService.getCurrentUser();
      const allJobs = await jobService.getJobs();
      
      // Tilgjengelige (ledige) - sortert med nyeste først
      const availableJobs = allJobs
        .filter(job => job.status === 'active' && !job.assignedTo)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const availableContainer = document.getElementById('studentAvailableJobs');
      if (availableContainer) {
        if (availableJobs.length === 0) {
          availableContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen ledige jobber akkurat nå</p>';
        } else {
          availableContainer.innerHTML = availableJobs.map(job => this.renderStudentJobCard(job, 'available')).join('');
        }
      }

      // Mine aktive jobber - sortert med nyest tildelt først
      const myActiveJobs = allJobs
        .filter(job => job.status === 'active' && job.assignedTo === user.id)
        .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt));
      const activeContainer = document.getElementById('studentActiveJobs');
      const activeSummary = document.getElementById('studentActiveJobsSummary');
      
      const activeHTML = myActiveJobs.length === 0 
        ? '<p class="text-gray-500 text-sm">Ingen aktive jobber</p>'
        : myActiveJobs.map(job => this.renderStudentJobCard(job, 'active')).join('');
      
      if (activeContainer) activeContainer.innerHTML = activeHTML;
      if (activeSummary) activeSummary.innerHTML = activeHTML;

      // Tidligere jobber - sortert med nyest avsluttet først
      const previousJobs = allJobs
        .filter(job => job.status === 'completed' && job.assignedTo === user.id)
        .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt));
      const previousContainer = document.getElementById('studentPreviousJobs');
      if (previousContainer) {
        if (previousJobs.length === 0) {
          previousContainer.innerHTML = '<p class="text-gray-500 text-sm">Ingen tidligere jobber</p>';
        } else {
          previousContainer.innerHTML = previousJobs.map(job => this.renderStudentJobCard(job, 'previous')).join('');
        }
      }
    } catch (error) {
      console.error('Feil ved lasting av jobber:', error);
    }
  }

  /**
   * Render elev jobb-kort
   */
  renderStudentJobCard(job, category) {
    const typeLabel = job.type === 'project' ? '📋 Prosjekt' : '🔄 Fast';
    
    // Sjekk om eleven har søkt på denne jobben (synkront fra localStorage)
    const user = authService.getCurrentUser();
    const allApplications = dataService._getFromStorage('econsim_applications') || [];
    const myApplication = allApplications.find(app => app.jobId === job.id && app.applicantId === user.id);
    const hasApplied = !!myApplication;
    
    return `
      <div class="border border-gray-200 rounded-lg p-4">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <h4 class="font-semibold text-lg">${job.title}</h4>
            <p class="text-sm text-gray-600">${job.description || 'Ingen beskrivelse'}</p>
          </div>
          <span class="text-xs bg-gray-100 px-2 py-1 rounded">${typeLabel}</span>
        </div>
        <p class="text-sm font-medium text-green-600">${formatCurrency(job.salary, this.settings.currencySymbol)}/måned</p>
        
        ${category === 'available' ? `
          ${hasApplied ? `
            <div class="mt-3 space-y-2">
              <button disabled 
                class="w-full bg-gray-400 text-white px-3 py-2 rounded cursor-not-allowed">
                ✅ Søknad sendt
              </button>
              <button onclick="window.econSim.showEditApplicationModal('${job.id}')" 
                class="w-full bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm">
                ✏️ Endre søknad
              </button>
            </div>
          ` : `
            <button onclick="window.econSim.showApplicationModal('${job.id}')" 
              class="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded">
              📝 Søk jobben
            </button>
          `}
        ` : ''}
        ${category === 'active' ? `
          <p class="text-xs text-gray-500 mt-2">✅ Du har denne jobben</p>
        ` : ''}
        ${category === 'previous' ? `
          <p class="text-xs text-gray-500 mt-2">Avsluttet: ${formatDate(job.completedAt || job.updatedAt)}</p>
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
      uiManager.showSuccess('Søknad sendt!');
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
      
      select.innerHTML = '<option value="">Velg elev...</option>' +
        students.map(student => 
          `<option value="${student.id}">${student.name} (${student.accountNumber})</option>`
        ).join('');
      
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
        container.innerHTML = '<p class="text-gray-500 text-sm">Ingen elever ennå</p>';
        return;
      }
      
      container.innerHTML = `
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-sm font-semibold">Navn</th>
              <th class="px-4 py-2 text-left text-sm font-semibold">Kontonr</th>
              <th class="px-4 py-2 text-right text-sm font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(student => `
              <tr class="border-t border-gray-100">
                <td class="px-4 py-2">${student.name}</td>
                <td class="px-4 py-2">${student.accountNumber}</td>
                <td class="px-4 py-2 text-right font-semibold">${formatCurrency(student.balance, this.settings.currencySymbol)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (error) {
      console.error('Feil ved lasting av elever:', error);
    }
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

    // Pay all salaries button
    const payAllBtn = document.getElementById('payAllSalariesBtn');
    if (payAllBtn) {
      payAllBtn.addEventListener('click', async () => {
        await this.payAllSalaries();
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

    // Reset data button
    const resetBtn = document.getElementById('resetDataBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Er du sikker på at du vil slette ALL data og laste initial data på nytt?')) {
          await this.resetToInitialData();
        }
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

    // Add student button
    const addStudentBtn = document.getElementById('addStudentBtn');
    if (addStudentBtn) {
      addStudentBtn.addEventListener('click', async () => {
        await this.addNewStudent();
      });
    }
  }

  /**
   * Vis modal for å opprette jobb
   */
  async showCreateJobModal() {
    // Last elever til dropdown
    const students = await userService.getAllStudents();
    const select = document.getElementById('jobAssignStudent');
    
    select.innerHTML = '<option value="">Ingen (ledig jobb)</option>' +
      students.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    
    // Vis modal
    document.getElementById('createJobModal').classList.remove('hidden');
  }

  /**
   * Opprett jobb
   */
  async handleCreateJob() {
    console.log('═══════════════════════════════════════');
    console.log('🎯 handleCreateJob STARTER');
    console.log('═══════════════════════════════════════');
    
    // Les verdier fra form
    const titleEl = document.getElementById('jobTitle');
    const descEl = document.getElementById('jobDescription');
    const salaryEl = document.getElementById('jobSalary');
    const typeEl = document.getElementById('jobType');
    const assignEl = document.getElementById('jobAssignStudent');
    
    console.log('📋 Form elementer:');
    console.log('  - titleEl:', titleEl ? 'FUNNET' : 'IKKE FUNNET');
    console.log('  - descEl:', descEl ? 'FUNNET' : 'IKKE FUNNET');
    console.log('  - salaryEl:', salaryEl ? 'FUNNET' : 'IKKE FUNNET');
    console.log('  - typeEl:', typeEl ? 'FUNNET' : 'IKKE FUNNET');
    console.log('  - assignEl:', assignEl ? 'FUNNET' : 'IKKE FUNNET');
    
    const title = titleEl?.value;
    const description = descEl?.value;
    const salaryRaw = salaryEl?.value;
    const salary = parseInt(salaryRaw);
    const type = typeEl?.value;
    const assignedTo = assignEl?.value || null;

    console.log('📝 Form verdier:');
    console.log('  - title:', title);
    console.log('  - description:', description);
    console.log('  - salaryRaw:', salaryRaw);
    console.log('  - salary (parsed):', salary);
    console.log('  - type:', type);
    console.log('  - assignedTo:', assignedTo);

    if (!title || !salary || !type) {
      console.error('❌ VALIDERINGSFEIL - Mangler påkrevde felter!');
      console.error('  - title:', title ? '✓' : '✗ MANGLER');
      console.error('  - salary:', salary ? '✓' : '✗ MANGLER');
      console.error('  - type:', type ? '✓' : '✗ MANGLER');
      uiManager.showError('Fyll ut alle påkrevde felter');
      return;
    }

    console.log('✅ Validering OK');

    try {
      const jobData = {
        title,
        description,
        salary,
        type,
        status: 'active',
        assignedTo: assignedTo
      };

      console.log('📤 Sender jobData til jobService.createJob:', jobData);
      const job = await jobService.createJob(jobData);
      console.log('✅ Jobb opprettet med ID:', job.id);
      console.log('📦 Komplett jobb-objekt:', job);

      uiManager.showSuccess(`${type === 'project' ? 'Prosjekt' : 'Fast jobb'} opprettet!`);
      
      // Skjul modal og reset form
      console.log('🚪 Lukker modal...');
      document.getElementById('createJobModal').classList.add('hidden');
      document.getElementById('createJobForm').reset();
      
      // Refresh jobber
      console.log('🔄 Kaller loadTeacherJobs...');
      await this.loadTeacherJobs();
      console.log('✅ loadTeacherJobs ferdig');
      console.log('═══════════════════════════════════════');
      console.log('🎉 JOBB OPPRETTET VELLYKKET!');
      console.log('═══════════════════════════════════════');
    } catch (error) {
      console.error('═══════════════════════════════════════');
      console.error('❌ FEIL VED OPPRETTELSE AV JOBB');
      console.error('═══════════════════════════════════════');
      console.error('Error object:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      uiManager.showError(error.message || 'Kunne ikke opprette jobb');
    }
  }

  /**
   * Vis teacher screen
   */
  showTeacherScreen(screen) {
    // Oppdater knapper
    document.getElementById('teacherOverviewBtn').className = 
      screen === 'overview' ? 'flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg' : 'flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg';
    document.getElementById('teacherJobsBtn').className = 
      screen === 'jobs' ? 'flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg' : 'flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg';

    // Vis riktig screen
    document.getElementById('teacherOverviewScreen').classList.toggle('hidden', screen !== 'overview');
    document.getElementById('teacherJobsScreen').classList.toggle('hidden', screen !== 'jobs');

    // Last data for screen
    if (screen === 'jobs') {
      this.loadTeacherJobs();
    }
  }

  /**
   * Vis student screen
   */
  showStudentScreen(screen) {
    // Oppdater knapper
    document.getElementById('studentOverviewBtn').className = 
      screen === 'overview' ? 'flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg' : 'flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg';
    document.getElementById('studentJobsBtn').className = 
      screen === 'jobs' ? 'flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg' : 'flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 rounded-lg';

    // Vis riktig screen
    document.getElementById('studentOverviewScreen').classList.toggle('hidden', screen !== 'overview');
    document.getElementById('studentJobsScreen').classList.toggle('hidden', screen !== 'jobs');

    // Last data for screen
    if (screen === 'jobs') {
      this.loadStudentJobs();
    }
  }

  /**
   * Gi penger til elev
   */
  async handleGiveMoney() {
    const recipientId = document.getElementById('giveMoneyRecipient')?.value;
    const amount = parseInt(document.getElementById('giveMoneyAmount')?.value);
    const message = document.getElementById('giveMoneyMessage')?.value?.trim() || 'Utbetaling fra lærer';

    console.log('💰 Gi penger - recipientId:', recipientId, 'amount:', amount, 'message:', message);

    if (!recipientId || !amount) {
      console.error('❌ Mangler data - recipientId:', recipientId, 'amount:', amount);
      uiManager.showError('Fyll ut alle feltene');
      return;
    }

    try {
      // Korrekt API-kall: giveMoney(recipientIds, amount, message)
      await transactionService.giveMoney([recipientId], amount, message);
      uiManager.showSuccess(`${formatCurrency(amount, this.settings.currencySymbol)} gitt til elev!`);
      
      // Reset form
      document.getElementById('giveMoneyForm')?.reset();
      
      // Oppdater dashboard umiddelbart
      await this.refreshTeacherDashboard();
    } catch (error) {
      console.error('Feil ved gi penger:', error);
      uiManager.showError(error.message);
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
        uiManager.showSuccess(`Lønn utbetalt til ${result.successful.length} elev(er)!`);
        // Refresh dashboard umiddelbart
        await this.refreshTeacherDashboard();
      } else {
        uiManager.showInfo('Ingen aktive jobber å betale lønn for');
      }
      
      if (result.failed.length > 0) {
        uiManager.showError(`${result.failed.length} utbetalinger feilet`);
      }
    } catch (error) {
      console.error('❌ Feil ved utbetaling av lønn:', error);
      uiManager.showError(error.message || 'Kunne ikke betale lønn');
    }
  }

  /**
   * Betal lønn for en jobb
   */
  async payJobSalary(jobId) {
    console.log('💵 Betaler lønn for jobb:', jobId);
    try {
      const result = await jobService.payJobSalary(jobId);
      
      // Sjekk om det var en prosjektjobb som ble fullført
      if (result.job.type === 'project') {
        uiManager.showSuccess('Lønn utbetalt! Prosjektet er nå avsluttet.');
      } else {
        uiManager.showSuccess('Lønn utbetalt!');
      }
      
      // Refresh alt umiddelbart
      await this.loadStudentsTable();
      await this.loadTeacherJobs();
    } catch (error) {
      console.error('❌ Feil ved utbetaling:', error);
      uiManager.showError(error.message || 'Kunne ikke betale lønn');
    }
  }

  /**
   * Avslutt jobb
   */
  async endJob(jobId) {
    console.log('🛑 Avslutter jobb:', jobId);
    uiManager.confirm('Er du sikker på at du vil avslutte denne jobben?', async () => {
      try {
        await jobService.endJob(jobId);
        uiManager.showSuccess('Jobb avsluttet!');
        // Refresh jobber umiddelbart
        await this.loadTeacherJobs();
        await this.loadStudentJobs();
      } catch (error) {
        console.error('❌ Feil ved avslutting av jobb:', error);
        uiManager.showError(error.message || 'Kunne ikke avslutte jobb');
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
      uiManager.showSuccess('Jobb publisert på nytt!');
      // Refresh jobber umiddelbart
      await this.loadTeacherJobs();
      await this.loadStudentJobs();
    } catch (error) {
      console.error('❌ Feil ved re-publisering:', error);
      uiManager.showError(error.message || 'Kunne ikke re-publisere jobb');
    }
  }

  /**
   * Slett jobb
   */
  async deleteJob(jobId) {
    console.log('🗑️ Sletter jobb:', jobId);
    uiManager.confirm('Er du sikker på at du vil slette denne jobben?', async () => {
      try {
        await jobService.deleteJob(jobId);
        uiManager.showSuccess('Jobb slettet!');
        // Refresh jobber umiddelbart
        await this.loadTeacherJobs();
      } catch (error) {
        console.error('❌ Feil ved sletting:', error);
        uiManager.showError(error.message || 'Kunne ikke slette jobb');
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

  /**
   * Vis søknadsmodal
   */
  async showApplicationModal(jobId) {
    try {
      // Hent alle jobber og finn den spesifikke jobben
      const jobs = await jobService.getJobs();
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        uiManager.showError('Jobb ikke funnet');
        return;
      }

      // Fyll inn jobbinfo
      document.getElementById('applyJobId').value = jobId;
      document.getElementById('applyJobInfo').innerHTML = `
        <h4 class="font-semibold">${job.title}</h4>
        <p class="text-sm text-gray-600">${job.description}</p>
        <p class="text-sm font-medium text-green-600 mt-2">${formatCurrency(job.salary, this.settings.currencySymbol)}/måned</p>
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
        uiManager.showError('Jobb ikke funnet');
        return;
      }

      // Finn eksisterende søknad
      const allApplications = dataService._getFromStorage('econsim_applications') || [];
      const myApplication = allApplications.find(app => app.jobId === jobId && app.applicantId === user.id);
      
      if (!myApplication) {
        uiManager.showError('Søknad ikke funnet');
        return;
      }

      // Fyll inn jobbinfo og eksisterende søknadstekst
      document.getElementById('applyJobId').value = jobId;
      document.getElementById('applyJobInfo').innerHTML = `
        <h4 class="font-semibold">${job.title}</h4>
        <p class="text-sm text-gray-600">${job.description}</p>
        <p class="text-sm font-medium text-green-600 mt-2">${formatCurrency(job.salary, this.settings.currencySymbol)}/måned</p>
        <p class="text-xs text-orange-600 mt-2">🔄 Du endrer en eksisterende søknad</p>
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
    const text = document.getElementById('applicationText').value;
    
    // Sjekk om det er en oppdatering
    const user = authService.getCurrentUser();
    const allApplications = dataService._getFromStorage('econsim_applications') || [];
    const isUpdate = allApplications.some(app => app.jobId === jobId && app.applicantId === user.id);

    try {
      await jobService.applyForJob(jobId, text);
      uiManager.showSuccess(isUpdate ? 'Søknad oppdatert!' : 'Søknad sendt!');
      
      document.getElementById('applicationModal').classList.add('hidden');
      document.getElementById('applicationForm').reset();
      
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
        uiManager.showError('Jobb ikke funnet');
        return;
      }

      document.getElementById('editJobId').value = job.id;
      document.getElementById('editJobTitle').value = job.title;
      document.getElementById('editJobDescription').value = job.description || '';
      document.getElementById('editJobSalary').value = job.salary;

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

    try {
      await jobService.updateJob(jobId, { title, description, salary });
      uiManager.showSuccess('Jobb oppdatert!');
      
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
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Ingen søknader ennå</p>';
      } else {
        container.innerHTML = `
          <div class="mb-4">
            <h4 class="font-semibold">${job.title}</h4>
            <p class="text-sm text-gray-600">${applications.length} søknad(er)</p>
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
                  ${app.status === 'pending' ? '⏳ Venter' : app.status === 'accepted' ? '✅ Godkjent' : '❌ Avvist'}
                </span>
              </div>
              <p class="text-sm text-gray-700 mb-3">${app.applicationText}</p>
              ${app.status === 'pending' ? `
                <div class="flex gap-2">
                  <button 
                    onclick="window.econSim.acceptApplication('${app.id}')"
                    class="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-2 rounded">
                    ✅ Godkjenn
                  </button>
                  <button 
                    onclick="window.econSim.rejectApplication('${app.id}', '${jobId}')"
                    class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded">
                    ❌ Avvis
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
      await jobService.acceptApplication(applicationId);
      uiManager.showSuccess('Søknad godkjent! Jobben er tildelt eleven.');
      
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
      uiManager.showSuccess('Søknad avvist');
      
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

      uiManager.showSuccess('Data eksportert! Sjekk nedlastinger.');
      console.log('📥 Data eksportert:', data);
    } catch (error) {
      console.error('Feil ved eksport:', error);
      uiManager.showError('Kunne ikke eksportere data');
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
            throw new Error('Ugyldig JSON-fil: Mangler users array');
          }

          // Bekreft import
          const userCount = jsonData.users.length;
          const jobCount = (jsonData.jobs || []).length;
          const txCount = (jsonData.transactions || []).length;

          if (!confirm(
            `Last inn data fra fil?\n\n` +
            `Dette vil erstatte ALL eksisterende data!\n\n` +
            `Filen inneholder:\n` +
            `- ${userCount} brukere\n` +
            `- ${jobCount} jobber\n` +
            `- ${txCount} transaksjoner\n\n` +
            `Er du sikker?`
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
          uiManager.showSuccess('Data lastet! Siden lastes på nytt...');

          // Vent litt, så reload
          setTimeout(() => {
            location.reload();
          }, 1500);

        } catch (parseError) {
          console.error('Feil ved parsing av JSON:', parseError);
          uiManager.showError('Ugyldig JSON-fil: ' + parseError.message);
        }
      };

      reader.onerror = () => {
        console.error('Feil ved lesing av fil');
        uiManager.showError('Kunne ikke lese filen');
      };

      reader.readAsText(file);

      // Reset file input
      event.target.value = '';

    } catch (error) {
      console.error('Feil ved import:', error);
      uiManager.showError('Kunne ikke importere data');
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
      
      uiManager.showSuccess('Data resatt! Siden lastes på nytt...');
      
      // Vent litt, så reload
      setTimeout(() => {
        location.reload();
      }, 1000);
    } catch (error) {
      console.error('Feil ved reset:', error);
      uiManager.showError('Kunne ikke resette data');
    }
  }

  /**
   * Vis innstillingsmodal
   */
  async showSettingsModal() {
    try {
      const settings = await settingsService.getSettings();
      const students = await userService.getAllStudents();

      // Fyll inn nåværende innstillinger
      document.getElementById('settingsClassName').value = settings.className || '7A';
      document.getElementById('settingsCurrencyName').value = settings.currencyName || 'KlasseKrone';
      document.getElementById('settingsCurrencySymbol').value = settings.currencySymbol || 'KKr';
      document.getElementById('settingsStartingBalance').value = settings.startingBalance || 1000;
      document.getElementById('settingsEnableBusinesses').checked = settings.enableBusinesses || false;

      // Last elevliste
      this.renderStudentList(students);

      // Vis modal
      document.getElementById('settingsModal').classList.remove('hidden');
    } catch (error) {
      console.error('Feil ved lasting av innstillinger:', error);
      uiManager.showError('Kunne ikke laste innstillinger');
    }
  }

  /**
   * Render elevliste i innstillinger
   */
  renderStudentList(students) {
    const container = document.getElementById('studentListContainer');
    
    if (students.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-sm">Ingen elever enda</p>';
      return;
    }

    container.innerHTML = students.map(student => `
      <div class="flex justify-between items-center bg-white p-3 rounded border">
        <div>
          <p class="font-medium">${student.name}</p>
          <p class="text-xs text-gray-500">@${student.username} • Konto: ${student.accountNumber}</p>
        </div>
        <button 
          onclick="window.econSim.confirmDeleteStudent('${student.id}', '${student.name}')"
          class="text-red-600 hover:text-red-800 px-3 py-1 text-sm">
          🗑️ Fjern
        </button>
      </div>
    `).join('');
  }

  /**
   * Lagre innstillinger
   */
  async saveSettings() {
    try {
      const newSettings = {
        className: document.getElementById('settingsClassName').value.trim(),
        currencyName: document.getElementById('settingsCurrencyName').value.trim(),
        currencySymbol: document.getElementById('settingsCurrencySymbol').value.trim(),
        startingBalance: parseInt(document.getElementById('settingsStartingBalance').value),
        enableBusinesses: document.getElementById('settingsEnableBusinesses').checked
      };

      // Valider
      if (!newSettings.className || !newSettings.currencyName || !newSettings.currencySymbol) {
        uiManager.showError('Alle felt må fylles ut');
        return;
      }

      if (newSettings.startingBalance < 0) {
        uiManager.showError('Startkapital må være positiv');
        return;
      }

      // Lagre
      await settingsService.updateSettings(newSettings);
      
      // Oppdater applikasjons-settings
      this.settings = newSettings;

      uiManager.showSuccess('Innstillinger lagret!');
      
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

  /**
   * Legg til ny elev
   */
  async addNewStudent() {
    try {
      const name = document.getElementById('newStudentName').value.trim();
      const username = document.getElementById('newStudentUsername').value.trim();
      const password = document.getElementById('newStudentPassword').value;

      if (!name || !username || !password) {
        uiManager.showError('Alle felt må fylles ut');
        return;
      }

      // Generer unikt kontonummer
      const allStudents = await userService.getAllStudents();
      const accountNumbers = allStudents.map(s => parseInt(s.accountNumber));
      let newAccountNumber = 101;
      while (accountNumbers.includes(newAccountNumber)) {
        newAccountNumber++;
      }

      const newStudent = await userService.addStudent({
        name,
        username,
        password,
        accountNumber: newAccountNumber.toString()
      });

      uiManager.showSuccess(`Elev ${name} lagt til!`);

      // Tøm feltene
      document.getElementById('newStudentName').value = '';
      document.getElementById('newStudentUsername').value = '';
      document.getElementById('newStudentPassword').value = '';

      // Refresh elevliste
      const students = await userService.getAllStudents();
      this.renderStudentList(students);
    } catch (error) {
      console.error('Feil ved opprettelse av elev:', error);
      uiManager.showError(error.message);
    }
  }

  /**
   * Bekreft sletting av elev
   */
  async confirmDeleteStudent(studentId, studentName) {
    if (confirm(`Er du sikker på at du vil fjerne eleven ${studentName}?\n\nAlle transaksjoner og data vil bli bevart, men eleven kan ikke lenger logge inn.`)) {
      await this.deleteStudent(studentId);
    }
  }

  /**
   * Slett elev
   */
  async deleteStudent(studentId) {
    try {
      await userService.deleteStudent(studentId);
      uiManager.showSuccess('Elev fjernet');

      // Refresh elevliste
      const students = await userService.getAllStudents();
      this.renderStudentList(students);
    } catch (error) {
      console.error('Feil ved sletting av elev:', error);
      uiManager.showError(error.message);
    }
  }
}

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

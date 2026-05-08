/**
 * users controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 */

import { authService } from '../../auth/index.js';
import { dataService } from '../../../shared/core/dataService.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { classroomService } from '../../classroom/index.js';
import { savingsService } from '../../savings/index.js';
import { statsService, getLoginPeriodLabel } from '../../stats/index.js';
import { emailService } from '../../email/index.js';
import { languageService } from '../../i18n/index.js';
import {
  userService,
  generateUniqueUsername as generateUniqueUsernameUtil,
} from '../index.js';
import { formatCurrency, formatDate } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const usersControllerMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Bekreft sletting av elev
   */
  async confirmDeleteStudent(studentId, studentName) {
    if (confirm(`${languageService.t('confirm.deleteStudentName')} ${studentName}?\n\n${languageService.t('confirm.dataWillBeKept')}`)) {
      await this.deleteStudent(studentId);
    }
  },

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
  },

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
  },
};

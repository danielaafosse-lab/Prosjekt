/**
 * loans controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 */

import { authService } from '../../auth/index.js';
import { dataService } from '../../../shared/core/dataService.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { businessService } from '../../businesses/index.js';
import { userService } from '../../users/index.js';
import { settingsService } from '../../settings/index.js';
import { languageService } from '../../i18n/index.js';
import {
  loanService,
  getLoanApplicationsForUser as getLoanApplicationsForUserUtil,
  renderLoanRow as renderLoanRowUtil,
} from '../index.js';
import { formatCurrency, formatRelativeTime } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const loansControllerMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Last studentens lån - DEPRECATED: Lån vises nå kun i Lån-fanen via loadStudentLoansScreen()
   * Beholdt for bakoverkompatibilitet, kaller nå loadStudentLoansScreen()
   */
  async loadStudentLoans() {
    // Videresend til loadStudentLoansScreen som håndterer alt
    await this.loadStudentLoansScreen();
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};

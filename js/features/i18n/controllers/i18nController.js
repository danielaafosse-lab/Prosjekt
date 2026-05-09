/**
 * i18n controller methods — extracted from EconSimApp.
 * Merged into EconSimApp.prototype in main.js so `this.*` and
 * `window.econSim.method()` continue to work.
 */

import { authService } from '../../auth/index.js';
import { businessService } from '../../businesses/index.js';
import { languageService } from '../index.js';

export const i18nControllerMethods = {
  /**
   * Håndter språkendring - oppdater dynamisk innhold
   */
  async onLanguageChange() {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Re-render dynamisk innhold basert på brukertype
    if (user.type === 'teacher') {
      await this.loadTeacherTransactions();
      await this.loadTeacherJobs();
      await this.loadStudentsDropdown();
      await this.loadStudentsTable();
      this.loadTeacherMessages();
    } else if (user.type === 'student') {
      await this.loadStudentTransactions();
      await this.loadStudentJobs();
      await this.loadStudentLoans();
      await this.loadStudentLoansScreen();
      await this.loadStudentAccountsSummary();
      await this.loadStudentActiveJobsSummary();
      this.loadStudentInbox();

      // Oppdater bedriftsmeldinger hvis elev har bedrift
      if (this.currentBusiness) {
        this.loadBusinessMessages(this.currentBusiness);
      }

      // Oppdater mottakerliste for studentmeldinger
      this.loadMessageRecipients();

      // Oppdater bedriftsdata hvis en bedrift er valgt
      if (this.selectedBusinessId) {
        const business = businessService.getBusinessById(this.selectedBusinessId);
        if (business) {
          // Oppdater maks ansatte info
          const maxEmployees = businessService.calculateMaxEmployees(this.selectedBusinessId);
          const maxInfoElement = document.getElementById('maxEmployeesInfo');
          if (maxInfoElement) {
            maxInfoElement.textContent = languageService.t('ui.employeesInfo', { current: business.employees?.length || 0, max: maxEmployees });
          }

          // Re-render den aktive bedriftsfanen
          const activeTab = document.querySelector('.business-tab-btn.bg-blue-600');
          if (activeTab) {
            this.showBusinessTab(activeTab.dataset.tab);
          }
        }
      }
    }
  },
};

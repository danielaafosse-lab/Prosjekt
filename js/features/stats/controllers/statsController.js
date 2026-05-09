/**
 * stats controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 */

import { authService } from '../../auth/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { languageService } from '../../i18n/index.js';
import { classroomService } from '../../classroom/index.js';
import { settingsService } from '../../settings/index.js';
import { userService } from '../../users/index.js';
import { transactionService } from '../../transactions/index.js';
import { jobService } from '../../jobs/index.js';
import { loanService } from '../../loans/index.js';
import { businessService } from '../../businesses/index.js';
import { taxService } from '../../taxes/index.js';
import {
  statsService,
  getDefaultStatsCount,
  getLoginPeriodLabel,
  calculateGiniCoefficient,
  calculateWeeklyTransactionVolume,
  categorizeIncome,
} from '../index.js';
import { formatCurrency } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const statsControllerMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};

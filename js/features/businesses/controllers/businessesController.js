/**
 * businesses controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 */

import { dataService } from '../../../shared/core/dataService.js';
import { authService } from '../../auth/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { languageService } from '../../i18n/index.js';
import { classroomService } from '../../classroom/index.js';
import { settingsService } from '../../settings/index.js';
import {
  loanService,
  getLoanApplicationsForUser as getLoanApplicationsForUserUtil,
} from '../../loans/index.js';
import { transactionService } from '../../transactions/index.js';
import { notificationService } from '../../notifications/index.js';
import {
  businessService,
  getBusinessWeeklyGrowth,
  getGrowthIndicator,
  getJobStatusColor,
} from '../index.js';
import { formatCurrency, formatDate, formatRelativeTime } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const businessesControllerMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Vis bekreftelse for nedlegging av bedrift
   */
  showCloseBusinessConfirm() {
    const business = businessService.getBusinessById(this.selectedBusinessId);
    if (!business) return;
    
    document.getElementById('closeBusinessName').textContent = business.name;
    document.getElementById('editBusinessModal').classList.add('hidden');
    document.getElementById('closeBusinessModal').classList.remove('hidden');
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Vis ansett direkte modal
   */
  showHireEmployeeModal() {
    document.getElementById('hireEmployeeModal').classList.remove('hidden');
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Si opp ansatt
   */
  fireEmployee(businessId, userId) {
    document.getElementById('fireEmployeeBusinessId').value = businessId;
    document.getElementById('fireEmployeeUserId').value = userId;
    document.getElementById('fireEmployeeMessage').value = '';
    document.getElementById('fireEmployeeModal').classList.remove('hidden');
  },

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
  },

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
  },
};

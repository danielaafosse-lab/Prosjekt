/**
 * jobs controllers — UI methods extracted from main.js (fase 5b).
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
import { businessService } from '../../businesses/index.js';
import { userService } from '../../users/index.js';
import { transactionService } from '../../transactions/index.js';
import { taxService } from '../../taxes/index.js';
import {
  jobService,
  getPendingJobOffers as getPendingJobOffersUtil,
} from '../index.js';
import { formatCurrency, formatDate, formatRelativeTime } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const jobsControllerMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  /**
   * Si opp en jobb (fra elevens side) — åpner oppsigelsesmodal
   */
  quitJob(jobId, isBusinessJob) {
    document.getElementById('quitJobId').value = jobId;
    document.getElementById('quitJobIsBusinessJob').value = isBusinessJob ? '1' : '0';
    document.getElementById('quitJobMessage').value = '';
    document.getElementById('quitJobModal').classList.remove('hidden');
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};

/**
 * Job Service
 * Håndterer alle jobboperasjoner og søknader
 */

import { dataService } from '../core/dataService.js';
import { authService } from '../core/auth.js';
import { eventBus, EVENTS } from '../core/eventBus.js';
import { transactionService } from './transactionService.js';
import { 
  validateJobTitle, 
  validateJobDescription, 
  validateAmount,
  validateApplicationText
} from '../utils/validators.js';
import { JOB_STATUS, JOB_TYPES, APPLICATION_STATUS } from '../config.js';

class JobService {
  /**
   * Opprett ny jobb (kun lærer)
   * @param {Object} jobData - Jobb data
   * @returns {Promise<Object>} - Opprettet jobb
   */
  async createJob(jobData) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan opprette jobber');
      }
      
      // Valider input
      const titleValidation = validateJobTitle(jobData.title);
      if (!titleValidation.valid) {
        throw new Error(titleValidation.error);
      }
      
      const descValidation = validateJobDescription(jobData.description);
      if (!descValidation.valid) {
        throw new Error(descValidation.error);
      }
      
      const salaryValidation = validateAmount(jobData.salary);
      if (!salaryValidation.valid) {
        throw new Error(`Lønn: ${salaryValidation.error}`);
      }
      
      if (!Object.values(JOB_TYPES).includes(jobData.type)) {
        throw new Error('Ugyldig jobbtype');
      }
      
      // Opprett jobb
      const job = await dataService.createJob({
        title: jobData.title.trim(),
        description: jobData.description?.trim() || '',
        salary: salaryValidation.value,
        type: jobData.type,
        status: jobData.status || JOB_STATUS.ACTIVE,
        assignedTo: jobData.assignedTo || null,
        postedBy: currentUser.id
      });
      
      console.log('✅ Jobb opprettet i jobService:', job);
      eventBus.emit(EVENTS.JOB_CREATED, job);
      return job;
    } catch (error) {
      console.error('Feil ved opprettelse av jobb:', error);
      throw error;
    }
  }

  /**
   * Oppdater jobb (kun lærer)
   * @param {string} jobId - Jobb ID
   * @param {Object} updates - Oppdateringer
   * @returns {Promise<Object>} - Oppdatert jobb
   */
  async updateJob(jobId, updates) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan oppdatere jobber');
      }
      
      // Valider relevante felt hvis de oppdateres
      if (updates.title) {
        const validation = validateJobTitle(updates.title);
        if (!validation.valid) throw new Error(validation.error);
        updates.title = updates.title.trim();
      }
      
      if (updates.description !== undefined) {
        const validation = validateJobDescription(updates.description);
        if (!validation.valid) throw new Error(validation.error);
        updates.description = updates.description?.trim() || '';
      }
      
      if (updates.salary) {
        const validation = validateAmount(updates.salary);
        if (!validation.valid) throw new Error(`Lønn: ${validation.error}`);
        updates.salary = validation.value;
      }
      
      const job = await dataService.updateJob(jobId, updates);
      eventBus.emit(EVENTS.JOB_UPDATED, job);
      return job;
    } catch (error) {
      console.error('Feil ved oppdatering av jobb:', error);
      throw error;
    }
  }

  /**
   * Slett jobb (kun lærer)
   * @param {string} jobId - Jobb ID
   * @returns {Promise<boolean>}
   */
  async deleteJob(jobId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan slette jobber');
      }
      
      await dataService.deleteJob(jobId);
      eventBus.emit(EVENTS.JOB_DELETED, { jobId });
      return true;
    } catch (error) {
      console.error('Feil ved sletting av jobb:', error);
      throw error;
    }
  }

  /**
   * Hent alle jobber (generell metode)
   * @returns {Promise<Array>} - Array av jobber med brukerinfo
   */
  async getJobs() {
    try {
      const jobs = await dataService.getJobs();
      
      // Legg til brukernavn for tildelte jobber
      const jobsWithUserInfo = await Promise.all(jobs.map(async (job) => {
        if (job.assignedTo) {
          const user = await dataService.getUser(job.assignedTo);
          return {
            ...job,
            assignedToName: user ? user.name : 'Ukjent bruker'
          };
        }
        return job;
      }));
      
      return jobsWithUserInfo;
    } catch (error) {
      console.error('Feil ved henting av jobber:', error);
      throw error;
    }
  }

  /**
   * Hent alle åpne jobber
   * @returns {Promise<Array>} - Array av jobber
   */
  async getOpenJobs() {
    try {
      const jobs = await dataService.getJobs();
      return jobs
        .filter(j => j.status === JOB_STATUS.ACTIVE && !j.assignedTo)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error('Feil ved henting av åpne jobber:', error);
      throw error;
    }
  }

  /**
   * Hent alle tildelte jobber (kun lærer)
   * @returns {Promise<Array>} - Array av jobber
   */
  async getAssignedJobs() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan se tildelte jobber');
      }
      
      const jobs = await dataService.getJobs();
      return jobs.filter(j => j.status === JOB_STATUS.ASSIGNED);
    } catch (error) {
      console.error('Feil ved henting av tildelte jobber:', error);
      throw error;
    }
  }

  /**
   * Hent fullførte jobber
   * @returns {Promise<Array>} - Array av jobber
   */
  async getCompletedJobs() {
    try {
      const jobs = await dataService.getJobs();
      return jobs
        .filter(j => j.status === JOB_STATUS.COMPLETED)
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    } catch (error) {
      console.error('Feil ved henting av fullførte jobber:', error);
      throw error;
    }
  }

  /**
   * Hent aktive jobber for nåværende elev
   * @returns {Promise<Array>} - Array av jobber
   */
  async getMyActiveJobs() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('Du må være logget inn');
      }
      
      const jobs = await dataService.getJobs();
      return jobs.filter(j => 
        j.status === JOB_STATUS.ASSIGNED && 
        j.assignedTo === currentUser.id
      );
    } catch (error) {
      console.error('Feil ved henting av mine jobber:', error);
      throw error;
    }
  }

  /**
   * Hent historiske jobber for nåværende elev
   * @returns {Promise<Array>} - Array av jobber
   */
  async getMyJobHistory() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('Du må være logget inn');
      }
      
      const jobs = await dataService.getJobs();
      return jobs
        .filter(j => 
          j.status === JOB_STATUS.COMPLETED && 
          j.assignedTo === currentUser.id
        )
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    } catch (error) {
      console.error('Feil ved henting av jobbhistorikk:', error);
      throw error;
    }
  }

  // ==================== SØKNADER ====================

  /**
   * Søk på jobb
   * @param {string} jobId - Jobb ID
   * @param {string} applicationText - Søknadstekst
   * @returns {Promise<Object>} - Opprettet søknad
   */
  async applyForJob(jobId, applicationText) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'student') {
        throw new Error('Kun elever kan søke på jobber');
      }
      
      // Valider søknadstekst
      const validation = validateApplicationText(applicationText);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      // Sjekk at jobben finnes og er åpen
      const job = await dataService.getJob(jobId);
      if (!job) {
        throw new Error('Jobb ikke funnet');
      }
      if (job.status !== JOB_STATUS.ACTIVE || job.assignedTo) {
        throw new Error('Denne jobben er ikke lenger åpen');
      }
      
      // Sjekk om eleven allerede har søkt (for oppdatering)
      const allApplications = dataService._getFromStorage('econsim_applications') || [];
      const existingApplication = allApplications.find(
        app => app.jobId === jobId && app.applicantId === currentUser.id
      );
      
      if (existingApplication) {
        // Oppdater eksisterende søknad
        const updatedApplication = await dataService.updateApplication(existingApplication.id, {
          applicationText: applicationText.trim(),
          updatedAt: new Date().toISOString()
        });
        eventBus.emit(EVENTS.APPLICATION_UPDATED, updatedApplication);
        return updatedApplication;
      } else {
        // Opprett ny søknad
        const application = await dataService.createApplication({
          jobId,
          applicantId: currentUser.id,
          applicantName: currentUser.name,
          applicationText: applicationText.trim()
        });
        eventBus.emit(EVENTS.APPLICATION_CREATED, application);
        return application;
      }
    } catch (error) {
      console.error('Feil ved søknad:', error);
      throw error;
    }
  }

  /**
   * Hent søknader for en jobb (kun lærer)
   * @param {string} jobId - Jobb ID
   * @returns {Promise<Array>} - Array av søknader
   */
  async getJobApplications(jobId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan se søknader');
      }
      
      return await dataService.getJobApplications(jobId);
    } catch (error) {
      console.error('Feil ved henting av søknader:', error);
      throw error;
    }
  }

  /**
   * Hent alle pending søknader (kun lærer)
   * @returns {Promise<Array>} - Array av søknader med jobb-info
   */
  async getAllPendingApplications() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan se søknader');
      }
      
      const applications = await dataService.getApplications();
      const jobs = await dataService.getJobs();
      
      // Filtrer pending og berik med jobb-info
      const pending = applications.filter(a => a.status === APPLICATION_STATUS.PENDING);
      
      return pending.map(app => {
        const job = jobs.find(j => j.id === app.jobId);
        return {
          ...app,
          job: job || null
        };
      }).filter(app => app.job !== null); // Fjern søknader uten jobb
    } catch (error) {
      console.error('Feil ved henting av søknader:', error);
      throw error;
    }
  }

  /**
   * Sjekk om nåværende bruker har søkt på en jobb
   * @param {string} jobId - Jobb ID
   * @returns {Promise<boolean>}
   */
  async hasAppliedForJob(jobId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return false;
      
      const applications = await dataService.getUserApplications(currentUser.id);
      return applications.some(a => 
        a.jobId === jobId && 
        a.status === APPLICATION_STATUS.PENDING
      );
    } catch (error) {
      console.error('Feil ved sjekk av søknad:', error);
      return false;
    }
  }

  /**
   * Godta søknad (kun lærer)
   * @param {string} applicationId - Søknad ID
   * @returns {Promise<Object>} - Oppdatert jobb
   */
  async acceptApplication(applicationId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan godkjenne søknader');
      }
      
      // Hent søknad
      const applications = await dataService.getApplications();
      const application = applications.find(a => a.id === applicationId);
      
      if (!application) {
        throw new Error('Søknad ikke funnet');
      }
      
      if (application.status !== APPLICATION_STATUS.PENDING) {
        throw new Error('Søknad er allerede behandlet');
      }
      
      // Oppdater jobb
      const job = await dataService.updateJob(application.jobId, {
        assignedTo: application.applicantId,
        assignedAt: new Date().toISOString()
      });
      
      // Oppdater søknaden som godkjent
      await dataService.updateApplication(applicationId, {
        status: APPLICATION_STATUS.ACCEPTED
      });
      
      // Avvis alle andre søknader på samme jobb
      const otherApplications = applications.filter(a => 
        a.jobId === application.jobId && 
        a.id !== applicationId &&
        a.status === APPLICATION_STATUS.PENDING
      );
      
      if (otherApplications.length > 0) {
        await dataService.batchUpdateApplications(
          otherApplications.map(a => ({
            id: a.id,
            status: APPLICATION_STATUS.REJECTED
          }))
        );
      }
      
      eventBus.emit(EVENTS.JOB_UPDATED, job);
      eventBus.emit(EVENTS.APPLICATION_UPDATED, { applicationId, status: 'accepted' });
      
      return job;
    } catch (error) {
      console.error('Feil ved godkjenning av søknad:', error);
      throw error;
    }
  }

  /**
   * Avvis søknad (kun lærer)
   * @param {string} applicationId - Søknad ID
   * @returns {Promise<boolean>}
   */
  async rejectApplication(applicationId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan avvise søknader');
      }
      
      await dataService.updateApplication(applicationId, {
        status: APPLICATION_STATUS.REJECTED
      });
      
      eventBus.emit(EVENTS.APPLICATION_UPDATED, { applicationId, status: 'rejected' });
      return true;
    } catch (error) {
      console.error('Feil ved avvisning av søknad:', error);
      throw error;
    }
  }

  /**
   * Ansett en elev direkte til en jobb (uten søknad)
   * @param {string} jobId - Jobb ID
   * @param {string} studentId - Elev ID
   * @returns {Promise<Object>} - Oppdatert jobb
   */
  async assignJob(jobId, studentId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan ansette elever');
      }

      const job = await dataService.getJob(jobId);
      if (!job) {
        throw new Error('Jobb ikke funnet');
      }

      if (job.assignedTo) {
        throw new Error('Jobben er allerede tildelt');
      }

      const student = await dataService.getUser(studentId);
      if (!student || student.type !== 'student') {
        throw new Error('Ugyldig elev');
      }

      const updatedJob = await dataService.updateJob(jobId, {
        assignedTo: studentId,
        assignedToName: student.name,
        assignedAt: new Date().toISOString()
      });

      eventBus.emit(EVENTS.JOB_UPDATED, updatedJob);
      return updatedJob;
    } catch (error) {
      console.error('Feil ved ansettelse:', error);
      throw error;
    }
  }

  // ==================== LØNNSUTBETALINGER ====================

  /**
   * Betal lønn for en jobb (kun lærer)
   * @param {string} jobId - Jobb ID
   * @returns {Promise<Object>} - { transaction, job }
   */
  async payJobSalary(jobId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan betale lønn');
      }
      
      const job = await dataService.getJob(jobId);
      if (!job) {
        throw new Error('Jobb ikke funnet');
      }
      
      if (job.status !== JOB_STATUS.ACTIVE || !job.assignedTo) {
        throw new Error('Jobb er ikke tildelt');
      }
      
      // Overfør penger
      const transaction = await transactionService.giveMoney(
        job.assignedTo,
        job.salary,
        `Lønn for: ${job.title}`
      );
      
      // Oppdater jobb basert på type
      let jobUpdates = {
        lastPaymentAt: new Date().toISOString()
      };
      
      if (job.type === JOB_TYPES.PROJECT) {
        // Prosjekt fullføres ved betaling
        jobUpdates.status = JOB_STATUS.COMPLETED;
        jobUpdates.completedAt = new Date().toISOString();
      }
      // Fixed jobber forblir assigned
      
      const updatedJob = await dataService.updateJob(jobId, jobUpdates);
      
      eventBus.emit(EVENTS.JOB_UPDATED, updatedJob);
      
      return {
        transaction: transaction[0], // giveMoney returnerer array
        job: updatedJob
      };
    } catch (error) {
      console.error('Feil ved lønnsutbetaling:', error);
      throw error;
    }
  }

  /**
   * Betal lønn for alle aktive jobber (kun lærer)
   * @returns {Promise<Array>} - Array av { transaction, job }
   */
  async payAllActiveSalaries() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan betale lønn');
      }
      
      const activeJobs = await this.getAssignedJobs();
      
      if (activeJobs.length === 0) {
        return { successful: [], failed: [], message: 'Ingen aktive jobber å betale' };
      }
      
      const successful = [];
      const failed = [];
      
      for (const job of activeJobs) {
        try {
          const result = await this.payJobSalary(job.id);
          successful.push(result);
        } catch (error) {
          console.error(`Feil ved betaling av jobb ${job.id}:`, error);
          failed.push({ job, error: error.message });
        }
      }
      
      return { successful, failed };
    } catch (error) {
      console.error('Feil ved masseutbetaling:', error);
      throw error;
    }
  }

  /**
   * Avslutt jobb (kun lærer)
   * @param {string} jobId - Jobb ID
   * @returns {Promise<Object>} - Oppdatert jobb
   */
  async endJob(jobId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan avslutte jobber');
      }
      
      const job = await dataService.updateJob(jobId, {
        status: JOB_STATUS.COMPLETED,
        completedAt: new Date().toISOString()
      });
      
      eventBus.emit(EVENTS.JOB_UPDATED, job);
      return job;
    } catch (error) {
      console.error('Feil ved avslutning av jobb:', error);
      throw error;
    }
  }

  /**
   * Legg ut jobb på nytt (kun lærer)
   * @param {string} jobId - Jobb ID
   * @returns {Promise<Object>} - Oppdatert jobb
   */
  async republishJob(jobId) {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser || currentUser.type !== 'teacher') {
        throw new Error('Kun lærere kan publisere jobber på nytt');
      }
      
      const job = await dataService.updateJob(jobId, {
        status: JOB_STATUS.ACTIVE,
        assignedTo: null,
        assignedAt: null,
        completedAt: null,
        lastPaymentAt: null
      });
      
      eventBus.emit(EVENTS.JOB_UPDATED, job);
      return job;
    } catch (error) {
      console.error('Feil ved re-publisering av jobb:', error);
      throw error;
    }
  }
}

// Eksporter singleton instance
export const jobService = new JobService();

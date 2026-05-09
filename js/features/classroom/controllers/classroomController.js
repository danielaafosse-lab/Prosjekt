/**
 * classroom controller methods — extracted from EconSimApp.
 * Merged into EconSimApp.prototype in main.js so `this.*` and
 * `window.econSim.method()` continue to work.
 */

import { dataService } from '../../../shared/core/dataService.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';
import { STORAGE_KEYS } from '../../../shared/config/config.js';
import { classroomService } from '../index.js';
import { languageService } from '../../i18n/index.js';

export const classroomControllerMethods = {
  /**
   * Last alle klasserom for superadmin
   */
  async loadAllClassrooms() {
    await this.refreshClassroomCacheFromFirebase();
    const classrooms = classroomService.getAllClassrooms();
    const container = document.getElementById('allClassroomsList');

    if (!container) return;

    if (classrooms.length === 0) {
      container.innerHTML = `<p class="text-gray-500">${languageService.t('ui.noClassroomsCreated')}</p>`;
      return;
    }

    container.innerHTML = classrooms.map(classroom => {
      const students = classroomService.getStudentsByClassroom(classroom.id);
      const users = classroomService.getUsers();
      const teacher = users.find(u => u.id === classroom.teacherId);
      const isDemoClassroom = classroom.id === 'demo-classroom' || classroom.teacherId === 't1';

      const isLocked = classroom.locked === true;
      const lockBadge = isLocked
        ? `<span class="inline-block bg-yellow-200 text-yellow-800 text-xs px-2 py-0.5 rounded">🔒 ${languageService.t('lock.locked') || 'Låst'}</span>`
        : '';
      const lockButton = isDemoClassroom
        ? ''
        : (isLocked
            ? `<button onclick="window.econSim.backupsController.toggleLock('${classroom.id}', true)" class="text-green-600 hover:text-green-800 text-sm" title="Lås opp klasserom">🔓 ${languageService.t('lock.unlockClassroom') || 'Lås opp'}</button>`
            : `<button onclick="window.econSim.backupsController.toggleLock('${classroom.id}', false)" class="text-yellow-600 hover:text-yellow-800 text-sm" title="Lås klasserom">🔒 ${languageService.t('lock.lockClassroom') || 'Lås'}</button>`);

      return `
        <div class="bg-gray-50 p-4 rounded-lg ${isLocked ? 'opacity-75' : ''}">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-medium text-lg">${escapeHtml(classroom.className)} ${lockBadge}</p>
              <p class="text-sm text-gray-500">${languageService.t('demo.teacher')}: ${teacher ? escapeHtml(teacher.name) : languageService.t('common.unknown')}</p>
              <p class="text-sm text-gray-500">${languageService.t('ui.currency')}: ${classroom.currencySymbol} • ${languageService.t('ui.startingCapital')}: ${classroom.startingBalance}</p>
            </div>
            <div class="text-right flex flex-col items-end gap-2">
              ${isDemoClassroom
                ? '<span class="text-xs text-gray-400">Beskyttet demo-klasserom</span>'
                : `<div class="flex gap-2">
                     ${lockButton}
                     <button onclick="window.econSim.deleteClassroomAsSuperadmin('${classroom.id}')" class="text-red-600 hover:text-red-800 text-sm" title="Slett klasserom">🗑️ Slett</button>
                   </div>`}
              <p class="text-2xl font-bold text-blue-600">${students.length}</p>
              <p class="text-xs text-gray-500">${languageService.t('roles.students')}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Slett klasserom direkte fra superadmin (ikke demo)
   */
  async deleteClassroomAsSuperadmin(classroomId) {
    if (classroomId === 'demo-classroom') {
      uiManager.showError('Demo-klasserom kan ikke slettes.');
      return;
    }

    if (!confirm('Er du sikker på at du vil slette dette klasserommet?')) {
      return;
    }

    try {
      await this.refreshClassroomCacheFromFirebase();

      const users = classroomService.getUsers();
      const classroom = await dataService.getClassroom(classroomId);

      if (!classroom) {
        uiManager.showInfo('Klasserommet er allerede slettet.');
        await this.loadSuperadminStats();
        await this.loadTeachersList();
        await this.loadAllClassrooms();
        return;
      }

      const teacherId = classroom?.teacherId || null;

      // Slett alle brukere knyttet til klasserommet (elever + bank/skatt-kontoer)
      const usersInClassroom = users.filter(u => u.classroomId === classroomId);
      for (const user of usersInClassroom) {
        await dataService.deleteUser(user.id);
      }

      // Slett lærer hvis koblet til klasserommet (unntatt demo-lærer)
      if (teacherId && teacherId !== 't1') {
        await dataService.deleteUser(teacherId);
      }

      // Slett klasserom med all klassedata
      await dataService.deleteClassroom(classroomId);

      // Oppdater local cache etter sletting
      await this.refreshClassroomCacheFromFirebase();

      uiManager.showSuccess('Klasserom slettet.');
      await this.loadSuperadminStats();
      await this.loadTeachersList();
      await this.loadAllClassrooms();
    } catch (error) {
      console.error('Feil ved sletting av klasserom:', error);
      uiManager.showError(error.message || 'Kunne ikke slette klasserom');
    }
  },

  /**
   * Synkroniser classroomService cache med ferske Firebase-data
   */
  async refreshClassroomCacheFromFirebase() {
    try {
      if (!dataService.getClassrooms) return;
      const freshClassrooms = await dataService.getClassrooms();
      classroomService._firebaseClassrooms = freshClassrooms;
      classroomService.classrooms = [...freshClassrooms];
      localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(freshClassrooms));
    } catch (error) {
      console.warn('Kunne ikke oppdatere classroom-cache:', error);
    }
  },
};

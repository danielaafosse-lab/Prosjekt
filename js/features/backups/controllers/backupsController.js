/**
 * Backups-dashboard for superadmin.
 * Render-funksjon kalles fra superadmin-dashboard. Knapper er bundet via
 * inline onclick til window.econSim.backupsController.
 */

import { backupService } from '../services/backupService.js';
import { authService } from '../../auth/index.js';
import { languageService } from '../../i18n/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { dataService } from '../../../shared/core/dataService.js';

class BackupsController {
  constructor() {
    this.currentBackups = [];
    this.filterClassroomId = null;
  }

  async render() {
    if (!authService.isSuperAdmin()) return;
    const container = document.getElementById('backupsList');
    if (!container) return;
    container.innerHTML = `<p class="text-gray-500 italic">${languageService.t('backups.loading') || 'Laster...'}</p>`;

    try {
      this.currentBackups = await backupService.listBackups({ classroomId: this.filterClassroomId });
      if (this.currentBackups.length === 0) {
        container.innerHTML = `<p class="text-gray-500 italic">${languageService.t('backups.empty') || 'Ingen backups.'}</p>`;
        return;
      }
      container.innerHTML = this.currentBackups.map(b => this._renderBackupRow(b)).join('');
    } catch (err) {
      console.error('listBackups feilet:', err);
      container.innerHTML = `<p class="text-red-600">${err.message || err}</p>`;
    }
  }

  _renderBackupRow(b) {
    const date = new Date(b.createdAt).toLocaleString('nb-NO');
    const reasonLabel = {
      'reset': '🔄 Reset',
      'pre-restore': '↺ Pre-restore',
      'demo-reset': '🎭 Demo-reset',
    }[b.reason] || b.reason;
    return `
      <div class="border rounded p-3 mb-2 bg-white">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">${b.classroomId} <span class="text-xs text-gray-500 font-normal">${reasonLabel}</span></div>
            <div class="text-sm text-gray-600">${date} — av ${b.createdBy}</div>
            <div class="text-xs text-gray-500 mt-1">
              ${b.counts.users} elever · ${b.counts.transactions} tx · ${b.counts.jobs} jobber · ${b.counts.businesses} bedrifter
            </div>
          </div>
          <div class="flex flex-col gap-1 shrink-0">
            <button onclick="window.econSim.backupsController.restore('${b.id}')"
                    class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm">↺ Restore</button>
            <button onclick="window.econSim.backupsController.del('${b.id}')"
                    class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  async restore(backupId) {
    const backup = this.currentBackups.find(b => b.id === backupId);
    if (!backup) return;
    const msg1 = `${languageService.t('confirm.restoreClassroom') || 'Gjenopprett klasserommet'} ${backup.classroomId} fra ${new Date(backup.createdAt).toLocaleString('nb-NO')}?\n\nNåværende data lagres som ny backup først.`;
    if (!confirm(msg1)) return;
    const msg2 = `${languageService.t('confirm.restoreClassroomFinal') || 'Skriv inn klasserom-ID for å bekrefte'}: ${backup.classroomId}`;
    const typed = prompt(msg2);
    if (typed !== backup.classroomId) {
      uiManager.showError(languageService.t('error.confirmFailed') || 'Bekreftelse feilet');
      return;
    }
    try {
      const result = await backupService.restoreBackup(backupId);
      uiManager.showSuccess(`${languageService.t('msg.restored') || 'Restore fullført'} (pre-restore: ${result.preRestoreBackupId})`);
      await dataService.refreshUsersCache();
      await this.render();
    } catch (err) {
      uiManager.showError(err.message || String(err));
    }
  }

  async del(backupId) {
    if (!confirm(languageService.t('confirm.deleteBackup') || 'Slett denne backupen permanent?')) return;
    try {
      await backupService.deleteBackup(backupId);
      await this.render();
    } catch (err) {
      uiManager.showError(err.message || String(err));
    }
  }

  async toggleLock(classroomId, currentlyLocked) {
    const action = currentlyLocked
      ? (languageService.t('lock.unlockClassroom') || 'Lås opp klasserom')
      : (languageService.t('lock.lockClassroom') || 'Lås klasserom');
    if (!confirm(`${action}: ${classroomId}?`)) return;
    try {
      await backupService.setClassroomLocked(classroomId, !currentlyLocked);
      uiManager.showSuccess(currentlyLocked
        ? (languageService.t('msg.classroomUnlocked') || 'Klasserom låst opp')
        : (languageService.t('msg.classroomLocked') || 'Klasserom låst'));
      // Re-render klasserom-listen hvis tilgjengelig
      if (window.econSim?.classroomController?.refreshClassroomList) {
        await window.econSim.classroomController.refreshClassroomList();
      } else if (window.econSim?.refreshClassroomCacheFromFirebase) {
        await window.econSim.refreshClassroomCacheFromFirebase();
      }
    } catch (err) {
      uiManager.showError(err.message || String(err));
    }
  }
}

export const backupsController = new BackupsController();

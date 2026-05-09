/**
 * Backup-service for superadmin: list, preview, restore, delete + lock/unlock.
 *
 * Alle operasjoner er Cloud Function calls i region europe-west1.
 * Klient kan ikke skrive direkte til classroomBackups under strenge regler.
 */

class BackupService {
  _callable(name) {
    // eslint-disable-next-line no-undef
    return firebase.app().functions('europe-west1').httpsCallable(name);
  }

  async listBackups({ classroomId } = {}) {
    const result = await this._callable('listBackups')({ classroomId: classroomId || null });
    return result.data?.backups || [];
  }

  async previewBackup(backupId) {
    const result = await this._callable('previewBackup')({ backupId });
    return result.data || null;
  }

  async restoreBackup(backupId) {
    const result = await this._callable('restoreClassroom')({ backupId });
    return result.data;
  }

  async deleteBackup(backupId) {
    const result = await this._callable('deleteBackup')({ backupId });
    return result.data;
  }

  async setClassroomLocked(classroomId, locked) {
    const result = await this._callable('setClassroomLocked')({ classroomId, locked });
    return result.data;
  }
}

export const backupService = new BackupService();

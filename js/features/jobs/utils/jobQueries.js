/**
 * Jobs — spørrings-hjelpere.
 *
 * Ekstrahert fra main.js. Avhengigheter (dataService, classroomService,
 * authService) sendes inn som parameter for å holde modulen ren og
 * lett testbar.
 */

/**
 * Hent ventende jobbtilbud for en bruker innenfor gjeldende klasserom.
 *
 * @param {string} userId
 * @param {{
 *   dataService: { getJobOffers: () => Promise<Array<object>> },
 *   classroomService: { getClassroomByTeacher: (teacherId: string) => { id: string } | null },
 *   authService: { getCurrentUser: () => { id: string, classroomId?: string } | null }
 * }} deps
 * @returns {Promise<Array<object>>}
 */
export async function getPendingJobOffers(userId, deps) {
  const { dataService, classroomService, authService } = deps;
  const offers = await dataService.getJobOffers();
  const currentUser = authService.getCurrentUser();
  const classroomId = classroomService.getClassroomByTeacher(currentUser?.id)?.id
    || currentUser?.classroomId;
  return offers.filter((o) =>
    o.employeeId === userId
    && o.status === 'pending'
    && o.classroomId === classroomId,
  );
}

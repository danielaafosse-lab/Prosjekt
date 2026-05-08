/**
 * Users — brukernavn-genereringshjelpere.
 *
 * Ekstrahert fra main.js. dataService sendes inn som parameter for å
 * gjøre funksjonen lett å teste og holde modulen fri for service-imports.
 */

/**
 * Konverter norske tegn til ASCII-vennlige alternativer.
 * æ → ae, ø → oe, å → aa
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeNorwegianChars(str) {
  return str
    .replace(/æ/gi, 'ae')
    .replace(/ø/gi, 'oe')
    .replace(/å/gi, 'aa');
}

/**
 * Generer unikt brukernavn basert på lærer- og elevnavn.
 * Format: [2 første lærer-fornavn][2 første elev-fornavn][2 første elev-etternavn]
 * Eksempel: Daniel + Anne Odda → daanod
 *
 * @param {string} teacherName
 * @param {string} studentFirstName
 * @param {string} studentLastName
 * @param {{ getUsers: () => Promise<Array<{ username: string }>> }} dataService
 * @returns {Promise<string>}
 */
export async function generateUniqueUsername(teacherName, studentFirstName, studentLastName, dataService) {
  const normalizedTeacher = normalizeNorwegianChars(teacherName);
  const normalizedFirst = normalizeNorwegianChars(studentFirstName);
  const normalizedLast = normalizeNorwegianChars(studentLastName);

  const teacherPrefix = normalizedTeacher.substring(0, 2).toLowerCase();
  const firstNamePart = normalizedFirst.substring(0, 2).toLowerCase();
  const lastNamePart = normalizedLast.substring(0, 2).toLowerCase();

  const baseUsername = `${teacherPrefix}${firstNamePart}${lastNamePart}`;

  const users = await dataService.getUsers();
  let username = baseUsername;
  let counter = 1;

  while (users.some((u) => u.username === username)) {
    username = `${baseUsername}${counter.toString().padStart(2, '0')}`;
    counter++;
  }

  return username;
}

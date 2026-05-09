# Firebase Auth-migrering for EconSim — Design

**Dato:** 2026-05-09
**Branch:** `refactor/v6-restructure`
**Status:** Godkjent for implementering
**Erstatter:** `docs/superpowers/specs/2026-05-08-firebase-auth-migration-prompt.md` (som var en fresh-chat-prompt med flere antakelser som viste seg feil)

---

## 1. Mål

Migrer EconSim fra egenutviklet SHA-256-autentisering til **Firebase Auth med Custom Tokens**, slik at Firestore-regler kan håndheve `request.auth != null` og klasserom-isolering serverside.

Sluttilstand:

- Cloud Function `authenticateUser` verifiserer SHA-256-hash mot Firestore og utsteder Firebase Custom Token
- Klient kaller funksjonen og logger inn via `firebase.auth().signInWithCustomToken(token)`
- Strenge `firestore.rules` håndhever auth + klasserom-isolering + rollebasert tilgang
- Ingen dual-mode/backwards-compat — full cutover (appen er ikke i aktiv bruk ennå)
- Eksisterende `User.password`-felt renames til `User.passwordHash` for konsistens og selvdokumentasjon
- `SUPERADMIN`-konstanten i `config.js` reduseres fra hardkodet hash til kun `{ id, username }`; sannheten flyttes til `users/superadmin`-doc i Firestore
- Klasse-reset for lærere får automatisk backup-før-sletting
- Superadmin får UI for restore fra backup og lås/lås-opp av klasserom

## 2. Kontekst og bakgrunn

EconSim er en norsk klasseromsøkonomisimulator (https://econsim-5723c.web.app) for ungdomsskolen. v5.2.1 i prod, v6-restrukturering på branch `refactor/v6-restructure`. Appen vil snart tas i bruk av lærere — derfor er sikkerhetsherding kritisk **nå**, før reelle data ligger i Firestore.

### Nåværende tilstand

- Bruker-objekter har `password`-felt (inneholder SHA-256-hash, ikke plaintext — feltnavnet er villedende)
- `SUPERADMIN` er hardkodet i `js/shared/config/config.js` med `passwordHash`-felt; hashen er synlig i bundlet klient-JS
- Login: klient henter user-doc, sammenligner SHA-256(input) med lagret hash, lagrer `userId` i `localStorage`
- `firestore.rules` er `allow read, write: if true` — fullt åpen
- Per-klasserom reset eksisterer (`deleteClassData()` i [main.js:1826](../../../js/main.js)), men uten backup
- Global `resetEconSim()` finnes (`window.resetEconSim` i [main.js:76](../../../js/main.js)) som dev-verktøy — fjernes i denne migreringen

### Trusler som adresseres

- Manipulasjon av data på tvers av klasserom (en innlogget elev kan i dag skrive til hvilken som helst transaksjon)
- Anonym lesing av all Firestore-data hvis prosjekt-IDen er kjent
- Eksponering av superadmin-hash i bundlet klient-JS (lar angriper brute-force offline)
- Tap av data ved utilsiktet klasse-reset

## 3. Arkitektur

### 3.1 Komponentdiagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Klient                                                         │
│  - authService.login() → kaller authenticateUser-funksjon       │
│  - signInWithCustomToken(token) setter firebase.auth().currentUser │
│  - onAuthStateChanged → henter User-doc, emitter EVENTS         │
│  - getIdTokenResult() → leser claims (userType, classroomId)    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ httpsCallable (europe-west1)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Functions (functions/index.js, region europe-west1)      │
│                                                                 │
│  Auth:                                                          │
│  - authenticateUser: SHA-256-verifisering + custom token        │
│                                                                 │
│  Reset/backup:                                                  │
│  - resetClassroom: backup → slett (lærer/superadmin)            │
│  - resetDemoClassroom: backup → slett → gjenopprett demo        │
│  - restoreClassroom: pre-restore-backup → restore (superadmin)  │
│  - listBackups / previewBackup / deleteBackup (superadmin)      │
│  - cleanOldBackups: scheduled, sletter > 90 dager               │
│                                                                 │
│  Lås:                                                           │
│  - setClassroomLocked: lås/lås opp + revoke refresh tokens      │
│                                                                 │
│  Demo:                                                          │
│  - ensureDemoData: idempotent demo-opprettelse ved oppstart     │
│                                                                 │
│  Migrering:                                                     │
│  - migrateAuthSchema: én-gangs rename + felt-tillegg            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Admin SDK (omgår Firestore-regler)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firestore (strenge regler)                                     │
│  - users/{uid}: passwordHash, locked, classroomId, type, ...    │
│  - users/superadmin: NY (flyttet fra config.js)                 │
│  - classrooms/{id}: locked, lockedAt, lockedBy, lastResetAt     │
│  - classroomBackups/{id}: NY snapshot-collection                │
│  - migrationLog/{id}: NY audit-trail                            │
│  - eksisterende collections: rules basert på request.auth.token │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Datamodell-endringer

**`User`** (eksisterende):
- `password` (string) → **rename til** `passwordHash` (string)
- + `locked: boolean` (default false) — for sperring via superadmin

**`Classroom`** (eksisterende):
- + `locked: boolean` (default false)
- + `lockedAt: ISO timestamp | null`
- + `lockedBy: string | null` (UID av superadmin som låste)
- + `lastResetAt: ISO timestamp | null`

**`ClassroomBackup`** (ny):
- `id`: `${classroomId}_${ISO-timestamp}` eller `pre-restore_${classroomId}_${ISO-timestamp}`
- `classroomId`: string
- `createdAt`: ISO timestamp
- `createdBy`: UID
- `reason`: 'reset' | 'pre-restore' | 'demo-reset'
- `classroom`: full Classroom-doc
- `users`, `transactions`, `jobs`, `applications`, `businesses`, `loans`, `savings`, `funds`, `notifications`, `messages`, `weeklySnapshots`: arrays av dokumenter med id+data

**`MigrationLog`** (ny):
- En entry per kjørt migrering med rapport over hva som ble endret

### 3.3 Custom claims

```json
{
  "userType": "teacher" | "student" | "superadmin",
  "classroomId": "abc-123" | null,
  "accountNumber": "100" | null
}
```

Max 1000 bytes per Firebase-policy. Vi er trygt under (~80 bytes).

## 4. Cloud Functions

### 4.1 `authenticateUser`

Callable, region `europe-west1`. Tar `{ username, password }`, slår opp bruker, sammenligner SHA-256-hash mot `passwordHash`, returnerer `{ token }` med custom claims.

- Generiske feilmeldinger (`auth.invalidCredentials`) for både ukjent bruker og feil passord — unngår enumerering
- Username-lookup case-insensitive (`.toLowerCase()`)
- Sjekker `user.locked` og kaster `auth.accountLocked` hvis sant
- 1 sekund bevisst delay på feilet passord (mitigerer brute-force)
- Returnerer kun `token`; klienten dekoder claims via `getIdTokenResult()`

### 4.2 `resetClassroom`

Callable, region `europe-west1`. Krever auth + (`userType === 'superadmin'` eller `userType === 'teacher' && classroomId === request.classroomId`).

Steg:
1. Opprett backup-snapshot i `classroomBackups`-collection
2. Slett alle docs i `transactions`, `jobs`, `applications`, `businesses`, `loans`, `savings`, `funds`, `notifications`, `messages`, `weeklySnapshots` filtrert på `classroomId`
3. Slett alle students (`users` der `classroomId == X && type === 'student'`)
4. Reset klasserom-felt: `nextStudentNumber: 101`, `nextBusinessNumber: 501`, `lastResetAt: now`

Returnerer `{ backupId, deletedStudents }`.

### 4.3 `resetDemoClassroom`

Callable, region `europe-west1`. Krever auth + (superadmin eller `uid === 't1'`).

Lik `resetClassroom`, men:
- `classroomId === 'demo-classroom'` hardkodet
- Etter sletting: gjenoppretter demo-elever fra `functions/data/initial-data.json` (kopiert ved deploy)
- Sikrer at `kari123` med passord `passord123` alltid eksisterer

### 4.4 `restoreClassroom`

Callable, region `europe-west1`. Krever superadmin.

Steg:
1. Hent backup-doc fra `classroomBackups/{backupId}`
2. Lag en ny pre-restore-backup av nåværende tilstand
3. Slett nåværende klasseromsdata
4. Skriv backup-data tilbake (batches)
5. Skriv klasserom-doc tilbake

Returnerer `{ restoredFromBackup, preRestoreBackupId }`.

### 4.5 `listBackups`, `previewBackup`, `deleteBackup`

Tre callable-funksjoner for backup-administrasjon. Krever superadmin.

- `listBackups`: returnerer paginert liste over metadata (id, classroomId, createdAt, createdBy, summary-counts), uten full doc-data
- `previewBackup`: tar backupId, returnerer full backup-doc
- `deleteBackup`: tar backupId, sletter docen

### 4.6 `setClassroomLocked`

Callable, region `europe-west1`. Krever superadmin. Tar `{ classroomId, locked }`.

Steg:
1. Finn `teacherId` fra classroom-doc
2. Batch update: `Classroom.locked`, `Classroom.lockedAt/lockedBy`, `User.locked` på lærer
3. Hvis lås: `admin.auth().revokeRefreshTokens(teacherId)` — eksisterende sesjoner ugyldiggjøres innen ~1 time

Returnerer `{ classroomId, teacherId, locked }`.

### 4.7 `ensureDemoData`

Callable, public (ingen auth-krav). Idempotent.

- Hvis `classrooms/demo-classroom` eksisterer: returner `{ created: false }`
- Ellers: opprett demo-klasserom, demo-lærer, demo-elever med korrekt `passwordHash` for kjente demo-passord. Bruk `functions/data/initial-data.json`.

Kalles fra klient ved app-init hvis demo-klasserommet mangler.

### 4.8 `cleanOldBackups`

Scheduled (`0 2 * * 0` europe/Oslo, søndag 04:00 norsk tid). Sletter `classroomBackups` der `createdAt < now - 90 days`.

### 4.9 `migrateAuthSchema`

Callable, region `europe-west1`. Krever superadmin (eller ingen auth hvis databasen er tom — første migrasjon).

Steg:
1. Iterer alle `users`:
   - rename `password` → `passwordHash`
   - normaliser `username` til lowercase (Cloud Function `authenticateUser` bruker strikt case-sensitive `where`-query, så lagrede mixed-case-brukernavn må migreres)
   - sett `locked: false` hvis mangler
2. Iterer alle `classrooms`: sett `locked: false` hvis mangler
3. Opprett `users/superadmin`-doc hvis mangler (`username: 'danielalexander'` lowercase)
4. Lagre rapport i `migrationLog`

Idempotent — kan kjøres flere ganger.

## 5. Klient-endringer

### 5.1 `js/features/auth/services/authService.js`

Full omskriving:
- Bruker `firebase.auth()` som single source of truth via `onAuthStateChanged`
- `initialize()` setter `setPersistence(LOCAL)`, returnerer promise som resolver på første state-change
- `login(username, password)` kaller Cloud Function, deretter `signInWithCustomToken`
- `logout()` kaller `firebase.auth().signOut()`
- Ny `getCurrentClaims()` returnerer `{ userType, classroomId, accountNumber }`
- Ny `refreshClaims()` for å tvinge token-refresh etter claims-endring
- `isTeacher()`, `isStudent()`, `isSuperAdmin()` leser claims i stedet for `currentUser.type`

### 5.2 `js/main.js`

- Fjern `window.resetEconSim` ([linje 76](../../../js/main.js)) og `resetAllData()` ([linje 197](../../../js/main.js))
- `deleteClassData()` ([linje 1826](../../../js/main.js)) erstattes med kall til `resetClassroom` Cloud Function
- `resetDemoClassroom()` ([linje 1535](../../../js/main.js)) erstattes med kall til `resetDemoClassroom` Cloud Function
- App-init flow: kall `ensureDemoData` Cloud Function hvis demo-klasserom ikke finnes i Firestore-cache

### 5.3 `js/shared/config/config.js`

- `SUPERADMIN`-konstanten reduseres til `{ id: 'superadmin', username: 'DanielAlexander' }` — ingen `passwordHash`
- `STORAGE_KEYS.session` fjernes (Firebase Auth-persistens dekker dette)

### 5.4 `js/features/classroom/services/classroomService.js`

- `createDemoClassroom()` fjernes eller erstattes med kall til `ensureDemoData` Cloud Function
- Andre referanser til `password`-felt erstattes med `passwordHash`

### 5.5 `js/shared/core/dataService.js`

- Alle steder som setter `password: hashedPassword` endres til `passwordHash: hashedPassword`

### 5.6 `js/features/users/controllers/usersController.js` og `js/features/auth/controllers/authController.js`

- Passord-reset, registrering, brukerendring: bruke `passwordHash`-feltnavn

### 5.7 Nye filer for backup-UI

- `js/features/backups/index.js` — public surface
- `js/features/backups/services/backupService.js` — kaller Cloud Functions
- `js/features/backups/controllers/backupsController.js` — UI-rendering, knapper, modaler

### 5.8 `index.html`

Legg til Firebase Auth + Functions compat-script:

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-functions-compat.js"></script>
```

Legg til Backups-seksjon i superadmin-dashboard. Legg til lås/lås-opp-knapp i klasserom-lista.

### 5.9 `js/features/i18n/services/languageService.js`

Nye i18n-nøkler (no + en) for:
- Backup-UI: `backups.title`, `backups.empty`, `backups.preview`, `backups.restore`, `backups.delete`
- Lås: `lock.lockClassroom`, `lock.unlockClassroom`, `lock.confirmLock`, `lock.locked`
- Auth-feil: `error.accountLocked`
- Restore-bekreftelse: `confirm.restoreClassroom`, `confirm.restoreClassroomFinal`

### 5.10 `js/shared/types/index.js`

JSDoc-typedef oppdateres:
- `User.password` → `User.passwordHash`
- + `User.locked`
- + `Classroom.locked`, `Classroom.lockedAt`, `Classroom.lockedBy`, `Classroom.lastResetAt`
- Ny `ClassroomBackup`-typedef

## 6. Firestore-regler

Se Seksjon 4 i brainstorming-dialogen for full regelfil. Kjernen:

- `isSignedIn()`, `isSuperAdmin()`, `isTeacher()`, `isStudent()`, `isInClassroom(cid)`, `isOwnUser(uid)` helpers
- Alle klasseromsdata-collections (`transactions`, `jobs`, etc.): `read, write` krever `isInClassroom(resource.data.classroomId)` med spesielt mønster for create (`request.resource.data.classroomId`)
- `users`: les egen + samme klasserom + alle for superadmin; skriv egen eller superadmin
- `classrooms`: les for medlemmer/superadmin, skriv for eget klasserom-lærer/superadmin
- `applications`: opprett kun hvis `applicantId === request.auth.uid`
- `notifications`: les hvis lærer/superadmin/mottaker
- `teacherRequests`: opprett-åpen, les/skriv kun superadmin
- `emailVerifications`, `passwordResets`: åpne (token-i-URL er sikkerhetsmekanismen)
- `classroomBackups`: les for lærer i klasserommet/superadmin, skriv kun via Cloud Function (`if false`)
- `loginStats`, `geoStats`: les for lærer/superadmin, skriv for innlogget

## 7. Testing

### 7.1 Firebase Emulator Suite

- `firebase init emulators` (auth + functions + firestore)
- `firebase emulators:start --import=./emulator-seed --export-on-exit`
- Klient peker på emulator via URL-parameter `?emulator=1` som setter `firebase.auth().useEmulator()` + `db.useEmulator()` + `functions.useEmulator()`

### 7.2 Vitest regel-tester

Bruker `@firebase/rules-unit-testing`. Minst 15 tester:

- Innlogget elev kan lese egen klasses transaksjoner ✓
- Innlogget elev kan IKKE lese annen klasses transaksjoner ✗
- Ikke-innlogget kan IKKE lese users ✗
- Lærer kan slette elev i eget klasserom ✓
- Lærer kan IKKE slette elev i annet klasserom ✗
- Superadmin kan lese alle klasserom ✓
- Anonym kan opprette `teacherRequests` ✓
- Anonym kan IKKE lese `teacherRequests` ✗
- Klient kan IKKE skrive `classroomBackups` direkte ✗
- Elev kan opprette egen `application` ✓
- Elev kan IKKE opprette `application` med annens `applicantId` ✗
- + 4 til for cross-cutting cases

### 7.3 Playwright integrasjonstester

Mot Live Server (med emulator) først, deretter mot prod etter deploy:

1. Login lærer/elev/superadmin (3 tester)
2. Feil passord → spesifikk feilmelding
3. Sesjon overlever sidereload
4. Logout rydder sesjon
5. Cross-classroom-lesing fra elev (DevTools console-injeksjon) → permission-denied
6. Reset klasserom → backup eksisterer i `classroomBackups`, klasserom er tomt
7. Restore fra backup → data gjenopprettet
8. Demo-reset (som demo-lærer) → demo-elever gjenoppstår
9. Glemt passord-flow → e-post sendes
10. Lærersøknad-skjema (uten innlogging) → opprettet
11. Lås klasserom → lærer kan ikke logge inn igjen, eksisterende sesjon ugyldig innen 1 time
12. Lås opp klasserom → lærer kan logge inn igjen

## 8. Deploy-rekkefølge

```
[Pre]   gcloud firestore export gs://econsim-5723c-backups/pre-auth-migration-$(date +%Y%m%d-%H%M)
[1]     firebase deploy --only functions:migrateAuthSchema
[2]     gcloud functions call migrateAuthSchema --region=europe-west1 (verifisér rapport)
[3]     firebase deploy --only functions  (alle nye + eksisterende)
[4]     npm run build:css && firebase deploy --only hosting
[5]     firebase deploy --only firestore:rules
[6]     Playwright full validation mot live URL
[7]     Hvis brudd: firestore.rules.legacy → firestore.rules + redeploy rules
```

Holdes en kopi av nåværende `firestore.rules` som `firestore.rules.legacy` midlertidig under cutover.

## 9. Dokumentasjons-oppdateringer

| Fil | Endring |
|---|---|
| `MANIFEST.md` | Stack-tabell oppdateres. Datamodell rename `password`→`passwordHash`, nye `locked`-felt. Nytt avsnitt om Backups-collection. Multi-tenant-seksjon: erstatt "klient-side håndhevet" med "Firestore-rules-håndhevet". Ny §15: "Slett klasse / restore / lås". |
| `CLAUDE.md` | Auth-rad i stack: "Firebase Auth + Custom Tokens". Note om `getCurrentClaims()`. |
| `docs/ARCHITECTURE.md` | Auth-seksjon omskrives. Cloud Functions-rolle utvides. |
| `docs/OPERATIONS.md` | §5 Sikkerhet: "Implementert per 2026-05-09". Ny §11 Backups+lås. |
| `docs/TESTING.md` | Emulator Suite-seksjon, regel-tester, Playwright-flow. |
| `docs/DEPLOYMENT.md` | Cloud Functions-listen. Region. |
| `docs/BRUKSANVISNING.md` | Slett-klasse for lærere (var udokumentert). Restore + lås for superadmin. |
| `SECURITY.md` | "Tidligere begrensninger (løst 2026-05-09)". Ny trusselmodell. |
| `CHANGELOG.md` | `## v6.1.0 — 2026-05-09 — Firebase Auth-migrering`. |
| `js/shared/types/index.js` | JSDoc oppdateringer. |

## 10. Suksesskriterier

- [ ] `migrateAuthSchema` kjørt mot prod, rapport viser forventet rename + opprettet superadmin-doc
- [ ] Alle nye Cloud Functions deployet i `europe-west1`
- [ ] Klient logger inn for alle tre roller via Firebase Auth, sesjon overlever sidereload
- [ ] Strenge `firestore.rules` deployet, alle 15+ regel-tester grønne
- [ ] Playwright-suite grønn mot prod (12+ tester)
- [ ] `classroomBackups` opprettes ved reset, lagres trygt, kan listes og restore'es av superadmin
- [ ] Lås/lås-opp-flow virker: lærer kan ikke logge inn etter lås, kan etter lås opp
- [ ] Global `resetEconSim()` fjernet fra prod-bundle
- [ ] Demo-klasserom opprettes via `ensureDemoData` ved første kjøring etter en `firebase firestore:delete`
- [ ] Alle dokumenter oppdatert (MANIFEST, CLAUDE, ARCHITECTURE, OPERATIONS, TESTING, DEPLOYMENT, BRUKSANVISNING, SECURITY, CHANGELOG, JSDoc-typer)
- [ ] CHANGELOG har ny v6.1.0-entry

## 11. Kjente fallgruver

1. **Token-refresh etter claims-endring:** Klient må kalle `getIdToken(true)` etter at admin SDK setter custom claims (f.eks. når lærer flytter klasserom). Bygd inn i `authService.refreshClaims()`.
2. **Custom claims max 1000 bytes:** Vi er trygt under (~80 bytes), men hold pakkeløse claims smale.
3. **Cloud Function cold start:** Første login etter inaktivitet kan være 2-3 sekunder treg. Forventet og akseptabel UX.
4. **revokeRefreshTokens grace-periode:** Eksisterende lærer-sesjon ugyldiggjøres innen ~1 time, ikke umiddelbart. For sterkere håndhevelse kan Firestore-rules senere lese `classroom.locked` per write — utskutt til reelt behov oppstår.
5. **Demo-klasserom kan ikke opprettes av uautentisert klient:** Cloud Function `ensureDemoData` bruker admin SDK og er offentlig callable, men er idempotent og trygg.
6. **Firestore-rules-deployment er separat fra hosting-deployment:** `firebase deploy --only hosting` deployer IKKE rules. Cutover-rekkefølgen krever to separate kommandoer.
7. **`functions/data/initial-data.json` må kopieres ved deploy:** Cloud Function-bundlet må inkludere demo-data-filen. Setter `predeploy`-skript i `firebase.json` eller bare commit'er en kopi i `functions/`-mappen.
8. **Mixed-case usernames i legacy data:** `dataService.getUserByUsername` har en case-insensitive fallback, men `authenticateUser` Cloud Function bruker strikt `where`-query. `migrateAuthSchema` lowercaser alle stored usernames for å unngå at gamle mixed-case-konti ikke kan logge inn etter migrering.

## 12. Hva er IKKE i scope

- Migrering til Firebase Functions v2 / modular SDK (ny økt)
- bcrypt eller annen passordsalting (ny økt — krever overgangsstrategi for eksisterende hasher)
- App Check (ny økt)
- Per-write rule-check av `Classroom.locked` (utskutt — token-revoke er nok for nå)
- Rate-limiting i `loginStats` for brute-force-mitigering (ny økt)
- Ekstra superadmin-konto for redundans (egen oppgave når sikkerhetsrutiner etableres)
- UI for å se og slette egne klasserom-backups som lærer (kun superadmin har restore-UI nå)

# EconSim — Prosjektguide for Claude

Norsk klasseromsøkonomisimulator for ungdomsskolen (7.–10. klasse). Lærer oppretter virtuelt klasserom med egen valuta (`KlasseKrone` / `KKr`); elever deltar i en simulert økonomi med jobber, sparing, fond, lån, skatt og bedrifter.

- **Live URL:** https://econsim-5723c.web.app
- **Firebase-prosjekt:** `econsim-5723c`
- **Gjeldende versjon:** v6.1.0 (mai 2026) — Firebase Auth-migrering deployet 2026-05-09
- **Pågående arbeid:** v6.0-restrukturering på branch `refactor/v6-restructure`. v6-spec: [docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md](docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md). Auth-spec: [docs/superpowers/specs/2026-05-09-firebase-auth-migration-design.md](docs/superpowers/specs/2026-05-09-firebase-auth-migration-design.md).

For full systembeskrivelse, les [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) først (~10 min lesetid). Denne filen forklarer hvordan AI skal jobbe i prosjektet.

---

## Status for v6-restrukturering

Vi har migrert fra organisk vokst monolitt til feature-basert arkitektur. Arbeidet har skjedd trinnvis; hver fase committes separat på `refactor/v6-restructure` og er verifisert mot live appen via Playwright.

| Fase | Status |
|------|--------|
| 0 — Branch og sikkerhetsnett | Ferdig |
| 1 — Død kod, CSS-konsolidering, dokumentsplitting | Ferdig |
| 2 — Verktøy (ESLint, Prettier, Vitest, JSDoc) | Ferdig |
| 3 — Data-lag forenkling (passthrough fjernet, firebaseService til shared/) | Ferdig |
| 4 — Splitt `index.html` til templates | **Utsatt** (se under) |
| 5a — Service-laget migrert til `js/features/X/` | Ferdig |
| 5b — Splitt `main.js` til feature-controllers | **Pågår** (se under) |
| 6 — Ytelse (Firestore offline persistence + composite indexes) | Ferdig |
| 7 — JSDoc-typer og Vitest-tester | Ferdig (24 tester grønne) |
| 8 — Cutover (denne oppdateringen) | Ferdig |
| 9 — Firebase Auth + strenge rules + backups + lås | Ferdig 2026-05-09 |

### Hva er utsatt og hvorfor

**Fase 4 (template-ekstrakering fra index.html):** index.html er fortsatt ~3 200 linjer og inneholder alle skjermer skjult med `hidden`-klasse. Et komplett uttrekk krever en `templateLoader` med livssyklus (activate/deactivate per controller) og er tett koblet til fase 5b. Skal gjøres feature-for-feature i fremtidig økt.

**Fase 5b (controller-ekstrakering fra main.js):** Betydelig progress siden start — `main.js` er redusert fra ~12 200 linjer til **~2 355 linjer**. Alle 13 features har egne controller-filer i `js/features/X/controllers/`. Det som fortsatt ligger i `main.js`:

- Bootstrap og init-flow (`init`, `initializeUserServices`, `setupEventListeners`) — beholdes der
- Tre top-level dashboard-renderere: `showStudentDashboard`, `showTeacherDashboard`, `showSuperadminDashboard`
- Settings-modalen (`showSettingsModal`, `saveSettings`, `saveStudentSettings`) — kompleks, krysser flere features
- Tab-bytting: `showStudentScreen`, `showTeacherScreen`
- Demo-helpers (`ensureDemoKariAccess`, `ensureDemoClassroomIntegrity`)
- Noen legacy job/transfer-flows (`showCreateJobModal`, `handleCreateJob`, `handleGiveMoney`)
- `refreshAllServiceCaches` (cross-cutting)

Anbefalt videre arbeid: trekk ut **settings-modalen** (~300 linjer, krysser settings + tax + classroom + users) og **dashboard-renderere** (~400 linjer hver) som egne moduler. Demo-helpers kan flyttes til `features/classroom/`. Når dette er ferdig vil `main.js` være ~500 linjer ren bootstrap.

Begrunnelse: fase 4 (templates) er fortsatt stort arbeid som krever testing av hver UI-flow. Med Playwright tilgjengelig som sikkerhetsnett kan dette gjøres i fremtidige økter.

---

## Arkitektur

### Mappestruktur (etter v6 fase 5a)

```
js/
├── main.js                 # ~2 355 linjer (bootstrap + dashboard-renderere; settings-modal og dashboards kan flyttes videre)
│
├── features/               # Domeneorientert: én mappe = ett konsept
│   ├── auth/
│   ├── businesses/
│   ├── classroom/
│   ├── email/
│   ├── i18n/               # languageService
│   ├── jobs/
│   ├── loans/
│   ├── notifications/
│   ├── savings/
│   ├── scheduler/
│   ├── settings/
│   ├── stats/
│   ├── taxes/
│   ├── transactions/
│   └── users/
│
└── shared/                 # Plattform: data, UI, utils, typer
    ├── config/
    ├── core/               # dataService, eventBus, firebaseService
    ├── types/              # JSDoc @typedef
    ├── ui/                 # uiManager
    └── utils/              # formatters, helpers, validators
```

### Feature-mappemal

```
features/X/
├── services/               # Forretningslogikk
│   └── Xservice.js
├── index.js                # Public surface (det andre features importerer fra)
└── (controllers/, templates/ — kommer i fase 5b)
```

**Public surface:** Andre features importerer alltid via `js/features/X/index.js`, ALDRI direkte fra services. Internt kan filer flyttes uten å bryte konsumenter.

### Avhengighetsregler

| Fra | Til | Tillatt? |
|-----|-----|----------|
| `features/X/services/` | `shared/*` | Ja |
| `features/X/services/` | `features/Y/index.js` | **Ja** (atomiske transaksjoner krever direkte kall) |
| `features/X/services/` | `features/Y/services/Y.js` direkte | Nei (gå via index.js) |
| `features/X/controllers/` | annet feature's controllers | Nei (bruk eventBus) |
| `shared/*` | `features/*` | Bør unngås (én eksisterende violation: `shared/ui/uiManager.js` → `auth`-feature, lev med det inntil fase 5b) |
| Sirkulær import | hvor som helst | Nei (ESLint blokkerer) |

ESLint regler (`import-x/no-cycle`, `import-x/no-self-import`) håndhever dette i dag. `import-x/no-restricted-paths` er klargjort men deaktivert — aktiveres når fase 5b er ferdig.

---

## Teknologistack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | HTML5 + ES6 Modules |
| CSS | Tailwind CSS — kompilert fra `src/input.css` til `css/output.css` |
| Database | Firebase Firestore (compat SDK via CDN) med IndexedDB offline persistence |
| Hosting | Firebase Hosting |
| Bakgrunnsjobber | Firebase Cloud Functions (ukentlig + månedlig trigger-doc) |
| Autentisering | Firebase Auth + Custom Tokens (Cloud Function `authenticateUser` verifiserer SHA-256 serverside) |
| E-post | EmailJS / Gmail SMTP via Cloud Functions |
| Utviklerverktøy | ESLint 10, Prettier 3, Vitest 4, TypeScript 6 (kun checkJs) |

### Tailwind

CSS kompileres fra `src/input.css` (Tailwind-direktiver + custom CSS) til `css/output.css`. **Klasser som ikke finnes i kompilert fil vil ikke virke.** Verifiser med Grep i `css/output.css` før bruk. Kjør `npm run build:css` etter endringer.

Bekreftet tilgjengelig: `hover:bg-gray-200`. Ikke tilgjengelig: `hover:bg-gray-100`. For ikke-kompilerte farger/gradienter bruk inline `style=`.

---

## Kjernekonsepter

### Kontostruktur

Tre-sifret kontonummer per klasserom:
- `000` Sentralbank (utømmelig)
- `001` Skattekasse
- `101–199` Elev-sjekk-kontoer
- `201–299` Sparekontoer (parres med 1XX)
- `301–399` Fondskontoer (parres med 1XX)
- `501–999` Bedriftskontoer

### Brukertyper

`superadmin` (DanielAlexander), `teacher`, `student`.

### Tidsmodell

1 uke i appen = 1 måned virkelig (`accelerated`). Sparerente 2 % årlig (`/12` per uke). Fondsavkastning 8 % ± 3 % kvartalsvis. Scheduler trigger ukentlig via Cloud Functions; klienten utfører prosesseringen ved første lærer-innlogging etter trigger.

### Skattesystem

Flat eller progressiv:
- 0–500 KKr: 0 %
- 501–1500 KKr: 25 %
- 1500+ KKr: 35 %
- Fradragsgrense: 500 KKr
- Utbytteskatt: 22 %

### Sparerente — kritisk invariant

```javascript
import { periodInterest } from './interestCalculator.js';
const interest = periodInterest(account.balance, ratePerPeriod);
```

**Bruk `Math.round`, ikke `Math.floor`** — ellers får lave saldoer aldri rente. Helperen i `js/features/savings/services/interestCalculator.js` enforcer dette og er testet i `interestCalculator.test.js`.

### Async-mønster

Alle data-endringer kreves awaitet, inkludert refresh:

```javascript
await savingsService.depositToSavings(user.id, amount);
await authService.refreshCurrentUser();
await this.loadStudentSavings();
await this.updateBalanceDisplay();
```

### Service-init

Alle services har `initialize()` og `refreshCache()` kalt fra `initializeUserServices()` i `main.js`.

### Cross-feature kommunikasjon

- **Service-lag**: direkte import via `index.js` (forretningslogikk gjenbrukes — skatt leser saldoer fra sparing/fond/bedrift)
- **UI-lag**: via `shared/core/eventBus`. Standard-events: `balance.changed`, `notification.new`, `classroom.switched`, `user.loggedIn` / `user.loggedOut`

### Auth og Firestore-rules (etter 2026-05-09)

- Login går via Cloud Function `authenticateUser` (region `europe-west1`) som returnerer Firebase Custom Token med claims `{ userType, classroomId, accountNumber }`.
- Klient bruker `signInWithCustomToken` og lytter på `onAuthStateChanged` som single source of truth.
- `authService.getCurrentClaims()` returnerer claims fra token. Bruk dette for raske rolle-/klasse-sjekker — unngår Firestore-roundtrip.
- Etter `setCustomUserClaims` på server: kall `authService.refreshClaims()` for å tvinge token-refresh.
- Firestore-rules håndhever `request.auth.token.classroomId == resource.data.classroomId` på alle klasseromsdata. Cross-classroom-tilgang er server-side blokkert.
- **Alle queries må filtreres på `classroomId`** for å passere strenge rules. `dataService.getUsers/getJobs/getApplications/getTransactions` auto-filtrerer på `_currentClassroomId`. `getClassroomData` normaliserer `econsim_X`-prefiks (legacy).
- Reset/restore/lås kjører som Cloud Functions med admin SDK — klient kan ikke skrive `classroomBackups` direkte (rule: `allow write: if false`).

---

## Vanlige fallgruver

1. **Tailwind output.css** — verifiser klasse i kompilert fil før bruk. Kjør `npm run build:css` etter endringer.
2. **ES6 modules** — relative import-paths må stemme; bruk feature `index.js` aldri direkte service-filer.
3. **Cirkulære imports** — `languageService` skal **ikke** importeres i `firebaseService.js`. ESLint fanger dette.
4. **Race conditions** — alle Firebase-kall er async. Display-refresh etter dataendring må awaites.
5. **Klasserom-isolering** — scheduler og notifikasjoner validerer klasserom-ID mot cache. `refreshCache()` kalles ved klasserombytte.
6. **Virtuelle kontoer** — overføringer til `000` (sentralbank) og `001` (skattekasse) håndteres spesielt i `firebaseService` og trekkes/legges ikke til vanlige brukerkontoer.
7. **Firebase persistence** — slått på i `firebaseService.initialize()`. Feiler stille i inkognito-modus eller hvis flere faner.

---

## Vanlige kommandoer

```bash
# Lokal utvikling: åpne index.html med Live Server (VS Code) på http://127.0.0.1:5500
npm run watch:css        # Tailwind watch i bakgrunnen

# Build og deploy
npm run build:css        # Bygg Tailwind én gang
npm run deploy           # Bygg + firebase deploy

# Verktøy
npm run lint             # ESLint
npm run lint:fix         # Auto-fix
npm run format           # Prettier
npm run typecheck        # tsc --noEmit (sjekker JSDoc-typer)
npm test                 # Vitest (24 tester per nå)
npm run test:watch       # Watch mode
npm run verify           # lint + typecheck + test
```

Se [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full oppsett.

---

## Testing med Playwright

For verifikasjon under utvikling: en Playwright MCP-extension er installert lokalt. AI-assistent kan navigere til `http://127.0.0.1:5500/`, logge inn (demo-kontoer: `laerer`/`passord`, `kari123`/`passord123`), klikke gjennom UI og lese console errors. Bruk dette til å bekrefte at endringer ikke knekker eksisterende flows.

---

## Firebase-konfigurasjon

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBx3FV9i8KvBMrHgpfJr6EF513YuDn-Zog",
  authDomain: "econsim-5723c.firebaseapp.com",
  projectId: "econsim-5723c",
  storageBucket: "econsim-5723c.firebasestorage.app",
  messagingSenderId: "501287582420",
  appId: "1:501287582420:web:0e411f12bfcbb064cb9941"
};
```

Firebase SDK lastes via compat CDN i `index.html`. **Ikke** bruk modular SDK.

Composite indexes definert i `firestore.indexes.json` for `transactions/jobs/loans/businesses/notifications/users` filtrert på `classroomId`.

---

## Dokumentkart

| Dokument | Innhold |
|----------|---------|
| [README.md](README.md) | Kort intro, målgruppe, dokumentkart |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System-referanse |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Lokalt oppsett, npm-scripts |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Firebase-deploy |
| [docs/BRUKSANVISNING.md](docs/BRUKSANVISNING.md) | Sluttbruker-guide |
| [CHANGELOG.md](CHANGELOG.md) | Versjonshistorikk |
| [docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md](docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md) | v6-restruktureringsspec |

---

## Kontakt

**Utvikler:** Daniel Alexander Andersen Fosse
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com

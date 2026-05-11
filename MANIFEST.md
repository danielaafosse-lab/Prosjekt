# EconSim — Prosjektmanifest

**Den autoritative AI-leseguiden for EconSim.** Denne filen er bygd for å gi en ny AI-assistent (eller utvikler) det fulle bildet på én gjennomlesning. Andre dokumenter er målrettet mot spesifikke lesere; dette er den som binder alt sammen.

| Lesere | Hvor å starte |
|---|---|
| AI-assistent som skal endre kode | Denne filen, deretter [CLAUDE.md](CLAUDE.md) for korte konvensjoner |
| Ny utvikler | Denne filen, deretter [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Drift / produksjons-feilsøking | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Testing / QA | [docs/TESTING.md](docs/TESTING.md) |
| Sluttbruker (lærer, elev) | [docs/BRUKSANVISNING.md](docs/BRUKSANVISNING.md) |
| Versjonshistorikk | [CHANGELOG.md](CHANGELOG.md) |

---

## Innhold

1. [Hva er EconSim](#1-hva-er-econsim)
2. [Status og versjon](#2-status-og-versjon)
3. [Teknologistack](#3-teknologistack)
4. [Arkitektur](#4-arkitektur)
5. [Filstruktur](#5-filstruktur)
6. [Datamodell](#6-datamodell)
7. [Forretningsregler](#7-forretningsregler)
8. [UI-arkitektur](#8-ui-arkitektur)
9. [Tidsmodell og scheduler](#9-tidsmodell-og-scheduler)
10. [Multi-tenant og klasserom-isolasjon](#10-multi-tenant-og-klasserom-isolasjon)
11. [Utvikling](#11-utvikling)
12. [Testing](#12-testing)
13. [Deploy](#13-deploy)
14. [Fallgruver](#14-fallgruver)
15. [Hvordan endre koden](#15-hvordan-endre-koden)
16. [Demo-data og kontoer](#16-demo-data-og-kontoer)
17. [Kontakt](#17-kontakt)

---

## 1. Hva er EconSim

EconSim er en norsk klasseromsøkonomisimulator for ungdomsskolen (7.–10. klasse, 13–16 år). Læreren oppretter et virtuelt klasserom med egen valuta (standard `KlasseKrone` / `KKr`), og elevene deltar i en simulert økonomi med:

- **Sjekkkonto** for daglige utgifter
- **Jobber** for å tjene penger (vanlige + bedriftsjobber)
- **Sparekonto** med fast årlig rente (2 %)
- **Fondskonto** med variabel avkastning (8 % ± 3 %)
- **Lån** med årlig rente
- **Skatt** (flat eller progressiv) trukket på lønn og utbytte
- **Bedrifter** med eierandeler, ansatte og utbytte

Læringen kommer fra direkte erfaring: hvordan lønn beskattes, hvorfor sparing gir renter, hva risiko er, hvordan en bedrift fungerer fra både eier- og ansatt-siden.

---

## 2. Status og versjon

- **Live URL:** https://econsim-5723c.web.app
- **Firebase-prosjekt:** `econsim-5723c`
- **Hovedversjon:** v5.2.1 (mars 2026)
- **Pågående arbeid:** v6.0 — feature-basert restrukturering på branch `refactor/v6-restructure`

### v6 fase-status

| Fase | Status |
|---|---|
| 0 — Branch og sikkerhetsnett | Ferdig |
| 1 — Død kod, CSS-konsolidering, dokumentsplitting | Ferdig |
| 2 — Verktøy (ESLint, Prettier, Vitest, JSDoc) | Ferdig |
| 3 — Data-lag forenkling | Ferdig |
| 4 — Splitt `index.html` til templates | Pågår |
| 5a — Service-laget migrert til `js/features/` | Ferdig |
| 5b — Splitt `main.js` til feature-controllers | Pågår |
| 6 — Ytelse (offline persistence, indekser) | Ferdig |
| 7 — JSDoc-typer og Vitest-tester | Ferdig (24 tester) |
| 8 — Cutover | Ferdig |
| 9 — Firebase Auth + strenge rules + backup/restore/lås | Ferdig (2026-05-09) |

Se [CHANGELOG.md](CHANGELOG.md) for full versjonshistorikk og [docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md](docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md) for v6-design.

---

## 3. Teknologistack

| Komponent | Teknologi |
|---|---|
| Frontend | HTML5 + ES6 Modules (ingen bundler) |
| CSS | Tailwind CSS — kompilert fra `src/input.css` til `css/output.css` |
| Database | Firebase Firestore (compat SDK via CDN) med IndexedDB offline persistence |
| Hosting | Firebase Hosting |
| Bakgrunnsjobber | Firebase Cloud Functions (ukentlig + månedlig trigger-doc) |
| Autentisering | Firebase Auth + Custom Tokens (server-side SHA-256-verifisering via Cloud Function `authenticateUser`) |
| E-post | Nodemailer via Cloud Functions (Gmail SMTP) |
| Utviklerverktøy | ESLint 10, Prettier 3, Vitest 4, TypeScript 6 (kun checkJs) |

**Bevisste valg:**
- Compat-CDN istedenfor modular SDK (enklere oppsett, tilstrekkelig for skala)
- JSDoc istedenfor TypeScript (lavere migrasjonskost, samme nytte for AI-typesjekk)
- Ingen bundler (Vite, webpack) — ES modules lastes direkte
- Egenutviklet auth (full kontroll over flow, unngår Firebase Auth-kompleksitet)

---

## 4. Arkitektur

### 4.1 Toppnivå

```
js/
├── main.js                 # ~2 355 linjer (redusert fra ~12 200; resterende: bootstrap + 3 dashboard-renderere + settings-modal)
├── features/               # Domeneorientert: én mappe = ett konsept
└── shared/                 # Plattform: data, UI, utils, typer
```

### 4.2 Feature-mappemal

```
features/X/
├── services/               # Forretningslogikk
│   └── Xservice.js
├── index.js                # Public surface (det andre features importerer fra)
└── (controllers/, templates/ — kommer trinnvis i fase 5b)
```

**Public surface:** Andre features importerer alltid via `js/features/X/index.js`, ALDRI direkte fra `services/`. Internt kan filer flyttes uten å bryte konsumenter.

### 4.3 Avhengighetsregler

| Fra | Til | Tillatt? |
|---|---|---|
| `features/X/services/` | `shared/*` | Ja |
| `features/X/services/` | `features/Y/index.js` | Ja (atomiske transaksjoner krever direkte kall) |
| `features/X/services/` | `features/Y/services/Y.js` (direkte) | Nei (gå via index.js) |
| `features/X/controllers/` | annet feature's controllers | Nei (bruk eventBus) |
| `shared/*` | `features/*` | Bør unngås (én eksisterende: `shared/ui/uiManager.js` → `auth`) |
| Sirkulær import | hvor som helst | Nei (ESLint blokkerer) |

ESLint-regler `import-x/no-cycle` og `import-x/no-self-import` håndhever dette.

### 4.4 Cross-feature kommunikasjon

- **Service-lag**: direkte import via `index.js`. Forretningslogikk er gjenbrukbar (skatt leser saldoer fra sparing/fond/bedrift).
- **UI-lag**: via `shared/core/eventBus`. Standard-events:
  - `balance.changed` — `{ userId, accountId? }`
  - `notification.new` — `{ userId, type, message }`
  - `classroom.switched` — `{ classroomId }`
  - `user.loggedIn` / `user.loggedOut`

---

## 5. Filstruktur

### 5.1 Repo-rot

```
/Prosjekt
├── index.html              # Entry point — alle skjermer, lastes via Live Server eller Firebase Hosting
├── 404.html                # 404-side
├── favicon.ico
├── package.json            # npm-scripts og devDependencies
├── firebase.json           # Hosting + Firestore-konfig
├── firestore.rules         # Sikkerhetsregler
├── firestore.indexes.json  # Composite indexes
├── tailwind.config.js
├── eslint.config.js        # Flat config med import-x
├── tsconfig.json           # checkJs på JSDoc
├── vitest.config.js
├── .prettierrc.json
├── .gitignore
│
├── README.md               # Kort intro
├── MANIFEST.md             # Denne filen
├── CLAUDE.md               # Kort AI-konvensjons-guide
├── CHANGELOG.md            # Versjonshistorikk
│
├── data/initial-data.json  # Demo-data
├── functions/              # Firebase Cloud Functions
│   ├── index.js            # E-post + scheduler triggers
│   ├── package.json
│   └── ...
│
├── docs/                   # Detaljert dokumentasjon
│   ├── ARCHITECTURE.md     # Dypdykk i arkitektur
│   ├── DEVELOPMENT.md      # Lokal utvikling
│   ├── DEPLOYMENT.md       # Deploy-prosedyre
│   ├── BRUKSANVISNING.md   # Sluttbrukerveiledning
│   └── superpowers/specs/  # Designspesifikasjoner
│
├── src/input.css           # Tailwind-kilde (direktiver + custom CSS)
├── css/output.css          # Kompilert (det index.html laster)
│
└── js/                     # All applikasjonskode (se under)
```

### 5.2 `js/`-treet

```
js/
├── main.js                                    # App-controller (utsplittes i fase 5b)
│
├── features/
│   ├── auth/services/authService.js           # Innlogging, sesjon, SHA-256
│   ├── businesses/services/businessService.js # Bedrifter, eierandeler, utbytte
│   ├── classroom/services/classroomService.js # Multi-tenant klasserom
│   ├── email/services/emailService.js         # Verifisering, passordreset via Cloud Function
│   ├── i18n/services/languageService.js       # Norsk/engelsk oversettelser
│   ├── jobs/services/jobService.js            # Vanlige + bedriftsjobber
│   ├── loans/services/loanService.js          # Lån, rentebetaling, mislighold
│   ├── notifications/services/notificationService.js
│   ├── savings/services/savingsService.js     # Sparekonto + fond
│   ├── savings/services/interestCalculator.js # Pure-math helper, testet i Vitest
│   ├── scheduler/services/schedulerService.js # Ukentlig prosessering (klient-side)
│   ├── settings/services/settingsService.js
│   ├── stats/services/statsService.js         # Innlogging-statistikk, geo
│   ├── taxes/services/taxService.js           # Flat + progressiv skatt
│   ├── transactions/services/transactionService.js
│   ├── users/services/userService.js
│   └── (hver feature har en index.js som er public surface)
│
└── shared/
    ├── config/config.js                       # Konstanter, defaults, enums
    ├── core/
    │   ├── dataService.js                     # Domain data layer (Firestore-cached)
    │   ├── firebaseService.js                 # Generisk Firestore CRUD-wrapper
    │   └── eventBus.js                        # Pub/sub
    ├── types/index.js                         # JSDoc @typedef for alle entiteter
    ├── ui/uiManager.js                        # Modaler, toasts, navigasjon
    └── utils/
        ├── formatters.js                      # currency, dato
        ├── helpers.js                         # SHA-256, escapeHtml, m.m.
        └── validators.js
```

---

## 6. Datamodell

### 6.1 Kontostruktur — 3-sifret nummer per klasserom

| Nummer | Type | Beskrivelse |
|---|---|---|
| `000` | Sentralbank | Utømmelig kilde — fra sentralbanken |
| `001` | Skattekasse | Samler inn skatteinnbetalinger |
| `101–199` | Elev-sjekk | Elevens hovedkonto (maks 99 elever) |
| `201–299` | Sparekonto | Følger elev: 103 → 203 |
| `301–399` | Fondskonto | Følger elev: 103 → 303 |
| `501–999` | Bedriftskonto | Maks 499 bedrifter per klasserom |

### 6.2 Brukertyper

| Type | Tilgang |
|---|---|
| `superadmin` | Ser alle klasserom; oppretter lærere. Brukernavn: `DanielAlexander` (hardkodet). |
| `teacher` | Administrerer eget klasserom: jobber, betalinger, innstillinger. |
| `student` | Ser eget dashboard: saldo, jobber, sparing, lån, bedrifter. |

### 6.3 Hovedentiteter (JSDoc-typedef i `js/shared/types/index.js`)

| Entitet | Felt (utvalg) |
|---|---|
| `User` | `id`, `username` (lowercase), `name`, `accountNumber`, `type`, `balance`, `classroomId`, `passwordHash`, `locked` |
| `Classroom` | `id`, `teacherId`, `className`, `settings`, `locked`, `lockedAt`, `lockedBy`, `lastResetAt` |
| `ClassroomBackup` | `id`, `classroomId`, `createdAt`, `createdBy`, `reason` (`'reset'`/`'pre-restore'`/`'demo-reset'`), full snapshot av users + alle klasseromsdata |
| `SavingsAccount` | `id`, `ownerId`, `classroomId`, `balance` |
| `FundAccount` | Som SavingsAccount |
| `Transaction` | `id`, `classroomId`, `from`, `to`, `amount`, `description`, `type`, `createdAt` |
| `Job` | `id`, `classroomId`, `title`, `salary`, `jobType`, `status`, `assignedTo`, `businessId?` |
| `Loan` | `id`, `borrowerId`, `principal`, `remainingBalance`, `interestRate`, `status` |
| `Business` | `id`, `accountNumber`, `name`, `owners[]`, `employees[]`, `balance`, `status` |
| `Notification` | `id`, `userId`, `type`, `title`, `message`, `read` |

### 6.4 Firestore-collections

`users`, `classrooms`, `transactions`, `jobs`, `applications`, `businesses`, `loans`, `savings`, `funds`, `notifications`, `messages`, `inbox`, `outbox`, `weeklySnapshots`, `schedulerTriggers`, `teacherRequests`, `emailVerifications`, `passwordResets`, `loginStats`, `geoStats`, `jobApplications`, `ownershipOffers`, `taxAccount`, `classroomBackups` (NY 2026-05-09), `migrationLog` (NY 2026-05-09).

Subcollections forekommer for `businesses`, `loans`, `savings`, `notifications` (sub per klasserom).

---

## 7. Forretningsregler

### 7.1 Skatt

To modi i klasseromsinnstillinger:

**Flat skatt:**
- Én prosentsats (typisk 20 %)
- Trekkes på lønn etter fradrag

**Progressiv skatt:**
- Trinn 1: 0–500 KKr → 0 %
- Trinn 2: 501–1500 KKr → 25 %
- Trinn 3: 1500+ KKr → 35 %

**Felles:**
- Fradragsgrense: 500 KKr (skattefritt beløp)
- Utbytteskatt: 22 % på utbytte fra bedrifter
- All skatt går til kontoen `001` (skattekasse)
- `Math.floor` brukes for skattebeløp (alltid avrund nedover — gunstigere for elev)

### 7.2 Sparerente og fondsavkastning

**Sparekonto:**
- 2 % årlig rente
- Periodisk rate: `annualRate / 100 / periodsPerYear` (12 i akselerert modus)
- Renteinntekt: `Math.round(balance * periodRate)` — **ALDRI `Math.floor`** (ellers får små saldoer aldri rente)

Disse er ekstrahert til `js/features/savings/services/interestCalculator.js` og testet.

**Fond:**
- 8 % årlig forventet avkastning
- ± 3 % variasjon (Box-Muller normalfordelt)
- Beregnes kvartalsvis (hver 3. uke i akselerert modus)
- Negativ avkastning er mulig

### 7.3 Lån

- Definert årlig rente i klasseromsinnstillinger (typisk 5–10 %)
- Rentebetaling trekkes fra elevkonto månedlig
- Misligholdsstatus etter X uker uten betaling
- Lån har `principal` (opprinnelig beløp) og `remainingBalance` (gjenstående)

### 7.4 Lønn

- Settes per jobb (ukentlig beløp)
- Utbetales av lærer manuelt eller automatisk via scheduler
- Skatt trekkes ved utbetaling (hvis aktivert)
- Ansatte i bedrifter: bedrift betaler ut, beløp registreres i transaksjoner

### 7.5 Bedrifter

- Opprettelse koster `businessStartupCost` (default 500 KKr)
- Maks ansatte = `bedrift.balance / businessEmployeeCostFactor` (default 500 → maks 1 ansatt per 500 KKr i kasse)
- Eierandeler: `[{ userId, percentage, costBasis }]`
- Ansatte: `[{ userId, salary, title, startDate }]`
- Utbytte: `(remainingBalance * percentage) / 100` etter at lønn er betalt
- Nedleggelse: lønn først, deretter utbytte til eiere

### 7.6 Virtuelle kontoer

Overføringer til `000` (sentralbank) og `001` (skattekasse) håndteres spesielt i `firebaseService` — disse er ikke vanlige user-objekter og krever spesialcase-logikk:

- `000`: trekkes ALDRI fra (utømmelig); kan kun motta og sende
- `001`: akkumulerer skatt; lærer kan se beholdning på Skattekasse-fanen

---

## 8. UI-arkitektur

### 8.1 Skjermbytte

- `showTeacherScreen(name)` og `showStudentScreen(name)` i `main.js`
- Aktiv fane-klasse: `bg-blue-600 hover:bg-blue-700 text-white`
- Inaktiv fane-klasse: `bg-white hover:bg-gray-200 text-gray-800`
- Aktiv-merking via regex-replace (skifte mellom de to mønstrene)

### 8.2 i18n

- `data-i18n="key"` — erstatter element-tekst
- `data-i18n-placeholder="key"` — erstatter input placeholder
- `data-i18n-tooltip="key"` — erstatter title-attributt
- Norsk/engelsk byttes via `languageService.setLanguage('no'|'en')`
- Inline språkbytter i `<head>` kjører før moduler lastes (raskt)

### 8.3 Varsler-badge

- `inboxBadge` (elev), `teacherMessagesBadge` (lærer)
- `notificationService.updateBadges()` oppdaterer ved hver dataendring
- Null-sjekk `if (!el) return` håndterer manglende element

### 8.4 Modaler

- Bekreftelse: `uiManager.showConfirm({ title, body, onConfirm })`
- Toast: `uiManager.showSuccess(text)` / `showError(text)`
- Dialoger har egne `<div id="...Modal">` i index.html, vises/skjules med `hidden`-klasse

---

## 9. Tidsmodell og scheduler

**Akselerert modus (default):** 1 uke i app = 1 måned virkelig.
- Sparerente per uke: `annualRate / 12`
- Fondsavkastning hver 3. uke (kvartalsvis virkelig)
- Lønn månedlig (=ukentlig i app)

**Realistisk modus:** 1 uke = 1 uke. Brukes sjelden.

### Scheduler

Cloud Function (`functions/index.js`) kjører:
- **Ukentlig** (mandag 08:00 norsk tid): setter trigger-dokument `schedulerTriggers/wYYYY-WW`
- **Månedlig** (1. kl. 08:00): trigger-dokument `schedulerTriggers/mYYYY-MM`

**Klient-side prosessering:** Når lærer logger inn, sjekker `schedulerService` for uprosesserte triggere og kjører:
1. Sparerente til alle elever
2. Fondsavkastning hvis kvartal
3. Lånerente
4. (valgfritt) Lønn til alle aktive jobber
5. Marker trigger som `processed: true`

Idempotens via `lastProcessed`-tidsstempel på klasserommet.

---

## 10. Multi-tenant og klasserom-isolasjon

- Hvert klasserom er isolert. Brukere i klasserom A kan ikke se data fra klasserom B.
- Alle queries filtrerer på `classroomId` (composite indekser i `firestore.indexes.json`).
- `dataService.setCurrentClassroomId(id)` styrer hvilket klasserom som er aktivt for innlogget bruker.
- Ved klasserombytte (gjelder superadmin/lærer med flere klasser): `refreshCache()` kalles på alle services.

**Sikkerhetsmodell (per 2026-05-09):**
- Firebase Auth + Custom Tokens med claims (`userType`, `classroomId`, `accountNumber`)
- `firestore.rules` håndhever **serverside** at lese/skrive krever matching `classroomId` på dokumenter (basert på `request.auth.token.classroomId`)
- Cross-classroom-tilgang er server-side blokkert; klient-omgåelse er ikke mulig
- Cloud Functions (admin SDK) omgår reglene for spesielle operasjoner: reset, restore, backup, lås, skjema-migrering
- Brukere kan kun lese egen `User`, eget klasseroms data, og egne kontoer

---

## 11. Utvikling

### 11.1 Lokal kjøring

```bash
# 1. Klon repoet
git clone https://github.com/<din-fork>/EconSim.git
cd EconSim

# 2. Installer avhengigheter
npm install
cd functions && npm install && cd ..

# 3. Bygg CSS
npm run build:css

# 4. Start Tailwind i watch-modus (i én terminal)
npm run watch:css

# 5. Åpne med Live Server (VS Code-extensjon) på http://127.0.0.1:5500
```

### 11.2 npm-scripts

| Script | Hva det gjør |
|---|---|
| `npm run build:css` | Bygg Tailwind én gang |
| `npm run watch:css` | Bygg Tailwind i watch-modus |
| `npm run lint` | ESLint på `js/` |
| `npm run lint:fix` | Auto-fix |
| `npm run format` | Prettier write |
| `npm run typecheck` | `tsc --noEmit` med JSDoc |
| `npm test` | Vitest run |
| `npm run test:watch` | Vitest watch-modus |
| `npm run verify` | lint + typecheck + test |
| `npm run deploy` | Bygg CSS + `firebase deploy --only hosting` |

### 11.3 Demo-kontoer

Disse opprettes automatisk i demo-klasserommet ved første kjøring:

| Type | Brukernavn | Passord |
|---|---|---|
| Superadmin | `DanielAlexander` | (egen) |
| Lærer | `laerer` | `passord` |
| Elev | `kari123` | `passord123` |

**Reset av all data:** I konsollen: `resetEconSim()`.

---

## 12. Testing

### 12.1 Vitest

24 tester per nå, dekker:
- `js/features/taxes/services/taxService.test.js` (12 tester) — flat + progressiv skatt, fradrag, malformede brackets
- `js/features/savings/services/interestCalculator.test.js` (12 tester) — periode-rate, Math.round-invariant, negative/NaN-håndtering

Kjør med `npm test`. Mål: < 1 sekund total kjøretid.

### 12.2 Playwright (manuell og AI-drevet)

En Playwright MCP-extensjon er installert lokalt. AI-assistent kan:
- Navigere til `http://127.0.0.1:5500/` (Live Server) eller `https://econsim-5723c.web.app/` (prod)
- Logge inn som demo-brukere
- Klikke gjennom UI
- Lese console errors live

Brukes til å verifisere UI-endringer før commit.

### 12.3 ESLint + typecheck

Kjøres med `npm run verify`. Pre-eksisterende warnings i `main.js` (ca. 200) representerer kjente issues som adresseres feature-for-feature i fase 5b.

---

## 13. Deploy

### 13.1 Firebase Hosting

```bash
npm run deploy
# Eller manuelt:
npx firebase deploy --only hosting
```

`firebase.json` ekskluderer dev-filer (docs, tester, configs) — kun `index.html`, `404.html`, `css/output.css`, `js/`, `data/`, `favicon.ico` og lignende blir lastet opp.

### 13.2 Firestore-regler og indekser

```bash
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
```

### 13.3 Cloud Functions

```bash
npx firebase deploy --only functions
```

**Krever Gmail-konto** for utgående mail. Konfigurer:
```bash
firebase functions:config:set gmail.email="..." gmail.password="..."
```

### 13.4 Full deploy

```bash
npx firebase deploy
```

Deployer hosting + firestore (rules + indexes) + functions.

---

## 14. Fallgruver

### 14.0 Field-navngivnings-invarianter (kritisk for AI)

Disse feltnavnene brukes konsistent. Endring av dem bryter ting stille — det er ingen runtime-validering. Verifiser med grep før refactor.

| Type | Feltnavn | Ikke skriv |
|---|---|---|
| User | `accountNumber` (3-sifret string, f.eks. `'101'`) | `accountId`, `account_no` |
| User | `passwordHash` (SHA-256 hex) | `password`, `pwHash` |
| Business | `owners[{ userId, percentage, costBasis }]` | `ownership`, `ownerId` |
| Business | `employees[{ userId, salary, title, startDate }]` | `staff`, `workers` |
| Business | `accountNumber` (501–999) | `id` (det er `id`-feltet på businesses-doc, men kontonummeret er `accountNumber`) |
| JobApplication | `applicantId` | `studentId`, `userId` (`userId` finnes på andre typer, kan forvirre) |
| Transaction | `from` og `to` (3-sifrede accountNumbers, ikke userIds) | `senderId`, `recipientId` |
| Transaction | `type` (string: 'transfer', 'salary', 'tax', 'interest', 'dividend', 'loan_payment') | enum-tall |
| Loan | `borrowerId` (userId) | `userId` |
| Loan | `principal`, `remainingBalance` (forskjellige!) | `amount` (uklart hvilken) |
| Notification | `userId` (mottaker) | `recipientId`, `to` |
| Classroom | `teacherId` (én lærer per klasserom per nå) | `teachers[]` |

Virtuelle kontoer:
- `'000'` — sentralbank (utømmelig)
- `'001'` — skattekasse

Disse er IKKE brukerobjekter. Ikke prøv å lese dem som `User`. Spesialcase i `firebaseService.js`.

### 14.1 Tailwind output.css

Klasser som ikke finnes i `css/output.css` virker ikke. Verifiser med Grep før bruk. Etter endring i HTML/JS: kjør `npm run build:css`.
   - Bekreftet tilgjengelig: `hover:bg-gray-200`
   - Ikke tilgjengelig: `hover:bg-gray-100`
   - For uvanlige farger: bruk inline `style=`

2. **ES6 modules** — `index.html` bruker `<script type="module" src="js/main.js">`. Relative import-paths må stemme. Ingen bundler — bruk `index.js` for cross-feature import.

3. **Sirkulære imports** — `languageService` SKAL IKKE importeres i `firebaseService` (kjent bug-kilde). ESLint fanger dette.

4. **Race conditions** — alle Firebase-kall er async. Display-refresh etter dataendring må awaites:
   ```javascript
   await savingsService.depositToSavings(user.id, amount);
   await authService.refreshCurrentUser();
   await this.loadStudentSavings();
   await this.updateBalanceDisplay();
   ```

5. **Klasserom-isolering** — scheduler og notifikasjoner validerer `classroomId` mot cache. `refreshCache()` må kalles ved klasserombytte.

6. **Virtuelle kontoer** — `000` og `001` håndteres spesielt. Ikke prøv å lese dem som `User`-objekter.

7. **Math.round vs Math.floor** — for sparerente, bruk `Math.round`. For skatt, bruk `Math.floor`. Disse er forskjellige med vilje (gunstig retning for elev).

8. **Firebase persistence** — `enablePersistence` kan feile i inkognito-modus eller når flere faner er åpne. Feilen logges som warning, blokkerer ikke startup.

9. **Inline event-handlers (`onclick="..."`)** — main.js har mange. Ved omarrangering av kode: husk at de refererer til `window.econSim.metode(...)`, så metoden må eksistere på den globale `econSim`-instansen.

10. **Duplicate class methods** — JS klasser kan ikke overload. Hvis to metoder har samme navn, vinner den siste. Sjekk med `grep -n` før refactor.

### 14.2 Sletting og kaskade-effekter

EconSim har **ingen referanse-integritet** i Firestore. Når noe slettes, må kall-stedene rydde opp manuelt — ellers blir det "orphaned" data som forvirrer UI.

| Slettet objekt | Hva som SKJER (automatisk) | Hva som IKKE rydes (potensielle orphans) |
|---|---|---|
| Klasserom | `transactions`, `jobs`, og brukere knyttet til klasserommet slettes via `deleteClassroom()` | `applications`, `loans`, `savings`, `notifications`-subcollections kan henge igjen — sjekk og slett manuelt |
| Bruker (elev) | `savings`, `funds`, og `loans` for brukeren slettes | `applications` med `applicantId === userId` blir orphan; `notifications` med `userId === userId` blir orphan; `Business.owners[]` og `Business.employees[]` referanser ryddes IKKE |
| Bruker (lærer) | Klasserommet de eier blir uten lærer | Ingen automatisk overføring; lærer-felt på classroom blir feil. **Ikke slett en lærer som eier et aktivt klasserom uten å overføre først.** |
| Bedrift | `Business`-doc slettes, transaksjoner med bedrift som from/to consultes ikke | Ansatte er fortsatt referert i `User`-objektet via lønn-jobben; jobs som peker til business får "orphan" `businessId` |
| Jobb | Jobb-dokumentet slettes | Aktive `applications` for jobben blir orphan; `assignedTo`-bruker har fortsatt jobben i sin profil |

**Regel:** Før du legger til en sletting i koden, kartlegg ALL referanser til det slettede objektet og rydd dem eksplisitt.

---

## 15. Hvordan endre koden

### 15.1 Når du legger til en ny feature

1. Opprett `js/features/<navn>/services/<navn>Service.js`
2. Lag `js/features/<navn>/index.js` som re-eksporterer
3. Importer kun via `js/features/<navn>/index.js` fra andre features
4. Hvis du trenger UI: legg controllers i `js/features/<navn>/controllers/` (når fase 5b er ferdig for enkelte features)
5. Skriv tester for ren forretningslogikk i `<navn>Service.test.js`

### 15.2 Når du endrer en eksisterende feature

1. Åpne `js/features/<navn>/`-mappen
2. Endre kun innenfor mappen hvis mulig
3. Endre aldri en annen features interne filer
4. Kjør `npm run verify` etter endring
5. Verifiser med Playwright at flowen fortsatt fungerer

### 15.3 Når du fikser en bug

1. Reproduser i Live Server eller prod
2. Skriv test som fanger feilen (hvis ren logikk)
3. Fiks
4. Verifiser med Playwright
5. Commit med beskrivelse av rotårsak (ikke bare symptom)

### 15.4 Commit-konvensjoner

```
type(scope): kort beskrivelse

Lengre forklaring av hvorfor og hva. Ikke gjenta diff-en.
Hvis bug: hva var rotårsaken?
Hvis refactor: hva var motivasjonen?

Co-Authored-By: <om relevant>
```

Type kan være: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `chore`.
Scope er ofte fase-nummer (f.eks. `fase5a`) eller feature-navn (f.eks. `taxes`).

### 15.5 Slett klasse / restore / lås

**Lærer — slett klasse og start på nytt:** Innstillinger-modal har en "Slett klasse og start på nytt"-knapp i bunn. Cloud Function `resetClassroom` tar **automatisk backup** til `classroomBackups`-collection før sletting. Backupen beholdes i 90 dager. Klassen beholder lærer-konto og klasserom-doc, men alle elever, transaksjoner, jobber, bedrifter, lån, sparing, notifikasjoner og meldinger slettes.

**Superadmin — Backups-dashboard:** Egen seksjon nederst i superadmin-dashboard som lister alle backups, med knapp for å forhåndsvise, gjenopprette og slette. Restore tar **pre-restore-backup først** så operasjonen er reverserbar. Krever dobbel bekreftelse (klasserom-ID må skrives inn).

**Superadmin — lås lærer + klasserom:** Hver klasserom-rad i lista har en `🔒 Lås`-knapp ved siden av `🗑️ Slett`. Lås revoker lærerens Firebase Auth refresh-token (eksisterende sesjon ugyldiggjøres innen ~1 time) og blokkerer fremtidige login-forsøk via `authenticateUser` Cloud Function (`auth.accountLocked`-feilmelding). Lås opp via samme knapp.

**Implementasjon:** Alle tre operasjoner kjører som Cloud Functions med admin SDK (omgår Firestore-rules). Klient-koden er kun et tynt UI-lag som kaller funksjonene. Filer:
- Service: `js/features/backups/services/backupService.js`
- Controller: `js/features/backups/controllers/backupsController.js`
- Cloud Functions: `resetClassroom`, `restoreClassroom`, `setClassroomLocked`, `listBackups`, `previewBackup`, `deleteBackup`, `cleanOldBackups` (alle i `europe-west1`)

**Manuell nuke (utvikling):** `window.resetEconSim()` er fjernet fra prod-bundle (var et utviklingsverktøy). For utviklingsbruk:
```bash
firebase firestore:delete --all-collections --recursive --project econsim-5723c
```
Etter nuke kjøres `ensureDemoData` Cloud Function automatisk fra klienten ved første sidebesøk for å gjenopprette demo-klasserom.

---

## 16. Demo-data og kontoer

Når appen starter for første gang opprettes følgende automatisk:

**Demo-klasserom:** `7A Demo`
- ID: `demo-classroom`
- Lærer: `t1` (Demo Lærer)
- Elever: 14 demo-elever

**Demo-innlogginger:**

| Brukernavn | Passord | Rolle |
|---|---|---|
| `laerer` | `passord` | Demo-lærer |
| `kari123` | `passord123` | Demo-elev (Kari Nordmann) |

**Reset:** `resetEconSim()` i nettleser-konsollen sletter all data og oppretter demo-klasserom på nytt.

---

## 17. Kontakt

**Utvikler:** Daniel Alexander Andersen Fosse  
**Institusjon:** HVL (Høgskulen på Vestlandet)  
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com  
**Live URL:** https://econsim-5723c.web.app

---

## Endringer til dette manifestet

Denne filen erstatter den opprinnelige `MANIFEST.md` (slettet i fase 1, gjenopprettet 2026-05-08 etter tilbakemelding om at AI trenger én samlende kilde). Innholdet er konsolidert fra `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, og `CLAUDE.md` for å unngå duplisering. Når en endring berører hele systemet, oppdater denne filen først — andre dokumenter er målrettede og kan referere hit.

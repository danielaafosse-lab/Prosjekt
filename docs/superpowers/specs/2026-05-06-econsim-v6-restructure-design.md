# EconSim v6 — Total restrukturering (Design)

**Dato:** 2026-05-06
**Forfatter:** Daniel Alexander Andersen Fosse (med Claude Opus 4.7 som med-utvikler)
**Status:** Utkast — venter på review
**Mål-versjon:** EconSim v6.0

---

## 1. Bakgrunn og motivasjon

EconSim er en levende produksjonsapp (https://econsim-5723c.web.app) brukt av elever og lærere i 7.–10. klasse. Etter omfattende organisk vekst gjennom v3.0 → v5.2 har kodebasen fått strukturelle problemer som hindrer både fremtidig vedlikehold og kjøretidsytelse:

- `js/main.js` er **12 257 linjer** og blander auth, alle dashboards, navigasjon, modaler, skjema-håndtering og service-init i én fil.
- `index.html` er **3 265 linjer** med alle skjermer side om side, kontrollert med `hidden`-klasse.
- `MANIFEST.md` er **2 371 linjer** og blander changelog, visjon, arkitektur og brukerguide. Flere overskrifter har korrupt formatering.
- Tre lag for hver datatilgang (`dataService` → `dataService.firebase` → `firebaseService`) — to er ren passthrough.
- Død kod: `dataService.localStorage.js` etterlatt etter Firebase-migrering, tom `js/models/`-mappe.
- CSS-kildene er splittet i to: `src/input.css` (Tailwind-direktiver, brukt av build) og `css/styles.css` (custom CSS, separat). CLAUDE.md beskriver feilaktig `css/styles.css` som kilden.
- Ingen ESLint, ingen tester, ingen typeinformasjon.
- Firestore-mønstre er ikke designet for samtidig last (potensielle hot documents, ingen batch writes for multi-konto-operasjoner, scheduler kjører i serie).

### Mål

1. **Fremtidig AI-assistert utvikling skal være effektiv og trygg.** Hver fil skal ha ett tydelig ansvar slik at endringer kan gjøres uten å lese hele kodebasen.
2. **Kjøretidsytelse skal håndtere skoleskala** (~50 klasserom, ~30 elever per klasse, samtidig pålogging på skoledagens start).
3. **Funksjonalitet skal være uendret** — ingen feature legges til eller fjernes som del av restruktureringen.
4. **Migrasjonen skal være trinnvis** — appen skal fungere etter hver fase, aldri "big bang".

### Ikke-mål (eksplisitt utelatt)

- TypeScript-migrering (JSDoc gir 80 % av nytten med 10 % av jobben)
- Vite eller annen bundler (compat-CDN er tilstrekkelig for prosjektet)
- Firebase modular SDK-migrering
- Ny autentisering (eksisterende SHA-256-løsning beholdes)
- Nye features eller atferdsendringer

---

## 2. Arkitektur

### 2.1 Toppnivå-struktur

```
js/
├── features/      # Domeneorientert: én mappe = ett konsept
├── shared/        # Gjenbrukbar plattform (data, UI, utils, typer)
└── app/           # Sammenkobling: bootstrap, routing, skjermbytte
```

### 2.2 Avhengighetsregler (håndheves av ESLint)

| Fra → Til | Tillatt? |
|---|---|
| `features/X/services/` → `shared/*` | Ja |
| `features/X/services/` → `features/Y/services/` | **Ja** (atomiske transaksjoner krever direkte kall) |
| `features/X/services/` → `features/Y/controllers/` eller `templates/` | Nei |
| `features/X/controllers/` → `shared/*` | Ja |
| `features/X/controllers/` → egen `features/X/services/` | Ja |
| `features/X/controllers/` → `features/Y/*` | Nei (cross-feature UI = via eventBus) |
| `shared/*` → `features/*` eller `app/*` | Nei |
| `app/*` → alt | Ja (limet) |
| Sirkulær import | Nei (lint-feil) |

**Hvorfor cross-feature service-import er tillatt:** EconSim er en økonomisimulator der mange operasjoner er atomiske og må kalle flere domener (skatt leser saldoer fra sparing/fond/bedrift; lønnsutbetaling oppdaterer både bedrift og ansatt). Pure event-driven design ville ofret atomisitet og debug-bar stack trace for liten gevinst.

**Hvorfor cross-feature controller-import IKKE er tillatt:** UI-koden for én feature skal ikke kjenne UI-koden for en annen. Cross-feature UI-oppdatering går via `eventBus.emit('balance.changed', ...)`.

### 2.3 Feature-mappestruktur

Hver feature følger samme mønster:

```
features/savings/
├── services/
│   └── savingsService.js
├── controllers/
│   ├── studentSavingsController.js
│   └── teacherSavingsController.js
├── templates/
│   ├── studentSavings.html
│   └── teacherSavings.html
├── types.js               # JSDoc @typedef
└── index.js               # Publik kontrakt — re-eksport
```

`index.js` er den eneste filen andre features importerer fra. Internt kan filer flyttes uten å bryte konsumenter.

```javascript
// features/savings/index.js
export { savingsService } from './services/savingsService.js';
// Controllers og templates eksporteres IKKE — de er interne.
```

### 2.4 Liste over features

`auth`, `classroom`, `users`, `jobs`, `savings`, `loans`, `businesses`, `taxes`, `transactions`, `notifications`, `scheduler`, `stats`, `i18n`.

Hver eksisterende `js/services/*.js` blir én feature.

### 2.5 `shared/`-laget

```
shared/
├── core/
│   ├── firebase/          # Firestore-tilgang (splittet)
│   │   ├── init.js        # SDK-init, offline persistence
│   │   ├── users.js       # userRepo
│   │   ├── accounts.js    # accountRepo
│   │   ├── transactions.js # transactionRepo
│   │   └── listeners.js   # Klasserom-scoped listener-management
│   ├── eventBus.js        # Pub/sub
│   └── auth.js            # Innlogging og sesjonshåndtering
├── ui/
│   ├── modals.js          # await openModal({...})
│   ├── toasts.js          # showSuccess, showError
│   └── forms.js           # Felles skjema-helpere
├── utils/
│   ├── formatters.js      # currency, dato
│   ├── helpers.js
│   ├── validators.js
│   └── debounce.js
└── types/
    └── index.js           # Globale @typedef (User, Classroom, etc.)
```

### 2.6 `app/`-laget

```
app/
├── bootstrap.js           # Firebase-init, service-init, last brukerprofil
├── router.js              # showStudentScreen, showTeacherScreen, fane-aktivering
└── templateLoader.js      # fetch HTML-fragment, cache, injiser, livssyklus
```

### 2.7 Filstørrelsesmål

- Mål: fleste filer 100–500 linjer
- Hard øvre grense: **1500 linjer** per fil (håndheves som ESLint-warning, blokkerer ikke commit)
- Ingen fil skal blande UI med forretningslogikk
- En fil som overstiger 1500 linjer skal splittes — ofte avslører det at filen har mer enn ett ansvar

---

## 3. Sentrale designvalg

### 3.1 Templates

- HTML-fragmenter ligger i `features/X/templates/*.html`
- Lastes lazy ved fane-bytte: `templateLoader.load('savings/studentSavings.html')`
- Caches i minnet etter første last
- Variabel-substitusjon via `data-bind`-attributter (ingen template-engine)
- Controllers eksponerer strikt livssyklus: `activate(container)` og `deactivate()`

### 3.2 Modaler

Erstatter dagens scatter med synkron API:

```javascript
const result = await openModal({
  title: 'Bekreft',
  body: '...',
  buttons: [{ label: 'Ja', value: true }, { label: 'Nei', value: false }]
});
```

### 3.3 Event-typer

Standardiserte event-navn i `shared/core/eventBus.js`:

- `balance.changed` — `{ userId, accountId? }`
- `notification.new` — `{ userId, type, message }`
- `classroom.switched` — `{ classroomId }`
- `user.loggedIn` / `user.loggedOut`
- `screen.activated` / `screen.deactivated` — `{ screenName }`

### 3.4 Data-laget

`firebaseService.js` slettes som monolitt og deles i:
- `firebase/init.js` — Firebase-init, offline persistence
- `firebase/users.js` — `userRepo`
- `firebase/accounts.js` — `accountRepo`
- `firebase/transactions.js` — `transactionRepo` med `transfer()`, `batch()`, `runTransaction()`
- `firebase/listeners.js` — klasserom-scoped listener-management

`dataService.js`, `dataService.firebase.js`, `dataService.localStorage.js` slettes.

### 3.5 Typer (JSDoc)

`tsconfig.json` med `checkJs: true, allowJs: true, noEmit: true`. Ingen TS-migrering — kun typesjekking av eksisterende JS via JSDoc.

```javascript
/**
 * @typedef {Object} SavingsAccount
 * @property {string} id              // 3-sifret kontonummer
 * @property {string} ownerId
 * @property {string} classroomId
 * @property {number} balance
 * @property {number} annualRate
 * @property {Date} createdAt
 */
```

Kjernetyper i `shared/types/index.js`: `User`, `Classroom`, `Account`, `Transaction`, `Job`, `Loan`, `Business`, `Notification`.

---

## 4. Ytelse og skala

Mål: tåle 50 klasserom, 30 elever per klasse, samtidig pålogging.

| # | Tiltak | Plassering |
|---|---|---|
| 1 | Klasserom-scopede listeners — én aktiv listener per innlogget bruker | `shared/core/firebase/listeners.js` |
| 2 | Firestore offline persistence aktivert | `shared/core/firebase/init.js` |
| 3 | Batch writes for alle multi-konto-operasjoner | Per relevant feature-service |
| 4 | Transactions for atomiske overføringer | `transactionRepo.transfer()` |
| 5 | Aggregat-shards for klasseromsstatistikk | `features/stats/` |
| 6 | Scheduler parallelliseres med `Promise.all` per klasserom | Cloud Functions |
| 7 | Composite indexes for aktive queries | `firestore.indexes.json` |
| 8 | Pagination på lange lister (25 om gangen) | UI-controllers |
| 9 | Debounce på rapid-fire skrivinger (500 ms) | `shared/utils/debounce.js` |
| 10 | Lazy load av features (controller + template ved fane-klikk) | `app/templateLoader.js` |

### 4.1 Hot document-mitigering

Klasseromsstatistikk skrives ikke til ett dokument. Bruker shard-mønster:
- `classrooms/{id}/statsShards/{0..9}` — tilfeldig shard per skriving
- Aggregeres på lese-tid (sum over 10 dokumenter)
- Skaler opp shard-antall hvis nødvendig

### 4.2 Scheduler

Cloud Function for ukentlig prosessering:
1. Hent liste over alle klasserom
2. `Promise.all(classrooms.map(processClassroom))` — parallelt
3. Hver `processClassroom` er idempotent (kan kjøres på nytt uten dupliserte effekter)
4. Idempotens via `lastProcessed`-tidsstempel per klasserom

---

## 5. Verktøy

### 5.1 npm-scripts

```json
{
  "dev": "concurrently \"npm run css:watch\" \"firebase serve\"",
  "css:build": "tailwindcss -i src/input.css -o css/output.css --minify",
  "css:watch": "tailwindcss -i src/input.css -o css/output.css --watch",
  "lint": "eslint js",
  "format": "prettier --write .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "deploy": "npm run css:build && npm run lint && npm run typecheck && npm test && firebase deploy"
}
```

### 5.2 ESLint-konfig (relevante regler)

- `no-restricted-imports` — håndhever avhengighetsregler i §2.2
- `no-unused-vars`, `no-undef`, `no-console` (warning)
- `import/no-cycle` — sirkulær import = feil

### 5.3 Tester (Vitest)

Start på service-laget der logikk er ren:
- `features/taxes/services/taxService.test.js` — flat og progressiv skatteberegning, fradrag, utbytteskatt
- `features/savings/services/savingsService.test.js` — renteberegning, innskudd/uttak
- `features/loans/services/loanService.test.js` — rentebetaling, mislighold

Mocker `firebase/*` repoer. Ikke 100 % dekning — fokus på kjernelogikk.

---

## 6. Dokumentasjon

### 6.1 Ny dokumentstruktur

```
README.md                    # Kort intro, lenker til docs
CLAUDE.md                    # Oppdateres til ny struktur
CHANGELOG.md                 # Ren versjonslogg (ekstrahert fra MANIFEST.md)

docs/
├── ARCHITECTURE.md          # ~300 linjer, lesbart på 10 min
├── DEVELOPMENT.md           # Lokal oppsett, npm-scripts, test-kjøring
├── DEPLOYMENT.md            # Hvordan deploye
└── BRUKSANVISNING.md        # Beholdes (sluttbruker-guide)
```

### 6.2 Splitting av MANIFEST.md

- Versjonshistorikk → `CHANGELOG.md` (kortere format, kun versjon + dato + endringer)
- Arkitektur og kontostruktur → `docs/ARCHITECTURE.md`
- Visjon og pedagogiske tilpasninger → `README.md`
- Deployment og oppsett → `docs/DEPLOYMENT.md` og `docs/DEVELOPMENT.md`
- Korrupte/duplikate seksjoner kasseres
- `MANIFEST.md` slettes

---

## 7. Migrasjonsplan

Kritisk: appen skal fungere etter HVER fase. Ingen "big bang"-rewrite. Hver fase commiteres separat på `refactor/v6-restructure`-branch.

### Fase 0 — Sikkerhetsnett

- Opprett branch `refactor/v6-restructure`
- Skriv smoke-tester for kritiske flows (login, lønn, skatt, sparing, lån) som kjøres i Firebase emulator
- Slå på Firestore offline persistence
- Eksisterende Firestore-data og produksjon røres ikke

### Fase 1 — Død kod og dokumentasjon (lav risiko)

- Slett `js/core/dataService.localStorage.js` og tom `js/models/`-mappe
- Konsolider CSS: slå sammen custom CSS fra `css/styles.css` inn i `src/input.css` (Tailwind-kilden), og verifiser at `index.html` kun lenker til `css/output.css`. Dette gir én sannhet for kildekoden. Slett `css/styles.css` etter merge.
- Splitt `MANIFEST.md` til ny dokumentstruktur (§6)
- Oppdater `CLAUDE.md` til å reflektere ny struktur (selv om koden ennå ikke er flyttet — markeres som "kommer i fase 5")

### Fase 2 — Verktøy (lav risiko)

- Legg til `eslint.config.js`, `.prettierrc`, `vitest.config.js`, `tsconfig.json`
- Oppdater `package.json` med scripts
- Kjør `prettier --write .` én gang for konsistent stil
- Lint-feil i eksisterende kode dokumenteres men ikke nødvendigvis fikses ennå

### Fase 3 — Data-lag (medium risiko)

- Slå sammen `dataService` + `dataService.firebase` → `firebaseService`
- Splitt `firebaseService.js` til `shared/core/firebase/*` (foreløpig sti, blir endelig i fase 5)
- Eksponer `userRepo`, `accountRepo`, `transactionRepo`
- Oppdater alle eksisterende imports
- Smoke-test før commit

### Fase 4 — Splitt `index.html` (medium risiko)

- Bygg `templateLoader` og minimal router i `app/`
- Trekk ut én skjerm om gangen til `templates/*.html`
- Test hver skjerm før neste
- `index.html` reduseres trinnvis til ~300 linjer

### Fase 5 — Splitt `main.js` til features (høy risiko, gjøres feature-for-feature)

Rekkefølge — minst-koblet først, mest-koblet sist:
1. `i18n` — ren biblioteksfunksjonalitet
2. `notifications` — få avhengigheter
3. `stats` — få avhengigheter
4. `auth` — kjernefunksjon, men selv-isolert
5. `users` — administrasjon
6. `classroom` — multi-tenant-håndtering
7. `transactions` — sentral, bør være stabilt før domene-features migreres
8. `savings`
9. `loans`
10. `jobs`
11. `businesses`
12. `taxes` — leser fra de fleste andre, migreres sist
13. `scheduler` — orchestrator, til slutt

For hver feature:
- Opprett `features/X/` med struktur fra §2.3
- Trekk ut services og controllers fra `main.js`
- Trekk ut templates fra `index.html`
- Definer `index.js` (publik kontrakt)
- Oppdater alle konsumenter
- Smoke-test før neste feature
- `main.js` krymper trinnvis til 0 linjer og slettes

### Fase 6 — Ytelse

Etter strukturen er på plass:
- Aktiver batch writes i lønn, skatt, sparerente
- Konverter atomiske overføringer til transactions
- Implementer aggregat-shards for stats
- Parallelliser scheduler i Cloud Functions
- Opprett composite indexes
- Implementer pagination i UI-lister
- Lasttest med simulerte 50 klasserom (Firestore emulator + script)

### Fase 7 — Typer og tester

- Skriv `@typedef` for alle modeller
- Vitest-tester for skatte-, sparings-, og lånetjeneste
- Sett opp `tsc --noEmit` i CI

### Fase 8 — Cutover

- Manuell QA-runde: alle elev-flows, alle lærer-flows, scheduler
- Sammenlign med produksjon
- Merge `refactor/v6-restructure` → `main`
- Tag `v6.0.0`
- Deploy

---

## 8. Verifisering per fase

Etter hver fase kjøres følgende. Ingen fase committes hvis noe feiler.

```bash
npm run lint
npm run typecheck
npm test
npm run css:build
# Manuell smoke-test: login som lærer, login som elev, kjør lønnsutbetaling, kjør skatteukrun
```

---

## 9. Risiko og mitigering

| Risiko | Sannsynlighet | Mitigering |
|---|---|---|
| Brutt funksjonalitet under fase 5 | Høy | Trinnvis per feature, smoke-test mellom hver |
| Firebase-data inkompatibilitet | Lav | Datamodell endres ikke. Kun kode-organisering. |
| Ytelse-regresjon fra lazy loading | Lav-medium | Mål første-load-tid før og etter. Cache aggressivt. |
| ESLint-håndhevelse blokkerer migrering | Medium | Aktiver regler trinnvis. Migrering-overganger får eslint-disable med kommentar. |
| `templateLoader` event-lekkasje | Medium | Strikt `activate`/`deactivate`-livssyklus. Lint-regel for å sjekke at controllers definerer begge. |
| Cloud Functions-endringer går galt | Medium | Test i Firebase emulator først. Behold gammel scheduler bak feature flag inntil ny er bekreftet. |

---

## 10. Suksesskriterier

Restruktureringen er komplett når:

1. Ingen JS-fil er over 1500 linjer, og ingen blander UI med forretningslogikk
2. `main.js` er slettet
3. `index.html` er ≤ 400 linjer
4. `MANIFEST.md` er slettet, dokumentasjon er splittet ifølge §6
5. ESLint, Prettier, Vitest, og JSDoc-typesjekk kjører grønt
6. Alle eksisterende features fungerer identisk som før (verifisert via smoke-tester og manuell QA)
7. Cloud Function-scheduler kjører parallelt per klasserom
8. Firestore offline persistence er aktivert og testet
9. Lasttest med 50 klasserom × 30 elever passerer uten timeouts eller rate-limit-feil
10. Ny utvikler (eller AI) kan finne og endre én feature uten å lese resten av kodebasen

---

## 11. Åpne spørsmål

Ingen aktivt åpne — alle designvalg er tatt i samråd med utvikler.

Eventuelle endringer som dukker opp under implementasjon dokumenteres i implementasjonsplan.

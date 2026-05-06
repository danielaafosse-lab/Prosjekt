# EconSim — Prosjektguide for Claude

Norsk klasseromsøkonomisimulator for ungdomsskolen (7.–10. klasse). Lærer oppretter virtuelt klasserom med egen valuta (`KlasseKrone` / `KKr`); elever deltar i en simulert økonomi med jobber, sparing, fond, lån, skatt og bedrifter.

- **Live URL:** https://econsim-5723c.web.app
- **Firebase-prosjekt:** `econsim-5723c`
- **Gjeldende versjon:** 5.2.1 (mars 2026)
- **Pågående arbeid:** v6.0 — total restrukturering på branch `refactor/v6-restructure`. Se [docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md](docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md) for full spec.

For full systembeskrivelse, les [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) først (~10 min lesetid). Denne filen er en kort guide for hvordan AI skal jobbe i dette prosjektet.

---

## Status for v6-restrukturering

Vi migrerer fra organisk vokst monolitt (`main.js` 12k linjer, `index.html` 3k linjer) til feature-basert arkitektur. Migrering skjer i faser; appen skal fungere etter hver fase.

| Fase | Status |
|------|--------|
| 0 — Branch og sikkerhetsnett | I gang |
| 1 — Død kod, CSS-konsolidering, dokumentsplitting | Pågår |
| 2 — Verktøy (ESLint, Prettier, Vitest, JSDoc) | Ikke startet |
| 3 — Data-lag forenkling | Ferdig (passthrough fjernet, firebaseService flyttet til `js/shared/core/`) |
| 4 — Splitt `index.html` til templates | Ikke startet |
| 5 — Splitt `main.js` til features | Ikke startet |
| 6 — Ytelse (batch writes, scheduler-parallell, shards) | Ikke startet |
| 7 — JSDoc-typer og Vitest-tester | Ikke startet |
| 8 — Cutover til v6 | Ikke startet |

**Mål-arkitektur** (etter v6):

```
js/
├── features/      # Domeneorientert: én mappe = ett konsept (savings, jobs, taxes, ...)
├── shared/        # Plattform: data, UI, utils, typer
└── app/           # Sammenkobling: bootstrap, routing, templateLoader
```

Avhengighetsregler (vil håndheves av ESLint i fase 2):
- `features/X/services/` kan importere `shared/*` og andre features' services (atomiske transaksjoner)
- `features/X/controllers/` kan IKKE importere andre features' controllers (cross-feature UI går via `eventBus`)
- `shared/*` har ingen avhengigheter til features

---

## Teknologistack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | HTML5 + ES6 Modules |
| CSS | Tailwind CSS — **kompilert fra `src/input.css` til `css/output.css`** |
| Database | Firebase Firestore (compat SDK via CDN) |
| Hosting | Firebase Hosting |
| Bakgrunnsjobber | Firebase Cloud Functions (ukentlig + månedlig) |
| Autentisering | Egenutviklet (SHA-256 passord-hash) |
| E-post | EmailJS (passordgjenoppretting) |

### Viktig om Tailwind

CSS er kompilert til `css/output.css` ved hjelp av `npm run build:css`. **Klasser som ikke finnes i kompilert fil vil ikke virke.** Verifiser med Grep i `css/output.css` før du bruker en ny klasse. For farger/gradienter som ikke er kompilert, bruk inline `style=`.

Bekreftet tilgjengelig: `hover:bg-gray-200`. Ikke tilgjengelig: `hover:bg-gray-100`.

Etter endring av Tailwind-klasser i HTML eller JS, kjør `npm run build:css`.

---

## Gjeldende filstruktur (pre-v6)

```
/Prosjekt
├── index.html                    # Hele frontend (3k+ linjer — splittes i fase 4)
├── CLAUDE.md                     # Denne filen
├── README.md                     # Prosjekt-intro
├── CHANGELOG.md                  # Versjonshistorikk (Keep a Changelog format)
├── firebase.json                 # Firebase Hosting + Functions-konfig
├── firestore.rules               # Firestore sikkerheetsregler
├── package.json
│
├── docs/
│   ├── ARCHITECTURE.md           # Systemreferanse (les denne først)
│   ├── DEVELOPMENT.md            # Lokal utvikling
│   ├── DEPLOYMENT.md             # Deploy-guide
│   ├── BRUKSANVISNING.md         # Sluttbrukerguide (lærer/elev)
│   └── superpowers/specs/        # v6 design-spec
│
├── src/
│   └── input.css                 # Tailwind-kilde (direktiver + custom CSS)
│
├── css/
│   └── output.css                # Kompilert (DETTE er det som lastes)
│
├── data/
│   └── initial-data.json         # Startdata for demo-klasserom
│
├── functions/                    # Firebase Cloud Functions
│   └── index.js
│
└── js/
    ├── config.js                 # Konstanter, kontostatus-enums
    ├── main.js                   # 12k+ linjer — splittes i fase 5
    │
    ├── core/
    │   ├── auth.js
    │   ├── dataService.js                # Domain data layer (cached, ~1800 linjer — splittes i fase 5)
    │   └── eventBus.js
    │
    ├── shared/                    # v6-mål: gjenbrukbar plattform (fyles ut gjennom fase 5)
    │   └── core/
    │       └── firebaseService.js  # Generisk Firestore CRUD-wrapper
    │
    ├── services/                 # Forretningslogikk per domene
    │   ├── businessService.js
    │   ├── classroomService.js
    │   ├── emailService.js
    │   ├── jobService.js
    │   ├── languageService.js
    │   ├── loanService.js
    │   ├── notificationService.js
    │   ├── savingsService.js
    │   ├── schedulerService.js
    │   ├── settingsService.js
    │   ├── statsService.js
    │   ├── taxService.js
    │   ├── transactionService.js
    │   └── userService.js
    │
    ├── ui/
    │   └── uiManager.js          # Modaler, toasts, skjermbytte
    │
    └── utils/
        ├── formatters.js
        ├── helpers.js
        └── validators.js
```

---

## Kjernekonsepter (kortform — full beskrivelse i ARCHITECTURE.md)

### Kontostruktur

Tre-sifret kontonummer per klasserom:
- `000` Sentralbank (utømmelig kilde)
- `001` Skattekasse
- `101–199` Elev-sjekk-kontoer
- `201–299` Sparekontoer (parres med 1XX)
- `301–399` Fondskontoer (parres med 1XX)
- `501–999` Bedriftskontoer

### Brukertyper

`superadmin` (DanielAlexander), `teacher`, `student`.

### Tidsmodell

1 uke i appen = 1 måned virkelig. Sparerente 2 % årlig (`/12` per uke). Fondsavkastning 8 % ± 3 % kvartalsvis. Scheduler ukentlig via Cloud Functions.

### Skattesystem

Flat eller progressiv:
- 0–500 KKr: 0 %
- 501–1500 KKr: 25 %
- 1500+ KKr: 35 %
- Fradragsgrense: 500 KKr
- Utbytteskatt: 22 %

### Sparerente-formel

```javascript
const interest = Math.round(account.balance * periodRate);
```
**Bruk `Math.round`, ikke `Math.floor`** — ellers får lave saldoer aldri rente.

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

---

## Vanlige fallgruver

1. **Tailwind output.css** — verifiser at en klasse finnes i kompilert fil før bruk. Etter endring: `npm run build:css`.
2. **ES6 modules** — `index.html` bruker `type="module"`. Relative import-paths må stemme.
3. **Cirkulære imports** — `languageService` skal **ikke** importeres i `firebaseService.js` (kjent bug-kilde).
4. **Race conditions** — alle Firebase-kall er async. Display-refresh etter dataendring må awaites.
5. **Klasserom-isolering** — scheduler og notifikasjoner validerer klasserom-ID mot cache. `refreshCache()` kalles ved klasserombytte.
6. **Virtuelle kontoer** — overføringer til `000` (sentralbank) og `001` (skattekasse) håndteres spesielt i `firebaseService` og trekkes/legges ikke til vanlige brukerkontoer.

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

---

## Vanlige kommandoer

```bash
# Lokal utvikling: åpne index.html med Live Server (VS Code) på http://127.0.0.1:5500
npm run watch:css        # Tailwind watch

# Build og deploy
npm run build:css        # Bygg Tailwind én gang
npm run deploy           # Bygg + firebase deploy

# (Etter fase 2) — verktøy
npm run lint
npm run typecheck
npm test
```

Se [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full oppsett.

---

## Dokumentkart

| Dokument | Innhold |
|----------|---------|
| [README.md](README.md) | Kort intro, målgruppe, dokumentkart |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System-referanse (les denne først) |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Lokalt oppsett, npm-scripts |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Firebase-deploy |
| [docs/BRUKSANVISNING.md](docs/BRUKSANVISNING.md) | Sluttbruker-guide |
| [CHANGELOG.md](CHANGELOG.md) | Versjonshistorikk |
| [docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md](docs/superpowers/specs/2026-05-06-econsim-v6-restructure-design.md) | v6-restruktureringsspec |

---

## Kontakt

**Utvikler:** Daniel Alexander Andersen Fosse
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com

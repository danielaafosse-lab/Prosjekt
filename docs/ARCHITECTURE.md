# Arkitektur

Referansedokument for EconSim. Skal være lesbart på 10 minutter og dekke alt en utvikler eller AI-assistent trenger for å forstå systemet. For sluttbrukerveiledning, se [BRUKSANVISNING.md](BRUKSANVISNING.md). For versjonshistorikk, se [CHANGELOG.md](../CHANGELOG.md).

---

## Oversikt

EconSim er en norsk klasseromsøkonomisimulator for elever på 7.-10. trinn (13-16 år). Læreren oppretter et virtuelt klasserom med egen valuta (standard: `KlasseKrone` / `KKr`), og elevene deltar i en simulert økonomi med jobber, sparing, fond, lån, skatt og bedrifter. Appen er en monolittisk single-page-applikasjon i HTML5 + ES6 modules, hostet på Firebase Hosting med Firebase Firestore som datalager. Live URL: https://econsim-5723c.web.app.

---

## Teknologistack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | HTML5 + ES6 Modules (én monolittisk `index.html`) |
| CSS | Tailwind CSS, kompilert til `css/output.css` (ikke CDN) |
| Database | Firebase Firestore (compat SDK via CDN) |
| Hosting | Firebase Hosting |
| Bakgrunnsjobber | Firebase Cloud Functions (ukentlig + månedlig scheduler) |
| Autentisering | Egenutviklet (SHA-256 passord-hash, ingen Firebase Auth) |
| E-post | EmailJS (passordgjenoppretting) |
| Grafer | Chart.js 4.4.1 |

### Tailwind-merknader

CSS er kompilert én gang til `css/output.css`. **Klasser som ikke finnes i den kompilerte filen vil ikke virke.** Bekreftet tilgjengelig: `hover:bg-gray-200`. Ikke tilgjengelig: `hover:bg-gray-100`. For farger og gradienter som ikke er kompilert, bruk inline `style=`-attributt. Rekompiler med `npm run watch:css` ved behov.

### Firebase SDK

Firebase lastes via **compat-CDN** i `index.html`. Bruk **ikke** modular SDK — det vil bryte applikasjonens initialisering.

---

## Filstruktur

```
/Prosjekt
├── index.html                 # Hele frontend-applikasjonen (monolittisk)
├── CLAUDE.md                  # Prosjektguide for AI-assistenter
├── README.md                  # Prosjektintroduksjon
├── CHANGELOG.md               # Versjonshistorikk
├── firebase.json              # Firebase Hosting + Functions
├── firestore.rules            # Firestore sikkerhetsregler
├── package.json
│
├── css/
│   ├── styles.css             # Kildefil (Tailwind directives + custom CSS)
│   └── output.css             # Kompilert CSS — DETTE er det som brukes
│
├── data/
│   └── initial-data.json      # Startdata for demo-klasserom
│
├── docs/
│   ├── ARCHITECTURE.md        # Dette dokumentet
│   ├── BRUKSANVISNING.md      # Sluttbrukerveiledning
│   ├── DEVELOPMENT.md         # Lokal utvikling
│   └── DEPLOYMENT.md          # Produksjonsdeploy
│
├── functions/                 # Firebase Cloud Functions
│   └── index.js               # Ukentlig + månedlig scheduler
│
└── js/
    ├── main.js                # 12k+ linjer; controllers ekstrakeres feature-for-feature i fase 5b
    │
    ├── features/              # Domeneorientert: én mappe = ett konsept
    │   ├── auth/services/authService.js
    │   ├── businesses/services/businessService.js
    │   ├── classroom/services/classroomService.js
    │   ├── email/services/emailService.js
    │   ├── i18n/services/languageService.js
    │   ├── jobs/services/jobService.js
    │   ├── loans/services/loanService.js
    │   ├── notifications/services/notificationService.js
    │   ├── savings/services/savingsService.js
    │   ├── savings/services/interestCalculator.js  # Ren math-helper, testet
    │   ├── scheduler/services/schedulerService.js
    │   ├── settings/services/settingsService.js
    │   ├── stats/services/statsService.js
    │   ├── taxes/services/taxService.js
    │   ├── transactions/services/transactionService.js
    │   ├── users/services/userService.js
    │   └── (hver feature har en index.js som er public surface)
    │
    └── shared/                # Plattform: data, UI, utils, typer
        ├── config/config.js   # Konstanter, defaults, enums
        ├── core/
        │   ├── dataService.js      # Domain data layer (Firestore-cached)
        │   ├── firebaseService.js  # Generisk Firestore CRUD-wrapper
        │   └── eventBus.js         # Pub/sub
        ├── types/index.js     # JSDoc @typedef for User, Classroom, ...
        ├── ui/uiManager.js    # Felles UI: showSuccess/Error, modaler
        └── utils/
            ├── formatters.js
            ├── helpers.js
            └── validators.js
```

---

## Kontostruktur

Alle kontoer identifiseres med 3-sifret kontonummer per klasserom:

| Range | Type | Beskrivelse |
|-------|------|-------------|
| `000` | Sentralbank | Utømmelig kilde — penger fra sentralbanken |
| `001` | Skattekasse | Samler inn skatteinnbetalinger |
| `101–199` | Elevkontoer | Brukskonto/sjekkkonto per elev |
| `201–299` | Sparekontoer | Elev X på 1XX → sparekonto på 2XX |
| `301–399` | Fondskontoer | Elev X på 1XX → fondskonto på 3XX |
| `501–999` | Bedriftskontoer | Maks 499 bedrifter per klasserom |

**Kobling:** En elev med brukskonto `101` har tilhørende sparekonto `201` og fondskonto `301`.

---

## Brukerroller

| Rolle | Tilgang |
|-------|---------|
| `superadmin` | Ser alle klasserom, kan opprette lærere. Standard brukernavn: `DanielAlexander`. |
| `teacher` | Administrerer eget klasserom: jobber, betalinger, innstillinger, statistikk. |
| `student` | Ser eget dashboard: saldo, jobber, sparing, lån, bedrifter, meldinger. |

Demo-konto (`t1` / `laerer` med passord `passord`) er beskyttet og kan ikke slettes eller endre brukernavn/passord.

---

## Tidsmodell

EconSim bruker en akselerert tidsmodell der **1 uke i appen tilsvarer 1 måned i virkeligheten**. Renter og avkastning beregnes ut fra dette.

- **Sparerente:** 2 % per år → `annualRate / 12` per uke (akselerert) eller `annualRate / 52` (realistisk).
- **Fondsavkastning:** 8 % per år ± 3 % variasjon, beregnet kvartalsvis. Bruker en stokastisk modell med forventet drift og volatilitet (normalfordelt sjokk).
- **Scheduler:** kjøres ukentlig via Firebase Cloud Functions (mandag kl 08:00) og prosesserer lønn, renter og avdrag.

Tidsmodell kan velges per klasserom under `settings.simulation.timeModel`:
- `Akselerert skolemodus`: 1 uke = 1 måned (default)
- `Realistisk`: 1 uke = 1 uke

---

## Skattesystem

To moduser:

**Flat skatt** — én prosentsats på alle inntekter over fradragsgrensen.

**Progressiv skatt** — trinnvis:

| Trinn | Inntektsintervall | Sats |
|-------|-------------------|------|
| 1 | 0–500 KKr | 0 % |
| 2 | 501–1500 KKr | 25 % |
| 3 | 1501+ KKr | 35 % |

- **Fradragsgrense:** 500 KKr
- **Utbytteskatt:** 22 %
- Trinngrensene er sammenhengende: `min` for trinn N er alltid `max` for trinn N-1 + 1. UI validerer og normaliserer dette automatisk.
- Skatteinnbetalinger går til virtuell konto `001` (Skattekasse), som oppdaterer `classroom.taxAccount` i Firestore.

---

## Sparerente — beregning

Bruk `Math.round` (ikke `Math.floor`) for å unngå at lave saldoer aldri får rente:

```javascript
const interest = Math.round(account.balance * periodRate);
```

`periodRate` utledes fra `annualRate` og valgt tidsmodell.

---

## Async-mønstre

Alle Firebase-kall er asynkrone. **Alle display-refresh etter dataendring må awaites** for å unngå race conditions:

```javascript
await savingsService.depositToSavings(user.id, amount);
await authService.refreshCurrentUser();
await this.loadStudentSavings();
await this.updateBalanceDisplay();
```

Tjenester har try/catch rundt async-operasjoner. `initializeUserServices()` bruker `Promise.allSettled()` slik at en feilende tjeneste ikke stopper de andre.

---

## Service-initialisering

Alle services har metodene `initialize()` og `refreshCache()`, som kalles via `initializeUserServices()` i `main.js` ved innlogging. Ved klasserombytte kalles `refreshCache()` for å invalidere cachen og hente fersk data.

`loadClassroomDataToCache()` kjører alle 5 Firebase-queries parallelt med `Promise.all()` for raskt oppstart.

---

## UI-arkitektur

### Skjermbytte

- `showTeacherScreen(screenName)` i `main.js` — bytter aktiv fane for lærer.
- `showStudentScreen(screenName)` i `main.js` — bytter aktiv fane for elev.
- Aktiv fane-klasse: `bg-blue-600 hover:bg-blue-700 text-white`.
- Inaktiv fane-klasse: `bg-white hover:bg-gray-200 text-gray-800`.

Faneknapper i nav-baren brukes som toggle. `showStudentScreen` bruker regex-replace for å bytte klasser, og element-ID bestemmer hvilken knapp som aktiveres.

### i18n (flerspråk)

- `data-i18n="nøkkel"` — erstatter element-tekst.
- `data-i18n-tooltip="nøkkel"` — erstatter `title`-attributt.
- Norsk og engelsk byttes via `languageService.setLanguage()`. Valg lagres i localStorage.
- `translateTransactionDescription()` har 50+ mønstre for dynamisk transaksjonsoversettelse.

### Varsler-badges

`notificationService` oppdaterer `inboxBadge` (elev) og `teacherMessagesBadge` (lærer). Badge-funksjoner er null-sikre: `if (!el) return` håndterer manglende element. Badge-polling: 30 sekunder.

### Modaler

Modaler defineres som skjulte `<div>`-elementer i `index.html` og åpnes/lukkes via `uiManager.showScreen()`, som støtter både `data-screen` og `id` for målsetting.

---

## Multi-tenant isolering

Hvert klasserom er fullstendig isolert. Scheduler- og notifikasjonsstate er klasserom-isolert:

- `lastProcessedWeek` og `lastQuarterWeek` lagres i klasserom-dokumentet (ikke localStorage).
- `notificationService` validerer klasserom-ID mot cache før den brukes.
- Cache invalidert via `refreshCache()` ved klasserombytte.
- Lærerhistorikk faller tilbake til `currentUser.classroomId` hvis klasserom-objekt mangler; hvis det fortsatt ikke kan bestemmes, vises kun lærerens egne transaksjoner.
- Transaksjoner får `classroomId` ved opprettelse for korrekt sletting og filtrering. Legacy-transaksjoner uten `classroomId` ryddes opp automatisk når brukere slettes.

---

## Virtuelle kontoer

Kontoene `000` (Sentralbank) og `001` (Skattekasse) er **virtuelle** og håndteres spesielt i `firebaseService.createTransaction()`:

- `000` Sentralbank: utømmelig kilde. Trekkes ikke fra noen reell saldo. Brukes når lærer "gir penger" til elever.
- `001` Skattekasse: legges til i `classroom.taxAccount`. Trekkes ikke fra noen elevkonto.

Disse kontoene fungerer ikke som vanlige brukerkontoer og inngår ikke i users-cache.

---

## Datalagring

All produksjonsdata ligger i Firebase Firestore. Følgende collections brukes:

- `users`, `classrooms`, `transactions`, `jobs`, `applications`
- `businesses`, `loans`, `savings`, `funds`
- `notifications`, `outbox` (sendte meldinger med lest-status)
- `weeklySnapshots` (formue-snapshots for ukesrapporter)
- `emailVerifications`, `passwordResets`

Firestore-sikkerhetsregler: se `firestore.rules`.

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

---

## Kjente invariants og fallgruver

1. **Tailwind output.css** — bruk aldri klasser uten å verifisere at de finnes i kompilert fil. Nye klasser krever rekompilering.
2. **ES6 modules i browser** — `index.html` bruker `type="module"`. Importstier må være korrekte relative stier.
3. **Sirkulære imports** — `languageService` skal **ikke** importeres i `firebaseService.js` (kjent bug-kilde, fjernet i v4.4).
4. **Race conditions** — alle Firebase-kall er async. Display-refresh-kall etter dataendring må awaites.
5. **Klasserom-isolering** — `refreshCache()` må kalles ved klasserombytte. Scheduler og notifikasjoner validerer klasserom-ID mot cache.
6. **Virtuelle kontoer** — overføringer til `000` og `001` skal ikke trekkes/legges til i vanlige brukerkontoer.
7. **Status-felt for jobber** — bruker `"active"` og `"completed"`. `assignedTo === null` skiller ledige fra tildelte. Bruk **ikke** `"open"` eller `"assigned"` som statusverdier — det er gammel terminologi.
8. **Feltnavn for søknader** — `applicantId` (ikke `studentId`).
9. **Bedrifter** — `business.owners` (ikke `ownership`), `owner.userId` (ikke `ownerId`), `owner.percentage` (ikke `share`).
10. **Demo-konto** — `t1`/`laerer` kan ikke slettes eller endre innloggingsdata.
11. **Sparerente på lave saldoer** — bruk `Math.round`, ikke `Math.floor`. Ellers får små saldoer aldri rente.
12. **Sentralt eierskap av classroomId** — alltid hent via `dataService.getCurrentClassroomIdSync()`. Ikke duplikat lokal implementasjon.

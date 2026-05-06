# EconSim — Prosjektguide for Claude

## Hva er EconSim?

EconSim er en norsk klasseromsøkonomisimulator for elever i 7.–10. klasse (13–16 år). Læreren oppretter et virtuelt klasserom med sin egen valuta (standard: KlasseKrone / KKr), og elevene deltar i en simulert økonomi med jobber, sparing, fond, lån, skatt og bedrifter.

**Live URL:** https://econsim-5723c.web.app  
**Gjeldende versjon:** 5.2 (mars 2026)  
**Firebase-prosjekt:** `econsim-5723c`

---

## Teknologistack

| Komponent | Teknologi |
|-----------|-----------|
| Frontend | HTML5 + ES6 Modules |
| CSS | Tailwind CSS — **kompilert til `css/output.css`** (ikke CDN) |
| Database | Firebase Firestore |
| Hosting | Firebase Hosting |
| Bakgrunnsjobber | Firebase Cloud Functions (ukentlig + månedlig scheduler) |
| Autentisering | Egenutviklet (SHA-256 passord-hash, ingen Firebase Auth) |
| E-post | EmailJS (passordgjenoppretting) |

### Viktig om Tailwind

CSS er kompilert én gang til `css/output.css`. **Klasser som ikke finnes i filen vil ikke virke.** Bruk aldri nye Tailwind-klasser uten å verifisere at de er i output.css. Bekreftet tilgjengelig: `hover:bg-gray-200`. **Ikke tilgjengelig:** `hover:bg-gray-100`. For farger/gradienter som ikke finnes, bruk inline `style=` attributt.

---

## Filstruktur

```
/Prosjekt
├── index.html                    # Hele frontend-applikasjonen (monolittisk)
├── CLAUDE.md                     # Denne filen
├── MANIFEST.md                   # Fullstendig endringslogg per versjon
├── START.md                      # Hurtigstart (noe utdatert — viser localStorage-tid)
├── firebase.json                 # Firebase Hosting + Functions-konfig
├── firestore.rules               # Firestore sikkerheetsregler
├── package.json                  # npm-avhengigheter
│
├── css/
│   ├── styles.css                # Kildefil (Tailwind directives + custom CSS)
│   └── output.css                # Kompilert CSS — DETTE er det som brukes
│
├── data/
│   └── initial-data.json         # Startdata for demo-klasserom
│
├── functions/                    # Firebase Cloud Functions
│   └── index.js                  # Ukentlig/månedlig scheduler-trigger
│
├── js/
│   ├── config.js                 # Alle konstanter, standardverdier, kontostatus-enums
│   ├── main.js                   # App-kontroller — alt starter og koordineres her
│   │
│   ├── core/
│   │   ├── auth.js               # Innlogging, utlogging, sesjonshåndtering
│   │   ├── dataService.js        # Abstraksjons-lag (delegerer til Firebase)
│   │   ├── dataService.firebase.js  # Firebase-implementasjon av dataService
│   │   ├── dataService.localStorage.js  # Gammel localStorage-impl (beholdt som fallback)
│   │   ├── firebaseService.js    # Rå Firebase Firestore CRUD-operasjoner
│   │   └── eventBus.js           # Pub/sub for løs kobling mellom moduler
│   │
│   ├── services/
│   │   ├── businessService.js    # Bedrifter: opprett, ansett, utbytte, eierandeler
│   │   ├── classroomService.js   # Klasseromshåndtering, multi-tenant
│   │   ├── emailService.js       # EmailJS passordgjenoppretting
│   │   ├── jobService.js         # Jobber: opprett, søk, godkjenn, lønnsutbetaling
│   │   ├── languageService.js    # i18n: norsk/engelsk oversettelser
│   │   ├── loanService.js        # Lån: opprett, rentebetaling, mislighold
│   │   ├── notificationService.js # Varsler og meldinger (elev + lærer inbox)
│   │   ├── savingsService.js     # Sparing + fond: innskudd, uttak, renteberegning
│   │   ├── schedulerService.js   # Ukentlig/månedlig prosessering
│   │   ├── settingsService.js    # Klasseromsinnstillinger (skatt, lån, bedrifter osv.)
│   │   ├── statsService.js       # Statistikk og aktivitetslogg
│   │   ├── taxService.js         # Skatt: flat og progressiv, fradrag, utbytteskatt
│   │   ├── transactionService.js # Overføringer mellom kontoer
│   │   └── userService.js        # Brukeradministrasjon (opprett, endre, slett)
│   │
│   ├── ui/
│   │   └── uiManager.js          # Felles UI-funksjoner: showSuccess/Error, modaler, skjermbytte
│   │
│   └── utils/
│       ├── formatters.js         # Tall- og datofomatering (KKr, NOK, datoer)
│       ├── helpers.js            # Diverse hjelpefunksjoner
│       └── validators.js         # Input-validering
```

---

## Kontostruktur

Alle kontoer identifiseres med 3-sifret kontonummer per klasserom:

| Range | Type | Beskrivelse |
|-------|------|-------------|
| `000` | Sentralbank | Utømmelig kilde — fra sentralbanken |
| `001` | Skattekasse | Samler inn skatteinnbetalinger |
| `101–199` | Elevkontoer | Sjekk/brukskonto per elev |
| `201–299` | Sparekontoer | Elev X på 1XX → sparekonto på 2XX |
| `301–399` | Fondskontoer | Elev X på 1XX → fondskonto på 3XX |
| `501–999` | Bedriftskontoer | Maks 499 bedrifter per klasserom |

---

## Brukertyper

| Type | Tilgang |
|------|---------|
| `superadmin` | Ser alle klasserom, kan opprette lærere. Brukernavn: `DanielAlexander` |
| `teacher` | Administrerer eget klasserom: jobber, betalinger, innstillinger |
| `student` | Ser eget dashboard: saldo, jobber, sparing, lån, bedrifter |

---

## Viktige systemer

### Tidsmodell (accelerated)
1 uke i appen = 1 måned i virkeligheten. Renter og avkastning beregnes ut fra dette.
- Sparerente: 2% per år → `annualRate / 12` per uke
- Fondsavkastning: 8% per år ± 3% variasjon, beregnet kvartalsvis
- Scheduler kjøres ukentlig via Cloud Functions

### Skattesystem
To modi: **flat** (én prosentsats) og **progressiv** (trinnvis):
- Trinn 1: 0–500 KKr = 0%
- Trinn 2: 501–1500 KKr = 25%
- Trinn 3: 1500+ KKr = 35%
Fradragsgrense: 500 KKr. Utbytteskatt: 22%.

### Sparerente-beregning
Bruk `Math.round` (ikke `Math.floor`) for å unngå at lave saldoer aldri får rente:
```javascript
const interest = Math.round(account.balance * periodRate);
```

### Async-mønstre
Alle overføringsfunksjoner (deposit/withdraw til sparing og fond) **må** awaite display-refresh:
```javascript
await savingsService.depositToSavings(user.id, amount);
await authService.refreshCurrentUser();
await this.loadStudentSavings();
await this.updateBalanceDisplay();
```

### Service-initialisering
Alle services har `initialize()` og `refreshCache()` metoder som kalles ved innlogging via `initializeUserServices()` i `main.js`.

---

## UI-arkitektur

### Skjermbytte
- `showTeacherScreen(screenName)` i `main.js` — bytter aktiv fane for lærer
- `showStudentScreen(screenName)` i `main.js` — bytter aktiv fane for elev
- Aktiv fane-klasse: `bg-blue-600 hover:bg-blue-700 text-white`
- Inaktiv fane-klasse: `bg-white hover:bg-gray-200 text-gray-800`

### Faneknapper (nav-bar)
Faneknapper i nav-baren brukes som toggle — `showStudentScreen` bruker regex replace for å bytte klasser. Element-ID bestemmer hvilken knapp som aktiveres.

### i18n (flerspråk)
- `data-i18n="nøkkel"` — erstatter element-tekst
- `data-i18n-tooltip="nøkkel"` — erstatter title-attributt
- Norsk/engelsk byttes via `languageService.setLanguage()`

### Varsler-badge
`notificationService` oppdaterer `inboxBadge` (elev) og `teacherMessagesBadge` (lærer). Null-sjekk `if (!el) return` håndterer manglende element.

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

## Deployment

```bash
# Deploy til Firebase Hosting
npm run deploy
# eller direkte:
firebase deploy
```

Lokal utvikling: åpne `index.html` med Live Server (VS Code) på `http://127.0.0.1:5500`.

For å rekompilere Tailwind CSS:
```bash
npx tailwindcss -i css/styles.css -o css/output.css --watch
```

---

## Kjente begrensninger og fallgruver

1. **Tailwind output.css** — aldri bruk klasser uten å verifisere at de finnes i kompilert fil. Nye klasser krever rekompilering. Gradienter som ikke er kompilert → bruk `style=` direkte.

2. **ES6 modules i browser** — `index.html` bruker `type="module"`. Import-paths må være korrekte relative stier.

3. **Cirkulære imports** — `languageService` skal **ikke** importeres i `firebaseService.js` (kjent bug-kilde).

4. **Race conditions** — alle Firebase-kall er async. Alle display-refresh-kall etter dataendring må awaites.

5. **Klasserom-isolering** — scheduler og notifikasjoner validerer klasserom-ID mot cache. `refreshCache()` kalles ved klasserombytte.

6. **Virtuelle kontoer** — overføringer til `000` (sentralbank) og `001` (skattekasse) håndteres spesielt i `firebaseService` og trekkes/legges ikke til vanlige brukerkontoer.

---

## Versjonsoversikt (siste)

| Versjon | Dato | Høydepunkter |
|---------|------|--------------|
| 5.2 | mars 2026 | Siste stabile versjon |
| 5.1 | januar 2026 | Diverse bugfikser og UI-forbedringer |
| 5.0 | desember 2025 | Komplett refaktor, Firebase Firestore |
| 4.8 | desember 2025 | Passordgjenoppretting via e-post |
| 4.7 | desember 2025 | Kritiske async/await og Firebase-konsistens-fikser |
| 4.3 | desember 2025 | Firebase Cloud Database aktivert |

Se `MANIFEST.md` for fullstendig endringslogg.

---

## Kontakt

**Utvikler:** Daniel Alexander Andersen Fosse  
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com

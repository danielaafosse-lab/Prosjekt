# Fase 5b — Controller-ekstrakering fra `main.js`

**Dato:** 2026-05-08
**Status:** Kontinuasjons-guide for fremtidige økter
**Forutsetning:** Fase 0–8 er ferdig (services migrert til `features/`, `shared/` på plass, tooling og tester aktivt).

Denne filen forklarer **eksakt hvordan** controllers og UI-helper-funksjoner skal trekkes ut av `main.js` (12 200 linjer) feature-for-feature i fremtidige økter.

---

## Bakgrunn

Etter fase 5a er services-laget ryddig, men `main.js` er fortsatt en monolitt som inneholder:

- En enkelt klasse `EconSimApp` med ~1 167 metoder
- Bootstrap-kode (init, login-flow)
- Navigasjon (`showStudentScreen`, `showTeacherScreen`)
- Alle controllers-funksjoner per feature (rendring av faner, event-handlere)
- HTML-generering (bygger DOM-fragmenter med template-strings)

Målet med fase 5b: redusere `main.js` til en bootstrap-fil (< 500 linjer) ved å flytte feature-spesifikke metoder til `js/features/X/controllers/` og UI-helpers til `js/features/X/utils/`.

---

## Mønsteret (én feature om gangen)

### Trinn 1: Identifiser feature-grenser i `main.js`

Bruk grep til å finne metoder som hører til featuren:

```bash
# Eksempel for sparing-feature
grep -nE "(savings|sparekonto|sparing|spareconto|fund)" js/main.js | head -50
```

Kategoriser metodene i tre typer:
- **A) Pure helpers** (ingen `this`-bruk, ingen DOM-manipulasjon) → `js/features/X/utils/`
- **B) UI-controllers** (rendrer fane, binder event-handlere) → `js/features/X/controllers/`
- **C) Bootstrap-/orchestrator-funksjoner** (kaller flere features) → forblir i `main.js`

### Trinn 2: Ekstraher pure helpers først (laveste risiko)

Eksempel — gjort 2026-05-08 for `getBusinessLogoHtml`:

1. Lag mappen: `mkdir -p js/features/businesses/utils`
2. Skriv ny fil:

```javascript
// js/features/businesses/utils/logo.js
import { escapeHtml } from '../../../shared/utils/helpers.js';

export function getBusinessLogoHtml(business, size = 'medium') {
  // ... ren logikk fra main.js, men som standalone funksjon ...
}
```

3. Eksporter via featurens `index.js`:

```javascript
// js/features/businesses/index.js
export { businessService } from './services/businessService.js';
export { getBusinessLogoHtml } from './utils/logo.js';
```

4. Slett metoden fra `main.js`-klassen.
5. Hvis funksjonen brukes i `main.js`: oppdater kallere fra `this.foo(...)` til den importerte `foo(...)`.
6. Test med Playwright. Commit.

### Trinn 3: Ekstraher UI-controllers (middels risiko)

UI-controllers leser DOM og binder event-handlere. De har typisk dette mønsteret:

```javascript
// I main.js, før ekstrakering:
async loadStudentSavings() {
  const accounts = await savingsService.getSavingsAccountsForUser(this.currentUser.id);
  document.getElementById('savingsList').innerHTML = accounts.map(...).join('');
  document.querySelectorAll('.savings-deposit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => this.depositToSavings(e.target.dataset.id));
  });
}
```

For å ekstrahere:

1. Lag `js/features/savings/controllers/studentSavingsController.js`
2. Strukturer som klasse eller modul med eksplisitte avhengigheter:

```javascript
import { savingsService } from '../index.js';
import { eventBus } from '../../../shared/core/eventBus.js';

export class StudentSavingsController {
  constructor(app) {
    this.app = app;  // referanse tilbake til EconSimApp for cross-feature kall
  }

  async render() {
    const user = this.app.currentUser;
    const accounts = await savingsService.getSavingsAccountsForUser(user.id);
    document.getElementById('savingsList').innerHTML = accounts.map(...).join('');
    this.bindEvents();
  }

  bindEvents() {
    document.querySelectorAll('.savings-deposit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.app.depositToSavings(e.target.dataset.id));
    });
  }
}
```

3. I `main.js` `init()`-metoden, instantier controlleren:

```javascript
import { StudentSavingsController } from './features/savings/controllers/studentSavingsController.js';
// ...
this.studentSavings = new StudentSavingsController(this);
```

4. Kall `this.studentSavings.render()` der `this.loadStudentSavings()` kaltes før.
5. Slett gamle metoder fra `main.js`.
6. Test med Playwright (klikk gjennom fanen, gjør innskudd/uttak).

### Trinn 4: Cross-feature event-kommunikasjon

Hvis controlleren må reagere på endringer fra andre features, lytt på `eventBus`:

```javascript
constructor(app) {
  this.app = app;
  eventBus.on('balance.changed', () => this.refreshBalance());
}
```

UI-controllers skal IKKE importere fra andre features' controllers — bare via events eller `this.app.<andreFeature>`.

---

## Anbefalt rekkefølge (minst-koblet først)

1. **`i18n`** — `setLanguage`, `onLanguageChange` (ren state, ingen eksterne kall)
2. **`stats`** — login-statistikk-rendring (isolert til Statistikk-fane)
3. **`notifications`** — varselbadges og inbox-rendring (isolert til Varsler-fane)
4. **`auth`** — login-flow + showLoginScreen
5. **`users`** — brukeradministrasjon (lærer-fane)
6. **`classroom`** — klasserombytte
7. **`transactions`** — sentral, brukes av andre. Migreres når andre er stabile.
8. **`savings`** — kontooversikt + innskudd/uttak
9. **`loans`** — låneforvaltning
10. **`jobs`** — jobboversikt + søknader
11. **`businesses`** — bedrifter (mest kompleks UI)
12. **`taxes`** — skatte-fane
13. **`scheduler`** — orchestrator, til slutt

For hver feature:
- Estimat 30–60 minutter
- Én commit per feature: `refactor(fase5b): extract <feature> controllers from main.js`
- Smoke-test med Playwright FØR commit
- Hvis noe brekker: revert og analyser

---

## Suksesskriterier per feature

| # | Kriterie |
|---|---|
| 1 | Featurens metoder fjernet fra `main.js` |
| 2 | Tilsvarende controllers/utils opprettet i `js/features/X/` |
| 3 | `js/features/X/index.js` eksporterer alt eksternt brukt |
| 4 | Ingen call-site bruker `this.<metodeNavn>()` etter migrering uten å gå via controlleren |
| 5 | Playwright bekrefter UI fungerer som før (klikk-gjennom uten errors) |
| 6 | `npm run verify` (lint + typecheck + tests) er grønn |
| 7 | Diff-en kan reviewes på under 10 minutter |

---

## Slutt-tilstand

Etter fase 5b er ferdig:

- `js/main.js` er ~300–500 linjer (kun bootstrap, init, og koordinering)
- Hver `js/features/X/` har en `controllers/`-mappe med all UI-logikk for featuren
- ESLint-regelen `import-x/no-restricted-paths` kan aktiveres i `eslint.config.js` for å håndheve at `features/X/controllers/` ikke importerer `features/Y/controllers/`
- Diff-review og AI-vibecoding er dramatisk lettere fordi en endring i én feature sjelden krever lesing av andre

---

## Hva er allerede gjort 2026-05-08 (proof-of-concept)

- `getBusinessLogoHtml` ekstrahert til `js/features/businesses/utils/logo.js`
- Eksportert via `js/features/businesses/index.js`
- Slettet fra `main.js` (var ubrukt — 13 linjer mindre)

Dette validerer trinn 2-mønsteret over. Resten av fase 5b følger samme mønster.

---

## Hvorfor dette ikke er gjort i samme økt

Fase 5b krever 30–60 minutter per feature × 13 features = 6–13 timers fokusert arbeid med Playwright-verifisering mellom hver. Det er for mye for én økt og medfører høy risiko hvis det presses gjennom uten testpauser. Bedre å gjøre dette systematisk og inkrementelt med klar dokumentasjon (denne filen) som referanse.

# EconSim — Testing

Hvordan verifisere at endringer ikke bryter ting. Dekker hva som ER testet, hva som IKKE er, og hvordan teste manuelt.

---

## 1. Test-stack

| Verktøy | Hva | Når kjøres |
|---|---|---|
| **Vitest** | Unit-tester for ren forretningslogikk | `npm test` lokalt; ingen CI per nå |
| **ESLint** | Statisk analyse | `npm run lint` |
| **TypeScript (checkJs)** | JSDoc-typesjekk | `npm run typecheck` |
| **Playwright MCP** | Manuell og AI-drevet integrasjonstest mot live UI | Under utvikling |
| **Firebase Emulator** | Lokal Firestore-emulering | Ikke aktivert per nå |

`npm run verify` kjører lint + typecheck + test sekvensielt.

---

## 2. Eksisterende testdekning

### 2.1 Unit tests (Vitest) — 24 tester totalt

**`js/features/taxes/services/taxService.test.js`** — 12 tester
- Progressiv skatteberegning på alle bracket-posisjoner
- Edge cases: 0 inntekt, malformede brackets, infinity-bound topp-bracket
- Flat skatt med stubbed settings
- Fradrag (deduction)
- Negative taxable amounts klampet til 0
- Routing til progressiv path

**`js/features/savings/services/interestCalculator.test.js`** — 12 tester
- Periode-rate (akselerert vs realistisk)
- Math.round-vs-Math.floor invariant (kritisk — lave saldoer)
- Negative/NaN/zero balanse-håndtering
- Projisert årsrente per konto + total

### 2.2 Hva som ER dekket

- Pure forretningslogikk for skatt og sparerente
- Edge cases for tallinput

### 2.3 Hva som IKKE er dekket

- `dataService` caching-laget (komplekst, mocking ville krevd Firebase emulator)
- `firebaseService` Firestore-CRUD
- `auth` flow (login, logout, sesjon-restore)
- `transactionService` overføringer mellom kontoer
- `loanService` rente, mislighold
- `businessService` eierandeler, ansette/sparke, utbytte
- `jobService` søknader, godkjenninger
- `notificationService` varsler-genering
- `schedulerService` ukentlig prosessering
- Multi-tenant isolasjon (klasserom A kan ikke se klasserom B)
- UI-rendering (controllers i main.js)
- Cloud Functions (ingen Functions-tester)

**Konsekvens:** Endringer i disse områdene må verifiseres med Playwright.

---

## 3. Når du legger til en feature

### 3.1 Skriv test for ren logikk

Hvis featuren har pure-funksjon-natur (matematikk, datatransformasjon, validering), skriv vitest:

```javascript
// js/features/<feature>/services/<feature>Service.test.js
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../shared/core/dataService.js', () => ({
  dataService: {
    getUserById: vi.fn(),
    // ...
  },
}));

const { mittService } = await import('./mittService.js');

describe('mittService.beregnNoe', () => {
  it('returnerer riktig for gyldig input', () => {
    expect(mittService.beregnNoe(100)).toBe(20);
  });
});
```

### 3.2 Verifiser med Playwright

For UI-endringer eller flere services som samvirker:

1. Start Live Server lokalt på `http://127.0.0.1:5500/`
2. Kjør AI-assistent med Playwright MCP
3. Naviger til appen, logg inn, klikk gjennom feature-flow
4. Sjekk console errors (skal være 0)
5. Eventuelt sammenlign saldoer før/etter for transaksjoner

### 3.3 Smoke-test-checklist

For hver release:

- [ ] Lærer-login (`laerer` / `passord`)
- [ ] Alle 6 lærer-faner rendrer (Oversikt, Lån, Jobber, Bedrifter, Skattekasse, Varsler)
- [ ] Elev-login (`kari123` / `passord123`)
- [ ] Alle 4 elev-faner rendrer (Oversikt, Sparing, Jobber, Varsler)
- [ ] Innskudd til sparing — saldo balansert
- [ ] Uttak fra sparing — saldo balansert
- [ ] Logout fungerer
- [ ] 0 console errors gjennom hele flow

---

## 4. Vitest-mønster for service med Firebase-avhengighet

Services importerer typisk `dataService` som rører Firebase. For å teste i isolasjon:

```javascript
import { describe, it, expect, vi } from 'vitest';

// Stub browser-globals
vi.stubGlobal('window', { addEventListener: () => {}, dispatchEvent: () => {} });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });

// Mock data-laget
vi.mock('../../../shared/core/dataService.js', () => ({
  dataService: {
    getUserById: vi.fn(),
    getCurrentClassroomId: () => 'demo-classroom',
  },
}));

vi.mock('../../../shared/core/eventBus.js', () => ({
  eventBus: { emit: vi.fn(), on: vi.fn() },
  EVENTS: {},
}));

vi.mock('../../i18n/index.js', () => ({
  languageService: { t: (key) => key },
}));

// Importer service ETTER mocks
const { mittService } = await import('./mittService.js');

describe('mittService', () => {
  it('virker', () => { /* ... */ });
});
```

Se `js/features/taxes/services/taxService.test.js` for fullstendig eksempel.

---

## 5. Pure-funksjon-mønster (foretrukket)

Når mulig, ekstraher ren logikk til en pure-funksjon-helper i `js/features/<X>/utils/`:

```javascript
// js/features/<X>/utils/calculator.js
export function beregnNoe(input) {
  // Ingen this, ingen DOM, ingen Firebase
  return input * 2;
}
```

```javascript
// js/features/<X>/utils/calculator.test.js
import { describe, it, expect } from 'vitest';
import { beregnNoe } from './calculator.js';

describe('beregnNoe', () => {
  it('dobler', () => {
    expect(beregnNoe(5)).toBe(10);
  });
});
```

Ingen mocks, ingen oppsett. Raskeste tester. Foretrukket der mulig.

---

## 6. Offline-persistens-testing

`enablePersistence()` slås på i `firebaseService.initialize()`. Den feiler stille hvis:

- Nettleseren er i inkognito-modus → IndexedDB blokkert
- Flere faner åpne uten `synchronizeTabs: true` (vi har det på)

Test manuelt:

1. Last siden, vent på "💾 Firestore offline-persistens aktivert" i konsoll
2. Slå av nettverk i DevTools
3. Naviger mellom faner — data skal fortsatt vises
4. Gjør en endring (f.eks. innskudd) — Firestore SDK køer skrivingen
5. Slå nettverk på igjen — endringen synkroniseres

Playwright kjører single-tab uten incognito, så multi-tab- og incognito-tilfeller må testes manuelt.

---

## 7. Lokale Firebase-emulator (anbefalt fremtidig)

Per nå tester vi mot live Firestore (med lese/skrive på real data). For tryggere testing:

```bash
firebase init emulators
# Velg Firestore + Functions emulators

firebase emulators:start
```

Trenger oppdatert `firebaseService.js` til å peke på emulator-URL i dev-modus. Ikke implementert per nå.

---

## 8. Pre-commit-hook (anbefalt fremtidig)

Per nå er det ingen automatisk gating på commits. Legg til via `husky` eller `simple-git-hooks`:

```bash
npm install --save-dev husky
npx husky init
echo "npm run verify" > .husky/pre-commit
```

Dette ville blokkere commit hvis lint/typecheck/test feiler. Vurder om det er ønskelig — eksisterende kode har 10 ESLint-errors fra før, så hooken må eventuelt allowliste de inntil de fikses.

---

## 9. CI/CD (anbefalt fremtidig)

Ingen GitHub Actions per nå. Foreslått minimum:

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

Deploy-trigger på `main`-push krever Firebase Service Account secret.

---

## 10. Manuell QA før deploy

Minimumssjekk før hver `npm run deploy`:

```bash
npm run verify    # lint + typecheck + test
npm run build:css # bygg fersk Tailwind
```

Deretter manuell smoke-test (se §3.3) på `http://127.0.0.1:5500/`.

Etter deploy, samme test mot `https://econsim-5723c.web.app/`.

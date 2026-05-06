# Deployment

Hvordan deploye EconSim til Firebase Hosting. Se [DEVELOPMENT.md](DEVELOPMENT.md) for lokal utvikling.

---

## Firebase-prosjekt

| Felt | Verdi |
|------|-------|
| Prosjekt-ID | `econsim-5723c` |
| Hosting-URL | https://econsim-5723c.web.app |
| Auth-domene | `econsim-5723c.firebaseapp.com` |
| Storage bucket | `econsim-5723c.firebasestorage.app` |

Firebase-konfigurasjonen er hardkodet i `index.html`.

---

## Deploy

Forutsetning: lærings-/admin-tilgang til Firebase-prosjektet `econsim-5723c`. Logg inn med `npx firebase login` første gang.

### Standard deploy (kun hosting)

```bash
npm run deploy
```

Dette kjører:
1. `npm run build:css` — kompilerer Tailwind til `css/output.css` (minifisert).
2. `npx firebase deploy --only hosting`.

### Manuell full deploy

For å deploye alt (hosting, functions, Firestore-rules):

```bash
firebase deploy
```

For å deploye spesifikke deler:

```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

---

## Hosting-konfigurasjon

Definert i `firebase.json`:

- **public:** `.` (rotmappen). Hele prosjektet er statiske filer servert direkte.
- **ignore:** `firebase.json`, dotfiler, `node_modules/`, `functions/`.
- **Cache-headers:** Alle `*.js`-filer leveres med `Cache-Control: no-cache, no-store, must-revalidate` slik at nye versjoner alltid hentes friskt.

---

## Firestore

### Sikkerhetsregler

Filsti: `firestore.rules`.

Reglene deployes med:

```bash
firebase deploy --only firestore:rules
```

### Collections

Produksjonsdata lagres i Firestore. Hovedcollections:

- `users`, `classrooms`, `transactions`, `jobs`, `applications`
- `businesses`, `loans`, `savings`, `funds`
- `notifications`, `outbox`, `weeklySnapshots`
- `emailVerifications`, `passwordResets`

---

## Cloud Functions

Filsti: `functions/index.js`.

Functions kjører ukentlig og månedlig schedulering for alle klasserom (lønn, renter, avdrag, ukesrapporter, kvartalsvise skattemeldinger).

### Deploy functions

```bash
firebase deploy --only functions
```

### Lokal testing

Functions kan testes med Firebase Emulator Suite (ikke konfigurert som standard i prosjektet — sett opp `firebase emulators:start` ved behov).

---

## Miljøkonfigurasjon

EconSim har ingen separate miljøer (dev/staging/prod) — alt går mot `econsim-5723c`. EmailJS-integrasjon (passordgjenoppretting) konfigureres direkte i `js/services/emailService.js`.

---

## Etter deploy — verifisering

1. Åpne https://econsim-5723c.web.app i en privat-modus / inkognito-fane.
2. Logg inn som demo-lærer (`laerer` / `passord`).
3. Sjekk at klasseromsdata lastes, og at saldo og transaksjoner vises korrekt.
4. Logg inn som demo-elev (`kari123` / `passord123`) og verifiser elev-dashboard.
5. Hvis noe er korrupt: logg inn som demo-lærer (`t1`) og bruk "Reset til demo-data" for å gjenopprette demo-klasserommet fra `data/initial-data.json`.

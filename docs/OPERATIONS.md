# EconSim — Drift og produksjon

Denne filen forklarer hvordan EconSim drives, overvåkes og feilsøkes i produksjon. Skrevet for utviklere og AI-assistenter som skal håndtere reelle insidenter.

---

## Innhold

1. [Live-URL og Firebase-prosjekt](#1-live-url-og-firebase-prosjekt)
2. [Overvåkning](#2-overvåkning)
3. [Scheduler-drift](#3-scheduler-drift)
4. [Cloud Functions-konfigurasjon](#4-cloud-functions-konfigurasjon)
5. [Sikkerhetsmodell](#5-sikkerhetsmodell)
6. [Deploy-rollback](#6-deploy-rollback)
7. [Feilsøking](#7-feilsøking)
8. [Vedlikeholdsoppgaver](#8-vedlikeholdsoppgaver)
9. [Backup og data-eksport](#9-backup-og-data-eksport)
10. [Kontaktpunkter](#10-kontaktpunkter)

---

## 1. Live-URL og Firebase-prosjekt

- **Live URL:** https://econsim-5723c.web.app
- **Firebase-prosjekt-ID:** `econsim-5723c`
- **Console:** https://console.firebase.google.com/project/econsim-5723c/overview
- **Firestore-database:** Default database, EU-multiregion (`europe-west`)
- **Cloud Functions-region:** `us-central1` (default)
- **Hosting-region:** Global CDN

Innloggingstilgang krever Firebase-prosjekt-rollen `Owner` eller `Editor`. Kun prosjekt-eier (Daniel Alexander Andersen Fosse) har det per nå.

---

## 2. Overvåkning

EconSim har **ingen automatisert overvåking** per dags dato. Manuell sjekk anbefales:

### Daglig (eller før bruk i klasserom)

1. Åpne https://econsim-5723c.web.app/ i privat nettleser-vindu
2. Logg inn som demo-lærer (`laerer` / `passord`)
3. Sjekk at dashboard rendrer uten feil
4. Test én transaksjon (gi penger til en elev)
5. Logg ut og logg inn som demo-elev (`kari123` / `passord123`)

### Ukentlig

Sjekk at Cloud Functions-scheduler har kjørt:

1. Gå til Firestore-konsollen
2. Åpne collection `schedulerTriggers`
3. Verifiser at det finnes et dokument for hver mandag (format `wYYYY-WW`) og hver 1. i måneden (format `mYYYY-MM`)
4. Hvis et trigger-dokument er eldre enn 7 dager og har `processed: false`, har klient-side-prosessering ikke kjørt — vanligvis fordi ingen lærer har logget inn siden trigger ble satt

### Når noe ser galt ut

Sjekk Firebase-konsollens logg-fane:
- **Hosting:** Project Settings → Hosting → siste deploys og status
- **Firestore:** Database-fanen, se collection-størrelser og se etter store hopp i lese-/skrive-volum
- **Functions:** Functions-fanen → logger for `sendEmail`, `scheduledWeeklyProcessing`, etc.
- **Usage and billing:** Sjekk om Firebase-kvoter er nær å bli sprengt

---

## 3. Scheduler-drift

Scheduler er **trigger-basert, ikke server-side**. Cloud Function setter et marker-dokument; klienten utfører prosesseringen ved første lærer-innlogging etter trigger.

### Cloud Functions-jobber

Definert i `functions/index.js`:

| Funksjon | Schedule | Hva den gjør |
|---|---|---|
| `scheduledWeeklyProcessing` | Mandag 08:00 norsk tid | Setter `schedulerTriggers/wYYYY-WW` |
| `scheduledMonthlyProcessing` | 1. i måneden 08:00 | Setter `schedulerTriggers/mYYYY-MM` |
| `sendEmail` | HTTP on-demand | Sender Gmail SMTP via Nodemailer |
| `sendVerificationEmail` | HTTP | E-postverifisering |
| `sendPasswordResetEmail` | HTTP | Passordreset |
| `onTeacherRequestCreated` | Firestore-trigger | Notifiserer admin om ny lærersøknad |

### Klient-side prosessering

Når en lærer logger inn, kjører `js/features/scheduler/services/schedulerService.js`:
1. Henter alle `schedulerTriggers` med `processed: false`
2. For hver trigger, kjører kvartalsvise/månedlige operasjoner:
   - Sparerente til alle elever
   - Fondsavkastning hvis kvartal
   - Lånerente
   - Skatte-prosessering
3. Setter `processed: true` på trigger
4. Setter `lastProcessed` på klasserommet

### Hva gjøres ved feilet trigger

Hvis en trigger har `processed: false` etter 7+ dager:

1. **Verifiser Cloud Function har kjørt:** Gå til Functions → Logs → filtrer på `scheduledWeeklyProcessing`. Se etter siste vellykkede kjøring.
2. **Hvis Cloud Function feilet:** Sjekk error-loggen for stack trace. Vanlige årsaker: timeout, Firestore-skrivefeil, Functions ikke deployet etter siste kodeoppdatering.
3. **Manuell trigger:** I Firebase-konsollen → Firestore → opprett dokument manuelt:
   ```
   schedulerTriggers/wYYYY-WW
   {
     "type": "weekly",
     "weekKey": "wYYYY-WW",
     "triggeredAt": "2026-XX-XXThh:mm:ssZ",
     "processed": false
   }
   ```
4. Logg inn som lærer — klient-prosesseringen aktiveres automatisk og setter `processed: true`.

---

## 4. Cloud Functions-konfigurasjon

### Gmail SMTP-credentials

Cloud Functions for e-postsending krever Gmail-konto og app-passord:

```bash
# Sett config (kjøres én gang per prosjekt)
firebase functions:config:set \
  gmail.email="econsim.no@gmail.com" \
  gmail.password="xxxx xxxx xxxx xxxx"

# Verifiser
firebase functions:config:get
```

**Viktig:**
- Bruk **App Password**, ikke regulært Gmail-passord (krever at 2FA er på)
- Genereres på https://myaccount.google.com/apppasswords
- Lagres ALDRI i version control (allerede ekskludert via `.gitignore`)

### Re-deploy etter config-endring

```bash
firebase deploy --only functions
```

Functions må re-deployes etter endringer i `functions:config:set` for at de nye verdiene skal gjelde.

### Lokal testing

```bash
# Kjør Functions emulator lokalt
cd functions && npm run serve
```

For lokal testing av e-post må du sette `GMAIL_EMAIL` og `GMAIL_PASSWORD` som env vars (functions/index.js har fallback til `process.env`).

---

## 5. Sikkerhetsmodell

### Nåværende tilstand (2026-05-08)

**`firestore.rules` er fullt åpen** — `allow read, write: if true`. Dette er en **kjent svakhet**:

```
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### Hvorfor det er sånn

EconSim bruker egenutviklet auth (SHA-256-hash, ingen Firebase Auth). Standard Firestore-regler kan ikke verifisere passord-hash, så `request.auth != null` virker ikke.

### Hva det betyr i praksis

**Trusler som er reelle:**
- En kjent angriper kan manipulere data i en hvilken som helst klasserom (gi seg selv penger, slette transaksjoner, etc.)
- All data er offentlig lesbart hvis du har Firestore-adressen
- Ingen rate-limiting i klienten

**Trusler som ikke er reelle:**
- Sensitiv personinformasjon (kun fornavn/brukernavn lagres)
- Faktiske penger (det er KKr — virtuell valuta)
- Lærer-passord (lagres som SHA-256-hash, kan ikke reverseres)

### Mitigerende tiltak til real auth implementeres

1. **Klasserom-ID-er er ikke gjettbare** — generert med `crypto.randomUUID()`-lignende
2. **Demo-data er bevisst åpen** — `demo-classroom` brukes til testing og det er OK at den manipuleres
3. **Real klasserom har anonymiserte navn** — ingen elev-data lagres som identifiserer person utenfor klasserommet
4. **Audit log:** alle transaksjoner lagres med `createdAt` og kan etterprøves

### Roadmap for tightening

Når dette må strammes inn (f.eks. for utbredelse til flere skoler):

1. **Migrer til Firebase Auth** med Custom Tokens
2. Generer Custom Token på Cloud Function etter SHA-256-validering
3. Klient setter token via `firebase.auth().signInWithCustomToken(token)`
4. Skriv `firestore.rules` som verifiserer `request.auth.uid == request.resource.data.userId` på dokumenter
5. Test grundig med Firebase Emulator før deploy

Estimert arbeid: 2-3 dager fokusert.

---

## 6. Deploy-rollback

### Hosting (frontend)

Hvis et deploy bryter prod:

```bash
# List siste deploys
firebase hosting:channel:list --site=econsim-5723c

# Rull tilbake til forrige versjon (CLI fungerer ikke alltid for full rollback;
# Firebase-konsollen er mer pålitelig)
```

**Mer pålitelig:** Gå til Firebase-konsollen → Hosting → Release history → klikk "Rollback" på siste fungerende versjon.

### Functions

Functions kan ikke rolles tilbake direkte. Re-deploy fra forrige git-commit:

```bash
git checkout <forrige-fungerende-commit>
firebase deploy --only functions
git checkout main  # eller v6-branch
```

### Firestore-data

Firestore har **ikke** automatisk backup. Manuelt:

```bash
# Eksporter database
gcloud firestore export gs://econsim-5723c.appspot.com/backups/$(date +%Y%m%d)

# Importer (ved katastrofe)
gcloud firestore import gs://econsim-5723c.appspot.com/backups/<dato>
```

Krever `gcloud` CLI og prosjekt-roller.

---

## 7. Feilsøking

### Symptom: Innlogging henger på "Logger inn..."

1. Åpne nettleser-konsoll. Se etter rød feil.
2. Vanlige årsaker:
   - Firebase SDK ikke lastet (CDN nede): `firebase is not defined`
   - Firestore CORS-feil
   - Firestore-regler avviser tilgang (etter eventuell tightening)
   - Klasserom-cache korrupt: kjør `resetEconSim()` i konsoll

### Symptom: Saldo viser feil tall

1. Sjekk transaksjons-historikk: er den siste transaksjonen registrert?
2. Hvis transaksjonen mangler: Firestore write feilet — sjekk Functions-loggen
3. Manuell rettelse: oppdater `User.balance` i Firestore-konsollen

### Symptom: Sparerente ikke utbetalt mandag

1. Sjekk `schedulerTriggers`-collection
2. Hvis trigger mangler: Cloud Function feilet — se Functions-logg
3. Hvis trigger har `processed: false`: ingen lærer har logget inn — minne dem på det

### Symptom: E-post-verifisering kommer ikke fram

1. Sjekk Cloud Functions-logg for `sendVerificationEmail`
2. Sjekk Gmail-account: kjør `firebase functions:config:get` for å verifisere credentials er satt
3. Test manuelt med Postman/curl mot Cloud Function URL

### Symptom: Console viser `enableMultiTabIndexedDbPersistence will be deprecated`

Dette er **forventet** — informativ advarsel fra Firebase 10.7.1 SDK. Migrering til ny `FirestoreSettings.cache`-API når SDK oppgraderes.

---

## 8. Vedlikeholdsoppgaver

| Hvor ofte | Oppgave |
|---|---|
| Daglig (under skoletid) | Sjekk live-URL fungerer |
| Ukentlig | Verifiser scheduler-trigger ble satt og prosessert |
| Månedlig | Kjør Firestore-eksport som backup |
| Kvartalsvis | Sjekk Firebase-kvoter; vurder om paid tier trengs |
| Årlig | Oppdater dependencies (`npm outdated`); test grundig |

---

## 9. Backup og data-eksport

### Firestore-eksport

```bash
# Bucket må eksistere først
gsutil mb -l europe-west1 gs://econsim-5723c-backups

# Eksporter hele database
gcloud firestore export gs://econsim-5723c-backups/$(date +%Y%m%d-%H%M)

# Eksporter spesifikke collections
gcloud firestore export gs://econsim-5723c-backups/$(date +%Y%m%d-%H%M) \
  --collection-ids=users,classrooms,transactions
```

### JSON-eksport per klasserom

Lærer kan eksportere fra UI: Innstillinger → Eksporter data. Dette lager en JSON-fil med klasserom + brukere + transaksjoner.

---

## 10. Kontaktpunkter

**Hovedutvikler:** Daniel Alexander Andersen Fosse  
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com  
**Institusjon:** HVL (Høgskulen på Vestlandet)

**Firebase-prosjekt-eier:** Daniel (samme).

Ved kritiske produksjonsfeil utenom hovedutviklers tilgang: ingen backup-personell per nå. **Forbedring foreslått:** legg til Firebase Editor-rolle på minst én ekstra person.

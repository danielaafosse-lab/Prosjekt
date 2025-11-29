# 🚀 EconSim - Prosjektmanifest# EconSim - Prosjektmanifest# 🚀 EconSim - Økonomisimulator for Klasserommet



**Versjon:** 2.1 - localStorage Edition  

**Dato:** Oktober 2025  

**Institusjon:** HVL (Høgskulen på Vestlandet)  **Versjon:** 2.1  **Versjon:** 2.1 - Live Preview Edition  

**Målgruppe:** Norsk ungdomsskole (13-16 år)

**Type:** Økonomisimulator for klasserommet  **Dato:** Oktober 2025

---

**Teknologi:** HTML5 + ES6 Modules + localStorage

## 🎯 VISJON OG FORMÅL

---

### Hovedmål

En **klasseroms-økonomisimulator** som lar elever lære om:---

- Grunnleggende økonomi og transaksjoner

- Arbeidsmarked (jobbsøking, ansettelse, lønn)## ⚡ HURTIGSTART

- Ansvar og konsekvenser av økonomiske valg

- Budsjett og ressursforvaltning## 📄 Prosjektfiler



### Pedagogiske prinsipper### 1️⃣ Åpne Live Server

- **Likhet:** Alle starter med samme saldo (1000 SKR)

- **Rettferdighet:** Alle kan søke på samme jobber### Viktige filer- Høyreklikk på `index.html`

- **Konsekvenser:** Penger brukt er borte → lærer budsjettering

- **Motivasjon:** Synlig fremgang og realistiske belønninger- `START.md` - **Les denne først!** Komplett guide- Velg **"Open with Live Server"**



### Målgruppe og bruk- `index.html` - Hovedfil (åpne med Live Server)- Åpner automatisk: `http://127.0.0.1:5500`

- **Alder:** 13-16 år (ungdomsskole)

- **Setting:** Ett klasserom (1 lærer + 20-30 elever)

- **Varighet:** Kontinuerlig bruk over flere uker/måneder

- **Språk:** Norsk (Bokmål)### Mappestruktur### 2️⃣ Logg inn for demonstrasjon



---```



## 🏗️ TEKNISK ARKITEKTUR/css        - Styling**Som Lærer:**



### Stack/js         - All JavaScript-kode- Brukernavn: `laerer`

- **Frontend-only:** Ingen backend nødvendig (perfekt for demo!)

- **HTML5:** Semantisk markup  /core     - Kjernesystem (data, auth, events)- Passord: `passord`

- **Tailwind CSS:** Utility-first styling (CDN)

- **JavaScript ES6+ Modules:** Moderne modulær kode  /services - Business logic

- **localStorage:** Alle data lagres i nettleser

  /ui       - UI management**Som Elev:**

### Fordeler med denne arkitekturen

✅ **Null installasjon** - bare Live Server trengs    /utils    - Hjelpefunksjoner- `kari123` / `passord123`

✅ **Offline-first** - fungerer uten internett  

✅ **Ingen server-kostnader** - helt gratis  ```- `ola456` / `passord456`

✅ **Rask utvikling** - ingen API å bygge  

✅ **Enkel demo** - åpne og kjør umiddelbart  - `emma789` / `passord789`



### Mappestruktur---

```

/Prosjekt### 3️⃣ Test funksjonene!

├── index.html              # Hovedfil (HTML markup)

├── START.md                # Brukerveiledning (hvordan teste)## 🔧 Teknisk oversikt✅ Du forblir innlogget hele sesjonen  

├── MANIFEST.md             # Dette dokumentet (AI-kontrakt)

│✅ Alle endringer oppdateres umiddelbart  

├── /css

│   └── styles.css         # Custom CSS (minimal)### Arkitektur✅ Data lagres i nettleserens localStorage

│

├── /js- **Frontend-only** - Ingen backend nødvendig

│   ├── main.js            # App bootstrapping og initialisering

│   ├── config.js          # Konfigurasjon og konstanter- **ES6 Modules** - Moderne JavaScript---

│   │

│   ├── /core- **localStorage** - Data lagres i nettleser

│   │   ├── dataService.js # localStorage database-lag

│   │   ├── auth.js        # Autentisering (persistent session)- **Event-driven** - Reaktiv oppdatering## � Hva kan du demonstrere?

│   │   └── eventBus.js    # Event-system for modulkommunikasjon

│   │

│   ├── /services

│   │   ├── userService.js        # Brukeroperasjoner### Kjernefunksjoner### Som Lærer:

│   │   ├── transactionService.js # Transaksjoner og overføringer

│   │   ├── jobService.js         # Jobbsystem (fullstendig)- ✅ Persistent login (localStorage)✅ Opprett jobber (fast eller prosjekt)  

│   │   └── settingsService.js    # App-innstillinger

│   │- ✅ Sanntids-oppdatering av UI✅ Ansett elever til jobber  

│   ├── /ui

│   │   └── uiManager.js   # UI state, toast-meldinger, modaler- ✅ Fast vs Prosjekt-jobber✅ Gi lønn (enkeltvis eller alle)  

│   │

│   └── /utils- ✅ Transaksjoner mellom brukere✅ Gi/trekk penger fra elever  

│       ├── validators.js  # Input-validering

│       ├── formatters.js  # Valuta, dato, etc.- ✅ Lærer-administrasjon✅ Se elevenes saldo og transaksjoner  

│       └── helpers.js     # Diverse hjelpefunksjoner

│- ✅ Elev-dashboard

└── /data

    └── initial-data.json  # Initial testdata (lastes ved første bruk)### Som Elev:

```

---✅ Se tilgjengelige jobber  

---

✅ Søk på jobber  

## 💾 DATAMODELL OG LAGRING

## 🚀 Bruk✅ Se mine aktive jobber  

### localStorage Nøkler

```javascript✅ Send penger til andre elever  

econsim_users          // Array<User>

econsim_transactions   // Array<Transaction>**Les `START.md` for komplett guide!**✅ Se transaksjonshistorikk

econsim_jobs          // Array<Job>

econsim_applications  // Array<Application>

econsim_settings      // Settings object

econsim_session       // Current session { userId, timestamp }Hurtigstart:---

```

1. Åpne Live Server på `index.html`

### 1. User Model

```javascript2. Logg inn (laerer/passord eller kari123/passord123)## 🏗️ Teknisk

{

  id: "s1",                    // Unik ID: "t1" (teacher) eller "s1", "s2"...3. Test funksjonene!

  type: "student",             // "student" | "teacher"

  name: "Kari Nordmann",       // Fullt navn### Arkitektur:

  username: "kari123",         // Brukernavn (pålogging)

  password: "hashed_password", // SHA-256 hash---- **Frontend:** HTML5 + ES6 Modules + Tailwind CSS

  accountNumber: "101",        // 3-sifret kontonummer

  balance: 1000,              // Nåværende saldo (Number)- **Data:** localStorage (nettleser-lagring)

  createdAt: "2025-10-16T10:00:00Z"

}## 📝 Endringer (v2.1)- **Session:** Persistent login (localStorage)

```

- **Oppdatering:** Live refresh av alt uten page reload

### 2. Transaction Model

```javascript- ✅ Persistent login med localStorage

{

  id: "tx_1234",              // Unik ID- ✅ Alle server-filer fjernet (unødvendige)### Fordeler:

  senderId: "s1",             // Avsender ID

  senderName: "Kari",         // Avsender navn- ✅ Forenklet til Live Preview kun- ✅ **Ingen installasjon** - bare Live Server

  recipientId: "s2",          // Mottaker ID

  recipientName: "Ola",       // Mottaker navn- ✅ Opprydding i dokumentasjon- ✅ **Ingen server** - kun browser

  amount: 50,                 // Beløp (Number, alltid positiv)

  message: "Takk for hjelp",  // Valgfri melding- ✅ Enkel START.md guide opprettet- ✅ **Øyeblikkelig start** - klar på sekunder

  timestamp: "2025-10-16T10:30:00Z"

}- ✅ **Perfekt for demo** - stabil og rask

```

---

### 3. Job Model

```javascript---

{

  id: "job_001",              // Unik ID**For detaljert informasjon, se START.md**

  title: "Tavlevakt",         // Jobbtittel

  description: "Tørke tavlen etter hver time",---

  salary: 100,                // Lønn per betaling (Number)

  type: "fixed",              // "fixed" | "project"## � Tips for demonstrasjon

  status: "active",           // "active" | "completed"

  postedBy: "t1",             // Lærer-ID### Test-scenario 1: Jobbsystemet

  assignedTo: null,           // Elev-ID (null hvis ledig)1. Logg inn som lærer

  createdAt: "2025-10-16T09:00:00Z",2. Gå til **Jobber-fanen**

  assignedAt: null,           // Når tildelt3. Opprett en **fast jobb** (eks: "Tavlevask", 150 SKR)

  completedAt: null,          // Når fullført4. Opprett en **prosjekt-jobb** (eks: "Lage plakat", 300 SKR)

  lastPaymentAt: null         // Siste lønnsbetaling5. Ansett elever til jobbene

}6. Betal lønn → Se at prosjekt avsluttes, fast forblir aktiv

```

### Test-scenario 2: Transaksjoner

**Viktig status-logikk:**1. Logg inn som elev (kari123)

- Systemet bruker kun **2 status-verdier**: `"active"` og `"completed"`2. Send 50 SKR til Emma (kontonr: 103)

- **Åpne jobber:** `status === "active" && assignedTo === null`3. **Se** at saldo oppdateres ØYEBLIKKELIG

- **Tildelte jobber:** `status === "active" && assignedTo !== null`4. Logg ut → Logg inn igjen → Du er fortsatt innlogget!

- **Fullførte jobber:** `status === "completed"`

### Test-scenario 3: Lærer-oversikt

**Jobbtyper:**1. Logg inn som lærer

- **fixed:** Fast jobb (kan betales flere ganger, forblir active)2. Gi 100 SKR til en elev

- **project:** Prosjekt (fullføres ved betaling → completed)3. Trykk "Gi lønn til alle"

4. **Se** at alle tabeller oppdateres umiddelbart

### 4. Application Model

```javascript---

{

  id: "app_001",              // Unik ID## �📁 Prosjektstruktur

  jobId: "job_001",           // Jobb-ID

  applicantId: "s1",          // Søker ID```

  applicantName: "Kari",      // Søker navn/Prosjekt

  applicationText: "Jeg vil gjerne ha denne jobben fordi...",├── index.html              # Hovedfil (kun markup)

  status: "pending",          // "pending" | "accepted" | "rejected"├── server.js              # Node.js Express server

  createdAt: "2025-10-16T10:00:00Z",├── package.json           # Dependencies

  updatedAt: null             // Når endret (hvis elev redigerer)├── MANIFEST.md            # Dette dokumentet

}├── ENKEL_START.md         # Hurtigguide for testing

```│

├── /data

### 5. Settings Model│   └── data.json          # 💾 LOKAL DATABASE (opprettes automatisk)

```javascript│

{├── /css

  className: "7A",            // Klassenavn│   └── styles.css         # Custom CSS (utover Tailwind)

  currencyName: "Skolekroner", // Valutanavn│

  currencySymbol: "SKR",      // Symbol├── /js

  startingBalance: 1000,      // Startsaldo for nye elever│   ├── main.js           # App initialisering og bootstrapping

  updatedAt: "2025-10-16T10:00:00Z"│   ├── config.js         # Konfigurasjon og konstanter

}│   │

```│   ├── /core

│   │   ├── dataServiceSmart.js  # 🔥 Smart auto-detect (AKTIV)

---│   │   ├── dataServiceJSON.js   # JSON-fil database

│   │   ├── dataService.js       # localStorage fallback

## 🔐 AUTENTISERING OG SIKKERHET│   │   ├── auth.js              # Autentisering med persistent session

│   │   └── eventBus.js          # Event system for modulkommunikasjon

### Nåværende implementasjon (Demo)│   │

- **Passord:** Lagres som SHA-256 hash (bedre enn plain text)│   ├── /models

- **Session:** Persistent i `localStorage` (overlever restart)│   │   ├── User.js           # User data model

- **Validering:** Kun client-side (OK for demo)│   │   ├── Transaction.js    # Transaction model

│   │   ├── Job.js            # Job model

### Demo-kontoer│   │   └── Application.js    # Application model

```javascript│   │

// Lærer│   ├── /services

{ username: "laerer", password: "passord" }│   │   ├── userService.js        # Brukeroperasjoner

│   │   ├── transactionService.js # Transaksjonslogikk

// Elever│   │   ├── jobService.js         # Jobbadministrasjon

{ username: "kari123", password: "passord123" }│   │   └── settingsService.js    # App-innstillinger

{ username: "ola456", password: "passord456" }│   │

{ username: "emma789", password: "passord789" }│   ├── /ui

```│   │   ├── uiManager.js      # UI state og screen management

│   │   ├── dashboardUI.js    # Dashboard rendering

### ⚠️ Produksjon (fremtidig)│   │   ├── jobsUI.js         # Jobs interface

- JWT tokens eller session cookies│   │   └── adminUI.js        # Admin/teacher interface

- Server-side autentisering│   │

- HTTPS obligatorisk│   └── /utils

- Rate limiting│       ├── validators.js     # Input validering

- GDPR-compliant datalagring│       ├── formatters.js     # Formattering (valuta, dato)

│       └── helpers.js        # Generelle hjelpefunksjoner

---│

└── /data

## ⚙️ FORRETNINGSLOGIKK - KRITISKE REGLER    └── .gitignore           # Ikke commit lokale data

```

### 1. Transaksjoner (Pengeoverføringer)

---

#### Elev → Elev

```javascript## 👥 Brukerroller

// Må være atomisk!

1. Valider at avsender.balance >= amount### Lærer (Teacher)

2. Valider at mottaker finnes- **ID:** `t1`

3. Trekk fra avsender- **Kontonummer:** `100`

4. Legg til mottaker- **Rettigheter:**

5. Opprett transaksjon  - Publisere og administrere jobber

6. Lagre alt (eller ingenting hvis feil)  - Godkjenne/avvise jobbsøknader

```  - Utbetale lønn (enkelt eller masse)

  - Gi penger til elever

#### Lærer → Elev(er)  - Administrere systeminnstillinger

```javascript  - Legge til/slette elever

// Lærer gir fra "banken" (uendelig penger)  - Se alle transaksjoner

1. Valider at bruker er lærer

2. Øk saldo for hver mottaker### Elev (Student)

3. Opprett transaksjon(er)- **ID:** `s1`, `s2`, `s3`, etc.

4. Inkluder valgfri melding- **Kontonummer:** `101`, `102`, `103`, etc.

```- **Rettigheter:**

  - Se egen saldo

### 2. Jobbsystem  - Overføre penger til andre elever eller banken

  - Se tilgjengelige jobber

#### Opprett jobb (Lærer)  - Søke på jobber

```javascript  - Se aktive og tidligere jobber

1. Valider input (tittel, lønn, type)  - Se egen transaksjonshistorikk

2. Sett status: "active"

3. assignedTo: null (ledig)---

4. Lagre jobb

5. Synlig i "Tilgjengelige jobber"## 💾 Datamodell

```

### 1. Users Collection (`/users`)

#### Søk på jobb (Elev)```javascript

```javascript{

1. Sjekk at jobb er ledig (status="active" && assignedTo=null)  id: "s1",                    // Unik bruker-ID

2. Sjekk at eleven IKKE har søkt før  type: "student",             // "student" | "teacher"

3. Opprett application med status "pending"  name: "Kari Nordmann",       // Fullt navn

4. Valgfri: Elev kan endre søknad (samme metode, oppdaterer eksisterende)  username: "kari123",         // Brukernavn (pålogging)

```  password: "hashedPassword",  // SHA-256 hash (ikke plain text!)

  accountNumber: "101",        // 3-sifret unikt kontonummer

#### Godkjenn søknad (Lærer)  balance: 1000,              // Nåværende saldo (Number)

```javascript  createdAt: "2025-10-16T10:00:00Z"

1. Hent søknad}

2. Oppdater jobb:```

   - assignedTo: applicantId

   - assignedAt: now()### 2. Transactions Collection (`/transactions`)

3. Oppdater denne søknaden: status="accepted"```javascript

4. Avvis alle andre søknader på samme jobb{

5. Lagre alt  id: "tx_1234",              // Unik transaksjon-ID

```  senderId: "s1",             // Avsender bruker-ID

  senderName: "Kari",         // Avsender navn

#### Betal lønn (Lærer)  recipientId: "s2",          // Mottaker bruker-ID

```javascript  recipientName: "Ola",       // Mottaker navn

// Enkelt betaling  amount: 50,                 // Beløp (Number, alltid positiv)

1. Hent jobb  message: "Takk for hjelp",  // Valgfri beskjed

2. Transfer penger (lærer → elev)  timestamp: "2025-10-16T10:30:00Z", // ISO 8601

3. Hvis type === "project":  participants: ["s1", "s2"]  // Array for enkel querying

   - status: "completed"}

   - completedAt: now()```

4. Hvis type === "fixed":

   - lastPaymentAt: now()### 3. Jobs Collection (`/jobs`)

   - Forblir active```javascript

```{

  id: "job_001",              // Unik jobb-ID

```javascript  title: "Tavlevakt",         // Jobbtittel

// Betal alle aktive jobber  description: "Tørke tavlen etter hver time",

1. Hent alle jobber med (status="active" && assignedTo !== null)  salary: 100,                // Lønn per betaling (Number)

2. For hver jobb: kjør payJobSalary()  type: "fixed",              // "fixed" | "project"

3. Returner { successful: [], failed: [] }  status: "open",             // "open" | "assigned" | "completed"

4. Vis resultat til bruker  postedBy: "t1",             // Lærer-ID som publiserte

```  assignedTo: null,           // Elev-ID når tildelt (eller null)

  createdAt: "2025-10-16T09:00:00Z",

#### Avslutt jobb (Lærer)  assignedAt: null,           // Når jobben ble tildelt

```javascript  completedAt: null,          // Når jobben ble fullført

1. Oppdater jobb:  lastPaymentAt: null         // Siste lønnsbetaling (for fixed jobs)

   - status: "completed"}

   - completedAt: now()```

```

**Jobbtyper:**

#### Republiser jobb (Lærer)- **fixed:** Fast jobb som kan betales flere ganger (forblir `assigned`)

```javascript- **project:** Engangsprosjekt som fullføres ved betaling (blir `completed`)

1. Oppdater jobb:

   - status: "active"### 4. Applications Collection (`/applications`)

   - assignedTo: null```javascript

   - assignedAt: null{

   - completedAt: null  id: "app_001",              // Unik søknad-ID

   - lastPaymentAt: null  jobId: "job_001",           // Jobb-ID det søkes på

```  applicantId: "s1",          // Søker bruker-ID

  applicantName: "Kari",      // Søker navn

#### Slett jobb (Lærer)  applicationText: "Jeg ønsker denne jobben fordi...",

```javascript  status: "pending",          // "pending" | "accepted" | "rejected"

1. Slett jobb  createdAt: "2025-10-16T10:00:00Z"

2. Slett alle pending søknader for jobben}

``````



---### 5. Settings Document (`/settings`)

```javascript

## 🎨 BRUKERGRENSESNITT{

  className: "7A",            // Klassenavn

### Skjermstruktur  currencyName: "Skolekroner", // Fullt valutanavn

  currencySymbol: "SKR",      // Valutasymbol/forkortelse

#### **Login Screen**  startingBalance: 1000,      // Startsaldo for nye elever

- Brukernavn og passord  updatedAt: "2025-10-16T10:00:00Z"

- Enkel feilhåndtering}

- Persistent session (ingen logout ved restart)```



#### **Lærer Dashboard**---

Tabs:

1. **📊 Oversikt**## 🔐 Sikkerhet og Autentisering

   - Klasseoversikt (alle elevers saldo)

   - Siste transaksjoner### Nåværende (Lokal Demo)

   - "💰 Gi penger" (med meldingsfelt!)- Hardkodet brukermap i `config.js`

   - "💰 Gi lønn til alle" (batch-betaling)- Passord lagres som SHA-256 hash

- Session lagres i `sessionStorage`

2. **💼 Jobber**- Ingen reell sikkerhet (kun for testing)

   - **Ledige jobber** (status=active, assignedTo=null)

     - Se søknader (antall)### Fremtidig (Produksjon)

     - Rediger jobb- JWT tokens eller session cookies

     - Slett jobb- Server-side autentisering

   - **Aktive jobber** (status=active, assignedTo≠null)- HTTPS obligatorisk

     - Betal lønn- Rate limiting på API

     - Avslutt jobb- Input sanitization

     - Slett jobb

   - **Avsluttede jobber** (status=completed)---

     - Republiser

     - Slett## ⚙️ Forretningslogikk og Kritiske Operasjoner

   - **➕ Opprett ny jobb**

### 1. Pengeoverføringer

#### **Elev Dashboard**

Tabs:#### Elev → Elev/Bank

1. **📊 Oversikt**```javascript

   - Saldo (stor og synlig)// Må være atomisk (transaksjon)

   - Kontonummerasync function transferMoney(senderId, recipientAccountNumber, amount, message) {

   - Siste transaksjoner  // 1. Valider input

  // 2. Hent avsender og mottaker

2. **💸 Send penger**  // 3. Sjekk at sender.balance >= amount

   - Mottakers kontonummer  // 4. Trekk fra avsender

   - Beløp  // 5. Legg til mottaker

   - Melding (valgfri)  // 6. Opprett transaksjon

  // 7. Lagre alt atomisk (alle eller ingen)

3. **💼 Jobber**}

   - **Tilgjengelige jobber**```

     - "📝 Søk jobben" (hvis ikke søkt)

     - "✅ Søknad sendt" + "✏️ Endre søknad" (hvis søkt)**Kritiske sjekker:**

   - **Mine aktive jobber**- Avsender har nok penger

     - Viser jobber eleven har- Mottaker finnes

   - **Mine tidligere jobber**- Beløp er positivt

     - Historikk- Ingen desimaler (eller max 2)



---#### Lærer → Elev(er) (Utbetaling)

```javascript

## 🔄 DATA-FLYT OG OPPDATERINGSLOGIKK// Lærer gir penger fra "banken"

async function giveMoney(teacherId, recipients, amount, message) {

### Hybrid initialiseringssystem  // 1. Valider at bruker er lærer

```javascript  // 2. For hver mottaker:

1. Sjekk om localStorage har data  //    - Øk saldo

2. Hvis JA: Last fra localStorage  //    - Opprett transaksjon

3. Hvis NEI:   // 3. Lagre alt i batch

   - Fetch data/initial-data.json}

   - Hash alle passord med SHA-256```

   - Lagre til localStorage

4. Vis dashboard### 2. Jobbsystem

```

#### Publisering

### Eksport/Import (Lærer)- Lærer oppretter jobb

```javascript- Status settes til `open`

// Eksport- Vises i "Tilgjengelige jobber" for elever

1. Hent ALL data fra localStorage

2. Konverter til JSON#### Søknad

3. Last ned som fil (econsim-backup-YYYY-MM-DD.json)- Elev kan søke på `open` jobber

- Elev kan **ikke** søke på samme jobb to ganger

// Import- Søknad får status `pending`

1. Brukeren laster opp JSON-fil

2. Valider strukturen#### Godkjenning

3. ERSTATT all localStorage data```javascript

4. Refresh sidenasync function acceptApplication(applicationId) {

```  // 1. Hent søknad

  // 2. Oppdater jobb:

### Reset til initial data  //    - status: "assigned"

```javascript  //    - assignedTo: applicantId

1. localStorage.clear()  //    - assignedAt: now

2. location.reload()  // 3. Oppdater denne søknaden: status "accepted"

3. Systemet laster initial-data.json på nytt  // 4. Avvis alle andre søknader på samme jobb

```  // 5. Lagre alt i batch

}

---```



## 🐛 KJENTE ISSUES OG LØSNINGER#### Lønnsutbetaling (Enkel)

```javascript

### Issue #1: Status-konsistens ✅ FIKSETasync function payJobSalary(jobId) {

**Problem:** Koden brukte både `"open"` og `"active"` for samme konsept.    // 1. Hent jobb

**Løsning:**   // 2. Transfer penger fra bank til assignedTo

- Endret `JOB_STATUS.OPEN = 'active'`  // 3. Hvis type === "project":

- Endret `JOB_STATUS.ASSIGNED = 'active'`  //    - status: "completed"

- Bruker `assignedTo` felt for å skille ledige vs tildelte  //    - completedAt: now

  // 4. Hvis type === "fixed":

### Issue #2: getJobById finnes ikke ✅ FIKSET  //    - lastPaymentAt: now

**Problem:** Koden kalte `jobService.getJobById()` som ikke eksisterer.    //    - forblir "assigned"

**Løsning:** Bruker `getJobs()` og `.find(j => j.id === jobId)`}

```

### Issue #3: Søknadsstatus sjekket feil felt ✅ FIKSET

**Problem:** Koden sjekket `app.studentId` men feltet heter `applicantId`.  #### Lønnsutbetaling (Alle aktive)

**Løsning:** Endret til `app.applicantId === user.id````javascript

async function payAllActiveJobs() {

### Issue #4: Kan ikke endre søknad ✅ FIKSET  // 1. Hent alle jobber med status "assigned"

**Problem:** Elever kunne ikke endre søknad etter innsending.    // 2. For hver jobb: kjør payJobSalary

**Løsning:**  // 3. Batch alle operasjoner

- Ny metode `showEditApplicationModal()`}

- `applyForJob()` oppdaterer eksisterende søknad hvis den finnes```

- Viser "✏️ Endre søknad" knapp når eleven har søkt

#### Avslutt Jobb

### Issue #5: "Gi lønn til alle" returnerte feil format ✅ FIKSET```javascript

**Problem:** `payAllActiveSalaries()` returnerte bare array, ikke `{ successful, failed }`.  async function endJob(jobId) {

**Løsning:** Endret returverdi til strukturert objekt med separate lister.  // 1. Oppdater jobb:

  //    - status: "completed"

### Issue #6: Lærer mangler meldingsfelt ✅ FIKSET  //    - completedAt: now

**Problem:** Elevene har meldingsfelt, læreren har ikke.  }

**Løsning:**```

- Lagt til `<textarea id="giveMoneyMessage">` i HTML

- `handleGiveMoney()` bruker nå meldingen#### Legg ut på nytt

- Default: "Utbetaling fra lærer" hvis tomt```javascript

async function republishJob(jobId) {

---  // 1. Oppdater jobb:

  //    - status: "open"

## ✅ KVALITETSKRAV  //    - assignedTo: null

  //    - assignedAt: null

### Kodekvalitet  //    - completedAt: null

- ES6+ moderne syntax  //    - lastPaymentAt: null

- Konsistent camelCase}

- JSDoc kommentarer for alle funksjoner```

- DRY (Don't Repeat Yourself)

- Modulær struktur#### Slett Jobb

```javascript

### Valideringasync function deleteJob(jobId) {

- **Kontonummer:** 3 siffer, unikt  // 1. Slett jobb

- **Beløp:** Positivt tall, max 2 desimaler  // 2. Slett alle søknader med status "pending" for denne jobben

- **Brukernavn:** 3-20 tegn}

- **Passord:** Min 6 tegn (demo), 8+ i produksjon```

- **Jobbtittel:** 3-100 tegn

---

### Performance

- Lazy loading der mulig## 🎨 UI/UX Prinsipper

- Effektiv re-rendering (kun endrede elementer)

- Debouncing av søk/filter### Design System

- **Farger:** Tailwind CSS palette

---- **Typografi:** Inter font-family

- **Spacing:** Tailwind spacing scale

## 🚀 VS CODE SETUP- **Responsivt:** Mobile-first approach



### Essensielle Extensions### Skjermer

1. **Live Server** (ritwickdey.LiveServer) - **PÅKREVD**

2. ES6 String HTML (Tobermory.es6-string-html)#### 1. Login Screen

3. Path Intellisense (christian-kohler.path-intellisense)- Brukernavn og passord

4. ESLint (dbaeumer.vscode-eslint)- Enkel feilhåndtering

5. GitLens (eamodio.gitlens)

#### 2. Dashboard (Elev)

### Installasjon- **Header:** Navn, kontonummer, saldo

```bash- **Tabs:**

code --install-extension ritwickdey.LiveServer  - Oversikt (saldo, recent transactions)

code --install-extension Tobermory.es6-string-html  - Send penger

code --install-extension christian-kohler.path-intellisense  - Jobber (tilgjengelige, aktive, historikk)

```  - Transaksjonshistorikk



### Hvordan kjøre#### 3. Dashboard (Lærer)

1. Åpne prosjektmappen i VS Code- **Header:** Bankinformasjon

2. Høyreklikk `index.html`- **Tabs:**

3. Velg "Open with Live Server"  - Oversikt

4. Åpner på: `http://127.0.0.1:5500`  - Gi penger (enkelt/masse)

  - Jobbadministrasjon

---  - Admin innstillinger



## 📊 PEDAGOGISK TILPASNING### Interaktivitet

- Real-time oppdateringer (polling hver 2 sekund for lokal versjon)

### Norske læringsmål- Optimistic UI updates

- Loading states

#### Matematikk- Error handling med brukervenlige meldinger

- Grunnleggende regning med penger- Confirmation dialogs for kritiske handlinger

- Budsjettering og planlegging

- Transaksjoner og regnskap---



#### Samfunnsfag## 🔄 Migrasjonsstrategi (Lokal → SQL)

- Grunnleggende økonomi

- Arbeidsmarked og lønn### DataService Abstraksjon

- Økonomisk ansvar```javascript

// Alle dataoperasjoner går gjennom dette laget

### Realistiske lønnsnivåer (norsk ungdom)class DataService {

- **Enkle oppgaver:** 50-100 SKR  async getUser(userId) { /* ... */ }

- **Normale jobber:** 100-200 SKR  async updateUser(userId, data) { /* ... */ }

- **Prosjekter:** 200-500 SKR  async createTransaction(txData) { /* ... */ }

  // etc.

### Eksempler på klasseromsjobber}

- Tavlevakt (fast, 50 SKR/uke)

- PC-ansvarlig (fast, 100 SKR/uke)// Implementasjoner:

- Lage plakat (prosjekt, 200 SKR)class LocalStorageDataService extends DataService { /* ... */ }

- Presentasjon (prosjekt, 300 SKR)class SQLDataService extends DataService { /* ... */ }

```

---

### Migrasjonssteg

## 📝 CHANGELOG - KRITISKE ENDRINGER1. **Utvikle med LocalStorage** (nå)

2. **Test all funksjonalitet**

### Version 2.1 (Oktober 2025)3. **Implementer SQLDataService**

4. **Bytt ut i config.js:** `dataService = new SQLDataService()`

#### ✅ Implementert:5. **Ingen endringer i business logic**

1. **Persistent login** - localStorage i stedet for sessionStorage

2. **Hybrid database** - initial-data.json → localStorage---

3. **Komplett jobbsystem** - søknader, godkjenning, betaling

4. **Eksport/Import** - JSON backup og restore## ✅ Kvalitetskrav

5. **Søknadsredigering** - elever kan endre søknader

6. **Lærer meldingsfelt** - kan legge til melding ved utbetaling### Kodekvalitet

7. **Status-konsistens** - fikset "active" vs "open" konflikt- ✅ ES6+ moderne syntax

8. **Batch-betaling** - "Gi lønn til alle" fungerer korrekt- ✅ Konsistent navngiving (camelCase for JS)

- ✅ JSDoc kommentarer for alle funksjoner

#### 🔧 Tekniske fikser:- ✅ DRY (Don't Repeat Yourself)

- Alle `getJobById()` kall erstattet med `getJobs().find()`- ✅ SOLID prinsipper hvor mulig

- `applicantId` brukes konsistent (ikke `studentId`)

- `payAllActiveSalaries()` returnerer `{ successful, failed }`### Testing (Fremtidig)

- Modal-metoder bruker korrekte felt-IDer- Unit tests for alle services

- Integration tests for kritiske flows

---- E2E tests for brukerreiser



## 🎓 VIKTIG FOR AI-ASSISTENTER### Performance

- Lazy loading av moduler hvor mulig

Dette manifestet er **kilden til sannhet** for prosjektet. Når du jobber med EconSim:- Debouncing av search/filter operasjoner

- Efficient re-rendering (kun endrede elementer)

### Alltid sjekk:

1. Datamodellene (riktige feltnavn!)### Tilgjengelighet

2. Status-logikken (active vs completed)- Semantisk HTML

3. Forretningsreglene (kritiske operasjoner)- ARIA labels hvor nødvendig

4. Eksisterende fikser (ikke gjenta bugs)- Keyboard navigation support



### Alltid oppdater manifestet ved:---

- Nye features

- Endringer i datamodell## 🚀 Utviklingsplaner

- Nye bugs/fikser

- Arkitektur-beslutninger### Fase 1: Foundation (Pågår)

- Forretningsregler- [x] Arkitektur og manifest

- [ ] Modular struktur

### Aldri anta:- [ ] LocalStorage DataService

- Feltnavnene kan være `studentId`, `applicantId`, eller `userId` - SJEKK MANIFESTET- [ ] Core funksjoner (auth, transactions)

- Status-verdiene kan være `open`, `active`, `assigned` - SJEKK MANIFESTET

- Metoder kan finnes eller ikke - SJEKK FAKTISKE IMPLEMENTASJONER### Fase 2: Features

- [ ] Komplett jobbsystem

---- [ ] Admin innstillinger

- [ ] Avansert transaksjonsfiltrering

## 🔮 FREMTIDIGE PLANER- [ ] Notifikasjoner



### Fase 1: Polish (pågående)### Fase 3: Enhancement

- [ ] Grafisk statistikk- [ ] Grafer og statistikk

- [ ] Eksporter til CSV/PDF- [ ] Export til CSV/PDF

- [ ] Mørk modus- [ ] Mørk modus

- [ ] Notifikasjoner- [ ] Flere valutaer



### Fase 2: Produksjon### Fase 4: Production

- [ ] SQL backend API- [ ] SQL backend API

- [ ] Real autentisering (JWT)- [ ] Real autentisering

- [ ] Multi-klasse support- [ ] Multi-klasse support

- [ ] GDPR-compliant datalagring- [ ] Deployment setup



### Fase 3: Avansert---

- [ ] Markedsplass (elev-til-elev handel)

- [ ] Lån og renter## 📚 Vedlegg

- [ ] Budsjettkonkurranser

- [ ] Achievements/badges### A. Standard Brukerdata (Hardkodet Demo)

```javascript

---// Teacher

{ id: "t1", username: "laerer", password: "passord", name: "Lærer Bank", accountNumber: "100", type: "teacher" }

## 📞 METADATA

// Students

**Prosjekteier:** Daniel  { id: "s1", username: "kari123", password: "passord123", name: "Kari Nordmann", accountNumber: "101", type: "student" }

**Institusjon:** HVL (Høgskulen på Vestlandet)  { id: "s2", username: "ola456", password: "passord456", name: "Ola Hansen", accountNumber: "102", type: "student" }

**Semester:** Høst 2025  // ... etc

**Type:** Klasseromssimulator  ```

**Språk:** Norsk (Bokmål)  

**Teknologi:** HTML5 + ES6 Modules + localStorage  ### B. LocalStorage Nøkler

**Status:** Aktiv utvikling med AI-assistanse```

econsim_users           // Array av user objects

---econsim_transactions    // Array av transaction objects

econsim_jobs           // Array av job objects

**Dette manifestet oppdateres kontinuerlig og reflekterer ALLTID nåværende tilstand av prosjektet.**econsim_applications   // Array av application objects

econsim_settings       // Settings object

**Sist oppdatert:** 16. oktober 2025econsim_session        // Current session object

```

### C. Validering Regler
- **Kontonummer:** 3 siffer, unikt
- **Beløp:** Positivt tall, max 2 desimaler
- **Brukernavn:** 3-20 tegn, alphanumerisk + underscore
- **Passord:** Min 6 tegn (i produksjon: 8+ med kompleksitet)
- **Jobbtittel:** 3-100 tegn
- **Jobblønn:** Positivt heltall

### D. VS Code Setup og Extensions

#### Essensielle Extensions:

1. **Live Server** (`ritwickdey.LiveServer`) - **PÅKREVD**
   - Kjør lokal webserver med live reload
   - Høyreklikk index.html → "Open with Live Server"

2. **ES6 String HTML** (`Tobermory.es6-string-html`)
   - Syntax highlighting for HTML i template strings

3. **Path Intellisense** (`christian-kohler.path-intellisense`)
   - Autocomplete for import-stier

4. **ESLint** (`dbaeumer.vscode-eslint`)
   - JavaScript linting og kodekvalitet

5. **Norwegian Spell Checker** (`streetsidesoftware.code-spell-checker-norwegian-bokmal`)
   - Stavekontroll for norsk dokumentasjon

6. **GitLens** (`eamodio.gitlens`)
   - Avansert Git integrasjon

7. **Better Comments** (`aaron-bond.better-comments`)
   - Fargekodet kommentarer (TODO, FIXME, etc.)

#### Installasjon:
```bash
code --install-extension ritwickdey.LiveServer
code --install-extension Tobermory.es6-string-html
code --install-extension christian-kohler.path-intellisense
code --install-extension dbaeumer.vscode-eslint
code --install-extension streetsidesoftware.code-spell-checker-norwegian-bokmal
code --install-extension eamodio.gitlens
code --install-extension aaron-bond.better-comments
```

### E. Kjente Issues og Fikser (Oppdatert 16.10.2025)

#### ✅ Fikset:
- Modulær arkitektur implementert
- localStorage datalag ferdig
- Auth system fungerer
- Transaction service komplett

#### 🔧 Under arbeid:
- **"Gi lønn til alle" knapp** - Implementert i jobService.payAllActiveSalaries()
- **"Avslutt jobb" knapp** - Implementert i jobService.endJob()
- **"Legg ut på nytt" knapp** - Implementert i jobService.republishJob()
- **"Fjern elev" knapp** - Implementert i userService.deleteStudent()

#### 📋 Gjenstående UI:
- Komplett lærer dashboard med alle knapper
- Komplett elev dashboard
- Jobbsøknadssystem UI
- Settings panel

---

## 📞 Kontakt og Support

**Prosjekteier:** Daniel  
**Institusjon:** HVL (Høgskulen på Vestlandet)  
**Semester:** Høst 2025  
**Kurs:** Prosjekt

---

## 🎓 Pedagogiske tilpasninger for Norge

### Målgruppe
- **Alder:** Ungdomsskole (13-16 år)
- **Land:** Norge
- **Språk:** Norsk (Bokmål)
- **Kontekst:** Klasserom med én lærer og 20-30 elever

### Læringsmål (Knyttet til norsk læreplan)

#### Matematikk:
- Grunnleggende regning med penger
- Budsjettering og økonomisk planlegging
- Prosentregning (hvis implementert)
- Transaksjoner og regnskap

#### Samfunnsfag:
- Grunnleggende økonomi og handel
- Arbeidsmarked og lønn
- Ansvar og konsekvenser av økonomiske valg
- Samarbeid og ressursfordeling

### Norsk økonomi-tilpasninger

#### Valuta:
- **Standard:** "Skolekroner" (SKR)
- **Kan tilpasses til:** "Klassekoins", "7A-kroner", etc.
- **Startsaldo:** 1000 SKR (ca. en måneds lommepenger)

#### Lønnnivå (realistiske for norsk ungdom):
- **Enkle oppgaver:** 50-100 SKR
- **Normale jobber:** 100-200 SKR
- **Prosjekter:** 200-500 SKR

#### Eksempler på klasseromsjobber:
- Tavlevakt (fast jobb, 50 SKR/uke)
- PC-ansvarlig (fast jobb, 100 SKR/uke)
- Klassebibliotekar (fast jobb, 75 SKR/uke)
- Prosjekt: Lage plakat (engangsprosjekt, 200 SKR)
- Prosjekt: Presentasjon (engangsprosjekt, 300 SKR)

### Sikkerhet og personvern (GDPR)

⚠️ **VIKTIG for produksjonsbruk:**

1. **Ingen ekte personopplysninger**
   - Bruk kun elevnavn og fiktive data
   - Ikke lagre personnummer, adresser, etc.

2. **Datalagring**
   - localStorage er kun for testing/demo
   - Produksjon MÅ bruke server-side database
   - Implementer proper backup og sletting

3. **Samtykke**
   - Få skriftlig samtykke fra foresatte
   - Informer om hva data brukes til
   - Gi mulighet for sletting av data

### Pedagogiske prinsipper

#### Inkludering:
- Alle starter med samme saldo (likhet)
- Jobber tilgjengelig for alle (rettferdig konkurranse)
- Lærer kan gi støtte til elever som trenger det

#### Konsekvenser:
- Penger brukt er borte (lærer å budsjettere)
- Jobber gir inntekt (lærer arbeidsmoral)
- Kan handle med medelever (samarbeid)

#### Motivasjon:
- Synlig saldo (konkret tilbakemelding)
- Realistiske jobber (relevant for fremtiden)
- Valgfrihet i økonomiske beslutninger

### Tilpasning til klassen

Læreren kan tilpasse:
- **Klassenavn:** "7A", "8B Superstjerner", etc.
- **Valutanavn:** Kreative navn som engasjerer
- **Startsaldo:** Justeres etter klassenivå
- **Lønnsnivå:** Balanseres for økonomien

### Foreslåtte classroom-aktiviteter

1. **Uke 1:** Introduksjon og grunnleggende transaksjoner
2. **Uke 2-3:** Jobbsøking og første lønning
3. **Uke 4:** Handel mellom elever (hvis tillatt)
4. **Uke 5+:** Budsjettkonkurranse, sparing, etc.

## 📝 Endringslogg

### v2.0 (2025-10-16)
- Migrert fra Firebase til lokal-first arkitektur
- Modulær ES6+ struktur
- DataService abstraksjon for fremtidig SQL-integrasjon
- Komplett dokumentasjon i manifest
- Pedagogiske tilpasninger for norsk ungdomsskole
- VS Code setup guide

### v1.0 (Tidligere)
- Opprinnelig Firebase implementasjon

---

## 🔄 Vedlikehold av Manifest

**VIKTIG:** Dette manifestet er "Mesterplanen" for prosjektet og skal ALLTID holdes oppdatert!

### Når skal manifestet oppdateres?

- ✅ Ved hver ny feature eller endring i arkitektur
- ✅ Når datamodeller endres
- ✅ Når nye forretningsregler legges til
- ✅ Ved hver prompt/diskusjon som endrer planene
- ✅ Når bugs fikses som påvirker spesifikasjonen
- ✅ Ved tillegg av nye dependencies eller teknologier

### Ansvar

Både mennesker og AI-assistenter som jobber med prosjektet SKAL oppdatere dette dokumentet når relevante endringer gjøres. Manifestet er kilden til sannhet for hva systemet skal gjøre og hvordan det skal gjøres.

---

## 📝 CHANGELOG - SISTE ENDRINGER

### Version 2.1 (16. oktober 2025)

#### ✅ Implementerte funksjoner:

1. **Persistent Login (localStorage)**
   - Bruker forblir innlogget til de logger ut
   - Endret fra `sessionStorage` til `localStorage` i `auth.js`
   - Session overlever nettleser-restart

2. **Smart Hybrid Database System**
   - Ny fil: `dataServiceSmart.js`
   - Auto-detecter JSON-database (hvis Node.js server kjører)
   - Fallback til localStorage (hvis kun Live Server)
   - Alle imports byttet til Smart dataService

3. **JSON File Database (valgfri)**
   - `dataServiceJSON.js` - lagrer til `data/data.json`
   - `server.js` - Express server på port 3000
   - Permanent lagring når Node.js brukes

4. **Job Refresh Fix**
   - `handleCreateJob()` kaller `loadTeacherJobs()` umiddelbart
   - Jobber vises øyeblikkelig etter opprettelse
   - Ingen manual refresh nødvendig

5. **Dokumentasjon oppdatert**
   - `MANIFEST.md` - hybrid system dokumentert
   - `ENKEL_START.md` - begge oppstartmetoder forklart
   - To-do liste oppdatert med nye tester

#### 🔧 Tekniske endringer:
- Alle services importerer `dataServiceSmart.js`
- `auth.js` bruker localStorage i stedet for sessionStorage
- Console logger hvilken database som er aktiv

#### 📁 Nye filer:
- `js/core/dataServiceSmart.js` - Smart auto-detect wrapper

#### ⚙️ Endrede filer:
- `js/core/auth.js` - localStorage for persistent session
- `js/main.js` - import smart dataService
- `js/services/*.js` - alle importerer smart dataService
- `MANIFEST.md` - arkitektur og setup dokumentert
- `ENKEL_START.md` - to oppstartmetoder dokumentert

---

### Version 2.2 (16. oktober 2025 - Innstillinger og elevadministrasjon)

#### ✅ Ny funksjonalitet:

1. **⚙️ Innstillingsmodal (Lærer)**
   - **Klasseinformasjon:** Endre klassenavn
   - **Valuta:** Tilpass valutanavn og forkortelse (Standard: KlasseKrone/KKr)
   - **Startkapital:** Bestem hvor mye nye elever får i startkapital
   - **Bedriftsfunksjoner:** Skru av/på mulighet for elever å starte bedrifter (kommer senere)
   - **Elevadministrasjon:** Legg til og fjern elever direkte i innstillinger

2. **👥 Elevadministrasjon**
   - Legg til nye elever med navn, brukernavn, passord
   - Automatisk tildeling av unikt kontonummer (101, 102, 103...)
   - Fjern elever (data bevares, kan ikke logge inn)
   - Oversikt over alle elever med kontonummer

3. **🧹 Rengjort initial data**
   - Fjernet alle demo-jobber fra `initial-data.json`
   - Systemet starter nå uten jobber (tom liste)
   - Bedre for faktisk bruk i klasserommet

#### 🎨 UI-endringer:
- Ny "⚙️ Innstillinger" knapp i lærer-dashboard (oransje)
- Fullstendig innstillingsmodal med tabs for forskjellige innstillinger
- Elevliste med "Fjern" knapp per elev
- Form for å legge til nye elever

#### 📁 Oppdaterte filer:
- `index.html` - ny innstillingsmodal + knapp
- `js/main.js` - nye metoder: showSettingsModal, saveSettings, addNewStudent, deleteStudent
- `js/config.js` - oppdatert standard valuta til KlasseKrone (KKr)
- `data/initial-data.json` - fjernet demo-jobber

#### 🔧 Tekniske detaljer:
- Settings lagres i localStorage via settingsService
- Kontonummer genereres automatisk (starter på 101)
- Valuta-innstillinger oppdaterer umiddelbart ved lagring
- Bedriftsfunksjon (enableBusinesses) lagt til for fremtidig utvidelse

---

**Dette dokumentet skal alltid være oppdatert og reflektere nåværende og planlagt tilstand av prosjektet.**

**Sist oppdatert:** 16. oktober 2025 (v2.2)

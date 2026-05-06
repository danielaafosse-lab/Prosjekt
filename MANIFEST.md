# 🚀 EconSim - Prosjektmanifest

**Versjon:** 5.2 - Bugfixes og Forbedringer
**Dato:** 13. desember 2025
**Institusjon:** HVL (Høgskulen på Vestlandet)
**Målgruppe:** Norsk ungdomsskole (13-16 år)
**Type:** Økonomisimulator for klasserommet
**Teknologi:** HTML5 + ES6 Modules + Tailwind CSS + Firebase Firestore + EmailJS

---

## 🔧 ENDRINGER 16. mars 2026

### Nullstilling av klasserom (lærer)
- **Transaksjonshistorikk slettes nå fullt ut:** Ved lærer-nullstilling slettes nå all klasseromsdata først, inkludert transaksjoner, slik at historikk for både lærer og elev blir nullstilt.
- **Legacy-transaksjoner ryddes også:** Transaksjoner uten `classroomId` (eldre data) slettes nå dersom de involverer brukere i klasserommet.
- **Login-statistikk nullstilles:** `statsService.resetClassroomStats(classroomId)` kjøres nå også ved lærer-nullstilling.
- **Ekstra robust transaksjonsrydding:** Legacy-rydding inkluderer nå også lærer-ID hentet både fra klasserom-dokument og brukere med samme `classroomId`.

### Manuell refresh for flere roller
- **Ny refresh-knapp for lærer:** Lærer-dashboard har nå `🔄 Oppdater` som tvinger datainnhenting og visningsoppdatering.
- **Ny refresh-knapp for elev:** Elev-dashboard har nå `🔄 Oppdater` som tvinger ny lasting av saldo, historikk og relevant dashboard-data.
- **Aktiv fane beholdes:** Ved manuell refresh forsøker appen å beholde gjeldende visning for lærer/elev.

### Demo-reset robusthet
- **Sletter data før elevsletting:** Demo-reset sletter nå klasseromsdata før elever slettes for å sikre at også gammel transaksjonshistorikk knyttet til elev-ID-er fjernes korrekt.
- **Verifisert demo-kobling:** Ny integritetssjekk sørger for at demo-lærer (`t1`/`laerer`), demo-klasserom (`demo-classroom`) og demo-elever fra `initial-data.json` er korrekt koblet sammen.
- **Kjøres både ved oppstart og etter demo-reset:** Integritetssjekken kjøres automatisk ved init og umiddelbart etter reset av demo-klasserom.

### Isolering av lærerhistorikk
- **Sikrere filter i lærerhistorikk:** Hvis klasserom-objekt mangler, brukes fallback til `currentUser.classroomId` for å unngå visning av globale transaksjoner.
- **Sikker fallback:** Hvis klasserom fortsatt ikke kan bestemmes, vises kun lærerens egne transaksjoner i stedet for all historikk.

### Progressiv skatt - grenser og forhåndsvisning
- **Sammenhengende skattetrinn:** Start for neste trinn settes nå alltid til forrige trinns øvre grense + 1.
- **Robust validering i UI:** Hvis øvre grense i trinn 2 settes lavere enn trinn 1 + 1, justeres den automatisk opp.
- **Dynamisk eksempel oppdateres live:** Eksempelet under progressive trinn oppdateres nå umiddelbart når grenser eller satser endres.
- **Korrekt lagring av trinn:** Innstillinger lagres med `min`-verdier som følger `forrige max + 1`.
- **Korrekt skatteberegning:** Progressiv beregning bruker inkluderende intervaller (f.eks. `501-1500`) og normaliserer trinnkontinuitet før utregning.
- **Fikset "første gang" i settings-modal:** Live-oppdatering av starttall for neste skattetrinn bindes nå alltid ved åpning av innstillinger, også når `tax.brackets` ikke tidligere har vært lagret.

### Valuta og klasserom-synk
- **Ferske innstillinger for elev:** Elev-dashboard henter nå alltid oppdaterte klasseromsinnstillinger via `settingsService.getSettings()`, slik at valutanavn/symbol følger lærerens endringer.

### Lærerens eleveoversikt
- **Total saldo per elev:** Kolonnen for saldo i lærerens eleveoversikt viser nå samlet beløp for brukskonto + sparekonto + fondskonto (ikke bare brukskonto).
- **"Vis detaljer" per elev:** Lærer kan nå utvide hver elevrad for å se fordeling mellom brukskonto, sparekonto og fondskonto.

### Bedriftsoversikt (lærer)
- **Ny kolonne for ukesendring:** "Alle bedrifter" viser nå prosentvis endring siste uke.
- **Rangering på prosentvekst:** Bedrifter sorteres etter prosentvis vekst (ikke absolutte kroner).
- **Farge-/pilindikatorer:**
   - Grønn opp (`⬆️`) for sterk vekst
   - Turkis skrå opp (`↗️`) for mild vekst
   - Gul høyre (`➡️`) for flat utvikling
   - Oransje skrå ned (`↘️`) for mild nedgang
   - Rød ned (`⬇️`) for sterk nedgang

### Sparing/fond - tidsmodell og bedre fondsdynamikk
- **Ny innstilling: tidsmodell for rente/avkastning** i lærerens innstillinger:
   - Akselerert skolemodus: `1 uke = 1 måned`
   - Realistisk: `1 uke = 1 uke`
- **Tidsmodell lagres per klasserom** (`settings.simulation.timeModel`).
- **Oppdatert fondsformel:** Avkastning bruker nå en enkel stokastisk modell med forventet drift + volatilitet (normalfordelt sjokk), som gir mer realistisk variasjon over tid enn lineær `base ± uniform`.
- **Sparerente følger valgt tidsmodell** ved periodisering av årlig rente.

### Lån-fane for elev
- **Skjules når deaktivert:** Elevens lån-fane skjules nå helt når lånesystemet er slått av (samme mønster som bedrifter).
- **Direkte navigering blokkert:** Hvis lån er deaktivert og elev prøver å åpne lån-skjermen, sendes visningen tilbake til oversikt.
- **Lånesøknad blokkert når deaktivert:** Innsending av lånesøknad stoppes med tydelig feilmelding dersom lånesystemet er av.

### UI/oversettelser
- **Refresh oversatt:** `Oppdater`/`Refreshing...` støtter nå både norsk og engelsk for elev, lærer og superadmin.
- **Emoji fjernet i header:** Fjernet emoji foran "Klasserom:" i toppen av lærer- og elevdashboard.

---


## 🔧 ENDRINGER 15. desember 2025

### UI-forbedringer
- **Footer:** Footer er nå kun enkel tekst nederst på siden, ikke sticky/fixed, og dominerer ikke innholdet. Vises kun når man scroller til bunn.

---

## 🔧 NYE FUNKSJONER I V5.2 (13. desember 2025)

### Bugfixes
- **[object Promise] feil:** Fikset asynkron rendering av bedriftsjobber med Promise.all()
- **Notification badges:** Badges vises nå umiddelbart ved innlogging (await på alle badge-funksjoner)
- **Svar/reply-knapp:** Fikset visning av svar-knapp for meldinger (støtter både fromId/senderId varianter)
- **Utboks:** Sendte meldinger vises nå korrekt (createTeacherMessage og createBusinessMessage oppretter utboks-kopi)
- **Bedriftsjobber for elever:** Refresh av businessService cache ved lasting av jobber
- **Aksepterte jobbtilbud:** Forsvinner nå korrekt etter aksept (await på alle UI-oppdateringer)

### Oversettelser
- **common.exampleAmount:** Lagt til oversettelse "f.eks. 50" / "e.g. 50"
- **jobs.terms:** Lagt til oversettelse "Vilkår:" / "Terms:"

### UI-forbedringer
- **Footer:** Endret fra fixed til normal posisjon (ikke lenger overlagt på innhold)
- **Body layout:** Lagt til flexbox for sticky footer-effekt

---

## 🔧 NYE FUNKSJONER I V5.1 (12. desember 2025)

### Fullstendig Meldingssystem Omstrukturering

**Ny kategoristruktur for alle brukertyper:**

| Brukertype | Kategorier |
|------------|------------|
| Lærer | System, Lån, Jobb, Bedrifter, Elever, Utboks |
| Elev | System, Lærer, Bedrifter, Elever, Utboks |
| Bedrift | System, Lærer, Elever, Bedrifter, Utboks |

### Utboks-funksjonalitet
- **Sendte meldinger:** Alle brukertyper kan nå se sine sendte meldinger
- **Lest-status:** Grønn hake (✓ Lest) eller grå sirkel (◯ Ulest)
- **Tidspunkt:** Viser når mottaker leste meldingen
- **Ny collection:** `OUTBOX` i Firebase for sendte meldinger

### Ukesrapporter (Automatisk hver mandag kl 08:00)
- **Elevrapporter:** Hver elev mottar individuell rapport med:
  - Egen formue og endring siden forrige uke
  - Rangering blant medelever
  - Oppsummering av økonomisk status
- **Bedriftsrapporter:** Hver bedrift mottar rapport med:
  - Beholdning og endring
  - Antall ansatte
  - Økonomisk oversikt
- **Snapshot-system:** Lagrer ukentlige data for sammenligning (`WEEKLY_SNAPSHOTS` collection)

### Notification Badge Fix
- **Umiddelbar visning:** Badge vises nå rett etter innlogging
- **Optimalisert polling:** Endret fra 5 sekunder til 30 sekunder
- **Bedre ytelse:** Redusert serverbelastning

### Read-status Fix
- **Markering ved åpning:** Meldinger markeres som lest når de åpnes
- **readAt timestamp:** Lagrer tidspunkt for lesing
- **Utboks-synkronisering:** Avsender ser når mottaker har lest

### Forbedret Utskrift
- **Profesjonell formatering:** Bevaer linjeskift og struktur
- **Monospace font:** Kontrakter vises med fast bredde-skrift
- **Dedikert print-vindu:** Pent formatert utskriftsversjon
- **Metadata:** Viser avsender, mottaker, dato i utskriften

### Oppdaterte filer
- `js/core/dataService.firebase.js` - Ny OUTBOX/WEEKLY_SNAPSHOTS collections, utboks-funksjoner
- `js/main.js` - Ny kategori-UI, utboks-rendering, badge-fix, print-forbedring
- `js/services/schedulerService.js` - Ukesrapporter til elever og bedrifter
- `js/services/languageService.js` - Nye oversettelser for kategorier og rapporter
- `index.html` - Nye faner for alle brukertyper

### Nye Firebase Collections
- `outbox` - Sendte meldinger med lest-status tracking
- `weeklySnapshots` - Ukentlige formue-snapshots for rapportsammenligning

### Nye Oversettelsesnøkler
- `inbox.teacher`, `inbox.businesses`, `inbox.students`, `inbox.jobs`, `inbox.outbox`
- `inbox.read`, `inbox.unread`, `inbox.readAt`
- `report.weeklyTitle`, `report.wealthChange`, `report.ranking`

---

## 🔧 NYE FUNKSJONER I V5.0 (12. desember 2025)

### Kritisk Bugfix - Bedriftsopprettelse
- **Feil:** "No document to update" når elev prøvde å starte bedrift
- **Årsak:** `saveClassroomItem()` brukte `firebaseService.update()` som feiler for nye dokumenter
- **Løsning:** Endret til `firebaseService.set()` som håndterer både nye og eksisterende dokumenter

### Ytelsesoptimalisering - Parallell Initialisering
**Innlogging og oppstart er nå betydelig raskere:**

1. **`loadClassroomDataToCache()` - Parallell datalasting:**
   - FØR: 5 Firebase-queries kjørte sekvensielt (A → B → C → D → E)
   - ETTER: Alle 5 queries kjører parallelt med `Promise.all()`
   - Forventet forbedring: ~5x raskere datalasting

2. **`initializeUserServices()` - Parallell tjeneste-initialisering:**
   - FØR: 7 tjenester initialisert sekvensielt
   - ETTER: Alle 7 tjenester initialiseres parallelt med `Promise.allSettled()`
   - Forbedret feilhåndtering: Én feilende tjeneste stopper ikke de andre

### Oppdaterte filer
- `js/core/dataService.firebase.js` - `saveClassroomItem()` og `loadClassroomDataToCache()`
- `js/main.js` - `initializeUserServices()` parallelisert

---

## 🔧 NYE FUNKSJONER I V4.9 (12. desember 2025)

### Progressiv Skatt - Komplett Fix
**Alle standardverdier og fallbacks oppdatert på alle lokasjoner:**
- **Trinn 1:** 0 - 500 = 0% (skattefritt)
- **Trinn 2:** 501 - 1500 = 25%
- **Trinn 3:** 1501+ = 35%

**Oppdaterte steder:**
- `js/config.js` - APP_CONFIG.defaults.progressiveTaxBrackets
- `js/config.js` - DEFAULT_SETTINGS.tax.brackets
- `index.html` - HTML input default values (taxBracket2Max, taxBracket2Rate, bracket3Start)
- `js/main.js` - updateTaxBracketLabels() fallback verdier
- `js/main.js` - showSettingsModal() fallback verdier
- `js/main.js` - saveSettings() fallback verdier

### Copyright Footer - Garantert Synlighet
- **CSS `!important` regler:** Footer har nå eksplisitte CSS-regler som sikrer synlighet
- **z-index: 99999:** Garanterer at footer alltid er på toppen
- **min-height: 100vh:** html og body har nå minimum viewport-høyde
- **Fixed positioning:** Footer er fastlåst til bunnen av viewporten

### Oppdaterte filer
- `index.html` - Korrekte HTML default verdier for skattetrinn
- `js/main.js` - Korrekte fallback verdier (3 steder)
- `css/styles.css` - Ny CSS for footer synlighet

---

## 🔧 NYE FUNKSJONER I V4.8 (12. desember 2025)

### Passordgjenoppretting via E-post
- **Sikker passordtilbakestilling:** Nytt passord sendes nå via e-post i stedet for å vises i nettleservinduet
- **Loading-indikator:** Viser "Sender e-post..." mens forespørselen behandles
- **Suksessmelding:** Viser bekreftelse med mottakers e-postadresse etter vellykket sending
- **Feilhåndtering:** Viser varsel hvis e-post ikke kunne sendes (passord likevel oppdatert)

---

## 🔧 NYE FUNKSJONER I V4.7 (12. desember 2025)

### Kritiske Bugfikser - Async/Await & Firebase Konsistens

**Omfattende gjennomgang og fiks av alle tjenester for korrekt async/await håndtering og Firebase-integrasjon.**

### NotificationService - Fullstendig Refaktorert
- **Ny `initialize()` metode:** Må kalles etter innlogging for å laste notifikasjoner
- **Ny `loadNotificationsAsync()`:** Asynkron lasting fra Firebase med klasserom-isolering
- **Alle metoder nå async:** `create()`, `markAsRead()`, `markAllAsRead()`, `delete()`, `deleteAllForUser()`, `sendMessage()`, `broadcastSystem()`, `reset()`
- **Fjernet localStorage-bruk:** `broadcastSystem()` bruker nå `dataService.getUsersSync()` og `dataService.getCurrentClassroomIdSync()`
- **Cache-validering:** Sjekker klasserom-ID før cache brukes

### SchedulerService - Klasserom-isolert State
- **Ny `initialize()` metode:** Laster scheduler-state fra Firebase
- **`lastProcessedWeek` i Firebase:** Migrert fra localStorage til klasserom-dokument
- **`lastQuarterWeek` i Firebase:** Kvartalsvis skattemelding-state nå klasserom-isolert
- **Alle async-kall awaited:** `processWeekly()`, `forceProcess()`, `checkQuarterlyTaxStatements()`
- **`generateWeeklyReport()`:** Bruker nå `dataService.createTeacherMessage()` i stedet for localStorage
- **Ny `refreshCache()` metode:** For cache-invalidering ved klasserombytte

### LoanService - Firebase-integrert Notifikasjoner
- **`sendPaymentShortageNotification()` refaktorert:**
  - Bruker `notificationService.create()` for elevvarsler
  - Bruker `dataService.createTeacherMessage()` for lærervarsler
  - Fjernet all direkte localStorage-bruk
- **`getCurrentClassroomId()` standardisert:** Bruker `dataService.getCurrentClassroomIdSync()`

### BusinessService - Firebase-integrert Meldinger
- **`sendSalaryFailureNotification()` refaktorert:** Bruker `dataService.createTeacherMessage()`
- **`acceptOwnershipOffer()` skatteinnbetaling:** Bruker `dataService.addToTaxAccount()` i stedet for localStorage
- **Bruker-lookup:** Bruker `dataService.getUsersSync()` i stedet for localStorage
- **`getCurrentClassroomId()` standardisert:** Bruker `dataService.getCurrentClassroomIdSync()`

### JobService - Standardisert
- **`getCurrentClassroomId()` standardisert:** Bruker `dataService.getCurrentClassroomIdSync()`

### UserService - Firebase-integrert
- **Brukernavnsjekk:** Bruker `dataService.getUsersSync()` i stedet for localStorage

### Main.js - Forbedret Initialisering
- **NotificationService initialisering:** Lagt til `notificationService.initialize()`
- **SchedulerService initialisering:** Lagt til `schedulerService.initialize()`
- **SchedulerService cache refresh:** Lagt til ved data reset

### Arkitekturelle Forbedringer
- **Fjernet dupliserte `getCurrentClassroomId()` implementasjoner:** Alle services bruker nå `dataService.getCurrentClassroomIdSync()`
- **Konsistent async/await:** Alle Firebase-operasjoner awaites korrekt
- **Cache-håndtering:** Alle tjenester har `initialize()` og `refreshCache()` metoder
- **Klasserom-isolering:** All scheduler- og notifikasjon-state er nå korrekt isolert per klasserom

### Oppdaterte filer
- `js/services/notificationService.js` - Fullstendig refaktorert
- `js/services/schedulerService.js` - Migrert til Firebase, async/await fikser
- `js/services/loanService.js` - Firebase-integrert notifikasjoner
- `js/services/businessService.js` - Firebase-integrert meldinger og skatt
- `js/services/jobService.js` - Standardisert getCurrentClassroomId
- `js/services/userService.js` - Firebase-integrert brukersjekk
- `js/main.js` - Forbedret service-initialisering

### Tekniske Detaljer
- **Race condition-forebygging:** Cache-validering mot klasserom-ID
- **Error handling:** Alle async-operasjoner har try-catch
- **Backwards compatibility:** Synkrone metoder beholdt med deprecation warnings

---

## 🔧 NYE FUNKSJONER I V4.6 (12. desember 2025)

### Kontakt og Copyright
- **Copyright footer:** Fast footer med "© 2025 Daniel Alexander Andersen Fosse" vises på alle sider
- **Kontakt-knapp:** Ny "📬 Kontakt oss" knapp på innloggingssiden
- **Kontakt-modal:** Modal med e-postknapp som åpner mailto:econsim.no@gmail.com
- **Oversettelser:** Kontakt og footer har både norsk og engelsk versjon

### Nye filer
- Ingen nye filer

### Oppdaterte filer
- `index.html` - Kontakt-knapp, kontakt-modal, copyright footer
- `js/services/languageService.js` - Nye oversettelser for kontakt og footer

### Nye oversettelsesnøkler
- `contact.link` - 📬 Kontakt oss / 📬 Contact us
- `contact.title` - Kontakt oss / Contact us
- `contact.description` - Hjelpetekst på norsk/engelsk
- `contact.backToLogin` - Tilbake til innlogging / Back to login
- `footer.copyright` - © 2025 Daniel Alexander Andersen Fosse

---

## 🔧 NYE FUNKSJONER I V4.5 (12. desember 2025)

### E-postverifisering og passordgjenoppretting
- **E-post for lærere:** Lærere kan nå legge til e-postadresse i innstillingene
- **E-postverifisering:** Verifiseringslenke genereres og kan åpnes for å bekrefte e-post
- **Glemt passord:** Ny funksjon på innloggingssiden for passordgjenoppretting
- **Pedagogisk melding:** Tydelig melding for elever (10-16 år) om at de må spørre læreren
- **Tilfeldig passord:** 6-tegns tilfeldig passord genereres for verifiserte lærere

### EmailJS-integrasjon
- **emailService.js:** Ny tjeneste for e-posthåndtering
- **EmailJS SDK:** Lagt til for sending av e-post fra nettleseren
- **Firebase-lagring:** E-postverifiseringer og passord-resets lagres i Firestore

### Oversettelser og i18n
- **Engelske oversettelser:** Alle nye funksjoner har norsk og engelsk versjon
- **Nye nøkler:** settings.email, forgotPassword.*, emailVerification.*

### Bugfikser
- ✅ Passord-endring fikset: Hash-mismatch løst ved lagring av nytt passord
- ✅ Lærer navn-endring: Lærere kan nå endre sitt visningsnavn
- ✅ Oversettelsesnøkkel fikset: settings.teacherName viser nå riktig tekst

### Nye filer
- `js/services/emailService.js` - E-postverifisering og passordgjenoppretting

### Oppdaterte filer
- `index.html` - EmailJS SDK, nye modaler for glemt passord og e-postbekreftelse
- `js/main.js` - hashPassword-import, e-postfunksjoner
- `js/services/languageService.js` - Nye oversettelser for e-post og passord
- `js/core/auth.js` - statsService-import for innloggingsstatistikk

---

## 🔧 NYE FUNKSJONER I V4.4 (11. desember 2025)

### Firebase Async/Await Fikser
- **Service-initialisering:** Alle services (business, loan, savings, tax) har nå async `initialize()` metoder
- **Users Cache:** Brukere caches ved oppstart for synkron `getUserById()` tilgang
- **Ownership Offers Cache:** Salgstilbud caches for synkron tilgang
- **getSettings() async:** Alle services awaiter nå innstillinger korrekt

### Skattekasse Firebase-integrasjon
- **Virtuelle kontoer:** 000 (Sentralbank) og 001 (Skattekasse) fungerer som virtuelle mottakere
- **taxAccount lagres:** Penger til 001 legges til i classroom.taxAccount i Firebase
- **Transaksjonslogg:** Overføringer til skattekassen vises i lærerens skattekasse-historikk

### "Alle elever" bulkbetaling
- **Dropdown-valg:** Lærere kan velge "Alle elever" i betalingsdropdown
- **Bulk-overføring:** Sender beløp til alle elever i klasserommet samtidig
- **Oversettelser:** Norsk og engelsk støtte for "Alle elever"

### UI-forbedringer
- **uiManager.showScreen():** Støtter nå både `data-screen` og `id` attributter
- **Favicon:** Lagt til 💰 emoji som favicon
- **Chart.js:** Oppgradert til v4.4.1 for å unngå source map warnings

### Bugfikser
- ✅ `createBusiness()` er nå async og awaiter `getSettings()` korrekt
- ✅ `loadLoansAsync()` setter cache i alle fallback-paths
- ✅ `loadBusinessesAsync()` setter cache i alle fallback-paths  
- ✅ `loadSavingsAccountsAsync()` og `loadFundAccountsAsync()` setter cache
- ✅ `initializeUserServices()` fanger feil per tjeneste (én feil stopper ikke andre)
- ✅ Fjernet sirkulær import: `languageService` ikke lenger importert i `firebaseService`
- ✅ Firebase `createTransaction()` håndterer virtuelle bankkontoer (000, 001)
- ✅ `updateUser()` og `createUser()` oppdaterer users cache

---

## 🔥 FUNKSJONER I V4.3 (8. desember 2025)

### Firebase Cloud Database (AKTIVERT)
- **Cloud-lagring:** All data synkroniseres via Firebase Firestore
- **Multi-device:** Brukere kan logge inn fra hvilken som helst enhet
- **Sanntidssynkronisering:** Endringer vises umiddelbart på alle enheter
- **Offline-støtte:** Fungerer uten internett, synkroniserer når tilkoblet
- **Webhotell-klar:** Kan kjøres fra ethvert webhotell/domene

### Forbedret klasseromsadministrasjon
- **Demo-konto (t1):** Egen "Reset til demo-data" knapp (resetter kun demo-klasserom)
- **Lærere:** "Slett klasse og start på nytt" (sletter alt i eget klasserom)
- **Superadmin:** "Reset til initial data" (sletter ALL data og starter på nytt)
- **Transaksjonssletting:** Transaksjoner slettes korrekt når klasserom slettes

### Bugfikser
- ✅ Deposit/withdraw emojier byttet om (⬇️ innskudd, ⬆️ uttak)
- ✅ Ansatte-seksjon oppdateres ved språkbytte
- ✅ Lånesøknader vises korrekt under bedriftslån
- ✅ Godkjente jobber vises i "Mine aktive jobber"
- ✅ Lønn fra bedrifter når elevkonto korrekt
- ✅ Ansatte vises i mottakerliste for meldinger
- ✅ Transaksjoner får classroomId for korrekt sletting

---

## 🌐 FUNKSJONER I V4.1-4.2

### Flerspråklig støtte (i18n)
- **Norsk og Engelsk:** Bytt språk når som helst med flagg-knapper
- **Flagg-knapper:** Plassert øverst til høyre, alltid synlige
- **Automatisk lagring:** Språkvalg huskes i nettleseren
- **Data-attributter:** Alle oversettbare tekster bruker `data-i18n`

---

## 🆕 NYE FUNKSJONER I V3.0

### Skattesystem
- **Progressiv skatt:** 0-500 (0%), 501-2000 (20%), 2001+ (35%)
- **Flat skatt:** Alternativ med fast prosentsats
- **Fradrag:** Konfigurerbar fradragsgrense
- **Skattekonto (000):** Felleskasse for klassen
- **Skatteoppgjør:** Oversikt for hver elev

### Lånesystem
- **Opprett lån:** Med nedbetalingsplan og rente
- **Nedbetalingsplan:** Automatiske avdrag hver uke
- **Renter:** Konfigurerbar årlig rente
- **Oversikt:** Status på alle lån (aktive, forsinkede, nedbetalt)

### Bedriftssystem
- **Start bedrift:** Med egenkapital (standard 500 KKr)
- **Eierskap:** Dele/selge eierandeler
- **Ansatte:** Maks ansatte = bedriftssaldo / 500
- **Bedriftskonto (4XX):** Egen bankkonto for bedriften
- **Godkjenning:** Lærer kan kreve godkjenning av nye bedrifter

### Spare- og fondssystem
- **Sparekonto (2XX):** Fast rente 2% årlig
- **Fondskonto (3XX):** Variabel avkastning 8% ±3%
- **Ukentlig rente:** Utbetales automatisk hver mandag
- **Risiko:** Fond kan ha negativ avkastning

### Varslinger
- Automatiske varsler for lønn, skatt, renter
- Påminnelser om låneavdrag
- Varsler om godkjente/avslåtte bedrifter

### Tidsimulering
- **1 uke = 1 måned:** For raskere simulering
- **Mandag 08:00:** Automatisk prosessering (lønn, renter, avdrag)

---

## � VISJON OG FORMÅL

### Hovedmål

En **klasseroms-økonomisimulator** som lar elever lære om:
- Grunnleggende økonomi og transaksjoner
- Arbeidsmarked (jobbsøking, ansettelse, lønn)
- Skatt og avgifter (progressiv vs flat skatt)
- Sparing og investering (risikovurdering)
- Lån og gjeld (renter, nedbetaling)
- Bedrift og entreprenørskap
- Ansvar og konsekvenser av økonomiske valg
- Budsjett og ressursforvaltning

### Pedagogiske prinsipper
- **Likhet:** Alle starter med samme saldo
- **Rettferdighet:** Alle kan søke på samme jobber
- **Konsekvenser:** Penger brukt er borte → lærer budsjettering
- **Risiko:** Fond kan gi tap → lærer risikostyring
- **Ansvar:** Lån må tilbakebetales → lærer gjeldsforståelse
- **Motivasjon:** Synlig fremgang og realistiske belønninger

---

## ⚡ HURTIGSTART

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

econsim_users              // Array av user objects
econsim_transactions       // Array av transaction objects
econsim_jobs               // Array av job objects
econsim_applications       // Array av application objects (statens jobber)
econsim_jobApplications    // Array av bedrifts-jobbsøknader
econsim_jobOffers          // Array av jobbtilbud (direkte ansettelser)
econsim_settings           // Settings object
econsim_session            // Current session object
econsim_classrooms         // Array av classrooms
econsim_businesses         // Array av bedrifter
econsim_loans              // Array av lån
econsim_teacherMessages    // Array av lærermeldinger
econsim_inbox_{userId}     // Array av elevmeldinger per bruker
econsim_business_messages_{bizId}  // Array av bedriftsmeldinger per bedrift

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

### v4.4 (2026-03-15) - Drift, reset og superadmin-forbedringer
- **Firebase deploy robusthet:** `firebase-tools` lagt til i devDependencies og deploy-script bruker `npx firebase deploy --only hosting`.
- **Demo-reset fikset (Firebase):**
   - Nullstilling av demo-klasserom går nå mot Firebase-data (ikke legacy localStorage-kall).
   - Alle demo-elever slettes og gjenopprettes fra initial-data.
   - `kari123` er eksplisitt garantert ved reset, med innlogging `kari123` / `passord123`.
   - Ved oppstart verifiseres også at demo-elev `kari123` finnes med korrekt innlogging.
   - Overføringshistorikk/transaksjoner, jobber, lån, søknader og annen klassedata nullstilles korrekt.
   - Login-statistikk for demo-klasserom nullstilles ved reset.
- **Superadmin sikkerhet:**
   - Fjernet knapp for global "Nullstill all data" fra dashboard.
   - Demo-lærer (`t1`) kan ikke slettes fra superadmin.
   - Andre lærere/klasserom kan fortsatt slettes.
   - Ved sletting av lærer fra superadmin slettes nå alltid alle klasserom som tilhører læreren, inkludert tilknyttet klassedata.
   - Ikke-demo klasserom har egen slett-knapp i "Alle klasserom" (inkludert opprydding av tilknyttet lærer/brukere).
   - Fikset cache-synk ved sletting: superadmin henter nå alltid ferske klasserom fra Firebase, slik at slettede klasserom ikke blir hengende igjen i visningen.
   - Ny manuell "🔄 Oppdater"-knapp i superadmin-header for å tvinge full refresh av lærere, klasserom og statistikk.
- **Superadmin statistikk utvidet:**
   - Innloggingsstatistikk støtter nå **dag, uke, måned og år**.
   - Mulighet for å velge **spesifikk dag/uke/måned/år** (ikke bare siste perioder).
   - For **uke, måned og år** brukes rullemeny (dropdown) med tilgjengelige perioder.
   - Geografisk visning følger valgt tidsintervall, slik at land/fylke-data samsvarer med valgt periode.

### v4.3 (2025-12-08) - Firebase Cloud Edition
- **Firebase aktivert:** Byttet fra localStorage til Firebase Firestore
- **Cloud-synkronisering:** Data tilgjengelig fra alle enheter
- **Webhotell-klar:** Kan deployes til ethvert domene
- **Forbedret reset-funksjonalitet:**
  - Demo-konto: "Reset til demo-data" (kun demo-klasserom)
  - Lærere: "Slett klasse og start på nytt"
  - Superadmin: "Reset til initial data" (fjernet "Slett ALLE data")
- **Transaksjoner:** Lagt til classroomId for korrekt sletting
- **Bugfikser:**
  - Emoji-swap for deposit/withdraw
  - Ansatte oppdateres ved språkbytte
  - Lånesøknader vises korrekt
  - Jobber vises i aktive jobber
  - Lønn når elevkonto
  - Ansatte i mottakerliste

### v4.2 (2025-12-07)
- Komplett tospråklig versjon (norsk/engelsk)
- Alle UI-tekster oversatt
- Flagg-knapper for språkbytte

### v4.1 (2025-12-06)
- i18n-system implementert
- languageService opprettet
- data-i18n attributter på alle elementer

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

**Sist oppdatert:** 6. desember 2025 (v4.1)

---

### Version 4.2 (7. desember 2025 - Complete Bilingual Edition)

#### ✅ Nye funksjoner:

1. **🔒 Demo-konto beskyttelse**
   - Demo-lærerkontoen (t1) kan ikke endre brukernavn/passord
   - Felt deaktiveres automatisk for demo-konto
   - Andre lærerkontoer kan fortsatt endre sine innloggingsopplysninger
   - Tydelig melding til brukeren om hvorfor feltene er låst

2. **🌐 Komplett flerspråklig støtte**
   - 100+ nye oversettelsesnøkler lagt til
   - Alle hardkodede norske tekster erstattet med `languageService.t()`
   - Innstillingssiden fullstendig oversatt
   - Transaksjonshistorikk oversettes dynamisk med `translateTransactionDescription()`
   - Språkbytte oppdaterer nå all dynamisk innhold i sanntid

3. **📬 Meldingssystem fikset**
   - Bedrifter vises nå i mottaker-dropdown for elever
   - Bruker `businessService.getBusinessesByClassroom()` i stedet for `classroom.businesses`
   - Lærerens meldingsfunksjon viser nå alle bedrifter i klasserommet
   - Bedriftsmeldinger viser andre bedrifter som mulige mottakere

4. **↩️ Svar-funksjon for meldinger**
   - Ny "Svar"-knapp på meldinger mellom elever, bedrifter og lærer
   - Automatisk genererte meldinger (kontrakter, systemvarsler) har ikke svar-knapp
   - Svaret inkluderer original melding formatert som sitat
   - "Re:" prefiks legges automatisk til tittelen
   - Mottaker forhåndsutfylles automatisk
   - Fungerer for student-, bedrift- og lærer-meldinger

5. **🔄 Språkbytte oppdaterer dynamisk innhold**
   - "Mine kontoer"-boksen oppdateres ved språkbytte
   - Elevtabell med kolonneoverskrifter oppdateres
   - "Velg elev" dropdown oppdateres
   - Skattehistorikk (Fra/Til) oppdateres
   - Tabellayout tilpasset for begge språk (table-fixed)

#### 🌍 Nye oversettelsesnøkler (utvalg):

**Innstillinger:**
- `settings.startingCapital` - Startkapital / Starting capital
- `settings.currency` - Valuta / Currency
- `settings.taxSystem` - Skattesystem / Tax system
- `settings.enableTax` - Aktiver skatt / Enable tax
- `settings.flatTax` / `settings.progressiveTax`
- `settings.loanSystem` - Lånesystem / Loan system
- `settings.savingsAndFunds` - Sparing og fond / Savings and funds
- `settings.businessFeatures` - Bedriftsfunksjoner / Business features
- `settings.demoAccountLocked` / `settings.demoAccountNote`

**Meldinger:**
- `inbox.noTeacher` / `inbox.noClassmates` / `inbox.noBusinesses`
- `inbox.classmates` - Medelever / Classmates
- `inbox.otherStudents` / `inbox.otherBusinesses`

**Transaksjoner:**
- `transaction.finalSalaryFromClosed` - Sluttlønn fra nedlagt bedrift
- `transaction.saleOfShareIn` - Salg av andel i...
- `transaction.partialLoanPayment` - Delvis nedbetaling av lån

**Feilmeldinger:**
- 55+ nye feilmeldingsnøkler oversatt
- `error.passwordMismatch`, `error.usernameInUse`, etc.

#### 🐛 Bugfikser:

1. **Meldingsrecipients ikke vist**
   - `loadMessageRecipients()` brukte ikke-eksisterende `classroom.businesses`
   - Fikset til å bruke `businessService.getBusinessesByClassroom(classroomId)`

2. **Språkbytte oppdaterte ikke dynamisk innhold**
   - `onLanguageChange()` utvidet til å re-rendre flere komponenter
   - Lagt til `loadStudentAccountsSummary()`, `loadStudentsTable()`, etc.

3. **Tabellayout ødelagt ved engelsk**
   - Engelske kolonneoverskrifter lengre enn norske
   - Fikset med `table-fixed` og eksplisitte kolonnebredder

4. **Elevadministrasjon modal-tittel ikke oversatt**
   - Lagt til `data-i18n="teacher.studentAdmin"` på modal-tittel

#### 📁 Endrede filer:
- `index.html`:
  - 30+ nye `data-i18n` attributter på innstillingssiden
  - Elevadministrasjon modal-tittel
  
- `js/main.js`:
  - `showSettingsModal()` - Demo-konto beskyttelse
  - `saveSettings()` - Forhindrer endring for demo-konto
  - `loadMessageRecipients()` - Bruker businessService
  - `loadBusinessMessages()` - Bruker businessService
  - `loadTeacherMessages()` - Bruker businessService
  - `onLanguageChange()` - Oppdaterer flere komponenter
  - `loadStudentsTable()` - Oversatte headers, table-fixed layout

- `js/services/languageService.js`:
  - 100+ nye oversettelsesnøkler (norsk og engelsk)
  - Innstillinger, meldinger, feilmeldinger, transaksjoner

- `js/utils/formatters.js`:
  - `translateTransactionDescription()` - 50+ mønstre for transaksjonsoversettelse

---

### Version 4.1 (6. desember 2025 - Multi-Language Edition)

#### ✅ Nye funksjoner:

1. **🌐 Flerspråklig støtte (i18n)**
   - Norsk og engelsk språk
   - Flagg-knapper øverst til høyre (🇳🇴 Norge, 🇬🇧 UK)
   - Språkvalg lagres i localStorage
   - `languageService.js` håndterer all oversettelse
   - `data-i18n` attributter på oversettbare elementer

2. **🔥 Firebase-forberedelse**
   - `firebaseService.js` - Firebase konfigurasjon og tilkobling
   - `dataService.firebase.js` - Cloud database implementasjon
   - `dataService.localStorage.js` - Backup av lokal lagring
   - Automatisk fallback til localStorage hvis Firebase ikke er konfigurert

#### 📁 Nye filer:
- `js/services/languageService.js` - Språktjeneste med oversettelser
- `js/core/firebaseService.js` - Firebase konfigurasjon
- `js/core/dataService.firebase.js` - Firebase datalag
- `js/core/dataService.localStorage.js` - localStorage backup

#### ⚙️ Endrede filer:
- `index.html` - Språkvelger-knapper, Firebase SDK, data-i18n attributter
- `js/main.js` - Import og initialisering av languageService
- `js/core/dataService.js` - Velger mellom Firebase og localStorage
- `MANIFEST.md` - Dokumentert nye funksjoner

---

### Version 3.2 (5. desember 2025 - Modal Edition)

#### ✅ Nye funksjoner:

1. **✏️ Bedriftsredigering via modal**
   - Fjernet "Innstillinger"-fane fra bedriftsdashboardet
   - Ny "✏️ Rediger bedrift" hyperlink under bedriftslogo/kontonummer
   - `showEditBusinessModal()` - åpner modal med bedriftsdata
   - `handleEditBusinessLogo()` - logo-opplasting i modalen
   - Samme modal-design som "Start bedrift"

2. **🗑️ Forbedret nedleggelse av bedrift**
   - Fjernet forhåndsvisning ("previewCloseBusiness")
   - Ny `showCloseBusinessConfirm()` - viser advarselsmodal
   - Tydelig advarselsmelding om konsekvenser
   - Enkel bekreftelse med "Legg ned bedrift" og "Avbryt"
   - `confirmCloseBusiness()` - utfører nedleggelse direkte

3. **📧 Kombinerte meldinger - Ansettelse**
   - Jobbmelding og arbeidskontrakt kombinert til én melding
   - Format: 🎉 GRATULERER MED JOBB! + detaljer + ═══ + 📜 ARBEIDSKONTRAKT
   - Inkluderer stillingstittel, lønn, arbeidstype, arbeidsgiver
   - Full kontrakttekst i samme melding

4. **📧 Kombinerte meldinger - Lån**
   - Lånegodkjenning, kontrakt og nedbetalingsplan i én melding
   - Format: 🎉 GRATULERER + godkjenning + ═══ + 📜 LÅNEKONTRAKT + ═══ + 📅 NEDBETALINGSPLAN
   - Nedbetalingsplan viser uke-for-uke: beløp og gjenstående saldo
   - Viser totalt renter som betales
   - Lærerens beskjed inkluderes om oppgitt

#### 🎨 UI/UX-forbedringer:

1. **Bedriftsvelger-knapper**
   - Større knapper for å velge bedrift (px-6 py-3, text-base, font-medium)
   - Bedre kontrast og synlighet
   - Skygge på knappene (shadow-md)

2. **Bedriftsfane-knapper**
   - Redusert tilbake til 5 faner (fjernet Innstillinger)
   - Mindre knapper (px-3 py-2, text-sm)
   - 5-kolonnes layout

3. **Nye modaler**
   - `editBusinessModal` - rediger logo, navn, beskrivelse
   - `closeBusinessModal` - advarsel og bekreftelse for nedleggelse

#### 🐛 Bugfikser:

1. **Feil property-navn i bedriftsfunksjoner**
   - Rettet `business.ownership` → `business.owners`
   - Rettet `owner.ownerId` → `owner.userId`
   - Rettet `owner.share` → `owner.percentage`

2. **Feil formatering av valuta**
   - Rettet `formatters.currency()` → `formatCurrency(amount, currencySymbol)`

3. **Lærer-meldinger fra "System"**
   - Endret alle "System" avsendere til "Banken" for konsistens

#### 📁 Endrede filer:
- `index.html`:
  - Fjernet businessSettingsTab helt
  - Endret grid til 5 kolonner for bedriftsfaner
  - Lagt til "✏️ Rediger bedrift" hyperlink i bedriftsheader
  - Ny editBusinessModal med logo-opplasting
  - Ny closeBusinessModal med advarsel

- `js/main.js`:
  - Nye funksjoner:
    - `showEditBusinessModal()` - viser redigeringsmodal
    - `handleEditBusinessLogo()` - håndterer logofil
    - `showCloseBusinessConfirm()` - viser advarselsmodal
  - Fjernede funksjoner:
    - `loadBusinessSettings()` (erstattet av modal)
    - `previewCloseBusiness()` (erstattet av enkel modal)
  - Oppdaterte funksjoner:
    - `selectBusiness()` - større knapper
    - `confirmCloseBusiness()` - direkte nedleggelse uten preview
    - `generateEmploymentContract()` - kombinert gratulasjon + kontrakt
    - `generateLoanContract()` - kombinert godkjenning + kontrakt + nedbetalingsplan
    - `approveLoanApplication()` - fjernet separat godkjennelses-melding
  - Fikset property-navn: ownership→owners, ownerId→userId, share→percentage

#### 🔧 Tekniske detaljer:
- `generateLoanContract(loan, borrowerId, borrowerType, teacherReason = '')` - ny parameter for lærer-beskjed
- Nedbetalingsplan beregnes dynamisk med weeklyPayment og gjenstående saldo
- Meldingstype `loan_approved` erstatter separate `loan_contract` meldinger
- Arbeidskontrakt-melding har type `employment_contract` med kombinert innhold

---

**Sist oppdatert:** 4. desember 2025 (v3.1)

---

### Version 3.1 (4. desember 2025 - Meldingssystem og UI-forbedringer)

#### ✅ Nye funksjoner:

1. **📬 Komplett meldingssystem med kategorier**
   - **Elev-innboks:** System, Arbeidsgivere, Generelt
   - **Lærer-innboks:** System, Lån, Bedrifter, Generelt
   - **Bedrifts-innboks:** Banken (lån/skatt), Ansatte, Generelt
   - To-kolonners layout: Send melding (venstre) + Mottatte meldinger (høyre)
   - Klikkbare meldinger åpnes i modal med print-funksjon

2. **📋 Arbeidskontrakter**
   - Genereres automatisk ved ansettelse
   - Inkluderer stillingsbeskrivelse, lønn, type og vilkår
   - Sendes til både arbeidstaker og bedrift
   - Kan åpnes og skrives ut

3. **🔔 Notifikasjonssystem**
   - Badge på meldinger viser antall uleste
   - Badge på jobber viser ventende tilbud
   - `seenByApplicant`-flagg for behandlede jobbtilbud
   - Notifikasjoner forsvinner når bruker interagerer

4. **💰 Skattestatistikk (Lærer)**
   - `taxThisWeek` - skatteinntekter siste 7 dager
   - `taxTotal` - totale skatteinntekter
   - `taxSpentTotal` - totalt brukt fra skattekassen
   - Scrollbar på skattetransaksjonshistorikk

5. **🔍 Søkefunksjon i transaksjoner**
   - Søk i elev-, lærer- og bedriftstransaksjoner
   - Caching av transaksjoner for rask filtrering
   - `filterStudentTransactions()`, `filterTeacherTransactions()`, `filterBusinessTransactions()`

#### 🎨 UI/UX-forbedringer:

1. **Lærer-dashboard layout**
   - "Gi penger" og "Elevoversikt" bokser: `min-h-[420px]` matcher meldingsboksene
   - Scrollbar på elevoversikt: `max-h-[340px]`
   - Fikset emojis på faner: 📊 Oversikt, 🏦 Lån, 💰 Skattekasse

2. **Jobbkort-layout (Lærer)**
   - Available: "📋 Se søknader" øverst (full bredde), "✏️ Rediger" + "🗑️ Slett" under
   - Active: "💰 Betal lønn" + "📊 Delvis utbetal" øverst, "✏️ Rediger" + "✅ Avslutt" under
   - Completed: "♻️ Legg ut på nytt" (full bredde)

3. **Header-knapper**
   - Elev: Logg ut, Innstillinger, Meldinger vertikalt på høyre side
   - Lærer: Logg ut, Innstillinger, Admin, Meldinger vertikalt

4. **Bedrifts-innboks**
   - "System" omdøpt til "🏦 Banken"
   - Inkluderer nå: lån, lånesøknader, skattemeldinger, kontrakter

#### 🐛 Bugfikser:

1. **Jobbtilbud-notifikasjon**
   - Badge forsvinner nå korrekt når tilbud aksepteres/avvises
   - `seenByApplicant: true` settes ved accept/reject

2. **Ødelagte emojis**
   - Fikset "📋 Se søknader" og "💰 Betal lønn" i jobbkort
   - Fikset fane-emojis: Oversikt, Lån, Skattekasse

3. **Skattestatistikk oppdateres ikke**
   - `loadTeacherTax()` beregner nå korrekt taxThisWeek, taxTotal, taxSpentTotal
   - Bruker riktig valutasymbol fra settings

#### 📁 Endrede filer:
- `index.html` - Layout-endringer, nye elementer, emoji-fikser
- `js/main.js` - Nye funksjoner:
  - `openStudentMessage()`, `openTeacherMessage()`, `openBusinessMessage()`
  - `filterStudentTransactions()`, `filterTeacherTransactions()`, `filterBusinessTransactions()`
  - `generateEmploymentContract()` - nå med stillingsbeskrivelse
  - `updateJobsBadge()` - forbedret logikk
  - `loadTeacherTax()` - med statistikkberegning

#### 🔧 Tekniske detaljer:
- Transaksjonscaching: `cachedStudentTransactions`, `cachedTeacherTransactions`, `cachedBusinessTransactions`
- Meldingstyper for bank: `tax`, `loan`, `loan_application`, `loan_contract`, `loan_payment`, `loan_approved`, `loan_rejected`
- Jobbtilbud lagrer nå `jobDescription` for arbeidskontrakt

---

### Version 2.3 (29. november 2025 - UI/UX og sikkerhet)

#### ✅ Forbedringer:

1. **🔐 Forbedret Login-skjerm**
   - Nytt moderne design med ikon og gradient
   - Loading-spinner under innlogging
   - Vis/skjul passord-knapp (👁️/🙈)
   - Inline feilmeldinger i stedet for toast
   - Autocomplete på brukernavn og passord
   - Bedre validering av input-felt
   - Smooth CSS-animasjoner (fade-in, focus)

2. **🛡️ XSS-sikkerhet**
   - Importert `escapeHtml()` fra helpers.js
   - All brukergenerert input escapes før visning i HTML
   - Transaksjonshistorikk (student og lærer) bruker nå escapeHtml()
   - Beskytter mot ondsinnet kode-injeksjon

3. **🎨 CSS-forbedringer**
   - Linket til `css/styles.css` i index.html
   - Lagt til custom animasjoner for login
   - Password toggle styling
   - Input focus-effekter

4. **📄 Meta-tags**
   - Lagt til meta description for SEO
   - Lagt til theme-color for mobile browsers

#### 📁 Oppdaterte filer:
- `index.html` - forbedret login-skjerm, CSS-link, meta-tags
- `js/main.js` - ny login-håndtering med loading state, escapeHtml import

#### 🔧 Tekniske detaljer:
- Login-knappen deaktiveres under innlogging
- Feilmeldinger vises inline (ikke toast) for bedre UX
- escapeHtml() brukes på alle steder der brukerinput vises

---

### Version 2.4 (4. desember 2025 - Bedriftsinnstillinger og Dashboard-forbedringer)

#### ✅ Ny funksjonalitet:

1. **⚙️ Bedriftsinnstillinger-fane**
   - Ny "Innstillinger"-fane i bedriftsdashboardet
   - Rediger bedriftsnavn, logo (emoji), og beskrivelse
   - `loadBusinessSettings()` - fyller inn eksisterende verdier
   - `handleEditBusiness()` - lagrer endringer

2. **🗑️ Legg ned bedrift**
   - Forhåndsvisning av avvikling: saldo, lønnsutbetaling, utbytte
   - `previewCloseBusiness()` - beregner og viser hva som skjer
   - `confirmCloseBusiness()` - utfører nedleggelse
   - Automatisk lønnsutbetaling til alle ansatte
   - Automatisk utbyttefordeling til eiere basert på eierandel
   - Fjerner alle jobber for ansatte
   - Sletter bedriften permanent

3. **🏦 Mine kontoer-oversikt (Elev)**
   - Ny boks på elevdashboardet som viser:
     - 💳 Privatkonto
     - 🏦 Sparekonto
     - 📈 Fondskonto
     - 🏦 Aktive lån (negativt)
     - Sum (total formue)
   - `loadStudentAccountsSummary()` - beregner og viser alle kontoer

4. **💼 Forbedret jobbvisning**
   - "Mine aktive jobber" flyttet til egen boks over statistikk-knappen
   - Viser nå bedriftslogo og bedriftsnavn for hver jobb
   - Bedre layout med større logoer og tydeligere info

#### 🎨 UI/UX-forbedringer:

1. **Elev innboks**
   - "System" omdøpt til "🏦 Banken"
   - Oppdatert placeholder-tekst til "Ingen meldinger fra banken"

2. **Bedriftsfaner**
   - Større faneknapper (py-3, font-medium)
   - 6-kolonne layout på desktop (grid-cols-3 md:grid-cols-6)
   - Skygge og hover-effekter på alle faner

3. **Overføringer-fane (Bedrift)**
   - Ny rekkefølge: Betal lønn → Kjøp/Betal → Innskudd/Uttak

#### 🐛 Bugfikser:

1. **Feil property-navn i bedriftsfunksjoner**
   - Rettet `business.ownership` → `business.owners`
   - Rettet `owner.ownerId` → `owner.userId`
   - Rettet `owner.share` → `owner.percentage`

2. **Feil formatering av valuta**
   - Rettet `formatters.currency()` → `formatCurrency()`
   - Lagt til currencySymbol fra settings

3. **Jobbnotifikasjon-badge**
   - Viser nå kun antall ventende jobbtilbud (ikke aksepterte søknader)
   - Forenklet `updateJobsBadge()` logikk

#### 📁 Endrede filer:
- `index.html`:
  - Ny businessSettingsTab med rediger- og nedleggelsesform
  - Endret elev innboks fra "System" til "Banken"
  - Ny "Mine kontoer" boks og flyttet "Mine aktive jobber"
  - Større bedriftsfane-knapper

- `js/main.js`:
  - Nye funksjoner: `loadBusinessSettings()`, `handleEditBusiness()`, `previewCloseBusiness()`, `confirmCloseBusiness()`
  - Ny funksjon: `loadStudentAccountsSummary()`
  - Oppdatert `loadStudentActiveJobsSummary()` med bedriftslogo
  - Lagt til event listener for editBusinessForm
  - Oppdatert showBusinessTab() til å håndtere 'settings'

#### 🔧 Tekniske detaljer:
- Business owners bruker: `{ userId, percentage, costBasis }`
- Employees bruker: `{ userId, salary, title, startDate }`
- Nedleggelse: lønn betales først, deretter utbytte
- Utbytte beregnes som: `(remainingBalance * percentage) / 100`

---
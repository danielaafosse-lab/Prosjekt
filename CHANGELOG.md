# Changelog

Endringslogg for [EconSim](https://econsim-5723c.web.app) — norsk klasseromsøkonomisimulator.

Formatet følger [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), og prosjektet bruker semantisk versjonering. Nyeste versjon øverst.

---

## [v5.2.1] — 2026-03-16

### Added
- Manuell `Oppdater`-knapp for lærer-dashboard som tvinger datainnhenting og visningsoppdatering.
- Manuell `Oppdater`-knapp for elev-dashboard som laster saldo, historikk og dashboard-data på nytt.
- Manuell `Oppdater`-knapp i superadmin-header for full refresh av lærere, klasserom og statistikk.
- Innstilling for tidsmodell for rente og avkastning (`Akselerert skolemodus: 1 uke = 1 måned` eller `Realistisk: 1 uke = 1 uke`), lagret per klasserom under `settings.simulation.timeModel`.
- Stokastisk fondsmodell med forventet drift og volatilitet (normalfordelt sjokk) for mer realistisk variasjon.
- Lærerens eleveoversikt viser nå total saldo (brukskonto + sparekonto + fondskonto) og lar lærer utvide hver rad for fordeling per konto.
- Bedriftsoversikt for lærer viser ukesendring i prosent med farge- og pilindikatorer, og rangerer på prosentvis vekst.
- Superadmin-statistikk støtter spesifikk dag, uke, måned og år, med dropdown-valg av perioder. Geografisk visning følger valgt periode.
- Egen slett-knapp for ikke-demo klasserom i superadmin (rydder også tilknyttede lærere/brukere).
- Integritetssjekk som verifiserer at demo-lærer (`t1`/`laerer`), demo-klasserom (`demo-classroom`) og demo-elever er korrekt koblet. Kjøres ved oppstart og etter demo-reset.

### Changed
- Lærer-nullstilling sletter nå all klasseromsdata først, inkludert transaksjoner, slik at både lærer- og elev-historikk blir nullstilt.
- Legacy-transaksjoner uten `classroomId` slettes nå dersom de involverer brukere i klasserommet.
- `statsService.resetClassroomStats(classroomId)` kjøres nå også ved lærer-nullstilling.
- Demo-reset sletter nå klasseromsdata før elever slettes.
- Demo-reset går mot Firebase-data (ikke legacy localStorage). Alle demo-elever slettes og gjenopprettes fra `initial-data.json`. `kari123`/`passord123` er eksplisitt garantert.
- Progressiv skatt: trinn 2 starter alltid på `trinn 1 max + 1`, beregnes med inkluderende intervaller, normaliserer trinnkontinuitet og lagrer korrekte `min`-verdier. Live-eksempel oppdateres umiddelbart.
- Sparerente og fondsavkastning følger valgt tidsmodell ved periodisering.
- Aktiv fane forsøkes beholdt ved manuell refresh.
- Elev-dashboard henter nå alltid ferske klasseromsinnstillinger via `settingsService.getSettings()` slik at valuta følger lærerens endringer.
- Firebase deploy bruker `npx firebase deploy --only hosting`; `firebase-tools` lagt til som devDependency.

### Fixed
- Lærerhistorikk faller nå tilbake til `currentUser.classroomId` hvis klasserom-objekt mangler, og viser kun lærerens egne transaksjoner som ekstra fallback. Forhindrer visning av globale transaksjoner.
- Live-oppdatering av starttall for neste skattetrinn bindes ved åpning av innstillinger, også når `tax.brackets` ikke er lagret tidligere.
- Cache-synk ved sletting av klasserom: superadmin henter alltid ferske data, slik at slettede klasserom ikke blir hengende.
- Elev-fanen for lån skjules helt når lånesystemet er deaktivert; direkte navigering blokkeres og lånesøknad stoppes med tydelig feilmelding.

### Removed
- Global "Nullstill all data"-knapp fjernet fra superadmin-dashboard (sikkerhet).
- Demo-lærer (`t1`) kan ikke lenger slettes fra superadmin.
- Emoji foran "Klasserom:" i toppen av lærer- og elev-dashboard.

---

## [v5.2] — 2025-12-13

### Fixed
- `[object Promise]`-feil ved asynkron rendering av bedriftsjobber (Promise.all).
- Notification badges vises nå umiddelbart ved innlogging (await på alle badge-funksjoner).
- Svar/reply-knapp viser nå korrekt for meldinger (støtter både `fromId` og `senderId`).
- Sendte meldinger vises nå korrekt i utboks (`createTeacherMessage` og `createBusinessMessage` oppretter utboks-kopi).
- Bedriftsjobber for elever: refresh av `businessService`-cache ved lasting av jobber.
- Aksepterte jobbtilbud forsvinner nå korrekt etter aksept (await på alle UI-oppdateringer).

### Added
- Oversettelser: `common.exampleAmount` ("f.eks. 50" / "e.g. 50") og `jobs.terms` ("Vilkår:" / "Terms:").

### Changed
- Footer endret fra `fixed` til normal posisjon; body bruker flexbox for sticky footer-effekt.

---

## [v5.1] — 2025-12-12

### Added
- Fullstendig omstrukturert meldingssystem med kategoristruktur per brukertype:
  - Lærer: System, Lån, Jobb, Bedrifter, Elever, Utboks
  - Elev: System, Lærer, Bedrifter, Elever, Utboks
  - Bedrift: System, Lærer, Elever, Bedrifter, Utboks
- Utboks med lest-status (grønn hake `Lest` / grå sirkel `Ulest`) og lest-tidspunkt. Ny Firebase-collection `outbox`.
- Automatiske ukesrapporter hver mandag kl 08:00 til elever og bedrifter, med formue, endring og rangering. Ny collection `weeklySnapshots`.
- Nye oversettelsesnøkler for kategorier og rapporter (`inbox.*`, `report.*`).
- Profesjonell utskriftsformatering med monospace, dedikert print-vindu og metadata.

### Changed
- Notification badge-polling endret fra 5 til 30 sekunder.

### Fixed
- Meldinger markeres som lest når de åpnes (`readAt` timestamp lagres). Avsender ser når mottaker har lest.

---

## [v5.0] — 2025-12-12

### Fixed
- "No document to update"-feil ved bedriftsopprettelse: `saveClassroomItem()` bruker nå `firebaseService.set()` i stedet for `update()`.

### Changed
- `loadClassroomDataToCache()` kjører alle 5 Firebase-queries parallelt med `Promise.all()` (~5x raskere datalasting).
- `initializeUserServices()` initialiserer alle 7 tjenester parallelt med `Promise.allSettled()`. Én feilende tjeneste stopper ikke de andre.

---

## [v4.9] — 2025-12-12

### Changed
- Progressiv skatt: alle standardverdier og fallbacks oppdatert overalt — Trinn 1 (0-500 = 0%), Trinn 2 (501-1500 = 25%), Trinn 3 (1501+ = 35%).

### Fixed
- Copyright-footer har nå eksplisitte `!important`-CSS-regler, `z-index: 99999` og `min-height: 100vh` på html/body for garantert synlighet.

---

## [v4.8] — 2025-12-12

### Added
- Sikker passordtilbakestilling: nytt passord sendes via e-post i stedet for å vises i nettleseren.
- Loading-indikator under sending, suksess- og feilmeldinger for e-postsending.

---

## [v4.7] — 2025-12-12

### Changed
- Komplett refaktor av `notificationService` til Firebase med ny `initialize()`, asynkron lasting, klasserom-isolering og cache-validering. Alle metoder er nå async.
- `schedulerService` har klasserom-isolert state: `lastProcessedWeek` og `lastQuarterWeek` migrert fra localStorage til Firebase. Ny `refreshCache()`.
- `loanService` og `businessService` bruker nå `notificationService.create()` og `dataService.createTeacherMessage()` i stedet for direkte localStorage. Skatt går via `dataService.addToTaxAccount()`.
- Alle services bruker nå `dataService.getCurrentClassroomIdSync()` (fjernet duplikate implementasjoner).
- Konsistent `await` på alle Firebase-operasjoner; alle tjenester har `initialize()` og `refreshCache()`.
- `notificationService.broadcastSystem()` bruker `dataService.getUsersSync()` i stedet for localStorage.
- `userService` brukernavnsjekk bruker `dataService.getUsersSync()`.

### Added
- Try/catch på alle async-operasjoner. Backwards-compatible synkrone metoder beholdt med deprecation warnings.

---

## [v4.6] — 2025-12-12

### Added
- Fast copyright-footer "© 2025 Daniel Alexander Andersen Fosse" på alle sider.
- "Kontakt oss"-knapp og kontakt-modal på innloggingssiden (mailto: econsim.no@gmail.com).
- Oversettelsesnøkler `contact.*` og `footer.copyright` på norsk og engelsk.

---

## [v4.5] — 2025-12-12

### Added
- Lærere kan legge til e-postadresse i innstillingene; verifiseringslenke kan genereres.
- "Glemt passord" på innloggingssiden med pedagogisk melding for elever (må spørre lærer).
- 6-tegns tilfeldig passord genereres for verifiserte lærere.
- EmailJS-integrasjon (`emailService.js`) for e-post fra nettleser. E-postverifiseringer og resets lagres i Firestore.
- Engelske oversettelser for alle nye funksjoner (`settings.email`, `forgotPassword.*`, `emailVerification.*`).

### Fixed
- Passord-endring: hash-mismatch løst ved lagring av nytt passord.
- Lærere kan nå endre visningsnavn.
- `settings.teacherName` viser nå riktig oversatt tekst.

---

## [v4.4] — 2025-12-11

### Added
- Async `initialize()`-metoder på `business`-, `loan`-, `savings`- og `taxService`.
- Users-cache og ownership-offers-cache for synkron lookup.
- Virtuelle kontoer 000 (Sentralbank) og 001 (Skattekasse): overføringer til 001 oppdaterer `classroom.taxAccount` i Firebase. Overføringer til 000 håndteres som virtuell mottaker.
- "Alle elever" som dropdown-valg i lærerens betalingsskjema (bulk-overføring til alle samtidig).
- `uiManager.showScreen()` støtter nå både `data-screen` og `id`.
- Favicon (KKr-emoji).

### Changed
- Chart.js oppgradert til 4.4.1 for å unngå source map-warnings.
- `getSettings()` awaites nå korrekt i alle services.
- `initializeUserServices()` fanger feil per tjeneste.
- `createTransaction()` håndterer virtuelle bankkontoer.

### Fixed
- `createBusiness()` async/await korrigert.
- `loadLoansAsync()`, `loadBusinessesAsync()`, `loadSavingsAccountsAsync()` og `loadFundAccountsAsync()` setter cache i alle fallback-paths.
- `updateUser()` og `createUser()` oppdaterer users-cache.

### Removed
- Sirkulær import: `languageService` fjernet fra `firebaseService`.

---

## [v4.3] — 2025-12-08 — Firebase Cloud Edition

### Added
- Firebase Firestore aktivert som primær datalagring. Multi-device, sanntidssynkronisering, offline-støtte, webhotell-klar.
- Demo-konto (`t1`) har egen "Reset til demo-data"-knapp (kun demo-klasserom).
- Lærere har "Slett klasse og start på nytt".
- Superadmin har "Reset til initial data".

### Changed
- Transaksjoner inkluderer nå `classroomId` for korrekt sletting.
- Ansatte vises i mottakerliste for meldinger.

### Fixed
- Deposit/withdraw-emojier byttet om (`Innskudd ⬇️`, `Uttak ⬆️`).
- Ansatte-seksjon oppdateres ved språkbytte.
- Lånesøknader vises korrekt under bedriftslån.
- Godkjente jobber vises i "Mine aktive jobber".
- Lønn fra bedrifter når elevkonto korrekt.

### Removed
- "Slett ALLE data"-knapp fjernet fra superadmin.

---

## [v4.2] — 2025-12-07 — Complete Bilingual Edition

### Added
- 100+ nye oversettelsesnøkler; alle hardkodede norske tekster erstattet med `languageService.t()`.
- Innstillingssiden fullstendig oversatt.
- `translateTransactionDescription()` med 50+ mønstre for transaksjonsoversettelse.
- Svar-knapp på meldinger mellom elever, bedrifter og lærer (inkluderer original melding som sitat, "Re:"-prefiks, forhåndsutfylt mottaker).
- Demo-konto (`t1`) er beskyttet: kan ikke endre brukernavn/passord (felt deaktiveres med forklarende melding).

### Changed
- Språkbytte oppdaterer nå dynamisk innhold (Mine kontoer, elevtabell, dropdowns, skattehistorikk).
- Tabellayout med `table-fixed` og eksplisitte kolonnebredder for å håndtere lengre engelske headers.

### Fixed
- Bedrifter vises i mottaker-dropdown for elever (bruker `businessService.getBusinessesByClassroom()`).
- `loadMessageRecipients()`, `loadBusinessMessages()`, `loadTeacherMessages()` bruker nå businessService.

---

## [v4.1] — 2025-12-06 — Multi-Language Edition

### Added
- Flerspråklig støtte (i18n) med norsk og engelsk.
- Flagg-knapper øverst til høyre for språkbytte.
- Språkvalg lagres i localStorage.
- `data-i18n`-attributter på oversettbare elementer.
- `firebaseService.js`, `dataService.firebase.js`, `dataService.localStorage.js` (Firebase forberedt; automatisk fallback til localStorage hvis ikke konfigurert).

---

## [v3.2] — 2025-12-05 — Modal Edition

### Added
- Bedriftsredigering via modal (`showEditBusinessModal()`, `handleEditBusinessLogo()`).
- "Rediger bedrift"-hyperlink under bedriftslogo/kontonummer.
- Ny advarselsmodal for nedleggelse av bedrift (`showCloseBusinessConfirm()`).
- Kombinerte meldinger ved ansettelse (jobbmelding + arbeidskontrakt i én melding) og lånegodkjenning (godkjenning + kontrakt + nedbetalingsplan).

### Changed
- Bedriftsfaner redusert til 5 (fjernet "Innstillinger"-fane).
- Bedriftsvelger-knapper er større og tydeligere.
- "System"-avsender på lærer-meldinger endret til "Banken" for konsistens.

### Fixed
- Property-navn: `business.ownership` → `business.owners`, `owner.ownerId` → `owner.userId`, `owner.share` → `owner.percentage`.
- `formatters.currency()` → `formatCurrency(amount, currencySymbol)`.

### Removed
- `loadBusinessSettings()` og `previewCloseBusiness()` (erstattet av modaler).

---

## [v3.1] — 2025-12-04 — Meldingssystem og UI-forbedringer

### Added
- Komplett meldingssystem med kategorier (Elev: System/Arbeidsgivere/Generelt, Lærer: System/Lån/Bedrifter/Generelt, Bedrift: Banken/Ansatte/Generelt).
- Arbeidskontrakter genereres automatisk ved ansettelse (sendes til arbeidstaker og bedrift, kan skrives ut).
- Notifikasjonssystem med badges for uleste meldinger og ventende jobbtilbud (`seenByApplicant`-flagg).
- Skattestatistikk for lærer: `taxThisWeek`, `taxTotal`, `taxSpentTotal`.
- Søkefunksjon i transaksjoner for elev, lærer og bedrift med caching.

### Changed
- Lærer-dashboard layout: "Gi penger" og "Elevoversikt" har `min-h-[420px]`, scrollbar på elevoversikt.
- Jobbkort-layout omstrukturert (Available, Active, Completed har distinkte knappeoppsett).
- Header-knapper vertikalt på høyre side.
- Bedrifts-innboks "System" omdøpt til "Banken".

### Fixed
- Jobbtilbud-badge forsvinner korrekt ved accept/reject.
- Ødelagte fane-emojier fikset.
- Skattestatistikk beregnes nå korrekt med riktig valutasymbol.

---

## [v3.0]

### Added
- Skattesystem (progressiv: 0-500 0%, 501-2000 20%, 2001+ 35%; flat-modus alternativt; fradragsgrense; skattekonto 000; skatteoppgjør).
- Lånesystem (nedbetalingsplan, konfigurerbar rente, oversikt over aktive/forsinkede/nedbetalte).
- Bedriftssystem (start bedrift med egenkapital 500 KKr, eierandeler, ansatte basert på saldo, bedriftskonto 4XX, valgfri lærergodkjenning).
- Spare- og fondssystem (sparekonto 2XX 2% årlig, fondskonto 3XX 8% ±3% variabel, ukentlig rente, risiko for negativ avkastning).
- Automatiske varsler for lønn, skatt, renter, låneavdrag, bedriftsgodkjenning.
- Tidssimulering: 1 uke = 1 måned. Mandag 08:00 prosesserer lønn, renter og avdrag.

---

## [v2.4] — 2025-12-04 — Bedriftsinnstillinger og Dashboard-forbedringer

### Added
- "Innstillinger"-fane i bedriftsdashboard: rediger navn, logo (emoji), beskrivelse.
- "Legg ned bedrift" med forhåndsvisning av avvikling, automatisk lønnsutbetaling og utbyttefordeling.
- "Mine kontoer"-oversikt på elev-dashboard (Privatkonto, Sparekonto, Fondskonto, Aktive lån, Sum).
- "Mine aktive jobber" som egen boks med bedriftslogo og bedriftsnavn.

### Changed
- Elev-innboks "System" omdøpt til "Banken".
- Bedriftsfaner større med 6-kolonne-layout på desktop.
- Overføringer-fane (bedrift) ny rekkefølge: Betal lønn → Kjøp/Betal → Innskudd/Uttak.

### Fixed
- Property-navn (ownership→owners, ownerId→userId, share→percentage).
- Valutaformatering bruker nå `formatCurrency()` med `currencySymbol` fra settings.
- Jobbnotifikasjon-badge viser kun ventende jobbtilbud.

---

## [v2.3] — 2025-11-29 — UI/UX og sikkerhet

### Added
- Modernisert login-skjerm med ikon, gradient, loading-spinner, vis/skjul passord, autocomplete og inline feilmeldinger.
- XSS-sikkerhet: `escapeHtml()` brukes på all brukergenerert input før HTML-rendering.
- Custom CSS-animasjoner og password-toggle styling i `css/styles.css`.
- Meta description og theme-color.

---

## [v2.2] — 2025-10-16 — Innstillinger og elevadministrasjon

### Added
- Innstillingsmodal for lærer: klassenavn, valutanavn/symbol (default `KlasseKrone`/`KKr`), startkapital, bedriftsfunksjoner (av/på), elevadministrasjon.
- Legg til/fjern elever direkte i innstillinger; automatisk tildeling av kontonummer fra 101.

### Changed
- Standardvaluta endret til `KlasseKrone` (`KKr`).

### Removed
- Demo-jobber fjernet fra `initial-data.json`; systemet starter uten jobber.

---

## [v2.1] — 2025-10-16

### Added
- Persistent login: session i `localStorage` (overlever nettleser-restart).
- Hybrid datasystem: `dataServiceSmart.js` auto-detecter JSON-database (Node.js server) eller faller tilbake til localStorage.
- `dataServiceJSON.js` + `server.js` (Express, port 3000) for permanent JSON-fil-lagring.
- Eksport/Import av all data som JSON.
- Søknadsredigering: elever kan endre søknad etter innsending.
- Lærer-meldingsfelt ved utbetaling.

### Fixed
- Status-konsistens: `JOB_STATUS.OPEN`/`ASSIGNED` bruker `'active'`; `assignedTo` skiller ledige fra tildelte.
- `getJobs().find()` i stedet for ikke-eksisterende `getJobById()`.
- `applicantId` brukes konsistent (ikke `studentId`).
- `payAllActiveSalaries()` returnerer `{ successful, failed }`.
- "Gi lønn til alle" fungerer korrekt som batch.
- Jobber refreshes umiddelbart etter opprettelse.

---

## [v2.0] — 2025-10-16

### Changed
- Migrert fra Firebase til lokal-first arkitektur (midlertidig — Firebase ble senere reaktivert i v4.3).
- Modulær ES6+-struktur med `dataService`-abstraksjon for fremtidig SQL-integrasjon.
- Pedagogiske tilpasninger for norsk ungdomsskole.

---

## [v1.0]

### Added
- Opprinnelig Firebase-implementasjon.

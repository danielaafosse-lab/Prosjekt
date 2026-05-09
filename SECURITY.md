# Sikkerhetspolicy — EconSim

## Rapportér en sårbarhet

Hvis du finner en sikkerhetssårbarhet i EconSim, **ikke** opprett en offentlig issue. Send i stedet en kryptert e-post til:

**econsim.no@gmail.com**

Inkluder:
- Beskrivelse av sårbarheten
- Steg for å reprodusere
- Potensiell impact
- Eventuelle forslag til fix

Vi svarer innen 7 dager.

## Nåværende sikkerhetsmodell (per 2026-05-09)

EconSim bruker **Firebase Auth med Custom Tokens** for autentisering og **strenge Firestore-rules** for autorisasjon. Cross-classroom-tilgang er server-side blokkert.

**Tekniske detaljer:**
- Login: Cloud Function `authenticateUser` verifiserer SHA-256-hash mot Firestore og utsteder Firebase Custom Token med claims (`userType`, `classroomId`, `accountNumber`)
- Klient kjører `signInWithCustomToken(token)` og bruker `onAuthStateChanged` som single source of truth
- Firestore-rules sjekker `request.auth != null` for alle reads/writes (med kjente unntak: `teacherRequests` create, `passwordResets`/`emailVerifications` token-i-URL flyt)
- Klasserom-isolering håndheves via `request.auth.token.classroomId == resource.data.classroomId`
- Superadmin har egen rolle med utvidet tilgang (les alle, skriv begrenset)

**Brute-force-mitigering:** `authenticateUser` har bevisst 1-sekunds delay ved feilet passord. Firebase Auth's innebygde rate-limit på `signInWithCustomToken` (~3000/min/IP) er ekstra sikkerhetslag.

**Backup og lås:** Lærer kan slette/resette sitt klasserom (Cloud Function `resetClassroom` tar automatisk backup). Superadmin har Backups-dashboard for restore. Superadmin kan låse lærer + klasserom (`setClassroomLocked` revoker refresh-tokens).

## Tidligere begrensninger (løst 2026-05-09)

Før migreringen var `firestore.rules` satt til `allow read, write: if true` (full åpen). Dette er nå adressert:

- ✅ Manipulasjon av data på tvers av klasserom — blokkert serverside
- ✅ Anonym lesing av all Firestore-data — blokkert (med dokumenterte unntak)
- ✅ Eksponering av superadmin-hash i bundlet JS — flyttet til Firestore med strenge regler

**Restende oppgaver (utenfor scope for 2026-05-09):**
- Rate-limiting i `loginStats` for brute-force-mitigering på server-siden
- Migrering til bcrypt for sterkere passord-hashing (krever overgangsstrategi)
- Ekstra superadmin-konto for redundans
- App Check for ekstra DDoS-vern

### Cloud Functions e-post-credentials

Gmail SMTP-credentials lagres som Firebase Functions config (`firebase functions:config:set gmail.email=... gmail.password=...`). Aldri i version control.

App-passord (ikke regulært Gmail-passord) brukes — krever at 2FA er på.

### Klient-side cache i localStorage

Sensitiv brukerinformasjon (passord, sesjon-token) lagres ALDRI i localStorage — kun bruker-ID for sesjon-restore. Andre felt cacher data fra Firestore.

## Trusselmodell

EconSim er designet for et begrenset brukermiljø:
- Én lærer per klasserom
- ~30 elever per klasserom
- Bruk i norske ungdomsskoler under tilsyn

Det er ikke designet for:
- Anonym offentlig adgang
- Lagring av faktiske penger eller verdier
- Lagring av sensitiv personinformasjon utenfor fornavn/brukernavn
- Skala utover én skole

Hvis EconSim tas i bruk i større skala, må sikkerhetsmodellen revideres først (se "Roadmap for tightening" over).

## Dependency-sårbarheter

Vi kjører `npm audit` periodisk. `firebase-tools` har ofte transitive sårbarheter — vi vurderer impact før patching siden firebase-tools kjøres lokalt, ikke i produksjon.

## Kontakt

**Hovedutvikler / sikkerhetskontakt:** Daniel Alexander Andersen Fosse  
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com

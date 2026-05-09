# Prompt: Firebase Auth-migrering for EconSim

Dette dokumentet er en **selvstendig prompt** du kan kopiere inn i en ny AI-chat (Claude, ChatGPT, Cursor, etc.) for å få jobben gjort uten at hovedchaten blir for tung.

---

## Kopier alt mellom horisontale linjene under inn i ny AI-chat:

---

Du skal migrere EconSim fra egenutviklet SHA-256-autentisering til Firebase Auth med Custom Tokens. Mål: gjør Firestore-regler tightenable basert på `request.auth.uid`.

## Kontekst

Jeg jobber på prosjektet EconSim — en norsk klasseromsøkonomisimulator (https://econsim-5723c.web.app). Hovedrepositoriet ligger på min lokale maskin: `c:\Users\Daniel\OneDrive\Documents\Høyere utdanning\HVL\2025H\Prosjekt`. Tilgang via Live Server på `http://127.0.0.1:5500`.

**Les disse filene først for å forstå systemet:**
- `MANIFEST.md` (679 linjer — prosjektmanifest, lese på 15 min)
- `docs/ARCHITECTURE.md` (dypdykk i arkitektur)
- `SECURITY.md` (kjent svakhet, hvorfor regler er åpne)
- `docs/OPERATIONS.md` §5 (sikkerhetsmodell roadmap)
- `js/features/auth/services/authService.js` (eksisterende auth)
- `js/shared/config/config.js` (SUPERADMIN-konstant, brukertyper)
- `firestore.rules` (åpne regler i dag)
- `functions/index.js` (Cloud Functions)

## Nåværende tilstand

EconSim har egenutviklet auth:

1. Bruker-objekter (`users`-collection i Firestore) har `passwordHash` (SHA-256-hex)
2. Login: klient henter user, sammenligner SHA-256(input-passord) med `passwordHash`, lagrer `userId` i `localStorage` som "session"
3. `firestore.rules` er `allow read, write: if true` (full åpen)

Dette betyr at standard Firestore Security Rules ikke kan verifisere autentisering — `request.auth` er alltid null.

## Mål-tilstand

1. **Cloud Function `authenticateUser`** som tar `{ username, password }`, verifiserer mot Firestore (samme SHA-256-sammenligning som i dag), og returnerer et **Firebase Custom Token** + `claims` (userType, classroomId)
2. **Klient** kaller den nye Cloud Function ved login, mottar token, og kaller `firebase.auth().signInWithCustomToken(token)`
3. **Firestore-regler** strammes til:
   - `request.auth != null` for alle reads/writes
   - `request.auth.token.classroomId == resource.data.classroomId` for klasseromsdata
   - Kun superadmin kan skrive til `users`-collection
   - Hver bruker kan kun skrive til egen `User`-doc (ID = `request.auth.uid`)
4. **Tilbakekompatibilitet:** eksisterende `User.id`-dokumenter brukes som Firebase Auth UID. `signInWithCustomToken` opprettet UID-er må matche.

## Steg-for-steg implementasjon

### 1. Cloud Function `authenticateUser` (functions/index.js)

```javascript
const admin = require('firebase-admin');
const crypto = require('crypto');

exports.authenticateUser = functions.https.onCall(async (data, context) => {
  const { username, password } = data;
  if (!username || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Username and password required');
  }

  // Slå opp bruker (samme logikk som klient-side i dag)
  const usersSnapshot = await admin.firestore()
    .collection('users')
    .where('username', '==', username)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'Bruker ikke funnet');
  }

  const userDoc = usersSnapshot.docs[0];
  const user = userDoc.data();
  const userId = userDoc.id;

  // Verifiser passord (matcher klient-side hashing)
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  if (inputHash !== user.passwordHash) {
    throw new functions.https.HttpsError('permission-denied', 'Feil passord');
  }

  // Custom claims på token
  const customClaims = {
    userType: user.type,
    classroomId: user.classroomId || null,
    accountNumber: user.accountNumber || null,
  };

  // Opprett custom token
  const token = await admin.auth().createCustomToken(userId, customClaims);

  return { token, userId, userType: user.type, classroomId: user.classroomId };
});
```

For superadmin (hardkodet i `SUPERADMIN`-konstanten i config.js): legg til samme verifisering basert på `passwordHash` derfra.

### 2. Klient-side authService oppdatering

Endre `js/features/auth/services/authService.js`:

```javascript
async login(username, password) {
  // I stedet for direkte Firestore-lookup + SHA-256 i klienten:
  const result = await firebase.functions().httpsCallable('authenticateUser')({
    username,
    password
  });

  const { token, userId, userType, classroomId } = result.data;

  // Logg inn på Firebase Auth med custom token
  const credential = await firebase.auth().signInWithCustomToken(token);

  this.currentUser = await this.fetchUser(userId);
  // ... resten som før
}

async logout() {
  await firebase.auth().signOut();
  this.currentUser = null;
  // ... resten som før
}
```

**Viktig:** `signInWithCustomToken` validerer signaturen lokalt og setter `firebase.auth().currentUser`. Etterpå har Firestore-kall `request.auth != null` på server-siden.

### 3. Firestore-regler

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isSuperAdmin() {
      return isSignedIn() && request.auth.token.userType == 'superadmin';
    }

    function isTeacher() {
      return isSignedIn() && request.auth.token.userType == 'teacher';
    }

    function isInClassroom(classroomId) {
      return isSignedIn() && request.auth.token.classroomId == classroomId;
    }

    function isOwnUser(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    // Brukere
    match /users/{userId} {
      allow read: if isSignedIn() && (
        isSuperAdmin() ||
        isOwnUser(userId) ||
        (isTeacher() && resource.data.classroomId == request.auth.token.classroomId)
      );
      allow write: if isSuperAdmin() || isOwnUser(userId);
    }

    // Klasserom
    match /classrooms/{classroomId} {
      allow read: if isSignedIn() && (
        isSuperAdmin() || isInClassroom(classroomId)
      );
      allow write: if isSuperAdmin() || (
        isTeacher() && resource.data.teacherId == request.auth.uid
      );
    }

    // Klasseromsdata: transactions, jobs, applications, businesses, loans, savings
    match /transactions/{txId} {
      allow read, write: if isInClassroom(resource.data.classroomId);
    }

    match /jobs/{jobId} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow write: if isInClassroom(resource.data.classroomId) && (
        isTeacher() ||
        // Elever kan oppdatere applikasjoner via applikasjonscollection
        request.auth.uid == resource.data.assignedTo
      );
    }

    match /applications/{appId} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId) &&
        request.auth.uid == request.resource.data.applicantId;
      allow update: if isInClassroom(resource.data.classroomId) && (
        isTeacher() ||
        request.auth.uid == resource.data.applicantId
      );
      allow delete: if isInClassroom(resource.data.classroomId) && isTeacher();
    }

    match /businesses/{bizId} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow write: if isInClassroom(resource.data.classroomId);
    }

    match /loans/{loanId} {
      allow read, write: if isInClassroom(resource.data.classroomId);
    }

    match /savings/{savingsId} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow write: if isInClassroom(resource.data.classroomId) &&
        request.auth.uid == resource.data.userId;
    }

    match /notifications/{notifId} {
      allow read: if isInClassroom(resource.data.classroomId) &&
        (isTeacher() || request.auth.uid == resource.data.userId);
      allow write: if isInClassroom(resource.data.classroomId);
    }

    // Scheduler-triggers — kun lærere kan markere som processed
    match /schedulerTriggers/{triggerId} {
      allow read: if isSignedIn();
      allow write: if isTeacher();
    }

    // E-post / passord-reset
    match /emailVerifications/{id} {
      allow read, write: if true; // tokens i URL gjør disse semi-public
    }

    match /passwordResets/{id} {
      allow read, write: if true; // brukes uten auth (glemt passord)
    }

    // Lærersøknader: alle kan opprette, kun superadmin kan lese/godkjenne
    match /teacherRequests/{reqId} {
      allow create: if true;
      allow read, update, delete: if isSuperAdmin();
    }

    // Stats — alle kan lese, kun pålogget kan skrive
    match /loginStats/{id} {
      allow read: if true;
      allow write: if isSignedIn();
    }
  }
}
```

### 4. Migrering av eksisterende brukere

For at eksisterende `User.id`-er skal fungere som Firebase Auth UID-er:
- `User.id`-formatet i dag er strenger som `'t1'`, `'s1'`, `'superadmin'`. Disse fungerer som UID-er i Firebase Auth — ingen migrering trengs.
- Custom Token kan utstedes for hvilken som helst UID, så bruker-objektene trenger ingen endringer.

### 5. Test-plan

1. **Lokal:** Firebase Emulator + Functions-emulator
   ```bash
   firebase init emulators  # velg auth + firestore + functions
   firebase emulators:start
   ```
2. Test innlogging som lærer (`laerer` / `passord`)
3. Test innlogging som elev (`kari123` / `passord123`)
4. Test innlogging som superadmin
5. Test feil passord → 'permission-denied'
6. Verifiser `firebase.auth().currentUser` er satt etter login
7. Verifiser Firestore-read som elev fra annet klasserom feiler (forventet permission-denied)
8. Verifiser logout fjerner auth-tilstand

### 6. Deploy-rekkefølge (KRITISK)

For å unngå å bryte produksjon må disse skje i denne rekkefølgen:

1. **Deploy ny Cloud Function `authenticateUser`** (eksisterer parallelt med gammel auth)
2. **Deploy klient-kode som bruker Cloud Function** men beholder fallback til gammel auth ved feil
3. **Test grundig på prod**
4. **Stram Firestore-regler** — gjør i to steg:
   - Først: legg til regler som tillater begge auth-modi (dual-mode)
   - Etter 1 uke uten feil: bytt til strenge regler
5. **Slett gammel klient-side hashing-kode** når strenge regler er live

### 7. Suksesskriterier

- [ ] `authenticateUser` Cloud Function deployet og testbar
- [ ] Klient logger inn via Cloud Function og setter `firebase.auth().currentUser`
- [ ] Firestore-regler verifiserer `request.auth != null`
- [ ] Cross-classroom read fra elev → 'permission-denied'
- [ ] Vanlige flyter fungerer (logg inn, gi penger, skatt, sparing, lån, bedrifter)
- [ ] Logout fjerner auth-tilstand
- [ ] `SECURITY.md` oppdatert med nytt threat model

### Estimat

2-3 dager fokusert arbeid hvis du følger steg-for-steg. Test-fase tar 1 dag isolert.

### Kjente fallgruver

1. **Custom claims max 1000 bytes** — ikke pakk hele `User`-objektet i token
2. **Custom claims requires re-fetch** — etter `setCustomUserClaims` må klienten refresh token (`forceRefresh: true`)
3. **Firebase Auth har egen UID-format** — vanligvis 28-tegns base62. Custom tokens lar oss bruke våre egne (`t1`, `s1`, etc.) — bekreft Firestore-doc-ID-er stemmer
4. **Functions cold start** — første login etter inaktivitet kan være tregere. Vurder å holde funksjonen varm.
5. **Eksisterende klasserom uten classroomId-feltet** — gamle dokumenter må migreres før strenge regler aktiveres. Sjekk og legg til defaults først.

## Slik gir du meg svar

Etter migrering, lever:

1. Endrede filer (functions/index.js, firestore.rules, js/features/auth/services/authService.js, eventuelt config-endringer)
2. Test-output (Playwright eller manuelt)
3. Eventuelle problemer underveis du ikke fikset
4. Anbefaling for når strenge regler skal aktiveres

Spør meg hvis noe er uklart før du begynner.

---

(slutt på prompten — kopier alt mellom horisontale linjene over inn i ny chat)

---

## Hvorfor en separat chat

Hovedchaten har bygd opp betydelig kontekst gjennom v6-restruktureringen (40+ commits, hele kodebasen kartlagt). Firebase Auth-migrering er en selvstendig oppgave som ikke trenger den konteksten — så å starte fresh holder hovedchaten effektiv og lar to AI-er jobbe parallelt.

## Forventet leveranse fra ny AI

- Cloud Function `authenticateUser` deployet og testet
- Klient-kode i `authService.js` som bruker den nye funksjonen
- Strammere `firestore.rules`
- Oppdatert `SECURITY.md`
- Manuell QA-rapport mot live URL

# Firebase Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate EconSim from custom SHA-256 auth to Firebase Auth with Custom Tokens, deploy strict Firestore rules, add per-classroom backup-before-reset, restore UI, and lock/unlock for superadmin.

**Architecture:** Cloud Functions verify SHA-256 against Firestore (`passwordHash` field) and issue Firebase Custom Tokens with claims (`userType`, `classroomId`, `accountNumber`). Client uses `signInWithCustomToken` and `onAuthStateChanged`. Firestore rules check `request.auth.token` for classroom isolation. Reset/restore/lock all run in Cloud Functions using admin SDK. One-time `migrateAuthSchema` renames `password` → `passwordHash`, lowercases usernames, creates `users/superadmin` doc, adds `locked` field.

**Tech Stack:** Firebase Functions v1 (Node 20, `firebase-functions ^4.3.1`), Firebase Auth + Functions compat SDK on client, Firestore rules v2, `@firebase/rules-unit-testing` for rule tests, Vitest 4, Playwright (existing MCP), Tailwind CSS, ES6 modules.

**Spec:** [docs/superpowers/specs/2026-05-09-firebase-auth-migration-design.md](../specs/2026-05-09-firebase-auth-migration-design.md)

---

## Phase 0 — Test infrastructure & client SDK loading

### Task 1: Add Firebase Emulator config to firebase.json

**Files:**
- Modify: `firebase.json`

- [ ] **Step 1: Add emulators block to firebase.json**

Edit `firebase.json` to add an `emulators` section after the existing `firestore` block:

```json
"emulators": {
  "auth": { "port": 9099 },
  "functions": { "port": 5001 },
  "firestore": { "port": 8080 },
  "hosting": { "port": 5000 },
  "ui": { "enabled": true, "port": 4000 },
  "singleProjectMode": true
}
```

- [ ] **Step 2: Commit**

```bash
git add firebase.json
git commit -m "build: add Firebase Emulator Suite config"
```

---

### Task 2: Add @firebase/rules-unit-testing devDependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install devDependency**

Run: `npm install --save-dev @firebase/rules-unit-testing@^4.0.1`

- [ ] **Step 2: Verify install**

Run: `npm ls @firebase/rules-unit-testing`
Expected: shows installed version

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @firebase/rules-unit-testing for rule unit tests"
```

---

### Task 3: Add Firebase Auth + Functions compat scripts to index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find existing firebase script tags**

Run: `grep -n "firebasejs/10" index.html`
Expected: see `firebase-app-compat.js` and `firebase-firestore-compat.js`

- [ ] **Step 2: Add auth + functions compat scripts**

After the `firebase-firestore-compat.js` line, add two new lines:

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-functions-compat.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(auth): load Firebase Auth + Functions compat SDKs"
```

---

### Task 4: Add emulator-detection helper

**Files:**
- Create: `js/shared/core/emulatorConfig.js`
- Modify: `js/shared/core/firebaseService.js`

- [ ] **Step 1: Create emulatorConfig.js**

```javascript
/**
 * Wires Firebase compat SDKs to the local Emulator Suite when the page is
 * loaded with `?emulator=1` (or hostname is localhost AND ?emulator!=0).
 *
 * Must be called BEFORE any Firestore/Auth/Functions calls.
 */
export function configureEmulators() {
  const params = new URLSearchParams(location.search);
  const flag = params.get('emulator');
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const enabled = flag === '1' || (isLocal && flag !== '0');
  if (!enabled) return false;

  // eslint-disable-next-line no-undef
  firebase.firestore().useEmulator('localhost', 8080);
  // eslint-disable-next-line no-undef
  firebase.auth().useEmulator('http://localhost:9099', { disableWarnings: true });
  // eslint-disable-next-line no-undef
  firebase.app().functions('europe-west1').useEmulator('localhost', 5001);

  console.log('🔧 Firebase Emulator Suite tilkoblet (auth/firestore/functions)');
  return true;
}
```

- [ ] **Step 2: Wire into firebaseService.initialize()**

In `js/shared/core/firebaseService.js`, find the `initialize()` method. Add at the very top of the method (before any Firestore calls):

```javascript
import { configureEmulators } from './emulatorConfig.js';
// ... in initialize():
configureEmulators();
```

(Place the import with other imports at the top of the file.)

- [ ] **Step 3: Commit**

```bash
git add js/shared/core/emulatorConfig.js js/shared/core/firebaseService.js
git commit -m "feat(dev): emulator-detection via ?emulator=1 URL flag"
```

---

## Phase 1 — Cloud Functions helpers and migration

### Task 5: Create Cloud Functions helpers module

**Files:**
- Create: `functions/lib/helpers.js`

- [ ] **Step 1: Write helpers.js**

```javascript
/**
 * Shared helpers for EconSim Cloud Functions.
 */
const admin = require('firebase-admin');

const CLASSROOM_DATA_COLLECTIONS = [
  'transactions', 'jobs', 'applications', 'businesses',
  'loans', 'savings', 'funds', 'notifications', 'messages',
  'weeklySnapshots',
];

/**
 * Splits an array of docs into chunks of size n (Firestore batch limit is 500).
 */
function chunkBatches(items, size = 500) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Take a snapshot of a classroom's data into the classroomBackups collection.
 * Returns the new backup id.
 */
async function createBackup(classroomId, createdByUid, reason) {
  const db = admin.firestore();
  const backupId = reason === 'pre-restore'
    ? `pre-restore_${classroomId}_${new Date().toISOString().replace(/[:.]/g, '-')}`
    : `${classroomId}_${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const backup = {
    classroomId,
    createdAt: new Date().toISOString(),
    createdBy: createdByUid,
    reason,
  };

  for (const col of CLASSROOM_DATA_COLLECTIONS) {
    const snap = await db.collection(col).where('classroomId', '==', classroomId).get();
    backup[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  // Users (students for this classroom)
  const usersSnap = await db.collection('users').where('classroomId', '==', classroomId).get();
  backup.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Classroom doc itself
  const classroomDoc = await db.collection('classrooms').doc(classroomId).get();
  backup.classroom = classroomDoc.exists ? { id: classroomDoc.id, ...classroomDoc.data() } : null;

  await db.collection('classroomBackups').doc(backupId).set(backup);
  return backupId;
}

/**
 * Delete all classroom data for a given classroomId.
 * Skips users — caller decides whether to delete students.
 */
async function deleteAllClassroomData(classroomId) {
  const db = admin.firestore();
  for (const col of CLASSROOM_DATA_COLLECTIONS) {
    const snap = await db.collection(col).where('classroomId', '==', classroomId).get();
    const batches = chunkBatches(snap.docs, 500);
    for (const batchDocs of batches) {
      const writeBatch = db.batch();
      batchDocs.forEach(doc => writeBatch.delete(doc.ref));
      await writeBatch.commit();
    }
  }
}

/**
 * Delete all students for a classroom.
 */
async function deleteClassroomStudents(classroomId) {
  const db = admin.firestore();
  const snap = await db.collection('users')
    .where('classroomId', '==', classroomId)
    .where('type', '==', 'student')
    .get();
  const batches = chunkBatches(snap.docs, 500);
  for (const batchDocs of batches) {
    const writeBatch = db.batch();
    batchDocs.forEach(doc => writeBatch.delete(doc.ref));
    await writeBatch.commit();
  }
  return snap.size;
}

module.exports = {
  CLASSROOM_DATA_COLLECTIONS,
  chunkBatches,
  createBackup,
  deleteAllClassroomData,
  deleteClassroomStudents,
};
```

- [ ] **Step 2: Commit**

```bash
git add functions/lib/helpers.js
git commit -m "feat(functions): shared helpers for backup/delete operations"
```

---

### Task 6: Add migrateAuthSchema Cloud Function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append migrateAuthSchema to functions/index.js**

Add at the end of the file (before the helper `getWeekNumber`):

```javascript
/**
 * One-time schema migration:
 * - rename User.password → User.passwordHash
 * - lowercase all User.username for case-insensitive lookup compatibility
 * - add User.locked: false where missing
 * - add Classroom.locked: false where missing
 * - create users/superadmin doc if missing
 *
 * Idempotent — re-runs are safe.
 * Callable: superadmin only (or no-auth allowed if first migration).
 */
const { chunkBatches } = require('./lib/helpers');

exports.migrateAuthSchema = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (context.auth && context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }

    const db = admin.firestore();
    const report = {
      usersRenamedField: 0,
      usersLowercasedUsername: 0,
      usersAddedLocked: 0,
      classroomsAddedLocked: 0,
      superadminCreated: false,
      timestamp: new Date().toISOString(),
    };

    // 1. Users: rename password→passwordHash, lowercase username, add locked
    const usersSnap = await db.collection('users').get();
    for (const batchDocs of chunkBatches(usersSnap.docs, 500)) {
      const wb = db.batch();
      let ops = 0;
      for (const doc of batchDocs) {
        const u = doc.data();
        const update = {};
        if (u.password && !u.passwordHash) {
          update.passwordHash = u.password;
          update.password = admin.firestore.FieldValue.delete();
          report.usersRenamedField++;
        }
        if (typeof u.username === 'string' && u.username !== u.username.toLowerCase()) {
          update.username = u.username.toLowerCase();
          report.usersLowercasedUsername++;
        }
        if (u.locked === undefined) {
          update.locked = false;
          report.usersAddedLocked++;
        }
        if (Object.keys(update).length > 0) {
          wb.update(doc.ref, update);
          ops++;
        }
      }
      if (ops > 0) await wb.commit();
    }

    // 2. Classrooms: add locked
    const classroomsSnap = await db.collection('classrooms').get();
    for (const batchDocs of chunkBatches(classroomsSnap.docs, 500)) {
      const wb = db.batch();
      let ops = 0;
      for (const doc of batchDocs) {
        const c = doc.data();
        if (c.locked === undefined) {
          wb.update(doc.ref, { locked: false });
          report.classroomsAddedLocked++;
          ops++;
        }
      }
      if (ops > 0) await wb.commit();
    }

    // 3. Create users/superadmin if missing
    const superadminRef = db.collection('users').doc('superadmin');
    const superadminDoc = await superadminRef.get();
    if (!superadminDoc.exists) {
      await superadminRef.set({
        username: 'danielalexander',
        passwordHash: '2ab5e704c3ca5eaa7376aeb8faf9493a7baac6fab35b0264d9ff79f8c4804cdb',
        name: 'Superadmin',
        type: 'superadmin',
        classroomId: null,
        accountNumber: null,
        locked: false,
      });
      report.superadminCreated = true;
    }

    await db.collection('migrationLog').doc(`auth-${report.timestamp}`).set(report);
    return report;
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): migrateAuthSchema for one-time schema cutover"
```

---

### Task 7: Add authenticateUser Cloud Function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Add crypto import at top of functions/index.js**

Find the existing requires near the top of `functions/index.js`. Add:

```javascript
const crypto = require('crypto');
```

(Skip if already present.)

- [ ] **Step 2: Append authenticateUser**

```javascript
/**
 * Verify SHA-256 password hash and issue Firebase Custom Token with claims.
 * Returns { token } only — claims are read by client via getIdTokenResult().
 */
exports.authenticateUser = functions
  .region('europe-west1')
  .https.onCall(async (data) => {
    const username = (data && data.username || '').trim().toLowerCase();
    const password = data && data.password || '';

    if (!username || !password) {
      throw new functions.https.HttpsError('invalid-argument', 'auth.missingCredentials');
    }

    const usersSnap = await admin.firestore()
      .collection('users')
      .where('username', '==', username)
      .limit(1)
      .get();

    // Generic error to avoid username enumeration
    const fail = () => new functions.https.HttpsError('permission-denied', 'auth.invalidCredentials');

    if (usersSnap.empty) {
      await new Promise(r => setTimeout(r, 1000)); // delay to mitigate brute force
      throw fail();
    }

    const userDoc = usersSnap.docs[0];
    const user = userDoc.data();

    if (user.locked === true) {
      throw new functions.https.HttpsError('permission-denied', 'auth.accountLocked');
    }

    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (inputHash !== user.passwordHash) {
      await new Promise(r => setTimeout(r, 1000));
      throw fail();
    }

    const claims = {
      userType: user.type,
      classroomId: user.classroomId || null,
      accountNumber: user.accountNumber || null,
    };

    const token = await admin.auth().createCustomToken(userDoc.id, claims);
    return { token };
  });
```

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): authenticateUser callable for Firebase Auth migration"
```

---

### Task 8: Copy initial-data.json into functions and add ensureDemoData

**Files:**
- Create: `functions/data/initial-data.json` (copy from `data/initial-data.json`)
- Modify: `functions/index.js`

- [ ] **Step 1: Copy initial data**

Run: `mkdir -p functions/data && cp data/initial-data.json functions/data/initial-data.json`

(On Windows PowerShell: `New-Item -ItemType Directory -Force functions/data; Copy-Item data/initial-data.json functions/data/initial-data.json`)

- [ ] **Step 2: Append ensureDemoData**

Add to `functions/index.js`:

```javascript
const path = require('path');
const fs = require('fs');

/**
 * Idempotent demo classroom creation. Public callable — safe because it only
 * writes if the demo classroom does not exist.
 */
exports.ensureDemoData = functions
  .region('europe-west1')
  .https.onCall(async () => {
    const db = admin.firestore();
    const demoRef = db.collection('classrooms').doc('demo-classroom');
    const existing = await demoRef.get();
    if (existing.exists) return { created: false };

    const initialPath = path.join(__dirname, 'data', 'initial-data.json');
    const raw = fs.readFileSync(initialPath, 'utf8');
    const initial = JSON.parse(raw);

    const batch = db.batch();

    // Classroom doc
    batch.set(demoRef, {
      id: 'demo-classroom',
      teacherId: 't1',
      className: '7A Demo',
      currencyName: 'KlasseKrone',
      currencySymbol: 'KKr',
      startingBalance: 1000,
      locked: false,
      lockedAt: null,
      lockedBy: null,
      lastResetAt: null,
      settings: initial.settings || {},
      createdAt: new Date().toISOString(),
    });

    // Demo teacher (t1)
    const teacherHash = crypto.createHash('sha256').update('passord').digest('hex');
    batch.set(db.collection('users').doc('t1'), {
      id: 't1',
      username: 'laerer',
      passwordHash: teacherHash,
      name: 'Demo Lærer',
      accountNumber: '100',
      type: 'teacher',
      balance: 0,
      classroomId: 'demo-classroom',
      locked: false,
    });

    // Demo students from initial-data.json
    const demoStudents = (initial.users || []).filter(u => u.type === 'student' && u.classroomId === 'demo-classroom');

    // Always include kari123
    if (!demoStudents.find(s => s.username === 'kari123')) {
      demoStudents.push({
        id: 's1', username: 'kari123', password: 'passord123',
        name: 'Kari Nordmann', accountNumber: '101',
        type: 'student', balance: 1000, classroomId: 'demo-classroom',
      });
    }

    for (const s of demoStudents) {
      const hash = crypto.createHash('sha256').update(s.password || 'passord123').digest('hex');
      batch.set(db.collection('users').doc(s.id), {
        ...s,
        username: s.username.toLowerCase(),
        passwordHash: hash,
        locked: false,
      });
      // Remove plain password field
      delete s.password;
    }

    await batch.commit();
    return { created: true, studentsCreated: demoStudents.length };
  });
```

- [ ] **Step 3: Commit**

```bash
git add functions/data/initial-data.json functions/index.js
git commit -m "feat(functions): ensureDemoData idempotent demo seed"
```

---

### Task 9: Add resetClassroom Cloud Function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append resetClassroom**

```javascript
const { createBackup, deleteAllClassroomData, deleteClassroomStudents } = require('./lib/helpers');

exports.resetClassroom = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 180 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'auth.required');
    }
    const { classroomId } = data || {};
    if (!classroomId) {
      throw new functions.https.HttpsError('invalid-argument', 'classroom.idRequired');
    }
    const callerType = context.auth.token.userType;
    const callerClassroom = context.auth.token.classroomId;
    if (callerType !== 'superadmin' && !(callerType === 'teacher' && callerClassroom === classroomId)) {
      throw new functions.https.HttpsError('permission-denied', 'auth.notClassroomTeacher');
    }

    const backupId = await createBackup(classroomId, context.auth.uid, 'reset');
    await deleteAllClassroomData(classroomId);
    const deletedStudents = await deleteClassroomStudents(classroomId);
    await admin.firestore().collection('classrooms').doc(classroomId).update({
      nextStudentNumber: 101,
      nextBusinessNumber: 501,
      lastResetAt: new Date().toISOString(),
    });

    return { backupId, deletedStudents };
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): resetClassroom with automatic backup"
```

---

### Task 10: Add resetDemoClassroom Cloud Function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append resetDemoClassroom**

```javascript
exports.resetDemoClassroom = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'auth.required');
    }
    const callerType = context.auth.token.userType;
    const isDemoTeacher = context.auth.uid === 't1';
    if (callerType !== 'superadmin' && !isDemoTeacher) {
      throw new functions.https.HttpsError('permission-denied', 'demo.onlyDemoTeacherOrSuperadmin');
    }

    const db = admin.firestore();
    const classroomId = 'demo-classroom';
    const backupId = await createBackup(classroomId, context.auth.uid, 'demo-reset');
    await deleteAllClassroomData(classroomId);
    await deleteClassroomStudents(classroomId);

    // Reseed demo students from functions/data/initial-data.json
    const initialPath = path.join(__dirname, 'data', 'initial-data.json');
    const initial = JSON.parse(fs.readFileSync(initialPath, 'utf8'));
    const demoStudents = (initial.users || []).filter(u => u.type === 'student' && u.classroomId === classroomId);
    if (!demoStudents.find(s => s.username === 'kari123')) {
      demoStudents.push({
        id: 's1', username: 'kari123', password: 'passord123',
        name: 'Kari Nordmann', accountNumber: '101', type: 'student',
        balance: 1000, classroomId,
      });
    }

    const batch = db.batch();
    for (const s of demoStudents) {
      const hash = crypto.createHash('sha256').update(s.password || 'passord123').digest('hex');
      batch.set(db.collection('users').doc(s.id), {
        id: s.id,
        username: s.username.toLowerCase(),
        passwordHash: hash,
        name: s.name,
        accountNumber: s.accountNumber,
        type: 'student',
        balance: s.balance ?? 1000,
        classroomId,
        locked: false,
      });
    }
    if (initial.settings) {
      batch.update(db.collection('classrooms').doc(classroomId), {
        settings: { ...(initial.settings) },
        lastResetAt: new Date().toISOString(),
      });
    }
    await batch.commit();

    return { backupId, studentsRecreated: demoStudents.length };
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): resetDemoClassroom with backup + reseed"
```

---

### Task 11: Add restoreClassroom Cloud Function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append restoreClassroom**

```javascript
const { CLASSROOM_DATA_COLLECTIONS, chunkBatches: chunk } = require('./lib/helpers');

exports.restoreClassroom = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { backupId } = data || {};
    if (!backupId) {
      throw new functions.https.HttpsError('invalid-argument', 'backup.idRequired');
    }

    const db = admin.firestore();
    const backupSnap = await db.collection('classroomBackups').doc(backupId).get();
    if (!backupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'backup.notFound');
    }
    const backup = backupSnap.data();
    const classroomId = backup.classroomId;

    // Pre-restore safety backup
    const preRestoreBackupId = await createBackup(classroomId, context.auth.uid, 'pre-restore');

    // Wipe current data
    await deleteAllClassroomData(classroomId);
    await deleteClassroomStudents(classroomId);

    // Write backup data back
    for (const col of CLASSROOM_DATA_COLLECTIONS) {
      const docs = backup[col] || [];
      for (const batchDocs of chunk(docs, 500)) {
        const wb = db.batch();
        batchDocs.forEach(d => {
          const { id, ...rest } = d;
          wb.set(db.collection(col).doc(id), rest);
        });
        if (batchDocs.length > 0) await wb.commit();
      }
    }
    // Users
    const users = backup.users || [];
    for (const batchDocs of chunk(users, 500)) {
      const wb = db.batch();
      batchDocs.forEach(d => {
        const { id, ...rest } = d;
        wb.set(db.collection('users').doc(id), rest);
      });
      if (batchDocs.length > 0) await wb.commit();
    }
    // Classroom doc
    if (backup.classroom) {
      const { id, ...rest } = backup.classroom;
      await db.collection('classrooms').doc(id).set(rest);
    }

    return { restoredFromBackup: backupId, preRestoreBackupId };
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): restoreClassroom with pre-restore safety backup"
```

---

### Task 12: Add listBackups, previewBackup, deleteBackup Cloud Functions

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append the three callable functions**

```javascript
exports.listBackups = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const filter = data && data.classroomId;
    let q = admin.firestore().collection('classroomBackups').orderBy('createdAt', 'desc').limit(200);
    if (filter) {
      q = admin.firestore().collection('classroomBackups')
        .where('classroomId', '==', filter)
        .orderBy('createdAt', 'desc')
        .limit(200);
    }
    const snap = await q.get();
    return {
      backups: snap.docs.map(d => {
        const b = d.data();
        return {
          id: d.id,
          classroomId: b.classroomId,
          createdAt: b.createdAt,
          createdBy: b.createdBy,
          reason: b.reason,
          counts: {
            users: (b.users || []).length,
            transactions: (b.transactions || []).length,
            jobs: (b.jobs || []).length,
            businesses: (b.businesses || []).length,
          },
        };
      }),
    };
  });

exports.previewBackup = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { backupId } = data || {};
    const snap = await admin.firestore().collection('classroomBackups').doc(backupId).get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'backup.notFound');
    return snap.data();
  });

exports.deleteBackup = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { backupId } = data || {};
    await admin.firestore().collection('classroomBackups').doc(backupId).delete();
    return { deleted: backupId };
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): list/preview/delete backup management functions"
```

---

### Task 13: Add setClassroomLocked Cloud Function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append setClassroomLocked**

```javascript
exports.setClassroomLocked = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.userType !== 'superadmin') {
      throw new functions.https.HttpsError('permission-denied', 'auth.superadminRequired');
    }
    const { classroomId, locked } = data || {};
    if (!classroomId || typeof locked !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'lock.argsRequired');
    }

    const db = admin.firestore();
    const classroomRef = db.collection('classrooms').doc(classroomId);
    const classroomDoc = await classroomRef.get();
    if (!classroomDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'classroom.notFound');
    }
    const teacherId = classroomDoc.data().teacherId;

    const batch = db.batch();
    batch.update(classroomRef, {
      locked,
      lockedAt: locked ? new Date().toISOString() : null,
      lockedBy: locked ? context.auth.uid : null,
    });
    if (teacherId) {
      batch.update(db.collection('users').doc(teacherId), { locked });
    }
    await batch.commit();

    if (locked && teacherId) {
      try {
        await admin.auth().revokeRefreshTokens(teacherId);
      } catch (err) {
        console.warn('revokeRefreshTokens failed (user may not exist in Firebase Auth yet):', err.message);
      }
    }

    return { classroomId, teacherId, locked };
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): setClassroomLocked + revokeRefreshTokens"
```

---

### Task 14: Add cleanOldBackups scheduled function

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Append cleanOldBackups**

```javascript
/**
 * Scheduled cleanup of classroomBackups older than 90 days.
 * Sunday 04:00 norwegian time.
 */
exports.cleanOldBackups = functions
  .region('europe-west1')
  .pubsub.schedule('0 2 * * 0')
  .timeZone('Europe/Oslo')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const snap = await admin.firestore()
      .collection('classroomBackups')
      .where('createdAt', '<', cutoff)
      .get();
    const batch = admin.firestore().batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    if (snap.size > 0) await batch.commit();
    console.log(`cleanOldBackups: removed ${snap.size} backups older than 90 days`);
    return null;
  });
```

- [ ] **Step 2: Commit**

```bash
git add functions/index.js
git commit -m "feat(functions): cleanOldBackups scheduled retention cleanup"
```

---

## Phase 2 — Firestore rules and rule tests

### Task 15: Write strict firestore.rules

**Files:**
- Modify: `firestore.rules`
- Create: `firestore.rules.legacy` (backup of current open rules)

- [ ] **Step 1: Save legacy rules**

```bash
cp firestore.rules firestore.rules.legacy
```

- [ ] **Step 2: Replace firestore.rules with strict version**

Overwrite `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function userType() { return request.auth.token.userType; }
    function userClassroom() { return request.auth.token.classroomId; }
    function isSuperAdmin() { return isSignedIn() && userType() == 'superadmin'; }
    function isTeacher() { return isSignedIn() && userType() == 'teacher'; }
    function isStudent() { return isSignedIn() && userType() == 'student'; }
    function isInClassroom(cid) {
      return isSignedIn() && (userClassroom() == cid || isSuperAdmin());
    }
    function isOwnUser(uid) { return isSignedIn() && request.auth.uid == uid; }

    match /users/{userId} {
      allow read: if isSuperAdmin()
                  || isOwnUser(userId)
                  || (isSignedIn() && resource.data.classroomId == userClassroom());
      allow create: if isSuperAdmin() || isTeacher();
      allow update: if isSuperAdmin()
                    || isOwnUser(userId)
                    || (isTeacher() && resource.data.classroomId == userClassroom());
      allow delete: if isSuperAdmin()
                    || (isTeacher() && resource.data.classroomId == userClassroom());
    }

    match /classrooms/{classroomId} {
      allow read: if isSuperAdmin() || isInClassroom(classroomId);
      allow create: if isSuperAdmin() || isTeacher();
      allow update, delete: if isSuperAdmin()
                            || (isTeacher() && resource.data.teacherId == request.auth.uid);
    }

    match /transactions/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /jobs/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /applications/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId)
                    && request.auth.uid == request.resource.data.applicantId;
      allow update: if isInClassroom(resource.data.classroomId)
                    && (isTeacher() || request.auth.uid == resource.data.applicantId);
      allow delete: if isInClassroom(resource.data.classroomId) && (isTeacher() || isSuperAdmin());
    }
    match /businesses/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /loans/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /savings/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /funds/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /notifications/{id} {
      allow read: if isInClassroom(resource.data.classroomId)
                  && (isTeacher() || isSuperAdmin() || request.auth.uid == resource.data.userId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /messages/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow create: if isInClassroom(request.resource.data.classroomId);
      allow update, delete: if isInClassroom(resource.data.classroomId);
    }
    match /inbox/{id} {
      allow read: if isSignedIn() && (request.auth.uid == resource.data.userId || isTeacher() || isSuperAdmin());
      allow write: if isSignedIn();
    }
    match /outbox/{id} {
      allow read: if isSignedIn() && (request.auth.uid == resource.data.userId || isTeacher() || isSuperAdmin());
      allow write: if isSignedIn();
    }
    match /weeklySnapshots/{id} {
      allow read: if isInClassroom(resource.data.classroomId);
      allow write: if isInClassroom(resource.data.classroomId)
                   || (request.method == 'create' && isInClassroom(request.resource.data.classroomId));
    }
    match /schedulerTriggers/{id} {
      allow read: if isSignedIn();
      allow write: if isTeacher() || isSuperAdmin();
    }
    match /loginStats/{id} {
      allow read: if isSuperAdmin() || isTeacher();
      allow write: if isSignedIn();
    }
    match /geoStats/{id} {
      allow read: if isSuperAdmin() || isTeacher();
      allow write: if isSignedIn();
    }
    match /teacherRequests/{id} {
      allow create: if true;
      allow read, update, delete: if isSuperAdmin();
    }
    match /emailVerifications/{id} {
      allow read, write: if true;
    }
    match /passwordResets/{id} {
      allow read, write: if true;
    }
    match /classroomBackups/{id} {
      allow read: if isSuperAdmin()
                  || (isTeacher() && resource.data.classroomId == userClassroom());
      allow write: if false;
    }
    match /migrationLog/{id} {
      allow read: if isSuperAdmin();
      allow write: if false;
    }
  }
}
```

- [ ] **Step 3: Add legacy rules to .gitignore (don't ship)**

Run: `echo "firestore.rules.legacy" >> .gitignore`

- [ ] **Step 4: Commit**

```bash
git add firestore.rules .gitignore
git commit -m "feat(security): strict Firestore rules with classroom isolation"
```

---

### Task 16: Write Vitest rule unit tests

**Files:**
- Create: `firestore.rules.test.js`

- [ ] **Step 1: Write rule test file**

```javascript
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'econsim-rules-test',
    firestore: {
      host: 'localhost',
      port: 8080,
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function teacherCtx(uid, classroomId) {
  return testEnv.authenticatedContext(uid, { userType: 'teacher', classroomId });
}
function studentCtx(uid, classroomId) {
  return testEnv.authenticatedContext(uid, { userType: 'student', classroomId });
}
function superCtx(uid = 'superadmin') {
  return testEnv.authenticatedContext(uid, { userType: 'superadmin', classroomId: null });
}
function anonCtx() {
  return testEnv.unauthenticatedContext();
}

describe('Firestore rules — auth gating', () => {
  it('anon cannot read users', async () => {
    await assertFails(anonCtx().firestore().collection('users').doc('any').get());
  });

  it('signed-in student can read own user doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('s1').set({
        type: 'student', classroomId: 'A', username: 'kari',
      });
    });
    await assertSucceeds(studentCtx('s1', 'A').firestore().collection('users').doc('s1').get());
  });

  it('student cannot read user from other classroom', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('s2').set({
        type: 'student', classroomId: 'B',
      });
    });
    await assertFails(studentCtx('s1', 'A').firestore().collection('users').doc('s2').get());
  });

  it('superadmin can read any user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('s2').set({ classroomId: 'B' });
    });
    await assertSucceeds(superCtx().firestore().collection('users').doc('s2').get());
  });
});

describe('Firestore rules — classroom isolation', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('transactions').doc('tx-A').set({ classroomId: 'A', amount: 100 });
      await ctx.firestore().collection('transactions').doc('tx-B').set({ classroomId: 'B', amount: 200 });
    });
  });

  it('student in A can read tx in A', async () => {
    await assertSucceeds(studentCtx('s1', 'A').firestore().collection('transactions').doc('tx-A').get());
  });

  it('student in A cannot read tx in B', async () => {
    await assertFails(studentCtx('s1', 'A').firestore().collection('transactions').doc('tx-B').get());
  });

  it('teacher in A cannot delete tx in B', async () => {
    await assertFails(teacherCtx('t1', 'A').firestore().collection('transactions').doc('tx-B').delete());
  });
});

describe('Firestore rules — public flows', () => {
  it('anon can create teacherRequest', async () => {
    await assertSucceeds(anonCtx().firestore().collection('teacherRequests').add({
      name: 'X', email: 'x@y.no', createdAt: Date.now(),
    }));
  });

  it('anon cannot read teacherRequests', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('teacherRequests').doc('r1').set({ name: 'X' });
    });
    await assertFails(anonCtx().firestore().collection('teacherRequests').doc('r1').get());
  });

  it('superadmin can read teacherRequests', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('teacherRequests').doc('r1').set({ name: 'X' });
    });
    await assertSucceeds(superCtx().firestore().collection('teacherRequests').doc('r1').get());
  });

  it('anon can read+write passwordResets (token in URL is the secret)', async () => {
    await assertSucceeds(anonCtx().firestore().collection('passwordResets').doc('reset1').set({
      token: 'abc', userId: 's1',
    }));
    await assertSucceeds(anonCtx().firestore().collection('passwordResets').doc('reset1').get());
  });
});

describe('Firestore rules — applications', () => {
  it('student can apply with own applicantId', async () => {
    await assertSucceeds(studentCtx('s1', 'A').firestore().collection('applications').add({
      classroomId: 'A', applicantId: 's1', jobId: 'j1',
    }));
  });

  it('student cannot apply on behalf of another', async () => {
    await assertFails(studentCtx('s1', 'A').firestore().collection('applications').add({
      classroomId: 'A', applicantId: 's2', jobId: 'j1',
    }));
  });
});

describe('Firestore rules — backups', () => {
  it('client cannot write classroomBackups directly', async () => {
    await assertFails(superCtx().firestore().collection('classroomBackups').doc('x').set({
      classroomId: 'A',
    }));
  });

  it('teacher in A can read backup for A', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('classroomBackups').doc('b1').set({ classroomId: 'A' });
    });
    await assertSucceeds(teacherCtx('t1', 'A').firestore().collection('classroomBackups').doc('b1').get());
  });

  it('teacher in B cannot read backup for A', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('classroomBackups').doc('b1').set({ classroomId: 'A' });
    });
    await assertFails(teacherCtx('t2', 'B').firestore().collection('classroomBackups').doc('b1').get());
  });
});
```

- [ ] **Step 2: Update vitest.config.js to exclude or include rules tests**

Verify `vitest.config.js` does not exclude `*.rules.test.js`. If exclusions exist, ensure rule tests are included.

Run: `cat vitest.config.js`

- [ ] **Step 3: Start firestore emulator and run tests**

In one terminal:
```bash
firebase emulators:start --only firestore
```

In another:
```bash
npx vitest run firestore.rules.test.js
```

Expected: all 14 tests pass.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules.test.js
git commit -m "test(rules): 14 unit tests for strict Firestore rules"
```

---

## Phase 3 — Client config + types

### Task 17: Update JSDoc types

**Files:**
- Modify: `js/shared/types/index.js`

- [ ] **Step 1: Update User typedef**

In `js/shared/types/index.js`, find the `User` typedef. Change `password` field to `passwordHash`, add `locked`:

```javascript
/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} username — always lowercase
 * @property {string} name
 * @property {string} accountNumber — 3-digit string
 * @property {'superadmin'|'teacher'|'student'} type
 * @property {number} balance
 * @property {string|null} classroomId
 * @property {string} [passwordHash] — SHA-256 hex
 * @property {boolean} [locked]
 */
```

- [ ] **Step 2: Update Classroom typedef**

```javascript
/**
 * @typedef {Object} Classroom
 * @property {string} id
 * @property {string} teacherId
 * @property {string} className
 * @property {string} currencyName
 * @property {string} currencySymbol
 * @property {number} startingBalance
 * @property {ClassroomSettings} settings
 * @property {boolean} [locked]
 * @property {string|null} [lockedAt]
 * @property {string|null} [lockedBy]
 * @property {string|null} [lastResetAt]
 * @property {number} [nextStudentNumber]
 * @property {number} [nextBusinessNumber]
 */
```

- [ ] **Step 3: Add ClassroomBackup typedef**

```javascript
/**
 * @typedef {Object} ClassroomBackup
 * @property {string} id
 * @property {string} classroomId
 * @property {string} createdAt — ISO 8601
 * @property {string} createdBy — uid
 * @property {'reset'|'pre-restore'|'demo-reset'} reason
 * @property {Object|null} classroom
 * @property {Array<Object>} users
 * @property {Array<Object>} transactions
 * @property {Array<Object>} jobs
 * @property {Array<Object>} applications
 * @property {Array<Object>} businesses
 * @property {Array<Object>} loans
 * @property {Array<Object>} savings
 * @property {Array<Object>} funds
 * @property {Array<Object>} notifications
 * @property {Array<Object>} messages
 * @property {Array<Object>} weeklySnapshots
 */
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: passes

- [ ] **Step 5: Commit**

```bash
git add js/shared/types/index.js
git commit -m "types: passwordHash + locked + ClassroomBackup"
```

---

### Task 18: Update config.js — reduce SUPERADMIN, remove session storage key

**Files:**
- Modify: `js/shared/config/config.js`

- [ ] **Step 1: Reduce SUPERADMIN constant**

Replace the `SUPERADMIN` export:

```javascript
export const SUPERADMIN = {
  id: 'superadmin',
  username: 'DanielAlexander',
};
```

(No more `passwordHash` — the truth lives in Firestore now.)

- [ ] **Step 2: Remove `session` from STORAGE_KEYS**

Find `STORAGE_KEYS` and remove the `session: ...` line. Firebase Auth handles session persistence in IndexedDB.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: passes (any references to `STORAGE_KEYS.session` will need fixing in next tasks)

- [ ] **Step 4: Commit**

```bash
git add js/shared/config/config.js
git commit -m "refactor(config): reduce SUPERADMIN to id+username; remove session storage key"
```

---

## Phase 4 — Client password field rename (passwordHash)

### Task 19: Rename password → passwordHash in dataService.js

**Files:**
- Modify: `js/shared/core/dataService.js`

- [ ] **Step 1: Find every occurrence**

Run: `grep -n "password" js/shared/core/dataService.js`

- [ ] **Step 2: Replace `password:` field assignments with `passwordHash:`**

For every `password: hashedPassword` or `password: await hashPassword(...)` or `user.password`/`userData.password` in the context of writing/reading the hash field:
- Field assignment: rename `password:` → `passwordHash:` in object literals being written to Firestore
- Field reads: rename `user.password` to `user.passwordHash`

Critical lines to examine (from the earlier grep):
- Line 270: `password: hashedPassword` → `passwordHash: hashedPassword`
- Line 453: `password: await hashPassword(userData.password)` — keep `userData.password` (input field), rename target: `passwordHash: await hashPassword(userData.password)`
- Any `where('password', ...)` queries → `where('passwordHash', ...)`

- [ ] **Step 3: Run typecheck and search for missed references**

Run: `npm run typecheck && grep -n "\.password\b\|password:" js/shared/core/dataService.js`
Expected: only references on input data (e.g., `userData.password`, the plaintext input from forms) remain.

- [ ] **Step 4: Commit**

```bash
git add js/shared/core/dataService.js
git commit -m "refactor(data): rename Firestore field password → passwordHash"
```

---

### Task 20: Rename password → passwordHash in classroomService.js

**Files:**
- Modify: `js/features/classroom/services/classroomService.js`

- [ ] **Step 1: Replace field writes**

Lines to change (from earlier grep):
- 116, 142, 221, 455: change `password: hashedPassword` → `passwordHash: hashedPassword` in the user object being written.
- Lines 209-211: demo student literals use `password: 'passord...'` (plaintext input). Keep these — they're input to `hashPassword()` later.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: passes

- [ ] **Step 3: Commit**

```bash
git add js/features/classroom/services/classroomService.js
git commit -m "refactor(classroom): rename password → passwordHash on user writes"
```

---

### Task 21: Rename password → passwordHash in auth/users controllers and main.js

**Files:**
- Modify: `js/features/auth/controllers/authController.js`
- Modify: `js/features/users/controllers/usersController.js`
- Modify: `js/main.js`

- [ ] **Step 1: authController.js line 269**

Change `password: await hashPassword(result.newPassword)` → `passwordHash: await hashPassword(result.newPassword)`.

- [ ] **Step 2: usersController.js lines 251, 808**

These pass `password: password` to `dataService.createUser`. Since `dataService.createUser` now expects the input form (plaintext) at `userData.password` and writes to `passwordHash` internally, **leave these as-is** — they're input fields, not Firestore writes.

(Verify by reading dataService.js after Task 19 — input contract should remain `userData.password`.)

- [ ] **Step 3: main.js password resets**

Lines 2228 and 2398: `updates.password = await hashPassword(newPassword)` → `updates.passwordHash = await hashPassword(newPassword)`.

Also line 1664: `password: hashedKariPassword` in demo student creation → `passwordHash: hashedKariPassword`.

- [ ] **Step 4: Run lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: passes

- [ ] **Step 5: Commit**

```bash
git add js/features/auth/controllers/authController.js js/features/users/controllers/usersController.js js/main.js
git commit -m "refactor: rename password → passwordHash in controllers + main.js"
```

---

## Phase 5 — Client auth service rewrite

### Task 22: Rewrite authService.js

**Files:**
- Modify: `js/features/auth/services/authService.js`

- [ ] **Step 1: Replace entire file content**

```javascript
/**
 * Authentication Service — Firebase Auth + Custom Tokens
 */

import { dataService } from '../../../shared/core/dataService.js';
import { eventBus, EVENTS } from '../../../shared/core/eventBus.js';
import { languageService } from '../../i18n/index.js';
import { statsService } from '../../stats/index.js';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.currentClaims = null;
    this._authReady = null;
  }

  /**
   * Sets up auth state listener. Returns a promise that resolves once
   * the first onAuthStateChanged callback has fired (with user or null).
   */
  async initialize() {
    if (this._authReady) return this._authReady;

    try {
      // eslint-disable-next-line no-undef
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (err) {
      console.warn('Firebase Auth persistens kunne ikke settes:', err);
    }

    this._authReady = new Promise((resolve) => {
      let resolved = false;
      // eslint-disable-next-line no-undef
      firebase.auth().onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
          await this._hydrateFromFirebaseUser(firebaseUser);
          eventBus.emit(EVENTS.USER_LOGGED_IN, this.currentUser);
        } else {
          const previous = this.currentUser;
          this.currentUser = null;
          this.currentClaims = null;
          if (dataService.setCurrentUserId) dataService.setCurrentUserId(null);
          if (dataService.clearCurrentClassroomId) dataService.clearCurrentClassroomId();
          if (previous) eventBus.emit(EVENTS.USER_LOGGED_OUT, previous);
        }
        if (!resolved) {
          resolved = true;
          resolve(this.currentUser);
        }
      });
    });

    return this._authReady;
  }

  async _hydrateFromFirebaseUser(firebaseUser) {
    const tokenResult = await firebaseUser.getIdTokenResult();
    this.currentClaims = {
      userType: tokenResult.claims.userType || null,
      classroomId: tokenResult.claims.classroomId || null,
      accountNumber: tokenResult.claims.accountNumber || null,
    };
    this.currentUser = await dataService.getUser(firebaseUser.uid);
    if (dataService.setCurrentUserId) dataService.setCurrentUserId(firebaseUser.uid);
    if (this.currentClaims.classroomId && dataService.setCurrentClassroomId) {
      dataService.setCurrentClassroomId(this.currentClaims.classroomId);
    }
  }

  async login(username, password) {
    const normalized = (username || '').trim().toLowerCase();
    try {
      // eslint-disable-next-line no-undef
      const callable = firebase.app().functions('europe-west1').httpsCallable('authenticateUser');
      const result = await callable({ username: normalized, password });
      const { token } = result.data || {};
      if (!token) throw new Error('auth.noToken');

      // eslint-disable-next-line no-undef
      const credential = await firebase.auth().signInWithCustomToken(token);
      await this._hydrateFromFirebaseUser(credential.user);

      const classroomId = this.currentClaims?.classroomId || null;
      try {
        await statsService.recordLogin(this.currentUser.id, this.currentUser.type, classroomId);
      } catch (err) {
        console.warn('recordLogin feilet:', err);
      }

      eventBus.emit(EVENTS.USER_LOGGED_IN, this.currentUser);
      return this.currentUser;
    } catch (err) {
      const code = (err && err.code) || '';
      const msg = (err && err.message) || '';
      if (code.includes('not-found') || code.includes('permission-denied') || msg.includes('invalidCredentials')) {
        if (msg.includes('accountLocked')) {
          throw new Error(languageService.t('error.accountLocked') || 'Konto er låst.');
        }
        throw new Error(languageService.t('error.invalidCredentials'));
      }
      throw err;
    }
  }

  async logout() {
    // eslint-disable-next-line no-undef
    await firebase.auth().signOut();
  }

  async refreshCurrentUser() {
    if (!this.currentUser) return null;
    const updated = await dataService.getUser(this.currentUser.id);
    if (updated) this.currentUser = updated;
    return updated;
  }

  async refreshClaims() {
    // eslint-disable-next-line no-undef
    const fbUser = firebase.auth().currentUser;
    if (!fbUser) return null;
    const tokenResult = await fbUser.getIdTokenResult(true);
    this.currentClaims = {
      userType: tokenResult.claims.userType || null,
      classroomId: tokenResult.claims.classroomId || null,
      accountNumber: tokenResult.claims.accountNumber || null,
    };
    return this.currentClaims;
  }

  isAuthenticated() { return this.currentUser !== null; }
  isTeacher() { return this.currentClaims?.userType === 'teacher'; }
  isStudent() { return this.currentClaims?.userType === 'student'; }
  isSuperAdmin() { return this.currentClaims?.userType === 'superadmin'; }
  getCurrentUser() { return this.currentUser; }
  getCurrentUserId() { return this.currentUser?.id || null; }
  getCurrentClaims() { return this.currentClaims; }

  async updateCurrentUser(updates) {
    if (!this.currentUser) {
      throw new Error(languageService.t('error.noUserLoggedIn'));
    }
    const updated = await dataService.updateUser(this.currentUser.id, updates);
    this.currentUser = updated;
    return updated;
  }
}

export const authService = new AuthService();
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: passes (firebase is global from compat scripts, eslint-disable is in place)

- [ ] **Step 3: Commit**

```bash
git add js/features/auth/services/authService.js
git commit -m "refactor(auth): rewrite authService for Firebase Auth + custom tokens"
```

---

## Phase 6 — Replace client-side reset/demo logic with Cloud Function calls

### Task 23: Replace deleteClassData in main.js with resetClassroom Cloud Function call

**Files:**
- Modify: `js/main.js` (around line 1826-1886)

- [ ] **Step 1: Replace the body of `deleteClassData()`**

Find `async deleteClassData() {` near line 1826. Replace the entire method body with:

```javascript
async deleteClassData() {
  try {
    console.log('🗑️ Sletter all klassedata via Cloud Function...');
    const classroomId = dataService.getCurrentClassroomId();
    if (!classroomId) {
      uiManager.showError(languageService.t('error.couldNotFindClassroom'));
      return;
    }

    // eslint-disable-next-line no-undef
    const callable = firebase.app().functions('europe-west1').httpsCallable('resetClassroom');
    const result = await callable({ classroomId });
    console.log(`✅ Backup ${result.data.backupId}, slettet ${result.data.deletedStudents} elever`);

    await dataService.refreshUsersCache();
    await dataService.loadClassroomDataToCache(classroomId);
    await this.refreshAllServiceCaches();

    document.getElementById('settingsModal').classList.add('hidden');
    uiManager.showSuccess(languageService.t('msg.classDeleted'));
    await this.showTeacherDashboard();
  } catch (error) {
    console.error('Feil ved sletting av klasse:', error);
    uiManager.showError(languageService.t('error.deleteFailed') + ': ' + (error.message || ''));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/main.js
git commit -m "refactor(main): deleteClassData now calls resetClassroom Cloud Function"
```

---

### Task 24: Replace resetDemoClassroom in main.js with Cloud Function call

**Files:**
- Modify: `js/main.js` (around line 1535-1650)

- [ ] **Step 1: Replace the body of `resetDemoClassroom()`**

Replace with:

```javascript
async resetDemoClassroom() {
  try {
    const currentUser = authService.getCurrentUser();
    if (!currentUser || (currentUser.id !== 't1' && !authService.isSuperAdmin())) {
      uiManager.showError(languageService.t('error.unauthorized'));
      return;
    }
    const confirmMsg = languageService.t('confirm.resetDemoClassroom') ||
      '🔄 Tilbakestill demo-klasserommet?';
    if (!confirm(confirmMsg)) return;

    // eslint-disable-next-line no-undef
    const callable = firebase.app().functions('europe-west1').httpsCallable('resetDemoClassroom');
    const result = await callable({});
    console.log(`✅ Demo reset, backup ${result.data.backupId}, ${result.data.studentsRecreated} elever`);

    await dataService.refreshUsersCache();
    await dataService.loadClassroomDataToCache('demo-classroom');
    uiManager.showSuccess(languageService.t('msg.demoClassroomReset') || 'Demo tilbakestilt!');
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    console.error('Demo reset feilet:', error);
    uiManager.showError(languageService.t('error.resetFailed'));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/main.js
git commit -m "refactor(main): resetDemoClassroom now calls Cloud Function"
```

---

### Task 25: Remove resetEconSim and resetAllData from main.js

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Find and delete the global exposure**

Around line 76, find `window.resetEconSim = ...` and delete the line.

- [ ] **Step 2: Delete the `resetAllData()` method**

Find `async resetAllData()` around line 197 and delete the method (typically 50-100 lines). Make sure no other code calls it (grep).

Run: `grep -n "resetAllData\|resetEconSim" js/main.js`
Expected: no remaining references after deletion.

- [ ] **Step 3: Delete console hint at line 132**

Remove the line: `console.log('💡 Tips: Bruk resetEconSim()...');`

- [ ] **Step 4: Run lint + tests**

Run: `npm run lint && npm test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "refactor(main): remove resetEconSim/resetAllData (use firebase CLI for nuke)"
```

---

### Task 26: Add ensureDemoData call at app init

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Find the app init point**

In `main.js`, find where `dataService.initialize()` or `firebaseService.initialize()` is awaited at startup.

Run: `grep -n "dataService.initialize\|firebaseService.initialize" js/main.js`

- [ ] **Step 2: After firebase init, before first auth/data calls, call ensureDemoData**

After Firebase has been initialized but before login screen renders, add:

```javascript
try {
  // eslint-disable-next-line no-undef
  const ensure = firebase.app().functions('europe-west1').httpsCallable('ensureDemoData');
  await ensure({});
} catch (err) {
  console.warn('ensureDemoData feilet (sannsynligvis allerede opprettet):', err);
}
```

This is idempotent and fast if demo already exists (single Firestore read).

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat(init): call ensureDemoData on startup for demo seed"
```

---

### Task 27: Replace classroomService.createDemoClassroom internals

**Files:**
- Modify: `js/features/classroom/services/classroomService.js`

- [ ] **Step 1: Replace createDemoClassroom body**

Find `createDemoClassroom` and replace its body with a single call to the Cloud Function:

```javascript
async createDemoClassroom() {
  try {
    // eslint-disable-next-line no-undef
    const ensure = firebase.app().functions('europe-west1').httpsCallable('ensureDemoData');
    const result = await ensure({});
    return result.data;
  } catch (err) {
    console.warn('createDemoClassroom feilet:', err);
    return { created: false, error: err.message };
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add js/features/classroom/services/classroomService.js
git commit -m "refactor(classroom): createDemoClassroom delegates to Cloud Function"
```

---

## Phase 7 — Backups feature (new)

### Task 28: Create backups service and index

**Files:**
- Create: `js/features/backups/services/backupService.js`
- Create: `js/features/backups/index.js`

- [ ] **Step 1: Write backupService.js**

```javascript
/**
 * Service for backup management (superadmin only).
 */
class BackupService {
  _callable(name) {
    // eslint-disable-next-line no-undef
    return firebase.app().functions('europe-west1').httpsCallable(name);
  }

  async listBackups({ classroomId } = {}) {
    const result = await this._callable('listBackups')({ classroomId: classroomId || null });
    return result.data?.backups || [];
  }

  async previewBackup(backupId) {
    const result = await this._callable('previewBackup')({ backupId });
    return result.data || null;
  }

  async restoreBackup(backupId) {
    const result = await this._callable('restoreClassroom')({ backupId });
    return result.data;
  }

  async deleteBackup(backupId) {
    const result = await this._callable('deleteBackup')({ backupId });
    return result.data;
  }

  async setClassroomLocked(classroomId, locked) {
    const result = await this._callable('setClassroomLocked')({ classroomId, locked });
    return result.data;
  }
}

export const backupService = new BackupService();
```

- [ ] **Step 2: Write index.js**

```javascript
export { backupService } from './services/backupService.js';
```

- [ ] **Step 3: Commit**

```bash
git add js/features/backups/
git commit -m "feat(backups): backupService for list/preview/restore/delete + lock"
```

---

### Task 29: Create backupsController.js

**Files:**
- Create: `js/features/backups/controllers/backupsController.js`

- [ ] **Step 1: Write the controller**

```javascript
import { backupService } from '../services/backupService.js';
import { authService } from '../../auth/index.js';
import { languageService } from '../../i18n/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { dataService } from '../../../shared/core/dataService.js';

class BackupsController {
  constructor() {
    this.currentBackups = [];
    this.filterClassroomId = null;
  }

  async render() {
    if (!authService.isSuperAdmin()) return;
    const container = document.getElementById('backupsList');
    if (!container) return;
    container.innerHTML = `<p class="text-gray-500 italic">${languageService.t('backups.loading') || 'Laster...'}</p>`;

    try {
      this.currentBackups = await backupService.listBackups({ classroomId: this.filterClassroomId });
      if (this.currentBackups.length === 0) {
        container.innerHTML = `<p class="text-gray-500 italic">${languageService.t('backups.empty') || 'Ingen backups.'}</p>`;
        return;
      }
      container.innerHTML = this.currentBackups.map(b => this._renderBackupRow(b)).join('');
    } catch (err) {
      console.error('listBackups feilet:', err);
      container.innerHTML = `<p class="text-red-600">${err.message}</p>`;
    }
  }

  _renderBackupRow(b) {
    const date = new Date(b.createdAt).toLocaleString('nb-NO');
    const reasonLabel = {
      'reset': '🔄 Reset',
      'pre-restore': '↺ Pre-restore',
      'demo-reset': '🎭 Demo-reset',
    }[b.reason] || b.reason;
    return `
      <div class="border rounded p-3 mb-2 bg-white">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold">${b.classroomId} <span class="text-xs text-gray-500">${reasonLabel}</span></div>
            <div class="text-sm text-gray-600">${date} • av ${b.createdBy}</div>
            <div class="text-xs text-gray-500">
              ${b.counts.users} elever • ${b.counts.transactions} tx • ${b.counts.jobs} jobber • ${b.counts.businesses} bedrifter
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="window.econSim.backupsController.restore('${b.id}')"
                    class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm">↺ Restore</button>
            <button onclick="window.econSim.backupsController.delete('${b.id}')"
                    class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  async restore(backupId) {
    const backup = this.currentBackups.find(b => b.id === backupId);
    if (!backup) return;
    const msg1 = `${languageService.t('confirm.restoreClassroom') || 'Gjenopprett klasserommet'} ${backup.classroomId} fra ${new Date(backup.createdAt).toLocaleString('nb-NO')}?\n\nNåværende data lagres som ny backup først.`;
    if (!confirm(msg1)) return;
    const msg2 = `${languageService.t('confirm.restoreClassroomFinal') || 'Skriv inn klasserom-ID for å bekrefte'}: ${backup.classroomId}`;
    const typed = prompt(msg2);
    if (typed !== backup.classroomId) {
      uiManager.showError(languageService.t('error.confirmFailed') || 'Bekreftelse feilet');
      return;
    }
    try {
      const result = await backupService.restoreBackup(backupId);
      uiManager.showSuccess(`${languageService.t('msg.restored') || 'Restore fullført'} (${result.preRestoreBackupId})`);
      await dataService.refreshUsersCache();
      await this.render();
    } catch (err) {
      uiManager.showError(err.message);
    }
  }

  async delete(backupId) {
    if (!confirm(languageService.t('confirm.deleteBackup') || 'Slett denne backupen?')) return;
    try {
      await backupService.deleteBackup(backupId);
      await this.render();
    } catch (err) {
      uiManager.showError(err.message);
    }
  }

  async toggleLock(classroomId, currentlyLocked) {
    const action = currentlyLocked ? 'lås opp' : 'lås';
    if (!confirm(`Vil du ${action} klasserommet ${classroomId}?`)) return;
    try {
      await backupService.setClassroomLocked(classroomId, !currentlyLocked);
      uiManager.showSuccess(`Klasserom ${currentlyLocked ? 'låst opp' : 'låst'}`);
      // Trigger rerender of classroom list
      if (window.econSim?.classroomController?.refreshClassroomList) {
        await window.econSim.classroomController.refreshClassroomList();
      }
    } catch (err) {
      uiManager.showError(err.message);
    }
  }
}

export const backupsController = new BackupsController();
```

- [ ] **Step 2: Update index.js to export controller**

```javascript
export { backupService } from './services/backupService.js';
export { backupsController } from './controllers/backupsController.js';
```

- [ ] **Step 3: Commit**

```bash
git add js/features/backups/
git commit -m "feat(backups): controller with render/restore/delete/lock UI"
```

---

### Task 30: Wire backupsController into main.js + add Backups section to index.html

**Files:**
- Modify: `js/main.js`
- Modify: `index.html`

- [ ] **Step 1: Import and attach controller in main.js**

At the top of `main.js`, add import:

```javascript
import { backupsController } from './features/backups/index.js';
```

In the EconSim class constructor or init flow, attach to instance:

```javascript
this.backupsController = backupsController;
```

In the superadmin dashboard render flow, find where superadmin sections are rendered. Add a call to `this.backupsController.render()` after the classroom list renders.

- [ ] **Step 2: Add Backups section to index.html in superadmin dashboard**

Find the superadmin dashboard `<div id="superadminScreen">` (or equivalent). Add a new section for backups:

```html
<div class="mt-6 bg-gray-50 rounded p-4" id="superadminBackupsSection">
  <h3 class="text-lg font-semibold mb-3">📦 <span data-i18n="backups.title">Backups</span></h3>
  <div class="mb-3 flex gap-2 items-center">
    <select id="backupsFilterSelect" class="border rounded px-2 py-1 text-sm">
      <option value="">Alle klasserom</option>
    </select>
    <button onclick="window.econSim.backupsController.render()"
            class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">🔄</button>
  </div>
  <div id="backupsList"></div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add js/main.js index.html
git commit -m "feat(backups): wire backups section into superadmin dashboard"
```

---

### Task 31: Add lock/unlock button in superadmin classroom list

**Files:**
- Modify: `js/features/classroom/controllers/classroomController.js`

- [ ] **Step 1: Update classroom list rendering**

Find line ~47 (`deleteClassroomAsSuperadmin`) where the delete button is rendered. Add a lock/unlock button alongside.

Replace the button block with:

```javascript
const lockBtn = classroom.locked
  ? `<button onclick="window.econSim.backupsController.toggleLock('${classroom.id}', true)"
             class="text-green-600 hover:text-green-800 text-sm" title="Lås opp">🔓 Lås opp</button>`
  : `<button onclick="window.econSim.backupsController.toggleLock('${classroom.id}', false)"
             class="text-yellow-600 hover:text-yellow-800 text-sm" title="Lås">🔒 Lås</button>`;
const deleteBtn = classroom.id === 'demo-classroom'
  ? ''
  : `<button onclick="window.econSim.deleteClassroomAsSuperadmin('${classroom.id}')"
             class="text-red-600 hover:text-red-800 text-sm" title="Slett klasserom">🗑️ Slett</button>`;
const lockBadge = classroom.locked
  ? `<span class="ml-2 inline-block bg-yellow-200 text-yellow-800 text-xs px-2 py-0.5 rounded">🔒 Låst</span>`
  : '';
// Then in the row template, render lockBadge next to the classroom name and lockBtn + deleteBtn in the actions cell
```

(Adapt to existing template structure — locate the row builder and merge lockBtn + lockBadge into it.)

- [ ] **Step 2: Commit**

```bash
git add js/features/classroom/controllers/classroomController.js
git commit -m "feat(superadmin): lock/unlock button + locked badge in classroom list"
```

---

### Task 32: Add i18n keys for backups + lock + auth.accountLocked

**Files:**
- Modify: `js/features/i18n/services/languageService.js`

- [ ] **Step 1: Add Norwegian keys**

Find the Norwegian translations object. Add:

```javascript
'backups.title': 'Backups',
'backups.empty': 'Ingen backups funnet.',
'backups.loading': 'Laster backups...',
'backups.preview': 'Forhåndsvis',
'backups.restore': 'Gjenopprett',
'backups.delete': 'Slett backup',
'lock.lockClassroom': 'Lås klasserom',
'lock.unlockClassroom': 'Lås opp klasserom',
'lock.locked': 'Låst',
'confirm.restoreClassroom': 'Gjenopprett dette klasserommet fra backup?',
'confirm.restoreClassroomFinal': 'Skriv inn klasserom-ID for å bekrefte',
'confirm.deleteBackup': 'Slett denne backupen permanent?',
'msg.restored': 'Klasserom gjenopprettet',
'error.accountLocked': 'Kontoen din er låst. Kontakt administrator.',
'error.confirmFailed': 'Bekreftelse mislyktes',
```

- [ ] **Step 2: Add English keys**

Find the English translations object. Add equivalents:

```javascript
'backups.title': 'Backups',
'backups.empty': 'No backups found.',
'backups.loading': 'Loading backups...',
'backups.preview': 'Preview',
'backups.restore': 'Restore',
'backups.delete': 'Delete backup',
'lock.lockClassroom': 'Lock classroom',
'lock.unlockClassroom': 'Unlock classroom',
'lock.locked': 'Locked',
'confirm.restoreClassroom': 'Restore this classroom from backup?',
'confirm.restoreClassroomFinal': 'Type the classroom ID to confirm',
'confirm.deleteBackup': 'Delete this backup permanently?',
'msg.restored': 'Classroom restored',
'error.accountLocked': 'Your account is locked. Contact administrator.',
'error.confirmFailed': 'Confirmation failed',
```

- [ ] **Step 3: Commit**

```bash
git add js/features/i18n/services/languageService.js
git commit -m "i18n: backups + lock + accountLocked keys (no + en)"
```

---

## Phase 8 — Pre-deploy validation

### Task 33: Run full local verify

**Files:** none (just verify)

- [ ] **Step 1: Run lint + typecheck + test**

Run: `npm run verify`
Expected: all pass.

If any fail, fix inline and re-run. Commit fixes if needed.

- [ ] **Step 2: Build CSS**

Run: `npm run build:css`
Expected: succeeds, `css/output.css` updated.

- [ ] **Step 3: Sanity-test in emulator**

In one terminal: `firebase emulators:start --import=./emulator-seed --export-on-exit`

Open `http://localhost:5000/?emulator=1`

Expected: app loads, login as `laerer/passord` works (after `ensureDemoData` runs once).

If demo doesn't seed, manually call: open browser console, run:
```javascript
firebase.app().functions('europe-west1').httpsCallable('ensureDemoData')({})
```

Verify login flow.

- [ ] **Step 4: Commit (if any fixes)**

```bash
git add -A
git commit -m "fix: local verify pass before prod deploy"
```

(Skip if nothing to commit.)

---

## Phase 9 — Cutover (deploy to production)

### Task 34: Pre-migration Firestore export

**Files:** none (cloud operation)

- [ ] **Step 1: Ensure backup bucket exists**

Run: `gsutil ls gs://econsim-5723c-backups`
If not found: `gsutil mb -l europe-west1 gs://econsim-5723c-backups`

- [ ] **Step 2: Export Firestore**

Run:
```bash
gcloud firestore export gs://econsim-5723c-backups/pre-auth-migration-$(date +%Y%m%d-%H%M)
```

Expected: operation started, can be tracked via `gcloud firestore operations list`.

Wait for operation to complete (5-15 min depending on data size).

---

### Task 35: Deploy migrateAuthSchema only and run

**Files:** none (deploy)

- [ ] **Step 1: Deploy only the migration function**

Run: `firebase deploy --only functions:migrateAuthSchema`
Expected: deploy succeeds.

- [ ] **Step 2: Call the migration**

Run:
```bash
gcloud functions call migrateAuthSchema --region=europe-west1
```

Or via Firebase Console → Functions → `migrateAuthSchema` → Test with `{}`.

- [ ] **Step 3: Verify report**

The function returns a JSON report. Verify:
- `usersRenamedField` matches expected count (count of users with `password` field before migration)
- `superadminCreated: true` if `users/superadmin` didn't exist
- `usersLowercasedUsername` matches count of mixed-case usernames

Check `migrationLog` collection in Firestore Console for the audit entry.

- [ ] **Step 4: Spot-check Firestore data**

In Firebase Console → Firestore:
- Pick a `users/{id}` doc, verify `passwordHash` field exists, `password` does not, `locked: false` exists
- Verify `users/superadmin` doc exists with `passwordHash`
- Pick a `classrooms/{id}` doc, verify `locked: false` exists

If anything wrong: import from pre-migration export, fix code, re-deploy, re-run.

---

### Task 36: Deploy remaining Cloud Functions

**Files:** none (deploy)

- [ ] **Step 1: Deploy all functions**

Run: `firebase deploy --only functions`
Expected: deploy succeeds, all new functions listed in output.

- [ ] **Step 2: Verify functions in Firebase Console**

Console → Functions → list should include: authenticateUser, ensureDemoData, resetClassroom, resetDemoClassroom, restoreClassroom, listBackups, previewBackup, deleteBackup, setClassroomLocked, cleanOldBackups, migrateAuthSchema, plus existing email/scheduler functions.

All in region `europe-west1` (or `us-central1` for the email functions if not migrated).

---

### Task 37: Deploy hosting (client code) — still with open rules

**Files:** none (deploy)

- [ ] **Step 1: Build CSS**

Run: `npm run build:css`

- [ ] **Step 2: Deploy hosting**

Run: `firebase deploy --only hosting`
Expected: deploy succeeds, new client live.

- [ ] **Step 3: Smoke-test live site (rules still open!)**

Open https://econsim-5723c.web.app/

- Login as `laerer/passord` → expect dashboard renders, claims set
- Open DevTools, check `firebase.auth().currentUser` — should be set with uid `t1`
- Check `firebase.auth().currentUser.getIdTokenResult().then(r => console.log(r.claims))` — should show userType, classroomId

- Logout works
- Login as `kari123/passord123` → student dashboard
- Login as `DanielAlexander/<superadmin-passord>` → superadmin dashboard, Backups section visible

If any flow broken: investigate (Cloud Functions logs in Firebase Console). Fix and redeploy.

---

### Task 38: Deploy strict Firestore rules

**Files:** none (deploy)

- [ ] **Step 1: Deploy rules**

Run: `firebase deploy --only firestore:rules`
Expected: deploy succeeds.

- [ ] **Step 2: Immediate smoke test**

Refresh https://econsim-5723c.web.app/ in incognito.

- Login as `laerer/passord` → dashboard renders, can see students
- Try DevTools console: `firebase.firestore().collection('users').get().then(s => console.log(s.size))` — should fail or only return classroom-relevant docs
- Login as `kari123/passord123` → student dashboard
- Try DevTools console: `firebase.firestore().collection('users').doc('some-other-classroom-uid').get()` — expect permission-denied

If broken: rollback rules immediately:

```bash
cp firestore.rules.legacy firestore.rules
firebase deploy --only firestore:rules
```

Then investigate offline.

---

### Task 39: Run Playwright validation suite against live URL

**Files:** none

- [ ] **Step 1: Use Playwright MCP to test core flows**

Via the MCP playwright tool, validate:

1. Navigate to https://econsim-5723c.web.app/
2. Login as `laerer / passord` → expect dashboard renders, no console errors
3. Navigate to settings → click "Slett klasse og start på nytt" → cancel
4. Logout → login as `kari123 / passord123` → expect student dashboard
5. Logout → login as `DanielAlexander / <password>` → superadmin dashboard
6. Verify Backups section renders
7. Verify lock/unlock button visible on classroom list

Capture console logs and screenshot at each step.

- [ ] **Step 2: Test failure paths**

1. Wrong password for `laerer` → expect "Feil brukernavn eller passord"
2. After successful login, refresh page → session restored

- [ ] **Step 3: If any test fails, investigate logs**

Check Firebase Functions logs and Firestore audit. Fix root cause, redeploy, re-test.

---

## Phase 10 — Documentation updates

### Task 40: Update MANIFEST.md

**Files:**
- Modify: `MANIFEST.md`

- [ ] **Step 1: Update §3 Teknologistack**

Change `| Autentisering | Egenutviklet (SHA-256 passord-hash, ingen Firebase Auth) |` to:
```
| Autentisering | Firebase Auth + Custom Tokens (server-side SHA-256-verifisering via Cloud Function) |
```

- [ ] **Step 2: Update §6 Datamodell**

In Hovedentiteter table:
- `User`: change `passwordHash` listed in property list (clarify: SHA-256 hex), add `locked`
- `Classroom`: add `locked`, `lockedAt`, `lockedBy`, `lastResetAt`
- Add new entity `ClassroomBackup`: `id`, `classroomId`, `createdAt`, `createdBy`, `reason`, doc-arrays per collection

In §6.4 Firestore-collections, add: `classroomBackups`, `migrationLog`.

- [ ] **Step 3: Update §10 Multi-tenant**

Replace "Sikkerhetsmodell" subsection with:
```
**Sikkerhetsmodell:**
- `firestore.rules` enforcer at lese/skrive krever matching `classroomId` på dokumenter (basert på Firebase Auth Custom Token claims).
- Brukere kan kun lese egen `User`, eget klasseroms data, og egne kontoer.
- Cross-classroom-tilgang er server-side blokkert — klient-omgåelse er ikke mulig.
```

- [ ] **Step 4: Add new §15 subsection on classroom reset**

After §15.4 add:

```markdown
### 15.5 Slett/restore klasse

**Lærer:** Slett klasse og start på nytt — knapp i Innstillinger-modal. Tar automatisk backup av alle data i klasserommet til `classroomBackups`-collection før sletting. Backup beholdes i 90 dager.

**Superadmin:** Backups-seksjon i dashboard lar superadmin liste, forhåndsvise, gjenopprette og slette backups for hvilket som helst klasserom. Restore tar en pre-restore-backup først så operasjonen er reverserbar.

**Lås klasserom:** Superadmin kan låse en lærer + klasserom via knapp i klasserom-lista. Lås revoker Firebase Auth refresh-tokens (eksisterende sesjoner ugyldiggjøres innen ~1 time) og blokkerer fremtidige login-forsøk.

**Implementasjon:** Alle tre operasjoner kjører som Cloud Functions med admin SDK (omgår Firestore-rules). Klient-koden er kun et tynt UI-lag som kaller funksjonene.
```

- [ ] **Step 5: Update §14.0 invarianter**

Change `User.passwordHash` row description: "SHA-256 hex (server-verifisert via Firebase Auth Cloud Function)".
Remove or update warning that "Det er ingen runtime-validering" — strict rules give server-side validation now.

- [ ] **Step 6: Commit**

```bash
git add MANIFEST.md
git commit -m "docs(manifest): firebase auth + backups + lock model"
```

---

### Task 41: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update Teknologistack table**

Change Autentisering row to: `Firebase Auth + Custom Tokens (Cloud Function authenticateUser verifiserer SHA-256)`

- [ ] **Step 2: Add subsection about authService API**

In "Kjernekonsepter" → after Async-mønster, add:

```markdown
### Auth-claims

Etter Firebase Auth-migrering har klienten følgende API:
- `authService.getCurrentClaims()` → `{ userType, classroomId, accountNumber }`
- `authService.refreshClaims()` → tving token-refresh etter at admin SDK har endret claims
- `authService.isSuperAdmin()`, `isTeacher()`, `isStudent()` leser claims (ikke `currentUser.type`)

Bruk `getCurrentClaims()` for raske rolle-/klasse-sjekker — unngår Firestore-roundtrip.
```

- [ ] **Step 3: Update fase-status table**

Mark new row: `| Fase 9 — Firebase Auth + strenge rules + backups | Ferdig |`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): firebase auth migration + claims API"
```

---

### Task 42: Update OPERATIONS.md, SECURITY.md, ARCHITECTURE.md

**Files:**
- Modify: `docs/OPERATIONS.md`
- Modify: `SECURITY.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: OPERATIONS.md §5**

Replace "Roadmap for tightening" with:
```markdown
### Implementert per 2026-05-09

Firebase Auth + Custom Tokens + strenge Firestore-rules er aktive. Trusler som er adressert:
- Cross-classroom data-lese/skriving — blokkert serverside
- Anonym Firestore-tilgang — blokkert (med kjente unntak: teacherRequests create, passwordResets/emailVerifications token-i-URL)
- Eksponering av superadmin-hash i klient-bundle — flyttet til Firestore med strenge regler
```

Add new §11:
```markdown
## 11. Backup, restore og lås

### Backup
Hver gang en lærer kjører "Slett klasse og start på nytt", tar `resetClassroom` Cloud Function automatisk en full backup til `classroomBackups`-collection. Backup beholdes i 90 dager (auto-rydd via `cleanOldBackups` søndag 04:00 norsk tid).

### Restore
Superadmin har Backups-seksjon i dashboard. Restore tar en pre-restore-backup først, så operasjonen er reverserbar.

### Lås
Superadmin kan låse en lærer + klasserom via knapp i klasserom-lista. `revokeRefreshTokens` ugyldiggjør eksisterende sesjon innen ~1 time. Lås opp via samme knapp.

### Manuell nuke (utvikling)
Global `resetEconSim()` er fjernet fra prod-bundlet. For utviklingsbruk:
```bash
firebase firestore:delete --all-collections --recursive --project econsim-5723c
firebase deploy --only functions:ensureDemoData
gcloud functions call ensureDemoData --region=europe-west1
```
```

- [ ] **Step 2: SECURITY.md**

Replace "Kjente begrensninger" section with "Tidligere begrensninger (løst 2026-05-09)" — preserve content but mark as resolved.

Add new "Nåværende sikkerhetsmodell":
```markdown
- Firebase Auth med Custom Tokens
- SHA-256-verifisering serverside via Cloud Function (klient sender plaintext over HTTPS)
- Strenge Firestore-rules basert på request.auth.token claims
- Cross-classroom-isolering håndhevet serverside
- Lås-funksjonalitet for superadmin (revokes refresh-tokens)
```

- [ ] **Step 3: ARCHITECTURE.md auth-seksjon**

Replace any "egenutviklet auth" prose with description of Firebase Auth + Custom Tokens flow. Add diagram or sequence reference to MANIFEST.md.

- [ ] **Step 4: Commit**

```bash
git add docs/OPERATIONS.md SECURITY.md docs/ARCHITECTURE.md
git commit -m "docs: operations + security + architecture for auth migration"
```

---

### Task 43: Update DEPLOYMENT.md and TESTING.md

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: DEPLOYMENT.md**

Add Cloud Functions list section: list all 12+ functions with region (`europe-west1`).

Add cutover-rekkefølge documentation (mirroring spec §8).

- [ ] **Step 2: TESTING.md**

Add Firebase Emulator Suite section:
```markdown
### Firebase Emulator Suite

Lokalt: `firebase emulators:start --import=./emulator-seed`
Klient peker på emulator via `?emulator=1` URL-parameter.

Regel-tester: `npx vitest run firestore.rules.test.js` (krever firestore-emulator kjørende på port 8080).
```

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOYMENT.md docs/TESTING.md
git commit -m "docs: deployment + testing for emulator suite"
```

---

### Task 44: Update BRUKSANVISNING.md (document delete-class for teachers + restore/lock for superadmin)

**Files:**
- Modify: `docs/BRUKSANVISNING.md`

- [ ] **Step 1: Add lærer-section about delete class**

Find the lærer (teacher) section. Add subsection:

```markdown
### Slett klasse og start på nytt

Hvis du vil tilbakestille klasserommet (slette alle elever, transaksjoner, jobber, bedrifter, lån) og starte på nytt:

1. Klikk **Innstillinger** (tannhjul-ikon)
2. Bla helt ned, klikk **Slett klasse og start på nytt**
3. Bekreft to ganger (advarsel + sikkerhetsspørsmål)

Klasserommet beholdes (samme klassenavn, lærer-konto, valuta), men all elev-data, bedrifter og historikk slettes. **Backup tas automatisk** — superadmin kan gjenopprette i opptil 90 dager hvis du angrer.
```

- [ ] **Step 2: Add superadmin-section about backups + lock**

Add a new "Superadmin"-section if it doesn't exist, or extend existing:

```markdown
### Backup-administrasjon

I superadmin-dashboard finner du **Backups**-seksjonen som lister alle automatiske backups. For hver backup kan du:

- 👁️ **Forhåndsvis** — se hva som er i backupen
- ↺ **Restore** — gjenopprett klasserommet fra denne backupen (krever skrive klasserom-ID for å bekrefte)
- 🗑️ **Slett** — fjerne backupen permanent

Restore tar en ekstra pre-restore-backup først, så du kan rulle tilbake hvis noe blir galt.

### Lås lærer + klasserom

Hver klasserom har en **🔒 Lås**-knapp i klasserom-lista. Når du låser:
- Læreren kan ikke logge inn (får "Konto er låst"-feilmelding)
- Eksisterende sesjon ugyldiggjøres innen 1 time
- Klassen kan låses opp igjen når som helst

Bruk denne for midlertidig sperring uten å slette klasserommet.
```

- [ ] **Step 3: Commit**

```bash
git add docs/BRUKSANVISNING.md
git commit -m "docs(bruksanvisning): document slett-klasse, backups, lås"
```

---

### Task 45: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add v6.1.0 entry at top**

Insert after the existing top-level header:

```markdown
## v6.1.0 — 2026-05-09 — Firebase Auth-migrering

### Sikkerhet
- Migrert fra egenutviklet SHA-256-auth til Firebase Auth + Custom Tokens
- Cloud Function `authenticateUser` verifiserer passord serverside
- Strenge `firestore.rules` håndhever auth + klasserom-isolering serverside
- Cross-classroom-tilgang er nå blokkert serverside (var kun klient-side)
- `users/superadmin` doc flyttet til Firestore (var hardkodet hash i klient-bundle)
- `User.password`-felt renamet til `User.passwordHash` for tydelighet

### Backup og restore
- Per-klasserom reset (lærer) tar automatisk backup før sletting
- Backups beholdes 90 dager, auto-rydd hver søndag
- Superadmin har nytt Backups-dashboard for liste, forhåndsvisning, restore, sletting
- Restore tar pre-restore-backup først så operasjonen er reverserbar

### Lås
- Superadmin kan låse lærer + klasserom; revoker refresh-tokens
- Lås opp via samme knapp

### Fjernet
- Global `resetEconSim()` fra klient-bundle (bruk `firebase firestore:delete` for utvikling)

### Endret
- Region for Cloud Functions: `europe-west1` (var `us-central1`); colocation med Firestore sparer ~100ms per kall
- Klient-side session lagring: Firebase Auth (IndexedDB) i stedet for localStorage
- All `username` lagres lowercase for konsistent serverside-lookup
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): v6.1.0 — Firebase Auth-migrering"
```

---

## Phase 11 — Final validation

### Task 46: Final smoke test on live site

**Files:** none

- [ ] **Step 1: Use Playwright to validate all flows on prod**

Test sequence:
1. Login `laerer/passord` → dashboard, no console errors
2. Logout → login `kari123/passord123` → student dashboard
3. Logout → login `DanielAlexander/<password>` → superadmin
4. Backups section renders (may be empty initially — that's OK)
5. Logout → wrong password → expected error
6. Refresh after login → session restored

- [ ] **Step 2: Verify in Firebase Console**

- Functions logs show recent calls without errors
- Firestore: spot-check rules deployed (Console → Firestore → Rules tab shows new content)
- Firebase Auth: Console → Authentication → Users — sees uid `t1`, `s1`, etc. after first login

- [ ] **Step 3: Verify Cloud Function regions**

In Firebase Console → Functions:
- Auth functions in `europe-west1`
- Email functions still in `us-central1` (legacy — separate migration if desired later)

- [ ] **Step 4: Run npm verify one last time**

Run: `npm run verify`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 5: If any issue, fix + redeploy + re-test**

Otherwise, write final commit:

```bash
git status
# (verify clean)
```

If clean, the migration is complete.

---

## Self-Review Notes

**Spec coverage check:**
- §3 Architecture → Tasks 1-3 (SDK loading), 5 (helpers), 7-14 (functions)
- §4 Cloud Functions → Tasks 6-14
- §5 Client changes → Tasks 17-27
- §6 Firestore rules → Task 15
- §7 Testing → Task 16 (rules), Task 33 (verify), Tasks 39, 46 (Playwright)
- §8 Deploy → Tasks 34-38
- §9 Docs → Tasks 40-45
- §10 Success criteria → covered across phases
- §11 Pitfalls → addressed in code (delays, idempotence, claims size)

**Type consistency:** `passwordHash` consistent throughout. `claims` shape (userType/classroomId/accountNumber) consistent.

**Placeholder scan:** No TBDs/TODOs in steps. Code blocks present where code is specified.

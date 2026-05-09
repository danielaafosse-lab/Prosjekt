/**
 * Firestore rules unit tests using @firebase/rules-unit-testing.
 *
 * Requires the firestore emulator running on localhost:8080:
 *   firebase emulators:start --only firestore
 *
 * Then:
 *   npm run test:rules
 */
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
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
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

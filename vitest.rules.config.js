/**
 * Separate vitest config for Firestore rule tests.
 *
 * Rule tests require the firestore emulator running on localhost:8080.
 * Start it with: firebase emulators:start --only firestore
 * Then run:      npm run test:rules
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/firestore-rules.test.js'],
    globals: false,
    testTimeout: 15000,
  },
});

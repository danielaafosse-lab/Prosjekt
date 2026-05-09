/**
 * Enables Firebase Authentication / Identity Platform for the project.
 * This is the equivalent of clicking "Get Started" in the Firebase Console
 * Authentication tab.
 *
 * Steps:
 *   1. Enable identitytoolkit.googleapis.com via Service Usage API
 *   2. Initialize Identity Toolkit config (creates default config)
 *
 * Run once:  node scripts/enable-identity-platform.cjs
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const PROJECT_ID = 'econsim-5723c';

function loadFirebaseTokens() {
  return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
}

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const req = https.request({
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const cfg = loadFirebaseTokens();
  const accessToken = cfg.tokens.access_token;
  const auth = { Authorization: `Bearer ${accessToken}` };

  console.log('[1/3] Enabling identitytoolkit.googleapis.com API...');
  const enableRes = await request(
    'POST',
    `https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services/identitytoolkit.googleapis.com:enable`,
    {},
    auth
  );
  console.log('  Status:', enableRes.status);
  if (enableRes.status !== 200 && enableRes.status !== 409) {
    console.log('  Body:', JSON.stringify(enableRes.body));
  } else {
    console.log('  ✓ API enabled (or was already enabled)');
  }

  console.log('[2/3] Waiting 15s for API enablement to propagate...');
  await new Promise(r => setTimeout(r, 15000));

  console.log('[3/3] Initializing Identity Platform default config...');
  // First, check if config already exists
  const getRes = await request(
    'GET',
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`,
    null,
    auth
  );
  if (getRes.status === 200) {
    console.log('  ✓ Identity Platform config already exists');
    console.log('  Authorized domains:', getRes.body.authorizedDomains);
    return;
  }

  // Initialize via Firebase Identity Toolkit Admin API
  const initRes = await request(
    'POST',
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth`,
    {},
    auth
  );
  console.log('  Status:', initRes.status);
  if (initRes.status === 200) {
    console.log('  ✓ Identity Platform initialized');
  } else {
    console.log('  Body:', JSON.stringify(initRes.body));
  }
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });

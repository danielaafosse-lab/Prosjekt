/**
 * One-time fix for "Permission iam.serviceAccounts.signBlob denied" when
 * authenticateUser Cloud Function calls admin.auth().createCustomToken().
 *
 * Grants `roles/iam.serviceAccountTokenCreator` to the App Engine default
 * service account at project level. Equivalent to:
 *   gcloud projects add-iam-policy-binding econsim-5723c \
 *     --member=serviceAccount:econsim-5723c@appspot.gserviceaccount.com \
 *     --role=roles/iam.serviceAccountTokenCreator
 *
 * Uses the firebase-tools OAuth refresh token to call Cloud Resource Manager API.
 *
 * Run once:  node scripts/grant-token-creator.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const PROJECT_ID = 'econsim-5723c';
const MEMBER = `serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com`;
const ROLE = 'roles/iam.serviceAccountTokenCreator';

const FIREBASE_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZneDPdvyzGna3aaT2F8Z'; // public OAuth client secret used by firebase-tools

function loadFirebaseTokens() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      method: 'POST',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const result = await postJson(
    'https://oauth2.googleapis.com/token',
    params.toString(),
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  );
  if (result.status !== 200) {
    throw new Error(`Token refresh failed: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body.access_token;
}

async function main() {
  const cfg = loadFirebaseTokens();
  if (!cfg.tokens?.access_token) {
    throw new Error('No firebase-tools access_token found. Run "firebase login" first.');
  }

  console.log('[1/4] Using cached firebase-tools access token (expires:', new Date(cfg.tokens.expires_at).toISOString(), ')');
  const accessToken = cfg.tokens.access_token;

  console.log('[2/4] Fetching current IAM policy...');
  const policyRes = await postJson(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:getIamPolicy`,
    {},
    { Authorization: `Bearer ${accessToken}` }
  );
  if (policyRes.status !== 200) {
    throw new Error(`getIamPolicy failed: ${policyRes.status} ${JSON.stringify(policyRes.body)}`);
  }
  const policy = policyRes.body;
  console.log('  Current policy version:', policy.version, 'bindings:', policy.bindings?.length || 0);

  // Check if binding already exists
  let binding = (policy.bindings || []).find(b => b.role === ROLE);
  if (binding && binding.members?.includes(MEMBER)) {
    console.log(`[3/4] ✓ Binding already exists: ${MEMBER} -> ${ROLE}`);
    console.log('[4/4] No changes needed.');
    return;
  }

  console.log(`[3/4] Adding binding: ${MEMBER} -> ${ROLE}`);
  if (binding) {
    binding.members = [...new Set([...binding.members, MEMBER])];
  } else {
    policy.bindings = policy.bindings || [];
    policy.bindings.push({ role: ROLE, members: [MEMBER] });
  }

  const setRes = await postJson(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:setIamPolicy`,
    { policy },
    { Authorization: `Bearer ${accessToken}` }
  );
  if (setRes.status !== 200) {
    throw new Error(`setIamPolicy failed: ${setRes.status} ${JSON.stringify(setRes.body)}`);
  }
  console.log('[4/4] ✓ IAM policy updated. Token Creator role granted.');
  console.log('Note: Allow ~30 seconds for propagation before retrying authenticateUser.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});

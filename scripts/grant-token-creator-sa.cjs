/**
 * Grants roles/iam.serviceAccountTokenCreator on the service account itself
 * (not just at project level) — this is what admin.auth().createCustomToken needs.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const PROJECT_ID = 'econsim-5723c';
const SA_EMAIL = `${PROJECT_ID}@appspot.gserviceaccount.com`;
const MEMBER = `serviceAccount:${SA_EMAIL}`;
const ROLE = 'roles/iam.serviceAccountTokenCreator';

function loadFirebaseTokens() {
  const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
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
  const saUrl = `https://iam.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccounts/${SA_EMAIL}`;

  console.log(`[1/3] Fetching IAM policy on service account ${SA_EMAIL}...`);
  const policyRes = await request('POST', `${saUrl}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } }, auth);
  if (policyRes.status !== 200) {
    throw new Error(`getIamPolicy failed: ${policyRes.status} ${JSON.stringify(policyRes.body)}`);
  }
  const policy = policyRes.body;
  console.log('  Current bindings:', (policy.bindings || []).length);

  let binding = (policy.bindings || []).find(b => b.role === ROLE);
  if (binding && binding.members?.includes(MEMBER)) {
    console.log(`[2/3] ✓ Binding already exists on SA: ${MEMBER} -> ${ROLE}`);
    console.log('[3/3] No changes needed.');
    return;
  }

  console.log(`[2/3] Adding binding on SA: ${MEMBER} -> ${ROLE}`);
  if (binding) {
    binding.members = [...new Set([...binding.members, MEMBER])];
  } else {
    policy.bindings = policy.bindings || [];
    policy.bindings.push({ role: ROLE, members: [MEMBER] });
  }

  const setRes = await request('POST', `${saUrl}:setIamPolicy`, { policy }, auth);
  if (setRes.status !== 200) {
    throw new Error(`setIamPolicy failed: ${setRes.status} ${JSON.stringify(setRes.body)}`);
  }
  console.log('[3/3] ✓ IAM policy on service account updated.');
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1); });

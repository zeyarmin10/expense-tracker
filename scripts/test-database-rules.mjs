// Behavior tests for database.rules.json, run against the local emulator.
//
// Usage:
//   Terminal 1: npm run emulators
//   Terminal 2: npm run test:rules
//
// Mirrors the app's real write flows: owner creates a space (spaces record
// first, then membership) → invites a member → member joins with the
// inviteCode → accepts the invitation. Then verifies attackers cannot
// escalate, enumerate, or read other users' data.
const NS = 'demo-expense-tracker-default-rtdb';
const DB = 'http://127.0.0.1:9000';
const AUTH = 'http://127.0.0.1:9099';

async function signUp(email) {
  const r = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test1234', returnSecureToken: true }),
    },
  ).then((x) => x.json());
  if (!r.idToken) {
    throw new Error(`signUp failed — is the emulator running? (${JSON.stringify(r).slice(0, 120)})`);
  }
  return { token: r.idToken, uid: r.localId, email };
}

let pass = 0;
let fail = 0;

async function req(label, expectOk, method, pathAndQuery, body, user) {
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `${DB}${pathAndQuery}${sep}ns=${NS}${user ? `&auth=${user.token}` : ''}`;
  const res = await fetch(url, { method, body: body !== undefined ? JSON.stringify(body) : undefined });
  const ok = res.status === 200;
  const verdict = ok === expectOk ? 'PASS' : '** FAIL **';
  if (ok === expectOk) pass++; else fail++;
  console.log(`${verdict}  ${label}  (HTTP ${res.status}, expected ${expectOk ? '200' : 'denied'})`);
}

try {
  await fetch(`${DB}/.json?ns=${NS}`);
} catch {
  console.error('Cannot reach the database emulator at ' + DB);
  console.error('Start it first: npm run emulators');
  process.exit(1);
}

const O = await signUp(`owner-${Date.now()}@example.com`);
const M = await signUp(`member-${Date.now()}@example.com`);
const A = await signUp(`attacker-${Date.now()}@example.com`);
const s1 = `space-${Date.now()}`;
const inv = `inv-${Date.now()}`;

console.log('--- Space creation (app flow: spaces first, then membership) ---');
await req('owner creates space record', true, 'PUT', `/spaces/${s1}.json`, { type: 'group', name: 'Test Group', ownerId: O.uid, currency: 'MMK' }, O);
await req('owner self-membership as owner', true, 'PUT', `/space_members/${s1}/${O.uid}.json`, { role: 'owner' }, O);
await req('attacker cannot create space owned by owner', false, 'PUT', `/spaces/steal-${s1}.json`, { type: 'group', name: 'X', ownerId: O.uid, currency: 'MMK' }, A);

console.log('--- Membership escalation attempts ---');
await req('attacker self-join as owner', false, 'PUT', `/space_members/${s1}/${A.uid}.json`, { role: 'owner' }, A);
await req('attacker self-join as member (no invite)', false, 'PUT', `/space_members/${s1}/${A.uid}.json`, { role: 'member' }, A);
await req('attacker self-join with fake inviteCode', false, 'PUT', `/space_members/${s1}/${A.uid}.json`, { role: 'member', inviteCode: 'nope' }, A);

console.log('--- Invitation + join (app flow) ---');
await req('owner creates invitation', true, 'PUT', `/invitations/${inv}.json`, { email: M.email, groupId: s1, status: 'pending', createdAt: new Date().toISOString() }, O);
await req('attacker cannot join with member invite', false, 'PUT', `/space_members/${s1}/${A.uid}.json`, { role: 'member', inviteCode: inv }, A);
await req('invited member joins with inviteCode', true, 'PUT', `/space_members/${s1}/${M.uid}.json`, { role: 'member', inviteCode: inv }, M);
await req('member accepts invitation', true, 'PATCH', `/invitations/${inv}.json`, { status: 'accepted', acceptedBy: M.uid, acceptedAt: new Date().toISOString() }, M);

console.log('--- Root / collection reads ---');
await req('attacker reads root', false, 'GET', '/.json', undefined, A);
await req('attacker reads /users', false, 'GET', '/users.json', undefined, A);
await req('unauthenticated reads root', false, 'GET', '/.json', undefined, null);

console.log('--- User profile reads (same-space only) ---');
await req('owner writes own profile', true, 'PUT', `/users/${O.uid}.json`, { displayName: 'Owner', email: O.email, currentSpaceId: s1 }, O);
await req('member writes own profile', true, 'PUT', `/users/${M.uid}.json`, { displayName: 'Member', email: M.email, currentSpaceId: s1 }, M);
await req('member reads owner profile (shared space)', true, 'GET', `/users/${O.uid}.json`, undefined, M);
await req('attacker points own currentSpaceId at s1', true, 'PUT', `/users/${A.uid}.json`, { displayName: 'A', currentSpaceId: s1 }, A);
await req('attacker still cannot read owner profile', false, 'GET', `/users/${O.uid}.json`, undefined, A);

console.log('--- Invitation queries ---');
await req('owner queries invitations by own groupId', true, 'GET', `/invitations.json?orderBy=%22groupId%22&equalTo=%22${s1}%22`, undefined, O);
await req('attacker queries invitations by that groupId', false, 'GET', `/invitations.json?orderBy=%22groupId%22&equalTo=%22${s1}%22`, undefined, A);
await req('owner cannot read full invitations list', false, 'GET', '/invitations.json', undefined, O);
await req('member reads single invitation by code', true, 'GET', `/invitations/${inv}.json`, undefined, M);

console.log('--- Space data access ---');
await req('member writes space_data expense', true, 'PUT', `/space_data/${s1}/expenses/e1.json`, { date: '2026-07-18', category: 'food', totalCost: 5000, currency: 'MMK' }, M);
await req('member reads space_data', true, 'GET', `/space_data/${s1}.json`, undefined, M);
await req('attacker reads space_data', false, 'GET', `/space_data/${s1}.json`, undefined, A);
await req('attacker writes space_data', false, 'PUT', `/space_data/${s1}/expenses/x.json`, { totalCost: 1 }, A);

console.log('--- Admin management + leave ---');
await req('owner promotes member to admin', true, 'PUT', `/space_members/${s1}/${M.uid}.json`, { role: 'admin' }, O);
await req('member (admin) demotes self back', true, 'PUT', `/space_members/${s1}/${M.uid}.json`, { role: 'member', inviteCode: inv }, M);
await req('member leaves space (self-delete)', true, 'DELETE', `/space_members/${s1}/${M.uid}.json`, undefined, M);

console.log('--- Personal space flow (app flow) ---');
const p1 = `personal-${Date.now()}`;
await req('user creates personal space', true, 'PUT', `/spaces/${p1}.json`, { type: 'personal', name: 'My Personal', ownerId: A.uid, currency: 'MMK' }, A);
await req('user self-membership as owner of own personal space', true, 'PUT', `/space_members/${p1}/${A.uid}.json`, { role: 'owner' }, A);
await req('user writes own personal space_data', true, 'PUT', `/space_data/${p1}/expenses/e1.json`, { date: '2026-07-18', totalCost: 100 }, A);

console.log('--- appConfig ---');
await req('authenticated reads appConfig', true, 'GET', '/appConfig.json', undefined, O);
await req('authenticated cannot write appConfig', false, 'PUT', '/appConfig/android/latestVersionCode.json', 99, O);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

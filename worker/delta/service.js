// CartoVox Delta service: a Cloudflare Worker over a D1 database.
//
// The desktop app (desktop/delta_access/service.py) calls two routes:
//   POST /v1/activate  register a computer under an access code's digest
//   POST /v1/events    a batch of usage events (empty = a check-in)
// Every answer carries the code's status, which is how a code is revoked.
//
// The owner reads the results at /admin (a page that asks for the admin
// token) or through /v1/admin/report; /v1/admin/codes/<slot> revokes,
// restores or changes how many computers a code may unlock.

import CODES from './codes.js';

const KINDS = new Set(['session', 'feature', 'error', 'perf']);

// The tables, one statement each (D1 runs a batch of prepared statements).
// Applied on the first request an isolate serves; every statement is
// idempotent, so it costs nothing once the database exists.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS codes (
    digest TEXT PRIMARY KEY, slot TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    max_installs INTEGER NOT NULL DEFAULT 3, note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))`,
  `CREATE TABLE IF NOT EXISTS installs (
    id TEXT PRIMARY KEY, slot TEXT NOT NULL REFERENCES codes(slot), token_hash TEXT NOT NULL,
    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, app_version TEXT, release TEXT,
    os TEXT, os_version TEXT, arch TEXT, cpu_count INTEGER, memory_gb REAL,
    event_count INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS installs_slot ON installs(slot)',
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, install_id TEXT NOT NULL, slot TEXT NOT NULL,
    at TEXT NOT NULL, received_at TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
    session TEXT, props TEXT)`,
  'CREATE INDEX IF NOT EXISTS events_slot_at ON events(slot, at)',
  'CREATE INDEX IF NOT EXISTS events_kind_name ON events(kind, name)',
  'CREATE INDEX IF NOT EXISTS events_install_received ON events(install_id, received_at)',
];

const readiness = new WeakMap();

// Tables, then every issued code (desktop/delta_access/issuer.py writes
// codes.js). INSERT OR IGNORE never brings a withdrawn code back.
export async function ensureReady(env) {
  let ready = readiness.get(env.DB);
  if (!ready) {
    ready = (async () => {
      await env.DB.batch(SCHEMA.map(sql => env.DB.prepare(sql)));
      const rows = Object.entries(CODES.codes || {});
      for (let i = 0; i < rows.length; i += 50) {
        await env.DB.batch(rows.slice(i, i + 50).map(([digest, slot]) => env.DB.prepare(
          'INSERT OR IGNORE INTO codes (digest, slot, max_installs) VALUES (?, ?, ?)')
          .bind(digest, slot, Number(CODES.max_installs || 3))));
      }
    })().catch(error => { readiness.delete(env.DB); throw error; });
    readiness.set(env.DB, ready);
  }
  return ready;
}
const HEX32 = /^[0-9a-f]{32}$/;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS = 400;
const MAX_PROPS_BYTES = 6000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameText(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return [null, json({ error: 'That batch is too large.' }, 413)];
  try {
    const body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return [body, null];
  } catch (_error) {
    return [null, json({ error: 'The request was not valid JSON.' }, 400)];
  }
}

function clip(value, length) {
  return typeof value === 'string' ? value.slice(0, length) : null;
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function activate(request, env) {
  const [body, failure] = await readJson(request);
  if (failure) return failure;
  const digest = String(body.digest || '');
  const installId = String(body.install_id || '');
  if (!HEX32.test(digest) || !HEX32.test(installId)) {
    return json({ error: 'That request did not come from CartoVox.' }, 400);
  }
  const code = await env.DB.prepare('SELECT slot, status, max_installs FROM codes WHERE digest = ?')
    .bind(digest).first();
  if (!code) return json({ error: 'That access code is not recognised.', status: 'unknown' }, 403);
  if (code.status === 'revoked') {
    return json({ error: 'This access code has been withdrawn. Ask the project owner for a new one.',
      status: 'revoked' }, 403);
  }
  const existing = await env.DB.prepare('SELECT slot FROM installs WHERE id = ?').bind(installId).first();
  if (!existing || existing.slot !== code.slot) {
    const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM installs WHERE slot = ?')
      .bind(code.slot).first();
    if ((used?.n || 0) >= code.max_installs) {
      return json({ error: `This access code has already unlocked ${code.max_installs} computers. `
        + 'Ask the project owner to free one.', status: 'limit' }, 403);
    }
  }
  const token = randomHex(32);
  const facts = body.facts && typeof body.facts === 'object' ? body.facts : {};
  const stamp = now();
  await env.DB.prepare(`INSERT INTO installs (id, slot, token_hash, first_seen, last_seen, app_version,
      release, os, os_version, arch, cpu_count, memory_gb)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET slot = excluded.slot, token_hash = excluded.token_hash,
      last_seen = excluded.last_seen, app_version = excluded.app_version, release = excluded.release,
      os = excluded.os, os_version = excluded.os_version, arch = excluded.arch,
      cpu_count = excluded.cpu_count, memory_gb = excluded.memory_gb`)
    .bind(installId, code.slot, await sha256(token), stamp, stamp, clip(facts.app_version, 40),
      clip(facts.release, 40), clip(facts.os, 40), clip(facts.os_version, 80), clip(facts.arch, 40),
      number(facts.cpu_count), number(facts.memory_gb))
    .run();
  return json({ ok: true, token, slot: code.slot, status: 'active' });
}

async function events(request, env) {
  const [body, failure] = await readJson(request);
  if (failure) return failure;
  const installId = String(body.install_id || '');
  if (!HEX32.test(installId) || typeof body.token !== 'string') {
    return json({ error: 'That request did not come from CartoVox.', status: 'unknown_install' }, 401);
  }
  const install = await env.DB.prepare(`SELECT installs.slot, installs.token_hash, codes.status
      FROM installs JOIN codes ON codes.slot = installs.slot WHERE installs.id = ?`)
    .bind(installId).first();
  if (!install || !sameText(install.token_hash, await sha256(body.token))) {
    return json({ error: 'This computer is not registered for Delta.', status: 'unknown_install' }, 401);
  }
  if (install.status === 'revoked') {
    return json({ error: 'This access code has been withdrawn.', status: 'revoked' }, 403);
  }
  const batch = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const stamp = now();
  const since = new Date(Date.now() - 86400000).toISOString();
  const today = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM events WHERE install_id = ? AND received_at >= ?')
    .bind(installId, since).first();
  const room = Math.max(0, Number(env.DAILY_EVENT_LIMIT || 20000) - (today?.n || 0));
  const statements = [];
  let session = null;
  for (const event of batch.slice(0, room)) {
    if (!event || typeof event !== 'object' || !KINDS.has(event.k) || typeof event.n !== 'string') continue;
    const props = JSON.stringify(event.p && typeof event.p === 'object' ? event.p : {});
    if (props.length > MAX_PROPS_BYTES) continue;
    if (event.k === 'session' && event.n === 'start') session = event.p || {};
    statements.push(env.DB.prepare(`INSERT INTO events (install_id, slot, at, received_at, kind, name,
        session, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(installId, install.slot, clip(event.t, 40) || stamp, stamp, event.k,
        event.n.slice(0, 120), clip(event.s, 40), props));
  }
  statements.push(env.DB.prepare(`UPDATE installs SET last_seen = ?, event_count = event_count + ?,
      app_version = COALESCE(?, app_version), release = COALESCE(?, release) WHERE id = ?`)
    .bind(stamp, statements.length, clip(session?.app_version, 40), clip(session?.release, 40), installId));
  await env.DB.batch(statements);
  return json({ ok: true, status: 'active', accepted: statements.length - 1 });
}

function authorised(request, env) {
  // Both sides trimmed: a secret pasted with a trailing line break or space
  // could never match a header, and the owner saw only "Not authorised".
  const token = String(env.ADMIN_TOKEN || '').trim();
  const header = (request.headers.get('authorization') || '').trim();
  return Boolean(token) && sameText(header, `Bearer ${token}`);
}

async function report(env) {
  const rows = async (sql, ...binds) => (await env.DB.prepare(sql).bind(...binds).all()).results || [];
  const testers = await rows(`SELECT codes.slot, codes.status, codes.max_installs,
      COUNT(DISTINCT installs.id) AS computers, MAX(installs.last_seen) AS last_seen,
      MAX(installs.app_version) AS app_version, GROUP_CONCAT(DISTINCT installs.os) AS os,
      (SELECT COUNT(*) FROM events WHERE events.slot = codes.slot AND kind = 'session'
        AND name = 'start') AS sessions,
      (SELECT ROUND(COALESCE(SUM(json_extract(props, '$.seconds')), 0) / 3600.0, 1) FROM events
        WHERE events.slot = codes.slot AND kind = 'session' AND name = 'end') AS hours,
      (SELECT COUNT(*) FROM events WHERE events.slot = codes.slot AND kind = 'error') AS errors
    FROM codes LEFT JOIN installs ON installs.slot = codes.slot
    GROUP BY codes.slot ORDER BY codes.slot`);
  const features = await rows(`SELECT feature.key AS name, SUM(feature.value) AS uses,
      COUNT(DISTINCT events.slot) AS testers
    FROM events, json_each(events.props, '$.counts') AS feature
    WHERE events.kind = 'feature' AND events.name = 'counts'
    GROUP BY feature.key ORDER BY uses DESC LIMIT 80`);
  const performance = await rows(`SELECT name, COUNT(*) AS runs,
      ROUND(AVG(json_extract(props, '$.seconds')), 1) AS mean_seconds,
      ROUND(MAX(json_extract(props, '$.seconds')), 1) AS longest_seconds,
      ROUND(MAX(json_extract(props, '$.peak_rss_mb')), 0) AS peak_mb,
      SUM(json_extract(props, '$.status') != 'completed') AS unfinished
    FROM events WHERE kind = 'perf' GROUP BY name ORDER BY runs DESC`);
  const errors = await rows(`SELECT slot, at, name, json_extract(props, '$.type') AS type,
      json_extract(props, '$.message') AS message, json_extract(props, '$.stack') AS stack
    FROM events WHERE kind = 'error' ORDER BY id DESC LIMIT 60`);
  const systems = await rows(`SELECT os, arch, app_version, COUNT(*) AS computers
    FROM installs GROUP BY os, arch, app_version ORDER BY computers DESC`);
  return { generated_at: now(), testers, features, performance, errors, systems };
}

async function admin(request, env, path) {
  // Say which: a secret that never reached the Worker and a wrong password
  // both used to read "Not authorised", and the two need different fixes.
  if (!String(env.ADMIN_TOKEN || '').trim()) {
    return json({ error: 'The admin password (ADMIN_TOKEN) is not set on this service.' }, 503);
  }
  if (!authorised(request, env)) return json({ error: 'Not authorised.' }, 401);
  if (request.method === 'GET' && path === '/v1/admin/report') return json(await report(env));
  const match = path.match(/^\/v1\/admin\/codes\/(D-\d{3,5})$/);
  if (request.method === 'POST' && match) {
    const [body, failure] = await readJson(request);
    if (failure) return failure;
    const updates = [];
    if (body.status === 'active' || body.status === 'revoked') {
      updates.push(env.DB.prepare('UPDATE codes SET status = ? WHERE slot = ?').bind(body.status, match[1]));
    }
    if (Number.isInteger(body.max_installs) && body.max_installs >= 0 && body.max_installs <= 50) {
      updates.push(env.DB.prepare('UPDATE codes SET max_installs = ? WHERE slot = ?')
        .bind(body.max_installs, match[1]));
    }
    if (body.free_computers === true) {
      updates.push(env.DB.prepare('DELETE FROM installs WHERE slot = ?').bind(match[1]));
    }
    if (!updates.length) return json({ error: 'Nothing to change.' }, 400);
    await env.DB.batch(updates);
    const code = await env.DB.prepare('SELECT slot, status, max_installs FROM codes WHERE slot = ?')
      .bind(match[1]).first();
    return code ? json({ ok: true, code }) : json({ error: 'No such code.' }, 404);
  }
  return json({ error: 'Not found.' }, 404);
}

const ADMIN_HEADERS = {
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; "
    + "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>CartoVox Delta report</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;background:#111317;color:#e9e4da}
h1{font:600 26px Georgia,serif;color:#e9c46a}h2{margin-top:28px;color:#e9c46a;font-size:16px}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border-bottom:1px solid #343943;
padding:5px 8px;text-align:left;vertical-align:top}th{color:#aeb5c1;font-weight:600}
input,button{font:inherit;padding:6px 10px;border-radius:6px;border:1px solid #464d59;background:#0e1014;
color:#e9e4da}button{background:#e9c46a;color:#17140d;border:0}code{font-size:12px;color:#aeb5c1;
white-space:pre-wrap}</style></head><body><h1>CartoVox Delta report</h1>
<form id="f"><input id="t" type="password" placeholder="Admin token" size="40" autocomplete="current-password">
<button>Load report</button></form><div id="out"></div>
<script src="/admin/script"></script></body></html>`;

const ADMIN_SCRIPT = `const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function table(rows){if(!rows.length)return'<p>Nothing yet.</p>';const keys=Object.keys(rows[0]);
return'<table><tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+keys.map(k=>
'<td>'+(k==='stack'?'<code>'+esc(r[k])+'</code>':esc(r[k]))+'</td>').join('')+'</tr>').join('')+'</table>';}
document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();
const r=await fetch('/v1/admin/report',{headers:{authorization:'Bearer '+document.getElementById('t').value.trim()}});
const d=await r.json();const out=document.getElementById('out');
if(!r.ok){out.textContent=d.error;return;}
out.innerHTML='<p>Generated '+esc(d.generated_at)+'</p>'
+'<h2>Testers</h2>'+table(d.testers)+'<h2>Most used features</h2>'+table(d.features)
+'<h2>Performance</h2>'+table(d.performance)+'<h2>Latest errors</h2>'+table(d.errors)
+'<h2>Computers</h2>'+table(d.systems);});`;

export async function handle(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      await ensureReady(env);
      if (request.method === 'GET' && path === '/v1/health') return json({ ok: true });
      if (request.method === 'POST' && path === '/v1/activate') return await activate(request, env);
      if (request.method === 'POST' && path === '/v1/events') return await events(request, env);
      if (path.startsWith('/v1/admin/')) return await admin(request, env, path);
      if (request.method === 'GET' && path === '/admin') {
        return new Response(ADMIN_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8',
          ...ADMIN_HEADERS } });
      }
      if (request.method === 'GET' && path === '/admin/script') {
        return new Response(ADMIN_SCRIPT, { headers: {
          'content-type': 'application/javascript; charset=utf-8', ...ADMIN_HEADERS } });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: 'The Delta service could not complete that request.' }, 500);
    }
}

export default { fetch: handle };

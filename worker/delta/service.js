// CartoVox Delta service: a Cloudflare Worker over a D1 database.
//
// The desktop app (desktop/delta_access/service.py) calls two routes:
//   POST /v1/activate  register a computer under an access code's digest
//   POST /v1/events    a batch of usage events (empty = a check-in)
// Every answer carries the code's status, which is how a code is revoked.
//
// The owner reads the results at /admin (the dashboard in admin.js, which
// asks for the admin token once) or through /v1/admin/report;
// /v1/admin/codes/<slot> revokes, restores or changes how many computers a
// code may unlock.

import { ADMIN_HEADERS, ADMIN_PAGE, ADMIN_SCRIPT } from './admin.js';
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
  'CREATE INDEX IF NOT EXISTS events_at ON events(at)',
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

const DAY_MS = 86400000;
const SLOT = /^D-\d{3,5}$/;

// ?days=7|30|90 (anything else: all time), ?tz=<minutes east of UTC> for the
// owner's own calendar days, ?exclude=D-051,... to leave test codes out.
export function reportOptions(url) {
  const days = [7, 30, 90].includes(Number(url.searchParams.get('days')))
    ? Number(url.searchParams.get('days')) : 0;
  const tz = Number(url.searchParams.get('tz') || 0);
  const exclude = (url.searchParams.get('exclude') || '').split(',')
    .map(slot => slot.trim()).filter(slot => SLOT.test(slot)).slice(0, 20);
  return { days, tz: Number.isInteger(tz) && Math.abs(tz) <= 840 ? tz : 0, exclude };
}

// Event times are UTC ISO strings from the app ("2026-09-24T12:00:00+00:00"),
// so a bare "YYYY-MM-DDTHH:MM:SS" bound compares correctly as text and the
// events_at index keeps a ranged report from reading the whole table.
function stamp(ms) {
  return new Date(ms).toISOString().slice(0, 19);
}

function localDay(ms, tz) {
  return new Date(ms + tz * 60000).toISOString().slice(0, 10);
}

function round(value, places = 1) {
  const scale = 10 ** places;
  return Math.round((Number(value) || 0) * scale) / scale;
}

async function report(env, { days = 0, tz = 0, exclude = [] } = {}) {
  const rows = async (sql, ...binds) => (await env.DB.prepare(sql).bind(...binds).all()).results || [];
  const nowMs = Date.now();
  const todayStart = Date.parse(`${localDay(nowMs, tz)}T00:00:00Z`) - tz * 60000;
  const sinceMs = days ? todayStart - (days - 1) * DAY_MS : null;
  const since = days ? stamp(sinceMs) : '0000';
  const until = '9999';
  const shift = `${tz >= 0 ? '+' : ''}${tz} minutes`;
  const skipped = new Set(exclude);
  const notIn = exclude.length ? `slot NOT IN (${exclude.map(() => '?').join(', ')})` : '1 = 1';

  // One pass over the range does the totals, the days, each tester's
  // activity, the performance table and the hour-of-week grid. Feature rows
  // ("counts", flushed once a minute while someone clicks) are the bulk of
  // the table, so they are also the measure of active minutes.
  const rollup = await rows(`SELECT slot, date(at, ?) AS day,
      CASE WHEN kind = 'feature' THEN CAST(strftime('%H', at, ?) AS INTEGER) END AS hour,
      kind, CASE WHEN kind IN ('session', 'perf') THEN name ELSE '' END AS name,
      COUNT(*) AS n, COUNT(DISTINCT install_id) AS computers,
      SUM(json_extract(props, '$.seconds')) AS seconds,
      MAX(json_extract(props, '$.seconds')) AS longest,
      MAX(json_extract(props, '$.peak_rss_mb')) AS peak,
      SUM(kind = 'perf' AND COALESCE(json_extract(props, '$.status'), '') != 'completed') AS failed,
      MAX(at) AS last_at
    FROM events WHERE at >= ? AND at < ? AND ${notIn}
    GROUP BY slot, day, hour, kind, 5`, shift, shift, since, until, ...exclude);

  const totals = { testers: 0, computers: 0, sessions: 0, hours: 0, errors: 0, runs: 0,
    failed_runs: 0, active_minutes: 0 };
  const byDay = new Map();
  const bySlot = new Map();
  const byJob = new Map();
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const activeSlots = new Set();
  for (const row of rollup) {
    if (!row.day) continue;
    activeSlots.add(row.slot);
    const day = byDay.get(row.day) || { day: row.day, slots: new Set(), sessions: 0, seconds: 0,
      errors: 0, runs: 0, failed: 0, active_minutes: 0 };
    byDay.set(row.day, day);
    day.slots.add(row.slot);
    const tester = bySlot.get(row.slot) || { sessions: 0, seconds: 0, errors: 0, runs: 0,
      active_minutes: 0, last_event: '', days: {} };
    bySlot.set(row.slot, tester);
    if (row.last_at > tester.last_event) tester.last_event = row.last_at;
    if (row.kind === 'session' && row.name === 'start') {
      day.sessions += row.n; tester.sessions += row.n;
    } else if (row.kind === 'session' && row.name === 'end') {
      day.seconds += row.seconds || 0; tester.seconds += row.seconds || 0;
    } else if (row.kind === 'error') {
      day.errors += row.n; tester.errors += row.n;
    } else if (row.kind === 'perf') {
      day.runs += row.n; day.failed += row.failed || 0; tester.runs += row.n;
      totals.failed_runs += row.failed || 0;
      const job = byJob.get(row.name) || { name: row.name, runs: 0, seconds: 0, longest: 0, peak: null,
        unfinished: 0, slots: new Set() };
      byJob.set(row.name, job);
      job.runs += row.n; job.seconds += row.seconds || 0; job.unfinished += row.failed || 0;
      job.longest = Math.max(job.longest, row.longest || 0);
      if (row.peak != null) job.peak = Math.max(job.peak || 0, row.peak);
      job.slots.add(row.slot);
    } else if (row.kind === 'feature') {
      day.active_minutes += row.n; tester.active_minutes += row.n;
      tester.days[row.day] = (tester.days[row.day] || 0) + row.n;
      if (row.hour != null) heatmap[new Date(`${row.day}T00:00:00Z`).getUTCDay()][row.hour] += row.n;
    }
  }
  for (const day of byDay.values()) {
    totals.sessions += day.sessions; totals.hours += day.seconds / 3600; totals.errors += day.errors;
    totals.runs += day.runs; totals.active_minutes += day.active_minutes;
  }
  totals.testers = activeSlots.size;
  totals.hours = round(totals.hours);

  // Every calendar day in the range, empty ones included, so a quiet day
  // reads as zero instead of vanishing from the chart.
  const today = localDay(nowMs, tz);
  const first = days ? localDay(sinceMs, tz) : ([...byDay.keys()].sort()[0] || today);
  const firstMs = Math.max(Date.parse(`${first}T00:00:00Z`),
    Date.parse(`${today}T00:00:00Z`) - 399 * DAY_MS);
  const daily = [];
  for (let ms = firstMs; ms <= Date.parse(`${today}T00:00:00Z`); ms += DAY_MS) {
    const key = new Date(ms).toISOString().slice(0, 10);
    const day = byDay.get(key);
    daily.push({ day: key, testers: day ? day.slots.size : 0, sessions: day?.sessions || 0,
      hours: round((day?.seconds || 0) / 3600, 2), errors: day?.errors || 0, runs: day?.runs || 0,
      failed: day?.failed || 0, active_minutes: day?.active_minutes || 0 });
  }

  let previous = null;
  if (days) {
    const [before] = await rows(`SELECT COUNT(DISTINCT slot) AS testers,
        COALESCE(SUM(kind = 'session' AND name = 'start'), 0) AS sessions,
        ROUND(COALESCE(SUM(CASE WHEN kind = 'session' AND name = 'end'
          THEN json_extract(props, '$.seconds') END), 0) / 3600.0, 1) AS hours,
        COALESCE(SUM(kind = 'error'), 0) AS errors, COALESCE(SUM(kind = 'perf'), 0) AS runs,
        COALESCE(SUM(kind = 'feature' AND name = 'counts'), 0) AS active_minutes
      FROM events WHERE at >= ? AND at < ? AND ${notIn}`,
    stamp(sinceMs - days * DAY_MS), since, ...exclude);
    previous = before || null;
  }

  const codes = (await rows(`SELECT codes.slot, codes.status, codes.max_installs,
      COUNT(installs.id) AS computers, MAX(installs.last_seen) AS last_seen,
      MIN(installs.first_seen) AS first_seen, MAX(installs.app_version) AS app_version,
      GROUP_CONCAT(DISTINCT installs.os) AS os
    FROM codes LEFT JOIN installs ON installs.slot = codes.slot
    GROUP BY codes.slot ORDER BY codes.slot`)).filter(code => !skipped.has(code.slot));
  const testers = codes.map(code => {
    const seen = bySlot.get(code.slot);
    return { ...code, sessions: seen?.sessions || 0, hours: round((seen?.seconds || 0) / 3600),
      errors: seen?.errors || 0, runs: seen?.runs || 0, active_minutes: seen?.active_minutes || 0,
      last_event: seen?.last_event || null, days: seen?.days || {} };
  });
  totals.codes_issued = codes.length;
  totals.codes_activated = codes.filter(code => code.computers > 0).length;
  totals.codes_revoked = codes.filter(code => code.status === 'revoked').length;

  const machines = (await rows(`SELECT slot, os, os_version, arch, cpu_count, memory_gb, app_version,
      release, first_seen, last_seen FROM installs ORDER BY last_seen DESC`))
    .filter(machine => !skipped.has(machine.slot));
  totals.computers = machines.filter(machine => machine.last_seen >= since).length;
  const systems = [];
  for (const machine of machines) {
    const found = systems.find(row => row.os === machine.os && row.arch === machine.arch
      && row.app_version === machine.app_version);
    if (found) found.computers += 1;
    else systems.push({ os: machine.os, arch: machine.arch, app_version: machine.app_version, computers: 1 });
  }
  systems.sort((a, b) => b.computers - a.computers);

  const features = await rows(`SELECT feature.key AS name, SUM(feature.value) AS uses,
      COUNT(DISTINCT events.slot) AS testers
    FROM events, json_each(events.props, '$.counts') AS feature
    WHERE events.kind = 'feature' AND events.name = 'counts' AND events.at >= ? AND events.at < ?
      AND ${notIn.replace('slot', 'events.slot')}
    GROUP BY feature.key ORDER BY uses DESC LIMIT 150`, since, until, ...exclude);
  const failures = await rows(`SELECT name, COALESCE(json_extract(props, '$.failure'), '') AS failure,
      COALESCE(json_extract(props, '$.status'), '') AS status, COUNT(*) AS runs
    FROM events WHERE kind = 'perf' AND COALESCE(json_extract(props, '$.status'), '') != 'completed'
      AND at >= ? AND at < ? AND ${notIn}
    GROUP BY 1, 2, 3 ORDER BY runs DESC LIMIT 30`, since, until, ...exclude);
  const errors = await rows(`SELECT slot, at, name, json_extract(props, '$.type') AS type,
      json_extract(props, '$.message') AS message, json_extract(props, '$.stack') AS stack
    FROM events WHERE kind = 'error' AND at >= ? AND at < ? AND ${notIn}
    ORDER BY id DESC LIMIT 60`, since, until, ...exclude);
  const errorGroups = await rows(`SELECT name, json_extract(props, '$.type') AS type,
      json_extract(props, '$.message') AS message, COUNT(*) AS count, COUNT(DISTINCT slot) AS testers,
      GROUP_CONCAT(DISTINCT slot) AS slots, MIN(at) AS first_at, MAX(at) AS last_at,
      MAX(json_extract(props, '$.stack')) AS stack
    FROM events WHERE kind = 'error' AND at >= ? AND at < ? AND ${notIn}
    GROUP BY 1, 2, 3 ORDER BY count DESC, last_at DESC LIMIT 40`, since, until, ...exclude);
  const screens = await rows(`SELECT json_extract(props, '$.width') AS width,
      json_extract(props, '$.height') AS height, COUNT(DISTINCT install_id) AS computers
    FROM events WHERE kind = 'session' AND name = 'ui:window' AND at >= ? AND at < ? AND ${notIn}
    GROUP BY 1, 2 ORDER BY computers DESC LIMIT 12`, since, until, ...exclude);
  const feed = await rows(`SELECT slot, at, kind, name, json_extract(props, '$.seconds') AS seconds,
      json_extract(props, '$.message') AS message, json_extract(props, '$.status') AS status
    FROM events WHERE at >= ? AND at < ? AND ${notIn}
      AND ((kind = 'session' AND name IN ('start', 'end')) OR kind = 'error'
        OR (kind = 'perf' AND COALESCE(json_extract(props, '$.status'), '') != 'completed'))
    ORDER BY at DESC LIMIT 30`, since, until, ...exclude);
  for (const machine of machines) {
    if (machine.first_seen >= since) {
      feed.push({ slot: machine.slot, at: machine.first_seen, kind: 'activation', name: machine.os });
    }
  }
  feed.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));

  const performance = [...byJob.values()].map(job => ({ name: job.name, runs: job.runs,
    mean_seconds: round(job.seconds / job.runs), longest_seconds: round(job.longest),
    peak_mb: job.peak == null ? null : Math.round(job.peak), unfinished: job.unfinished,
    testers: job.slots.size })).sort((a, b) => b.runs - a.runs);

  return { generated_at: now(),
    range: { days, tz, exclude, since: days ? stamp(sinceMs) : null,
      previous_since: days ? stamp(sinceMs - days * DAY_MS) : null },
    totals, previous, daily, heatmap, testers, features, performance, failures, errors,
    error_groups: errorGroups, systems, machines, screens, feed: feed.slice(0, 30) };
}

async function admin(request, env, path) {
  // Say which: a secret that never reached the Worker and a wrong password
  // both used to read "Not authorised", and the two need different fixes.
  if (!String(env.ADMIN_TOKEN || '').trim()) {
    return json({ error: 'The admin password (ADMIN_TOKEN) is not set on this service.' }, 503);
  }
  if (!authorised(request, env)) return json({ error: 'Not authorised.' }, 401);
  if (request.method === 'GET' && path === '/v1/admin/report') {
    return json(await report(env, reportOptions(new URL(request.url))));
  }
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

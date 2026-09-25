// The owner's dashboard at /admin: one page and one script, both served by
// the Worker under a CSP that allows nothing from anywhere else (no inline
// script, no third-party charts). The script is written below as an ordinary
// function and sent as its own source text, so it reads like normal code.
//
// The admin token is asked for once and kept in this browser's localStorage
// ("Remember on this browser"); a token the service refuses is forgotten.
// Every number comes from GET /v1/admin/report?days=&tz=&exclude=.

export const ADMIN_HEADERS = {
  'cache-control': 'no-store',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; "
    + "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
    + "frame-ancestors 'none'",
};

// Colours: the dark steps of a colour-blind-checked categorical palette
// (blue, orange, aqua), a one-hue blue ramp for magnitude, and status colours
// kept for meaning (good, quiet, bad). The gold is the site's own accent and
// is never used for data.
const STYLE = `
:root{color-scheme:dark;--page:#0f1115;--card:#181a1f;--card2:#1e2127;--line:#2a2d34;--grid:#262930;
--axis:#3a3e47;--ink:#ece7dc;--ink2:#b9b4a8;--muted:#8b877f;--gold:#e9c46a;--s1:#3987e5;--s2:#d95926;
--s3:#199e70;--good:#0ca30c;--warn:#fab219;--serious:#ec835a;--bad:#d03b3b;
font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink)}
[hidden]{display:none!important}
a{color:var(--gold)}
button,input,select{font:inherit;color:var(--ink)}
button{padding:6px 12px;border-radius:7px;border:1px solid var(--line);background:var(--card2);cursor:pointer}
button:hover{border-color:#4a4f5a}button:disabled{opacity:.5;cursor:default}
button.primary{background:var(--gold);color:#17140d;border-color:var(--gold);font-weight:600}
input[type=password],input[type=search]{padding:6px 10px;border-radius:7px;border:1px solid var(--line);
background:#0c0e12}
input[type=checkbox]{accent-color:var(--gold);vertical-align:-2px}
label{color:var(--ink2);white-space:nowrap;cursor:pointer}
.top{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;
padding:12px 24px;background:rgba(15,17,21,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.top h1{margin:0 8px 0 0;font:600 20px Georgia,serif;color:var(--gold)}
.top h1 small{font:12px system-ui,sans-serif;color:var(--muted);margin-left:6px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:0;border-radius:0;background:transparent;color:var(--ink2);padding:6px 11px}
.seg button+button{border-left:1px solid var(--line)}
.seg button[aria-pressed=true]{background:var(--card2);color:var(--ink);font-weight:600;
box-shadow:inset 0 -2px 0 var(--gold)}
.spacer{flex:1}#status{color:var(--muted);font-size:13px}
main{padding:20px 24px 60px;max-width:1500px;margin:0 auto;transition:opacity .2s}
main.loading{opacity:.6}
.login{max-width:440px;margin:12vh auto;padding:28px;background:var(--card);border:1px solid var(--line);
border-radius:14px}
.login h2{margin:0 0 6px;font:600 22px Georgia,serif;color:var(--gold)}
.login p{color:var(--ink2);margin:0 0 18px}.login .row{display:flex;gap:8px;margin-bottom:12px}
.login input[type=password]{flex:1}#login-msg{color:var(--serious);min-height:20px;margin-top:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
.card h2{margin:0;font-size:15px;font-weight:600;color:var(--ink)}
.card .sub{color:var(--muted);font-size:12.5px;margin:2px 0 10px}
.head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;justify-content:space-between}
.grid{display:grid;gap:16px;margin-top:16px}
.g2{grid-template-columns:repeat(auto-fit,minmax(420px,1fr))}
.g4{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.kpis{display:grid;gap:16px;grid-template-columns:minmax(260px,1.4fr) repeat(auto-fit,minmax(170px,1fr))}
.tile .label{color:var(--ink2);font-size:13px}
.tile .value{font-size:30px;font-weight:600;margin:4px 0 2px;letter-spacing:-.01em}
.tile.hero .value{font-size:54px;line-height:1.05}
.tile .note{color:var(--muted);font-size:12.5px}
.delta{font-size:12.5px;font-weight:600}.delta.up-good,.delta.down-good{color:var(--good)}
.delta.up-bad,.delta.down-bad{color:#ef6b6b}.delta.flat{color:var(--muted)}
.meter{height:8px;border-radius:4px;background:#1c2f4a;overflow:hidden;display:flex;gap:2px;margin:10px 0 6px}
.meter i{display:block;height:100%}
.chart{position:relative;width:100%}
.chart svg{display:block;overflow:visible}
.chart text{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.chart .val{fill:var(--ink);font-size:12px;font-weight:600}
.legend{display:flex;gap:14px;color:var(--ink2);font-size:12.5px;margin:0 0 6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
details.tbl{margin-top:10px}details.tbl summary,details.more summary{color:var(--muted);cursor:pointer;font-size:12.5px}
table{border-collapse:collapse;width:100%}
th,td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}
th{color:var(--muted);font-weight:600;font-size:12px;white-space:nowrap;position:sticky;top:0;background:var(--card)}
th.sort{cursor:pointer;user-select:none}th.sort:hover{color:var(--ink)}
th[aria-sort=ascending]::after{content:" ▲";font-size:9px}th[aria-sort=descending]::after{content:" ▼";font-size:9px}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr:hover td{background:rgba(255,255,255,.02)}
.scroll{overflow:auto;max-height:640px}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink2);white-space:nowrap}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c,#666)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips button{padding:3px 10px;border-radius:999px;font-size:12.5px;color:var(--ink2)}
.chips button[aria-pressed=true]{background:#26303f;border-color:var(--s1);color:var(--ink)}
.chips b{font-weight:600;color:var(--muted);margin-left:4px}
.hb{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:4px 10px;align-items:center;font-size:13px}
.hb .l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2)}
.hb .l small{color:var(--muted)}
.hb .t{height:14px;position:relative}
.hb .b{position:absolute;left:0;top:0;height:14px;border-radius:0 4px 4px 0;background:var(--s1);min-width:2px}
.hb .v{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}
.hb .v small{color:var(--muted);margin-left:6px}
.inbar{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.inbar i{display:block;height:8px;border-radius:0 3px 3px 0;background:var(--s1);opacity:.85}
.range{position:relative;height:10px;min-width:120px}
.range i{position:absolute;top:1px;height:8px;border-radius:0 3px 3px 0;background:var(--s1)}
.range b{position:absolute;top:-2px;width:2px;height:14px;background:var(--ink2)}
.acts{display:flex;gap:6px;justify-content:flex-end}.acts button{padding:3px 8px;font-size:12px}
.feed{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto}
.feed li{display:grid;grid-template-columns:18px 1fr auto;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}
.feed .ic{color:var(--muted);text-align:center}.feed .ic.bad{color:#ef6b6b}.feed .ic.good{color:var(--good)}
.feed time{color:var(--muted);font-size:12.5px;white-space:nowrap}
code,pre{font:12px ui-monospace,Menlo,monospace;color:var(--ink2);white-space:pre-wrap;word-break:break-word}
pre{margin:8px 0 0;padding:10px;background:#0c0e12;border-radius:8px;max-height:260px;overflow:auto}
.empty{color:var(--muted);padding:18px 0;text-align:center}
.scale{display:flex;align-items:center;gap:3px;color:var(--muted);font-size:11.5px;margin-top:8px}
.scale i{width:12px;height:12px;border-radius:2px}
#tip{position:fixed;z-index:20;pointer-events:none;background:#23262d;border:1px solid #3a3e47;
border-radius:8px;padding:7px 10px;font-size:12.5px;color:var(--ink2);box-shadow:0 6px 20px rgba(0,0,0,.4);
max-width:320px}
#tip strong{display:block;color:var(--ink);font-size:14px}
@media (max-width:700px){.top{padding:10px 14px}main{padding:14px}.g2{grid-template-columns:1fr}}
`;

export const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>CartoVox Delta report</title><style>${STYLE}</style></head><body>
<header class="top" id="bar" hidden>
  <h1>CartoVox Delta</h1>
  <div class="seg" id="range" role="group" aria-label="Date range">
    <button type="button" data-days="7">7 days</button><button type="button" data-days="30">30 days</button>
    <button type="button" data-days="90">90 days</button><button type="button" data-days="0">All time</button>
  </div>
  <label title="The owner's own test code; its rows are production checks">
    <input id="hide-test" type="checkbox" checked> Hide D-051</label>
  <span class="spacer"></span>
  <span id="status" aria-live="polite"></span>
  <button id="refresh" type="button" class="primary">Refresh</button>
  <label title="Pauses while this tab is in the background"><input id="auto" type="checkbox"> Every 5 min</label>
  <button id="download" type="button" title="Download this report as JSON">JSON</button>
  <button id="forget" type="button" title="Remove the saved admin token from this browser">Forget token</button>
</header>
<form id="f" class="login">
  <h2>CartoVox Delta report</h2>
  <p>Enter the admin token once; this browser can remember it.</p>
  <div class="row"><input id="t" type="password" placeholder="Admin token" autocomplete="current-password">
  <button class="primary">Open</button></div>
  <label><input id="remember" type="checkbox" checked> Remember on this browser</label>
  <div id="login-msg" role="alert"></div>
</form>
<main id="dash" hidden></main>
<div id="tip" role="tooltip" hidden></div>
<script src="/admin/script"></script></body></html>`;

/* global document, window, localStorage, fetch, Blob, URL */
function adminApp() {
  const KEY = 'cartovox-delta-admin-token';
  const AUTO = 'cartovox-delta-admin-auto';
  const RANGE = 'cartovox-delta-admin-days';
  const HIDE = 'cartovox-delta-admin-hide-test';
  const TEST_SLOT = 'D-051';
  const AUTO_MS = 5 * 60000;
  const RAMP = ['#22252b', '#104281', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6'];
  const $ = id => document.getElementById(id);
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    drop: k => { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  const state = { token: '', data: null, timer: 0, busy: false, days: 30, today: '',
    testers: { sort: 'slot', dir: 1, filter: 'all', q: '' },
    features: { area: 'all', q: '', all: false } };

  // ---------- formatting ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (Number(v) || 0).toLocaleString();
  const compact = v => {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };
  const dayLabel = key => new Date(key + 'T00:00:00Z').toLocaleDateString(undefined,
    { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayLong = key => new Date(key + 'T00:00:00Z').toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const when = iso => { const t = Date.parse(iso); return Number.isNaN(t) ? '' : new Date(t).toLocaleString(); };
  function ago(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '—';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 45) return Math.round(s / 86400) + ' d ago';
    return new Date(t).toLocaleDateString();
  }
  const duration = seconds => {
    const s = Number(seconds) || 0;
    if (s < 90) return Math.round(s) + ' s';
    if (s < 5400) return Math.round(s / 60) + ' min';
    return (s / 3600).toFixed(1) + ' h';
  };
  function niceMax(max, ticks = 4) {
    if (max <= 0) return { top: 1, step: 1 };
    const raw = max / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= raw) || 10 * mag;
    const top = Math.ceil(max / step) * step;
    return { top, step: step < 1 && max >= 1 ? 1 : step };
  }
  const areaOf = name => { const p = String(name).split(':'); return p[0] === 'ui' && p.length > 2 ? p[1] : p[0]; };
  const restOf = name => { const p = String(name).split(':'); return p.slice(p[0] === 'ui' && p.length > 2 ? 2 : 1).join(':') || name; };

  // ---------- charts (plain SVG, sized to their card) ----------
  const PAD = { l: 40, r: 44, t: 14, b: 26 };
  function frame(el, height) {
    const width = Math.max(260, el.clientWidth || 600);
    return { width, height, w: width - PAD.l - PAD.r, h: height - PAD.t - PAD.b };
  }
  function yAxis(f, top, step, fmt = compact) {
    let out = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      const y = PAD.t + f.h - (v / top) * f.h;
      out += `<line x1="${PAD.l}" x2="${PAD.l + f.w}" y1="${y}" y2="${y}" stroke="${v ? 'var(--grid)' : 'var(--axis)'}"/>`
        + `<text x="${PAD.l - 8}" y="${y + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    }
    return out;
  }
  function xLabels(f, keys, xAt) {
    const every = Math.max(1, Math.ceil(keys.length / Math.max(2, Math.floor(f.w / 70))));
    let out = '';
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      if ((i % every === 0 && keys.length - 1 - i >= every / 2) || last) {
        out += `<text x="${xAt(i)}" y="${PAD.t + f.h + 18}" text-anchor="${last && keys.length > 1 ? 'end' : 'middle'}">${esc(dayLabel(k))}</text>`;
      }
    });
    return out;
  }

  // A 2px line over a 10% wash, the last value labelled at its end dot, and a
  // crosshair that snaps to the nearest day.
  function lineChart(el, daily, field, opts = {}) {
    const f = frame(el, opts.height || 210);
    const values = daily.map(d => Number(d[field]) || 0);
    const { top, step } = niceMax(Math.max(...values, 0) || 1);
    const n = values.length;
    const xAt = i => PAD.l + (n === 1 ? f.w / 2 : (i / (n - 1)) * f.w);
    const yAt = v => PAD.t + f.h - (v / top) * f.h;
    const pts = values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
    const base = PAD.t + f.h;
    const band = n > 1 ? f.w / (n - 1) : f.w;
    let hits = '';
    const today = daily[n - 1]?.day === state.today;
    values.forEach((v, i) => {
      const tip = `${opts.fmt ? opts.fmt(v) : num(v)} ${opts.unit || ''}\n${dayLong(daily[i].day)}${today && i === n - 1 ? ' (today so far)' : ''}`;
      hits += `<rect x="${xAt(i) - band / 2}" y="${PAD.t}" width="${band}" height="${f.h}" fill="transparent" data-tip="${esc(tip)}" data-cx="${xAt(i)}" data-cy="${yAt(v)}"/>`;
    });
    const last = values[n - 1] || 0;
    el.innerHTML = `<svg width="${f.width}" height="${f.height}" role="img" aria-label="${esc(opts.label || field)}">`
      + yAxis(f, top, step) + xLabels(f, daily.map(d => d.day), xAt)
      + `<polygon points="${xAt(0)},${base} ${pts.join(' ')} ${xAt(n - 1)},${base}" fill="${opts.color || 'var(--s1)'}" opacity=".1"/>`
      + `<polyline points="${pts.join(' ')}" fill="none" stroke="${opts.color || 'var(--s1)'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<line class="xh" x1="0" x2="0" y1="${PAD.t}" y2="${base}" stroke="var(--ink2)" stroke-width="1" visibility="hidden"/>`
      + `<circle class="xd" r="4" fill="${opts.color || 'var(--s1)'}" stroke="var(--card)" stroke-width="2" visibility="hidden"/>`
      + `<circle cx="${xAt(n - 1)}" cy="${yAt(last)}" r="4" fill="${today ? 'var(--card)' : (opts.color || 'var(--s1)')}" stroke="${today ? (opts.color || 'var(--s1)') : 'var(--card)'}" stroke-width="2"/>`
      + `<text class="val" x="${xAt(n - 1) + 8}" y="${yAt(last) + 4}">${esc(opts.fmt ? opts.fmt(last) : compact(last))}</text>`
      + (today ? `<text x="${xAt(n - 1) + 8}" y="${yAt(last) - 9}">today</text>` : '')
      + hits + '</svg>';
  }

  // Columns (stacked when given several series): at most 24px wide, a 2px
  // gap between neighbours and between segments, the top end rounded.
  function columnChart(el, daily, series, opts = {}) {
    const f = frame(el, opts.height || 210);
    const n = daily.length;
    const totals = daily.map(d => series.reduce((s, x) => s + (Number(d[x.field]) || 0), 0));
    const { top, step } = niceMax(Math.max(...totals, 0) || 1);
    const band = f.w / Math.max(n, 1);
    const bw = Math.max(1, Math.min(24, band - 2));
    const xAt = i => PAD.l + band * i + band / 2;
    const base = PAD.t + f.h;
    let bars = '';
    daily.forEach((d, i) => {
      let y = base;
      const parts = series.map(s => ({ s, v: Number(d[s.field]) || 0 })).filter(p => p.v > 0);
      parts.forEach((p, j) => {
        const h = (p.v / top) * f.h;
        const gap = j ? 2 : 0;
        const y0 = y - gap;
        const y1 = y0 - Math.max(h - gap, 1);
        const x = xAt(i) - bw / 2;
        const r = j === parts.length - 1 ? Math.min(4, bw / 2, y0 - y1) : 0;
        bars += `<path d="M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 + r}V${y0}Z" fill="${p.s.color}"/>`;
        y = y1;
      });
      const tip = (series.length > 1
        ? series.map(s => `${num(d[s.field])} ${s.label}`).join('\n')
        : `${opts.fmt ? opts.fmt(totals[i]) : num(totals[i])} ${series[0].label}`) + '\n' + dayLong(d.day)
        + (d.day === state.today ? ' (today so far)' : '');
      bars += `<rect x="${xAt(i) - band / 2}" y="${PAD.t}" width="${band}" height="${f.h}" fill="transparent" data-tip="${esc(tip)}"/>`;
    });
    el.innerHTML = `<svg width="${f.width}" height="${f.height}" role="img" aria-label="${esc(opts.label || '')}">`
      + yAxis(f, top, step, opts.axisFmt) + xLabels(f, daily.map(d => d.day), xAt) + bars + '</svg>';
  }

  function sparkline(values, color = 'var(--s1)') {
    const w = 120; const h = 30;
    if (values.length < 2) return '';
    const max = Math.max(...values, 1);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`);
    const [lx, ly] = pts[pts.length - 1].split(',');
    return `<svg width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="#5c6270" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<circle cx="${lx}" cy="${ly}" r="3" fill="${color}"/></svg>`;
  }

  const rampStep = (v, max) => (v <= 0 || max <= 0 ? RAMP[0] : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor((v / max) * (RAMP.length - 1.001)))]);

  // Seven rows (Monday first) by 24 hours in the owner's local time.
  function heatmap(el, grid) {
    const rows = [1, 2, 3, 4, 5, 6, 0];
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const width = Math.max(300, el.clientWidth || 600);
    const left = 36; const cell = Math.min(26, (width - left) / 24); const gap = 2;
    const height = rows.length * cell + 22;
    const max = Math.max(...grid.flat(), 0);
    let out = `<svg width="${left + cell * 24}" height="${height}" role="img" aria-label="Active minutes by weekday and hour">`;
    rows.forEach((d, r) => {
      out += `<text x="${left - 8}" y="${r * cell + cell / 2 + 4}" text-anchor="end">${names[d]}</text>`;
      for (let hr = 0; hr < 24; hr += 1) {
        const v = grid[d][hr];
        out += `<rect x="${left + hr * cell + gap / 2}" y="${r * cell + gap / 2}" width="${cell - gap}" height="${cell - gap}" rx="3" fill="${rampStep(v, max)}" data-tip="${esc(`${num(v)} active minutes\n${names[d]} ${String(hr).padStart(2, '0')}:00–${String(hr + 1).padStart(2, '0')}:00`)}"/>`;
      }
    });
    [0, 6, 12, 18, 23].forEach(hr => {
      out += `<text x="${left + hr * cell + cell / 2}" y="${rows.length * cell + 16}" text-anchor="middle">${hr === 23 ? '23h' : String(hr).padStart(2, '0') + 'h'}</text>`;
    });
    el.innerHTML = out + '</svg>' + `<div class="scale">Fewer ${RAMP.map(c => `<i style="background:${c}"></i>`).join('')} More`
      + ` <span style="margin-left:auto">peak ${num(max)} min in one hour-slot</span></div>`;
  }

  // Label · bar · value rows, one hue (these are counts of unordered things).
  function hbars(rows, opts = {}) {
    if (!rows.length) return '<p class="empty">Nothing yet.</p>';
    const max = Math.max(...rows.map(r => r.value), 1);
    return '<div class="hb">' + rows.map(r => `<div class="l" title="${esc(r.title || r.label)}">${esc(r.label)}${r.small ? ` <small>${esc(r.small)}</small>` : ''}</div>`
      + `<div class="t"><div class="b" style="width:${(r.value / max) * 100}%;background:${r.color || opts.color || 'var(--s1)'}" data-tip="${esc(`${num(r.value)} ${opts.unit || ''}\n${r.title || r.label}`)}"></div></div>`
      + `<div class="v">${esc(opts.fmt ? opts.fmt(r.value) : compact(r.value))}${r.after ? `<small>${esc(r.after)}</small>` : ''}</div>`).join('') + '</div>';
  }

  // ---------- sections ----------
  function deltaHtml(now, before, upIsGood = true) {
    const d = state.data;
    if (!d.previous || before == null) return '';
    const diff = (Number(now) || 0) - (Number(before) || 0);
    const label = `vs previous ${d.range.days} days`;
    if (Math.abs(diff) < 1e-9) return `<span class="delta flat">no change</span> <span class="note">${label}</span>`;
    const up = diff > 0;
    const cls = up ? (upIsGood ? 'up-good' : 'up-bad') : (upIsGood ? 'down-bad' : 'down-good');
    const pct = before ? ` (${up ? '+' : ''}${Math.round((diff / before) * 100)}%)` : '';
    return `<span class="delta ${cls}">${up ? '▲ +' : '▼ −'}${compact(Math.abs(diff))}${pct}</span> <span class="note">${label}</span>`;
  }

  function kpis(d) {
    const t = d.totals; const p = d.previous || {};
    const avg = t.sessions ? (t.hours * 3600) / t.sessions : 0;
    const failRate = t.runs ? Math.round((t.failed_runs / t.runs) * 100) : 0;
    const spark = f => sparkline(d.daily.slice(-30).map(x => Number(x[f]) || 0));
    const quiet = Math.max(0, t.codes_activated - t.testers);
    return `<section class="kpis">
      <div class="card tile hero"><div class="label">Active testers</div>
        <div class="value">${num(t.testers)}</div>
        <div>${deltaHtml(t.testers, p.testers)}</div>
        <div class="note">${num(t.codes_activated)} of ${num(t.codes_issued)} codes activated · ${num(quiet)} quiet in this range</div>
        <div style="margin-top:8px">${spark('testers')}</div></div>
      <div class="card tile"><div class="label">Hours used</div><div class="value">${compact(t.hours)}</div>
        <div>${deltaHtml(t.hours, p.hours)}</div>${spark('hours')}</div>
      <div class="card tile"><div class="label">Sessions</div><div class="value">${compact(t.sessions)}</div>
        <div>${deltaHtml(t.sessions, p.sessions)}</div><div class="note">average ${avg ? duration(avg) : '—'} each</div></div>
      <div class="card tile"><div class="label">Active minutes</div><div class="value">${compact(t.active_minutes)}</div>
        <div>${deltaHtml(t.active_minutes, p.active_minutes)}</div>${spark('active_minutes')}</div>
      <div class="card tile"><div class="label">Errors</div><div class="value">${compact(t.errors)}</div>
        <div>${deltaHtml(t.errors, p.errors, false)}</div><div class="note">${num(d.error_groups.length)} distinct</div></div>
      <div class="card tile"><div class="label">Jobs run</div><div class="value">${compact(t.runs)}</div>
        <div class="note">${num(t.failed_runs)} unfinished (${failRate}%)</div>
        <div class="meter" title="${num(t.runs - t.failed_runs)} completed, ${num(t.failed_runs)} unfinished">
          <i style="width:${t.runs ? 100 - failRate : 0}%;background:var(--s1)"></i><i style="width:${failRate}%;background:var(--serious)"></i></div></div>
      <div class="card tile"><div class="label">Codes</div><div class="value">${num(t.codes_activated)}<span class="note"> / ${num(t.codes_issued)}</span></div>
        <div class="meter" title="activated / unused / revoked">
          <i style="width:${(t.codes_activated / Math.max(1, t.codes_issued)) * 100}%;background:var(--s1)"></i></div>
        <div class="note">${num(t.computers)} computers seen · ${num(t.codes_revoked)} revoked</div></div>
    </section>`;
  }

  function testerStatus(row) {
    if (row.status === 'revoked') return { key: 'revoked', label: 'Revoked', c: 'var(--bad)' };
    if (!row.computers) return { key: 'unused', label: 'Never activated', c: '#555a64' };
    if (row.last_event) return { key: 'active', label: 'Active', c: 'var(--good)' };
    return { key: 'quiet', label: 'Quiet', c: 'var(--warn)' };
  }

  function strip(days, keys) {
    const cells = keys.slice(-45);
    const max = Math.max(...cells.map(k => days[k] || 0), 1);
    const w = 5; const g = 1;
    return `<svg width="${cells.length * (w + g)}" height="14" aria-hidden="true">` + cells.map((k, i) =>
      `<rect x="${i * (w + g)}" y="1" width="${w}" height="12" rx="1" fill="${rampStep(days[k] || 0, max)}" data-tip="${esc(`${num(days[k] || 0)} active minutes\n${dayLong(k)}`)}"/>`).join('') + '</svg>';
  }

  const TESTER_COLS = [
    ['slot', 'Code'], ['status', 'Status'], ['activity', 'Activity', false], ['last_seen', 'Last seen'],
    ['hours', 'Hours', true, 'num'], ['sessions', 'Sessions', true, 'num'], ['active_minutes', 'Active min', true, 'num'],
    ['errors', 'Errors', true, 'num'], ['computers', 'Computers', true, 'num'], ['os', 'System'],
    ['app_version', 'Version'], ['actions', '', false]];

  function testersSection(d) {
    const s = state.testers;
    const counts = { all: d.testers.length, active: 0, quiet: 0, unused: 0, revoked: 0 };
    d.testers.forEach(r => { counts[testerStatus(r).key] += 1; });
    const chips = [['all', 'All'], ['active', 'Active'], ['quiet', 'Quiet'], ['unused', 'Never activated'], ['revoked', 'Revoked']]
      .map(([k, l]) => `<button type="button" data-tfilter="${k}" aria-pressed="${s.filter === k}">${l}<b>${counts[k]}</b></button>`).join('');
    return `<section class="card" style="margin-top:16px"><div class="head"><div><h2>Testers</h2>
      <div class="sub">Status is for the chosen range: active means the app reported something in it. Click a column to sort.</div></div>
      <div class="head"><div class="chips">${chips}</div><input id="tq" type="search" placeholder="Find a code, system, version" value="${esc(s.q)}"></div></div>
      <div class="scroll"><table id="tt"><thead><tr>${TESTER_COLS.map(([k, l, sortable = true, cls = '']) =>
        `<th class="${cls}${sortable ? ' sort' : ''}" ${sortable ? `data-sort="${k}"` : ''} ${s.sort === k ? `aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}</th>`).join('')}</tr></thead>
      <tbody id="tbody"></tbody></table></div></section>`;
  }

  function renderTesterRows() {
    const d = state.data; const s = state.testers;
    const keys = d.daily.map(x => x.day);
    const q = s.q.trim().toLowerCase();
    const maxHours = Math.max(...d.testers.map(r => r.hours), 0.1);
    let rows = d.testers.filter(r => (s.filter === 'all' || testerStatus(r).key === s.filter)
      && (!q || [r.slot, r.os, r.app_version, testerStatus(r).label].join(' ').toLowerCase().includes(q)));
    const val = (r, k) => (k === 'status' ? testerStatus(r).label : k === 'last_seen' ? (r.last_seen || '') : r[k] ?? '');
    rows = rows.slice().sort((a, b) => {
      const x = val(a, s.sort); const y = val(b, s.sort);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * s.dir;
    });
    $('tbody').innerHTML = rows.length ? rows.map(r => {
      const st = testerStatus(r);
      return `<tr><td><strong>${esc(r.slot)}</strong></td>
        <td><span class="pill" style="--c:${st.c}">${st.label}</span></td>
        <td>${r.computers ? strip(r.days || {}, keys) : ''}</td>
        <td title="${esc(when(r.last_seen))}">${r.last_seen ? esc(ago(r.last_seen)) : '—'}</td>
        <td class="num"><div class="inbar">${r.hours ? `<i style="width:${Math.max(2, (r.hours / maxHours) * 60)}px"></i>` : ''}${esc(r.hours)}</div></td>
        <td class="num">${num(r.sessions)}</td><td class="num">${num(r.active_minutes)}</td>
        <td class="num">${r.errors ? `<span style="color:#ef6b6b">${num(r.errors)}</span>` : '0'}</td>
        <td class="num">${num(r.computers)} / ${num(r.max_installs)}</td>
        <td>${esc(r.os || '')}</td><td>${esc(r.app_version || '')}</td>
        <td><div class="acts">${r.status === 'revoked'
          ? `<button type="button" data-act="restore" data-slot="${esc(r.slot)}">Restore</button>`
          : `<button type="button" data-act="revoke" data-slot="${esc(r.slot)}">Revoke</button>`}
          ${r.computers ? `<button type="button" data-act="free" data-slot="${esc(r.slot)}" title="Let this code unlock new computers">Free computers</button>` : ''}</div></td></tr>`;
    }).join('') : `<tr><td colspan="${TESTER_COLS.length}" class="empty">No testers match.</td></tr>`;
  }

  function featuresSection(d) {
    const areas = new Map();
    d.features.forEach(f => areas.set(areaOf(f.name), (areas.get(areaOf(f.name)) || 0) + f.uses));
    const areaRows = [...areas.entries()].sort((a, b) => b[1] - a[1]);
    const s = state.features;
    const chips = [['all', 'All']].concat(areaRows.slice(0, 9).map(([a]) => [a, a]))
      .map(([k, l]) => `<button type="button" data-farea="${esc(k)}" aria-pressed="${s.area === k}">${esc(l)}</button>`).join('');
    return `<section class="grid g2">
      <div class="card"><div class="head"><div><h2>Most used features</h2><div class="sub">Clicks and exports in the range; the grey figure is how many testers used it.</div></div>
        <input id="fq" type="search" placeholder="Filter features" value="${esc(s.q)}"></div>
        <div class="chips" style="margin-bottom:12px">${chips}</div><div id="flist"></div></div>
      <div class="card"><h2>Feature areas</h2><div class="sub">Uses summed by the part of the app they belong to.</div>
        ${hbars(areaRows.slice(0, 16).map(([a, v]) => ({ label: a, value: v })), { unit: 'uses' })}</div>
    </section>`;
  }

  function renderFeatureList() {
    const s = state.features; const q = s.q.trim().toLowerCase();
    const rows = state.data.features.filter(f => (s.area === 'all' || areaOf(f.name) === s.area)
      && (!q || f.name.toLowerCase().includes(q)));
    const shown = s.all ? rows : rows.slice(0, 20);
    $('flist').innerHTML = hbars(shown.map(f => ({ label: restOf(f.name), small: s.area === 'all' ? areaOf(f.name) : '',
      title: f.name, value: f.uses, after: `${f.testers} ${f.testers === 1 ? 'tester' : 'testers'}` })), { unit: 'uses' })
      + (rows.length > 20 ? `<p><button type="button" id="fall">${s.all ? 'Show top 20' : `Show all ${rows.length}`}</button></p>` : '');
  }

  function performanceSection(d) {
    const max = Math.max(...d.performance.map(p => p.longest_seconds), 1);
    const body = d.performance.length ? `<div class="scroll"><table><thead><tr><th>Job</th><th class="num">Runs</th>
      <th>Mean → longest</th><th class="num">Mean</th><th class="num">Longest</th><th class="num">Peak memory</th>
      <th class="num">Unfinished</th><th class="num">Testers</th></tr></thead><tbody>${d.performance.map(p => {
        const rate = p.runs ? Math.round((p.unfinished / p.runs) * 100) : 0;
        return `<tr><td><strong>${esc(p.name.replace(/^job:/, ''))}</strong></td><td class="num">${num(p.runs)}</td>
        <td><div class="range" data-tip="${esc(`mean ${duration(p.mean_seconds)}, longest ${duration(p.longest_seconds)}\n${p.name}`)}"><i style="width:${(p.mean_seconds / max) * 100}%"></i><b style="left:${(p.longest_seconds / max) * 100}%"></b></div></td>
        <td class="num">${duration(p.mean_seconds)}</td><td class="num">${duration(p.longest_seconds)}</td>
        <td class="num">${p.peak_mb == null ? '—' : num(p.peak_mb) + ' MB'}</td>
        <td class="num">${p.unfinished ? `<span style="color:var(--serious)">${num(p.unfinished)} (${rate}%)</span>` : '0'}</td>
        <td class="num">${num(p.testers)}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">No jobs in this range.</p>';
    const failures = d.failures.length ? `<details class="more"><summary>Why jobs did not finish (${d.failures.length})</summary><table><thead><tr><th>Job</th><th>Status</th><th>Failure</th><th class="num">Runs</th></tr></thead><tbody>`
      + d.failures.map(f => `<tr><td>${esc(f.name)}</td><td>${esc(f.status)}</td><td>${esc(f.failure || '—')}</td><td class="num">${num(f.runs)}</td></tr>`).join('') + '</tbody></table></details>' : '';
    return `<section class="card" style="margin-top:16px"><h2>Performance</h2><div class="sub">Generations, rebuilds and renders: the bar is the mean, the tick the longest run.</div>${body}${failures}</section>`;
  }

  function errorsSection(d) {
    const groups = d.error_groups.length ? `<div class="scroll"><table><thead><tr><th class="num">Count</th><th class="num">Testers</th><th>Error</th><th>Where</th><th>Last seen</th></tr></thead><tbody>`
      + d.error_groups.map(g => `<tr><td class="num"><strong>${num(g.count)}</strong></td><td class="num" title="${esc(g.slots)}">${num(g.testers)}</td>
        <td><strong>${esc(g.type || 'Error')}</strong>${g.message ? ': ' + esc(g.message) : ''}${g.stack ? `<details class="more"><summary>Stack</summary><pre>${esc(g.stack)}</pre></details>` : ''}</td>
        <td><code>${esc(g.name)}</code></td><td title="first ${esc(when(g.first_at))}">${esc(ago(g.last_at))}</td></tr>`).join('') + '</tbody></table></div>'
      : '<p class="empty">No errors in this range.</p>';
    const latest = d.errors.length ? `<details class="more"><summary>Latest ${d.errors.length} errors, one by one</summary><table><thead><tr><th>When</th><th>Code</th><th>Where</th><th>Error</th></tr></thead><tbody>`
      + d.errors.map(e => `<tr><td title="${esc(when(e.at))}">${esc(ago(e.at))}</td><td>${esc(e.slot)}</td><td><code>${esc(e.name)}</code></td><td><strong>${esc(e.type || '')}</strong> ${esc(e.message || '')}${e.stack ? `<pre>${esc(e.stack)}</pre>` : ''}</td></tr>`).join('') + '</tbody></table></details>' : '';
    return `<section class="card" style="margin-top:16px"><h2>Errors</h2><div class="sub">The same type and message from the same place counts as one error.</div>${groups}${latest}</section>`;
  }

  function computersSection(d) {
    const tally = (list, key) => {
      const m = new Map(); list.forEach(x => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    };
    const mem = x => { const g = Number(x.memory_gb); if (!g) return ''; return g <= 8.5 ? '8 GB or less' : g <= 16.5 ? '9–16 GB' : g <= 32.5 ? '17–32 GB' : 'more than 32 GB'; };
    const osRows = tally(d.machines, x => [x.os, x.arch].filter(Boolean).join(' · '));
    const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
    osRows.forEach((r, i) => { r.color = i < 3 ? colors[i] : '#5c6270'; });
    const card = (title, sub, rows) => `<div class="card"><h2>${title}</h2><div class="sub">${sub}</div>${hbars(rows.slice(0, 8), { unit: 'computers' })}</div>`;
    return `<section class="grid g4">
      ${card('Operating systems', `${num(d.machines.length)} registered computers`, osRows)}
      ${card('App versions', 'What each computer last reported', tally(d.machines, x => [x.app_version, x.release].filter(Boolean).join(' · ')))}
      ${card('Memory', 'Installed RAM', tally(d.machines, mem))}
      ${card('Window sizes', 'App window at start, in the range', d.screens.map(x => ({ label: `${x.width} × ${x.height}`, value: x.computers })))}
    </section>`;
  }

  function feedSection(d) {
    const line = e => {
      if (e.kind === 'activation') return ['＋', 'good', `<strong>${esc(e.slot)}</strong> unlocked a new computer${e.name ? ` (${esc(e.name)})` : ''}`];
      if (e.kind === 'error') return ['!', 'bad', `<strong>${esc(e.slot)}</strong> hit ${esc(e.message || e.name)} <code>${esc(e.name)}</code>`];
      if (e.kind === 'perf') return ['✕', 'bad', `<strong>${esc(e.slot)}</strong> ${esc(e.name.replace(/^job:/, ''))} did not finish (${esc(e.status)})`];
      if (e.name === 'end') return ['■', '', `<strong>${esc(e.slot)}</strong> closed the app after ${esc(duration(e.seconds))}`];
      return ['▶', 'good', `<strong>${esc(e.slot)}</strong> opened the app`];
    };
    return `<div class="card"><h2>Recent activity</h2><div class="sub">Openings, closings, new computers, errors and unfinished jobs.</div>`
      + (d.feed.length ? '<ul class="feed">' + d.feed.map(e => { const [ic, cls, text] = line(e);
        return `<li><span class="ic ${cls}">${ic}</span><span>${text}</span><time title="${esc(when(e.at))}">${esc(ago(e.at))}</time></li>`; }).join('') + '</ul>'
        : '<p class="empty">Nothing in this range.</p>') + '</div>';
  }

  function dailyTable(d) {
    return `<details class="tbl"><summary>Daily numbers as a table</summary><div class="scroll" style="max-height:300px"><table><thead><tr><th>Day</th><th class="num">Testers</th><th class="num">Sessions</th><th class="num">Hours</th><th class="num">Active min</th><th class="num">Jobs</th><th class="num">Unfinished</th><th class="num">Errors</th></tr></thead><tbody>`
      + d.daily.slice().reverse().map(x => `<tr><td>${esc(dayLong(x.day))}</td><td class="num">${num(x.testers)}</td><td class="num">${num(x.sessions)}</td><td class="num">${x.hours}</td><td class="num">${num(x.active_minutes)}</td><td class="num">${num(x.runs)}</td><td class="num">${num(x.failed)}</td><td class="num">${num(x.errors)}</td></tr>`).join('')
      + '</tbody></table></div></details>';
  }

  function render() {
    const d = state.data;
    if (!d) return;
    const rangeName = d.range.days ? `the last ${d.range.days} days` : 'all time';
    $('dash').innerHTML = kpis(d)
      + `<section class="grid g2">
          <div class="card"><h2>Active testers per day</h2><div class="sub">Codes that reported anything that day, ${esc(rangeName)}.</div><div class="chart" id="c-testers"></div></div>
          <div class="card"><h2>Hours used per day</h2><div class="sub">Time the app was open, counted on the day it was closed.</div><div class="chart" id="c-hours"></div></div>
        </section>
        <section class="grid g2">
          <div class="card"><h2>When testers work</h2><div class="sub">Active minutes by weekday and hour, in your time zone.</div><div class="chart" id="c-heat"></div></div>
          <div class="card"><h2>Problems per day</h2><div class="legend"><span><i style="background:var(--bad)"></i>Errors</span><span><i style="background:var(--serious)"></i>Unfinished jobs</span></div><div class="chart" id="c-problems"></div></div>
        </section>`
      + `<div class="card" style="margin-top:16px">${dailyTable(d)}</div>`
      + testersSection(d) + featuresSection(d) + performanceSection(d) + errorsSection(d)
      + computersSection(d) + `<section class="grid g2">${feedSection(d)}<div class="card"><h2>About these numbers</h2><div class="sub">How to read the dashboard.</div>
        <p class="note" style="color:var(--ink2)">An <strong>active minute</strong> is a minute in which a tester clicked something in the app (the app reports clicks once a minute). <strong>Hours</strong> come from sessions that ended cleanly, so a crash or a forced quit adds none. Days and hours are in your time zone (UTC${d.range.tz >= 0 ? '+' : '−'}${Math.floor(Math.abs(d.range.tz) / 60)}${Math.abs(d.range.tz) % 60 ? ':' + String(Math.abs(d.range.tz) % 60).padStart(2, '0') : ''}). Generated ${esc(when(d.generated_at))}.</p></div></section>`;
    drawCharts();
    renderTesterRows();
    renderFeatureList();
  }

  function drawCharts() {
    const d = state.data;
    if (!d || !$('c-testers')) return;
    lineChart($('c-testers'), d.daily, 'testers', { unit: 'active testers', label: 'Active testers per day' });
    columnChart($('c-hours'), d.daily, [{ field: 'hours', label: 'hours', color: 'var(--s1)' }],
      { label: 'Hours used per day', fmt: v => (Math.round(v * 10) / 10).toLocaleString() });
    heatmap($('c-heat'), d.heatmap);
    columnChart($('c-problems'), d.daily, [{ field: 'errors', label: 'errors', color: 'var(--bad)' },
      { field: 'failed', label: 'unfinished jobs', color: 'var(--serious)' }], { label: 'Problems per day' });
  }

  // ---------- data ----------
  function signedIn(on) {
    $('f').hidden = on; $('bar').hidden = !on; $('dash').hidden = !on;
    if (!on) { $('t').value = ''; $('t').focus(); }
  }
  function forget(message) {
    state.token = ''; state.data = null; store.drop(KEY);
    clearInterval(state.timer); state.timer = 0; $('auto').checked = false;
    signedIn(false); $('dash').innerHTML = ''; $('login-msg').textContent = message || '';
  }
  function schedule() {
    clearInterval(state.timer); state.timer = 0;
    if ($('auto').checked && state.token) state.timer = setInterval(() => { if (!document.hidden) load(); }, AUTO_MS);
  }
  function syncRange() {
    document.querySelectorAll('#range button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === state.days)));
  }
  async function load() {
    if (!state.token || state.busy) return;
    state.busy = true; $('refresh').disabled = true; $('status').textContent = 'Loading…'; $('dash').classList.add('loading');
    const params = new URLSearchParams({ days: String(state.days), tz: String(-new Date().getTimezoneOffset()) });
    if ($('hide-test').checked) params.set('exclude', TEST_SLOT);
    try {
      const r = await fetch('/v1/admin/report?' + params, { headers: { authorization: 'Bearer ' + state.token }, cache: 'no-store' });
      const d = await r.json().catch(() => ({ error: 'The service answered ' + r.status + '.' }));
      if (r.status === 401) { forget('That token was refused, so this browser has forgotten it. Enter it again.'); return; }
      if (!r.ok) {
        if (!state.data) { signedIn(false); $('login-msg').textContent = d.error || ('Failed: ' + r.status); }
        $('status').textContent = d.error || ('Failed: ' + r.status); return;
      }
      state.data = d; state.today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      signedIn(true); render();
      $('status').textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (e) {
      $('status').textContent = 'Could not reach the service; the numbers below may be stale.';
      if (!state.data) { signedIn(false); $('login-msg').textContent = 'Could not reach the service.'; }
    } finally {
      state.busy = false; $('refresh').disabled = false; $('dash').classList.remove('loading');
    }
  }
  async function act(action, slot) {
    const body = action === 'free' ? { free_computers: true } : { status: action === 'revoke' ? 'revoked' : 'active' };
    const question = action === 'revoke' ? `Revoke ${slot}? Every computer using it locks at its next check-in.`
      : action === 'restore' ? `Restore ${slot}?` : `Free every computer registered to ${slot}? The tester can then unlock again on new ones.`;
    if (!window.confirm(question)) return;
    const r = await fetch('/v1/admin/codes/' + encodeURIComponent(slot), { method: 'POST',
      headers: { authorization: 'Bearer ' + state.token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    $('status').textContent = r.ok ? `${slot}: done.` : (d.error || `Failed: ${r.status}`);
    if (r.ok) load();
  }

  // ---------- events ----------
  const tip = $('tip');
  function showTip(target, x, y) {
    const lines = target.getAttribute('data-tip').split('\n');
    tip.textContent = '';
    const strong = document.createElement('strong'); strong.textContent = lines[0]; tip.appendChild(strong);
    lines.slice(1).forEach(l => { const div = document.createElement('div'); div.textContent = l; tip.appendChild(div); });
    tip.hidden = false;
    const w = tip.offsetWidth; const h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 14) + 'px';
    tip.style.top = (y - h - 12 < 60 ? y + 16 : y - h - 12) + 'px';
    const svg = target.ownerSVGElement;
    if (svg && target.hasAttribute('data-cx')) {
      const xh = svg.querySelector('.xh'); const xd = svg.querySelector('.xd');
      xh.setAttribute('x1', target.dataset.cx); xh.setAttribute('x2', target.dataset.cx); xh.setAttribute('visibility', 'visible');
      xd.setAttribute('cx', target.dataset.cx); xd.setAttribute('cy', target.dataset.cy); xd.setAttribute('visibility', 'visible');
    }
  }
  function hideTip() {
    tip.hidden = true;
    document.querySelectorAll('.xh,.xd').forEach(n => n.setAttribute('visibility', 'hidden'));
  }
  document.addEventListener('pointermove', e => {
    const target = e.target.closest && e.target.closest('[data-tip]');
    if (target) showTip(target, e.clientX, e.clientY); else if (!tip.hidden) hideTip();
  });
  document.addEventListener('pointerleave', hideTip);

  $('f').addEventListener('submit', e => {
    e.preventDefault();
    state.token = $('t').value.trim();
    if (!state.token) return;
    if ($('remember').checked) store.set(KEY, state.token); else store.drop(KEY);
    $('t').value = ''; $('login-msg').textContent = 'Opening…'; schedule(); load();
  });
  $('refresh').addEventListener('click', load);
  $('forget').addEventListener('click', () => forget('Token forgotten on this browser.'));
  $('auto').addEventListener('change', () => { store.set(AUTO, $('auto').checked ? '1' : '0'); schedule(); });
  $('hide-test').addEventListener('change', () => { store.set(HIDE, $('hide-test').checked ? '1' : '0'); load(); });
  $('range').addEventListener('click', e => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    state.days = Number(b.dataset.days); store.set(RANGE, String(state.days)); syncRange(); load();
  });
  $('download').addEventListener('click', () => {
    if (!state.data) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' }));
    a.download = `cartovox-delta-report-${state.data.generated_at.slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('dash').addEventListener('click', e => {
    const t = e.target;
    const sort = t.closest('th[data-sort]');
    if (sort) {
      const k = sort.dataset.sort; const s = state.testers;
      s.dir = s.sort === k ? -s.dir : (['slot', 'os', 'app_version', 'status'].includes(k) ? 1 : -1); s.sort = k;
      document.querySelectorAll('#tt th[data-sort]').forEach(th => {
        if (th.dataset.sort === k) th.setAttribute('aria-sort', s.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
      });
      renderTesterRows(); return;
    }
    const tf = t.closest('[data-tfilter]');
    if (tf) { state.testers.filter = tf.dataset.tfilter; document.querySelectorAll('[data-tfilter]').forEach(b => b.setAttribute('aria-pressed', String(b === tf))); renderTesterRows(); return; }
    const fa = t.closest('[data-farea]');
    if (fa) { state.features.area = fa.dataset.farea; state.features.all = false; document.querySelectorAll('[data-farea]').forEach(b => b.setAttribute('aria-pressed', String(b === fa))); renderFeatureList(); return; }
    if (t.id === 'fall') { state.features.all = !state.features.all; renderFeatureList(); return; }
    const a = t.closest('button[data-act]');
    if (a) act(a.dataset.act, a.dataset.slot);
  });
  $('dash').addEventListener('input', e => {
    if (e.target.id === 'tq') { state.testers.q = e.target.value; renderTesterRows(); }
    if (e.target.id === 'fq') { state.features.q = e.target.value; state.features.all = false; renderFeatureList(); }
  });
  let resize = 0;
  window.addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(drawCharts, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.timer) load(); });

  const savedDays = Number(store.get(RANGE));
  state.days = [0, 7, 30, 90].includes(savedDays) && store.get(RANGE) !== null ? savedDays : 30;
  syncRange();
  $('auto').checked = store.get(AUTO) === '1';
  $('hide-test').checked = store.get(HIDE) !== '0';
  state.token = store.get(KEY) || '';
  if (state.token) { signedIn(true); schedule(); load(); } else $('t').focus();
}

// Wrangler bundles with esbuild's keepNames, which rewrites every inner
// function of adminApp as __name(fn, "name"). The helper lives in the
// Worker's bundle, not the browser, so the page defines its own no-op one;
// without it the script dies on its first line and nothing responds.
export const ADMIN_SCRIPT = `var __name = function (fn) { return fn; };\n(${adminApp.toString()})();\n`;

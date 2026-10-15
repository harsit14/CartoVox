// The owner's dashboard at /admin: one page and one script, both served by
// the Worker under a CSP that allows nothing from anywhere else (no inline
// script, no third-party charts). The script is written below as an ordinary
// function and sent as its own source text, so it reads like normal code.
//
// The admin token is asked for once and kept in this browser's localStorage
// ("Remember on this browser"); a token the service refuses is forgotten.
// Every number comes from GET /v1/admin/report?days=&tz=&exclude=&slot=;
// #D-012 in the address opens one tester (the back button returns), and a
// code's nickname is saved with POST /v1/admin/codes/<slot> {note}.

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
:root{color-scheme:dark;--page:#101217;--card:#191c22;--card2:#21252d;--line:#30343e;--grid:#2a2e38;
--axis:#424957;--ink:#eeeae2;--ink2:#bfc3cd;--muted:#9198a6;--gold:#e9c46a;--s1:#5598e7;--s2:#e77d49;
--s3:#53bba1;--good:#6ccc9b;--warn:#e9c46a;--serious:#ee9d73;--bad:#ef7478;
font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink)}[hidden]{display:none!important}
a{color:var(--gold)}button,input,select{font:inherit;color:var(--ink)}button{padding:7px 11px;border-radius:8px;
border:1px solid var(--line);background:var(--card2);cursor:pointer}button:hover{background:#2a303b;border-color:#59616e}
button:disabled{opacity:.45;cursor:default}button.primary{background:var(--gold);color:#211a0d;border-color:var(--gold);font-weight:650}
button.primary:hover{background:#f0d083}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
input[type=password],input[type=search]{min-width:0;padding:8px 11px;border-radius:8px;border:1px solid var(--line);background:#11141a}
input[type=checkbox]{accent-color:var(--gold);vertical-align:-2px}label{color:var(--ink2);cursor:pointer}
select{padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:#11141a;max-width:270px;min-width:0}
.icon{width:18px;height:18px;flex:none;vertical-align:-4px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.top{position:sticky;top:0;z-index:10;background:#14171d;border-bottom:1px solid var(--line)}
.top-inner{max-width:1800px;margin:auto;padding:14px 26px 12px}.brand-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:11px}.brand-mark{width:34px;height:34px;display:grid;place-items:center;color:var(--gold);border:1px solid #655634;border-radius:9px;background:#26231c}
.brand h1{margin:0;font:600 23px Georgia,serif;color:var(--gold);line-height:1.1}.brand small{display:block;margin-top:3px;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.utility{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}#status{font-size:12px;color:var(--muted);max-width:420px;text-align:right}
.utility details{position:relative}.utility summary{list-style:none;cursor:pointer;border:1px solid var(--line);background:var(--card2);border-radius:8px;padding:7px 11px}
.utility summary::-webkit-details-marker{display:none}.menu{position:absolute;right:0;top:42px;min-width:210px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:0 10px 32px #0007}
.menu button{width:100%;text-align:left;margin:3px 0}.menu label{display:block;padding:7px 5px;font-size:12.5px}.filters{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:14px}.filters label{font-size:12.5px;white-space:nowrap}.scope-label{color:var(--muted);margin-right:6px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg button{border:0;border-radius:0;background:transparent;color:var(--ink2);padding:6px 11px}
.seg button+button{border-left:1px solid var(--line)}.seg button[aria-pressed=true]{background:#33322b;color:var(--gold);box-shadow:inset 0 -2px var(--gold)}
.shell{max-width:1800px;margin:auto;display:grid;grid-template-columns:196px minmax(0,1fr);align-items:start}.rail{min-width:0;position:sticky;top:var(--bar-height,125px);padding:24px 16px 24px 22px}
.rail-label{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);padding:0 10px 10px}.nav{display:grid;gap:5px}
.nav button{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid transparent;background:transparent;color:var(--ink2);text-align:left}
.nav button:hover{background:var(--card)}.nav button[aria-current=page]{color:var(--gold);background:#2b271e;border-color:#514630}.nav .count{margin-left:auto;font-size:11px;background:#ffffff09;padding:1px 6px;border-radius:5px;color:var(--muted)}
.rail-note{color:var(--muted);font-size:11.5px;padding:20px 10px;border-top:1px solid var(--line);margin-top:18px}.rail-note strong{display:block;color:var(--ink2);font-weight:500;margin-bottom:4px}
main{min-width:0;padding:24px 26px 56px 8px;transition:opacity .15s}main.loading{opacity:.55}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:20px}.page-heading h2{font-size:27px;letter-spacing:-.035em;line-height:1.2;margin:3px 0 6px}.eyebrow{font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:.1em}.page-heading p{margin:0;color:var(--muted);font-size:12.5px}.scope-badge{padding:5px 9px;border:1px solid var(--line);border-radius:6px;font-size:12px;color:var(--ink2);white-space:nowrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;min-width:0}.card h2,.card h3{margin:0;font-size:15px;font-weight:650;color:var(--ink)}.card .sub{color:var(--muted);font-size:12px;margin:4px 0 16px;line-height:1.5}.head>input[type=search]{width:300px;max-width:100%}.head{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;justify-content:space-between}.section-head{margin-bottom:15px}.section-head .sub{margin-bottom:0}.grid{display:grid;gap:16px;margin-top:16px}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}.wide-grid{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}
.kpis{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr));margin:0 0 18px}.tile{padding:15px 16px;position:relative;overflow:hidden}.tile .label{color:var(--ink2);font-size:12px;display:flex;justify-content:space-between;gap:8px}.tile .label .icon{width:15px;height:15px;color:var(--muted)}.tile .value{font-size:30px;font-weight:650;margin:7px 0 5px;letter-spacing:-.035em;line-height:1.1}.tile.hero{border-color:#4d4635}.tile.hero .value{color:var(--gold)}.tile .note{color:var(--muted);font-size:11.5px}.tile .spark{position:absolute;bottom:10px;right:13px;opacity:.65}.tile .tile-action{border:0;padding:0;background:none;color:var(--ink2);font-size:12px;text-align:left}.tile-action:hover{color:var(--gold)}
.delta{font-size:11.5px;font-weight:600}.delta.up-good,.delta.down-good{color:var(--good)}.delta.up-bad,.delta.down-bad{color:var(--bad)}.delta.flat{color:var(--muted)}
.meter{height:7px;border-radius:4px;background:#2b3545;overflow:hidden;display:flex;gap:2px;margin:10px 0 6px}.meter i{display:block;height:100%}
.chart{position:relative;width:100%;min-width:0}.chart svg{display:block;width:100%;max-width:100%;overflow:visible}.chart text{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.chart .val{fill:var(--ink);font-size:12px;font-weight:600}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--ink2);font-size:12px;margin:0 0 8px}.legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;vertical-align:-1px}
details.tbl,details.more{margin-top:12px}details.tbl summary,details.more summary{color:var(--muted);cursor:pointer;font-size:12px}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{padding:10px 9px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}th{color:var(--muted);font-weight:500;font-size:11.5px;white-space:nowrap;position:sticky;top:0;background:var(--card)}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tr:hover td{background:#ffffff03}.sort-label{border:0;background:none;padding:0;color:inherit;text-align:inherit;font:inherit}.sort-label:hover{background:none;color:var(--gold)}th[aria-sort=ascending]::after{content:" ↑"}th[aria-sort=descending]::after{content:" ↓"}.scroll{overflow:auto;max-height:620px;overscroll-behavior:contain}.tester-table{min-width:850px}.tester-table td:first-child{min-width:180px}.identity strong{display:block;font-size:13px;color:var(--ink)}.identity small{display:block;font:11px ui-monospace,monospace;color:var(--muted);margin-top:2px}.table-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.table-tools input{width:250px;max-width:100%}.detail-cols[hidden]{display:none}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink2);white-space:nowrap}.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--c,#666)}.chips{display:flex;flex-wrap:wrap;gap:6px}.chips button{padding:5px 9px;border-radius:6px;font-size:11.5px;color:var(--ink2);background:transparent}.chips button[aria-pressed=true]{background:#273951;border-color:#486383;color:#d8e8ff}.chips b{font-weight:500;color:var(--muted);margin-left:5px}.pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;font-size:12px;color:var(--muted)}
.hb{display:grid;grid-template-columns:minmax(90px,38%) minmax(0,1fr) auto;gap:9px 10px;align-items:center;font-size:12.5px}.hb.wide{grid-template-columns:minmax(90px,55%) minmax(0,1fr) auto}.hb .l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2)}.hb .l small{color:var(--muted)}.hb .t{height:9px;position:relative;background:#242a34;border-radius:3px}.hb .b{position:absolute;left:0;top:0;height:9px;border-radius:3px;background:var(--s1);min-width:2px}.hb .v{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}.hb .v small{color:var(--muted);margin-left:6px}.inbar{display:flex;align-items:center;gap:8px;justify-content:flex-end}.inbar i{display:block;height:6px;border-radius:3px;background:var(--s1);opacity:.8}.range{position:relative;height:10px;min-width:100px}.range i{position:absolute;top:1px;height:8px;border-radius:3px;background:var(--s1)}.range b{position:absolute;top:-2px;width:2px;height:14px;background:var(--ink2)}.acts{display:flex;gap:6px;justify-content:flex-end}.acts button{padding:5px 8px;font-size:11.5px}.link{background:none;border:0;padding:0;color:var(--ink);cursor:pointer;font:inherit;text-align:left}.link:hover{color:var(--gold);background:none;text-decoration:underline}.pen{background:none;border:0;padding:0 4px;color:var(--muted);font-size:11px;cursor:pointer}.pen:hover{color:var(--gold)}input.nickedit{padding:5px 8px;border-radius:6px;border:1px solid var(--gold);background:#11141a;width:170px}
.feed{list-style:none;margin:0;padding:0;max-height:420px;overflow:auto}.feed li{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12px;overflow-wrap:anywhere}.feed .ic{color:var(--muted);text-align:center}.feed .ic.bad{color:var(--bad)}.feed .ic.good{color:var(--good)}.feed time{color:var(--muted);font-size:11px;white-space:nowrap}code,pre{font:11.5px ui-monospace,Menlo,monospace;color:var(--ink2);white-space:pre-wrap;word-break:break-word}pre{margin:8px 0 0;padding:12px;background:#11141a;border-radius:8px;max-height:260px;overflow:auto}.empty{color:var(--muted);padding:24px 0;text-align:center;font-size:13px}.scale{display:flex;flex-wrap:wrap;align-items:center;gap:3px;color:var(--muted);font-size:11px;margin-top:8px}.scale i{width:10px;height:10px;border-radius:2px}
#tip{position:fixed;z-index:30;pointer-events:none;background:#252c37;border:1px solid #4b5565;border-radius:8px;padding:8px 11px;font-size:12px;color:var(--ink2);box-shadow:0 6px 20px #0006;max-width:300px}#tip strong{display:block;color:var(--ink);font-size:13px}
.profile{margin-bottom:18px}.profile .pname{font-size:22px;margin:6px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.profile .pname .code{font:12px ui-monospace,monospace;color:var(--muted)}.profile .facts{display:flex;flex-wrap:wrap;gap:7px 18px;color:var(--muted);font-size:12px;margin:5px 0}.profile .facts b{color:var(--ink2);font-weight:500}.back{color:var(--muted);font-size:12px}
.insight-list{display:grid;gap:0}.insight{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:start;padding:14px 0;border-bottom:1px solid var(--line)}.insight:last-child{border-bottom:0;padding-bottom:0}.insight:first-child{padding-top:0}.insight-icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#293242;color:var(--s1)}.insight-icon.warn{background:#382c25;color:var(--serious)}.insight strong{font-size:13px;font-weight:600}.insight p{margin:4px 0 0;color:var(--muted);font-size:12px}.insight button{padding:5px 8px;font-size:11.5px}
.stat-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--ink2)}.stat-row:last-child{border-bottom:0}.stat-row b{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:550}.stat-row small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.adoption{display:flex;gap:14px;align-items:baseline;margin-bottom:16px}.adoption strong{font-size:32px;line-height:1;font-weight:650;letter-spacing:-.03em}.adoption span{color:var(--muted);font-size:12px}.footnote{font-size:11.5px;color:var(--muted);margin:16px 0 0;line-height:1.6}.callout{border:1px solid #584633;background:#29241d;border-radius:8px;padding:10px 12px;font-size:12px;color:#dbb78d;margin-bottom:14px}.error-list{display:grid;gap:10px}.error-item{border:1px solid var(--line);border-radius:9px;padding:14px;background:#151820}.error-item summary{cursor:pointer;list-style:none;display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:12px;align-items:start}.error-count{font-size:22px;font-weight:650;color:var(--bad);line-height:1.15}.error-count small{display:block;color:var(--muted);font-size:10px;font-weight:400}.error-title{font-size:12.5px;color:var(--ink2);overflow-wrap:anywhere}.error-title strong{color:var(--ink);display:block;margin-bottom:4px}.error-meta{font-size:11px;color:var(--muted);margin-top:7px}.error-body{margin-top:12px;border-top:1px solid var(--line);padding-top:12px}.affected{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.affected button{font-size:11px;padding:4px 7px}.row-note{font-size:11px;color:var(--muted);margin-top:3px}.status-text{font-size:12px;font-weight:550}.good{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--serious)}.definition-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.definition-grid dt{font-size:12px;color:var(--ink2);font-weight:600}.definition-grid dd{margin:5px 0 0;color:var(--muted);font-size:12px;line-height:1.6}
.login{max-width:470px;margin:12vh auto;padding:30px;background:var(--card);border:1px solid var(--line);border-radius:14px}.login h2{margin:0 0 8px;font:600 26px Georgia,serif;color:var(--gold)}.login p{color:var(--ink2);margin:0 0 20px;font-size:13px}.login .row{display:flex;gap:8px;margin-bottom:14px}.login input[type=password]{flex:1;min-width:0}.login label{font-size:12.5px}.login details{color:var(--muted);font-size:12px;margin-top:16px}.login summary{cursor:pointer}.login details p{margin:8px 0 0;color:var(--muted);font-size:12px}#login-msg{color:var(--serious);margin-top:12px;min-height:18px;font-size:13px}
@media(min-width:1550px){.kpis{grid-template-columns:repeat(6,minmax(0,1fr))}.tile .value{font-size:32px}}
@media(max-width:1150px){.shell{grid-template-columns:170px minmax(0,1fr)}.rail{padding-left:12px}.top-inner{padding:12px 18px}.g3,.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.wide-grid{grid-template-columns:1fr}.brand h1{font-size:21px}main{padding-right:18px}}
@media(max-width:820px){.shell{grid-template-columns:minmax(0,1fr)}.rail{min-width:0;position:sticky;top:0;z-index:6;padding:9px 14px;background:var(--page);border-bottom:1px solid var(--line)}.rail-label,.rail-note{display:none}.nav{display:flex;overflow:auto;gap:5px}.nav button{flex:none;padding:7px 10px;font-size:12px}.nav .count{display:none}.top{position:relative}.top-inner{padding:14px}.brand-row{align-items:flex-start}.brand small{font-size:10px}.brand h1{font-size:20px}.brand-mark{width:30px;height:30px}.utility{gap:5px}#status{width:100%;order:3;text-align:left;max-width:none;font-size:11px}.utility details{order:2}.filters{gap:9px;margin-top:12px}.filters label{font-size:11px}main{padding:20px 14px 40px}.page-heading h2{font-size:24px}.g2{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tile .value{font-size:29px}.tile .note{font-size:11px}.page-heading{align-items:start}.scope-badge{white-space:normal}.card{padding:16px}.insight{grid-template-columns:28px minmax(0,1fr)}.insight>button{grid-column:2;justify-self:start}.definition-grid{grid-template-columns:1fr}.profile .acts{flex-wrap:wrap}}
@media(max-width:480px){.scale span{flex-basis:100%;margin-left:0!important}.g3,.g4{grid-template-columns:1fr}.brand-row{flex-wrap:wrap}.utility{width:100%;justify-content:flex-start}.utility #status{order:0;width:auto;flex:1}.top-inner{padding:12px}.filters>label:has(#who){width:100%;display:flex;align-items:center}.filters #who{flex:1;max-width:none}.seg{width:100%;display:flex}.seg button{flex:1;padding:7px 8px;font-size:12px}.page-heading{display:block}.scope-badge{display:inline-block;margin-top:8px}.tile{padding:12px}.tile .value{font-size:26px}.tile .label{font-size:11px}.tile .label .icon{display:none}.head{align-items:start}.table-tools{width:100%}.table-tools input{width:100%;flex:1}.feed li{grid-template-columns:16px minmax(0,1fr)}.feed time{grid-column:2}.error-item summary{grid-template-columns:42px minmax(0,1fr)}.error-item summary>time{grid-column:2;font-size:11px}.login{margin:8vh 14px;padding:24px}.hb,.hb.wide{grid-template-columns:minmax(70px,42%) minmax(0,1fr) auto}.hb .v small{display:block;margin:2px 0 0}.pagination{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
.naming-mode #bar .filters{display:none}
/* A single content viewport: lists no longer fight a second page scrollbar. */
html,body{height:100%;overflow:hidden}body{height:100dvh;display:flex;flex-direction:column;overflow:hidden}
.top{position:relative;flex:none}.shell{width:100%;flex:1;min-height:0;overflow:hidden;align-items:stretch}
.rail{position:static;overflow:auto}.rail-note{font-size:13px}.nav button{font-size:15px;padding:11px}
main{height:100%;min-height:0;overflow:auto;scrollbar-gutter:stable;transition:none}main.loading{opacity:1}
.scroll{max-height:none;overscroll-behavior:auto;scrollbar-gutter:stable}.feed{max-height:none;overflow:visible}
#status{width:280px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.card h2,.card h3{font-size:17px}.card .sub,.footnote,.row-note,.error-meta{font-size:13px}
table{font-size:14px}th{font-size:13px;font-weight:600;color:var(--ink2)}.pill{font-size:13px}
.profile [data-label-slot]{display:inline-flex;align-items:center;gap:10px}.profile [data-label-slot] strong{font-size:22px}.profile [data-label-slot] small{font-size:13px;color:var(--muted)}
.identity strong{font-size:15px}.identity small{font-size:13px}.pen{font-size:16px;padding:4px 7px}
.filters label{font-size:14px}.filters select,.seg button{font-size:14px}.tile .label,.tile .tile-action{font-size:14px}.tile .note{font-size:13px}
.page-heading p,.scope-badge{font-size:14px}.page-heading h2{font-size:28px}.hb,.stat-row,.error-title,.feed li{font-size:14px}
.tester-view{display:flex;flex-direction:column;padding-top:16px;padding-bottom:16px;overflow:hidden}
.tester-view>.page-heading{flex:none;margin-bottom:12px;align-items:center}.tester-view>.page-heading h2{font-size:24px;margin:0}
.tester-view>.page-heading .eyebrow,.tester-view>.page-heading p,.tester-view>.footnote{display:none}
.tester-card{display:flex;flex-direction:column;flex:1;min-height:0;padding:0;overflow:hidden;border-radius:10px}
.tester-toolbar{padding:14px 16px;flex:none;border-bottom:1px solid var(--line)}.tester-toolbar .section-head{margin-bottom:12px}
.tester-modes{display:flex;border:1px solid #555c68;border-radius:8px;overflow:hidden;flex:none}
.tester-modes button{border:0;border-radius:0;padding:8px 14px;font-size:14px}.tester-modes button[aria-pressed=true]{background:var(--gold);color:#211a0d;font-weight:650}
.tester-controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px}.tester-controls input[type=search]{width:250px;max-width:100%}
.tester-controls select{max-width:220px}.filter-toggle{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--ink);font-weight:550;white-space:nowrap}
.filter-toggle b{color:var(--gold);font-size:13px}.filter-toggle input{width:16px;height:16px}.detail-toggle{font-size:13px}
.tester-scroll{flex:1;min-height:0;max-height:none;overflow:auto;scroll-padding-top:44px;overflow-anchor:none}
.tester-table{min-width:820px}.tester-table th{z-index:2}.tester-table td{padding:10px 12px}.tester-table .identity{display:inline-block;vertical-align:middle}
.tester-footer{flex:none;padding:10px 16px;border-top:1px solid var(--line);background:#171a20;font-size:13px;color:var(--ink2);min-width:0}
.tester-footer .pagination{margin:0 0 5px;font-size:14px}.tester-footer #tester-sort-note{font-size:12px;color:var(--muted)}
.tester-footer #name-status{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:21px}
#names-help{display:block;font-size:12px;color:var(--muted)}
.names-table{table-layout:fixed;width:100%;font-size:14px}.names-table .code-col{width:84px}.names-table th{z-index:2;padding:10px 9px;background:#252a33}
.names-table td{height:38px;padding:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.names-table .code-key{font:13px ui-monospace,monospace;padding:0 9px;color:#d3d7e0;background:#20242c;white-space:nowrap;user-select:all}
.name-cell{position:relative;height:37px}.name-cell input{width:100%;height:100%;min-width:0;border:0;border-radius:0;padding:6px 28px 6px 10px;background:#181c23;color:var(--ink);font-size:14px;outline-offset:-2px}
.name-cell input::placeholder{color:#8d95a4}.name-cell input:hover{background:#242a34}.name-cell input:focus{outline:2px solid var(--gold);background:#262a31;z-index:1;position:relative}
.cell-status{position:absolute;right:9px;top:7px;pointer-events:none;z-index:2;font-size:14px;color:var(--muted)}
.name-cell[data-state=saved] .cell-status{color:var(--good)}.name-cell[data-state=dirty] .cell-status{color:var(--gold)}
.name-cell[data-state=error] input{box-shadow:inset 0 0 0 2px var(--bad)}.name-cell[data-state=error] .cell-status{color:var(--bad);font-weight:700}
@media(max-width:1150px){.tester-controls{gap:8px}.tester-controls input[type=search]{width:210px}}
@media(max-width:820px){.shell{grid-template-rows:auto minmax(0,1fr)}.rail{padding:7px 12px;overflow:hidden}.nav button{font-size:14px;padding:8px 10px}.top-inner{padding:10px 12px}.filters{margin-top:10px;gap:8px}.filters label{font-size:13px}.utility #status{width:170px;max-width:170px;font-size:12px}.tester-view{padding:12px}.tester-toolbar{padding:12px}.tester-controls{gap:8px 10px}.tester-footer{padding:8px 12px}.tester-view>.page-heading h2{font-size:21px}.tester-view>.page-heading .scope-badge{font-size:12px}.tester-modes button{padding:7px 10px}.tester-controls .filter-toggle{font-size:13px}.tester-controls select{max-width:210px}}
@media(max-width:480px){.tester-view>.page-heading{display:flex;margin-bottom:8px}.tester-view>.page-heading .scope-badge{display:none}.tester-toolbar .section-head{gap:8px}.tester-toolbar h2{font-size:15px}.tester-controls input[type=search]{width:100%}.tester-controls select{max-width:100%;flex:1}.tester-modes button{font-size:13px;padding:6px 9px}.tester-controls .filter-toggle{font-size:12px}#names-help{font-size:11px}.tester-footer{font-size:12px}.names-table .code-col{width:78px}.tester-view>.page-heading h2{font-size:20px}.filters label{font-size:12px}}

`;

export const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>CartoVox Delta report</title><style>${STYLE}</style></head><body>
<header class="top" id="bar" hidden><div class="top-inner">
  <div class="brand-row"><div class="brand"><span class="brand-mark" aria-hidden="true">◈</span><div><h1>CartoVox Delta</h1><small>Programme analytics</small></div></div>
    <div class="utility"><span id="status" aria-live="polite"></span><button id="refresh" type="button" class="primary">Refresh</button>
      <details><summary>Report options</summary><div class="menu">
        <label title="Pauses while this tab is in the background"><input id="auto" type="checkbox"> Refresh every 5 min</label>
        <button id="download" type="button">Download report JSON</button>
        <button id="forget" type="button">Forget token</button>
      </div></details></div>
  </div>
  <div class="filters"><span class="seg" id="range" role="group" aria-label="Date range">
    <button type="button" data-days="7">7 days</button><button type="button" data-days="30">30 days</button>
    <button type="button" data-days="90">90 days</button><button type="button" data-days="0">All time</button></span>
    <label><span class="scope-label">Tester</span><select id="who" aria-label="Show one tester"><option value="">Everyone</option></select></label>
    <label title="Leave the owner's production checks out of the report"><input id="hide-test" type="checkbox" checked> Exclude owner’s test code</label>
  </div>
</div></header>
<form id="f" class="login"><h2>CartoVox Delta report</h2><p>Engagement, reliability, and the people testing CartoVox.</p>
  <div class="row"><input id="t" type="password" placeholder="Admin token" aria-label="Admin token" autocomplete="current-password" required><button class="primary">Open</button></div>
  <label><input id="remember" type="checkbox" checked> Remember on this browser</label><div id="login-msg" role="alert"></div>
  <details><summary>Which token do I use?</summary><p>Use the admin token set for cartovox.org. A tester’s D-code unlocks the desktop app only. If the admin token was changed, use the new value.
  The owner can set it in Cloudflare → Workers &amp; Pages → cartovox → Settings → Variables and Secrets → ADMIN_TOKEN.</p></details>
</form>
<div class="shell" id="app" hidden><aside class="rail"><div class="rail-label">Your programme</div><nav class="nav" id="sections" aria-label="Report sections"></nav><div class="rail-note"><strong>One report, five views</strong>Filters apply across every section. Changing sections uses the loaded report.</div></aside><main id="dash" hidden></main></div>
<div id="tip" role="tooltip" hidden></div><script src="/admin/script"></script></body></html>`;

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
  const state = { token: '', data: null, timer: 0, request: null, days: 7, today: '', slot: '', view: 'overview', stale: false,
    testers: { sort: 'last_seen', dir: -1, filter: 'activated', q: '', page: 0, detailed: false, mode: 'directory', activeOnly: false, unnamedOnly: false },
    features: { area: 'all', q: '', all: false, sort: 'uses' }, errors: { q: '', sort: 'testers' }, jobs: { q: '', sort: 'runs' } };

  const labelDrafts = new Map();
  let labelRevision = 0;

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
  const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayLabel = key => shortDay.format(new Date(key + 'T00:00:00Z'));
  const dayLong = key => longDay.format(new Date(key + 'T00:00:00Z'));
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
    if (s < 10) return s.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' s';
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
  // A code's nickname (the codes table's note), for every place a code shows.
  const nickOf = slot => (state.data?.directory || []).find(x => x.slot === slot)?.note || '';
  const plainName = slot => (nickOf(slot) ? `${nickOf(slot)} (${slot})` : slot);
  const nameHtml = slot => `<strong>${esc(slot)}</strong>${nickOf(slot) ? `<span class="nick">${esc(nickOf(slot))}</span>` : ''}`;
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
      if ((i % every === 0 && keys.length - 1 - i >= every) || last) {
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

  const rampStep = (v, max) => (v <= 0 || max <= 0 ? RAMP[0] : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor((v / max) * (RAMP.length - 1.001)))]);

  // Seven rows (Monday first) by 24 hours in the owner's local time.
  function heatmap(el, grid) {
    const rows = [1, 2, 3, 4, 5, 6, 0];
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const width = Math.max(240, el.clientWidth || 600);
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
    return `<div class="hb${opts.wide ? ' wide' : ''}">` + rows.map(r => `<div class="l" title="${esc(r.title || r.label)}">${esc(r.label)}${r.small ? ` <small>${esc(r.small)}</small>` : ''}</div>`
      + `<div class="t"><div class="b" style="width:${(r.value / max) * 100}%;min-width:${r.value ? 2 : 0}px;background:${r.color || opts.color || 'var(--s1)'}" data-tip="${esc(`${num(r.value)} ${opts.unit || ''}\n${r.title || r.label}`)}"></div></div>`
      + `<div class="v">${esc(opts.fmt ? opts.fmt(r.value) : compact(r.value))}${r.after ? `<small>${esc(r.after)}</small>` : ''}</div>`).join('') + '</div>';
  }

  const VIEWS = {
    overview: ['Overview', 'Programme overview', 'Engagement and reliability at a glance.'],
    testers: ['Testers', 'Testers', 'Find active testers, follow up on issues, and manage access.'],
    usage: ['Usage', 'How CartoVox is being used', 'Input time, feature reach, and daily activity.'],
    reliability: ['Reliability', 'Issues and job performance', 'Find widespread errors and separate failures from cancellations.'],
    systems: ['Systems', 'Computers and versions', 'The latest reported configuration of registered computers.'],
  };
  const ICONS = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    testers: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
    usage: '<path d="M3 3v18h18M7 15l4-5 4 3 5-8"/>',
    reliability: '<path d="m12 3 10 18H2L12 3Z M12 9v5M12 17v.1"/>',
    systems: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.overview}</svg>`;
  const percent = (n, total) => total ? Math.round(n / total * 100) + '%' : '—';
  const jobName = name => String(name).replace(/^job:/, '').replace(/[_:]/g, ' ');
  const testerLink = (slot, label) => `<button type="button" class="link" data-open="${esc(slot)}">${esc(label || plainName(slot))}</button>`;
  const jobOutcomes = d => ({ completed: d.totals.completed_jobs ?? Math.max(0, d.totals.runs - d.totals.failed_runs),
    failed: d.totals.failed_jobs, cancelled: d.totals.cancelled_jobs, other: d.totals.other_jobs });

  function navHtml(d) {
    return Object.entries(VIEWS).map(([key, [label]]) => {
      const count = key === 'testers' ? d.totals.testers : key === 'reliability' ? d.totals.errors : '';
      return `<button type="button" data-view="${key}" aria-label="${label}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span>${count !== '' ? `<span class="count">${num(count)}</span>` : ''}</button>`;
    }).join('');
  }
  function pageHeading(d) {
    const view = VIEWS[state.view];
    const range = d.range.days ? `${dayLabel(d.daily[0]?.day || state.today)} – ${dayLabel(d.daily.at(-1)?.day || state.today)}` : 'All recorded activity';
    const offset = d.range.tz || 0;
    const zone = 'UTC' + (offset >= 0 ? '+' : '−') + String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0') + ':' + String(Math.abs(offset) % 60).padStart(2, '0');
    const scope = state.view === 'testers' && state.testers.mode === 'names' && !d.range.slot ? 'All issued codes' : d.range.slot ? plainName(d.range.slot) : 'Everyone' + (d.range.exclude?.length ? ' · owner checks excluded' : '');
    return `<div class="page-heading"><div><span class="eyebrow">Delta programme · ${esc(range)}</span><h2>${esc(view[1])}</h2><p>${esc(view[2])}</p></div><span class="scope-badge">${esc(scope)}</span></div>`
      + (state.stale ? '<div class="callout" role="status">Showing the last successful report. Refresh to get the latest numbers.</div>' : '')
      + `<p class="footnote" style="margin:-10px 0 18px">Report generated ${esc(when(d.generated_at))} · calendar days at ${esc(zone)}, your current offset${d.coverage?.daily_truncated ? ' · charts show the most recent 400 days; totals cover all time' : ''}</p>`;
  }
  function summaryTiles(d) {
    const t = d.totals; const p = d.previous || {}; const one = Boolean(d.range.slot);
    const affected = d.testers.filter(row => row.errors > 0).length;
    const complete = jobOutcomes(d).completed;
    const activeDays = d.daily.filter(row => row.testers > 0).length;
    const tile = (label, value, note, symbol, view, change = '') => `<div class="card tile${symbol === 'testers' ? ' hero' : ''}"><div class="label"><button type="button" class="tile-action" data-view="${view}">${label} ↗</button>${icon(symbol)}</div><div class="value">${value}</div><div class="note">${note}</div>${change ? `<div style="margin-top:7px">${change}</div>` : ''}</div>`;
    return `<section class="kpis" aria-label="Report summary">`
      + tile(one ? 'Days with reports' : 'Active testers', num(one ? activeDays : t.testers), one ? `of ${num(d.daily.length)} chart days` : `${num(t.codes_activated)} activated codes in the pool`, 'testers', 'testers', one ? '' : deltaHtml(t.testers, p.testers))
      + tile('Input time', duration(t.active_minutes * 60), `${num(t.active_minutes)} active minutes`, 'clock', 'usage', deltaHtml(t.active_minutes, p.active_minutes))
      + tile('Sessions started', num(t.sessions), `${compact(t.hours)} app-open hours, including idle time`, 'usage', 'usage', deltaHtml(t.sessions, p.sessions))
      + tile('Jobs completed', percent(complete, t.runs), `${num(complete)} of ${num(t.runs)} reported jobs`, 'check', 'reliability')
      + tile('Error reports', num(t.errors), `${num(affected)} ${affected === 1 ? 'tester' : 'testers'} affected`, 'reliability', 'reliability', deltaHtml(t.errors, p.errors, false))
      + tile('Unclean closes', num(t.unclean), 'Crash, forced quit, or interrupted shutdown', 'systems', 'reliability')
      + '</section>';
  }
  function adoptionSection(d) {
    if (d.range.slot) {
      const row = d.testers[0];
      return `<div class="card"><h2>Tester activity</h2><div class="sub">What this tester reported in the selected period.</div>`
        + `<div class="stat-row"><span>Days with input<small>Based on reported workspace input minutes</small></span><b>${num(Object.keys(row?.days || {}).length)}</b></div>`
        + `<div class="stat-row"><span>Input time per session start<small>Input time divided by session starts; not session duration</small></span><b>${d.totals.sessions ? duration(d.totals.active_minutes * 60 / d.totals.sessions) : '—'}</b></div>`
        + `<div class="stat-row"><span>Last event<small>Latest activity event, rather than a background check-in</small></span><b>${row?.last_event ? esc(ago(row.last_event)) : 'None in this period'}</b></div></div>`;
    }
    const t = d.totals;
    const activated = d.testers.filter(row => row.computers > 0);
    const newCodes = activated.filter(row => row.first_seen && (!d.range.since || row.first_seen >= d.range.since));
    const quiet = activated.filter(row => !row.last_event && row.status !== 'revoked');
    const rows = [
      { label: 'Active, available codes', value: d.testers.filter(row => row.status !== 'revoked' && row.last_event).length, color: 'var(--s1)' },
      { label: 'Activated, no events', value: quiet.length, color: 'var(--s2)' },
      { label: 'Never activated', value: d.testers.filter(row => !row.computers && row.status !== 'revoked').length, color: '#545d6d' },
      { label: 'Revoked codes', value: t.codes_revoked, color: 'var(--bad)' },
    ];
    return `<div class="card"><div class="head section-head"><div><h2>Adoption & activity</h2><div class="sub">Activation is lifetime history; activity follows the selected dates.</div></div><button type="button" data-view="testers">View testers</button></div>`
      + `<div class="adoption"><strong>${num(t.codes_activated)}<span> / ${num(t.codes_issued)}</span></strong><span>issued codes have unlocked a computer</span></div>`
      + hbars(rows, { unit: 'codes' })
      + `<div class="stat-row"><span>First activated in this period</span><b>${num(newCodes.length)}</b></div>`
      + `<div class="stat-row"><span>Computers seen in this period</span><b>${num(t.computers)}</b></div>`
      + `<p class="footnote">The code pool can include codes that have not been shared. No events does not prove the app was unused.</p></div>`;
  }
  function attentionSection(d) {
    const groups = d.error_groups.slice().sort((a, b) => b.testers - a.testers || b.count - a.count);
    const issue = groups[0]; const outcomes = jobOutcomes(d);
    const risky = d.performance.filter(job => job.failed > 0).sort((a, b) => b.failed - a.failed)[0];
    const rows = [];
    if (issue) rows.push(`<div class="insight"><span class="insight-icon warn">${icon('reliability')}</span><div><strong>Most widespread error · ${num(issue.testers)} testers</strong><p title="${esc(issue.message || issue.type)}">${esc(String(issue.message || issue.type || issue.name).slice(0, 160))}</p><p>${num(issue.count)} reports · last seen ${esc(ago(issue.last_at))}</p></div><button type="button" data-investigate="${esc(issue.message || issue.type || issue.name)}">Investigate</button></div>`);
    if (outcomes.failed != null && outcomes.failed > 0) rows.push(`<div class="insight"><span class="insight-icon warn">${icon('usage')}</span><div><strong>${num(outcomes.failed)} jobs reported failure</strong><p>${risky ? `${esc(jobName(risky.name))} accounts for ${num(risky.failed)} failed runs.` : 'Open reliability to inspect failure messages and progress.'} Cancelled jobs are counted separately.</p></div><button type="button" data-view="reliability">View jobs</button></div>`);
    if (d.totals.unclean) rows.push(`<div class="insight"><span class="insight-icon warn">${icon('systems')}</span><div><strong>${num(d.totals.unclean)} unclean session closes</strong><p>Follow up with the testers reporting interrupted shutdowns.</p></div><button type="button" data-tattention="unclean">Find testers</button></div>`);
    const affected = d.testers.filter(row => row.errors > 0).sort((a, b) => b.errors - a.errors)[0];
    if (affected && rows.length < 3) rows.push(`<div class="insight"><span class="insight-icon">${icon('testers')}</span><div><strong>${esc(plainName(affected.slot))}</strong><p>${num(affected.errors)} error reports in this period.</p></div><button type="button" data-open="${esc(affected.slot)}">Open tester</button></div>`);
    return `<div class="card"><h2>Worth a closer look</h2><div class="sub">Based on reports received in the selected period.</div><div class="insight-list">${rows.length ? rows.slice(0, 3).join('') : '<div class="empty">No errors, failed jobs, or unclean closes reported in this period.</div>'}</div></div>`;
  }
  function activityCharts(d, detailed = false) {
    return `<section class="grid g2"><div class="card"><h2>${d.range.slot ? 'Input minutes per day' : 'Active testers per day'}</h2><div class="sub">${d.range.slot ? 'Minutes with input while the app was in front.' : 'Codes reporting any activity event that day.'}</div><div class="chart" id="c-testers"></div></div>`
      + `<div class="card"><h2>${detailed ? 'App-open hours per day' : 'Input time per day'}</h2><div class="sub">${detailed ? 'Includes idle time; runs count on their final reported day.' : 'Minutes with clicks, keys, or scrolling in the foreground.'}</div><div class="chart" id="c-hours"></div></div></section>`;
  }
  function reliabilitySummary(d) {
    const o = jobOutcomes(d); const t = d.totals;
    const value = n => n == null ? '—' : num(n);
    return `<section class="grid g4" style="margin:0 0 18px">`
      + `<div class="card tile"><div class="label">Completed jobs</div><div class="value good">${value(o.completed)}</div><div class="note">${percent(o.completed, t.runs)} of ${num(t.runs)} reported runs</div></div>`
      + `<div class="card tile"><div class="label">Failed jobs</div><div class="value bad">${value(o.failed)}</div><div class="note">Explicitly reported as failed</div></div>`
      + `<div class="card tile"><div class="label">Cancelled jobs</div><div class="value warn">${value(o.cancelled)}</div><div class="note">Not classified as failures</div></div>`
      + `<div class="card tile"><div class="label">Other / unknown outcome</div><div class="value">${value(o.other)}</div><div class="note">Missing or another recorded status</div></div></section>`;
  }
  function definitionsSection(d) {
    return `<details class="card more"><summary>How to read these numbers & data coverage</summary><dl class="definition-grid">`
      + `<div><dt>Active testers</dt><dd>Distinct access codes reporting an activity event in the selected period. An activation or background check-in alone does not count.</dd></div>`
      + `<div><dt>Input time</dt><dd>Workspace minutes with input while the window was in front. Overlapping tab counters are not added again. Older Delta V1 rows use one minute per feature event.</dd></div>`
      + `<div><dt>App-open hours</dt><dd>Run lengths at a clean close or last heartbeat. Includes idle and background time. A long-running session contributes its reported duration on its final reported day.</dd></div>`
      + `<div><dt>Job timings</dt><dd>Median is the middle of timed runs; P95 is the nearest-rank 95th percentile. Runs without a numeric duration are excluded. Failed and cancelled runs with timings are included.</dd></div>`
      + `<div><dt>Unclean closes</dt><dd>An app-reported interrupted shutdown, which can be a crash, forced quit, or another interruption. It is not a confirmed crash count.</dd></div>`
      + `<div><dt>Coverage & limits</dt><dd>${d.coverage?.first_day ? `First activity in this report: ${esc(dayLong(d.coverage.first_day))}. ` : ''}Charts show up to 400 days; all-time totals cover the full history. Up to ${num(d.coverage?.feature_limit || 500)} feature counters, 40 error groups, 60 recent errors, and 60 tester sessions are included. Events can be missing during offline periods or service outages.</dd></div></dl></details>`;
  }
  function usageSummary(d) {
    const days = d.daily.filter(row => row.testers > 0).length;
    const t = d.totals; const top = (d.time || []).filter(row => row.kind === 'workspace').sort((a, b) => b.minutes - a.minutes)[0];
    return `<section class="grid g3" style="margin:0 0 18px"><div class="card tile"><div class="label">Input time</div><div class="value">${duration(t.active_minutes * 60)}</div><div class="note">${t.testers ? duration(t.active_minutes * 60 / t.testers) : '—'} per active tester</div></div>`
      + `<div class="card tile"><div class="label">Days with activity</div><div class="value">${num(days)}<span class="note"> / ${num(d.daily.length)}</span></div><div class="note">Calendar days shown in the chart</div></div>`
      + `<div class="card tile"><div class="label">Most-used workspace</div><div class="value" style="font-size:25px">${esc(top?.name || '—')}</div><div class="note">${top ? duration(top.minutes * 60) + ' of reported input time' : 'No workspace input counters reported'}</div></div></section>`;
  }
  function systemsInventory(d) {
    const list = d.machines.slice(0, 100);
    return `<section class="card" style="margin-top:16px"><h2>Registered computers</h2><div class="sub">Latest reported facts; this inventory includes computers outside the selected activity dates.</div><div class="scroll"><table style="min-width:720px"><thead><tr><th>Tester</th><th>System</th><th>App / release</th><th class="num">CPU cores</th><th class="num">RAM</th><th>Last contact</th></tr></thead><tbody>`
      + list.map(row => `<tr><td>${testerLink(row.slot)}</td><td>${esc([row.os, row.arch].filter(Boolean).join(' · ') || 'Unknown')}<div class="row-note">${esc(row.os_version || '')}</div></td><td>${esc(row.app_version || 'Unknown')}<div class="row-note">${esc(row.release || '')}</div></td><td class="num">${row.cpu_count == null ? '—' : num(row.cpu_count)}</td><td class="num">${row.memory_gb == null ? '—' : num(row.memory_gb) + ' GB'}${row.release === 'Delta V1' ? '<div class="row-note">free memory, legacy build</div>' : ''}</td><td title="${esc(when(row.last_seen))}">${esc(ago(row.last_seen))}</td></tr>`).join('')
      + (list.length ? '' : '<tr><td colspan="6" class="empty">No registered computers for this scope.</td></tr>') + '</tbody></table></div>'
      + (d.machines.length > 100 ? '<p class="footnote">Showing the 100 most recently seen computers. The JSON export includes the full inventory.</p>' : '') + '</section>';
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

  function codeActions(r) {
    return (r.status === 'revoked'
      ? `<button type="button" data-act="restore" data-slot="${esc(r.slot)}">Restore</button>`
      : `<button type="button" data-act="revoke" data-slot="${esc(r.slot)}">Revoke</button>`)
      + (r.computers ? ` <button type="button" data-act="free" data-slot="${esc(r.slot)}" title="Let this code unlock new computers">Free computers</button>` : '');
  }

  // One tester: who, since when, on what, and their sessions.
  function profileSection(d) {
    const r = d.testers[0] || { slot: d.range.slot, status: 'active', computers: 0, max_installs: 0 };
    const st = testerStatus(r);
    const first = d.machines.map(m => m.first_seen).filter(Boolean).sort()[0];
    const machines = d.machines.length ? `<table><thead><tr><th>System</th><th>Version</th><th class="num">CPUs</th>
      <th class="num">Memory</th><th>First unlocked</th><th>Last contact</th></tr></thead><tbody>${d.machines.map(m =>
        `<tr><td>${esc([m.os, m.os_version, m.arch].filter(Boolean).join(' · '))}</td><td>${esc([m.app_version, m.release].filter(Boolean).join(' · '))}</td>
        <td class="num">${esc(m.cpu_count ?? '—')}</td><td class="num" title="${m.release === 'Delta V1' ? 'Delta V1 reported free memory, not installed memory' : 'Installed memory'}">${m.memory_gb ? esc(m.memory_gb) + ' GB' + (m.release === 'Delta V1' ? ' free' : '') : '—'}</td>
        <td title="${esc(when(m.first_seen))}">${esc(ago(m.first_seen))}</td><td title="${esc(when(m.last_seen))}">${esc(ago(m.last_seen))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">This code has not unlocked a computer yet.</p>';
    return `<section class="card profile" style="margin-bottom:16px"><div class="head"><div>
        <button type="button" class="link back" data-open="">← Everyone</button>
        <h2 class="pname"><span data-label-slot="${esc(r.slot)}">${esc(r.note || r.slot)}${r.note ? `<span class="code">${esc(r.slot)}</span>` : ''}</span>
          <button type="button" class="pen" data-nick="${esc(r.slot)}" aria-label="Set Discord label for ${esc(r.slot)}" title="Set Discord ID or name">✎ ${r.note ? 'Rename' : 'Add Discord label'}</button></h2>
        <div class="facts"><span class="pill" style="--c:${st.c}">${st.label}</span>
          <span>first unlocked <b>${first ? esc(ago(first)) : '—'}</b></span>
          <span>last contact <b>${r.last_seen ? esc(ago(r.last_seen)) : '—'}</b></span>
          <span>computers <b>${num(r.computers)} / ${num(r.max_installs)}</b></span></div></div>
        <div class="acts">${codeActions(r)}</div></div><details class="more"><summary>Registered computers (${d.machines.length})</summary><div class="scroll">${machines}</div></details></section>`;
  }

  function sessionsSection(d) {
    const rows = d.sessions || [];
    return `<section class="card" style="margin-top:16px"><h2>Sessions</h2><div class="sub">Each time the app was opened in the range, newest first. A session with no length was still open or did not close cleanly.</div>`
      + (rows.length ? `<div class="scroll" style="max-height:420px"><table><thead><tr><th>Started</th><th class="num">Length</th>
        <th class="num">Active min</th><th class="num">Jobs</th><th class="num">Unfinished</th><th class="num">Errors</th><th>Version</th></tr></thead><tbody>`
        + rows.map(x => `<tr><td title="${esc(when(x.started))}">${esc(when(x.started))} <span class="note">· ${esc(ago(x.started))}</span></td>
          <td class="num" title="${x.closed === 0 ? 'Not closed cleanly: the length runs to its last heartbeat' : ''}">${x.seconds == null ? '—' : esc(duration(x.seconds))}${x.closed === 0 && x.seconds != null ? ' <span class="note">· open or crashed</span>' : ''}</td><td class="num">${num(x.active_minutes)}</td>
          <td class="num">${num(x.jobs)}</td><td class="num">${x.unfinished ? `<span style="color:var(--serious)">${num(x.unfinished)}</span>` : '0'}</td>
          <td class="num">${x.errors ? `<span style="color:#ef6b6b">${num(x.errors)}</span>` : '0'}</td><td>${esc(x.app_version || '')}</td></tr>`).join('')
        + '</tbody></table></div>' : '<p class="empty">No sessions in this range.</p>') + '</section>';
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
    ['slot', 'Tester'], ['status', 'Status'], ['active_minutes', 'Input time', true, 'num'],
    ['sessions', 'Sessions', true, 'num'], ['errors', 'Errors', true, 'num'], ['last_seen', 'Last contact'],
    ['activity', 'Input days', false, '', true], ['hours', 'App-open h', true, 'num', true],
    ['unclean', 'Unclean', true, 'num', true], ['computers', 'Computers', true, 'num', true],
    ['os', 'System', true, '', true], ['app_version', 'App version', true, '', true], ['actions', '', false],
  ];
  const TESTER_SORTS = [
    ['slot:1', 'Code: low to high'], ['slot:-1', 'Code: high to low'],
    ['note:1', 'Discord label: A to Z'], ['note:-1', 'Discord label: Z to A'],
    ['last_seen:-1', 'Most recent contact'], ['last_seen:1', 'Oldest contact'],
    ['active_minutes:-1', 'Most input time'], ['sessions:-1', 'Most sessions'], ['errors:-1', 'Most errors'],
  ];
  function testerSortOptions() {
    const key = state.testers.sort + ':' + state.testers.dir;
    const rows = TESTER_SORTS.slice();
    if (!rows.some(row => row[0] === key)) rows.push([key, (TESTER_COLS.find(col => col[0] === state.testers.sort)?.[1] || state.testers.sort) + (state.testers.dir > 0 ? ': ascending' : ': descending')]);
    return rows.map(([value, label]) => `<option value="${esc(value)}" ${value === key ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }
  const testerColumns = () => TESTER_COLS.filter(col => !col[4] || state.testers.detailed);
  function testerRows() {
    const d = state.data; const s = state.testers; const q = s.q.trim().toLowerCase();
    const matches = row => s.filter === 'all' || (s.filter === 'activated' ? row.computers > 0
      : s.filter === 'attention' ? row.errors > 0 || row.unclean > 0
      : s.filter === 'unclean' ? row.unclean > 0 : testerStatus(row).key === s.filter);
    const val = (row, key) => key === 'status' ? testerStatus(row).label : row[key] ?? '';
    return (s.mode === 'names' ? d.directory || d.testers : d.testers).filter(row => matches(row) && (!s.activeOnly || Boolean(row.last_event)) && (!s.unnamedOnly || s.mode !== 'names' || !row.note) && (!q || [row.slot, row.note, row.os, row.app_version, testerStatus(row).label].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => { const x = val(a, s.sort); const y = val(b, s.sort);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: s.sort === 'slot' })) * s.dir || a.slot.localeCompare(b.slot, undefined, { numeric: true }); });
  }
  function testerModes() {
    return `<div class="tester-modes" role="group" aria-label="Tester view"><button type="button" id="tester-activity" aria-pressed="${state.testers.mode === 'directory'}">Tester activity</button><button type="button" id="name-codes" aria-pressed="${state.testers.mode === 'names'}">Name codes</button></div>`;
  }
  function testersSection(d) {
    const s = state.testers;
    const names = s.mode === 'names';
    const groups = [['all', 'All codes'], ['activated', 'Activated codes'], ['attention', 'With issues'], ['quiet', 'No events'], ['unused', 'Never activated'], ['revoked', 'Revoked'], ['unclean', 'Unclean closes']];
    return `<section class="card tester-card"><div class="tester-toolbar"><div class="head section-head"><h2>${names ? 'Code names' : 'Tester directory'}</h2>${testerModes()}</div>`
      + `<div class="tester-controls"><input id="tq" type="search" aria-label="Search testers" placeholder="Find a code or Discord name" value="${esc(s.q)}"><select id="tsort" aria-label="Sort testers">${names ? TESTER_SORTS.filter(([key]) => /^(slot|note):/.test(key)).map(([value,label]) => `<option value="${value}" ${value === s.sort + ':' + s.dir ? 'selected' : ''}>${label}</option>`).join('') : testerSortOptions()}</select>`
      + (names ? `<label class="filter-toggle" title="Saved rows stay in place until you change filters"><input id="names-unnamed" type="checkbox" ${s.unnamedOnly ? 'checked' : ''}> Unnamed codes only</label>`
        : `<label class="filter-toggle" title="Codes with activity events during the selected dates"><input id="tester-active" type="checkbox" ${s.activeOnly ? 'checked' : ''}> Active in period only <b>${num(d.testers.filter(row => row.last_event).length)}</b></label><select id="tester-group" aria-label="Tester group">${groups.map(([key,label]) => `<option value="${key}" ${s.filter === key ? 'selected' : ''}>${label}</option>`).join('')}</select><label class="detail-toggle"><input id="tester-details" type="checkbox" ${s.detailed ? 'checked' : ''}> More columns</label><button type="button" id="tester-csv">Export CSV</button>`)
      + '</div></div>'
      + (names ? `<div class="scroll tester-scroll" id="tester-scroll" role="region" aria-label="Code naming sheet" tabindex="0"><table class="names-table" aria-label="Code names"><colgroup id="names-cols"></colgroup><thead id="names-head"></thead><tbody id="names-body"></tbody></table></div><div class="tester-footer"><span id="name-status" role="status" aria-live="polite"></span><span id="names-help">Enter / Tab: save & next code · Shift+Enter: previous · Esc: undo edit</span></div>`
        : `<div class="scroll tester-scroll" id="tester-scroll" role="region" aria-label="Tester activity table" tabindex="0"><table class="tester-table" id="tt"><thead><tr>${testerColumns().map(([key,label,sortable=true,cls='']) => `<th class="${cls}" ${sortable ? `data-sort="${key}"` : ''} ${s.sort === key ? `aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${sortable ? `<button type="button" class="sort-label" aria-label="Sort by ${esc(label)}">${esc(label)}</button>` : esc(label)}</th>`).join('')}</tr></thead><tbody id="tbody"></tbody></table></div><div class="tester-footer"><div class="pagination" id="tester-pages"></div><span id="tester-sort-note">Active means an activity event in the selected dates; last contact also includes background check-ins.</span></div>`)
      + '</section>';
  }
  function setTesterMode(mode) {
    if (state.testers.mode === mode) return;
    Object.assign(state.testers, { mode, filter: mode === 'names' ? 'all' : 'activated', activeOnly: false, unnamedOnly: false, q: '', page: 0 });
    if (mode === 'names') Object.assign(state.testers, { sort: 'slot', dir: 1 });
    render(); resetTesterScroll();
  }
  function resetTesterScroll() {
    const pane = $('tester-scroll'); if (pane) pane.scrollTop = 0;
  }
  function renderTesterRows() {
    const d = state.data; const s = state.testers;
    if (s.mode === 'names') { renderNameRows(); return; }
    const rows = testerRows(); const count = rows.length; const pageSize = 100;
    s.page = Math.max(0, Math.min(s.page, Math.ceil(count / pageSize) - 1)); const start = s.page * pageSize;
    $('tester-pages').innerHTML = `<span role="status">${count ? `${start + 1}–${Math.min(start + pageSize, count)}` : '0'} of ${num(count)} matching testers</span><div class="acts"><button type="button" data-tpage="-1" ${s.page === 0 ? 'disabled' : ''}>Previous</button><button type="button" data-tpage="1" ${start + pageSize >= count ? 'disabled' : ''}>Next</button></div>`;
    const cell = (row, key) => {
      if (key === 'slot') return `<button type="button" class="link identity" data-label-slot="${esc(row.slot)}" data-open="${esc(row.slot)}"><strong>${esc(row.note || row.slot)}</strong>${row.note ? `<small>${esc(row.slot)}</small>` : ''}</button> <button type="button" class="pen" data-nick="${esc(row.slot)}" aria-label="Set Discord label for ${esc(row.slot)}" title="Set Discord ID or name for ${esc(row.slot)}">✎</button>`;
      if (key === 'status') { const st = testerStatus(row); return `<span class="pill" style="--c:${st.c}">${st.label}</span>`; }
      if (key === 'active_minutes') return row.active_minutes ? esc(duration(row.active_minutes * 60)) : '—';
      if (key === 'last_seen') return `<span title="${esc(when(row.last_seen))}">${row.last_seen ? esc(ago(row.last_seen)) : '—'}</span>`;
      if (key === 'activity') return row.computers ? strip(row.days || {}, d.daily.map(day => day.day)) : '—';
      if (key === 'computers') return `${num(row.computers)} / ${num(row.max_installs)}`;
      if (key === 'actions') return `<details class="more" style="margin:0"><summary aria-label="Manage ${esc(plainName(row.slot))}">Manage</summary><div class="acts" style="margin-top:7px">${codeActions(row)}</div></details>`;
      if (['errors', 'unclean'].includes(key)) return `<span class="${row[key] ? 'warn' : ''}">${num(row[key])}</span>`;
      return ['sessions', 'hours'].includes(key) ? num(row[key]) : esc(row[key] || '—');
    };
    $('tbody').innerHTML = count ? rows.slice(start, start + pageSize).map(row => `<tr>${testerColumns().map(([key, label, sortable, cls = '']) => `<td class="${cls}">${cell(row, key)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${testerColumns().length}" class="empty">No testers match these filters. Search all codes or choose a different group.</td></tr>`;
  }
  let namingColumns = 1;
  const nameColumns = () => { const width = $('dash').clientWidth || 1200; return width >= 1200 ? 3 : width >= 760 ? 2 : 1; };
  function renderNameRows() {
    const rows = testerRows(); namingColumns = nameColumns();
    $('names-cols').innerHTML = Array.from({ length: namingColumns }, () => '<col class="code-col"><col>').join('');
    $('names-head').innerHTML = '<tr>' + Array.from({ length: namingColumns }, () => '<th scope="col">Code</th><th scope="col">Discord ID or name</th>').join('') + '</tr>';
    const pairs = rows.map(row => {
      const draft = labelDrafts.get(row.slot);
      const value = draft ? draft.value : row.note || '';
      return `<td class="code-key">${esc(row.slot)}</td><td class="name-value"><div class="name-cell" id="cell-${row.slot}"><input id="code-name-${row.slot}" data-code-name="${row.slot}" aria-label="Discord ID or name for ${row.slot}" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Add a name" value="${esc(value)}"><span class="cell-status" id="save-${row.slot}" aria-hidden="true"></span></div></td>`;
    });
    let html = '';
    for (let i = 0; i < pairs.length; i += namingColumns) html += '<tr>' + Array.from({ length: namingColumns }, (_, n) => pairs[i+n] || '<td></td><td></td>').join('') + '</tr>';
    $('names-body').innerHTML = html || `<tr><td colspan="${namingColumns*2}" class="empty">No codes match these filters.</td></tr>`;
    for (const row of rows) updateNameCell(row.slot);
    updateNameStatus();
  }
  function nameDraft(input) {
    const slot = input.dataset.codeName;
    if (!labelDrafts.has(slot)) labelDrafts.set(slot, { value: input.value, saved: nickOf(slot), saving: false, error: '', revision: 0 });
    return labelDrafts.get(slot);
  }
  function updateNameCell(slot) {
    const draft = labelDrafts.get(slot); const cell = $('cell-' + slot); const mark = $('save-' + slot); const input = $('code-name-' + slot);
    if (!cell || !mark || !input) return;
    const kind = !draft ? '' : draft.saving ? 'saving' : draft.error ? 'error' : draft.value.trim() !== draft.saved ? 'dirty' : 'saved';
    cell.dataset.state = kind; mark.textContent = ({ saving: '…', error: '!', dirty: '•', saved: '✓' })[kind] || '';
    const message = draft?.error || ({ saving: 'Saving', dirty: 'Not saved yet', saved: 'Saved' })[kind] || '';
    mark.title = message; input.title = draft?.error ? message + ' — Enter to retry; your text is kept.' : '';
    if (draft?.error) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function updateNameStatus() {
    const el = $('name-status'); if (!el) return;
    const drafts = [...labelDrafts.values()];
    const failed = drafts.filter(d => d.error).length; const saving = drafts.filter(d => d.saving).length;
    const dirty = drafts.filter(d => d.value.trim() !== d.saved && !d.saving).length;
    el.textContent = failed ? `${failed} label${failed === 1 ? '' : 's'} could not be saved. Text is kept in highlighted cells; Enter retries.`
      : saving ? `Saving ${saving} label${saving === 1 ? '' : 's'}…` : dirty ? `${dirty} unsaved label${dirty === 1 ? '' : 's'} — Enter or Tab to save.`
      : `${num(document.querySelectorAll('[data-code-name]').length)} codes · changes saved automatically`;
    el.title = el.textContent;
  }
  function editNameCell(input) {
    const draft = nameDraft(input); draft.value = input.value; draft.error = '';
    updateNameCell(input.dataset.codeName); updateNameStatus();
  }
  function applyLabel(data, slot, note) {
    for (const list of [data.directory || [], data.testers || []]) {
      const row = list.find(item => item.slot === slot); if (row) row.note = note || null;
    }
  }
  function updateVisibleLabel(slot, note) {
    document.querySelectorAll('[data-label-slot]').forEach(el => {
      if (el.dataset.labelSlot === slot) el.innerHTML = `<strong>${esc(note || slot)}</strong>${note ? `<small>${esc(slot)}</small>` : ''}`;
    });
  }
  async function saveNameCell(input) {
    const slot = input.dataset.codeName; const token = state.token;
    if (!token || !state.data) return;
    const draft = nameDraft(input); draft.value = input.value;
    if (draft.saving) { draft.queued = true; return draft.promise; }
    if (draft.value.trim() === draft.saved) { draft.error = ''; updateNameCell(slot); updateNameStatus(); return; }
    draft.saving = true;
    draft.promise = (async () => {
      do {
        draft.queued = false; draft.error = ''; draft.sent = draft.value.trim();
        updateNameCell(slot); updateNameStatus();
        try {
          const r = await fetch('/v1/admin/codes/' + encodeURIComponent(slot), { method: 'POST',
            headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ note: draft.sent }) });
          const data = await r.json().catch(() => ({}));
          if (state.token !== token || !state.data) return;
          if (r.status === 401) { forget('The admin token was refused. Sign in again.'); return; }
          if (!r.ok) throw new Error(data.error || `Could not save (${r.status})`);
          draft.saved = data.code?.note || ''; draft.revision = ++labelRevision;
          applyLabel(state.data, slot, draft.saved); updateVisibleLabel(slot, draft.saved);
          if (draft.value.trim() === draft.sent) {
            draft.value = draft.saved;
            const current = $('code-name-' + slot); if (current) current.value = draft.saved;
          }
          // Only the picker changes: keep the sheet's DOM, focus and scroll intact.
          fillPicker();
        } catch (error) {
          if (state.token === token) { draft.error = error.message || 'Connection failed'; if (state.testers.mode !== 'names') $('status').textContent = slot + ' was not saved. Return to Name codes to retry.'; }
          break;
        }
      } while (draft.queued && draft.value.trim() !== draft.saved);
    })();
    try { await draft.promise; } finally { draft.saving = false; if (state.token === token) { updateNameCell(slot); updateNameStatus(); } }
  }
  function nameKeydown(event) {
    const input = event.target; if (!input.dataset?.codeName || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault(); const draft = nameDraft(input);
      draft.value = draft.saving ? draft.sent : draft.saved; draft.error = ''; input.value = draft.value;
      updateNameCell(input.dataset.codeName); updateNameStatus(); return;
    }
    if (!['Enter', 'Tab'].includes(event.key)) return;
    saveNameCell(input);
    const inputs = [...document.querySelectorAll('[data-code-name]')];
    const next = inputs[inputs.indexOf(input) + (event.shiftKey ? -1 : 1)];
    if (event.key === 'Enter' || next) event.preventDefault();
    if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function csvCell(value) {
    const text = String(value ?? '');
    const safe = /^[\t\r\n]|^\s*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  function downloadFile(text, type, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([text], { type })); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportTesters() {
    const headers = ['Tester', 'Code', 'Status', 'Input minutes', 'Sessions', 'App-open hours', 'Errors', 'Unclean closes', 'Computers', 'System', 'App version', 'Last contact'];
    const rows = testerRows().map(row => [row.note || '', row.slot, testerStatus(row).label, row.active_minutes, row.sessions, row.hours, row.errors, row.unclean, row.computers, row.os, row.app_version, row.last_seen]);
    downloadFile('\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'cartovox-testers-' + (state.data.range.days ? state.data.range.days + 'days-' : 'all-time-') + state.data.generated_at.slice(0, 10) + '.csv');
  }
  function engagedSection(d) {
    const rows = d.testers.filter(row => row.active_minutes > 0).sort((a, b) => b.active_minutes - a.active_minutes).slice(0, 5);
    return `<div class="card"><div class="head section-head"><div><h2>${d.range.slot ? 'Sessions & engagement' : 'Most engaged testers'}</h2><div class="sub">${d.range.slot ? 'Open the tester section for individual sessions.' : 'Ranked by reported input time, excluding idle hours.'}</div></div><button type="button" data-view="testers">View ${d.range.slot ? 'sessions' : 'all'}</button></div>`
      + (rows.length ? rows.map(row => `<div class="stat-row"><span>${testerLink(row.slot)}<small>${num(row.sessions)} sessions · ${num(Object.keys(row.days || {}).length)} days with input</small></span><b>${duration(row.active_minutes * 60)}</b></div>`).join('') : '<p class="empty">No input time reported in this period.</p>') + '</div>';
  }

  function featuresSection(d) {
    const areas = new Map();
    d.features.forEach(f => areas.set(areaOf(f.name), (areas.get(areaOf(f.name)) || 0) + f.uses));
    const areaRows = [...areas.entries()].sort((a, b) => b[1] - a[1]);
    const s = state.features;
    const chips = [['all', 'All']].concat(areaRows.slice(0, 9).map(([a]) => [a, a]))
      .map(([k, l]) => `<button type="button" data-farea="${esc(k)}" aria-pressed="${s.area === k}">${esc(l)}</button>`).join('');
    return `<section class="grid g2">
      <div class="card"><div class="head"><div><h2>Most used features</h2><div class="sub">Clicks and exports in the range${d.range.slot ? '' : '; the grey figure is how many testers used it'}.</div></div>
        <div class="table-tools"><input id="fq" type="search" aria-label="Search features" placeholder="Filter features" value="${esc(s.q)}"><select id="fsort" aria-label="Sort features"><option value="uses" ${s.sort === 'uses' ? 'selected' : ''}>Most uses</option><option value="testers" ${s.sort === 'testers' ? 'selected' : ''}>Most testers</option><option value="name" ${s.sort === 'name' ? 'selected' : ''}>Name</option></select></div></div>
        <div class="chips" style="margin-bottom:12px">${chips}</div><div id="flist"></div></div>
      <div class="card"><h2>Feature areas</h2><div class="sub">Uses summed by the part of the app they belong to.</div>
        ${hbars(areaRows.slice(0, 16).map(([a, v]) => ({ label: a, value: v })), { unit: 'uses' })}</div>
    </section>`;
  }

  function renderFeatureList() {
    const s = state.features; const q = s.q.trim().toLowerCase();
    const rows = state.data.features.filter(f => (s.area === 'all' || areaOf(f.name) === s.area)
      && (!q || f.name.toLowerCase().includes(q))).sort((a, b) => s.sort === 'name' ? a.name.localeCompare(b.name) : b[s.sort] - a[s.sort] || a.name.localeCompare(b.name));
    const shown = s.all ? rows : rows.slice(0, 20);
    $('flist').innerHTML = hbars(shown.map(f => ({ label: restOf(f.name), small: s.area === 'all' ? areaOf(f.name) : '',
      title: f.name, value: f.uses, after: state.data.range.slot ? '' : `${f.testers} ${f.testers === 1 ? 'tester' : 'testers'} · ${percent(f.testers, state.data.totals.testers)} reach` })), { unit: 'uses' })
      + (rows.length > 20 ? `<p><button type="button" id="fall">${s.all ? 'Show top 20' : `Show all ${rows.length}`}</button></p>` : '')
      + `<p class="footnote">${num(shown.length)} of ${num(rows.length)} matching feature counters. Reach is the share of active testers who used a feature.${state.data.coverage?.features_truncated ? ' The report includes the top 500 counters.' : ''}</p>`;
  }

  const UNLOCK_REASONS = { typo: 'a typing mistake in the code', format: 'not an access code', old_beta: 'an old beta key',
    offline: 'no internet connection', limit: 'the code is on its computer limit', revoked: 'the code was withdrawn',
    unknown: 'the service does not know the code', licence: 'licence not accepted', storage: 'could not save on the computer',
    build: 'the build lacks its code list', other: 'another reason' };
  const GATE_STATES = { unlock: 'asked for a code', accept: 'asked to accept a new licence',
    connect: 'asked to connect (21-day check-in)', revoked: 'told the code was withdrawn' };

  // Where active minutes go, and how the unlock screen went: Delta V2 builds.
  function timeAndUnlockSection(d) {
    const workspaces = (d.time || []).filter(x => x.kind === 'workspace');
    const tabs = (d.time || []).filter(x => x.kind === 'tab');
    const total = workspaces.reduce((sum, x) => sum + x.minutes, 0);
    const rows = list => list.map(x => ({ label: x.name, value: x.minutes,
      after: total ? `${Math.round((x.minutes / total) * 100)}%` : '' }));
    const time = workspaces.length
      ? hbars(rows(workspaces), { unit: 'active minutes', fmt: v => duration(v * 60) })
        + (tabs.length ? `<details class="more" style="margin-top:10px"><summary>By tab (${tabs.length})</summary>${hbars(rows(tabs.slice(0, 20)), { unit: 'active minutes', fmt: v => duration(v * 60) })}</details>` : '')
      : '<p class="empty">No workspace time yet: Delta V2 builds report it.</p>';
    const unlocks = d.unlocks || [];
    const gates = (d.gates || []).map(g => `${esc(GATE_STATES[g.state] || g.state)} <b>${num(g.shown)}</b>×`).join(' · ');
    const unlockTable = unlocks.length ? `<div class="scroll"><table><thead><tr><th>Result</th><th class="num">Attempts</th><th class="num">Testers</th><th class="num">Mean time on screen</th><th class="num">Longest</th></tr></thead><tbody>`
      + unlocks.map(u => `<tr><td>${u.ok ? '<span class="pill" style="--c:var(--good)">Unlocked</span>' : `<span class="pill" style="--c:var(--bad)">Refused</span> ${esc(UNLOCK_REASONS[u.reason] || u.reason)}`}</td>
        <td class="num">${num(u.attempts)}</td><td class="num">${num(u.testers)}</td>
        <td class="num">${u.mean_seconds_on_gate == null ? '—' : esc(duration(u.mean_seconds_on_gate))}</td>
        <td class="num">${u.longest_seconds_on_gate == null ? '—' : esc(duration(u.longest_seconds_on_gate))}</td></tr>`).join('')
      + '</tbody></table></div>' + (unlocks.some(u => u.ok && u.had_install) ? `<p class="note">${num(unlocks.filter(u => u.ok).reduce((s2, u) => s2 + (u.had_install || 0), 0))} unlocks came from a computer that was already registered.</p>` : '')
      : '<p class="empty">No unlocks yet: Delta V2 builds report them.</p>';
    return `<section class="grid g2">
      <div class="card"><h2>Where time goes</h2><div class="sub">Active minutes by workspace: minutes with a click, key or scroll while the window was in front.</div>${time}</div>
      <div class="card"><h2>Unlocking</h2><div class="sub">${gates ? `The unlock screen ${gates}.` : 'Each press of Unlock, and how long testers spent on the screen first.'}</div>${unlockTable}</div>
    </section>`;
  }

  function performanceSection(d) {
    const s = state.jobs;
    return `<section class="card" style="margin-top:16px"><div class="head section-head"><div><h2>Job timings & outcomes</h2><div class="sub">Median describes the middle run; P95 highlights slow runs. Timed failed and cancelled runs are included.</div></div><div class="table-tools"><input id="pq" type="search" aria-label="Search jobs" placeholder="Find a job" value="${esc(s.q)}"><select id="psort" aria-label="Sort jobs"><option value="runs" ${s.sort === 'runs' ? 'selected' : ''}>Most runs</option><option value="p95_seconds" ${s.sort === 'p95_seconds' ? 'selected' : ''}>Slowest P95</option><option value="failed" ${s.sort === 'failed' ? 'selected' : ''}>Most failures</option></select></div></div><div id="job-list"></div>`
      + (d.failures.length ? `<details class="more"><summary>Failure and cancellation details (${d.failures.length} groups)</summary><div class="scroll"><table style="min-width:660px"><thead><tr><th>Job</th><th>Outcome</th><th>Reason</th><th class="num">Runs</th><th class="num">Mean progress</th><th class="num">Mean time</th><th>Message sample</th></tr></thead><tbody>`
        + d.failures.map(row => `<tr><td>${esc(jobName(row.name))}</td><td>${esc(row.status || 'Unknown')}</td><td>${esc(row.failure || '—')}</td><td class="num">${num(row.runs)}</td><td class="num">${row.mean_progress == null ? '—' : num(row.mean_progress) + '%'}</td><td class="num">${row.mean_seconds == null ? '—' : duration(row.mean_seconds)}</td><td><code>${esc(row.message || '—')}</code></td></tr>`).join('') + '</tbody></table></div></details>' : '') + '</section>';
  }
  function renderJobList() {
    const d = state.data; const s = state.jobs; const q = s.q.trim().toLowerCase();
    const rows = d.performance.filter(row => !q || row.name.toLowerCase().includes(q)).sort((a, b) => (b[s.sort] ?? -1) - (a[s.sort] ?? -1) || a.name.localeCompare(b.name));
    const time = value => value == null ? '—' : duration(value);
    $('job-list').innerHTML = rows.length ? `<div class="scroll"><table style="min-width:740px"><thead><tr><th>Job</th><th class="num">Runs</th><th class="num">Median</th><th class="num"><abbr title="Nearest-rank 95th percentile of timed runs">P95</abbr></th><th class="num">Longest</th><th class="num">Failed</th><th class="num">Cancelled</th><th class="num">Peak RAM</th><th class="num">Testers</th></tr></thead><tbody>`
      + rows.map(row => `<tr><td><strong title="${esc(row.name)}">${esc(jobName(row.name))}</strong><div class="row-note">${row.timed_runs == null ? 'Timing samples unavailable' : `${num(row.timed_runs)} of ${num(row.runs)} runs timed`} · mean ${time(row.mean_seconds)}</div></td><td class="num">${num(row.runs)}</td><td class="num">${time(row.median_seconds)}</td><td class="num">${time(row.p95_seconds)}</td><td class="num">${time(row.longest_seconds)}</td><td class="num"><span class="${row.failed ? 'bad' : ''}">${row.failed == null ? '—' : num(row.failed)}</span></td><td class="num">${row.cancelled == null ? '—' : num(row.cancelled)}</td><td class="num">${row.peak_mb == null ? '—' : num(row.peak_mb) + ' MB'}</td><td class="num">${num(row.testers)}</td></tr>`).join('') + '</tbody></table></div><p class="footnote">Timings exclude missing or nonnumeric durations. RAM is the largest reported process peak, not installed memory.</p>'
      : '<p class="empty">No jobs match this search.</p>';
  }
  function errorsSection(d) {
    const s = state.errors;
    return `<section class="card" style="margin-top:16px"><div class="head section-head"><div><h2>Error explorer</h2><div class="sub">Grouped by source, type, and message. Open a group for affected testers and a stack sample.</div></div><div class="table-tools"><input id="eq" type="search" aria-label="Search errors" placeholder="Search type, message, tester" value="${esc(s.q)}"><select id="esort" aria-label="Sort errors"><option value="testers" ${s.sort === 'testers' ? 'selected' : ''}>Most testers affected</option><option value="count" ${s.sort === 'count' ? 'selected' : ''}>Most reports</option><option value="recent" ${s.sort === 'recent' ? 'selected' : ''}>Most recent</option></select></div></div><div id="error-list" class="error-list"></div>`
      + (d.errors.length ? `<details class="more"><summary>Latest ${num(d.errors.length)} individual error reports</summary><div class="scroll"><table style="min-width:600px"><thead><tr><th>Event time</th><th>Tester</th><th>Source</th><th>Error</th></tr></thead><tbody>`
        + d.errors.map(row => `<tr><td title="${esc(when(row.at))}">${esc(ago(row.at))}</td><td>${testerLink(row.slot)}</td><td><code>${esc(row.name)}</code></td><td><strong>${esc(row.type || 'Error')}</strong> ${esc(row.message || '')}${row.stack ? `<details class="more"><summary>Stack sample</summary><pre>${esc(row.stack)}</pre></details>` : ''}</td></tr>`).join('') + '</tbody></table></div></details>' : '') + '</section>';
  }
  function renderErrorList() {
    const d = state.data; const s = state.errors; const q = s.q.trim().toLowerCase();
    const rows = d.error_groups.filter(row => !q || [row.type, row.message, row.name, row.place, String(row.slots || '').split(',').map(plainName).join(' ')].join(' ').toLowerCase().includes(q))
      .sort((a, b) => s.sort === 'recent' ? (Date.parse(b.last_at) || 0) - (Date.parse(a.last_at) || 0)
        : b[s.sort] - a[s.sort] || b.count - a.count || (Date.parse(b.last_at) || 0) - (Date.parse(a.last_at) || 0));
    const group = row => `<details class="error-item"><summary><span class="error-count">${num(row.count)}<small>reports</small></span><div class="error-title"><strong>${esc(row.type || 'Error')}</strong>${esc(row.message || row.name)}<div class="error-meta">${num(row.testers)} testers · ${esc(row.name)}${row.place ? ' · location sample: ' + esc(row.place) : ''}</div></div><time class="error-meta" title="${esc(when(row.last_at))}">${esc(ago(row.last_at))}</time></summary><div class="error-body"><div class="row-note">First seen ${esc(when(row.first_at))} · last seen ${esc(when(row.last_at))}. A group may include multiple recorded locations.</div><div class="affected">${String(row.slots || '').split(',').filter(Boolean).map(slot => `<button type="button" data-open="${esc(slot)}">${esc(plainName(slot))} ↗</button>`).join('')}</div>${row.stack ? `<div class="row-note">Stack sample</div><pre>${esc(row.stack)}</pre>` : '<div class="row-note">No stack was reported for this group.</div>'}</div></details>`;
    $('error-list').innerHTML = (rows.length ? rows.map(group).join('') : '<p class="empty">No error groups match this search.</p>')
      + `<p class="footnote">${num(rows.length)} matching groups from the ${num(d.error_groups.length)} groups included in this report. ${num(d.totals.errors)} error events in the selected period; at most 40 groups and 60 individual errors are shown.</p>`;
  }

  function computersSection(d) {
    const tally = (list, key) => {
      const m = new Map(); list.forEach(x => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    };
    // Delta V1 sent free memory under this name, so only later builds count.
    const mem = x => { const g = Number(x.memory_gb); if (!g || x.release === 'Delta V1') return ''; return g <= 8.5 ? '8 GB or less' : g <= 16.5 ? '9–16 GB' : g <= 32.5 ? '17–32 GB' : 'more than 32 GB'; };
    const osRows = tally(d.machines, x => [x.os, x.arch].filter(Boolean).join(' · '));
    const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
    osRows.forEach((r, i) => { r.color = i < 3 ? colors[i] : '#5c6270'; });
    const card = (title, sub, rows, wide = false) => `<div class="card"><h2>${title}</h2><div class="sub">${sub}</div>${hbars(rows.slice(0, 8), { unit: 'computers', wide })}</div>`;
    // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x2504) Direct3D11 …)" reads as its model.
    const gpuLabel = name => {
      const angle = /^ANGLE \([^,]+,\s*(.+?)(?:\s+\(0x[0-9a-f]+\))?(?:\s+(?:Direct3D|OpenGL|Vulkan)[^,]*)?(?:,[^,]*)?\)$/i.exec(name);
      return (angle ? angle[1] : name).replace(/^ANGLE Metal Renderer:\s*/i, '').trim();
    };
    const displays = (d.displays || []).map(x => ({ label: `${x.width} × ${x.height}`, small: x.scale && x.scale !== 1 ? `at ${x.scale}×` : '', value: x.computers }));
    const gpus = (d.gpus || []).map(x => ({ label: gpuLabel(x.gpu), title: x.gpu, value: x.computers }));
    return `<section class="grid g3">
      ${card('Operating systems', `${num(d.machines.length)} registered computers`, osRows)}
      ${card('App versions', 'What each computer last reported', tally(d.machines, x => [x.app_version, x.release].filter(Boolean).join(' · ')))}
      ${card('Memory', 'Installed RAM (Delta V1 builds reported free memory and are left out)', tally(d.machines, mem))}
      ${card('Window sizes', 'App window at start, in the range', d.screens.map(x => ({ label: `${x.width} × ${x.height}`, value: x.computers })))}
      ${card('Screens', 'Screen size in the system\'s points, and its pixel density (Delta V2)', displays)}
      ${card('Graphics', 'The graphics processor each computer\'s web view reports (Delta V2)', gpus, true)}
    </section>`;
  }

  function feedSection(d) {
    const who = slot => (d.range.slot ? '' : `<button type="button" class="link" data-open="${esc(slot)}">${nameHtml(slot)}</button> `);
    const line = e => {
      if (e.kind === 'activation') return ['＋', 'good', `${who(e.slot)} unlocked a new computer${e.name ? ` (${esc(e.name)})` : ''}`];
      if (e.kind === 'error') return ['!', 'bad', `${who(e.slot)} hit ${esc(e.message || e.name)} <code>${esc(e.name)}</code>`];
      if (e.kind === 'perf') return ['✕', 'bad', `${who(e.slot)} ${esc(e.name.replace(/^job:/, ''))} did not finish (${esc(e.status)}${e.progress != null ? `, at ${esc(Math.round(e.progress))}%` : ''})`];
      if (e.name === 'end') return ['■', '', `${who(e.slot)} closed the app after ${esc(duration(e.seconds))}`];
      if (e.name === 'unclean') return ['⚠', 'bad', `${who(e.slot)}'s previous run ended without closing${e.seconds ? ` after ${esc(duration(e.seconds))}` : ''} (crash or forced quit)`];
      if (e.name === 'unlock') return e.ok
        ? ['🔓', 'good', `${who(e.slot)} unlocked${e.seconds_on_gate != null ? ` after ${esc(duration(e.seconds_on_gate))} on the unlock screen` : ''}`]
        : ['✕', 'bad', `${who(e.slot)} could not unlock: ${esc(UNLOCK_REASONS[e.reason] || e.reason || 'refused')}`];
      return ['▶', 'good', `${who(e.slot)} opened the app`];
    };
    return `<div class="card"><h2>Recent activity</h2><div class="sub">Openings, closings, unlocks, crashes, new computers, errors and unfinished jobs.</div>`
      + (d.feed.length ? '<ul class="feed">' + d.feed.map(e => { const [ic, cls, text] = line(e);
        return `<li><span class="ic ${cls}">${ic}</span><span>${text}</span><time title="${esc(when(e.at))}">${esc(ago(e.at))}</time></li>`; }).join('') + '</ul>'
        : '<p class="empty">Nothing in this range.</p>') + '</div>';
  }

  function dailyTable(d) {
    return `<details class="tbl"><summary>Daily numbers as a table</summary><div class="scroll" style="max-height:300px"><table><thead><tr><th>Day</th><th class="num">Testers</th><th class="num">Sessions</th><th class="num">Hours</th><th class="num">Active min</th><th class="num">Jobs</th><th class="num">Unfinished</th><th class="num">Errors</th></tr></thead><tbody>`
      + d.daily.slice().reverse().map(x => `<tr><td>${esc(dayLong(x.day))}</td><td class="num">${num(x.testers)}</td><td class="num">${num(x.sessions)}</td><td class="num">${x.hours}</td><td class="num">${num(x.active_minutes)}</td><td class="num">${num(x.runs)}</td><td class="num">${num(x.failed)}</td><td class="num">${num(x.errors)}</td></tr>`).join('')
      + '</tbody></table></div></details>';
  }

  function rememberPosition() {
    const active = document.activeElement;
    return { scrolls: [...document.querySelectorAll('#dash,#dash .scroll,#dash .feed')].map(el => [el.scrollTop, el.scrollLeft]),
      focus: active && $('dash').contains?.(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null };
  }
  function restorePosition(position) {
    const target = position.focus?.id && $(position.focus.id);
    if (target) {
      target.focus({ preventScroll: true });
      if (position.focus.start != null && target.setSelectionRange) target.setSelectionRange(position.focus.start, position.focus.end);
    }
    document.querySelectorAll('#dash,#dash .scroll,#dash .feed').forEach((el,i) => {
      if (position.scrolls[i]) { el.scrollTop = position.scrolls[i][0]; el.scrollLeft = position.scrolls[i][1]; }
    });
  }
  function syncRailOffset() {
    document.documentElement?.style?.setProperty('--bar-height', ($('bar').offsetHeight || 125) + 'px');
  }
  function render() {
    const d = state.data;
    if (!d) return;
    if (!VIEWS[state.view]) state.view = 'overview';
    const position = rememberPosition();
    document.body.classList?.toggle('naming-mode', state.view === 'testers' && state.testers.mode === 'names' && !d.range.slot);
    $('sections').innerHTML = navHtml(d); syncRailOffset();
    const one = Boolean(d.range.slot);
    let body = '';
    if (state.view === 'overview') body = summaryTiles(d)
      + `<section class="grid wide-grid">${attentionSection(d)}${adoptionSection(d)}</section>`
      + activityCharts(d) + `<section class="grid g2">${feedSection(d)}${engagedSection(d)}</section>` + definitionsSection(d);
    if (state.view === 'testers') body = one ? sessionsSection(d) : testersSection(d);
    if (state.view === 'usage') body = usageSummary(d) + activityCharts(d, true)
      + `<section class="grid g2"><div class="card"><h2>When testers work</h2><div class="sub">Input minutes by weekday and hour, in the report’s time zone.</div><div class="chart" id="c-heat"></div></div><div class="card"><h2>Daily activity</h2><div class="sub">The same daily numbers behind the charts.</div>${dailyTable(d)}</div></section>`
      + featuresSection(d) + timeAndUnlockSection(d) + definitionsSection(d);
    if (state.view === 'reliability') body = reliabilitySummary(d)
      + `<div class="card"><h2>Errors & unfinished jobs per day</h2><div class="sub">Unfinished includes cancelled and unknown outcomes as well as failures.</div><div class="legend"><span><i style="background:var(--bad)"></i>Errors</span><span><i style="background:var(--serious)"></i>Unfinished jobs</span></div><div class="chart" id="c-problems"></div></div>`
      + errorsSection(d) + performanceSection(d) + definitionsSection(d);
    if (state.view === 'systems') body = computersSection(d) + systemsInventory(d) + definitionsSection(d);
    hideTip();
    $('dash').classList[state.view === 'testers' && !one ? 'add' : 'remove']('tester-view');
    $('dash').innerHTML = pageHeading(d) + (one ? profileSection(d) : '') + body;
    drawCharts();
    if (state.view === 'testers' && !one) renderTesterRows();
    if (state.view === 'usage') renderFeatureList();
    if (state.view === 'reliability') { renderErrorList(); renderJobList(); }
    restorePosition(position);
  }
  function drawCharts() {
    const d = state.data;
    if (!d) return;
    if ($('c-testers')) {
      if (d.range.slot) columnChart($('c-testers'), d.daily, [{ field: 'active_minutes', label: 'active minutes', color: 'var(--s1)' }], { label: 'Input minutes per day' });
      else lineChart($('c-testers'), d.daily, 'testers', { unit: 'active testers', label: 'Active testers per day' });
    }
    if ($('c-hours')) columnChart($('c-hours'), d.daily, [{ field: state.view === 'overview' ? 'active_minutes' : 'hours', label: state.view === 'overview' ? 'active minutes' : 'app-open hours', color: 'var(--s1)' }], { label: state.view === 'overview' ? 'Input minutes per day' : 'App-open hours per day' });
    if ($('c-heat')) heatmap($('c-heat'), d.heatmap);
    if ($('c-problems')) columnChart($('c-problems'), d.daily, [{ field: 'errors', label: 'errors', color: 'var(--bad)' }, { field: 'failed', label: 'unfinished jobs', color: 'var(--serious)' }], { label: 'Errors and unfinished jobs per day' });
  }

  // ---------- data ----------
  function signedIn(on) {
    $('f').hidden = on; $('bar').hidden = !on; $('app').hidden = !on; $('dash').hidden = !on;
    if (!on) { $('t').value = ''; $('t').focus(); }
  }
  function forget(message) {
    if (state.request) state.request.abort(); state.request = null;
    state.token = ''; state.data = null; state.stale = false; labelDrafts.clear(); store.drop(KEY);
    $('refresh').disabled = false; $('dash').classList.remove('loading');
    clearInterval(state.timer); state.timer = 0; $('auto').checked = false;
    document.body.classList?.remove('naming-mode');
    signedIn(false); $('dash').innerHTML = ''; $('login-msg').textContent = message || '';
  }
  function schedule() {
    clearInterval(state.timer); state.timer = 0;
    if ($('auto').checked && state.token) state.timer = setInterval(() => { if (!document.hidden) load({ background: true }); }, AUTO_MS);
  }
  function syncRange() {
    document.querySelectorAll('#range button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === state.days)));
  }
  async function authenticate(token, remember) {
    if (state.request) state.request.abort();
    const controller = new AbortController(); state.request = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const button = $('f').querySelector('button'); button.disabled = true;
    $('login-msg').textContent = 'Checking token…';
    try {
      const r = await fetch('/v1/admin/auth', { headers: { authorization: 'Bearer ' + token },
        cache: 'no-store', signal: controller.signal });
      const d = await r.json().catch(() => ({}));
      if (state.request !== controller) return;
      if (r.status === 401) { forget(d.error || 'The admin token was refused. Use the current admin token for cartovox.org.'); return; }
      if (!r.ok) { signedIn(false); $('login-msg').textContent = d.error || ('Failed: ' + r.status); return; }
      state.token = token;
      if (remember) store.set(KEY, token); else store.drop(KEY);
      $('t').value = ''; $('login-msg').textContent = '';
      state.request = null; signedIn(true); schedule(); load();
    } catch (e) {
      if (state.request !== controller) return;
      signedIn(false); $('login-msg').textContent = 'Could not check the token. Check your connection and try again.';
    } finally {
      clearTimeout(timeout); button.disabled = false;
      if (state.request === controller) state.request = null;
    }
  }
  async function load(options = {}) {
    if (!state.token) return;
    if (options.background && ((state.view === 'testers' && state.testers.mode === 'names') || document.activeElement?.className === 'nickedit')) return;
    const reportRevision = labelRevision;
    if (state.request) state.request.abort();
    const controller = new AbortController(); state.request = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    $('refresh').disabled = true; $('status').textContent = 'Loading…'; $('dash').classList.add('loading');
    if (!state.data) $('dash').innerHTML = '<p class="empty">Loading report…</p>';
    const params = new URLSearchParams({ days: String(state.days), tz: String(-new Date().getTimezoneOffset()) });
    if (state.slot) params.set('slot', state.slot);
    else if ($('hide-test').checked) params.set('exclude', TEST_SLOT);
    try {
      const r = await fetch('/v1/admin/report?' + params, { headers: { authorization: 'Bearer ' + state.token },
        cache: 'no-store', signal: controller.signal });
      const d = await r.json().catch(() => ({ error: 'The service answered ' + r.status + '.' }));
      if (state.request !== controller) return;
      if (r.status === 401) { forget(d.error || 'The admin token was refused. Use the current admin token for cartovox.org.'); return; }
      if (!r.ok) {
        const message = d.code === 'daily_read_limit' && d.retry_at
          ? 'Daily reporting limit reached. Try again after ' + when(d.retry_at) + '.'
          : (d.error || ('Failed: ' + r.status));
        state.stale = Boolean(state.data);
        if (state.data) render(); else $('dash').innerHTML = '<p class="empty">' + esc(message) + ' Press Refresh to retry.</p>';
        $('status').textContent = message + (state.data ? ' Showing the last successful report.' : ''); return;
      }
      for (const [slot, draft] of labelDrafts) {
        if (draft.revision > reportRevision) applyLabel(d, slot, draft.saved);
      }
      state.stale = false; state.data = d; state.today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      fillPicker(); render();
      $('status').textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (e) {
      if (state.request !== controller) return;
      const message = controller.signal.aborted ? 'Report timed out. Try 7 days or press Refresh.'
        : 'Could not reach the service. Press Refresh to retry.';
      $('status').textContent = message + (state.data ? ' The numbers below may be stale.' : '');
      state.stale = Boolean(state.data);
      if (state.data) render(); else $('dash').innerHTML = '<p class="empty">' + esc(message) + '</p>';
    } finally {
      clearTimeout(timeout);
      if (state.request === controller) {
        state.request = null; $('refresh').disabled = false; $('dash').classList.remove('loading'); syncRailOffset();
      }
    }
  }
  // The tester picker: activated codes first, each with its nickname.
  function fillPicker() {
    const list = (state.data.directory || []).slice()
      .sort((a, b) => (b.computers > 0) - (a.computers > 0) || a.slot.localeCompare(b.slot));
    const option = x => `<option value="${esc(x.slot)}">${esc(plainName(x.slot))}${x.status === 'revoked' ? ' — revoked' : ''}</option>`;
    const used = list.filter(x => x.computers > 0); const unused = list.filter(x => !x.computers);
    $('who').innerHTML = '<option value="">Everyone</option>'
      + (used.length ? `<optgroup label="Activated">${used.map(option).join('')}</optgroup>` : '')
      + (unused.length ? `<optgroup label="Not activated yet">${unused.map(option).join('')}</optgroup>` : '');
    $('who').value = state.slot;
    $('hide-test').disabled = Boolean(state.slot);
    document.title = state.slot ? `${plainName(state.slot)} · CartoVox Delta` : 'CartoVox Delta report';
  }
  function writeAddress(view, slot, push = true) {
    const params = new URLSearchParams(location.search || ''); params.set('view', view);
    const url = location.pathname + '?' + params + (slot ? '#' + slot : '');
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
  function openView(view) {
    if (!VIEWS[view]) return;
    state.view = view; writeAddress(view, state.slot); render(); $('dash').scrollTop = 0;
  }
  function openTester(slot) {
    if (slot === state.slot && state.data) return;
    writeAddress(state.view, slot); fromAddress();
  }
  function fromAddress() {
    const nextSlot = (/^#(D-\d{3,5})$/.exec(location.hash || '') || [])[1] || '';
    const requested = new URLSearchParams(location.search || '').get('view');
    const nextView = VIEWS[requested] ? requested : 'overview';
    if (nextSlot === state.slot && state.data) {
      if (nextView !== state.view) { state.view = nextView; render(); $('dash').scrollTop = 0; }
      return;
    }
    state.view = nextView; state.slot = nextSlot; $('dash').scrollTop = 0; load();
  }
  // Inline labels update only their identity cell, never the surrounding table.
  function editNickname(button) {
    const slot = button.dataset.nick; const token = state.token;
    const input = document.createElement('input');
    input.className = 'nickedit'; input.maxLength = 40; input.value = nickOf(slot);
    input.placeholder = 'Discord ID or name'; input.setAttribute('aria-label', 'Discord ID or name for ' + slot);
    button.replaceWith(input); input.focus({ preventScroll: true }); input.select();
    let busy = false; let closed = false;
    const close = focus => {
      if (closed) return; closed = true;
      input.replaceWith(button); if (focus) button.focus({ preventScroll: true });
    };
    const finish = async (save, focus = false) => {
      if (busy || closed) return;
      const note = input.value.trim();
      if (!save || note === nickOf(slot)) { close(focus); return; }
      busy = true; input.readOnly = true;
      try {
        const r = await fetch('/v1/admin/codes/' + encodeURIComponent(slot), { method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ note }) });
        const d = await r.json().catch(() => ({}));
        if (state.token !== token || !state.data) return;
        if (r.status === 401) { forget('The admin token was refused. Sign in again.'); return; }
        if (!r.ok) throw new Error(d.error || `Could not save (${r.status})`);
        const saved = d.code?.note || '';
        labelDrafts.set(slot, { value: saved, saved, saving: false, error: '', revision: ++labelRevision });
        applyLabel(state.data, slot, saved);
        updateVisibleLabel(slot, saved);
        $('status').textContent = `${slot}: label saved.`; fillPicker();
        close(focus && document.activeElement === input);
      } catch (e) {
        if (state.token === token) { input.setAttribute('aria-invalid', 'true'); input.title = e.message; $('status').textContent = `${slot} was not saved. Your text is kept; Enter retries.`; }
      } finally { busy = false; input.readOnly = false; }
    };
    input.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false, true); }
    });
    input.addEventListener('blur', () => finish(true));
  }
  async function act(action, slot, button) {
    const body = action === 'free' ? { free_computers: true } : { status: action === 'revoke' ? 'revoked' : 'active' };
    const name = plainName(slot); const token = state.token;
    const question = action === 'revoke' ? `Revoke ${name}? Every computer using it locks at its next check-in.`
      : action === 'restore' ? `Restore ${name}?` : `Free every computer registered to ${name}? The tester can then unlock again on new ones.`;
    if (!token || !window.confirm(question)) return;
    if (button) button.disabled = true;
    try {
      const r = await fetch('/v1/admin/codes/' + encodeURIComponent(slot), { method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (state.token !== token) return;
      if (r.status === 401) { forget(d.error || 'The admin token was refused.'); return; }
      $('status').textContent = r.ok ? `${slot}: done.` : (d.error || `Failed: ${r.status}`);
      if (r.ok) load();
    } catch (e) { if (state.token === token) $('status').textContent = 'Could not change ' + slot + '. Check the connection and try again.'; }
    finally { if (button) button.disabled = false; }
  }

  // ---------- events ----------
  const tip = $('tip');
  let tipTarget = null; let tipWidth = 0; let tipHeight = 0;
  function showTip(target, x, y) {
    if (target !== tipTarget) {
      hideTip(); tipTarget = target;
      const lines = target.getAttribute('data-tip').split('\n');
      tip.textContent = '';
      const strong = document.createElement('strong'); strong.textContent = lines[0]; tip.appendChild(strong);
      lines.slice(1).forEach(l => { const div = document.createElement('div'); div.textContent = l; tip.appendChild(div); });
      tip.hidden = false;
      tipWidth = tip.offsetWidth; tipHeight = tip.offsetHeight;
      const svg = target.ownerSVGElement;
      if (svg && target.hasAttribute('data-cx')) {
        const xh = svg.querySelector('.xh'); const xd = svg.querySelector('.xd');
        xh.setAttribute('x1', target.dataset.cx); xh.setAttribute('x2', target.dataset.cx); xh.setAttribute('visibility', 'visible');
        xd.setAttribute('cx', target.dataset.cx); xd.setAttribute('cy', target.dataset.cy); xd.setAttribute('visibility', 'visible');
      }
    }
    tip.style.left = Math.min(window.innerWidth - tipWidth - 8, x + 14) + 'px';
    tip.style.top = (y - tipHeight - 12 < 60 ? y + 16 : y - tipHeight - 12) + 'px';
  }
  function hideTip() {
    tipTarget = null; tip.hidden = true;
    document.querySelectorAll('.xh,.xd').forEach(n => n.setAttribute('visibility', 'hidden'));
  }
  document.addEventListener('pointermove', e => {
    const target = e.target.closest && e.target.closest('[data-tip]');
    if (target) showTip(target, e.clientX, e.clientY); else if (!tip.hidden) hideTip();
  });
  document.addEventListener('pointerleave', hideTip);

  $('f').addEventListener('submit', e => {
    e.preventDefault();
    const token = $('t').value.trim().replace(/^Bearer\s+/i, '');
    if (!token) return;
    authenticate(token, $('remember').checked);
  });
  $('refresh').addEventListener('click', () => load());
  $('forget').addEventListener('click', () => forget('Token forgotten on this browser.'));
  $('auto').addEventListener('change', () => { store.set(AUTO, $('auto').checked ? '1' : '0'); schedule(); });
  $('hide-test').addEventListener('change', () => { store.set(HIDE, $('hide-test').checked ? '1' : '0'); load(); });
  $('who').addEventListener('change', () => openTester($('who').value));
  window.addEventListener('hashchange', fromAddress);
  window.addEventListener('popstate', fromAddress);
  $('range').addEventListener('click', e => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    state.days = Number(b.dataset.days); store.set(RANGE, String(state.days)); syncRange(); load();
  });
  $('sections').addEventListener('click', e => { const button = e.target.closest('[data-view]'); if (button && state.data) openView(button.dataset.view); });
  $('download').addEventListener('click', () => {
    if (!state.data) return;
    downloadFile(JSON.stringify(state.data, null, 2), 'application/json', `cartovox-delta-report-${state.data.generated_at.slice(0, 10)}.json`);
  });
  $('dash').addEventListener('click', e => {
    const t = e.target;
    const view = t.closest('[data-view]');
    if (view) { openView(view.dataset.view); return; }
    const investigate = t.closest('[data-investigate]');
    if (investigate) { state.errors.q = investigate.dataset.investigate; openView('reliability'); return; }
    const attention = t.closest('[data-tattention]');
    if (attention) { state.testers.mode = 'directory'; state.testers.activeOnly = false; state.testers.filter = attention.dataset.tattention; state.testers.page = 0; openView('testers'); return; }
    if (t.id === 'name-codes') { setTesterMode('names'); return; }
    if (t.id === 'tester-activity') { setTesterMode('directory'); return; }
    if (t.id === 'tester-csv') { exportTesters(); return; }
    const sort = t.closest('th[data-sort]');
    if (sort) {
      const k = sort.dataset.sort; const s = state.testers;
      s.dir = s.sort === k ? -s.dir : (['slot', 'os', 'app_version', 'status'].includes(k) ? 1 : -1); s.sort = k; s.page = 0;
      document.querySelectorAll('#tt th[data-sort]').forEach(th => {
        if (th.dataset.sort === k) th.setAttribute('aria-sort', s.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
      });
      $('tester-sort-note').textContent = 'Sorted by ' + (TESTER_COLS.find(col => col[0] === k)?.[1] || k) + '. Open a tester for their report; use ✎ to save a Discord ID or name.';
      $('tsort').innerHTML = testerSortOptions();
      renderTesterRows(); resetTesterScroll(); return;
    }
    const page = t.closest('[data-tpage]');
    if (page && !page.disabled) { state.testers.page += Number(page.dataset.tpage); renderTesterRows(); return; }
    const tf = t.closest('[data-tfilter]');
    if (tf) { state.testers.filter = tf.dataset.tfilter; state.testers.page = 0; render(); return; }
    const fa = t.closest('[data-farea]');
    if (fa) { state.features.area = fa.dataset.farea; state.features.all = false; document.querySelectorAll('[data-farea]').forEach(b => b.setAttribute('aria-pressed', String(b === fa))); renderFeatureList(); return; }
    if (t.id === 'fall') { state.features.all = !state.features.all; renderFeatureList(); return; }
    const a = t.closest('button[data-act]');
    if (a) { act(a.dataset.act, a.dataset.slot, a); return; }
    const pen = t.closest('button[data-nick]');
    if (pen) { editNickname(pen); return; }
    const open = t.closest('[data-open]');
    if (open) openTester(open.dataset.open);
  });
  $('dash').addEventListener('input', e => {
    if (e.target.dataset?.codeName) { editNameCell(e.target); return; }
    if (e.target.id === 'tq') { state.testers.q = e.target.value; state.testers.page = 0; renderTesterRows(); resetTesterScroll(); }
    if (e.target.id === 'eq') { state.errors.q = e.target.value; renderErrorList(); }
    if (e.target.id === 'pq') { state.jobs.q = e.target.value; renderJobList(); }
    if (e.target.id === 'fq') { state.features.q = e.target.value; state.features.all = false; renderFeatureList(); }
  });
  $('dash').addEventListener('change', e => {
    if (e.target.id === 'tester-active') { state.testers.activeOnly = e.target.checked; state.testers.filter = 'all'; state.testers.page = 0; render(); resetTesterScroll(); return; }
    if (e.target.id === 'tester-group') { state.testers.filter = e.target.value; state.testers.page = 0; renderTesterRows(); resetTesterScroll(); return; }
    if (e.target.id === 'names-unnamed') { state.testers.unnamedOnly = e.target.checked; renderNameRows(); resetTesterScroll(); return; }
    if (e.target.id === 'tsort') { const [key, dir] = e.target.value.split(':'); state.testers.sort = key; state.testers.dir = Number(dir); state.testers.page = 0; render(); resetTesterScroll(); $('tsort').focus({ preventScroll: true }); }
    if (e.target.id === 'tester-details') { state.testers.detailed = e.target.checked; render(); $('tester-details').focus(); }
    if (e.target.id === 'fsort') { state.features.sort = e.target.value; renderFeatureList(); }
    if (e.target.id === 'esort') { state.errors.sort = e.target.value; renderErrorList(); }
    if (e.target.id === 'psort') { state.jobs.sort = e.target.value; renderJobList(); }
  });
  $('dash').addEventListener('focusout', e => { if (e.target.dataset?.codeName) saveNameCell(e.target); });
  $('dash').addEventListener('keydown', nameKeydown);
  let resize = 0;
  window.addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(() => { syncRailOffset(); drawCharts(); if (state.view === 'testers' && state.testers.mode === 'names' && !state.slot && nameColumns() !== namingColumns) { const position = rememberPosition(); renderNameRows(); restorePosition(position); } }, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.timer) load({ background: true }); });

  const savedDays = Number(store.get(RANGE));
  state.days = [0, 7, 30, 90].includes(savedDays) && store.get(RANGE) !== null ? savedDays : 7;
  syncRange();
  $('auto').checked = store.get(AUTO) === '1';
  $('hide-test').checked = store.get(HIDE) !== '0';
  const savedToken = store.get(KEY) || '';
  state.slot = (/^#(D-\d{3,5})$/.exec(location.hash || '') || [])[1] || '';
  const initialView = new URLSearchParams(location.search || '').get('view');
  state.view = VIEWS[initialView] ? initialView : 'overview';
  if (savedToken) authenticate(savedToken, true); else $('t').focus();
}

// Wrangler bundles with esbuild's keepNames, which rewrites every inner
// function of adminApp as __name(fn, "name"). The helper lives in the
// Worker's bundle, not the browser, so the page defines its own no-op one;
// without it the script dies on its first line and nothing responds.
export const ADMIN_SCRIPT = `var __name = function (fn) { return fn; };\n(${adminApp.toString()})();\n`;

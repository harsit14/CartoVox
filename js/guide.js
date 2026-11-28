/* The Start-here guide: old links, search across the guide's pages, and the
   contents marker. Loaded on /guide/ pages only; everything works without it
   except search. */
(() => {
  "use strict";

  /* ── Old links ─────────────────────────────────────────────
     Until 1.1 the guide was one page, and its "What's new" sections lived
     in it. A link like /guide/#new-v1-0-1 or /guide/#sculpt still arrives
     here; send it where that section lives now. A fragment can't be
     redirected by the server, so this is the redirect. */
  const MOVED = {"install":"/guide/#install","shape":"/guide/#layout","first":"/guide/#first-hour","first-hour":"/guide/#first-hour","where":"/guide/#search-anything","lookup":"/guide/#search-anything","create":"/guide/create/","brief":"/guide/create/#brief","nations":"/guide/create/#peoples","search":"/guide/create/#candidates","advanced":"/guide/create/#advanced","preflight":"/guide/create/#build","import":"/guide/create/#import","draw":"/guide/create/#draw","drawing-drafts":"/guide/create/#draw","deeptime":"/guide/create/#deeptime","reseed":"/guide/create/#reseed","map":"/guide/world/","views":"/guide/world/#layers","decision-maps":"/guide/world/#layers","inspector":"/guide/world/#inspector","world-facts":"/guide/world/#inspector","dock":"/guide/world/#toolbar","labs":"/guide/world/#labs","planet":"/guide/world/#planet","sculpt":"/guide/world/#sculpt","river-lines":"/guide/world/#sculpt","edit-nations":"/guide/world/#vector-editor","health":"/guide/reference/#files","render":"/guide/world/#render","export":"/guide/world/#export","atlas":"/guide/world/#atlas","travel":"/guide/world/#travel","campaign":"/guide/play/","campaign-board":"/guide/play/#campaign","tabletop":"/guide/play/#tabletop","battles":"/guide/play/#war","settlements":"/guide/play/#cities","settle-plans":"/guide/play/#cities","settle-hand":"/guide/play/#cities","settle-art":"/guide/play/#cities","settle-vtt":"/guide/play/#cities","scenes":"/guide/play/#scenes","codex":"/guide/write/#compendium","lexicon":"/guide/write/#tongues","chronicle":"/guide/write/#chronicle","manuscript":"/guide/write/#manuscript","library":"/guide/library/","settings":"/guide/library/#settings","shortcuts":"/guide/reference/#shortcuts","files":"/guide/reference/#files","questions":"/guide/reference/#questions","limits":"/guide/reference/#limits","new-v1-0-1":"/releases/v1.0.1/#highlights","new-v1":"/releases/v1.0.0/#highlights","new-v16":"/releases/v0.9.17/#highlights","new-v15":"/releases/v0.9.16/#highlights","new-v14":"/releases/v0.9.15/#highlights","new-v13":"/releases/v0.9.14/#highlights","new-v12":"/releases/v0.9.13/#highlights","new-v11":"/releases/v0.9.12/#highlights","new-v10":"/releases/v0.9.11/#highlights","new-v9":"/releases/v0.9.10/#highlights","new-v8":"/releases/v0.9.9/#highlights","new-v7":"/releases/v0.9.8/#highlights","new-v6":"/releases/v0.9.7/#highlights","new-v5":"/releases/v0.9.6/#highlights","new-v4":"/releases/v0.9.5/#highlights","new-v3":"/releases/v0.9.4/#highlights","new-v2":"/releases/v0.9.3/#highlights","new-092":"/releases/v0.9.2/#highlights","new-091":"/releases/v0.9.1/#highlights","new-090":"/releases/v0.9.0/#highlights"};
  const followOldLink = () => {
    const path = location.pathname.replace(/index\.html$/, "");
    if (path !== "/guide/") return;
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id || document.getElementById(id) || !MOVED[id]) return;
    location.replace(MOVED[id]);
  };
  followOldLink();
  window.addEventListener("hashchange", followOldLink);

  /* ── Search every guide page ───────────────────────────── */
  const pages = [...document.querySelectorAll(".guide-toc a.toc-page")]
    .map((a) => ({ url: a.getAttribute("href"), label: a.textContent.trim() }));
  const here = location.pathname.replace(/index\.html$/, "");
  let index = null;

  const collect = (doc, page) => [...doc.querySelectorAll("[data-find]")].map((el) => {
    const heading = el.querySelector("h2, h3");
    const title = (el.getAttribute("data-find") || (heading ? heading.textContent : "")).replace(/\s+/g, " ").trim();
    const text = el.textContent.replace(/\s+/g, " ").trim();
    return { url: `${page.url}#${el.id}`, page: page.label, title, text, low: `${title} ${text}`.toLowerCase(), lowTitle: title.toLowerCase() };
  });

  const load = () => {
    if (index) return index;
    index = Promise.all(pages.map((page) => {
      if (page.url === here) return collect(document, page);
      return fetch(page.url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => collect(new DOMParser().parseFromString(html, "text/html"), page))
        .catch(() => []);
    })).then((lists) => lists.flat());
    return index;
  };

  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const snippet = (text, term) => {
    const at = text.toLowerCase().indexOf(term);
    const start = Math.max(0, at - 40);
    const cut = text.slice(start, start + 120);
    return (start > 0 ? "…" : "") + cut + (start + 120 < text.length ? "…" : "");
  };
  const mark = (text, terms) => {
    let out = escape(text);
    terms.forEach((t) => {
      if (t.length < 2) return;
      out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>");
    });
    return out;
  };

  document.querySelectorAll(".guide-find").forEach((box) => {
    const input = box.querySelector("input");
    const results = box.querySelector(".guide-find-results");
    if (!input || !results) return;
    input.addEventListener("focus", load, { once: true });
    let ticket = 0;
    input.addEventListener("input", async () => {
      const query = input.value.trim().toLowerCase();
      const mine = ++ticket;
      if (query.length < 2) { results.hidden = true; results.replaceChildren(); return; }
      const all = await load();
      if (mine !== ticket) return;
      const terms = query.split(/\s+/).filter(Boolean);
      const hits = all
        .filter((e) => terms.every((t) => e.low.includes(t)))
        .map((e) => ({ e, score: terms.reduce((s, t) => s + (e.lowTitle.includes(t) ? 5 : 0), 0) - e.text.length / 4000 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
      results.hidden = false;
      if (!hits.length) {
        results.innerHTML = `<p class="guide-find-empty">Nothing in the guide matches. Try another word, or ask on Discord.</p>`;
        return;
      }
      results.innerHTML = hits.map(({ e }) => `<a href="${escape(e.url)}">${mark(e.title, terms)}<small>${escape(e.page)} · ${mark(snippet(e.text, terms[0]), terms)}</small></a>`).join("");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { input.value = ""; results.hidden = true; }
      if (event.key === "Enter") { const first = results.querySelector("a"); if (first) first.click(); }
      if (event.key === "ArrowDown") { const first = results.querySelector("a"); if (first) { event.preventDefault(); first.focus(); } }
    });
    results.addEventListener("keydown", (event) => {
      const links = [...results.querySelectorAll("a")];
      const at = links.indexOf(document.activeElement);
      if (event.key === "ArrowDown" && at < links.length - 1) { event.preventDefault(); links[at + 1].focus(); }
      if (event.key === "ArrowUp") { event.preventDefault(); (at > 0 ? links[at - 1] : input).focus(); }
      if (event.key === "Escape") { input.focus(); }
    });
  });

  /* "/" focuses the search, as in many documentation sites. */
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const input = [...document.querySelectorAll(".guide-find input")].find((el) => el.offsetParent !== null);
    if (input) { event.preventDefault(); input.focus(); }
  });

  /* ── Contents: mark the section in view ────────────────── */
  const links = [...document.querySelectorAll(".guide-toc a.toc-sub[href^='#']")];
  if (links.length && "IntersectionObserver" in window) {
    const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.remove("is-current"));
        const link = byId.get(entry.target.id);
        if (link) link.classList.add("is-current");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
  }
})();

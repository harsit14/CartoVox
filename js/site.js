/* cartovox.org — page behaviour. No dependencies, no network, no storage. */
(() => {
  "use strict";
  document.documentElement.classList.add("has-js");
  
  /* ── navigation ─────────────────────────────────── */
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (toggle && links) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      links.classList.toggle("is-open", open);
      // A closed menu must be out of the tab order, not merely invisible.
      links.querySelectorAll("a").forEach((a) => { a.tabIndex = open ? 0 : -1; });
      if (open) setTimeout(() => links.querySelector("a")?.focus(), 60);
    };
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    const collapsed = window.matchMedia("(max-width: 860px)");
    const sync = () => { if (!collapsed.matches) { setOpen(false); links.querySelectorAll("a").forEach((a) => { a.tabIndex = 0; }); } else if (!isOpen()) setOpen(false); };
    sync();
    collapsed.addEventListener("change", sync);
    toggle.addEventListener("click", () => setOpen(!isOpen()));
    links.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) { setOpen(false); toggle.focus(); }
    });
  }

  /* ── tabs: "One world, every use" on the home page ──
     Without JavaScript every panel shows, stacked, and the tab bar hides. */
  document.querySelectorAll("[data-tabs]").forEach((root) => {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (step) { event.preventDefault(); select(tabs[(i + step + tabs.length) % tabs.length], true); }
        if (event.key === "Home") { event.preventDefault(); select(tabs[0], true); }
        if (event.key === "End") { event.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
    });
    if (tabs.length) select(tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0], false);
  });

  /* ── features: mark the area in view in the jump bar ── */
  const jump = document.querySelector(".jump");
  if (jump && "IntersectionObserver" in window) {
    const links = [...jump.querySelectorAll("a[href^='#']")];
    const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    let current = null;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const next = byId.get(visible[0].target.id);
      if (!next || next === current) return;
      current && current.classList.remove("is-here");
      current && current.removeAttribute("aria-current");
      next.classList.add("is-here");
      next.setAttribute("aria-current", "location");
      current = next;
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, { rootMargin: "-150px 0px -55% 0px", threshold: 0 });
    [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean).forEach((t) => io.observe(t));
  }

  /* ── discover: filter the gallery by kind ───────── */
  const filters = document.querySelector(".disc-filters");
  const grid = document.querySelector(".disc-grid");
  if (filters && grid) {
    const cards = [...grid.querySelectorAll(".disc-card")];
    const count = document.getElementById("disc-count");
    const total = count ? count.textContent : "";
    filters.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) return;
      const group = button.dataset.filter;
      filters.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      let shown = 0;
      cards.forEach((card) => {
        const on = group === "all" || card.dataset.group === group;
        card.hidden = !on;
        if (on) shown += 1;
      });
      if (count) count.textContent = group === "all" ? total : `Showing ${shown} of ${cards.length}.`;
    });
  }

  /* ── guide contents: mark the section in view ───── */
  const toc = document.querySelector(".guide-toc .toc-list");
  const mobileToc = document.querySelector(".mobile-contents .mobile-toc");
  if (toc && mobileToc) {
    mobileToc.replaceChildren(...[...toc.children].map((item) => item.cloneNode(true)));
    mobileToc.addEventListener("click", (event) => {
      if (event.target.closest("a")) mobileToc.closest("details").open = false;
    });
  }
  if (toc && "IntersectionObserver" in window) {
    const links = [...toc.querySelectorAll("a[href^='#']")];
    const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const targets = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let current = null;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const next = byId.get(visible[0].target.id);
      if (next === current) return;
      current && current.classList.remove("is-current");
      next.classList.add("is-current");
      current = next;
      if (toc.scrollHeight > toc.clientHeight) next.scrollIntoView({ block: "nearest" });
    }, { rootMargin: "-80px 0px -60% 0px", threshold: 0 });
    targets.forEach((t) => io.observe(t));
  }

  /* ── handbook: narrow the "where is it" index ───── */
  const lookupInput = document.getElementById("lookup-q");
  const lookupTable = document.getElementById("lookup");
  if (lookupInput && lookupTable) {
    const body = lookupTable.tBodies[0];
    const rows = [...body.rows];
    const haystacks = rows.map((row) => row.textContent.toLowerCase());
    const count = document.getElementById("lookup-count");
    const empty = body.insertRow();
    empty.className = "lookup-empty";
    empty.hidden = true;
    const cell = empty.insertCell();
    cell.colSpan = 2;
    cell.textContent = "Nothing here matches that. Try a plainer word — river, print, name, backup — or ask on Discord.";
    const filter = () => {
      const terms = lookupInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      rows.forEach((row, i) => {
        const hit = terms.every((term) => haystacks[i].includes(term));
        row.hidden = !hit;
        if (hit) shown += 1;
      });
      empty.hidden = shown !== 0;
      if (count) count.textContent = terms.length ? `${shown} of ${rows.length}` : `${rows.length} entries`;
    };
    lookupInput.addEventListener("input", filter);
    filter();
  }

  /* Load guides on demand; native controls and transcripts also work without JS. */
  const guideVideos = [...document.querySelectorAll("video[data-guide-video]")];
  guideVideos.forEach((video) => {
    const card = video.closest(".video-guide");
    const start = card.querySelector(".video-guide-start");
    const error = card.querySelector(".video-guide-error");
    const showError = () => { if (error) error.hidden = false; };
    // Source failures do not always reject the play promise; catch them directly.
    video.addEventListener("error", showError, true);
    video.addEventListener("playing", () => { if (error) error.hidden = true; });
    if (start) {
      video.controls = false;
      start.hidden = false;
      start.addEventListener("click", async () => {
        video.controls = true;
        start.hidden = true;
        video.focus();
        try {
          await video.play();
        } catch {
          showError();
        }
      });
    }
    video.addEventListener("play", () => {
      video.controls = true;
      if (start) start.hidden = true;
      guideVideos.forEach((other) => { if (other !== video) other.pause(); });
    });
  });
})();

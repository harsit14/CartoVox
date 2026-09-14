/* cartovox.org — page behaviour. No dependencies, no network, no storage. */
(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── navigation ─────────────────────────────────── */
  const nav = document.querySelector(".nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (toggle && links) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      links.classList.toggle("is-open", open);
      // A closed menu must be out of the tab order, not merely invisible.
      links.querySelectorAll("a").forEach((a) => { a.tabIndex = open ? 0 : -1; });
      if (open) links.querySelector("a")?.focus();
    };
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    const collapsed = window.matchMedia("(max-width: 1040px)");
    const sync = () => { if (!collapsed.matches) { setOpen(false); links.querySelectorAll("a").forEach((a) => { a.tabIndex = 0; }); } else if (!isOpen()) setOpen(false); };
    sync();
    collapsed.addEventListener("change", sync);
    toggle.addEventListener("click", () => setOpen(!isOpen()));
    links.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) { setOpen(false); toggle.focus(); }
    });
  }

  /* ── reveal on scroll ───────────────────────────── */
  const revealables = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach((node) => node.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealables.forEach((node) => io.observe(node));
  }

  /* ── the brief, typed once it is in view ────────── */
  const brief = document.getElementById("brief-text");
  const reads = document.querySelector(".brief-reads");
  if (brief) {
    const full = brief.textContent.trim();
    const finish = () => { brief.textContent = full; brief.classList.remove("is-typing"); reads && reads.classList.add("is-on"); };
    if (reduceMotion || !("IntersectionObserver" in window)) {
      finish();
    } else {
      brief.textContent = "";
      brief.classList.add("is-typing");
      let started = false;
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting) || started) return;
        started = true;
        io.disconnect();
        let i = 0;
        const tick = () => {
          i += 1 + (Math.random() < 0.3 ? 1 : 0);
          brief.textContent = full.slice(0, i);
          if (i < full.length) {
            const ch = full[i - 1];
            setTimeout(tick, ch === "." || ch === ";" ? 220 : ch === "," ? 120 : 14);
          } else finish();
        };
        setTimeout(tick, 350);
      }, { threshold: 0.4 });
      io.observe(brief);
    }
  }

  /* ── causal chain ───────────────────────────────── */
  const chainList = document.getElementById("chain-list");
  const chainImg = document.getElementById("chain-img");
  const chainCap = document.getElementById("chain-caption");
  const chainFrame = chainImg && chainImg.parentElement;
  if (chainList && chainImg) {
    const nodes = [...chainList.querySelectorAll(".chain-node")];
    const cache = new Map();
    const preload = (view) => {
      if (cache.has(view)) return cache.get(view);
      const img = new Image();
      img.src = `/img/chain-${view}.webp`;
      const p = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      cache.set(view, p);
      return p;
    };
    let current = 0;
    let timer = null;
    const show = (index, user) => {
      current = (index + nodes.length) % nodes.length;
      const node = nodes[current];
      nodes.forEach((n, i) => { n.classList.toggle("is-active", i === current); n.setAttribute("aria-pressed", String(i === current)); });
      const view = node.dataset.view;
      chainFrame.classList.add("is-swapping");
      preload(view).then(() => {
        chainImg.src = `/img/chain-${view}.webp`;
        chainImg.alt = `${node.textContent.trim()} map view of Ixrixenrond`;
        chainCap.textContent = node.dataset.caption;
        requestAnimationFrame(() => chainFrame.classList.remove("is-swapping"));
      });
      preload(nodes[(current + 1) % nodes.length].dataset.view);
      if (user) stop();
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    nodes.forEach((node, i) => node.addEventListener("click", () => show(i, true)));
    chainList.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); show(current + 1, true); nodes[current].focus(); }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); show(current - 1, true); nodes[current].focus(); }
    });
    // Auto-advance while the section is on screen and the reader has not chosen.
    if (!reduceMotion && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        const on = entries.some((e) => e.isIntersecting);
        if (on && !timer && !chainList.dataset.touched) timer = setInterval(() => show(current + 1, false), 3800);
        if (!on) stop();
      }, { threshold: 0.35 });
      io.observe(chainList);
      chainList.addEventListener("click", () => { chainList.dataset.touched = "1"; });
    }
    show(0, false);
  }

  /* ── workspace showcase ─────────────────────────── */
  const showcase = document.getElementById("showcase");
  if (showcase) {
    const tabs = [...showcase.querySelectorAll('[role="tab"]')];
    const panels = [...showcase.querySelectorAll('[role="tabpanel"]')];
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach((p) => {
        const on = p.id === tab.getAttribute("aria-controls");
        p.classList.toggle("is-active", on);
        p.hidden = !on;
      });
    };
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (event) => {
        const i = tabs.indexOf(tab);
        if (event.key === "ArrowRight") { tabs[(i + 1) % tabs.length].focus(); select(tabs[(i + 1) % tabs.length]); }
        if (event.key === "ArrowLeft") { tabs[(i - 1 + tabs.length) % tabs.length].focus(); select(tabs[(i - 1 + tabs.length) % tabs.length]); }
      });
    });
    showcase.querySelectorAll(".thumbs").forEach((strip) => {
      const target = document.getElementById(strip.dataset.target);
      strip.addEventListener("click", (event) => {
        const pick = event.target.closest(".thumb");
        if (!pick || !target) return;
        strip.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("is-active", t === pick));
        const next = new Image();
        next.onload = () => { target.src = pick.dataset.src; target.alt = pick.dataset.alt || ""; };
        next.src = pick.dataset.src;
      });
    });
  }

  /* ── atlas styles ───────────────────────────────── */
  const styles = document.getElementById("styles");
  if (styles) {
    const stage = styles.querySelector(".styles-stage");
    const img = document.getElementById("styles-img");
    const cap = document.getElementById("styles-caption");
    styles.querySelector(".styles-strip").addEventListener("click", (event) => {
      const pick = event.target.closest(".style-pick");
      if (!pick) return;
      styles.querySelectorAll(".style-pick").forEach((p) => p.classList.toggle("is-active", p === pick));
      stage.classList.add("is-swapping");
      const next = new Image();
      next.onload = () => {
        img.src = pick.dataset.src;
        img.alt = pick.dataset.alt || "";
        cap.textContent = pick.dataset.caption;
        requestAnimationFrame(() => stage.classList.remove("is-swapping"));
      };
      next.src = pick.dataset.src;
    });
  }

  /* ── guide contents: mark the section in view ───── */
  const toc = document.querySelector(".guide-toc .toc-list");
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

  /* ── compare slider ─────────────────────────────── */
  const compare = document.getElementById("compare");
  if (compare) {
    const range = document.getElementById("compare-range");
    const over = document.getElementById("compare-over");
    const handle = document.getElementById("compare-handle");
    const set = (value) => {
      over.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
      handle.style.left = `${value}%`;
    };
    range.addEventListener("input", () => set(Number(range.value)));
    set(Number(range.value));
  }
})();

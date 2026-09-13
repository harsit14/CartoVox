/* A toy seed search, drawn in the browser.

   Six seeds, one hard constraint: exactly three continents. Each candidate is
   a little planet — value noise on a cylinder so east and west wrap — with its
   continents counted honestly and the miss stated as a number. It sketches the
   workflow; the real search scores a whole brief against a simulated sphere. */
(() => {
  "use strict";
  const grid = document.getElementById("demo-grid");
  const button = document.getElementById("demo-search");
  const foot = document.getElementById("demo-foot");
  if (!grid || !button) return;

  const W = 240, H = 120;            // cells per candidate
  const MIN_CONTINENT = 0.018;       // share of the globe: below this it is an island
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* deterministic randomness */
  const mulberry = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash3 = (x, y, z, s) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1013904223) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * (3 - 2 * t);
  const noise3 = (x, y, z, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const lerp = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
    return lerp(
      lerp(lerp(c(0,0,0), c(1,0,0), u), lerp(c(0,1,0), c(1,1,0), u), v),
      lerp(lerp(c(0,0,1), c(1,0,1), u), lerp(c(0,1,1), c(1,1,1), u), v), w);
  };

  /* one candidate planet */
  const buildWorld = (seed) => {
    const rnd = mulberry(seed);
    const s = Math.floor(rnd() * 1e6);
    const landShare = 0.26 + rnd() * 0.14;
    const scale = 1.6 + rnd() * 1.2;
    const field = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const lat = (y / H - 0.5) * 2;            // -1 .. 1
      for (let x = 0; x < W; x++) {
        const theta = (x / W) * Math.PI * 2;    // wraps east-west
        const cx = Math.cos(theta) * scale, cz = Math.sin(theta) * scale, cy = lat * scale * 1.1;
        let amp = 1, freq = 1, sum = 0, norm = 0;
        for (let o = 0; o < 5; o++) {
          sum += amp * noise3(cx * freq + 7.1, cy * freq + 3.3, cz * freq + 11.7, s + o * 101);
          norm += amp; amp *= 0.5; freq *= 2.05;
        }
        let h = sum / norm;
        h -= 0.12 * Math.pow(Math.abs(lat), 3); // a little polar ocean
        field[y * W + x] = h;
      }
    }
    // Sea level at the quantile that gives this seed's land share.
    const sorted = Float32Array.from(field).sort();
    const sea = sorted[Math.floor((1 - landShare) * sorted.length)];
    const land = new Uint8Array(W * H);
    for (let i = 0; i < field.length; i++) land[i] = field[i] > sea ? 1 : 0;
    // Count connected landmasses, wrapping across the east-west edge.
    const comp = new Int32Array(W * H).fill(-1);
    const sizes = [];
    const stack = [];
    for (let i = 0; i < land.length; i++) {
      if (!land[i] || comp[i] !== -1) continue;
      const id = sizes.length; let size = 0;
      stack.push(i); comp[i] = id;
      while (stack.length) {
        const j = stack.pop(); size++;
        const x = j % W, y = (j - x) / W;
        const n = [[(x + 1) % W, y], [(x - 1 + W) % W, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of n) {
          if (ny < 0 || ny >= H) continue;
          const k = ny * W + nx;
          if (land[k] && comp[k] === -1) { comp[k] = id; stack.push(k); }
        }
      }
      sizes.push(size);
    }
    const continents = sizes.filter((n) => n / (W * H) >= MIN_CONTINENT).length;
    const largest = sizes.length ? Math.max(...sizes) / sizes.reduce((a, b) => a + b, 0) : 0;
    return { seed, field, sea, land, comp, sizes, continents, largest, landShare };
  };

  /* paint it */
  const paint = (canvas, world) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(W, H);
    const d = image.data;
    const { field, sea, land } = world;
    const isCoast = (i) => {
      const x = i % W, y = (i - x) / W;
      const n = [[(x + 1) % W, y], [(x - 1 + W) % W, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of n) { if (ny < 0 || ny >= H) continue; if (!land[ny * W + nx]) return true; }
      return false;
    };
    for (let i = 0; i < W * H; i++) {
      const h = field[i], y = (i - (i % W)) / W, lat = Math.abs(y / H - 0.5) * 2;
      let r, g, b;
      if (!land[i]) {
        const depth = Math.min(1, (sea - h) * 4.5);
        r = 24 + (1 - depth) * 26; g = 50 + (1 - depth) * 46; b = 92 + (1 - depth) * 60;
      } else {
        const t = Math.min(1, (h - sea) * 6);
        if (lat > 0.86) { r = 232; g = 230; b = 224; }
        else if (t < 0.35) { r = 200 - t * 60; g = 190 - t * 40; b = 140 - t * 60; }
        else if (t < 0.7) { r = 150 - (t - 0.35) * 90; g = 132 - (t - 0.35) * 70; b = 94 - (t - 0.35) * 50; }
        else { const w = (t - 0.7) / 0.3; r = 118 + w * 120; g = 106 + w * 130; b = 84 + w * 150; }
        if (isCoast(i)) { r = 226; g = 190; b = 110; }
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    // Paint at cell scale, then let the canvas scale up smoothly.
    const small = document.createElement("canvas");
    small.width = W; small.height = H;
    small.getContext("2d").putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    // A faint graticule, because it is a planet.
    ctx.strokeStyle = "rgba(240,220,160,0.14)"; ctx.lineWidth = 1;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo((canvas.width / 6) * k, 0); ctx.lineTo((canvas.width / 6) * k, canvas.height); ctx.stroke(); }
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(0, (canvas.height / 3) * k); ctx.lineTo(canvas.width, (canvas.height / 3) * k); ctx.stroke(); }
  };

  const verdict = (world) => {
    const n = world.continents;
    if (n === 3) return { ok: true, text: "3 continents · matches" };
    const diff = n - 3;
    return { ok: false, text: `${n} continent${n === 1 ? "" : "s"} · ${diff > 0 ? "+" : ""}${diff}` };
  };

  const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>';

  let searching = false;
  const search = () => {
    if (searching) return;
    searching = true;
    button.disabled = true;
    grid.innerHTML = "";
    const base = Math.floor(Math.random() * 900000000) + 100000000;
    const worlds = [];
    for (let i = 0; i < 6; i++) worlds.push(buildWorld(base + i * 7919));
    let matches = 0;
    worlds.forEach((world, i) => {
      const li = document.createElement("li");
      li.className = "cand";
      const v = verdict(world);
      if (v.ok) { li.classList.add("is-match"); matches++; }
      li.innerHTML = `
        <canvas width="${W}" height="${H}" role="img" aria-label="Candidate world for seed ${world.seed}: ${v.text}"></canvas>
        <button type="button" class="cand-fav" aria-pressed="false" aria-label="Favourite seed ${world.seed}">${star}</button>
        <div class="cand-meta"><span class="cand-seed">seed ${world.seed}</span><span class="cand-verdict">${v.text}</span></div>`;
      grid.appendChild(li);
      paint(li.querySelector("canvas"), world);
      li.querySelector(".cand-fav").addEventListener("click", (event) => {
        const b = event.currentTarget;
        b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
      });
      const delay = reduceMotion ? 0 : 140 + i * 160;
      setTimeout(() => li.classList.add("is-in"), delay);
    });
    const done = reduceMotion ? 0 : 140 + 6 * 160;
    setTimeout(() => {
      foot.innerHTML = matches
        ? `<b>${matches} of 6</b> match the hard constraint. The others are reported as they measured, not as near misses dressed up. Star a candidate to teach the next search your taste.`
        : `<b>0 of 6</b> match. CartoVox would say so and keep searching — it never returns the nearest thing as a match. Search again.`;
      button.textContent = "Search again";
      button.disabled = false;
      searching = false;
    }, done);
  };

  button.addEventListener("click", search);
  // Draw a first set once the demo scrolls into view, so it is never empty.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); search(); }
    }, { threshold: 0.3 });
    io.observe(grid);
  } else search();
})();

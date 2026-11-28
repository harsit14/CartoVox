/* cartovox.org — the home page's turning globe.

   Eofordal, the example world every new copy of CartoVox opens on, wrapped
   round an orthographic globe on a 2D canvas (no WebGL) with a graticule of
   thirty-degree meridians and parallels. Each pixel of the disc knows once
   which latitude and longitude it shows, so a frame is one pass of 32-bit
   copies; light and the limb are CSS over the canvas.

   It turns slowly and only while it is on screen and the tab is visible.
   Reduced motion draws one still frame. Dragging turns it either way.
   The still poster under the canvas (tools/build-globe.py) is what shows
   before this runs, or without JavaScript. TILT and START match that tool. */
(() => {
  "use strict";
  const box = document.querySelector("[data-globe]");
  if (!box) return;
  const canvas = box.querySelector("canvas");
  const src = box.getAttribute("data-globe");
  if (!canvas || !src || !canvas.getContext) return;

  const TILT = 18 * Math.PI / 180;
  const START = 0.62;
  const TURN_SECONDS = 150;   // one whole turn
  const FPS = 24;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const img = new Image();
  img.decoding = "async";
  img.src = src;

  let tex32 = null, tw = 0, th = 0;
  let size = 0, map = null, frame = null, out32 = null, ctx = null;
  let offset = START, last = 0, running = false, visible = true, raf = 0;
  let drag = null;

  const setup = () => {
    const css = Math.round(canvas.clientWidth || box.clientWidth);
    if (!css) return false;
    const n = Math.min(900, Math.round(css * Math.min(window.devicePixelRatio || 1, 1.5)));
    if (n === size && map) return true;
    size = n;
    canvas.width = canvas.height = size;
    ctx = canvas.getContext("2d");
    frame = ctx.createImageData(size, size);
    out32 = new Uint32Array(frame.data.buffer);
    // For every pixel inside the disc: where it writes, which texture row,
    // and its longitude as a fraction of a turn.
    const idx = [], row = [], lon = [];
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    for (let j = 0; j < size; j++) {
      const y = 1 - (j + 0.5) / size * 2;
      for (let i = 0; i < size; i++) {
        const x = (i + 0.5) / size * 2 - 1;
        const rr = x * x + y * y;
        if (rr > 1) continue;
        const z = Math.sqrt(1 - rr);
        const y2 = y * ct + z * st;
        const z2 = -y * st + z * ct;
        const lat = Math.asin(Math.max(-1, Math.min(1, y2)));
        const lo = Math.atan2(x, z2) / (2 * Math.PI) + 0.5;
        idx.push(j * size + i);
        row.push(Math.min(th - 1, Math.floor((0.5 - lat / Math.PI) * th)) * tw);
        lon.push(lo);
      }
    }
    map = { idx: Int32Array.from(idx), row: Int32Array.from(row), lon: Float32Array.from(lon) };
    return true;
  };

  // The graticule: meridians every 30 degrees turn with the world,
  // parallels stay put.
  const project = (latR, lonR) => {
    const x = Math.cos(latR) * Math.sin(lonR);
    const y = Math.sin(latR);
    const z = Math.cos(latR) * Math.cos(lonR);
    const y2 = y * Math.cos(TILT) - z * Math.sin(TILT);
    const z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
    return [x, y2, z2];
  };
  const graticule = () => {
    const r = size / 2;
    ctx.save();
    ctx.lineWidth = Math.max(1, size / 520);
    ctx.strokeStyle = "rgba(241, 215, 143, 0.34)";
    const line = (pts) => {
      let pen = false;
      ctx.beginPath();
      for (const [x, y, z] of pts) {
        if (z < 0) { pen = false; continue; }
        const px = r + x * r, py = r - y * r;
        if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
      }
      ctx.stroke();
    };
    for (let m = 0; m < 12; m++) {
      const lonR = (m / 12 - offset) * 2 * Math.PI;
      const pts = [];
      for (let a = -90; a <= 90; a += 4) pts.push(project(a * Math.PI / 180, lonR));
      line(pts);
    }
    for (let p = -60; p <= 60; p += 30) {
      const pts = [];
      for (let a = 0; a <= 360; a += 4) pts.push(project(p * Math.PI / 180, a * Math.PI / 180));
      if (p === 0) ctx.strokeStyle = "rgba(241, 215, 143, 0.5)";
      line(pts);
      if (p === 0) ctx.strokeStyle = "rgba(241, 215, 143, 0.34)";
    }
    ctx.restore();
  };

  const draw = () => {
    if (!map) return;
    const { idx, row, lon } = map;
    const off = ((offset % 1) + 1) % 1;
    for (let k = 0, n = idx.length; k < n; k++) {
      // Longitude wraps with a modulo, so the texture's two edges meet.
      let u = lon[k] + off;
      u -= Math.floor(u);
      out32[idx[k]] = tex32[row[k] + Math.min(tw - 1, (u * tw) | 0)];
    }
    ctx.putImageData(frame, 0, 0);
    graticule();
  };

  const tick = (now) => {
    raf = 0;
    if (!running) return;
    if (!drag && now - last >= 1000 / FPS) {
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      offset -= dt / TURN_SECONDS;   // eastward, as a planet turns
      draw();
    }
    raf = requestAnimationFrame(tick);
  };
  const play = () => {
    const should = visible && !still.matches && !document.hidden && map;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(tick); }
    if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  };

  const start = () => {
    tw = img.naturalWidth; th = img.naturalHeight;
    const scratch = document.createElement("canvas");
    scratch.width = tw; scratch.height = th;
    const sctx = scratch.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    tex32 = new Uint32Array(sctx.getImageData(0, 0, tw, th).data.buffer);
    if (!setup()) return;
    draw();
    box.classList.add("is-live");
    play();
  };
  img.addEventListener("load", () => {
    // Build the lookup off the first paint.
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 1)))(start);
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      play();
    }).observe(box);
  }
  document.addEventListener("visibilitychange", play);
  still.addEventListener?.("change", play);
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (tex32 && setup()) draw(); }, 150);
  });

  // Drag to turn: the reader's own hand, so it works under reduced motion too.
  canvas.addEventListener("pointerdown", (e) => {
    if (!map) return;
    drag = { x: e.clientX, o: offset };
    canvas.setPointerCapture(e.pointerId);
    box.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    offset = drag.o - (e.clientX - drag.x) / (box.clientWidth * Math.PI);
    draw();
  });
  const end = () => { drag = null; box.classList.remove("is-dragging"); last = 0; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
})();

/**
 * dither-bg.js — Dithered gradient background for the splash screen.
 *
 * Renders an animated Bayer-dithered gradient on a canvas element using
 * the gray hierarchy (--bg through --border) so it never washes out text.
 * The accent color appears only as sparse, dim highlights.
 */

export function initDitherBackground() {
  var canvas = document.getElementById("dither-bg");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var animFrame = null;
  var time = Math.random() * 100;

  // --- Configuration ---
  var CELL_SIZE = 2;
  var SPEED = 0.015;

  // --- Gray palette (matches CSS hierarchy) ---
  // In light mode, use dark grays so the pattern is visible on the light bg
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  var GRAYS = isLight ? [
    { r: 228, g: 228, b: 228 }, // matches --bg #e4e4e4
    { r: 210, g: 210, b: 210 },
    { r: 180, g: 180, b: 180 },
    { r: 150, g: 150, b: 150 },
    { r: 120, g: 120, b: 120 },
    { r: 80,  g: 80,  b: 80  },
  ] : [
    { r: 0,  g: 0,  b: 0  },   // #000000 — pure black
    { r: 12, g: 12, b: 12 },   // #0c0c0c
    { r: 28, g: 28, b: 28 },   // #1c1c1c
    { r: 48, g: 48, b: 48 },   // #303030
    { r: 72, g: 72, b: 72 },   // #484848
    { r: 100, g: 100, b: 100 }, // #646464
  ];

  // --- Bayer 8×8 ordered dither matrix ---
  var bayerMatrix = [
    [ 0, 32,  8, 40,  2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44,  4, 36, 14, 46,  6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [ 3, 35, 11, 43,  1, 33,  9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47,  7, 39, 13, 45,  5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];

  // Normalize to 0–1
  for (var i = 0; i < 8; i++) {
    for (var j = 0; j < 8; j++) {
      bayerMatrix[i][j] /= 64;
    }
  }

  // --- Resize handler ---
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // --- Lerp between two colors ---
  function lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    };
  }

  // --- Sample from gray palette by position (0–1) ---
  function sampleGray(val) {
    var pos = val * (GRAYS.length - 1);
    var idx = Math.min(GRAYS.length - 2, Math.floor(pos));
    var frac = pos - idx;
    return lerpColor(GRAYS[idx], GRAYS[idx + 1], frac);
  }

  // --- Core render ---
  function draw() {
    var w = canvas.width;
    var h = canvas.height;
    var cell = CELL_SIZE;
    var imgData = ctx.createImageData(w, h);
    var data = imgData.data;
    var cols = Math.ceil(w / cell);
    var rows = Math.ceil(h / cell);

    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var px = col * cell;
        var py = row * cell;

        // Moving center for radial component
        var cx = w * 0.5 + Math.sin(time * 0.3) * w * 0.25;
        var cy = h * 0.5 + Math.cos(time * 0.25) * h * 0.25;
        var dx = (px - cx) / w;
        var dy = (py - cy) / h;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // g1: Radial pulse — slow, wide
        var g1 = 0.5 + 0.5 * Math.sin(dist * 4 - time * 0.6);

        // g2: Diagonal wave
        var g2 = 0.5 + 0.5 * Math.sin((px * 0.003 + py * 0.002) + time * 0.4);

        // g3: Vertical drift
        var g3 = 0.5 + 0.5 * Math.cos((py * 0.004) - time * 0.2);

        // Combine — balanced mix
        var val = (g1 * 0.4 + g2 * 0.3 + g3 * 0.3);

        // Bayer dither: compare against threshold to create pattern
        var threshold = bayerMatrix[row & 7][col & 7];

        // Use threshold to pick between two gray levels
        // val drives which part of the gray ramp we're in
        var lo = val * 0.3;          // darker neighbor — stays near black
        var hi = val * 0.5 + 0.4;    // brighter neighbor
        var quantized = (val > threshold) ? hi : lo;

        // Clamp to keep it in the darker zone (0–0.85 of palette range)
        quantized = quantized * 0.85;

        // Sample color from gray palette
        var color = sampleGray(quantized);
        var r = color.r;
        var g = color.g;
        var b = color.b;

        // Fill the cell block
        for (var sy = 0; sy < cell && py + sy < h; sy++) {
          for (var sx = 0; sx < cell && px + sx < w; sx++) {
            var idx = ((py + sy) * w + (px + sx)) * 4;
            data[idx]     = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    time += SPEED;
    animFrame = requestAnimationFrame(draw);
  }

  // --- Start ---
  draw();

  // --- Public API ---
  window.ditherBackground = {
    stop: function () {
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    },
    start: function () {
      if (!animFrame) draw();
    }
  };
}

/**
 * Render a single static frame of the dither pattern onto a canvas.
 * Uses a seed value to produce a unique "frozen moment" per album.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas element.
 * @param {number} seed - Numeric seed to vary the pattern (e.g. album ID).
 */
export function renderDitherFrame(canvas, seed) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  if (!w || !h) return;

  var CELL_SIZE = 2;
  var time = (seed * 7.3) % 100; // Deterministic "moment" from seed

  var GRAYS = [
    { r: 0,  g: 0,  b: 0  },
    { r: 10, g: 10, b: 10 },
    { r: 24, g: 24, b: 24 },
    { r: 42, g: 42, b: 42 },
    { r: 60, g: 60, b: 60 },
    { r: 80, g: 80, b: 80 },
  ];

  var bayerMatrix = [
    [ 0, 32,  8, 40,  2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44,  4, 36, 14, 46,  6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [ 3, 35, 11, 43,  1, 33,  9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47,  7, 39, 13, 45,  5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];
  for (var i = 0; i < 8; i++)
    for (var j = 0; j < 8; j++)
      bayerMatrix[i][j] /= 64;

  function lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    };
  }

  function sampleGray(val) {
    var pos = val * (GRAYS.length - 1);
    var idx = Math.min(GRAYS.length - 2, Math.floor(pos));
    var frac = pos - idx;
    return lerpColor(GRAYS[idx], GRAYS[idx + 1], frac);
  }

  var imgData = ctx.createImageData(w, h);
  var data = imgData.data;
  var cols = Math.ceil(w / CELL_SIZE);
  var rows = Math.ceil(h / CELL_SIZE);

  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      var px = col * CELL_SIZE;
      var py = row * CELL_SIZE;

      var cx = w * 0.5 + Math.sin(time * 0.3) * w * 0.25;
      var cy = h * 0.5 + Math.cos(time * 0.25) * h * 0.25;
      var dx = (px - cx) / w;
      var dy = (py - cy) / h;
      var dist = Math.sqrt(dx * dx + dy * dy);

      var g1 = 0.5 + 0.5 * Math.sin(dist * 4 - time * 0.6);
      var g2 = 0.5 + 0.5 * Math.sin((px * 0.003 + py * 0.002) + time * 0.4);
      var g3 = 0.5 + 0.5 * Math.cos((py * 0.004) - time * 0.2);
      var val = (g1 * 0.4 + g2 * 0.3 + g3 * 0.3);

      var threshold = bayerMatrix[row & 7][col & 7];
      var lo = val * 0.3;
      var hi = val * 0.5 + 0.4;
      var quantized = (val > threshold) ? hi : lo;
      quantized = quantized * 0.8;

      var color = sampleGray(quantized);

      for (var sy = 0; sy < CELL_SIZE && py + sy < h; sy++) {
        for (var sx = 0; sx < CELL_SIZE && px + sx < w; sx++) {
          var idx = ((py + sy) * w + (px + sx)) * 4;
          data[idx]     = color.r;
          data[idx + 1] = color.g;
          data[idx + 2] = color.b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// ----------------------------------------------------------------------------
// Generic dither placeholder (track thumbs, album-expanded art, player art).
//
// Emits a canvas element with `class="dither-canvas" data-seed="..."`, then a
// shared IntersectionObserver lazily renders each one when it scrolls into
// view. Canvases are sized from their rendered layout size on first paint so
// the pattern stays crisp at any CSS dimension.
// ----------------------------------------------------------------------------

let _sharedObserver = null;

function getSharedObserver() {
  if (_sharedObserver) return _sharedObserver;
  _sharedObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const canvas = entry.target;
      if (canvas.dataset.rendered === '1') {
        obs.unobserve(canvas);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(16, Math.round(rect.width));
      const h = Math.max(16, Math.round(rect.height));
      if (!w || !h) return; // not laid out yet; let it retry on next entry
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const seed = parseInt(canvas.dataset.seed || '1', 10) || 1;
      renderDitherFrame(canvas, seed);
      canvas.dataset.rendered = '1';
      obs.unobserve(canvas);
    });
  }, { rootMargin: '200px' });
  return _sharedObserver;
}

/**
 * Return markup for a seeded dither placeholder. Size is driven by the
 * parent container's CSS — the canvas stretches to fill it.
 *
 * @param {number|string} seed — stable value used to derive the pattern
 * @returns {string} HTML for a single canvas element
 */
export function ditherCanvasHtml(seed) {
  const s = Number(seed) || 1;
  return `<canvas class="dither-canvas" data-seed="${s}"></canvas>`;
}

/**
 * Attach the shared lazy-render observer to any `.dither-canvas` elements
 * inside `root` that haven't been rendered yet. Call this after injecting
 * markup that contains dither canvases.
 *
 * @param {HTMLElement | Document} root
 */
export function bindDitherCanvases(root) {
  if (!root) return;
  const obs = getSharedObserver();
  root.querySelectorAll('canvas.dither-canvas:not([data-rendered="1"])').forEach(c => {
    obs.observe(c);
  });
}

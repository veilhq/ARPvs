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
  var GRAYS = [
    { r: 0,  g: 0,  b: 0  },   // #000000 — pure black
    { r: 10, g: 10, b: 10 },   // #0a0a0a
    { r: 24, g: 24, b: 24 },   // #181818
    { r: 42, g: 42, b: 42 },   // #2a2a2a
    { r: 60, g: 60, b: 60 },   // #3c3c3c
    { r: 80, g: 80, b: 80 },   // #505050
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

        // Clamp to keep it in the dark zone (0–0.8 of palette range)
        quantized = quantized * 0.8;

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

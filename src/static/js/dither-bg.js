/**
 * dither-bg.js — Dithered liquid gradient background for the splash screen.
 *
 * Renders an animated Bayer-dithered gradient on a canvas element.
 * Uses an 8×8 ordered dither matrix to quantize layered gradients into
 * on/off pixels, creating a retro halftone look that animates fluidly.
 */

export function initDitherBackground() {
  var canvas = document.getElementById("dither-bg");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var animFrame = null;
  var time = Math.random() * 100;

  // --- Configuration ---
  var CELL_SIZE = 2;
  var SPEED = 0.02;
  var ALPHA = 200;

  // --- Colors ---
  // Read initial accent from localStorage or CSS variable
  var storedAccent = localStorage.getItem('arpvs-accent-color');
  var accentColor = { r: 0, g: 255, b: 65 }; // fallback: #00ff41
  if (storedAccent && storedAccent.length === 7) {
    accentColor = {
      r: parseInt(storedAccent.slice(1, 3), 16),
      g: parseInt(storedAccent.slice(3, 5), 16),
      b: parseInt(storedAccent.slice(5, 7), 16)
    };
  }
  var paletteColors = null;

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

  // Normalize to 0–1 range
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

  // --- Core render function ---
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

        // Moving center point for radial component
        var cx = w * 0.5 + Math.sin(time * 0.4) * w * 0.3;
        var cy = h * 0.5 + Math.cos(time * 0.3) * h * 0.3;
        var dx = (px - cx) / w;
        var dy = (py - cy) / h;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // g1: Radial pulse from moving center
        var g1 = 0.5 + 0.5 * Math.sin(dist * 6 - time * 0.8);

        // g2: Diagonal wave
        var g2 = 0.5 + 0.5 * Math.sin((px * 0.004 + py * 0.003) + time * 0.5);

        // g3: Counter-diagonal wave
        var g3 = 0.5 + 0.5 * Math.cos((py * 0.005 - px * 0.003) - time * 0.3);

        // Combine: radial dominates (50%), diagonals add texture (25% each)
        var val = (g1 * 0.5 + g2 * 0.25 + g3 * 0.25);

        // Power curve for more contrast
        val = val * val;

        // Bayer dither threshold
        var threshold = bayerMatrix[row & 7][col & 7];
        var on = val > threshold;

        // Determine pixel color
        var r, g, b, a;
        if (on && paletteColors) {
          var rawVal = (g1 * 0.5 + g2 * 0.25 + g3 * 0.25);
          var pos = rawVal * 3;
          var ci = Math.min(2, Math.floor(pos));
          var frac = pos - ci;
          var cA = paletteColors[ci];
          var cB = paletteColors[ci + 1];
          r = Math.round(cA.r + (cB.r - cA.r) * frac);
          g = Math.round(cA.g + (cB.g - cA.g) * frac);
          b = Math.round(cA.b + (cB.b - cA.b) * frac);
          a = ALPHA;
        } else if (on) {
          r = accentColor.r;
          g = accentColor.g;
          b = accentColor.b;
          a = ALPHA;
        } else {
          r = 0; g = 0; b = 0; a = 0;
        }

        // Fill the cell block
        for (var sy = 0; sy < cell && py + sy < h; sy++) {
          for (var sx = 0; sx < cell && px + sx < w; sx++) {
            var idx = ((py + sy) * w + (px + sx)) * 4;
            data[idx]     = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }

    // Clear and draw
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.putImageData(imgData, 0, 0);

    // Advance time
    time += SPEED;
    animFrame = requestAnimationFrame(draw);
  }

  // --- Start animation ---
  draw();

  // --- Public API ---
  window.ditherBackground = {
    stop: function () {
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    },
    start: function () {
      if (!animFrame) draw();
    },
    setColor: function (hex) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      accentColor = { r: r, g: g, b: b };
    },
    setPalette: function (hexArray) {
      if (!hexArray) { paletteColors = null; return; }
      paletteColors = hexArray.map(function (hex) {
        return {
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16)
        };
      });
    },
    setSpeed: function (s) { SPEED = s; },
    setCellSize: function (s) { CELL_SIZE = s; }
  };
}

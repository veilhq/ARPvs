/**
 * color-picker.js — Custom inline color picker for the accent color.
 * Replaces the native <input type="color"> with a styled popover.
 */

import { setAccentColor, getAccentColor } from './theme.js';

let pickerEl = null;
let isOpen = false;

// --- Color math ---

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    h *= 360;
  }
  return { h, s, l };
}

// --- State ---

let currentHue = 100;
let currentSat = 1;
let currentLit = 0.5;

function syncFromHex(hex) {
  const { h, s, l } = hexToHsl(hex);
  currentHue = h;
  currentSat = s;
  currentLit = l;
}

function currentHex() {
  return hslToHex(currentHue, currentSat, currentLit);
}

// --- Build picker DOM ---

function createPicker() {
  const el = document.createElement('div');
  el.className = 'color-picker-popover';
  el.innerHTML = `
    <div class="cp-header">
      <span class="cp-label">Accent Color</span>
      <button class="cp-close">&times;</button>
    </div>
    <div class="cp-body">
      <div class="cp-hue-wrap">
        <div class="cp-hue-track">
          <div class="cp-hue-thumb"></div>
        </div>
      </div>
      <div class="cp-sat-wrap">
        <div class="cp-sat-track">
          <div class="cp-sat-thumb"></div>
        </div>
        <span class="cp-sat-label">SAT</span>
      </div>
      <div class="cp-lit-wrap">
        <div class="cp-lit-track">
          <div class="cp-lit-thumb"></div>
        </div>
        <span class="cp-lit-label">LIT</span>
      </div>
      <div class="cp-hex-row">
        <span class="cp-hex-label">HEX</span>
        <input type="text" class="cp-hex-input" maxlength="7" spellcheck="false" autocomplete="off">
        <div class="cp-preview"></div>
      </div>
    </div>
  `;
  return el;
}

// --- Slider interaction ---

function bindSlider(track, thumb, onChange) {
  let dragging = false;

  function update(e) {
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(x);
  }

  track.addEventListener('mousedown', (e) => {
    dragging = true;
    update(e);
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (dragging) update(e);
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });
}

// --- Render state into DOM ---

function renderPicker() {
  if (!pickerEl) return;

  const hueThumb = pickerEl.querySelector('.cp-hue-thumb');
  const satThumb = pickerEl.querySelector('.cp-sat-thumb');
  const litThumb = pickerEl.querySelector('.cp-lit-thumb');
  const satTrack = pickerEl.querySelector('.cp-sat-track');
  const litTrack = pickerEl.querySelector('.cp-lit-track');
  const hexInput = pickerEl.querySelector('.cp-hex-input');
  const preview = pickerEl.querySelector('.cp-preview');

  const hex = currentHex();

  hueThumb.style.left = `${(currentHue / 360) * 100}%`;
  satThumb.style.left = `${currentSat * 100}%`;
  litThumb.style.left = `${currentLit * 100}%`;

  // Sat track gradient: grey to full-sat at current hue
  satTrack.style.background = `linear-gradient(to right, ${hslToHex(currentHue, 0, currentLit)}, ${hslToHex(currentHue, 1, currentLit)})`;

  // Lit track gradient: black to white through current hue
  litTrack.style.background = `linear-gradient(to right, #000, ${hslToHex(currentHue, currentSat, 0.5)}, #fff)`;

  if (document.activeElement !== hexInput) {
    hexInput.value = hex;
  }
  preview.style.background = hex;
}

// --- Public API ---

export function setupColorPicker() {
  const trigger = document.querySelector('.accent-picker');
  if (!trigger) return;

  // Hide the native input visually but keep it for form compat
  trigger.style.cursor = 'pointer';

  // Replace click behavior
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      closePicker();
    } else {
      openPicker(trigger);
    }
  });
}

function openPicker(anchor) {
  if (pickerEl) closePicker();

  syncFromHex(getAccentColor());
  pickerEl = createPicker();
  document.body.appendChild(pickerEl);

  // Position above the anchor
  const rect = anchor.getBoundingClientRect();
  pickerEl.style.position = 'fixed';
  pickerEl.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  pickerEl.style.left = `${rect.left}px`;

  isOpen = true;
  renderPicker();

  // Bind sliders
  bindSlider(
    pickerEl.querySelector('.cp-hue-track'),
    pickerEl.querySelector('.cp-hue-thumb'),
    (x) => { currentHue = x * 360; applyColor(); }
  );

  bindSlider(
    pickerEl.querySelector('.cp-sat-track'),
    pickerEl.querySelector('.cp-sat-thumb'),
    (x) => { currentSat = x; applyColor(); }
  );

  bindSlider(
    pickerEl.querySelector('.cp-lit-track'),
    pickerEl.querySelector('.cp-lit-thumb'),
    (x) => { currentLit = x; applyColor(); }
  );

  // Hex input
  const hexInput = pickerEl.querySelector('.cp-hex-input');
  hexInput.addEventListener('input', () => {
    let val = hexInput.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      syncFromHex(val);
      applyColor();
    }
  });

  // Close button
  pickerEl.querySelector('.cp-close').addEventListener('click', closePicker);

  // Close on outside click (delayed to avoid immediate close)
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClickHandler);
  }, 0);
}

function closePicker() {
  if (pickerEl && pickerEl.parentNode) {
    pickerEl.parentNode.removeChild(pickerEl);
  }
  pickerEl = null;
  isOpen = false;
  document.removeEventListener('mousedown', outsideClickHandler);
}

function outsideClickHandler(e) {
  if (pickerEl && !pickerEl.contains(e.target) && !e.target.closest('.accent-picker')) {
    closePicker();
  }
}

function applyColor() {
  const hex = currentHex();
  setAccentColor(hex);

  // Sync the accent button background
  const accentBtn = document.getElementById('accent-color');
  if (accentBtn) accentBtn.style.background = hex;

  renderPicker();
}

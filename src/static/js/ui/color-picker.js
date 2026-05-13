/**
 * color-picker.js — Custom inline HSL color picker for the accent color.
 * Uses pointer events for reliable cross-browser drag handling.
 */

import { setAccentColor, getAccentColor } from './theme.js';

let pickerEl = null;
let isOpen = false;

// --- HSL state ---
let hue = 0;
let sat = 1;
let lit = 0.5;

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
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
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

function currentHex() {
  return hslToHex(hue, sat, lit);
}

function syncFromHex(hex) {
  const parsed = hexToHsl(hex);
  hue = parsed.h;
  sat = parsed.s;
  lit = parsed.l;
}

// --- Slider logic using pointer capture ---

function makeSlider(track, thumb, onValue) {
  function posFromEvent(e) {
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    onValue(posFromEvent(e));
  });

  track.addEventListener('pointermove', (e) => {
    if (track.hasPointerCapture(e.pointerId)) {
      onValue(posFromEvent(e));
    }
  });

  track.addEventListener('pointerup', (e) => {
    track.releasePointerCapture(e.pointerId);
  });
}

// --- Render current state into DOM ---

function render() {
  if (!pickerEl) return;
  const hex = currentHex();

  // Thumb positions
  pickerEl.querySelector('.cp-hue-thumb').style.left = `${(hue / 360) * 100}%`;
  pickerEl.querySelector('.cp-sat-thumb').style.left = `${sat * 100}%`;
  pickerEl.querySelector('.cp-lit-thumb').style.left = `${lit * 100}%`;

  // Dynamic gradients
  const satTrack = pickerEl.querySelector('.cp-sat-track');
  satTrack.style.background = `linear-gradient(to right, ${hslToHex(hue, 0, lit)}, ${hslToHex(hue, 1, lit)})`;

  const litTrack = pickerEl.querySelector('.cp-lit-track');
  litTrack.style.background = `linear-gradient(to right, #000, ${hslToHex(hue, sat, 0.5)}, #fff)`;

  // Hex input (don't overwrite while user is typing)
  const hexInput = pickerEl.querySelector('.cp-hex-input');
  if (document.activeElement !== hexInput) {
    hexInput.value = hex;
  }

  // Preview swatch
  pickerEl.querySelector('.cp-preview').style.background = hex;
}

function applyColor() {
  const hex = currentHex();
  setAccentColor(hex);
  const btn = document.getElementById('accent-color');
  if (btn) btn.style.background = hex;
  render();
}

// --- Build DOM ---

function createPickerDOM() {
  const el = document.createElement('div');
  el.className = 'color-picker-popover';
  el.innerHTML = `
    <div class="cp-header">
      <span class="cp-label">Accent Color</span>
      <button class="cp-close">&times;</button>
    </div>
    <div class="cp-body">
      <div class="cp-slider-row">
        <div class="cp-hue-track cp-track">
          <div class="cp-hue-thumb cp-thumb"></div>
        </div>
      </div>
      <div class="cp-slider-row">
        <div class="cp-sat-track cp-track">
          <div class="cp-sat-thumb cp-thumb"></div>
        </div>
        <span class="cp-track-label">SAT</span>
      </div>
      <div class="cp-slider-row">
        <div class="cp-lit-track cp-track">
          <div class="cp-lit-thumb cp-thumb"></div>
        </div>
        <span class="cp-track-label">LIT</span>
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

// --- Open / Close ---

function openPicker(anchor) {
  if (pickerEl) closePicker();

  syncFromHex(getAccentColor());
  pickerEl = createPickerDOM();
  document.body.appendChild(pickerEl);

  // Position above the trigger button
  const rect = anchor.getBoundingClientRect();
  pickerEl.style.position = 'fixed';
  pickerEl.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  pickerEl.style.left = `${rect.left}px`;

  render();

  // Bind sliders
  makeSlider(
    pickerEl.querySelector('.cp-hue-track'),
    pickerEl.querySelector('.cp-hue-thumb'),
    (v) => { hue = v * 360; applyColor(); }
  );
  makeSlider(
    pickerEl.querySelector('.cp-sat-track'),
    pickerEl.querySelector('.cp-sat-thumb'),
    (v) => { sat = v; applyColor(); }
  );
  makeSlider(
    pickerEl.querySelector('.cp-lit-track'),
    pickerEl.querySelector('.cp-lit-thumb'),
    (v) => { lit = v; applyColor(); }
  );

  // Hex input
  pickerEl.querySelector('.cp-hex-input').addEventListener('input', (e) => {
    let val = e.target.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      syncFromHex(val);
      applyColor();
    }
  });

  // Close button
  pickerEl.querySelector('.cp-close').addEventListener('click', closePicker);

  // Close on outside click (next tick to avoid immediate trigger)
  isOpen = true;
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutsideClick);
  }, 0);
}

function closePicker() {
  if (pickerEl && pickerEl.parentNode) {
    pickerEl.parentNode.removeChild(pickerEl);
  }
  pickerEl = null;
  isOpen = false;
  document.removeEventListener('pointerdown', onOutsideClick);
}

function onOutsideClick(e) {
  if (pickerEl && !pickerEl.contains(e.target) && !e.target.closest('.accent-picker')) {
    closePicker();
  }
}

// --- Public setup ---

export function setupColorPicker() {
  const trigger = document.querySelector('.accent-picker');
  if (!trigger) return;

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

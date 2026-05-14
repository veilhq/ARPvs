/**
 * tooltip.js — Lightweight custom tooltip system for ARPvs.
 *
 * Usage: add data-tooltip="Label text" to any element.
 * Tooltips appear below the element by default, flipping above
 * if there isn't enough space below.
 *
 * Removes the native title attribute to prevent double-tooltips.
 */

const OFFSET = 6; // px gap between element and tooltip

let tooltipEl = null;
let hideTimer = null;

function getOrCreateTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(target) {
  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  clearTimeout(hideTimer);

  const tip = getOrCreateTooltip();
  tip.textContent = text;
  tip.classList.remove('tooltip-visible');

  // Position: measure after setting text so width is correct
  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer below; flip above if not enough room
    let top;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow >= tipRect.height + OFFSET || spaceBelow >= spaceAbove) {
      top = rect.bottom + OFFSET;
    } else {
      top = rect.top - tipRect.height - OFFSET;
    }

    // Center horizontally on the target, clamp to viewport
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, vw - tipRect.width - 8));

    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.classList.add('tooltip-visible');
  });
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.classList.remove('tooltip-visible');
}

/**
 * Initialise tooltip listeners on the document.
 * Call once after DOM is ready.
 */
export function initTooltips() {
  // Strip native title from elements that have data-tooltip so the
  // browser doesn't show a second tooltip alongside ours.
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    if (el.hasAttribute('title')) el.removeAttribute('title');
  });

  // Event delegation — works for dynamically added elements too
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) showTooltip(target);
  });

  document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      // Small delay so moving between child elements doesn't flicker
      hideTimer = setTimeout(hideTooltip, 80);
    }
  });

  // Hide on scroll or focus loss
  document.addEventListener('scroll', hideTooltip, { passive: true, capture: true });
  window.addEventListener('blur', hideTooltip);
}

/**
 * Refresh tooltips after dynamic content is added.
 * Strips title attributes from any new data-tooltip elements.
 */
export function refreshTooltips() {
  document.querySelectorAll('[data-tooltip][title]').forEach(el => {
    el.removeAttribute('title');
  });
}

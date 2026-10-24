// Custom canvas (artboard) sizes. The document stores sizes in px; the UI
// also accepts mm, cm and inches, converted at 96 DPI (1in = 96px, the CSS
// reference pixel). Rendering and every export (SVG/PNG/EPS/PDF) read the
// stored px values, so unit conversion needs no other changes.
export const SIZE_MIN_PX = 10;
export const SIZE_MAX_PX = 10000;
export const DPI = 96;

export const UNITS = {
  px: { label: 'px', toPx: 1 },
  mm: { label: 'mm', toPx: DPI / 25.4 },
  cm: { label: 'cm', toPx: DPI / 2.54 },
  in: { label: 'in', toPx: DPI },
};
export const UNIT_IDS = Object.keys(UNITS);

// Raw input -> finite number, or null for empty / non-numeric input.
// Never throws; the dialog turns null into an inline error.
export function parseDimensionInput(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function toPx(value, unit) {
  const u = UNITS[unit] || UNITS.px;
  return Math.round(value * u.toPx);
}

// Display conversion (2 decimals max, trailing zeros trimmed by Number).
export function fromPx(px, unit) {
  const u = UNITS[unit] || UNITS.px;
  return Math.round((px / u.toPx) * 100) / 100;
}

// px bounds check. Returns null when valid, else an i18n error key.
export function validateSizePx(px) {
  if (!Number.isFinite(px) || !Number.isInteger(px)) return 'sizeErrorInvalid';
  if (px < SIZE_MIN_PX || px > SIZE_MAX_PX) return 'sizeErrorRange';
  return null;
}

// Full pipeline for one dimension: raw string + unit -> { px } or { error }.
// px inputs must be whole numbers; other units accept decimals (they are
// rounded to whole px on conversion).
export function resolveSize(raw, unit) {
  const v = parseDimensionInput(raw);
  if (v === null) return { error: 'sizeErrorInvalid' };
  if (unit === 'px' && !Number.isInteger(v)) return { error: 'sizeErrorInt' };
  const px = toPx(v, unit);
  const err = validateSizePx(px);
  if (err) return { error: err };
  return { px };
}

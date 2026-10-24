import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseDimensionInput, toPx, fromPx, validateSizePx, resolveSize,
  SIZE_MIN_PX, SIZE_MAX_PX,
} from '../src/lib/canvasSize.js';
import { fuzzyScore, searchActions } from '../src/lib/palette.js';
import { filterLayerRows } from '../src/lib/filterLayers.js';
import { googleFontCssUrl, isGoogleFont, GOOGLE_FONTS } from '../src/lib/fonts.js';
import {
  loadRecent, addRecent, clearRecent, formatRelativeTime, RECENT_MAX,
} from '../src/lib/recentFiles.js';

describe('canvasSize', () => {
  it('parses numbers, rejects empty/non-numeric', () => {
    expect(parseDimensionInput('100')).toBe(100);
    expect(parseDimensionInput('  12.5 ')).toBe(12.5);
    expect(parseDimensionInput('')).toBe(null);
    expect(parseDimensionInput('   ')).toBe(null);
    expect(parseDimensionInput('abc')).toBe(null);
    expect(parseDimensionInput(null)).toBe(null);
  });
  it('converts units at 96 DPI', () => {
    expect(toPx(1, 'in')).toBe(96);
    expect(toPx(2.54, 'cm')).toBe(96);
    expect(toPx(25.4, 'mm')).toBe(96);
    expect(toPx(100, 'px')).toBe(100);
    expect(fromPx(96, 'in')).toBe(1);
    expect(fromPx(96, 'cm')).toBe(2.54);
    expect(fromPx(48, 'in')).toBe(0.5);
  });
  it('enforces bounds 10–10000 px', () => {
    expect(validateSizePx(10)).toBe(null);
    expect(validateSizePx(10000)).toBe(null);
    expect(validateSizePx(9)).toBe('sizeErrorRange');
    expect(validateSizePx(10001)).toBe('sizeErrorRange');
    expect(resolveSize('5', 'px')).toEqual({ error: 'sizeErrorRange' });
    expect(resolveSize('0.5', 'in').px).toBe(48);
    expect(resolveSize('', 'px')).toEqual({ error: 'sizeErrorInvalid' });
    expect(resolveSize('12x', 'px')).toEqual({ error: 'sizeErrorInvalid' });
  });
  it('requires whole numbers for px but allows decimals elsewhere', () => {
    expect(resolveSize('100.5', 'px')).toEqual({ error: 'sizeErrorInt' });
    expect(resolveSize('100.5', 'mm').px).toBeGreaterThan(0);
    expect(SIZE_MIN_PX).toBe(10);
    expect(SIZE_MAX_PX).toBe(10000);
  });
});

describe('palette fuzzy matching', () => {
  it('requires a subsequence match', () => {
    expect(fuzzyScore('rect', 'Rectangle')).toBeGreaterThan(0);
    expect(fuzzyScore('xyz', 'Rectangle')).toBe(-1);
    expect(fuzzyScore('', 'Rectangle')).toBe(0);
  });
  it('ranks the most specific match first', () => {
    const actions = [
      { id: 'direct', title: 'Direct select', run: () => {} },
      { id: 'rect', title: 'Rectangle', run: () => {} },
      { id: 'export', title: 'Export SVG', run: () => {} },
    ];
    const out = searchActions('rect', actions);
    expect(out[0].id).toBe('rect');
    expect(searchActions('', actions).map((a) => a.id)).toEqual(['direct', 'rect', 'export']);
    expect(searchActions('zzz', actions)).toEqual([]);
  });
  it('matches keywords too', () => {
    const actions = [{ id: 'undo', title: 'Undo', keywords: ['revert', 'back'], run: () => {} }];
    expect(searchActions('revert', actions).map((a) => a.id)).toEqual(['undo']);
  });
});

describe('layer filter', () => {
  const rows = [
    { id: '1', name: 'Badge star' },
    { id: '2', name: 'Wordmark' },
    { id: '3', name: 'logo mark' },
  ];
  it('filters case-insensitively by name only', () => {
    expect(filterLayerRows(rows, '').map((o) => o.id)).toEqual(['1', '2', '3']);
    expect(filterLayerRows(rows, 'mark').map((o) => o.id)).toEqual(['2', '3']);
    expect(filterLayerRows(rows, 'BADGE').map((o) => o.id)).toEqual(['1']);
    expect(filterLayerRows(rows, 'zzz')).toEqual([]);
  });
  it('does not reorder or mutate', () => {
    const out = filterLayerRows(rows, 'mark');
    expect(out.map((o) => o.id)).toEqual(['2', '3']);
    expect(rows.map((o) => o.id)).toEqual(['1', '2', '3']);
  });
});

describe('google fonts', () => {
  it('builds css2 URLs with + encoding', () => {
    expect(googleFontCssUrl('Open Sans')).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap');
    expect(googleFontCssUrl('Hind Siliguri')).toContain('Hind+Siliguri');
  });
  it('includes Bengali families and excludes system fonts', () => {
    expect(GOOGLE_FONTS).toContain('Hind Siliguri');
    expect(GOOGLE_FONTS).toContain('Noto Sans Bengali');
    expect(GOOGLE_FONTS.length).toBeGreaterThanOrEqual(20);
    expect(isGoogleFont('Hind Siliguri')).toBe(true);
    expect(isGoogleFont('Arial')).toBe(false);
  });
});

describe('recent files', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', (() => {
      let store = {};
      return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; },
      };
    })());
    clearRecent();
  });
  const doc = (n) => ({ app: 'vectorforge', version: 2, objects: [{ id: n }], artboards: [] });
  it('caps at 5, newest first, dedupes by name', () => {
    for (let i = 0; i < 7; i++) addRecent(doc(`o${i}`), `doc${i}.json`);
    const list = loadRecent();
    expect(list.length).toBe(RECENT_MAX);
    expect(list[0].name).toBe('doc6.json');
    addRecent(doc('x'), 'doc6.json');
    expect(loadRecent()[0].doc.objects[0].id).toBe('x');
    expect(loadRecent().length).toBe(RECENT_MAX);
  });
  it('skips oversized documents and never throws', () => {
    const big = { app: 'vectorforge', version: 2, objects: [], artboards: [], pad: 'x'.repeat(900 * 1024) };
    expect(() => addRecent(big, 'big.json')).not.toThrow();
    expect(loadRecent()).toEqual([]);
  });
  it('formats relative times', () => {
    const now = Date.now();
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3600000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86400000, now)).toBe('2d ago');
  });
  it('survives corrupt storage', () => {
    localStorage.setItem('vectorforge-recent-files', 'not-json{');
    expect(loadRecent()).toEqual([]);
  });
});

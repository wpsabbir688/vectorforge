import { describe, it, expect } from 'vitest';
import { t, missingBnKeys } from '../src/lib/i18n.js';
import {
  createComponentFromSelection, resolveInstance, expandInstances,
} from '../src/lib/components.js';
import { bboxOf, migrateDocument } from '../src/lib/geometry.js';
import { TEMPLATES } from '../src/lib/templates.js';

describe('i18n (Phase 3)', () => {
  it('every EN key has a BN counterpart', () => {
    expect(missingBnKeys()).toEqual([]);
  });
  it('BN strings are real Bengali, not the key echoed back', () => {
    expect(t('bn', 'toolSelect')).not.toBe('toolSelect');
    expect(t('bn', 'toolSelect')).toMatch(/[অ-হ]/);
    expect(t('bn', 'tourS1Title')).toMatch(/[অ-হ]/);
  });
  it('unknown language falls back to English', () => {
    expect(t('fr', 'toolSelect')).toBe('Select / Move');
  });
  it('unknown key returns the key itself (never crashes a render)', () => {
    expect(t('en', 'noSuchKey')).toBe('noSuchKey');
    expect(t('bn', 'noSuchKey')).toBe('noSuchKey');
  });
  it('variable substitution works', () => {
    expect(t('en', 'propMultiHint', { n: 3 })).toContain('3');
    expect(t('en', 'compDeleteConfirm', { name: 'Badge' })).toContain('Badge');
  });
});

describe('components (Phase 3)', () => {
  const rect = { id: 'r1', type: 'rect', x: 100, y: 50, w: 40, h: 30, fill: '#111111' };
  const dot = { id: 'e1', type: 'ellipse', x: 160, y: 60, w: 20, h: 20, fill: '#ff0000' };

  it('createComponentFromSelection rebases the master to origin (0,0)', () => {
    const { master, instance } = createComponentFromSelection([rect, dot], 'Badge');
    expect(master.name).toBe('Badge');
    expect(master.objects).toHaveLength(2);
    const b = bboxOf({ type: 'group', children: master.objects });
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.w).toBe(80);
    expect(b.h).toBe(30);
    expect(instance.type).toBe('instance');
    expect(instance.componentId).toBe(master.id);
    expect(instance.x).toBe(100);
    expect(instance.y).toBe(50);
  });
  it('resolveInstance scales master objects about the instance box', () => {
    const { master, instance } = createComponentFromSelection([rect], 'Box');
    const resolved = resolveInstance({ ...instance, scale: 2 }, [master]);
    expect(resolved).toHaveLength(1);
    const b = bboxOf(resolved[0]);
    expect(b.w).toBe(80);
    expect(b.h).toBe(60);
    expect(b.x).toBe(100);
    expect(b.y).toBe(50);
  });
  it('resolveInstance multiplies opacity on top-level members', () => {
    const { master, instance } = createComponentFromSelection([{ ...rect, opacity: 0.5 }], 'Box');
    const resolved = resolveInstance({ ...instance, opacity: 0.5 }, [master]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].opacity).toBeCloseTo(0.25);
  });
  it('resolveInstance resolves nested groups (group opacity composes in SVG)', () => {
    const group = { id: 'g1', type: 'group', children: [{ ...rect, opacity: 0.5 }] };
    const { master, instance } = createComponentFromSelection([group], 'Grouped');
    const resolved = resolveInstance({ ...instance, opacity: 0.5 }, [master]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('group');
    expect(resolved[0].opacity).toBeCloseTo(0.5);
    expect(resolved[0].children[0].opacity).toBe(0.5);
  });
  it('resolveInstance of an unknown component resolves to nothing', () => {
    expect(resolveInstance({ type: 'instance', componentId: 'nope', x: 0, y: 0, scale: 1 }, [])).toEqual([]);
  });
  it('expandInstances passes plain objects through and expands instances', () => {
    const { master, instance } = createComponentFromSelection([rect], 'Box');
    const out = expandInstances([rect, instance], [master]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('r1');
    expect(out[1].id).toContain('r1');
  });
  it('hidden instances resolve to nothing', () => {
    const { master, instance } = createComponentFromSelection([rect], 'Box');
    expect(resolveInstance({ ...instance, visible: false }, [master])).toEqual([]);
  });
});

describe('document migration with components (Phase 3)', () => {
  it('v1/v2 files without components load with an empty list', () => {
    const doc = migrateDocument({ objects: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 10 }] });
    expect(doc.components).toEqual([]);
  });
  it('a document carrying components keeps them through migration', () => {
    const comps = [{ id: 'c1', name: 'Badge', w: 40, h: 30, objects: [] }];
    const doc = migrateDocument({ objects: [], components: comps });
    expect(doc.components).toEqual(comps);
  });
});

describe('templates (Phase 3)', () => {
  const KNOWN = new Set(['rect', 'ellipse', 'line', 'polygon', 'star', 'text', 'path', 'group', 'traced', 'image', 'instance']);
  it('template ids are unique and every template has name/desc keys in EN + BN', () => {
    const ids = TEMPLATES.map((tpl) => tpl.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tpl of TEMPLATES) {
      expect(t('en', `tpl_${tpl.id}_name`)).not.toBe(`tpl_${tpl.id}_name`);
      expect(t('bn', `tpl_${tpl.id}_name`)).not.toBe(`tpl_${tpl.id}_name`);
      expect(t('en', `tpl_${tpl.id}_desc`)).not.toBe(`tpl_${tpl.id}_desc`);
      expect(t('bn', `tpl_${tpl.id}_desc`)).not.toBe(`tpl_${tpl.id}_desc`);
    }
  });
  it('the four new templates exist', () => {
    for (const id of ['icons', 'poster', 'youtube', 'infographic']) {
      expect(TEMPLATES.some((tpl) => tpl.id === id)).toBe(true);
    }
  });
  it('every template object uses a known type and has a finite bounding box', () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.artboard.w).toBeGreaterThan(0);
      expect(tpl.artboard.h).toBeGreaterThan(0);
      // Blank is intentionally empty; every other template carries objects.
      if (tpl.id !== 'blank') expect(tpl.objects.length).toBeGreaterThan(0);
      for (const o of tpl.objects) {
        expect(KNOWN.has(o.type)).toBe(true);
        const b = bboxOf(o);
        expect(Number.isFinite(b.x)).toBe(true);
        expect(Number.isFinite(b.y)).toBe(true);
        expect(Number.isFinite(b.w)).toBe(true);
        expect(Number.isFinite(b.h)).toBe(true);
      }
    }
  });
  it('template objects stay inside their artboard (with a small margin)', () => {
    for (const tpl of TEMPLATES) {
      for (const o of tpl.objects) {
        const b = bboxOf(o);
        expect(b.x).toBeGreaterThanOrEqual(-2);
        expect(b.y).toBeGreaterThanOrEqual(-2);
        expect(b.x + b.w).toBeLessThanOrEqual(tpl.artboard.w + 2);
        expect(b.y + b.h).toBeLessThanOrEqual(tpl.artboard.h + 2);
      }
    }
  });
});

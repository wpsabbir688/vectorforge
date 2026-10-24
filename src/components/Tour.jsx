// First-run guided tour, custom-built (no tour library, to keep the bundle
// small). Steps spotlight toolbar, canvas, layers, properties and export.
// Shown once on first load; Skip/Done/Escape set the localStorage flag so
// it never reappears, and Help → Tour replays it any time. All text goes
// through the i18n dictionary.
import { useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { t } from '../lib/i18n.js';

const STEPS = [
  { target: null, titleKey: 'tourS1Title', bodyKey: 'tourS1Body' },
  { target: 'toolbar', titleKey: 'tourS2Title', bodyKey: 'tourS2Body' },
  { target: 'canvas', titleKey: 'tourS3Title', bodyKey: 'tourS3Body' },
  { target: 'layers', titleKey: 'tourS4Title', bodyKey: 'tourS4Body' },
  { target: 'properties', titleKey: 'tourS5Title', bodyKey: 'tourS5Body' },
  { target: 'topbar', titleKey: 'tourS6Title', bodyKey: 'tourS6Body' },
];

export default function Tour({ onClose }) {
  const language = useStore((s) => s.language);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState(null);

  const dismiss = () => {
    try { localStorage.setItem('vectorforge-tour-seen', '1'); } catch { /* private mode */ }
    onClose();
  };

  const current = STEPS[step];

  // Measure the spotlight target (after layout, and on resize).
  useLayoutEffect(() => {
    if (!current.target) { setBox(null); return; }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (!el) { setBox(null); return; }
      try { el.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch { /* noop */ }
      const r = el.getBoundingClientRect();
      setBox({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [current.target, step]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Card placement: below the highlight when it fits, else above; clamped
  // horizontally. The welcome step (no target) centers on screen.
  let cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (box) {
    const cardW = 320;
    const below = box.y + box.h + 16;
    const above = box.y - 16;
    const left = Math.max(8, Math.min(window.innerWidth - cardW - 8, box.x));
    cardStyle = below + 190 < window.innerHeight
      ? { left, top: below }
      : { left, top: Math.max(8, above - 190) };
  }

  return (
    <div data-testid="tour" className="fixed inset-0 z-[60]">
      {/* The highlight's huge shadow IS the dimming: it starts outside the
          box, so the spotlight itself stays clear. A transparent catcher
          below it dismisses on any outside click. */}
      <div className="absolute inset-0" onClick={dismiss} />
      {box && (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-blue-500 bg-transparent"
          style={{ left: box.x - 4, top: box.y - 4, width: box.w + 8, height: box.h + 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }}
        />
      )}
      <div
        className="absolute w-[320px] max-w-[92vw] rounded-2xl border border-[#444] bg-[#252525] p-4 text-gray-100 shadow-2xl"
        style={cardStyle}
      >
        <h2 className="text-base font-bold">{t(language, current.titleKey)}</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-300">{t(language, current.bodyKey)}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-500">{step + 1} / {STEPS.length}</span>
          <span className="flex gap-1">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="rounded-lg bg-[#3a3a3a] px-3 py-1.5 text-sm">{t(language, 'tourBack')}</button>
            )}
            <button data-testid="tour-skip" onClick={dismiss} className="rounded-lg bg-[#3a3a3a] px-3 py-1.5 text-sm">{t(language, 'tourSkip')}</button>
            {step < STEPS.length - 1 ? (
              <button data-testid="tour-next" onClick={() => setStep(step + 1)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold">{t(language, 'tourNext')}</button>
            ) : (
              <button data-testid="tour-next" onClick={dismiss} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold">{t(language, 'tourDone')}</button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

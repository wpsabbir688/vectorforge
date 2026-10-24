import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { searchActions } from '../lib/palette.js';
import { t } from '../lib/i18n.js';

// Command palette (Ctrl/Cmd+K). Every listed action runs a real function —
// the registry is built by App from store actions + shared file/export
// helpers, so palette and top bar can never diverge in behavior.
export default function CommandPalette({ actions, onClose }) {
  const language = useStore((s) => s.language);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => searchActions(query, actions), [query, actions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (a) => {
    if (!a) return;
    onClose();
    a.run();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="flex max-h-[70dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#444] bg-[#252525] text-gray-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t(language, 'paletteTitle')}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder={t(language, 'palettePlaceholder')}
          className="w-full border-b border-[#444] bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500"
        />
        <div ref={listRef} className="overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">{t(language, 'paletteEmpty')}</p>
          )}
          {results.map((a, i) => (
            <button
              key={a.id}
              onClick={() => run(a)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === active ? 'bg-blue-600 text-white' : 'text-gray-200'}`}
            >
              <span>{a.title}</span>
              {a.hint && <span className="ml-4 shrink-0 text-xs opacity-70">{a.hint}</span>}
            </button>
          ))}
        </div>
        <p className="border-t border-[#444] px-4 py-2 text-[11px] text-gray-500">{t(language, 'paletteFooter')}</p>
      </div>
    </div>
  );
}

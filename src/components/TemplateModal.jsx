import { X } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { t as tr } from '../lib/i18n.js';
import { TEMPLATES } from '../lib/templates.js';

export default function TemplateModal({ onClose }) {
  const language = useStore((s) => s.language);
  const newDocument = useStore((s) => s.newDocument);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-[#252525] p-5 text-gray-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{tr(language, 'tplTitle')}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[#3a3a3a]"><X size={18} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => { newDocument(t.artboard, JSON.parse(JSON.stringify(t.objects))); onClose(); }}
              className="rounded-xl border border-[#444] p-4 text-left hover:border-blue-500 hover:bg-[#2e2e2e]"
            >
              <p className="font-semibold">{tr(language, `tpl_${t.id}_name`)}</p>
              <p className="mt-1 text-xs text-gray-400">{tr(language, `tpl_${t.id}_desc`)}</p>
              <p className="mt-2 text-xs text-gray-500">{t.artboard.w} × {t.artboard.h} · {t.objects.length} {tr(language, 'tplObjects')}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

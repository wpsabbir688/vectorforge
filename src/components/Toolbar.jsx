import {
  MousePointer2, Waypoints, PenTool, Square, Circle, Minus, Hexagon, Star,
  Type, Brush, Eraser, Pipette, Hand,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { t as tr } from '../lib/i18n.js';

const TOOLS = [
  { id: 'select', icon: MousePointer2, labelKey: 'toolSelect', key: 'V' },
  { id: 'direct', icon: Waypoints, labelKey: 'toolDirect', key: 'A' },
  { id: 'pen', icon: PenTool, labelKey: 'toolPen', key: 'P' },
  { id: 'rect', icon: Square, labelKey: 'toolRect', key: 'R' },
  { id: 'ellipse', icon: Circle, labelKey: 'toolEllipse', key: 'E' },
  { id: 'line', icon: Minus, labelKey: 'toolLine', key: 'L' },
  { id: 'polygon', icon: Hexagon, labelKey: 'toolPolygon', key: '' },
  { id: 'star', icon: Star, labelKey: 'toolStar', key: '' },
  { id: 'text', icon: Type, labelKey: 'toolText', key: 'T' },
  { id: 'brush', icon: Brush, labelKey: 'toolBrush', key: 'B' },
  { id: 'eraser', icon: Eraser, labelKey: 'toolEraser', key: '' },
  { id: 'eyedropper', icon: Pipette, labelKey: 'toolEyedropper', key: '' },
  { id: 'hand', icon: Hand, labelKey: 'toolHand', key: 'H' },
];

export default function Toolbar() {
  const language = useStore((s) => s.language);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div data-tour="toolbar" className="flex w-full flex-row gap-1 overflow-x-auto border-b border-[#333] bg-[#252525] px-2 py-2 lg:w-14 lg:flex-col lg:items-center lg:overflow-visible lg:border-b-0 lg:border-r lg:px-0">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            title={`${tr(language, t.labelKey)}${t.key ? ` (${t.key})` : ''}`}
            onClick={() => setTool(t.id)}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#3a3a3a]'}`}
          >
            <Icon size={19} />
            {t.key && <span className="absolute bottom-0.5 right-1 text-[8px] text-gray-400">{t.key}</span>}
          </button>
        );
      })}
    </div>
  );
}

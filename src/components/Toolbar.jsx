import {
  MousePointer2, Waypoints, PenTool, Square, Circle, Minus, Hexagon, Star,
  Type, Brush, Eraser, Pipette, Hand,
} from 'lucide-react';
import { useStore } from '../store/useStore.js';

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select / Move', key: 'V' },
  { id: 'direct', icon: Waypoints, label: 'Direct Select (points)', key: 'A' },
  { id: 'pen', icon: PenTool, label: 'Pen', key: 'P' },
  { id: 'rect', icon: Square, label: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', key: 'E' },
  { id: 'line', icon: Minus, label: 'Line', key: 'L' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon', key: '' },
  { id: 'star', icon: Star, label: 'Star', key: '' },
  { id: 'text', icon: Type, label: 'Text', key: 'T' },
  { id: 'brush', icon: Brush, label: 'Freehand Brush', key: 'B' },
  { id: 'eraser', icon: Eraser, label: 'Eraser (click to delete)', key: '' },
  { id: 'eyedropper', icon: Pipette, label: 'Eyedropper', key: '' },
  { id: 'hand', icon: Hand, label: 'Hand (pan)', key: 'H' },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="flex w-14 flex-col items-center gap-1 border-r border-[#333] bg-[#252525] py-2">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            title={`${t.label}${t.key ? ` (${t.key})` : ''}`}
            onClick={() => setTool(t.id)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#3a3a3a]'}`}
          >
            <Icon size={19} />
            {t.key && <span className="absolute bottom-0.5 right-1 text-[8px] text-gray-400">{t.key}</span>}
          </button>
        );
      })}
    </div>
  );
}

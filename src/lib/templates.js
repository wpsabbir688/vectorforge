import { uid } from '../lib/geometry.js';

function base(over) {
  return {
    id: uid(), name: 'Shape', visible: true, locked: false,
    fill: '#4f7cff', fillType: 'solid', stroke: '#111111', strokeWidth: 0,
    opacity: 1, rotation: 0, blendMode: 'normal', ...over,
  };
}

export const ARTBOARD_PRESETS = [
  { name: 'Social 1080 × 1080', w: 1080, h: 1080 },
  { name: 'A4 Portrait', w: 794, h: 1123 },
  { name: 'A4 Landscape', w: 1123, h: 794 },
  { name: 'Full HD 1920 × 1080', w: 1920, h: 1080 },
  { name: 'Business Card 1050 × 600', w: 1050, h: 600 },
];

export const TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank canvas',
    desc: 'Start from nothing.',
    artboard: { w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' },
    objects: [],
  },
  {
    id: 'logo',
    name: 'Logo mark',
    desc: 'Star badge + wordmark on a dark field.',
    artboard: { w: 1080, h: 1080, bg: '#0f172a', name: 'Social 1080 × 1080' },
    objects: [
      base({ type: 'star', name: 'Badge star', cx: 540, cy: 420, r: 210, sides: 5, innerRatio: 0.55, fill: '#f59e0b' }),
      base({ type: 'ellipse', name: 'Badge circle', x: 440, y: 320, w: 200, h: 200, fill: '#0f172a' }),
      base({ type: 'star', name: 'Inner star', cx: 540, cy: 420, r: 80, sides: 5, innerRatio: 0.5, fill: '#ffffff' }),
      base({ type: 'text', name: 'Wordmark', x: 270, y: 700, w: 540, h: 90, text: 'NOVA STUDIO', fontSize: 72, fontWeight: 700, fontFamily: 'Arial', fill: '#ffffff' }),
      base({ type: 'text', name: 'Tagline', x: 340, y: 800, w: 400, h: 40, text: 'DESIGN THAT SHINES', fontSize: 28, fontWeight: 400, fontFamily: 'Arial', fill: '#f59e0b' }),
    ],
  },
  {
    id: 'social',
    name: 'Social post',
    desc: 'Bold gradient post, 1080 × 1080.',
    artboard: { w: 1080, h: 1080, bg: '#ffffff', name: 'Social 1080 × 1080' },
    objects: [
      base({ type: 'rect', name: 'Background', x: 0, y: 0, w: 1080, h: 1080, fillType: 'gradient', gradient: { angle: 135, stops: [{ offset: 0, color: '#4f7cff' }, { offset: 100, color: '#8b5cf6' }] } }),
      base({ type: 'ellipse', name: 'Sun', cx: 830, cy: 260, r: 220, fill: '#fbbf24', opacity: 0.9 }),
      base({ type: 'rect', name: 'Card', x: 90, y: 620, w: 900, h: 320, cornerRadius: 28, fill: '#ffffff' }),
      base({ type: 'text', name: 'Headline', x: 90, y: 120, w: 700, h: 180, text: 'BIG SALE', fontSize: 120, fontWeight: 800, fontFamily: 'Arial', fill: '#ffffff' }),
      base({ type: 'text', name: 'Subhead', x: 90, y: 300, w: 700, h: 60, text: 'Up to 50% off this weekend', fontSize: 44, fontWeight: 400, fontFamily: 'Arial', fill: '#ffffff' }),
      base({ type: 'text', name: 'Card title', x: 140, y: 660, w: 800, h: 60, text: 'Shop the collection', fontSize: 48, fontWeight: 700, fontFamily: 'Arial', fill: '#111111' }),
      base({ type: 'text', name: 'Card body', x: 140, y: 740, w: 800, h: 100, text: 'New drops every Friday. Free delivery over ৳1000.', fontSize: 32, fontWeight: 400, fontFamily: 'Arial', fill: '#444444' }),
    ],
  },
  {
    id: 'card',
    name: 'Business card',
    desc: 'Clean front layout, 1050 × 600.',
    artboard: { w: 1050, h: 600, bg: '#ffffff', name: 'Business Card 1050 × 600' },
    objects: [
      base({ type: 'rect', name: 'Side band', x: 0, y: 0, w: 300, h: 600, fill: '#0f172a' }),
      base({ type: 'ellipse', name: 'Avatar dot', cx: 150, cy: 150, r: 70, fill: '#f59e0b' }),
      base({ type: 'text', name: 'Name', x: 350, y: 140, w: 600, h: 70, text: 'Sabbir Hossain', fontSize: 54, fontWeight: 700, fontFamily: 'Arial', fill: '#111111' }),
      base({ type: 'text', name: 'Role', x: 350, y: 220, w: 600, h: 44, text: 'WordPress Developer', fontSize: 32, fontWeight: 400, fontFamily: 'Arial', fill: '#4f7cff' }),
      base({ type: 'text', name: 'Phone', x: 350, y: 330, w: 600, h: 40, text: '+880 1944-460344', fontSize: 28, fontWeight: 400, fontFamily: 'Arial', fill: '#333333' }),
      base({ type: 'text', name: 'Email', x: 350, y: 380, w: 600, h: 40, text: 'wpsabbir44@gmail.com', fontSize: 28, fontWeight: 400, fontFamily: 'Arial', fill: '#333333' }),
      base({ type: 'text', name: 'Web', x: 350, y: 430, w: 600, h: 40, text: 'mivloo.com', fontSize: 28, fontWeight: 400, fontFamily: 'Arial', fill: '#333333' }),
    ],
  },
];

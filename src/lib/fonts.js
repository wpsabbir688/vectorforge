// Font lists + on-demand Google Fonts loading. System fonts work offline;
// Google fonts are fetched from Google's CDN only when actually chosen (or
// present in a loaded document) — no font files are bundled, and the only
// network request is the font stylesheet itself. Exports keep the family
// name: SVG/PNG render it when the font is available and fall back to a
// system font otherwise; EPS/PDF map unknown families to standard fonts.
export const SYSTEM_FONTS = [
  'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Impact',
];

export const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Source Sans 3', 'Playfair Display', 'Merriweather', 'Oswald', 'Raleway',
  'Nunito', 'Work Sans', 'DM Sans', 'Manrope', 'Space Grotesk',
  'Bebas Neue', 'Pacifico', 'Caveat', 'JetBrains Mono',
  'Hind Siliguri', 'Noto Sans Bengali',
];

export function isGoogleFont(family) {
  return GOOGLE_FONTS.includes(family);
}

// css2 API: spaces become +, weights 400 + 700.
export function googleFontCssUrl(family) {
  const fam = String(family).trim().replace(/\s+/g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@400;700&display=swap`;
}

const loadedFamilies = new Set();

// Inject the stylesheet once per family (best-effort, never throws).
export function ensureFontLoaded(family) {
  if (!isGoogleFont(family) || typeof document === 'undefined') return;
  if (!loadedFamilies.has(family)) {
    loadedFamilies.add(family);
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = googleFontCssUrl(family);
      document.head.appendChild(link);
    } catch { /* ignore */ }
  }
  try { document.fonts?.load(`16px "${family}"`); } catch { /* ignore */ }
}

function collectFontFamilies(objects, out) {
  for (const o of objects || []) {
    if (o.type === 'text' && o.fontFamily) out.add(o.fontFamily);
    if (o.type === 'group' && o.children) collectFontFamilies(o.children, out);
  }
  return out;
}

export function ensureFontsForObjects(objects) {
  for (const f of collectFontFamilies(objects, new Set())) ensureFontLoaded(f);
}

// SVG optimizer: shrinks exported SVG safely, without a DOM (pure string
// processing, so it runs in node tests and the browser alike).
//
// What it does:
// - Rounds every number inside numeric attributes (x, y, cx, cy, rx, ry,
//   width, height, stroke-width, opacity, fill/stroke-opacity, font-size,
//   points, path d, transform) to 3 decimals.
// - Drops attributes that already equal the SVG default: opacity="1",
//   fill-opacity="1", stroke-opacity="1", stroke-width="1", rx="0",
//   ry="0", and a stroke-width on an element whose stroke is "none".
// - Removes XML comments, data-* attributes, and empty <defs>.
// - Collapses whitespace between tags.
//
// What it deliberately does NOT do (top-bar Export SVG stays exact):
// - No path-data simplification, no element removal, no color rewriting,
//   no viewBox changes. The optimized file renders the same shapes; it is
//   only smaller. The Asset Export panel exposes this as an opt-in
//   "Optimize SVG" toggle, while the top-bar Export SVG keeps the exact
//   serializer output as the default.

const NUMERIC_ATTRS = new Set([
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'rx', 'ry',
  'width', 'height', 'stroke-width', 'opacity', 'fill-opacity',
  'stroke-opacity', 'font-size', 'points', 'd', 'transform',
  'startoffset', 'startOffset',
]);

const round3 = (n) => {
  const r = Math.round(n * 1000) / 1000;
  return String(r === 0 ? 0 : r);
};

const roundNumbersIn = (value) =>
  value.replace(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    return round3(n);
  });

// Process one tag's inner text (without < >). Attribute values are
// double-quoted in the serializer's output; single-quoted values are
// handled too, for robustness with hand-written input.
function optimizeTag(inner) {
  // Drop data-* attributes first (editor metadata).
  let tag = inner.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*("[^"]*"|'[^']*')/g, '');
  // Round numbers inside numeric attributes.
  tag = tag.replace(/([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*')/g, (whole, name, quoted) => {
    if (!NUMERIC_ATTRS.has(name)) return whole;
    const quote = quoted[0];
    const value = quoted.slice(1, -1);
    return `${name}=${quote}${roundNumbersIn(value)}${quote}`;
  });
  // Drop default-valued attributes.
  tag = tag.replace(/\sopacity\s*=\s*("[^"]*"|'[^']*')/g, (whole, quoted) => {
    const v = quoted.slice(1, -1);
    return v === '1' || v === '1.0' || v === '1.00' || v === '1.000' ? '' : whole;
  });
  tag = tag.replace(/\sfill-opacity\s*=\s*("[^"]*"|'[^']*')/g, (whole, quoted) => {
    const v = quoted.slice(1, -1);
    return v === '1' || v === '1.0' || v === '1.00' || v === '1.000' ? '' : whole;
  });
  tag = tag.replace(/\sstroke-opacity\s*=\s*("[^"]*"|'[^']*')/g, (whole, quoted) => {
    const v = quoted.slice(1, -1);
    return v === '1' || v === '1.0' || v === '1.00' || v === '1.000' ? '' : whole;
  });
  tag = tag.replace(/\sstroke-width\s*=\s*("[^"]*"|'[^']*')/g, (whole, quoted) => {
    const v = quoted.slice(1, -1);
    return v === '1' || v === '1.0' || v === '1.00' || v === '1.000' ? '' : whole;
  });
  tag = tag.replace(/\srx\s*=\s*("[^"]*"|'[^']*')/g, (whole, quoted) => {
    const v = quoted.slice(1, -1);
    return v === '0' || v === '0.0' || v === '0.00' || v === '0.000' ? '' : whole;
  });
  tag = tag.replace(/\sry\s*=\s*("[^"]*"|'[^']*')/g, (whole, quoted) => {
    const v = quoted.slice(1, -1);
    return v === '0' || v === '0.0' || v === '0.00' || v === '0.000' ? '' : whole;
  });
  // stroke-width is meaningless when stroke is none; drop it per-tag.
  if (/(^|\s)stroke\s*=\s*("none"|'none')/.test(tag)) {
    tag = tag.replace(/\sstrok(e-)?width\s*=\s*("[^"]*"|'[^']*')/g, '');
  }
  return tag;
}

export function optimizeSvg(svgText) {
  if (typeof svgText !== 'string') return svgText;
  // Strip XML comments (careful: -- inside a comment body is invalid
  // XML, so a non-greedy match is correct here).
  let out = svgText.replace(/<!--[\s\S]*?-->/g, '');
  // Process tags one by one; text content (e.g. <text> labels) is never
  // touched, so user text survives byte-identical.
  out = out.replace(/<[^>]+>/g, (tag) => {
    const inner = tag.slice(1, -1);
    // Closing tags and declarations pass through untouched.
    if (inner.startsWith('/') || inner.startsWith('!') || inner.startsWith('?')) return tag;
    return `<${optimizeTag(inner)}>`;
  });
  // Drop empty defs blocks (with only whitespace inside, or self-closed).
  out = out.replace(/<defs>\s*<\/defs>/g, '');
  out = out.replace(/<defs\s*\/>/g, '');
  // Collapse whitespace between tags.
  out = out.replace(/>\s+</g, '><').trim();
  return out;
}

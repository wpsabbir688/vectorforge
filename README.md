# VectorForge — Browser Vector Studio

A fast, fully client-side vector design studio in the browser — Illustrator-style
work from a website, with no backend, no database, and no account. Draw with a
pen tool, shape tools, and freehand brush; trace raster images into editable
vectors; export exact SVG or PNG.

Built with Vite + React 19 + JSX, Tailwind v4, zustand, and lucide-react. The
rendering engine is pure custom SVG (no fabric.js, no konva), which gives exact
pen/bezier fidelity and native SVG export.

🌐 **Live demo:** https://delicate-kheer-1bc786.netlify.app

Run it locally (see below) or deploy the `dist/` folder to any static host
(deployment notes at the bottom).

## Features

### Canvas
- Infinite-canvas feel: pan with Space+drag or middle-mouse drag, zoom with
  Ctrl+wheel, zoom buttons, or the zoom percentage control.
- Grid toggle, snap-to-grid toggle, artboard size presets (A4, 1080×1080 social,
  1920×1080, business card, custom) and artboard background color.
- Artboard-aware alignment: a single selection aligns to the artboard,
  multiple selections align to their shared bounding box.
- **Rulers + guides:** top and left rulers with tick marks that follow zoom
  and pan. Drag from a ruler onto the canvas to create a guide line; drag a
  guide to move it; drag it off the canvas — or click it and press Delete —
  to remove it. Guides are a drawing aid only: they are never exported and
  do not persist across reloads (they are not part of the saved JSON format).

### Tools (left toolbar)
| Tool | Shortcut | What it does |
|---|---|---|
| Select / Move | V | Move, marquee multi-select (drag on empty canvas), Shift-click to add/remove |
| Direct Select | A | Drag anchor points and bezier handles of path objects |
| Pen | P | Click to add anchor points, drag to create bezier handles, click the first point to close the path, Enter to finish |
| Rectangle | R | Drag to draw; Shift = square |
| Ellipse | E | Drag to draw; Shift = circle |
| Line | L | Drag start to end |
| Polygon / Star | — | Drag to draw (sides / inner ratio editable in Properties) |
| Text | T | Click to place, double-click to edit inline |
| Freehand Brush | B | Pointer strokes smoothed into bezier paths |
| Eraser | — | Click an object to delete it |
| Eyedropper | — | Click an object to pick its fill/stroke |
| Hand | H | Drag to pan |

### Object editing
- Move, resize (corner/edge handles, Shift keeps aspect), rotate (handle above
  the selection, Shift snaps to 15°).
- Multi-select (Shift-click, marquee), duplicate (Ctrl+D), delete, bring
  forward / send backward / to front / to back, group / ungroup.
- Groups are real objects: move, resize, rotate, recolor and delete the whole
  group; ungroup to edit members.

### Panels (right side)
- **Layers:** list, rename (double-click), visibility eye, lock, reorder.
- **Properties:** fill color, gradients (linear with angle, or radial with
  center + radius, 2+ stops), stroke color + width, opacity, blend mode,
  corner radius, polygon sides, star points / inner ratio, font family /
  size / weight, text content, position, size, rotation. Includes swatches
  and recent colors.
- **Align:** left / center / right / top / middle / bottom, distribute
  horizontally / vertically (3+ objects).

### Image Trace (new in v1)
Turn a PNG/JPG into real editable vector objects:
1. Click **Trace** in the top bar, or drag & drop an image onto the canvas.
2. Choose options and press **Trace**, then preview and **Add to canvas**.
3. The result lands as a **group of one path per traced region** — selectable,
   movable, resizable, recolorable, deletable, and exported with everything
   else to SVG/PNG.

Options:
- **Mode:** Color (2–16 colors) or Black & White (luminance threshold).
- **Detail / smoothing:** higher = more faithful to the source.
- **Noise removal:** ignores tiny paths (higher = cleaner, fewer fragments).
- **Background:** Transparent (drops near-white layers), Keep white, or Keep
  all layers.
- **Keep original as reference:** optionally adds the source image as a locked,
  faded reference layer under the trace.

Implementation: [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs)
(color quantization + layered path tracing). Large uploads are downscaled to
1024px on the long edge before tracing, and tracing runs after a UI yield with
a visible busy state so the page never freezes (no Web Worker — the library
runs synchronously, and the downscale keeps it fast).

**Honest limit:** tracing quality depends on image contrast and simplicity.
Clean logos, icons, and line art trace sharply. Photos come out
stylized/posterized — that is inherent to vector tracing, not a bug.

Measured on this build machine (Node, synthetic 1024×1024 banded test image,
8 colors): ~660 ms per trace. Real photos with more detail take longer, but
the downscale cap keeps it in the same ballpark.

### SVG import
Bring existing vector art in as one centered, selected group:
- **Import SVG** in the top bar opens an `.svg` file, or **Paste SVG** reads
  SVG markup from the clipboard — or just press **Ctrl/Cmd+V** when the
  clipboard holds SVG markup (e.g. copied out of Figma or Illustrator).
- Supported: rect, circle, ellipse, line, polygon, polyline, path (including
  bezier, quadratic and arc segments), text, groups, transforms, solid fills,
  and linear/radial gradients from `<defs>`. The imported group is fully
  editable (ungroup it to edit members).
- Safety: parsing uses DOMParser only and reads whitelisted attributes, so
  `<script>`, event attributes, stylesheets, `<use>` and external images are
  never executed or loaded. CSS classes, clip paths, masks, filters and
  patterns are not applied; text width is estimated; arcs are approximated
  as short line segments.

### History, files, and export
- Undo / redo (Ctrl+Z / Ctrl+Shift+Z), snapshot stack capped at 100 steps.
- **New / Open (JSON) / Save (JSON download)**, autosave to localStorage with
  restore on reload.
- **Export SVG** (exact vector), **Export PNG** (1x/2x rasterization via
  canvas), **Copy SVG** to clipboard.
- **Templates:** blank canvas, logo mark, social post (1080×1080), business
  card — plus artboard presets in the top bar.

### Keyboard shortcuts
V Select · A Direct · P Pen · R Rectangle · E Ellipse · L Line · T Text ·
B Brush · H Hand · Space+drag pan · Ctrl+wheel zoom · Shift constrain ·
Ctrl+D duplicate · Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo · Del delete ·
Arrows nudge (Shift = 10px) · Enter finishes a pen path · Esc cancels /
deselects · Ctrl/Cmd+V pastes SVG · **? opens the full shortcut help** (also
via the **Help** button in the top bar).

## Performance

Why it is fast: everything runs client-side (no server round-trips); state is
zustand with selectors so panels don't re-render the whole tree on every
pointer move; shapes are memoized and drag updates preserve object identity
for unchanged objects; drag/resize work is batched through
requestAnimationFrame; the SVG node count stays proportional to object count
(no per-pixel work). Production bundle: ~349 KB JS (gzip ~108 KB) plus an
18 KB stylesheet.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
npm run preview  # serve the production build
npm test         # vitest unit tests
npm run test:e2e # Playwright smoke tests against the production build
```

## Tests

Vitest unit tests cover the pure geometry/utils layer (bezier path building,
bounding boxes, transform math, snap, polygon generation, hit testing, SVG
serialization round-trip), the tracing wrapper (a tiny synthetic image
produces non-empty SVG path output; color-count and threshold options change
the output as expected; background handling drops the white layer), the SVG
importer (element mapping, transforms, gradients, security exclusions, path
data including arcs) and radial gradient export.

Playwright smoke tests run against the production build (`vite preview`):
studio renders, rectangle draw + fill change, SVG export download. GitHub
Actions (`.github/workflows/ci.yml`) runs unit tests, the production build,
and the Playwright suite on every push/PR to main.

Current result: **55/55 unit tests pass** (27 geometry + 9 trace + 14 SVG
import + 5 gradients) and **3/3 Playwright smoke tests pass**.

## Changelog

### Phase 1 (2026-10-24) — reliability + quick wins
- React error boundary: a render crash now shows a recovery screen (Reload /
  Start fresh) instead of a blank page.
- Playwright E2E smoke tests + GitHub Actions CI (unit tests, build, E2E on
  every push/PR to main).
- SVG import: file picker, Paste SVG button, and Ctrl/Cmd+V paste.
- Rulers + draggable guides (not saved, not exported).
- Radial gradients (linear behavior unchanged).
- Keyboard shortcut help modal (`?` / Help button).
- Meta description + Open Graph tags in index.html.

## Not in v1

- Pathfinder boolean operations (unite / subtract / intersect)
- Gradient mesh
- Plugins / extensions
- Collaboration / multi-user editing
- Cloud save (localStorage autosave + JSON files only)
- A Web Worker for tracing (async busy-state tracing instead; see above)

## Deploy

The app is fully static. Deploy `dist/` to Netlify, Vercel, GitHub Pages, or
any static host. No environment variables, no server, no database.

## License

MIT — built as an original project. Not affiliated with Adobe.

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
- **Multiple artboards:** add, duplicate (with its objects), delete, rename,
  and switch from the top bar. Each artboard has its own size, background,
  and objects; only the active artboard is drawn and exported.
- **Smart guides:** while dragging or resizing, magenta lines appear when
  the moving object's edges or center align with another object's
  edges/center, and the object snaps to them. Grid snap still works and only
  fills in on axes the smart snap did not fix.
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
- **Pathfinder booleans** (Align panel): Unite, Subtract, Intersect, Exclude
  for 2+ selected closed shapes (rect, ellipse, polygon, star, path). The
  result is a single path keeping the first shape's fill/stroke; rotation is
  baked in, rect corner radius is ignored, open paths are closed implicitly.
  Text, brush strokes, groups, lines and images are not supported — the
  buttons disable with a reason when the selection is unsupported.
- **Outline stroke** (Properties): turns a shape's stroke into a filled path
  (stroke color becomes the fill). Works for rect, ellipse, line, path, and
  brush; rect corner radius is ignored and line caps are butt caps.
- **Simplify + Smooth** (Properties, path/brush only): Simplify drops anchor
  points with an adjustable tolerance (bezier curves are flattened first);
  Smooth rounds the shape with Chaikin smoothing. Both are undoable.
- **Clipping masks** (Align panel): the topmost selected shape becomes the
  mask for the rest (mask itself is not drawn; Layers shows "· mask" /
  "· clipped"). Release restores everything. Masks are top-level objects only.
- **Text on path** (Align panel): select one text + one path to attach the
  text to the path (multi-line text collapses to one line on a path). Both
  masks and text-on-path survive JSON save/load and SVG export (clipPath /
  textPath output).

### Panels (right side)
- **Layers:** list (active artboard only), rename (double-click), visibility
  eye, lock, reorder, mask/clipped badges, **search filter** (case-insensitive
  name match with a clear button and an honest "no layers match" state;
  filtering never changes selection or document order), and a **Components**
  section (place / edit / delete masters; instances carry a ◆ badge).
- **Components (new in Phase 3):** select objects → **Create component**
  in Align & Arrange → place instances from the Layers panel. Editing a
  master updates every instance; **Detach instance** turns one instance
  back into independent objects. Per-instance overrides beyond transform
  (position / scale / rotation / opacity) are not supported. Components
  survive JSON save/load; v1/v2 files (no components) still open.
- **Properties:** fill color, gradients (linear with angle, or radial with
  center + radius, 2+ stops), stroke color + width, opacity, blend mode,
  corner radius, polygon sides, star points / inner ratio, font family /
  size / weight, text content, position, size, rotation, path Simplify /
  Smooth, Outline stroke. Includes swatches and recent colors. The font
  picker has two groups: **System fonts** (8) and **Google Fonts** (22,
  including Hind Siliguri and Noto Sans Bengali for Bengali text), loaded
  on demand from Google Fonts when chosen — no font files are bundled.
  Exports keep the font-family name, so a viewer needs the font installed
  or loaded; offline use falls back to system fonts. The only network
  request is the font stylesheet itself (no tracking beyond that).
- **Align:** left / center / right / top / middle / bottom, distribute
  horizontally / vertically (3+ objects), Pathfinder booleans, mask, and
  text-on-path actions.

### Install as an app (PWA, new in Phase 3)
VectorForge ships a web app manifest (192px + 512px icons) and a service
worker that precaches the app shell, so it installs like a native app
(standalone window) and opens offline after the first visit. Updates are
automatic: a new deploy activates the new worker at once, and an open tab
picks up the new bundle on reload (or on the next visit if you are
mid-edit — it never reloads under an active drag).

### Language: English / Bengali (new in Phase 3)
**EN / BN** toggle in the top bar, saved in the browser, defaulting to
English. Only UI chrome is translated (toolbar, panels, dialogs, help,
tour); your own canvas text is never touched.

### Touch + small screens (new in Phase 3)
Canvas input is unified on Pointer Events: finger/stylus drawing works,
pinch zooms and two-finger pan work on tablets, and small screens get a
compact working layout (scrollable toolbar) instead of the old dead-end
notice. Pinch is verified by code inspection — Playwright's touchscreen
API has no multi-touch; single-finger touch drawing is E2E-tested.

### Responsive header + mobile layout (new in Phase 5)
The top bar measures its own width and moves lower-priority actions into
a **More** overflow menu (the same actions, never divergent duplicates);
primary actions (New/Open/Save, undo/redo, zoom, export) stay reachable,
and artboard controls collapse into a compact switcher. The desktop visual
order changed slightly for this (artboard select now sits left of the
import/export group) so the overflow cut is clean. On phones, Layers and
Properties become **bottom-sheet drawers** (closed by default, opened from
floating buttons), the canvas takes the remaining viewport, the toolbar
stays a horizontally scrollable row, and every dialog fits small screens
(near-full width, max-height 90dvh with internal scroll). There is **no
horizontal page scroll at any viewport width ≥ 320px** (E2E-tested at
390px and 320px). Viewport meta is `width=device-width, initial-scale=1,
viewport-fit=cover`; the canvas SVG uses `touch-action: none` and UI
chrome uses `touch-action: manipulation` so double-tap zoom never hijacks
canvas gestures.

### Command palette (new in Phase 5)
**Ctrl/Cmd+K** (or the palette button in the top bar) opens a fuzzy-search
palette over a real action registry: all 13 tools, file operations (new,
open, save, import SVG/EPS, paste SVG), edit (undo, redo, duplicate,
delete, group, ungroup, zoom to selection), view (zoom in/out, reset view,
grid/snap toggles, templates, trace, help, tour), and export (SVG, EPS,
PDF, PNG, copy SVG, asset panel). Arrow keys navigate, Enter runs, Esc
closes — every listed action executes a real function; there are no dead
entries. Its shortcut is listed in the shortcut-help modal.

### Recent files (new in Phase 5)
The **Recent** button in the top bar lists the last 5 opened or saved JSON
documents (name + relative time); clicking one reopens it. Entries live in
localStorage (`vectorforge-recent-files`), so the list is per-browser;
documents over ~800 KB are not recorded, and if storage fills up the
oldest entry is evicted and the save retried once — it never crashes.
Clear removes the whole list.

### Zoom to selection (new in Phase 5)
The **Crosshair** button in the top bar (or **F**) fits the view to the
current selection with padding; with nothing selected it fits the
artboard, the same as the existing Fit action.

### Custom canvas size (new in Phase 5)
The **Canvas size** button in the artboard controls opens a dialog with
preset sizes plus **custom width × height** inputs and a unit selector
(**px, mm, cm, in**). Units convert to internal pixels at **96 DPI
(1 in = 96 px)**; the stored artboard size stays in px, so canvas
rendering and all exports (SVG/PNG/EPS/PDF) follow automatically.
Resizing the active artboard is **undoable** (artboard size now lives in
the history snapshot). Inputs validate: positive integers, range
10–10000 px; empty or non-numeric input shows a clear inline error
instead of breaking the canvas. The same dialog appears when **adding a
new artboard**, so new boards are no longer locked to 1080×1080.

### Onboarding tour (new in Phase 3)
First visit shows a short guided tour (toolbar → canvas → layers →
properties → export) with Skip and "don't show again"; replay anytime
from the **Tour** button in the top bar. Tour text follows the EN/BN
toggle.

### Templates (expanded in Phase 3)
Blank, Logo mark, Social post, Business card — plus **Icon set**
(12 icons), **Poster** (A4), **YouTube thumbnail** (1280×720), and
**Infographic** (1080×1350), all built from existing object types.

### Image Trace (new in v1, Round A quick wins 2026-10-25)
Turn a PNG, JPG or WebP into real editable vector objects:
1. Click **Trace** in the top bar, or drag & drop an image onto the canvas.
2. Choose options and press **Trace**, then compare and **Add to canvas**.
3. The result lands as a **group of one path per traced region** — selectable,
   movable, resizable, recolorable, deletable, and exported with everything
   else to SVG/PNG.

Options:
- **Preset:** Logo, Line art, Sketch, Photo, Comic — each fills the controls
  with a sensible combination; tweaking any control switches back to Custom.
- **Quality:** Standard (1024px max edge) or High (2048px max edge).
- **Mode:** Color (2–16 colors) or Black & White (global threshold, or
  adaptive local-mean threshold for unevenly lit images).
- **Detail / smoothing:** higher = more faithful to the source.
- **Noise removal:** ignores tiny paths (higher = cleaner, fewer fragments).
- **Background:** Transparent (drops near-white layers), Keep white, or Keep
  all layers.
- **Enhance before tracing:** contrast boost, denoise (soft blur), sharpen
  edges — pure pixel steps that run inside the worker.
- **Keep original as reference:** optionally adds the source image as a locked,
  faded reference layer under the trace.

Implementation: [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs)
(color quantization + layered path tracing). Tracing runs in a **Web Worker**
(`src/workers/traceWorker.js`), so the studio stays responsive during a trace
and the modal offers a **Cancel** button that terminates the worker without
touching the document. Only image decode, canvas downscale and the preview
data URL stay on the main thread (they need the DOM). If Workers are
unavailable, the modal falls back to main-thread tracing once and says so in
the result line. The result step shows an **original vs traced compare
slider** (drag to wipe between the two); the compare image is display-only
and is never inserted unless "Keep original as reference" is on.

**Honest limit:** tracing quality depends on image contrast and simplicity.
Clean logos, icons, and line art trace sharply. Photos come out
stylized/posterized — that is inherent to vector tracing, not a bug.

Measured on this build machine (Node, synthetic circle/bar/bands test image,
8 colors): ~480 ms at 1024×1024, ~1720 ms at 2048×2048. Real photos with more
detail take longer; the worker keeps the UI alive while they run.

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

### EPS import (new in Phase 4)
- **Import EPS** in the top bar parses a PostScript file into one centered,
  selected group, same UX as SVG import. A small tokenizer + operand-stack
  interpreter handles a whitelisted subset only: path construction (m/l/c/
  v/y/h/re), painting (f/F/S/s/B/b), colors (setrgbcolor, setgray,
  setcmykcolor → RGB), graphics state (q/Q, cm, translate/rotate/scale,
  linewidth, linecap/join, dash), clipping (clip/eoclip), text
  (findfont/scalefont/setfont + show), `%%BoundingBox` sizing, and binary
  preview sections are skipped (only the PostScript part is parsed).
- Files that use features outside the subset fail with a clear message
  instead of silently corrupting: raster images, gradient shading (shfill),
  custom procedures, and colorspace colors are not imported yet.
- EPS files exported by VectorForge itself round-trip back correctly
  (rects stay rects, fills and text survive); imported groups are flat —
  the original group nesting is not preserved.

### History, files, and export
- Undo / redo (Ctrl+Z / Ctrl+Shift+Z), snapshot stack capped at 100 steps.
  Snapshots cover artboards too, so custom canvas-size changes undo/redo
  like any other edit (transient preset switches and background-picker
  drags stay non-undoable by design).
- **New / Open (JSON) / Save (JSON download)**, autosave to localStorage with
  restore on reload. Saved files are v2 format (`artboards`,
  `activeArtboardId`, objects with `artboardId`); **v1 files (single
  `artboard`) still open** and migrate to a one-artboard document.
- **Export SVG** (exact vector), **Export EPS** (Encapsulated PostScript,
  one file per artboard), **Export PDF** (hand-rolled minimal PDF 1.4, no
  library), **Export PNG** (1x/2x rasterization via canvas), **Copy SVG** to
  clipboard. Quick exports use the active artboard.
- **Export assets** (top bar): export the active artboard — or the current
  selection — as SVG, EPS, or PDF plus PNGs at multiple sizes (16–1080px, or
  the Favicon / App icon / Social post presets), downloaded as individual
  files (no zip). Non-square regions keep their aspect ratio, so the longest
  edge equals the chosen size. The **Optimize SVG** toggle shrinks SVG
  exports (3-decimal rounding, default attributes and empty `<defs>`
  removed, comments and `data-*` attributes stripped, text content
  untouched); the top-bar Export SVG stays exact by default.
- **Print-export limits (honest):** gradients fall back to their first stop's
  solid color in EPS and PDF; text uses standard fonts (Arial→Helvetica,
  Times→Times-Roman, Courier→Courier) and non-Latin text (e.g. Bengali)
  renders as `?` in PDF — SVG remains the faithful format for those cases.
  Groups export flattened with their transforms; clip masks export via
  clip operators; one artboard per EPS/PDF file.
- **Templates:** blank canvas, logo mark, social post (1080×1080), business
  card — plus artboard presets in the top bar.

### Keyboard shortcuts
V Select · A Direct · P Pen · R Rectangle · E Ellipse · L Line · T Text ·
B Brush · H Hand · Space+drag pan · Ctrl+wheel zoom · Shift constrain ·
Ctrl+D duplicate · Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo · Del delete ·
Arrows nudge (Shift = 10px) · Enter finishes a pen path · Esc cancels /
deselects · Ctrl/Cmd+V pastes SVG · **Ctrl/Cmd+K opens the command palette**
· **F zooms to selection** (or fits the artboard) · **? opens the full
shortcut help** (also via the **Help** button in the top bar).

## Performance

Why it is fast: everything runs client-side (no server round-trips); state is
zustand with selectors so panels don't re-render the whole tree on every
pointer move; shapes are memoized and drag updates preserve object identity
for unchanged objects; drag/resize work is batched through
requestAnimationFrame; the SVG node count stays proportional to object count
(no per-pixel work). Production bundle: ~509 KB JS (gzip ~151 KB) plus a
~20 KB stylesheet.

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
data including arcs), radial gradient export, boolean operations (areas for
unite/subtract/intersect/exclude, holes, empty results), path operations
(flattening, simplification, smoothing, stroke outlining), and artboard
migration (v1 → v2, v2 passthrough, smart-snap behavior).

Playwright tests run against the production build (`vite preview`): studio
renders, rectangle draw + fill change, SVG export download, multi-artboard
add/switch, boolean unite through the real UI, EPS + PDF export downloads,
and the Phase 5 mobile suite (no horizontal overflow at 390px and 320px,
More menu action, drawer toggles, mobile drawing, palette, recent files,
layer search, zoom to selection, custom canvas size). GitHub Actions
(`.github/workflows/ci.yml`) runs unit tests, the production build, and the
Playwright suite on every push/PR to main.

Current result: **152/152 unit tests pass** (27 geometry + 9 trace + 14 Round A trace + 14 SVG
import + 5 gradients + 9 booleans + 12 path ops + 8 artboards + 18 Phase 3 +
12 EPS + 4 PDF + 5 SVG optimizer + 15 Phase 5) and **29/29 Playwright tests
pass**.

## Changelog

### Phase 5 (2026-10-25) — responsive + user-friendly
- Responsive header: the top bar measures its width and moves
  lower-priority actions into a More overflow menu (same actions, no
  duplicates); desktop order changed slightly (artboard select left of
  import/export) so the overflow cut is clean. No horizontal page scroll
  at any viewport ≥ 320px (E2E at 390px and 320px).
- Mobile layout: Layers/Properties become bottom-sheet drawers on phones
  (closed by default, floating toggle buttons), canvas takes the remaining
  viewport, toolbar stays a scrollable row, all dialogs fit small screens
  (90dvh + internal scroll). Viewport meta gains `viewport-fit=cover`;
  canvas `touch-action: none`, UI chrome `touch-action: manipulation`.
- Command palette (Ctrl/Cmd+K + palette button): fuzzy search over a real
  registry (13 tools, file, edit, view, export); arrows/Enter/Esc; no dead
  entries. Shortcuts listed in the help modal.
- Recent files: top-bar Recent menu, last 5 JSON documents (name + time),
  localStorage-backed and per-browser, ~800 KB entry cap, evict-oldest on
  quota, never crashes; click reopens.
- Layer search: case-insensitive filter with clear button and honest empty
  state; selection and document order untouched.
- Zoom to selection: top-bar button + F; fits the artboard when nothing is
  selected. History snapshots now include artboards, so canvas-size changes
  are undoable.
- Google Fonts: 22 families in the Properties picker (incl. Hind Siliguri
  and Noto Sans Bengali), loaded on demand; exports keep the family name,
  offline falls back to system fonts; no bundled files, no tracking beyond
  the font request.
- Custom canvas size: Canvas size dialog (presets + custom W×H, units px /
  mm / cm / in at 96 DPI, 10–10000 px validation with inline errors) for
  resizing the active artboard and for new artboards (no more fixed
  1080×1080 default).
- Tests 138/138, E2E 22/22, build passes, bundle 509 KB JS (+3.5% over
  Phase 4's 492 KB — inside the 25% budget). Honest limits: pinch on real
  hardware still untested; P0 leftovers (trace Web Worker, traced-doc perf,
  autosave safety) still open; custom domain still the user's call.

### Round A — Image Trace quick wins (2026-10-25)
- Trace runs in a **Web Worker** (new `src/workers/traceWorker.js` chunk);
  the modal stays responsive and a **Cancel** button terminates the worker
  without touching the document. Main-thread fallback once if Workers are
  unavailable, noted in the result line.
- **Quality:** Standard (1024px) vs High (2048px) max edge; measured
  ~480 ms at 1024×1024 vs ~1720 ms at 2048×2048 on the build machine.
- **Preprocessing** (pure functions, in-worker): contrast boost, denoise
  blur, sharpen, plus **adaptive threshold** for B&W (local-mean via
  integral image) for unevenly lit images.
- **Presets:** Logo, Line art, Sketch, Photo, Comic — each fills the
  controls; tweaking returns to Custom.
- **Compare slider** in the result step: drag to wipe original vs traced
  (display-only; never inserted unless "Keep original as reference" is on).
- **WebP input** accepted alongside PNG/JPEG.
- Tests 152/152, E2E 27/27 (5 new trace specs), build passes. P0 "trace Web
  Worker" is now done; still open: traced-doc perf, autosave safety,
  vtracer migration, custom domain (user's call).
- **Cursor fix (same round):** every tool now shows a fitting canvas
  cursor — pen + all shape tools + brush + eraser use crosshair (was plain
  arrow), eyedropper uses `cell` (was `copy`), hand shows `grab` and
  `grabbing` mid-pan (wired to the pan session). Selection-handle cursors
  unchanged. Covered by 2 new cursor E2E specs (29/29 total).

### Phase 4 (2026-10-24) — production export
- EPS export: valid Encapsulated PostScript per artboard (header,
  `%%BoundingBox`, y-flip CTM, `re` for plain rects, fills/strokes, group
  transforms, clip operators, standard-font text) from the top bar and the
  asset panel.
- EPS import: whitelisted-subset PostScript parser (no eval, no arbitrary
  execution) into one centered, selected group; clear failure messages for
  images, gradient shading, procedures, and unknown operators; VectorForge
  exports round-trip back correctly (unit-tested).
- PDF export: hand-rolled minimal PDF 1.4 (zero new dependencies) — catalog,
  pages, MediaBox, path/fill/stroke/clip operators, Type1 fonts, verified
  xref offsets (unit-tested) — from the top bar and the asset panel.
- SVG optimizer: pure-function shrinker (3-decimal rounding, default
  attributes, empty `<defs>`, comments, `data-*` stripped; text untouched)
  as an opt-in toggle in the asset panel; top-bar Export SVG stays exact.
- Limits (documented above): gradients → first stop; non-Latin PDF text →
  `?`; imported EPS groups flatten; one artboard per file.

### Phase 3 (2026-10-24) — platform
- PWA: installable (manifest + 192/512px icons), offline app shell via
  precaching service worker, auto-update on deploy (vite-plugin-pwa,
  generateSW; Apple touch icon + mobile-web-app-capable tags included).
- Bengali + English UI: EN/BN toggle in the top bar, persisted,
  defaulting to English; every EN key has a BN counterpart (unit-tested).
- Touch: Pointer Events throughout, pinch-to-zoom + two-finger pan,
  compact working layout on small screens (old cramped-screen notice
  removed).
- Components/symbols: create from selection, place instances, edit
  master (all instances update), detach; additive document field, so
  v1/v2 files load unchanged.
- Templates: icon set, poster, YouTube thumbnail, infographic added
  (8 total); template-validity unit test also caught and fixed two
  pre-existing broken ellipses in the Social and Business card templates
  (they used cx/cy/r, which the engine ignores for ellipses).
- Onboarding tour: custom, no library — first-run spotlight steps,
  Skip / don't-show-again, replay from the top bar, EN + BN text.
- Fixed during Phase 3: a service-worker forced reload could fire
  mid-drag and lose the canvas session — the reload now only happens
  before the first interaction; mid-edit sessions are never interrupted.

### Phase 2 (2026-10-24) — professional editing
- Pathfinder booleans (Unite / Subtract / Intersect / Exclude) via
  polygon-clipping; result is a single multi-contour path (evenodd fill).
- Outline stroke, Simplify (tolerance slider) + Smooth for paths and brush
  strokes — all undoable.
- Smart guides + snap to objects while moving and resizing (grid snap kept
  as fallback per axis).
- Text on path (textPath) and clipping masks (clipPath), both surviving
  JSON save/load and SVG export.
- Multiple artboards (add / duplicate / delete / rename / switch); v1
  single-artboard files and autosaves still open via migration.
- Asset export panel: multi-size PNGs, SVG, Favicon / App icon / Social
  post presets, artboard or selection scope. No PDF, no zip (documented
  at the time; PDF arrived in Phase 4).

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

- Gradient mesh
- Plugins / extensions
- Collaboration / multi-user editing
- Cloud save (localStorage autosave + JSON files only)
- A Web Worker for tracing (async busy-state tracing instead; see above)
- Zip export (asset export downloads individual files)
- Non-destructive (live) booleans — Phase 2 booleans are destructive but undoable

## Deploy

The app is fully static. Deploy `dist/` to Netlify, Vercel, GitHub Pages, or
any static host. No environment variables, no server, no database.

## License

MIT — built as an original project. Not affiliated with Adobe.

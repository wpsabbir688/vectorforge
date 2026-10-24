# VectorForge — Professional Expert Review & Improvement Roadmap

**Date:** 2026-10-24 · **Version reviewed:** v1 (live at delicate-kheer-1bc786.netlify.app)

## Phase 1 — DONE 2026-10-24 ✅

All Phase 1 items are built, tested and live: error boundary (P0 #1),
Playwright E2E smoke tests (P0 #2), GitHub Actions CI (P0 #3), SVG import
(P1 #7, file + paste), rulers + draggable guides (P1 #5), radial gradients
(P1 #10, linear unchanged), keyboard shortcut help (P2), meta/OG tags (P3).
Still open from the original Phase 1 list: the **custom domain decision**
(deliberately left to the user — no domain was picked or configured).
Still open P0 items, not in Phase 1 scope: Web Worker tracing (P0 #4),
traced-document performance (P0 #5), autosave safety (P0 #6).
Verification: 55/55 unit tests, 3/3 Playwright smoke tests (run locally in
headless Chromium and in CI), production build passes (~349 KB JS).
**Reviewer stance:** what a professional vector-tool user (Illustrator / Figma / Inkscape level)
expects, measured against what v1 actually ships. No code was changed for this review.

## Verdict

v1 is a genuinely solid single-user editor: custom SVG engine, pen/bezier, shapes,
Image Trace, groups, layers, gradients, align, autosave, SVG/PNG/JSON export — all
verified working live. The gap to "professional" is not polish, it is **missing
pro operations** (booleans, stroke-to-path, smart guides), **one-document limits**
(single artboard, no SVG import), and **reliability gaps** (no error boundary —
the 2026-10-24 blank-page outage was exactly this class of bug).

## What v1 already does well (keep, don't regress)

- Pen tool with bezier handles, direct-select anchor editing, multi-select + marquee
- Group/ungroup, layer reorder/rename/eye/lock, align + distribute
- Linear gradients, blend modes, opacity, corner radius, grid + snap
- Image Trace (color/B&W, 2–16 colors, background modes) — a real differentiator
- Autosave to localStorage, undo/redo (100 steps), JSON save/open
- Fully client-side, no account, fast load (~328 KB JS)

## P0 — Reliability (do first; small effort, prevents outages)

| # | Improvement | Why | Effort |
|---|-------------|-----|--------|
| 1 | **React error boundary** around the canvas + panels | One render crash currently blanks the whole app (proven 2026-10-24). A boundary shows "something broke — recover" instead of a dead page, with a reset button. | S |
| 2 | **Playwright E2E smoke tests** (load, draw, trace, export) in CI | v1's tests are geometry-only; no test ever rendered the app. This is how the missing-import bug shipped. | M |
| 3 | **GitHub Actions CI**: build + tests on every push | Catches build/test breaks before Netlify deploys them. | S |
| 4 | **Image Trace in a Web Worker** | Trace currently runs on the main thread (only a `setTimeout` yield). Large images freeze the UI; a worker keeps the editor responsive. | M |
| 5 | **Performance for traced documents** | Traced groups can hold hundreds of paths; SVG DOM slows down fast. Mitigations: memoize shape renders, simplify traced output, warn on very large traces. | M |
| 6 | **Autosave safety**: quota handling + "recovered document" notice | Silent restore is fine until storage is full or corrupt; surface it instead of losing work. | S |

## P1 — Professional editing (the biggest user-visible upgrade)

| # | Improvement | Why | Effort |
|---|-------------|-----|--------|
| 1 | **Pathfinder / boolean operations** — Unite, Subtract, Intersect, Exclude | The single most-expected pro feature (Illustrator Pathfinder, Figma booleans). Logo/icon work without it is painful. Libraries exist (e.g. polygon-clipping) — no need to write the math. | M–L |
| 2 | **Outline stroke** (stroke → filled path) | Required for logo finalization and clean SVG handoff; Figma/Illustrator both ship it. | M |
| 3 | **Simplify path + smooth path** | Traced paths are noisy; simplify reduces anchor count dramatically and makes traces actually usable. | M |
| 4 | **Smart guides + snap to objects** (not just grid) | Pros align to edges/centers of other objects, with spacing hints. Grid snap alone feels amateur. | M |
| 5 | **Rulers + draggable guides** | Standard in every pro tool; cheap to build on the existing canvas. | S–M |
| 6 | **Multiple artboards** | v1 has exactly one artboard. Logo systems, social sets, and icon sheets all need several. This touches the store shape, so do it before the codebase grows. | L |
| 7 | **SVG import** (file + paste from Figma/Illustrator) | Pros constantly round-trip SVGs. Paste-SVG-from-clipboard is the highest-leverage workflow win here. | M |
| 8 | **Components / symbols + shared styles & swatches** | Reuse one logo across artboards; change once, update everywhere. Figma's core advantage. | L |
| 9 | **Text on path + masks (clip)** | Common logo/badge work; both are standard SVG features the engine can already express. | M |
| 10 | **Radial gradients + Google Fonts loading** | v1 has linear gradients and system fonts only. Radial is small; font loading (with subsetting care) unlocks real typography. | S–M |

## P2 — Workflow & productivity

- **Keyboard shortcut reference + command palette** (Ctrl/Cmd+K): v1's shortcuts are undiscoverable; pros live in shortcuts.
- **Asset export panel**: multi-size PNG export (16/32/64/128/512…), export presets (favicon, app icon, social), PDF export for print handoff.
- **SVG optimizer** on export (SVGO-style cleanup: precision rounding, dead-attribute removal) — smaller, cleaner files for developers.
- **Layer panel upgrades**: search/filter, thumbnails, color tags, isolate/lock-others.
- **Zoom to fit / zoom to selection**, zoom percentage presets, canvas navigator/minimap for large documents.
- **Copy/paste between documents**, duplicate artboard, recent-files list.
- **More templates**: icon set, YouTube thumbnail, poster, infographic — templates are v1's best onboarding; expand them.
- **Guided onboarding tour** for first-run users (the app currently drops users on a logo template with no tour).
- **Offset path, stroke dashes, arrowheads**: small, frequently requested shape finishing tools.

## P3 — Platform & growth

- **PWA**: installable app + offline use (manifest + service worker). Fits the "no backend" model perfectly.
- **Custom domain** (e.g. vectorforge.app or a subdomain of his own) instead of the Netlify auto-name; plus meta description + Open Graph tags (index.html currently has neither) for sharing/SEO.
- **Bengali + English UI** (his other projects are bilingual; a BN toggle would stand out for Bangladeshi users).
- **Touch / iPad support**: v1 shows a "small screen will feel cramped" notice instead of working — touch drawing is a large audience (tablets + stylus).
- **Accessibility pass**: keyboard navigation in panels, ARIA labels, focus states, contrast check.
- **Feedback + analytics (privacy-friendly)**: without usage data, the roadmap is guesswork.
- **Cloud save + collaboration**: the big fork in the road. Needs a backend + accounts and changes the product's nature. Do NOT start this before P0/P1 are done — single-user pro quality first.

## Recommended order

1. **Phase 1 (reliability + quick wins, ~1–2 weeks):** ✅ DONE 2026-10-24 — error boundary, Playwright smoke tests, CI, SVG import (paste), rulers/guides, radial gradients, shortcut help, meta/OG. Custom domain decision still open (user's call).
2. **Phase 2 (pro editing, ~3–5 weeks):** ✅ DONE 2026-10-24 — booleans (Unite/Subtract/Intersect/Exclude via polygon-clipping, destructive but undoable), outline stroke, simplify + smooth, smart guides (move + resize; spacing hints not included), text on path + masks (clipPath/textPath, top-level objects only), multi-artboard (add/duplicate/delete/rename/switch, v1 files migrate), asset export panel (multi-size PNG + SVG + presets; no PDF, no zip). Tests 84/84, E2E 5/5, live smoke test still to run by parent. Still open from P0: trace Web Worker, traced-doc perf, autosave safety.
3. **Phase 3 (platform):** ✅ DONE 2026-10-24 — PWA (manifest + 192/512px icons, precaching SW, auto-update; vite-plugin-pwa 2.0.0, dev dep only), i18n (EN/BN toggle, default EN, persisted; key-coverage unit test), touch (Pointer Events, pinch zoom + two-finger pan, compact small-screen layout; pinch verified by code inspection — Playwright has no multi-touch emulation; touch-pointer drag is E2E-tested), components (create/place/edit-master/detach; additive field, v1/v2 files load; Layers ◆ badge + list), templates (icon set, poster, YouTube thumbnail, infographic — 8 total; validity test fixed 2 pre-existing broken ellipses in Social + Business card templates), onboarding tour (custom, first-run, Skip + don't-show-again, replay button, EN + BN). Tests 102/102, E2E 9/9, build passes, bundle 462 KB JS (+15% over Phase 2's 402 KB — inside the 25% budget). Known limits: per-instance overrides beyond transform not supported; SW reload is suppressed after the first interaction (a forced reload mid-drag was found to lose the canvas session during Phase 3 testing — fixed by gating the reload); offline mode needs one prior online visit (precache); pinch on real hardware not yet tested. Still open from P0: trace Web Worker, traced-doc perf, autosave safety. Custom domain decision still open (user's call).
4. **Later / only if validated by users:** collaboration, cloud save, plugin API, gradient mesh (high effort, niche demand).

## What NOT to do yet

- Collaboration/cloud before single-user editing is excellent — it multiplies complexity without fixing the core.
- Gradient mesh, 3D effects, AI generation — impressive demos, rarely the reason someone picks a vector tool daily.
- Rewriting the SVG engine on canvas/WebGL before measuring: SVG DOM is fine until documents get very large; optimize first, rewrite only with numbers.

## Effort legend

S = hours–1 day · M = 2–5 days · L = 1–3 weeks · XL = a month or more (single developer, part-time pace assumed).

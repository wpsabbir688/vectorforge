// Shared quick exports used by both the top bar and the command palette.
// Single-artboard exports always use the ACTIVE artboard with component
// instances expanded first (the serializers only know plain shapes).
import { useStore } from '../store/useStore.js';
import { exportSvg, exportPng, copySvgToClipboard, downloadFile } from './export.js';
import { exportEps } from './eps.js';
import { exportPdf } from './pdf.js';
import { expandInstances } from './components.js';

function activeArtAndObjects() {
  const s = useStore.getState();
  return {
    artboard: s.getActiveArtboard(),
    objects: expandInstances(s.getActiveObjects(), s.components),
  };
}

export function exportSvgFile() {
  const { artboard, objects } = activeArtAndObjects();
  downloadFile('vectorforge.svg', exportSvg(artboard, objects), 'image/svg+xml');
}

export function exportEpsFile() {
  const { artboard, objects } = activeArtAndObjects();
  downloadFile('vectorforge.eps', exportEps(artboard, objects), 'application/postscript');
}

export function exportPdfFile() {
  const { artboard, objects } = activeArtAndObjects();
  downloadFile('vectorforge.pdf', exportPdf(artboard, objects), 'application/pdf');
}

export async function exportPngFile(scale) {
  const { artboard, objects } = activeArtAndObjects();
  await exportPng(artboard, objects, scale);
}

export async function copySvgFile() {
  const { artboard, objects } = activeArtAndObjects();
  await copySvgToClipboard(artboard, objects);
}

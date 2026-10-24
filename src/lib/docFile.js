// Shared document save/open used by both the top bar and the command
// palette, so the two paths can never diverge. Recent-files recording lives
// here too: every successful open/save is recorded (best-effort, never
// throws — see recentFiles.js for the limits).
import { useStore } from '../store/useStore.js';
import { parseDocument } from './geometry.js';
import { downloadFile } from './export.js';
import { addRecent } from './recentFiles.js';
import { ensureFontsForObjects } from './fonts.js';

export function getCurrentDoc() {
  const s = useStore.getState();
  return {
    app: 'vectorforge', version: 2,
    artboards: s.artboards, activeArtboardId: s.activeArtboardId,
    objects: s.objects, components: s.components,
  };
}

export function saveCurrentDocument() {
  const s = useStore.getState();
  const doc = getCurrentDoc();
  downloadFile('vectorforge.json', JSON.stringify(doc, null, 2));
  addRecent(doc, s.docName || 'vectorforge.json');
}

// Throws on invalid input; callers show the alert.
export function openDocumentText(text, fileName) {
  const doc = parseDocument(text);
  const s = useStore.getState();
  s.loadDocument(doc);
  if (fileName) s.setDocName(fileName);
  addRecent(doc, fileName || 'Untitled');
  // Google Fonts used by the document load on demand (best-effort).
  ensureFontsForObjects(doc.objects || []);
  return doc;
}

// File-picker entry point shared by top bar + palette.
export function pickAndOpenDocument(onError) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        openDocumentText(reader.result, file.name);
      } catch {
        if (onError) onError();
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

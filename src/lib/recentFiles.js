// Recently opened/saved JSON documents, kept in localStorage. This is a
// per-browser list (no account, no cloud): entries hold the full document
// so clicking one reopens it exactly. Limits are honest by construction:
// at most RECENT_MAX entries, oversized documents are skipped (a traced
// document can exceed the whole localStorage quota on its own), and a quota
// error evicts the oldest entry and retries once — never a crash.
const KEY = 'vectorforge-recent-files';
export const RECENT_MAX = 5;
export const RECENT_MAX_BYTES = 800 * 1024;

function isValidEntry(e) {
  return !!e && typeof e.name === 'string' && typeof e.time === 'number'
    && !!e.doc && typeof e.doc === 'object' && Array.isArray(e.doc.objects);
}

export function loadRecent() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(isValidEntry).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function clearRecent() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  return [];
}

// Add (or bump) an entry. Returns the updated list. Never throws.
export function addRecent(doc, name) {
  try {
    const entry = { name: name || 'Untitled', time: Date.now(), doc };
    if (JSON.stringify(entry).length > RECENT_MAX_BYTES) return loadRecent();
    let list = loadRecent().filter((e) => e.name !== entry.name);
    list.unshift(entry);
    list = list.slice(0, RECENT_MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // Quota: drop the oldest and retry once, then give up silently.
      list = list.slice(0, -1);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
    }
    return list;
  } catch {
    return loadRecent();
  }
}

export function formatRelativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

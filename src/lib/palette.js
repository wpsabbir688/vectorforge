// Fuzzy matching for the command palette. Pure functions, unit-tested.
// Scoring: subsequence match required; bonuses for word starts and runs of
// consecutive characters; a small penalty for long candidates so the most
// specific match wins (e.g. "rect" ranks Rectangle above Direct select).
export function fuzzyScore(query, text) {
  const q = String(query || '').toLowerCase().trim();
  const t = String(text || '').toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastIdx = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 10;
      if (i === lastIdx + 1) {
        consecutive += 1;
        score += 5 * consecutive;
      } else {
        consecutive = 0;
      }
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '-') score += 8;
      lastIdx = i;
      qi += 1;
    }
  }
  if (qi < q.length) return -1;
  return score - t.length * 0.1;
}

// Actions: [{ id, title, hint?, keywords?, run }]. Empty query returns the
// registry order; otherwise best fuzzy score across title + keywords wins.
export function searchActions(query, actions) {
  const q = String(query || '').trim();
  if (!q) return actions;
  return actions
    .map((a) => {
      const hay = [a.title, ...(a.keywords || [])];
      const s = Math.max(...hay.map((h) => fuzzyScore(q, h)));
      return { a, s };
    })
    .filter((x) => x.s >= 0)
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
}

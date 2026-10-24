// Layer-list filtering. Pure: filtering only narrows the VISIBLE list —
// it never reorders the document, never changes selection, and the move
// up/down buttons keep operating on the full document order.
export function filterLayerRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((o) => (o.name || '').toLowerCase().includes(q));
}

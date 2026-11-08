// Word-by-word differences (longest common subsequence), for track changes' review.
// The Chatbot App Authorer uses the same method to line up its examples.
export const tokens = (text) => String(text ?? '').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g) ?? [];
const norm = (t) => t.toLowerCase().replace(/’/g, "'");

export function diff(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = norm(a[i]) === norm(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && norm(a[i]) === norm(b[j])) { out.push({ type: 'same', a: a[i], b: b[j] }); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) out.push({ type: 'ins', b: b[j++] });
    else out.push({ type: 'del', a: a[i++] });
  }
  return out;
}

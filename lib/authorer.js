// Chatbot App Authorer: give start and finish examples of a "text gradient" (formal to
// casual, first person to second, plain to vivid), and an algorithm infers the rewrite
// rules. You can read and edit them, apply them to new text, and save them.
//
// How the rules are inferred, for each example pair:
//   1. split both texts into words and punctuation;
//   2. line them up with the longest common subsequence, so what stayed the same is found;
//   3. each run of changed words becomes a rule "find -> replace" (an empty replace deletes);
//   4. a rule that would also fire where the example didn't change anything is widened with
//      one word of context on each side, so it only fires where it should.
// Rules seen in several pairs are counted, and conflicting rules (same find, different
// replace) keep the most frequent. Each set of rules is then proved on its own examples:
// applying them to every start must give its finish.

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

// Changed runs, with the unchanged word before and after each.
function hunks(a, b) {
  const d = diff(a, b);
  const out = [];
  let cur = null;
  let lastSame = null;
  d.forEach((x, k) => {
    if (x.type === 'same') {
      if (cur) { cur.after = x.a; out.push(cur); cur = null; }
      lastSame = x.a;
    } else {
      cur ??= { del: [], ins: [], before: lastSame, after: null, at: k };
      if (x.type === 'del') cur.del.push(x.a); else cur.ins.push(x.b);
    }
  });
  if (cur) out.push(cur);
  return out;
}

const join = (ts) => ts.reduce((s, t) => (!s ? t : /^[.,!?;:)\]'’]/.test(t) || /[(\[]$/.test(s) ? s + t : `${s} ${t}`), '');

export function learnRules(pairs) {
  const found = new Map();
  for (const [start, finish] of pairs) {
    const a = tokens(start), b = tokens(finish);
    for (const h of hunks(a, b)) {
      let find = h.del, replace = h.ins;
      // a pure insertion needs an anchor: attach it to the word before (or after)
      if (!find.length) {
        if (h.before) { find = [h.before]; replace = [h.before, ...h.ins]; }
        else if (h.after) { find = [h.after]; replace = [...h.ins, h.after]; }
        else continue;
      }
      const rule = { find: join(find), replace: join(replace) };
      const key = norm(rule.find);
      const entry = found.get(key) ?? new Map();
      const r = entry.get(rule.replace) ?? { ...rule, count: 0, context: [] };
      r.count++;
      r.context.push({ before: h.before, after: h.after });
      entry.set(rule.replace, r);
      found.set(key, entry);
    }
  }
  // most frequent replacement per find; longest finds first so they win over their parts
  const picked = [...found.values()].map((alts) => [...alts.values()].sort((x, y) => y.count - x.count)[0]);
  picked.sort((x, y) => tokens(y.find).length - tokens(x.find).length || y.find.length - x.find.length || y.count - x.count);
  // check each rule where the longer rules before it have already been applied
  const rules = [];
  let starts = pairs.map((p) => p[0]).join('\n');
  for (const { context, ...r } of picked) {
    const rule = { ...r, ...narrow(r, context, starts) };
    rules.push(rule);
    starts = applyRules(starts, [rule]).text;
  }
  return rules.map((r, i) => ({ id: `r${i + 1}`, on: true, ...r }));
}

// If the bare rule would fire somewhere an example left unchanged, add context words.
function narrow(rule, contexts, starts) {
  const bare = applyRules(starts, [rule]).count;
  const expected = contexts.length;
  if (bare <= expected) return {};
  const before = commonWord(contexts.map((c) => c.before));
  const after = commonWord(contexts.map((c) => c.after));
  const widened = {
    find: join([before, rule.find, after].filter(Boolean)),
    replace: join([before, rule.replace, after].filter(Boolean))
  };
  return before || after ? widened : { note: 'also fires where an example did not change' };
}
const commonWord = (ws) => (ws.length && ws.every((w) => w && norm(w) === norm(ws[0])) ? ws[0] : null);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pattern(find) {
  const parts = tokens(find).map(escape);
  const src = parts.reduce((s, p, i) => (i === 0 ? p : `${s}\\s*${p}`), '');
  const left = /^[A-Za-z0-9]/.test(find) ? "(^|[^A-Za-z0-9'’])" : '()';
  const right = /[A-Za-z0-9]$/.test(find) ? "(?![A-Za-z0-9'’])" : '';
  return new RegExp(`${left}(${src})${right}`, 'gi');
}

// Keep the case of the first letter: "Hello" -> "Hi", "hello" -> "hi".
function matchCase(found, replace) {
  if (!replace) return replace;
  if (found.toUpperCase() === found && found.length > 1 && /[A-Z]/.test(found)) return replace.toUpperCase();
  if (/^[A-Z]/.test(found)) return replace[0].toUpperCase() + replace.slice(1);
  if (/^[a-z]/.test(found) && /^[A-Z][a-z]/.test(replace) && !/^I\b/.test(replace)) return replace[0].toLowerCase() + replace.slice(1);
  return replace;
}

export function applyRules(text, rules) {
  let out = String(text ?? '');
  let count = 0;
  const used = [];
  for (const r of rules) {
    if (r.on === false || !r.find) continue;
    let n = 0;
    out = out.replace(pattern(r.find), (m, pre, found) => { n++; return pre + matchCase(found, r.replace); });
    if (n) { count += n; used.push({ id: r.id, find: r.find, replace: r.replace, times: n }); }
  }
  // tidy spaces left by deletions
  out = out.replace(/ {2,}/g, ' ').replace(/ +([.,!?;:])/g, '$1').replace(/^ +| +$/gm, '');
  return { text: out, count, used };
}

const same = (x, y) => tokens(x).map(norm).join(' ') === tokens(y).map(norm).join(' ');

// Proof on the examples: each start, rewritten by the rules, must give its finish.
export function proveRules(rules, pairs) {
  const results = pairs.map(([start, finish]) => {
    const got = applyRules(start, rules).text;
    return { start, finish, got, ok: same(got, finish) };
  });
  return { ok: results.every((r) => r.ok), passed: results.filter((r) => r.ok).length, total: results.length, results };
}

// A saved rule set is a Lucian Office document of app "authorer".
export function ruleSetBlocks(rules) {
  return rules.map((r) => ({ type: 'rule', text: `${r.find} → ${r.replace || '(delete)'}`, find: r.find, replace: r.replace, on: r.on !== false, count: r.count ?? 1 }));
}
export function rulesFromBlocks(blocks) {
  return blocks.filter((b) => b.type === 'rule').map((b, i) => ({ id: `r${i + 1}`, find: b.find, replace: b.replace, on: b.on !== false, count: b.count ?? 1 }));
}

// Example pairs as text: "start => finish", one per line.
export function parsePairs(text) {
  return String(text ?? '').split('\n').map((l) => l.split(/\s*(?:=>|→)\s*/)).filter((p) => p.length === 2 && p[0].trim() && p[1].trim()).map(([a, b]) => [a.trim(), b.trim()]);
}

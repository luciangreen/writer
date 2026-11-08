// Rich text for Writer blocks: a small, safe subset of HTML (bold, italic, underline,
// links and line breaks). Everything else is reduced to its text. Works without a DOM, so
// it is tested in Node and used the same way in the browser.
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'a']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const decode = (s) => String(s ?? '').replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e.toLowerCase()] ?? m;
});

export function sanitize(html) {
  const out = [];
  const open = [];
  const re = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(String(html ?? '')))) {
    if (m[3] !== undefined) { out.push(escapeHtml(decode(m[3]))); continue; }
    if (m[4]) { out.push('&lt;'); continue; }
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    if (tag === 'div' || tag === 'p') { if (!closing && out.length) out.push('<br>'); continue; }
    if (!ALLOWED.has(tag)) continue;
    const t = tag === 'strong' ? 'b' : tag === 'em' ? 'i' : tag;
    if (t === 'br') { out.push('<br>'); continue; }
    if (closing) {
      const i = open.lastIndexOf(t);
      if (i < 0) continue;
      while (open.length > i) out.push(`</${open.pop()}>`);
      continue;
    }
    if (t === 'a') {
      const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(m[2]);
      const url = decode(href?.[1] ?? href?.[2] ?? '');
      if (!/^(https?:|mailto:)/i.test(url)) continue;
      out.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">`);
    } else out.push(`<${t}>`);
    open.push(t);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('').replace(/(<br>)+$/, '');
}

export const textOf = (html) => decode(String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).replace(/ /g, ' ');

// A block's HTML: its own if it has some, else its text escaped.
export const htmlOf = (block) => (block.html !== undefined ? block.html : escapeHtml(block.text ?? '').replace(/\n/g, '<br>'));

// Plain text and Markdown exports.
export function toText(doc) {
  return doc.blocks.filter((b) => !b.deleted).map((b) => b.text ?? '').join('\n\n') + '\n';
}
export function toMarkdown(doc) {
  const md = (b) => String(htmlOf(b)).replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<i>(.*?)<\/i>/g, '*$1*').replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)').replace(/<br>/g, '  \n').replace(/<[^>]*>/g, '');
  const lines = [`# ${doc.title}`, ''];
  for (const b of doc.blocks) {
    if (b.deleted) continue;
    const text = decode(md(b));
    if (b.type === 'heading') lines.push(`${'#'.repeat(Math.min(6, (b.level ?? 2)))} ${text}`, '');
    else if (b.type === 'inspiration') lines.push(`> ${text}`, '');
    else lines.push(text, '');
  }
  if (Object.keys(doc.data).some((k) => !k.startsWith('_'))) {
    lines.push('## Data', '');
    for (const [k, v] of Object.entries(doc.data)) if (!k.startsWith('_')) lines.push(`- **${k}**: ${v}`);
    lines.push('');
  }
  if (doc.opinion) lines.push('## Opinion', '', doc.opinion, '');
  return lines.join('\n');
}

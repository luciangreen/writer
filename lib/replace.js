// Find and replace whole words, keeping the case of the first letter ("Good" -> "Great").
// (Learned rule sets come from the Chatbot App Authorer plug-in, when it is installed.)
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matchCase(found, replace) {
  if (!replace) return replace;
  if (found.toUpperCase() === found && found.length > 1 && /[A-Z]/.test(found)) return replace.toUpperCase();
  if (/^[A-Z]/.test(found)) return replace[0].toUpperCase() + replace.slice(1);
  if (/^[a-z]/.test(found) && /^[A-Z][a-z]/.test(replace) && !/^I\b/.test(replace)) return replace[0].toLowerCase() + replace.slice(1);
  return replace;
}
export function replaceWords(text, find, replace) {
  if (!find) return { text, count: 0 };
  const src = find.trim().split(/\s+/).map(escape).join('\\s+');
  const left = /^[A-Za-z0-9]/.test(find) ? "(^|[^A-Za-z0-9'’])" : '()';
  const right = /[A-Za-z0-9]$/.test(find) ? "(?![A-Za-z0-9'’])" : '';
  let count = 0;
  const out = String(text ?? '').replace(new RegExp(`${left}(${src})${right}`, 'gi'), (m, pre, found) => { count++; return pre + matchCase(found, replace); })
    .replace(/ {2,}/g, ' ').replace(/ +([.,!?;:])/g, '$1');
  return { text: out, count };
}

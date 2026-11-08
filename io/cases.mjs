// The functions whose inputs and outputs are recorded in io/ios.txt (see io/engine.mjs).
import { diff, tokens } from '../lib/diff.js';
import { replaceWords } from '../lib/replace.js';
import { sanitize, escapeHtml, toMarkdown, toText } from '../lib/rich.js';
import { createDocument } from '../lib/core.js';

export const title = 'Writer';

const edit = (rnd, s) => {
  const w = s.split(' ');
  for (let k = 0; k < rnd.int(1, 3); k++) {
    const i = rnd.int(0, w.length - 1);
    const what = rnd.int(0, 2);
    if (what === 0) w[i] = rnd.pick(['big', 'quiet', 'logic', 'garden', 'ran']);
    else if (what === 1) w.splice(i, 1);
    else w.splice(i, 0, rnd.pick(['very', 'not', 'also']));
  }
  return w.join(' ');
};
const TAGS = ['<b>bold</b>', '<i>it</i>', '<script>alert(1)</script>', '<a href="javascript:x">link</a>', '<a href="https://example.com">site</a>', '<p onclick="x()">para</p>', '<img src=x onerror=y>', '<u>under</u>', '<span style="color:red">red</span>'];
const doc = (rnd) => createDocument({ app: 'writer', title: rnd.words(1, 3), blocks: Array.from({ length: rnd.int(1, 4) }, (_, i) => ({ id: `b${i}`, type: rnd.pick(['heading', 'paragraph', 'paragraph', 'list']), level: 2, text: rnd.sentence(), items: [rnd.words(1, 3), rnd.words(1, 3)] })) });

export const cases = [
  { name: 'diff', run: diff, make: (rnd) => { const a = rnd.sentence(); return [a, edit(rnd, a)]; } },
  { name: 'tokens', run: tokens, make: (rnd) => [rnd.sentence() + rnd.pick(['', ' "Quoted," she said.', ' It\'s 3.5 km.'])] },
  { name: 'replaceWords', run: replaceWords, make: (rnd) => { const s = Array.from({ length: rnd.int(1, 3) }, () => rnd.sentence()).join(' '); const w = s.split(/\W+/).filter(Boolean); return [s, rnd.chance(0.5) ? rnd.pick(w) : rnd.pick(w).toLowerCase(), rnd.pick(['idea', 'Thought', 'leaf', 'river'])]; } },
  { name: 'sanitize', run: sanitize, make: (rnd) => [rnd.some(TAGS, 1, 3).join(' ') + ' ' + rnd.words(1, 4)] },
  { name: 'escapeHtml', run: escapeHtml, make: (rnd) => [rnd.words(1, 3) + rnd.pick([' < ', ' & ', ' "q" ', " 'a' ", ' > ']) + rnd.words(1, 3)] },
  { name: 'toMarkdown', run: (title, blocks) => toMarkdown(createDocument({ app: 'writer', title, blocks })), make: (rnd) => { const d = doc(rnd); return [d.title, d.blocks]; } },
  { name: 'toText', run: (title, blocks) => toText(createDocument({ app: 'writer', title, blocks })), make: (rnd) => { const d = doc(rnd); return [d.title, d.blocks]; } }
];

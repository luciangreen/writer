// GL Inspire: inspiring keywords and new directions for a text.
// Grammar Logic (your Prolog algorithm, run as a LucianOS job) and your own inputs (a bio,
// your recent texts) supply candidate words. Each candidate is scored in the open:
//   new        words not yet in the text score higher, and rarer ones higher still
//   connected  it appears beside words already in the text (in your bio, recent texts or GL's output)
//   positive   it is a positive word (negative words lose a point)
//   links      it appears beside other new candidates, so it opens a direction rather than a dead end
// score = 2 x connected + 1.5 x links + positive + new. Nothing here calls Claude.

export const STOP = new Set(`a about above after again against all am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had
hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if
in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours
ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them
themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we
we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would
wouldn't you you'd you'll you're you've your yours yourself yourselves also just like get got make made will one two us may much
many said says thing things way well really even still back go going went come came comes new use used using see seen know knew want
write writes wrote give gives gave take takes took put puts keep keeps tell tells told feel feels felt`
  .split(/\s+/));

export const POSITIVE = new Set(`good great happy joy love kind help helpful care caring calm peace peaceful bright clear clever create
creative growth grow gain gift grateful gratitude hope hopeful health healthy heal inspire inspiring learn learning light lively
meaning meaningful natural nice open optimal positive progress prosper prosperity pure quality relax rest rich safe success successful
strong strength support thrive true trust truth value valuable warm wealth well wellbeing wise wisdom wonder wonderful achieve
achievement balance beauty beautiful benefit best better bliss brave bold celebrate cheer comfort confident connect connection
courage delight discover discovery dream energy enjoy excellent fair free freedom fresh friend friendly fun generous gentle glad
harmony honest imagine improve innovation insight joyful laugh lead leader logic logical lucky master meditation mindful music
nurture original passion patience perfect pleasure polite powerful praise proud reason reasoning respect reward secure share
skill smile smart solution solve spirit spiritual study succeed sun teach teacher together understand unique vision vital win`
  .split(/\s+/));

export const NEGATIVE = new Set(`bad sad hate angry anger fear afraid pain hurt harm sick ill lose loss lost fail failure poor weak
wrong worse worst ugly cruel danger dangerous dark death die dead dirty evil fault guilt hard hopeless lonely mess miserable
negative problem risk ruin stress stupid terrible threat tired trouble useless war worry broken boring cold crisis damage
disaster doubt enemy grief hostile`.split(/\s+/));

export const words = (text) => (String(text ?? '').toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) ?? []).map((w) => w.replace(/'s$/, ''));
const sentences = (text) => String(text ?? '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const content = (w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w);
const stem = (w) => w.replace(/(ing|ings|ed|es|s|ly|er|ers|ment|ments|ness|ful|ity|ies)$/, '').slice(0, 7);

// Sources: { text, bio, recent: [texts], gl: [words in order] }.
// Options: { count, focus: word to lean towards, positiveOnly, sources: ['bio','recent','gl'] }.
export function inspire({ text = '', bio = '', recent = [], gl = [] } = {}, { count = 8, focus = null, positiveOnly = false, sources = ['bio', 'recent', 'gl'] } = {}) {
  const textWords = words(text);
  const inText = new Set(textWords.filter(content));
  const inTextStems = new Set([...inText].map(stem));
  // contexts: groups of words that appear together (sentences; GL's output in windows of 6)
  const contexts = [];
  if (sources.includes('bio')) for (const s of sentences(bio)) contexts.push({ from: 'bio', words: words(s).filter(content) });
  if (sources.includes('recent')) for (const t of recent) for (const s of sentences(t)) contexts.push({ from: 'recent', words: words(s).filter(content) });
  const glWords = sources.includes('gl') ? gl.flatMap(words).filter(content) : [];
  for (let i = 0; i < glWords.length; i += 3) contexts.push({ from: 'gl', words: glWords.slice(i, i + 6) });
  for (const s of sentences(text)) contexts.push({ from: 'text', words: words(s).filter(content) });

  const freq = new Map();
  for (const c of contexts) if (c.from !== 'text') for (const w of c.words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const candidates = [...freq.keys()].filter((w) => !inText.has(w) && !inTextStems.has(stem(w)));
  const candidateSet = new Set(candidates);

  const scored = candidates.map((w) => {
    const connectedTo = new Set(), linkedTo = new Set(), from = new Set();
    for (const c of contexts) {
      if (!c.words.includes(w)) continue;
      if (c.from !== 'text') from.add(c.from);
      for (const o of c.words) {
        if (o === w) continue;
        if (inText.has(o)) connectedTo.add(o);
        else if (candidateSet.has(o)) linkedTo.add(o);
      }
    }
    // shared stems with the text count as connections too ("teaching" and "teacher")
    for (const t of inText) if (stem(t).length >= 4 && stem(t) === stem(w).slice(0, stem(t).length)) connectedTo.add(t);
    const positive = POSITIVE.has(w) ? 1 : NEGATIVE.has(w) ? -1 : 0;
    const novelty = Math.round((1 / freq.get(w)) * 100) / 100;
    const connected = Math.min(connectedTo.size, 5);
    const links = Math.min(linkedTo.size, 5);
    const focusBoost = focus && (connectedTo.has(focus) || linkedTo.has(focus) || stem(w) === stem(focus)) ? 3 : 0;
    const score = Math.round((2 * connected + 1.5 * links + positive + novelty + focusBoost) * 100) / 100;
    const strongest = (set) => [...set].sort((a, b) => (POSITIVE.has(b) - POSITIVE.has(a)) || ((freq.get(b) ?? 0) - (freq.get(a) ?? 0)) || a.localeCompare(b));
    return { word: w, score, parts: { new: novelty, connected: strongest(connectedTo).slice(0, 5), positive, links: strongest(linkedTo).slice(0, 5), focus: focusBoost > 0 }, from: [...from] };
  });
  const chosen = scored
    .filter((s) => !positiveOnly || s.parts.positive > 0)
    .filter((s) => s.parts.positive >= 0)
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, count);
  return chosen.map((s, i) => ({ ...s, direction: direction(s, i), why: why(s) }));
}

const cap = (w) => w[0].toUpperCase() + w.slice(1);

// A new direction from the word's connections, in one of a few plain forms.
function direction(s, i) {
  const c = s.parts.connected[0], l = s.parts.links[0];
  if (c && l) return [`Connect ${c} to ${s.word}, then follow it to ${l}.`, `What does ${s.word} add to ${c}? It also leads to ${l}.`, `Write about ${c} through ${s.word} and ${l}.`][i % 3];
  if (c) return [`How does ${s.word} change ${c}?`, `Bring ${s.word} into what you say about ${c}.`][i % 2];
  if (l) return [`${cap(s.word)} and ${l} could open a new section.`, `Start a paragraph on ${s.word}, leading to ${l}.`][i % 2];
  return `${cap(s.word)}: a new direction to explore.`;
}

function why(s) {
  const p = s.parts;
  const bits = [`new (${p.new})`];
  if (p.connected.length) bits.push(`beside ${p.connected.join(', ')} in the text (+${2 * Math.min(p.connected.length, 5)})`);
  if (p.links.length) bits.push(`links to new words ${p.links.join(', ')} (+${1.5 * Math.min(p.links.length, 5)})`);
  if (p.positive) bits.push(p.positive > 0 ? 'positive (+1)' : 'negative (-1)');
  if (p.focus) bits.push('near your focus (+3)');
  return `${s.word}: ${s.score} = ${bits.join(', ')}; from ${s.from.join(', ') || 'the text'}`;
}

// The instruction field: "more about health", "only positive", "fewer", "just from my bio".
export function readInstruction(text, options = {}) {
  const t = String(text ?? '').toLowerCase().trim();
  const o = { ...options };
  let m;
  if ((m = /(?:more |)(?:about|on|towards|around)\s+([a-z][a-z'-]*)/.exec(t))) o.focus = m[1];
  if (/only positive|positive only|just positive|more positive/.test(t)) o.positiveOnly = true;
  if ((m = /(\d+)\s*(?:words|ideas|inspirations)?/.exec(t))) o.count = Math.max(1, Math.min(30, Number(m[1])));
  else if (/\bfewer\b|\bless\b/.test(t)) o.count = Math.max(2, Math.round((o.count ?? 8) / 2));
  else if (/\bmore\b(?! about| on| positive)/.test(t)) o.count = Math.min(30, (o.count ?? 8) * 2);
  const only = [];
  if (/\bbio\b/.test(t) && /\b(only|just|from)\b/.test(t)) only.push('bio');
  if (/\brecent\b|\bmy texts\b/.test(t) && /\b(only|just|from)\b/.test(t)) only.push('recent');
  if (/\bgrammar logic\b|\bgl\b/.test(t) && /\b(only|just|from)\b/.test(t)) only.push('gl');
  if (only.length) o.sources = only;
  return o;
}

// The labelled prompt for Claude, built only from the inputs you switched on.
export function claudePrompt({ text, bio, recent }, send = {}, instruction = '') {
  const parts = [];
  if (send.text && text) parts.push(`Text so far:\n${text}`);
  if (send.bio && bio) parts.push(`Author's bio:\n${bio}`);
  if (send.recent && recent?.length) parts.push(`Author's recent texts:\n${recent.join('\n---\n')}`);
  if (!parts.length) return null;
  return `${parts.join('\n\n')}\n\nSuggest 8 inspiring keywords that are new, connected to the text and positive, each with a one-line new direction.${instruction ? ` ${instruction}` : ''}`;
}

export const inspirationBlocks = (list) => list.map((s) => ({ type: 'inspiration', text: `${s.word}: ${s.direction}`, word: s.word, why: s.why }));

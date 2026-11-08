// Writer (Lucian Office, Phase 2): a rich text editor with Converter drafts, year levels,
// Data and Opinion sections, track changes, the character's undoable edits, GL Inspire and
// the Chatbot App Authorer.
import { api } from '/shared/api.js';
import {
  YEAR_LEVELS, apply, changeLog, characterHandler, convert, createDocument, createPlugins, deserialise, measure,
  redo, serialise, toProlog, undo, undoLastBy
} from './lib/core.js';
import { writerCommands } from './lib/commands.js';
import { claudePrompt, inspirationBlocks, inspire, readInstruction, words } from './lib/inspire.js';
import { applyRules, learnRules, parsePairs, proveRules, ruleSetBlocks, rulesFromBlocks } from './lib/authorer.js';
import { escapeHtml, htmlOf, sanitize, textOf, toMarkdown, toText } from './lib/rich.js';
import { acceptOps, changeCount, isTracking, rejectOps, review, startTracking, stopTracking, trackOps } from './lib/track.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

let doc = newDoc();
let settings = { yearLevel: 'pg', savePath: '', bio: '', recentFolder: '', send: { text: false, bio: false, recent: false }, useGL: true, ruleSets: {}, examples: '' };
let tool = 'inspire';
let lastDraft = null;
let lastInspiration = [];
let learned = null;
let renderedSeq = -1;
const TOOLS = [['inspire', 'GL Inspire'], ['authorer', 'Authorer'], ['review', 'Review'], ['changes', 'Changes']];

function newDoc() {
  return createDocument({ app: 'writer', title: 'Untitled', blocks: [{ type: 'description', text: '' }, { type: 'paragraph', text: '', html: '' }] });
}
const description = () => doc.blocks.find((b) => b.type === 'description');
const visible = () => doc.blocks.filter((b) => b.type !== 'description' && !b.deleted);
const textSoFar = () => visible().filter((b) => b.type !== 'inspiration').map((b) => b.text).join('\n');
const persist = () => {
  api.state.set('writer', settings).catch(() => {});
  api.state.set('writer-doc', doc).catch(() => {});
};

function change(ops, by = 'user', label = '') {
  const tracked = trackOps(doc, ops);
  if (!tracked.length) return;
  doc = apply(doc, tracked, { by, label });
  persist();
}

// ------------------------------------------------------------------ the editor
const TAG = { paragraph: 'p', heading: 'h2', inspiration: 'blockquote' };

function render() {
  const ed = $('editor');
  ed.replaceChildren(...visible().map((b) => {
    const n = document.createElement(TAG[b.type] ?? 'p');
    n.dataset.id = b.id;
    if (b.type === 'inspiration') { n.className = 'inspiration'; n.title = b.why ?? 'From GL Inspire'; }
    n.innerHTML = htmlOf(b) || '<br>';
    return n;
  }));
  renderedSeq = doc.seq;
  $('title').value = doc.title;
  $('opinion').value = doc.opinion;
  $('describe').value = description()?.text ?? '';
  $('track').checked = isTracking(doc);
  renderData();
  renderCounts();
  if (tool !== 'authorer') renderTool();
}

function renderCounts() {
  const m = measure(textSoFar(), settings.yearLevel);
  const n = changeCount(doc);
  $('counts').textContent = `${words(textSoFar()).length} words · ${m.level.label}: ${m.problems ? `${m.problems} to fix` : 'fits'}${isTracking(doc) ? ` · ${n} change${n === 1 ? '' : 's'} to review` : ''}`;
}

// Reads the editor back into ops: changed text, new blocks (from Enter), removed blocks.
let pending = null;
function scheduleSync() { clearTimeout(pending); pending = setTimeout(sync, 900); }
function sync() {
  clearTimeout(pending);
  pending = null;
  const ed = $('editor');
  const seen = new Set();
  const ops = [];
  const known = new Map(visible().map((b) => [b.id, b]));
  let at = 0;
  const order = [];
  for (const node of [...ed.childNodes]) {
    let n = node;
    if (n.nodeType === 3) { // stray text typed at the top level
      if (!n.textContent.trim()) continue;
      const p = document.createElement('p');
      ed.replaceChild(p, n);
      p.append(n);
      n = p;
    }
    if (n.nodeType !== 1) continue;
    let id = n.dataset.id;
    if (!id || seen.has(id) || !known.has(id)) { id = undefined; delete n.dataset.id; }
    const html = sanitize(n.innerHTML).replace(/^<br>$/, '');
    const text = textOf(html);
    const type = n.tagName === 'H2' || n.tagName === 'H1' || n.tagName === 'H3' ? 'heading' : n.tagName === 'BLOCKQUOTE' ? 'inspiration' : 'paragraph';
    if (!id) {
      const block = { type, text, html };
      ops.push({ op: 'insert', at: docIndexAfter(order[order.length - 1]), block });
      // give the element its new id once applied
      block.id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      n.dataset.id = block.id;
      seen.add(block.id);
      order.push(block.id);
    } else {
      seen.add(id);
      order.push(id);
      const b = known.get(id);
      if ((b.html ?? escapeHtml(b.text ?? '')) !== html || (b.text ?? '') !== text) ops.push({ op: 'set', id, key: 'text', value: text }, { op: 'set', id, key: 'html', value: html });
      if (b.type !== type) ops.push({ op: 'set', id, key: 'type', value: type });
    }
    at++;
  }
  for (const b of visible()) if (!seen.has(b.id)) ops.push({ op: 'delete', id: b.id });
  if (!ops.length) return;
  const wasSeq = doc.seq;
  change(ops, 'user', 'typed');
  if (renderedSeq === wasSeq) renderedSeq = doc.seq;
  // a deletion while tracking keeps the block (marked): show the document as it now is
  if (isTracking(doc) && ops.some((o) => o.op === 'delete')) render(); else renderCounts();
  if (tool === 'review' || tool === 'changes') renderTool();
}
function docIndexAfter(id) {
  if (!id) return doc.blocks.findIndex((b) => b.type !== 'description') < 0 ? doc.blocks.length : doc.blocks.findIndex((b) => b.type !== 'description');
  const i = doc.blocks.findIndex((b) => b.id === id);
  return i < 0 ? doc.blocks.length : i + 1;
}

function currentBlockId() {
  const sel = getSelection();
  let n = sel?.anchorNode;
  while (n && n !== $('editor')) { if (n.nodeType === 1 && n.dataset?.id) return n.dataset.id; n = n.parentNode; }
  return null;
}

// ------------------------------------------------------------------ Data, Opinion, drafting
function renderData() {
  const box = $('data');
  box.replaceChildren();
  for (const [k, v] of Object.entries(doc.data)) {
    if (k.startsWith('_')) continue;
    const key = el('input', { type: 'text', value: k, className: 'k', 'aria-label': 'Data name' });
    const val = el('input', { type: 'text', value: v, className: 'v', 'aria-label': `Value of ${k}` });
    const save = () => {
      const ops = key.value.trim() && key.value.trim() !== k ? [{ op: 'data', key: k, value: undefined }] : [];
      ops.push({ op: 'data', key: key.value.trim() || k, value: val.value });
      change(ops, 'user', `changed Data: ${k}`);
      renderData();
    };
    key.onchange = save;
    val.onchange = save;
    box.append(el('div', { className: 'datarow' }, key, val, el('button', { className: 'small', textContent: '✕', title: `Remove ${k}`, onclick: () => { change([{ op: 'data', key: k, value: undefined }], 'user', `removed Data: ${k}`); renderData(); } })));
  }
}

// The Converter's draft: proved text at the year level replaces the document's text.
function draftOps(d) {
  const text = description()?.text ?? '';
  if (!text.trim()) return { doc: d, say: 'Describe it on the left first.' };
  const data = Object.fromEntries(Object.entries(d.data).filter(([k]) => !k.startsWith('_')));
  lastDraft = convert(text, { data, yearLevel: settings.yearLevel });
  const paragraphs = lastDraft.readable.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  // facts, rules and questions as three paragraphs, like Writer's format
  const groups = lastDraft.formats.writer.blocks.length ? groupReadable(paragraphs) : paragraphs;
  const ops = [
    ...visible().map((b) => ({ op: 'delete', id: b.id })),
    ...groups.map((t, i) => ({ op: 'insert', at: d.blocks.length + i, block: { type: 'paragraph', text: t, html: escapeHtml(t) } })),
    ...Object.entries(lastDraft.formats.writer.data).filter(([k]) => d.data[k] === undefined).map(([k, v]) => ({ op: 'data', key: k, value: v }))
  ];
  renderDraftStatus();
  return { ops, say: lastDraft.proof.ok ? 'Drafted, and the draft is proved to say what you described.' : 'Drafted, but it is not proved yet: see the questions on the left.' };
}
function groupReadable(sentences) {
  const rules = [], facts = [], questions = [];
  for (const s of sentences) (/\?$/.test(s) ? questions : / if |^Every |^The (total|average|maximum|minimum|number) /.test(s) ? rules : facts).push(s);
  return [facts.join(' '), rules.join(' '), questions.join(' ')].filter(Boolean);
}

function renderDraftStatus() {
  const st = $('draftStatus');
  const box = $('questions');
  box.replaceChildren();
  if (!lastDraft) { st.textContent = ''; return; }
  st.textContent = lastDraft.proof.ok ? 'Proved ✓' : 'Not proved yet';
  st.className = `status ${lastDraft.proof.ok ? 'ok' : 'error'}`;
  const p = lastDraft.program;
  for (const q of p.questions) {
    if (q.key === 'more' || q.key.startsWith('rephrase:') || q.key.startsWith('define:')) { box.append(el('p', { className: 'question quiet' }, q.ask)); continue; }
    const input = el('input', { type: 'text', inputMode: 'decimal', value: doc.data[q.key] ?? '', 'aria-label': q.ask });
    box.append(el('form', { className: 'question', onsubmit: (e) => { e.preventDefault(); change([{ op: 'data', key: q.key, value: input.value.trim() || undefined }], 'user', `answered: ${q.key}`); doDraft(); } },
      el('label', {}, q.ask, ' ', input), el('button', { textContent: 'Answer' })));
  }
  const failing = lastDraft.proof.checks.filter((c) => !c.ok);
  if (failing.length) box.append(el('p', { className: 'bad' }, `These examples don't fit the definition: ${failing.map((c) => `"${c.sentence}"`).join(', ')}.`));
  if (p.leftOut.length) box.append(el('details', {}, el('summary', {}, `${p.leftOut.length} sentence${p.leftOut.length === 1 ? '' : 's'} left out`), el('ul', {}, p.leftOut.map((l) => el('li', {}, `"${l.sentence}": ${l.reason}`)))));
}

function doDraft() {
  const text = $('describe').value;
  if (text !== (description()?.text ?? '')) change([{ op: 'set', id: description().id, key: 'text', value: text }], 'user', 'edited the description');
  const r = draftOps(doc);
  if (r.ops) change(r.ops, 'user', 'Converter draft');
  render();
}

// ------------------------------------------------------------------ GL Inspire
async function glWords(topic) {
  if (!settings.useGL || !topic) return { words: [], note: settings.useGL ? 'no first word to start Grammar Logic from' : 'Grammar Logic is off' };
  try {
    const { glGoal, DEFAULT_SETTINGS } = await import('/desktop/workflows-lib.js');
    const wf = await api.state.get('workflows').catch(() => null);
    const folders = { ...DEFAULT_SETTINGS, ...(wf?.settings ?? {}) };
    const job = await api.jobs.prolog({ goal: glGoal(topic, folders), cwd: folders.awl, label: `GL Inspire: ${topic}` });
    const out = await new Promise((resolve) => {
      let text = '';
      api.jobs.stream(job.id, { output: (c) => { if (c.stream !== 'stderr') text += c.text; }, end: (s) => resolve({ text, ok: s.exitCode === 0 }) });
    });
    if (!out.ok) return { words: [], note: 'Grammar Logic did not finish (see the jobs list)' };
    return { words: out.text.split('\n').map((s) => s.trim()).filter((s) => /^[\p{L}'-]+$/u.test(s)), note: `Grammar Logic gave ${out.text.split('\n').filter(Boolean).length} words` };
  } catch (err) {
    return { words: [], note: `Grammar Logic is not available: ${err.message}` };
  }
}

async function recentTexts() {
  if (!settings.recentFolder) return [];
  try {
    const { entries } = await api.files.recent(settings.recentFolder, { days: 60, limit: 20 });
    const files = (entries ?? []).filter((e) => /\.(txt|md)$/i.test(e.name ?? e.path)).slice(0, 5);
    return Promise.all(files.map((f) => api.files.read(f.path).then((r) => r.content.slice(0, 6000), () => '')));
  } catch { return []; }
}

const inspirePlugins = createPlugins().register({
  id: 'gl-inspire', name: 'GL Inspire', apps: ['writer'],
  run: ({ options }) => ({ ops: inspirationBlocks(options.list).map((block) => ({ op: 'insert', block })), say: `Added ${options.list.length} inspirations.` })
});

async function runInspire(d, instruction = '') {
  const opts = readInstruction(instruction, { count: 6 });
  const text = textSoFar();
  const first = words(text).find((w) => w.length > 2) ?? words(settings.bio).find((w) => w.length > 3);
  const gl = opts.sources && !opts.sources.includes('gl') ? { words: [], note: '' } : await glWords(first);
  const list = inspire({ text, bio: settings.bio, recent: await recentTexts(), gl: gl.words }, opts);
  lastInspiration = list.map((x) => ({ ...x, note: gl.note }));
  if (!list.length) return { doc: d, say: `I found nothing new to suggest. ${gl.note ?? ''} Add a bio or recent texts in GL Inspire.` };
  const r = await inspirePlugins.run('gl-inspire', d, { options: { list } });
  return { doc: r.doc, say: `${r.say} ${list.slice(0, 3).map((x) => x.word).join(', ')}…` };
}

// ------------------------------------------------------------------ tools panel
function renderTools() {
  $('tabs').replaceChildren(...TOOLS.map(([id, label]) => el('button', { role: 'tab', textContent: label, className: id === tool ? 'on' : '', 'aria-selected': String(id === tool), onclick: () => { tool = id; renderTools(); renderTool(); } })));
}
function renderTool() {
  const box = $('tool');
  box.replaceChildren({ inspire: inspireView, authorer: authorerView, review: reviewView, changes: changesView }[tool]());
}

function inspireView() {
  const src = (key, label, body) => el('section', { className: 'source' },
    el('header', {}, label, el('label', { title: 'Off by default. When on, this input is included if you ask Claude.' },
      el('input', { type: 'checkbox', checked: !!settings.send[key], onchange: (e) => { settings.send[key] = e.target.checked; persist(); renderTool(); } }), ' send to Claude')),
    body);
  const bio = el('textarea', { rows: 3, value: settings.bio, placeholder: 'A few lines about you and your interests.', onchange: (e) => { settings.bio = e.target.value; persist(); } });
  const folder = el('input', { type: 'text', value: settings.recentFolder, placeholder: 'folder of your texts, e.g. Documents/Writing', onchange: (e) => { settings.recentFolder = e.target.value.trim(); persist(); } });
  const instruction = el('input', { type: 'text', placeholder: 'e.g. "more about health", "only positive", "3 ideas"' });
  const out = el('div');
  const showList = () => {
    out.replaceChildren();
    if (!lastInspiration.length) return;
    if (lastInspiration[0].note) out.append(el('p', { className: 'quiet' }, lastInspiration[0].note));
    out.append(el('ol', { className: 'inspirations' }, lastInspiration.map((x) => el('li', {}, el('strong', {}, x.word), ' ', x.direction, el('span', { className: 'why' }, x.why)))));
  };
  showList();
  const anySent = Object.values(settings.send).some(Boolean);
  return el('div', {},
    src('text', 'Text so far', el('p', { className: 'quiet' }, `${words(textSoFar()).length} words, read from the page.`)),
    src('bio', 'Bio', bio),
    src('recent', 'Recent texts', folder),
    el('label', {}, el('input', { type: 'checkbox', checked: settings.useGL, onchange: (e) => { settings.useGL = e.target.checked; persist(); } }), ' Run Grammar Logic on the first word'),
    el('div', { className: 'row' },
      el('button', { className: 'primary', textContent: 'Inspire', onclick: async () => { await sayDo('inspire me'); showList(); } }),
      el('button', { textContent: 'Undo', title: "Undo GL Inspire's last suggestions", onclick: () => { const r = undoLastBy(doc, 'plugin:gl-inspire'); doc = r.doc; persist(); render(); $('reply').textContent = r.undone ? 'Removed the last inspirations.' : r.reason; } })),
    el('form', { className: 'row', onsubmit: async (e) => { e.preventDefault(); await sayDo(`inspire me ${instruction.value}`); showList(); } }, instruction, el('button', { textContent: 'Do' })),
    el('div', { className: 'row' }, el('button', {
      textContent: 'Ask Claude too', disabled: !anySent, title: anySent ? 'Sends only the inputs marked "send to Claude", shown to you first' : 'Mark an input "send to Claude" first (all are off by default)',
      onclick: async () => {
        const prompt = claudePrompt({ text: textSoFar(), bio: settings.bio, recent: await recentTexts() }, settings.send, instruction.value);
        if (!prompt) return;
        try {
          const { askClaude } = await import('/shared/claude.js');
          const reply = await askClaude({ purpose: 'GL Inspire', prompt });
          if (reply) out.append(el('h3', {}, 'From Claude (labelled, not added to the text)'), el('pre', { className: 'output' }, reply));
        } catch (err) { out.append(el('p', { className: 'bad' }, err.message)); }
      }
    })),
    out);
}

function authorerView() {
  const examples = el('textarea', { rows: 6, value: settings.examples, placeholder: 'One example per line: start => finish\nHello, I am pleased to meet you. => Hi, I\'m glad to meet you!' , onchange: (e) => { settings.examples = e.target.value; persist(); } });
  const out = el('div');
  const trial = el('input', { type: 'text', placeholder: 'Try the rules on a sentence' });
  const trialOut = el('p', { className: 'quiet', 'aria-live': 'polite' });
  const name = el('input', { type: 'text', placeholder: 'name, e.g. casual' });
  const showRules = () => {
    out.replaceChildren();
    if (!learned) return;
    const pairs = parsePairs(settings.examples);
    const proof = proveRules(learned, pairs);
    out.append(el('p', { className: proof.ok ? 'ok' : 'bad' }, proof.ok ? `Proved on all ${proof.total} examples ✓` : `${proof.passed} of ${proof.total} examples come out right.`));
    out.append(el('table', { className: 'rules' }, el('tr', {}, el('th', {}, 'On'), el('th', {}, 'Find'), el('th', {}, 'Replace'), el('th', {}, 'Seen')),
      learned.map((r) => el('tr', {},
        el('td', {}, el('input', { type: 'checkbox', checked: r.on, onchange: (e) => { r.on = e.target.checked; showRules(); } })),
        el('td', {}, el('input', { type: 'text', value: r.find, onchange: (e) => { r.find = e.target.value; showRules(); } })),
        el('td', {}, el('input', { type: 'text', value: r.replace, onchange: (e) => { r.replace = e.target.value; showRules(); } })),
        el('td', {}, String(r.count ?? 1))))));
    const bad = proof.results.filter((x) => !x.ok);
    if (bad.length) out.append(el('ul', {}, bad.map((x) => el('li', { className: 'bad' }, `"${x.start}" gives "${x.got}", not "${x.finish}"`))));
  };
  showRules();
  const saved = Object.keys(settings.ruleSets);
  return el('div', {},
    el('p', { className: 'quiet' }, 'Give start and finish examples of a change you want (a "text gradient"). The rules are worked out from them, shown here to edit, and proved on the examples.'),
    examples,
    el('div', { className: 'row' }, el('button', { className: 'primary', textContent: 'Learn rules', onclick: () => { settings.examples = examples.value; persist(); learned = learnRules(parsePairs(examples.value)); showRules(); } })),
    out,
    el('form', { className: 'row', onsubmit: (e) => {
      e.preventDefault();
      if (!learned) return;
      const r = applyRules(trial.value, learned);
      trialOut.textContent = r.text;
      if (parent !== window) parent.postMessage({ type: 'lucianos.say', text: r.text }, location.origin); // watch it in RetroMR
    } }, trial, el('button', { textContent: 'Try' })),
    trialOut,
    el('div', { className: 'row' },
      el('button', { textContent: 'Apply to the document', disabled: !learned, onclick: async () => { await applySet(learned, 'learned rules'); } })),
    el('div', { className: 'row' },
      name,
      el('button', { textContent: 'Save rules', disabled: !learned, onclick: async () => {
        const n = name.value.trim().toLowerCase();
        if (!n) return name.focus();
        settings.ruleSets[n] = ruleSetBlocks(learned);
        persist();
        // also kept in Lucian Office as a document of its own
        const set = createDocument({ app: 'authorer', title: n, blocks: ruleSetBlocks(learned), data: { examples: settings.examples } });
        await api.files.write(`Documents/Lucian Office/Rules/${n}.rules.office.json`, serialise(set), { mkdirs: true, force: true }).catch(() => {});
        $('reply').textContent = `Saved the ${n} rules. Say "apply the ${n} rules".`;
        renderTool();
      } })),
    saved.length ? el('div', {}, el('h3', {}, 'Saved rules'), el('ul', {}, saved.map((n) => el('li', {}, `${n} (${settings.ruleSets[n].length} rules) `,
      el('button', { className: 'small', textContent: 'Apply', onclick: () => sayDo(`apply the ${n} rules`) }),
      el('button', { className: 'small', textContent: 'Edit', onclick: () => { learned = rulesFromBlocks(settings.ruleSets[n]); name.value = n; showRules(); } }))))) : null);
}

const authorerPlugins = createPlugins().register({
  id: 'authorer', name: 'Chatbot App Authorer', apps: ['writer'],
  run: ({ doc: d, options }) => {
    const ops = [];
    for (const b of d.blocks.filter((x) => x.type !== 'description' && !x.deleted)) {
      const r = applyRules(b.text ?? '', options.rules);
      if (r.count) ops.push({ op: 'set', id: b.id, key: 'text', value: r.text }, { op: 'set', id: b.id, key: 'html', value: escapeHtml(r.text) });
    }
    return { ops, label: `applied ${options.name}` };
  }
});
async function applySet(rules, name) {
  sync();
  const r = await authorerPlugins.run('authorer', doc, { options: { rules, name } });
  doc = r.doc;
  persist();
  render();
  $('reply').textContent = r.say;
}

function reviewView() {
  const items = review(doc).filter((r) => r.status !== 'same');
  const head = el('div', { className: 'row' },
    el('label', {}, el('input', { type: 'checkbox', checked: isTracking(doc), onchange: (e) => toggleTrack(e.target.checked) }), ' Track changes'),
    el('button', { textContent: 'Accept all', disabled: !items.length, onclick: () => { change(acceptOps(doc), 'user', 'accepted all changes'); render(); } }),
    el('button', { textContent: 'Reject all', disabled: !items.length, onclick: () => { change(rejectOps(doc), 'user', 'rejected all changes'); render(); } }));
  if (!isTracking(doc)) return el('div', { className: 'review' }, head, el('p', { className: 'quiet' }, 'Turn on Track changes to keep a record of edits to review, accept or reject.'));
  if (!items.length) return el('div', { className: 'review' }, head, el('p', { className: 'quiet' }, 'No changes since tracking began.'));
  return el('div', { className: 'review' }, head, items.map((r) => el('div', { className: 'blk' },
    el('div', { className: 'status quiet' }, r.status),
    el('p', {}, r.parts.map((p) => (p.type === 'ins' ? el('ins', {}, p.text) : p.type === 'del' ? el('del', {}, p.text) : p.text)).flatMap((n, i) => (i ? [' ', n] : [n]))),
    el('div', { className: 'row' },
      el('button', { className: 'small', textContent: 'Accept', onclick: () => { change(acceptOps(doc, r.id), 'user', 'accepted a change'); render(); } }),
      el('button', { className: 'small', textContent: 'Reject', onclick: () => { change(rejectOps(doc, r.id), 'user', 'rejected a change'); render(); } })))));
}

function changesView() {
  const log = changeLog(doc);
  return el('div', {},
    el('div', { className: 'row' },
      el('button', { textContent: "Undo Lucian's last change", disabled: !log.some((e) => e.by === 'character'), onclick: () => { const r = undoLastBy(doc, 'character'); doc = r.doc; persist(); render(); $('reply').textContent = r.undone ? `Undone: ${r.undone.label}` : r.reason; } })),
    log.length ? el('ol', { reversed: true }, log.map((e) => el('li', {}, `${e.by === 'character' ? 'Lucian' : e.by === 'user' ? 'You' : e.by.replace('plugin:', '')}: ${e.label} `,
      el('span', { className: 'quiet' }, `(${e.additions} added, ${e.changes} changed, ${e.deletions} deleted, ${new Date(e.at).toLocaleTimeString()})`)))) : el('p', { className: 'quiet' }, 'No changes yet.'));
}

function toggleTrack(on) {
  sync();
  if (on && !isTracking(doc)) change(startTracking(doc), 'user', 'turned on track changes');
  if (!on && isTracking(doc)) { doc = apply(doc, stopTracking(doc), { by: 'user', label: 'turned off track changes' }); persist(); }
  render();
}

// ------------------------------------------------------------------ the character
const commands = writerCommands();
const ctx = {
  draft: (d) => draftOps(d),
  inspire: (d, instruction) => runInspire(d, instruction),
  ruleSet: (name) => (settings.ruleSets[name.toLowerCase()] ? rulesFromBlocks(settings.ruleSets[name.toLowerCase()]) : null),
  setYear: (id) => { settings.yearLevel = id; $('year').value = id; persist(); }
};
const handle = characterHandler(commands, () => doc, (d) => { doc = d; persist(); render(); }, ctx);

async function sayDo(text) {
  sync();
  const reply = await handle({ intent: 'unknown', text }, text);
  $('reply').textContent = reply ?? `I don't know how to do that in Writer. ${commands.help()}`;
  return reply;
}

$('say').addEventListener('submit', async (e) => { e.preventDefault(); await sayDo($('sayText').value); $('sayText').value = ''; });
addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'lucianos.command') return;
  sync();
  const reply = await handle({ intent: 'unknown', text: e.data.text }, e.data.text);
  e.source.postMessage({ type: 'lucianos.reply', id: e.data.id, text: reply }, location.origin);
});
if (parent !== window) parent.postMessage({ type: 'lucianos.commands', names: commands.list().map((c) => c.name) }, location.origin);

// ------------------------------------------------------------------ files
async function save() {
  sync();
  const path = prompt('Save as (relative to your home folder)', settings.savePath || `Documents/${(doc.title || 'Untitled').replace(/[^\w -]/g, '')}.writer.json`);
  if (!path) return;
  await api.files.write(path, serialise(doc), { mkdirs: true, force: true });
  await api.files.write(path.replace(/\.json$/, '') + '.pl', toProlog(doc), { mkdirs: true, force: true });
  settings.savePath = path;
  persist();
  $('reply').textContent = `Saved ${path}, with its Prolog form beside it.`;
}
async function open(path) {
  path ??= prompt('Open which .writer.json file?', settings.savePath || '');
  if (!path) return;
  try {
    doc = deserialise((await api.files.read(path)).content);
    if (!description()) doc = apply(doc, [{ op: 'insert', at: 0, block: { type: 'description', text: '' } }], { by: 'user', label: 'opened' });
    settings.savePath = path;
    persist();
    render();
  } catch (err) { $('reply').textContent = `Couldn't open it: ${err.message}`; }
}
async function exportAs(kind) {
  sync();
  const base = (settings.savePath || `Documents/${doc.title || 'Untitled'}.writer.json`).replace(/\.writer\.json$|\.json$/, '');
  const path = prompt(`Export as`, `${base}.${kind}`);
  if (!path) return;
  const content = kind === 'txt' ? toText(doc) : kind === 'md' ? toMarkdown(doc) : toProlog(doc);
  await api.files.write(path, content, { mkdirs: true, force: true });
  $('reply').textContent = `Exported ${path}.`;
}

// ------------------------------------------------------------------ start
async function init() {
  $('year').replaceChildren(...YEAR_LEVELS.map((l) => el('option', { value: l.id, textContent: l.label })));
  settings = { ...settings, ...((await api.state.get('writer').catch(() => null)) ?? {}) };
  settings.send = { text: false, bio: false, recent: false, ...(settings.send ?? {}) };
  const saved = await api.state.get('writer-doc').catch(() => null);
  if (saved?.format === 'lucianoffice/1' && saved.app === 'writer') doc = saved;
  const params = new URLSearchParams(location.search);
  if (params.get('describe')) { doc = newDoc(); doc = apply(doc, [{ op: 'set', id: description().id, key: 'text', value: params.get('describe') }], { by: 'user', label: 'described' }); }
  if (params.get('year')) settings.yearLevel = params.get('year');
  if (TOOLS.some(([id]) => id === params.get('tool'))) tool = params.get('tool');
  if (params.get('examples')) settings.examples = params.get('examples');
  $('year').value = settings.yearLevel;
  render();
  renderTools();

  const ed = $('editor');
  ed.addEventListener('input', scheduleSync);
  ed.addEventListener('blur', () => { if (pending) sync(); });
  ed.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? sanitize(html) : escapeHtml(text).replace(/\n/g, '<br>'));
  });
  ed.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); sync(); const r = e.shiftKey ? redo(doc) : undo(doc); doc = r.doc; persist(); render(); }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); sync(); doc = redo(doc).doc; persist(); render(); }
  });
  document.addEventListener('selectionchange', () => {
    const id = currentBlockId();
    const b = id && doc.blocks.find((x) => x.id === id);
    if (b && (b.type === 'paragraph' || b.type === 'heading')) $('blockType').value = b.type;
  });
  for (const btn of document.querySelectorAll('[data-cmd]')) btn.onmousedown = (e) => { e.preventDefault(); document.execCommand(btn.dataset.cmd); scheduleSync(); };
  $('link').onmousedown = (e) => { e.preventDefault(); const url = prompt('Link to (https://…)'); if (url && /^https?:|^mailto:/i.test(url)) { document.execCommand('createLink', false, url); scheduleSync(); } };
  $('blockType').onchange = () => { sync(); const id = currentBlockId(); if (id) { change([{ op: 'set', id, key: 'type', value: $('blockType').value }], 'user', `made it a ${$('blockType').value}`); render(); } };
  $('undo').onclick = () => { sync(); doc = undo(doc).doc; persist(); render(); };
  $('redo').onclick = () => { sync(); doc = redo(doc).doc; persist(); render(); };
  $('track').onchange = (e) => toggleTrack(e.target.checked);
  $('draft').onclick = doDraft;
  $('title').onchange = () => change([{ op: 'title', value: $('title').value.trim() || 'Untitled' }], 'user', 'renamed');
  $('opinion').onchange = () => change([{ op: 'opinion', value: $('opinion').value }], 'user', 'wrote the Opinion');
  $('describe').onchange = () => change([{ op: 'set', id: description().id, key: 'text', value: $('describe').value }], 'user', 'edited the description');
  $('year').onchange = () => { settings.yearLevel = $('year').value; persist(); renderCounts(); };
  $('addData').onclick = () => { const k = prompt('Name (for example "tall")'); if (k) { change([{ op: 'data', key: k.trim().toLowerCase(), value: '' }], 'user', `added Data: ${k}`); renderData(); } };
  $('new').onclick = () => { sync(); if (confirm('Start a new document? The current one stays saved if you saved it.')) { doc = newDoc(); lastDraft = null; settings.savePath = ''; persist(); render(); renderDraftStatus(); } };
  $('save').onclick = save;
  $('open').onclick = () => open();
  $('export').onchange = async (e) => { const k = e.target.value; e.target.value = ''; if (k) await exportAs(k); };
  if (params.get('open')) await open(params.get('open'));
  if (params.get('describe')) doDraft();
  if (params.get('do')) await sayDo(params.get('do'));
  if (tool !== 'inspire') renderTool();
}
init();

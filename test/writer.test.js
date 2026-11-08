import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaceWords } from '../lib/replace.js';
import { acceptOps, isTracking, rejectOps, review, startTracking, stopTracking, trackOps } from '../lib/track.js';
import { sanitize, textOf, toMarkdown, toText } from '../lib/rich.js';
import { writerCommands, levelId } from '../lib/commands.js';
import { apply, createDocument, undoLastBy } from '../lib/core.js';


// GL Inspire and the Chatbot App Authorer are tested in their own repos (glinspire, chatbotappauthor).

test('find and replace keeps the case of the first letter and matches whole words', () => {
  assert.deepEqual(replaceWords('Good food is good. Goodness!', 'good', 'great'), { text: 'Great food is great. Goodness!', count: 2 });
  assert.equal(replaceWords('GOOD', 'good', 'great').text, 'GREAT');
  assert.equal(replaceWords('a very good day', 'very good', 'fine').text, 'a fine day');
  assert.equal(replaceWords('a good  day', 'good', '').text, 'a day');
});

// ------------------------------------------------------------------ track changes
test('track changes: marks, review, accept and reject, all undoable', () => {
  let d = createDocument({ app: 'writer', blocks: [{ id: 'a', type: 'paragraph', text: 'The cat sat.' }, { id: 'b', type: 'paragraph', text: 'Old line.' }] });
  d = apply(d, startTracking(d));
  assert.ok(isTracking(d));
  d = apply(d, trackOps(d, [{ op: 'set', id: 'a', key: 'text', value: 'The black cat sat down.' }, { op: 'delete', id: 'b' }, { op: 'insert', block: { id: 'c', type: 'paragraph', text: 'New line.' } }]));
  assert.equal(d.blocks.length, 3, 'a deletion is only marked');
  const r = review(d);
  assert.deepEqual(r.map((x) => x.status), ['changed', 'deleted', 'inserted']);
  assert.deepEqual(r[0].parts.filter((p) => p.type === 'ins').map((p) => p.text), ['black', 'down']);
  const rejected = apply(d, rejectOps(d));
  assert.deepEqual(rejected.blocks.map((b) => b.text), ['The cat sat.', 'Old line.']);
  const accepted = apply(d, acceptOps(d));
  assert.deepEqual(accepted.blocks.map((b) => b.text), ['The black cat sat down.', 'New line.']);
  assert.ok(review(accepted).every((x) => x.status === 'same'));
  const off = apply(d, stopTracking(d));
  assert.equal(isTracking(off), false);
  assert.deepEqual(off.blocks.map((b) => b.text), ['The black cat sat down.', 'New line.']);
  assert.ok(off.blocks.every((b) => b.accepted === undefined));
});

// ------------------------------------------------------------------ rich text and exports
test('rich text keeps bold, italic, underline and safe links only', () => {
  assert.equal(sanitize('<b>Hi</b> <script>x()</script><i>there</i> <a href="javascript:bad()">no</a> <a href="https://x.org">yes</a><span style="c">s</span>'),
    '<b>Hi</b> x()<i>there</i> no <a href="https://x.org" target="_blank" rel="noopener">yes</a>s');
  assert.equal(sanitize('<strong>a<em>b</strong>'), '<b>a<i>b</i></b>');
  assert.equal(textOf('a &amp; <b>b</b><br>c'), 'a & b\nc');
  const d = createDocument({ title: 'Plan', blocks: [{ type: 'heading', text: 'Intro', level: 2 }, { type: 'paragraph', text: 'Hi', html: '<b>Hi</b> there' }], data: { tall: '175', _track: 'on' }, opinion: 'Good.' });
  const md = toMarkdown(d);
  assert.match(md, /^# Plan\n\n## Intro\n\n\*\*Hi\*\* there/);
  assert.match(md, /- \*\*tall\*\*: 175/);
  assert.ok(!md.includes('_track'));
  assert.equal(toText(d), 'Intro\n\nHi\n');
});

// ------------------------------------------------------------------ commands
test("Writer's commands edit the document as the character, and undo that takes them back", async () => {
  const reg = writerCommands();
  let d = createDocument({ app: 'writer', blocks: [{ type: 'description', text: '' }, { id: 'p1', type: 'paragraph', text: 'Students utilise meditation.' }] });
  let r = await reg.perform('add a paragraph saying meditation helps us focus', d);
  assert.equal(r.doc.blocks.at(-1).text, 'meditation helps us focus.');
  d = r.doc;
  r = await reg.perform('replace meditation with mindfulness', d);
  assert.match(r.say, /Replaced 2 times/);
  d = r.doc;
  r = await reg.perform('make it year 3', d, { ctx: {} });
  assert.equal(r.doc.blocks.find((b) => b.id === 'p1').text, 'Students use mindfulness.');
  assert.equal(r.doc.data['year level'], 'Year 3');
  d = r.doc;
  r = await reg.perform('delete the last paragraph', d);
  assert.equal(r.doc.blocks.length, 2);
  d = apply(r.doc, [{ op: 'title', value: 'Mine' }], { by: 'user' });
  r = await reg.perform('undo that', d);
  assert.equal(r.doc.blocks.length, 3, 'the deletion is undone');
  assert.equal(r.doc.title, 'Mine', "the user's later edit stays");
  assert.equal(levelId('Year 12'), '12');
  assert.equal(levelId('postgraduate'), 'pg');
});

test('commands respect track changes, and use the helpers given for drafting, inspiring and rule sets', async () => {
  const reg = writerCommands();
  let d = createDocument({ app: 'writer', blocks: [{ id: 'p1', type: 'paragraph', text: 'One.' }] });
  d = (await reg.perform('turn on track changes', d)).doc;
  d = (await reg.perform('delete the first paragraph', d)).doc;
  assert.equal(d.blocks[0].deleted, true);
  d = (await reg.perform('reject all changes', d)).doc;
  assert.equal(d.blocks[0].deleted, undefined);
  const ctx = {
    draft: (doc) => ({ ops: [{ op: 'insert', block: { type: 'paragraph', text: 'Drafted.' } }], say: 'Drafted.' }),
    inspire: async (doc, instruction) => ({ doc, say: `inspired ${instruction}` }),
    ruleSet: async (name) => (name === 'casual' ? [{ find: 'One', replace: 'Uno' }] : null),
    applyRules: (text, rules) => { const r = replaceWords(text, rules[0].find, rules[0].replace); return r; }
  };
  assert.equal((await reg.perform('draft it', d, { ctx })).doc.blocks.at(-1).text, 'Drafted.');
  assert.equal((await reg.perform('inspire me more about health', d, { ctx })).say, 'inspired more about health');
  assert.equal((await reg.perform('apply the casual rules', d, { ctx })).doc.blocks[0].text, 'Uno.');
  assert.match((await reg.perform('apply the formal rules', d, { ctx })).say, /don't have rules called formal/);
  // without the Authorer installed
  assert.match((await reg.perform('apply the casual rules', d, { ctx: { ruleSet: ctx.ruleSet } })).say, /Chatbot App Authorer, which is not installed/);
  assert.match((await reg.perform('inspire me', d)).say, /GL Inspire is not available/);
});

test("plug-in edits are recorded as the plug-in's and can be undone alone", async () => {
  const { createPlugins } = await import('../lib/core.js');
  const plugins = createPlugins().register({ id: 'gl-inspire', name: 'GL Inspire', run: ({ options }) => ({ ops: options.blocks.map((block) => ({ op: 'insert', block })) }) });
  const d = createDocument({ blocks: [{ id: 'a', type: 'paragraph', text: 'Text.' }] });
  const r = await plugins.run('gl-inspire', d, { options: { blocks: [{ type: 'inspiration', text: 'music: connect it' }, { type: 'inspiration', text: 'joy: follow it' }] } });
  assert.equal(r.doc.blocks.length, 3);
  assert.equal(undoLastBy(r.doc, 'plugin:gl-inspire').doc.blocks.length, 1);
});

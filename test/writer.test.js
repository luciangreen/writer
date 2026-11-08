import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspire, readInstruction, claudePrompt, inspirationBlocks } from '../lib/inspire.js';
import { applyRules, learnRules, parsePairs, proveRules, ruleSetBlocks, rulesFromBlocks, diff, tokens } from '../lib/authorer.js';
import { acceptOps, isTracking, rejectOps, review, startTracking, stopTracking, trackOps } from '../lib/track.js';
import { sanitize, textOf, toMarkdown, toText } from '../lib/rich.js';
import { writerCommands, levelId } from '../lib/commands.js';
import { apply, createDocument, undoLastBy } from '../lib/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');
const sources = () => ({ text: fixture('essay.txt'), bio: fixture('bio.txt'), recent: [fixture('recent.txt')], gl: ['practice', 'wisdom', 'breathing', 'clarity', 'joy', 'teacher', 'stress'] });

// ------------------------------------------------------------------ GL Inspire
test('GL Inspire scores new, connected, positive, linking words, and explains each score', () => {
  const list = inspire(sources(), { count: 6 });
  assert.equal(list.length, 6);
  const words = list.map((x) => x.word);
  assert.ok(!words.some((w) => /meditation|students|calm/.test(w)), 'words already in the text are not suggested');
  assert.ok(!words.includes('stress') && !words.includes('failure'), 'negative words are not suggested');
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score, 'ranked by score');
  const music = list.find((x) => x.word === 'music');
  assert.ok(music, 'music: beside meditation and students, positive');
  assert.ok(music.parts.connected.includes('meditation'));
  assert.equal(music.parts.positive, 1);
  assert.match(music.why, /^music: [\d.]+ = new/);
  assert.ok(list.every((x) => x.direction.includes(x.word)));
  // the score adds up as described
  const p = music.parts;
  assert.equal(music.score, Math.round((2 * Math.min(p.connected.length, 5) + 1.5 * Math.min(p.links.length, 5) + p.positive + p.new) * 100) / 100);
});

test('GL Inspire follows a focus, a positive-only request and a choice of sources', () => {
  const focused = inspire(sources(), readInstruction('more about health', { count: 4 }));
  assert.ok(focused.some((x) => x.parts.focus));
  assert.equal(focused[0].word, 'health', 'the focus itself comes first');
  assert.ok(focused.filter((x) => x.parts.focus).length >= 3, 'words near the focus rise');
  assert.ok(inspire(sources(), { count: 10, positiveOnly: true }).every((x) => x.parts.positive > 0));
  const glOnly = inspire(sources(), { count: 10, sources: ['gl'] });
  assert.ok(glOnly.every((x) => x.from.includes('gl')));
  assert.deepEqual(readInstruction('3 ideas just from my bio, only positive'), { count: 3, positiveOnly: true, sources: ['bio'] });
  assert.equal(readInstruction('fewer', { count: 8 }).count, 4);
});

test('nothing is prepared for Claude unless an input is switched on, and inputs are labelled', () => {
  const s = sources();
  assert.equal(claudePrompt(s, {}), null);
  const p = claudePrompt(s, { bio: true });
  assert.match(p, /^Author's bio:/);
  assert.ok(!p.includes('Text so far') && !p.includes('recent texts'));
  assert.equal(inspirationBlocks(inspire(s, { count: 2 }))[0].type, 'inspiration');
});

// ------------------------------------------------------------------ Chatbot App Authorer
test('the Authorer learns rules from example pairs, proves them, and applies them to new text', () => {
  const pairs = parsePairs([
    "Hello, I am pleased to meet you. => Hi, I'm glad to meet you!",
    "Hello, I am writing to ask about the job. => Hi, I'm writing to ask about the job!",
    "I am pleased with the result. => I'm glad with the result!"
  ].join('\n'));
  assert.equal(pairs.length, 3);
  const rules = learnRules(pairs);
  assert.deepEqual(rules.map((r) => `${r.find} -> ${r.replace}`), ["I am pleased -> I'm glad", "I am -> I'm", 'Hello -> Hi', '. -> !']);
  assert.equal(rules.find((r) => r.find === 'Hello').count, 2);
  assert.ok(proveRules(rules, pairs).ok);
  assert.equal(applyRules('Hello, I am pleased to see the garden.', rules).text, "Hi, I'm glad to see the garden!");
});

test('rules keep case, delete words, and switch persons', () => {
  const pairs = parsePairs('I will go to the shop. => You will go to the shop.\nI like my dog very much. => You like your dog.');
  const rules = learnRules(pairs);
  assert.ok(proveRules(rules, pairs).ok, JSON.stringify(proveRules(rules, pairs)));
  assert.equal(applyRules('I want my book.', rules).text, 'You want your book.');
  assert.equal(applyRules('hello there', [{ find: 'hello', replace: 'Hi' }]).text, 'hi there');
  assert.equal(applyRules('Hello there', [{ find: 'hello', replace: 'hi' }]).text, 'Hi there');
});

test('a rule that would fire where an example did not change is narrowed with context', () => {
  const pairs = parsePairs('The cat sat on the mat. => The cat sat on the rug.\nThe mat dog ran. => The mat dog ran.');
  const rules = learnRules(pairs);
  assert.ok(proveRules(rules, pairs).ok, JSON.stringify(rules));
  assert.ok(rules[0].find.includes('the mat') || rules[0].find.includes('mat.'), JSON.stringify(rules));
});

test('edited rules can be switched off, and rule sets round-trip as Office blocks', () => {
  const rules = learnRules(parsePairs('good => great'));
  rules[0].on = false;
  assert.equal(applyRules('a good day', rules).text, 'a good day');
  const back = rulesFromBlocks(ruleSetBlocks(rules));
  assert.deepEqual(back.map(({ find, replace, on }) => ({ find, replace, on })), [{ find: 'good', replace: 'great', on: false }]);
  assert.deepEqual(diff(tokens('a b c'), tokens('a x c')).map((d) => d.type), ['same', 'ins', 'del', 'same']);
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
    ruleSet: async (name) => (name === 'casual' ? [{ find: 'One', replace: 'Uno' }] : null)
  };
  assert.equal((await reg.perform('draft it', d, { ctx })).doc.blocks.at(-1).text, 'Drafted.');
  assert.equal((await reg.perform('inspire me more about health', d, { ctx })).say, 'inspired more about health');
  assert.equal((await reg.perform('apply the casual rules', d, { ctx })).doc.blocks[0].text, 'Uno.');
  assert.match((await reg.perform('apply the formal rules', d, { ctx })).say, /don't have rules called formal/);
});

test("plug-in edits are recorded as the plug-in's and can be undone alone", async () => {
  const { createPlugins } = await import('../lib/core.js');
  const plugins = createPlugins().register({ id: 'gl-inspire', name: 'GL Inspire', run: ({ options }) => ({ ops: options.blocks.map((block) => ({ op: 'insert', block })) }) });
  const d = createDocument({ blocks: [{ id: 'a', type: 'paragraph', text: 'Text.' }] });
  const r = await plugins.run('gl-inspire', d, { options: { blocks: inspirationBlocks(inspire(sources(), { count: 2 })) } });
  assert.equal(r.doc.blocks.length, 3);
  assert.equal(undoLastBy(r.doc, 'plugin:gl-inspire').doc.blocks.length, 1);
});

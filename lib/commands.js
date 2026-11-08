// Writer's commands for the RetroMR character (and the "Tell Lucian" box). Each returns
// document ops, applied as one step marked as the character's, so "undo that" takes it back.
// Async helpers (drafting with the Converter, and the GL Inspire and Authorer plug-ins when
// they are installed) come in through ctx.
import { createCommands, level, simplify, YEAR_LEVELS } from './core.js';
import { escapeHtml } from './rich.js';
import { acceptOps, isTracking, rejectOps, startTracking, stopTracking, trackOps } from './track.js';
import { replaceWords } from './replace.js';

const visible = (doc) => doc.blocks.filter((b) => !b.deleted && b.type !== 'description');
const textBlock = (type, text, extra = {}) => ({ type, text, html: escapeHtml(text), ...extra });
const sentence = (s) => { const t = s.trim().replace(/^["“']|["”']$/g, ''); return /[.!?]$/.test(t) ? t : `${t}.`; };
const ordinal = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, last: -1 };
function pick(doc, which) {
  const list = visible(doc);
  const w = String(which).toLowerCase().replace(/^the\s+/, '').replace(/\s*paragraph$/, '');
  const n = ordinal[w] ?? Number(w);
  if (!n) return null;
  return n < 0 ? list[list.length + n] : list[n - 1];
}

export function levelId(said) {
  const id = String(said).toLowerCase().replace(/^year\s*/, '').replace(/undergraduate|uni(versity)?/, 'ug').replace(/postgraduate|postgrad/, 'pg').trim();
  return YEAR_LEVELS.some((l) => l.id === id) ? id : null;
}

export function writerCommands() {
  const reg = createCommands({ app: 'Writer' });
  const t = (doc, ops) => trackOps(doc, ops);
  reg
    .register({
      name: 'add paragraph', patterns: ['add [a] paragraph saying {text}', 'write {text}', 'add the sentence {text}'], help: 'add a paragraph saying ...',
      run: ({ args, doc }) => ({ ops: t(doc, [{ op: 'insert', block: textBlock('paragraph', sentence(args.text)) }]), say: 'Added a paragraph.' })
    })
    .register({
      name: 'add heading', patterns: ['add [a] heading {text}', 'add [a] title {text}'],
      run: ({ args, doc }) => ({ ops: t(doc, [{ op: 'insert', block: textBlock('heading', args.text.replace(/^["“']|["”']$/g, ''), { level: 2 }) }]), say: 'Added a heading.' })
    })
    .register({
      name: 'delete paragraph', patterns: ['delete [the] {which} paragraph', 'delete paragraph {which}', 'remove [the] {which} paragraph'], help: 'delete the last paragraph',
      run: ({ args, doc }) => {
        const b = pick(doc, args.which);
        if (!b) return { doc, say: `I can't find the ${args.which} paragraph.` };
        return { ops: t(doc, [{ op: 'delete', id: b.id }]), say: `Deleted "${(b.text ?? '').slice(0, 40)}${(b.text ?? '').length > 40 ? '…' : ''}".` };
      }
    })
    .register({
      name: 'replace', patterns: ['replace {find} with {replace}', 'change {find} to {replace}'], help: 'replace good with great',
      run: ({ args, doc }) => {
        const find = args.find.replace(/^["“']|["”']$/g, ''), replace = args.replace.replace(/^["“']|["”']$/g, '');
        const ops = [];
        let n = 0;
        for (const b of visible(doc)) {
          const r = replaceWords(b.text ?? '', find, replace);
          if (r.count) { n += r.count; ops.push({ op: 'set', id: b.id, key: 'text', value: r.text }, { op: 'set', id: b.id, key: 'html', value: escapeHtml(r.text) }); }
        }
        return n ? { ops, say: `Replaced ${n} time${n === 1 ? '' : 's'}.` } : { doc, say: `I couldn't find "${find}".` };
      }
    })
    .register({
      name: 'year level', patterns: ['make it {level} level', 'make it year {level}', 'rewrite it for year {level}', 'set [the] year level to {level}'], help: 'make it year 5',
      run: ({ args, doc, ctx }) => {
        const id = levelId(args.level);
        if (!id) return { doc, say: 'Say a year from 1 to 12, undergraduate or postgraduate.' };
        ctx.setYear?.(id);
        const ops = [];
        let changes = 0;
        for (const b of visible(doc)) {
          if (b.type !== 'paragraph') continue;
          const s = simplify(b.text ?? '', id);
          const real = s.changes.filter((c) => c.from !== c.to);
          if (real.length && s.text !== b.text) { changes += real.length; ops.push({ op: 'set', id: b.id, key: 'text', value: s.text }, { op: 'set', id: b.id, key: 'html', value: escapeHtml(s.text) }); }
        }
        ops.push({ op: 'data', key: 'year level', value: level(id).label });
        return { ops, say: changes ? `Rewritten for ${level(id).label}: ${changes} change${changes === 1 ? '' : 's'}.` : `It already suits ${level(id).label}.` };
      }
    })
    .register({ name: 'draft', patterns: ['draft it', 'draft', 'convert', 'convert it', 'make a draft'], help: 'draft it', run: async ({ doc, ctx }) => (ctx.draft ? ctx.draft(doc) : { doc, say: 'Drafting is not available here.' }) })
    .register({ name: 'inspire', patterns: ['inspire me', 'inspire', 'give me ideas', 'inspire me {instruction}'], help: 'inspire me', run: async ({ args, doc, ctx }) => (ctx.inspire ? ctx.inspire(doc, args.instruction ?? '') : { doc, say: 'GL Inspire is not available here.' }) })
    .register({
      name: 'apply rules', patterns: ['apply [the] {name} rules', 'use [the] {name} rules'], help: 'apply the casual rules',
      run: async ({ args, doc, ctx }) => {
        if (!ctx.applyRules) return { doc, say: 'Rule sets come from the Chatbot App Authorer, which is not installed (apps/chatbotappauthor).' };
        const rules = await ctx.ruleSet?.(args.name);
        if (!rules) return { doc, say: `I don't have rules called ${args.name}.` };
        const ops = [];
        let n = 0;
        for (const b of visible(doc)) {
          const r = ctx.applyRules(b.text ?? '', rules);
          if (r.count) { n += r.count; ops.push({ op: 'set', id: b.id, key: 'text', value: r.text }, { op: 'set', id: b.id, key: 'html', value: escapeHtml(r.text) }); }
        }
        return n ? { ops, say: `Applied the ${args.name} rules: ${n} change${n === 1 ? '' : 's'}.` } : { doc, say: `The ${args.name} rules found nothing to change.` };
      }
    })
    .register({ name: 'track on', patterns: ['turn on track changes', 'track changes', 'start tracking changes'], run: ({ doc }) => (isTracking(doc) ? { doc, say: 'Track changes is already on.' } : { ops: startTracking(doc), say: 'Track changes is on.' }) })
    .register({ name: 'track off', patterns: ['turn off track changes', 'stop tracking changes'], run: ({ doc }) => (isTracking(doc) ? { ops: stopTracking(doc), say: 'Track changes is off; the changes are kept.' } : { doc, say: 'Track changes is already off.' }) })
    .register({ name: 'accept all', patterns: ['accept all [the] changes', 'accept all', 'accept the changes'], run: ({ doc }) => { const ops = acceptOps(doc); return ops.length ? { ops, say: `Accepted ${ops.length} change${ops.length === 1 ? '' : 's'}.` } : { doc, say: 'There are no changes to accept.' }; } })
    .register({ name: 'reject all', patterns: ['reject all [the] changes', 'reject all', 'reject the changes'], run: ({ doc }) => { const ops = rejectOps(doc); return ops.length ? { ops, say: 'Rejected the changes.' } : { doc, say: 'There are no changes to reject.' }; } })
    .register({
      name: 'read', patterns: ['read it', 'read it out', 'read [the] {which} paragraph'],
      run: ({ args, doc }) => {
        const blocks = args.which ? [pick(doc, args.which)].filter(Boolean) : visible(doc);
        const text = blocks.map((b) => b.text).join(' ');
        return { doc, say: text ? text.slice(0, 500) + (text.length > 500 ? '…' : '') : 'There is nothing to read yet.' };
      }
    });
  return reg;
}

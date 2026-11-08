// Track changes, built on the Office document's ops so every accept and reject is itself
// undoable. While tracking is on, each block remembers its accepted text ("accepted");
// deletions mark the block "deleted" instead of removing it; new blocks start with
// accepted = "". Review shows a word-by-word difference for each changed block.
import { diff, tokens } from './authorer.js';

export const TRACK_KEY = '_track';
export const isTracking = (doc) => doc.data?.[TRACK_KEY] === 'on';

export function startTracking(doc) {
  return [
    { op: 'data', key: TRACK_KEY, value: 'on' },
    ...doc.blocks.filter((b) => b.accepted === undefined).map((b) => ({ op: 'set', id: b.id, key: 'accepted', value: b.text ?? '' }))
  ];
}

// Turning tracking off keeps the document as it now reads: deleted blocks go, marks are cleared.
export function stopTracking(doc) {
  return [...acceptOps(doc), ...doc.blocks.filter((b) => !b.deleted).map((b) => ({ op: 'set', id: b.id, key: 'accepted', value: undefined })), { op: 'data', key: TRACK_KEY, value: undefined }]
    .filter((op, i, all) => !(op.op === 'set' && op.key === 'accepted' && op.value === undefined && all.some((o) => o.op === 'delete' && o.id === op.id)));
}

// Rewrites ops made while tracking: deletions become marks, insertions start unaccepted.
export function trackOps(doc, ops) {
  if (!isTracking(doc)) return ops;
  return ops.map((op) => {
    if (op.op === 'delete') {
      const b = doc.blocks.find((x) => x.id === op.id);
      if (b && b.accepted === '') return op; // never accepted: just remove it
      return { op: 'set', id: op.id, key: 'deleted', value: true };
    }
    if (op.op === 'insert' && op.block.accepted === undefined) return { ...op, block: { ...op.block, accepted: '' } };
    return op;
  });
}

const join = (ts) => ts.reduce((s, t) => (!s ? t : /^[.,!?;:)\]'’]/.test(t) ? s + t : `${s} ${t}`), '');

export function review(doc) {
  return doc.blocks.map((b) => {
    if (b.accepted === undefined) return { id: b.id, status: 'same', parts: [{ type: 'same', text: b.text ?? '' }] };
    if (b.deleted) return { id: b.id, status: 'deleted', parts: [{ type: 'del', text: b.accepted || b.text || '' }] };
    if (b.accepted === '' && (b.text ?? '') !== '') return { id: b.id, status: 'inserted', parts: [{ type: 'ins', text: b.text }] };
    if (b.accepted === (b.text ?? '')) return { id: b.id, status: 'same', parts: [{ type: 'same', text: b.text ?? '' }] };
    // group the word diff into runs
    const parts = [];
    for (const d of diff(tokens(b.accepted), tokens(b.text ?? ''))) {
      const type = d.type, word = d.type === 'ins' ? d.b : d.type === 'del' ? d.a : d.b;
      const last = parts[parts.length - 1];
      if (last && last.type === type) last.words.push(word); else parts.push({ type, words: [word] });
    }
    return { id: b.id, status: 'changed', parts: parts.map((p) => ({ type: p.type, text: join(p.words) })) };
  });
}

export const changeCount = (doc) => review(doc).filter((r) => r.status !== 'same').length;

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function acceptOps(doc, id = null) {
  const ops = [];
  for (const b of doc.blocks) {
    if (id && b.id !== id) continue;
    if (b.deleted) ops.push({ op: 'delete', id: b.id });
    else if (b.accepted !== undefined && b.accepted !== (b.text ?? '')) ops.push({ op: 'set', id: b.id, key: 'accepted', value: b.text ?? '' });
  }
  return ops;
}

export function rejectOps(doc, id = null) {
  const ops = [];
  for (const b of doc.blocks) {
    if (id && b.id !== id) continue;
    if (b.deleted) { ops.push({ op: 'set', id: b.id, key: 'deleted', value: undefined }); if (b.accepted !== (b.text ?? '')) ops.push(...restore(b)); }
    else if (b.accepted === '' && (b.text ?? '') !== '') ops.push({ op: 'delete', id: b.id });
    else if (b.accepted !== undefined && b.accepted !== (b.text ?? '')) ops.push(...restore(b));
  }
  return ops;
}
const restore = (b) => [{ op: 'set', id: b.id, key: 'text', value: b.accepted }, { op: 'set', id: b.id, key: 'html', value: escapeHtml(b.accepted) }];

import { HERITAGE_FRAME, heritageSvg } from './heritage-frame.mjs';
export { HERITAGE_FRAME, heritageSvg };
function inline(text) {
  const runs = []; const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > start) runs.push({ text: text.slice(start, match.index) });
    runs.push(match[2] ? { text: match[2], bold: true } : match[3] ? { text: match[3], italic: true } : { text: match[4], href: match[5] });
    start = match.index + match[0].length;
  }
  if (start < text.length) runs.push({ text: text.slice(start) });
  return runs.length ? runs : [{ text: '' }];
}
export function parseLetterBody(text) {
  const blocks = []; let paragraph = []; let breakNext = false;
  function flush() { if (paragraph.length) { blocks.push({ runs: inline(paragraph.join('\n')), ...(breakNext ? { pageBreakBefore: true } : {}) }); paragraph = []; breakNext = false; } }
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '---page---' || line === '\f') { flush(); breakNext = true; continue; }
    if (!line.trim()) { flush(); continue; }
    const list = /^\s*(?:([-*])|\d+\.)\s+(.+)$/.exec(line);
    if (list) { flush(); blocks.push({ runs: inline(list[2]), list: list[1] ? 'bullet' : 'number', ...(breakNext ? { pageBreakBefore: true } : {}) }); breakNext = false; }
    else paragraph.push(line);
  }
  flush(); return blocks;
}
export function bodyPlainText(body) {
  let number = 0;
  return body.map(b => { number = b.list === 'number' ? number + 1 : 0; return (b.list === 'bullet' ? '• ' : b.list === 'number' ? `${number}. ` : '') + b.runs.map(r => r.text + (r.href ? ` (${r.href})` : '')).join(''); }).join('\n\n');
}
export function normalizeLetter(input, { draft = false } = {}) {
  if (!input || typeof input !== 'object') throw new Error('Supply a letter.');
  const clean = (v, max = 500, required = false) => {
    if (v === undefined || v === null) { if (required) throw new Error('Complete the required letter fields.'); return ''; }
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000B-\u001F]/u.test(v)) throw new Error('A letter field is invalid or too long.');
    const value = v.normalize('NFC').trim(); if (required && !value) throw new Error('Complete the required letter fields.'); return value;
  };
  const date = clean(input.date, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Choose a valid date.');
  const recipient = input.recipient || {}, sender = input.sender || {};
  const address = recipient.address || [];
  if (!Array.isArray(address) || address.length > 12) throw new Error('Supply at most twelve address lines.');
  if (!Array.isArray(input.body) || (!draft && !input.body.length) || input.body.length > 1000) throw new Error('Add the letter body (up to 1,000 paragraphs).');
  let size = 0;
  const body = input.body.map(b => {
    if (!b || !Array.isArray(b.runs) || !b.runs.length || b.runs.length > 200) throw new Error('Invalid letter paragraph.');
    if (b.list && !['bullet','number'].includes(b.list)) throw new Error('Invalid list.');
    return { runs: b.runs.map(r => {
      // Preserve run spacing: trim only whole fields, never individual rich text runs.
      clean(r.text, 30000); size += r.text.length;
      const href = r.href ? clean(r.href, 2048) : '';
      if (href && !/^https?:\/\//i.test(href)) throw new Error('Only HTTP or HTTPS links are supported.');
      return { text: r.text.normalize('NFC'), ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(href ? { href } : {}) };
    }), ...(b.list ? { list: b.list } : {}), ...(b.pageBreakBefore ? { pageBreakBefore: true } : {}) };
  });
  if (size > 120000 || (!draft && !body.some(b => b.runs.some(r => r.text.trim())))) throw new Error('The body must contain text and stay below 120,000 characters.');
  const email = clean(recipient.email, 320);
  if (email && !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email)) throw new Error('Supply one valid recipient email.');
  return { date, reference: clean(input.reference), recipient: { name: clean(recipient.name), organisation: clean(recipient.organisation), address: address.map(v => clean(v)), email }, subject: clean(input.subject, 1000, !draft), salutation: clean(input.salutation), body, closing: clean(input.closing), sender: { name: clean(sender.name, 300, !draft), role: clean(sender.role), approvedSignatureId: clean(sender.approvedSignatureId, 80) }, enclosures: clean(input.enclosures, 2000) };
}
export function letterFilename(letter) {
  const slug = letter.subject.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 70) || 'Letter';
  return `Indigen_World_${slug}_${letter.date}`;
}


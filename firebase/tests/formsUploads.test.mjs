import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { UPLOAD_FORMATS } from '../../packages/contracts/forms.mjs';

/**
 * Indigen Forms upload inspection (services/functions/src/forms-uploads.ts,
 * inspectFormUpload). Synthetic byte samples only. Run `npm run
 * build:functions` first; this imports the compiled module.
 */

let inspect;
before(async () => {
  ({ inspectFormUpload: inspect } = await import('../../services/functions/lib/forms-uploads.js'));
});

const pad = (head, size = 256) => Buffer.concat([Buffer.isBuffer(head) ? head : Buffer.from(head, 'latin1'), Buffer.alloc(Math.max(0, size - head.length), 0x20)]);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const ftyp = (major, ...compatible) => {
  const body = Buffer.from(`ftyp${major}\0\0\0\0${compatible.join('')}`, 'latin1');
  return pad(Buffer.concat([u32(body.length + 4), body]));
};
const ebml = (docType) => pad(Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0x82, 0x80 | docType.length]),
  Buffer.from(docType, 'latin1'),
]));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const samples = {
  jpeg: pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])),
  png: PNG,
  webp: pad('RIFF\x24\x00\x00\x00WEBPVP8 '),
  mp3: pad('ID3\x04\x00\x00\x00\x00\x00\x00'),
  wav: pad('RIFF\x24\x00\x00\x00WAVEfmt '),
  m4a: ftyp('M4A ', 'M4A ', 'isom'),
  ogg: pad('OggS\x00\x02'),
  webm_audio: ebml('webm'),
  flac: pad('fLaC\x00\x00\x00\x22'),
  mp4: ftyp('mp42', 'mp42', 'isom', 'avc1'),
  mov: ftyp('qt  ', 'qt  '),
  webm_video: ebml('webm'),
  pdf: Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1'),
  txt: Buffer.from('Kasem word list\ntest-ʋ̀ʋ́ — thing\ntest-ɩ́ɔ̀ — person\n', 'utf8'),
};

async function docx({ extra = {}, contentTypes, rels } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes ?? '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>test-ʋ̀ʋ́ test-ɩ́ɔ̀</w:t></w:r></w:p></w:body></w:document>');
  if (rels) zip.file('word/_rels/settings.xml.rels', rels);
  for (const [name, content] of Object.entries(extra)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const ok = (result, format) => assert.deepEqual(result, { ok: true, format });
const refused = (result, pattern) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  if (pattern) assert.match(result.reason, pattern);
};

test('every upload format is recognised by its own signature', async () => {
  for (const key of Object.keys(UPLOAD_FORMATS)) {
    const bytes = key === 'docx' ? await docx() : samples[key];
    assert.ok(bytes, `a sample exists for ${key}`);
    ok(inspect(bytes, [key]), key);
  }
});

test('MPEG frames, ADTS AAC and classic QuickTime atoms are recognised', () => {
  ok(inspect(pad(Buffer.from([0xff, 0xfb, 0x90, 0x64])), ['mp3']), 'mp3');
  refused(inspect(pad(Buffer.from([0xff, 0xff, 0xff, 0xff])), ['mp3'])); // reserved header bits are not a frame
  ok(inspect(pad(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc])), ['m4a']), 'm4a');
  ok(inspect(pad(Buffer.concat([u32(8), Buffer.from('moov', 'latin1')])), ['mov']), 'mov');
  ok(inspect(ftyp('isom', 'isom', 'mp41'), ['m4a']), 'm4a');
  ok(inspect(ftyp('isom', 'isom', 'mp41'), ['mp4']), 'mp4');
  refused(inspect(ftyp('M4A ', 'M4A '), ['mp4']), /M4A/);
  refused(inspect(ftyp('heic', 'mif1', 'heic'), ['jpeg', 'png', 'mp4', 'm4a']));
  ok(inspect(ebml('webm'), ['webm_video']), 'webm_video');
  refused(inspect(ebml('matroska'), ['webm_audio', 'webm_video']));
});

test('a renamed file fails: the bytes decide, not the name or declared type', () => {
  refused(inspect(PNG, ['jpeg']), /PNG image.*does not accept/);
  refused(inspect(samples.jpeg, ['png', 'webp']), /JPEG/);
  refused(inspect(samples.wav, ['mp3']), /WAV/);
  refused(inspect(samples.pdf, ['docx', 'txt']), /PDF/);
  refused(inspect(samples.mp4, ['jpeg', 'png']));
});

test('executables are refused whatever the question accepts', () => {
  const allFormats = Object.keys(UPLOAD_FORMATS);
  refused(inspect(pad('MZ\x90\x00\x03\x00\x00\x00This program cannot be run in DOS mode'), ['png']), /executable/i);
  refused(inspect(pad('MZ\x90\x00'), allFormats), /executable/i);
  refused(inspect(pad('\x7fELF\x02\x01\x01'), allFormats), /executable/i);
  refused(inspect(pad(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])), allFormats), /executable/i);
  refused(inspect(Buffer.from('#!/bin/sh\nrm -rf /\n'), ['txt']), /executable/i);
  refused(inspect(Buffer.alloc(0), allFormats), /empty/);
});

test('text must be clean UTF-8 without markup or binary content', () => {
  ok(inspect(samples.txt, ['txt']), 'txt');
  ok(inspect(Buffer.from('﻿Tone marks: à́ é', 'utf8'), ['txt']), 'txt');
  refused(inspect(Buffer.from('<html><body>hello</body></html>'), ['txt']), /Web pages/);
  refused(inspect(Buffer.from('notes\n<script>alert(1)</script>'), ['txt']), /Web pages/);
  refused(inspect(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'), ['txt']), /SVG/);
  refused(inspect(Buffer.from('<!DOCTYPE html>\n<p>x</p>'), ['txt']));
  refused(inspect(Buffer.from('<iframe src="https://x">'), ['txt']));
  refused(inspect(Buffer.from([0x68, 0x69, 0x00, 0x21]), ['txt']));
  refused(inspect(Buffer.from([0x63, 0x61, 0x66, 0xe9]), ['txt']), /UTF-8/);
  refused(inspect(Buffer.from('<html>renamed page</html>'), ['png', 'jpeg']), /do not match/);
});

test('PDFs with scripts, launch actions, attachments or encryption are refused', () => {
  const pdf = (body) => Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, 'latin1');
  refused(inspect(pdf('1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>\nendobj'), ['pdf']), /scripts/);
  refused(inspect(pdf('1 0 obj\n<< /OpenAction << /S /Launch /F (cmd.exe) >> >>\nendobj'), ['pdf']));
  refused(inspect(pdf('1 0 obj\n<< /Type /Filespec /EF << /F 2 0 R >> /Type /EmbeddedFile >>\nendobj'), ['pdf']));
  refused(inspect(pdf('1 0 obj\n<< /Names << /EmbeddedFiles 3 0 R >> >>\nendobj'), ['pdf']));
  refused(inspect(pdf('1 0 obj\n<< /S /J#61vaScript /J#53 (x) >>\nendobj'), ['pdf']), /scripts/); // hex-escaped names are decoded
  refused(inspect(pdf('trailer\n<< /Root 1 0 R /Encrypt 5 0 R >>'), ['pdf']), /encrypted/);
  const hidden = deflateSync(Buffer.from('<< /S /JavaScript /JS (app.alert(1)) >>', 'latin1'));
  const objectStream = Buffer.concat([
    Buffer.from(`%PDF-1.7\n4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${hidden.length} >>\nstream\n`, 'latin1'),
    hidden,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  refused(inspect(objectStream, ['pdf']), /scripts/); // compressed object streams are inspected too
  const harmless = deflateSync(Buffer.from('<< /Type /Page /MediaBox [0 0 612 792] >>', 'latin1'));
  const clean = Buffer.concat([
    Buffer.from(`%PDF-1.7\n4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${harmless.length} >>\nstream\n`, 'latin1'),
    harmless,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  ok(inspect(clean, ['pdf']), 'pdf');
  refused(inspect(Buffer.from('%PDX-1.7 not a pdf'), ['pdf']));
});

test('Word documents: macros, embedded objects, remote templates and encryption are refused', async () => {
  ok(inspect(await docx(), ['docx']), 'docx');
  refused(inspect(await docx({ extra: { 'word/vbaProject.bin': Buffer.from('macro') } }), ['docx']), /macros/);
  refused(inspect(await docx({ extra: { 'word/embeddings/oleObject1.bin': Buffer.from('ole') } }), ['docx']));
  refused(inspect(await docx({ contentTypes: '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>' }), ['docx']));
  refused(inspect(await docx({ rels: '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://attacker.example/t.dotm" TargetMode="External"/></Relationships>' }), ['docx']), /remote templates/);
  ok(inspect(await docx({ rels: '<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://indigenworld.com" TargetMode="External"/></Relationships>' }), ['docx']), 'docx');
  const notWord = new JSZip();
  notWord.file('[Content_Types].xml', '<Types/>');
  notWord.file('xl/workbook.xml', '<workbook/>');
  refused(inspect(await notWord.generateAsync({ type: 'nodebuffer' }), ['docx']), /not a valid Word/);
  // Set the "encrypted" flag on every central-directory entry.
  const encrypted = Buffer.from(await docx());
  for (let i = 0; i <= encrypted.length - 46; i += 1) if (encrypted.readUInt32LE(i) === 0x02014b50) encrypted.writeUInt16LE(encrypted.readUInt16LE(i + 8) | 1, i + 8);
  refused(inspect(encrypted, ['docx']), /encrypted/);
  refused(inspect(Buffer.from('PK\x03\x04 truncated', 'latin1'), ['docx']), /not a valid Word/);
});

test('submitting marks only the response’s unreferenced uploads as unused', async () => {
  const { unusedUploads } = await import('../../services/functions/lib/forms-uploads.js');
  const uploads = [
    { id: 'kept', status: 'ready' }, { id: 'old', status: 'ready' }, { id: 'pending', status: 'pending' },
    { id: 'rejected', status: 'rejected' }, { id: 'earlier', status: 'ready' },
  ];
  assert.deepEqual(unusedUploads(uploads, new Set(['kept', 'earlier'])), ['old', 'pending']);
});

test('upload bounds: a question in a repeatable group has room for every entry the group allows', async () => {
  const { uploadBounds } = await import('../../services/functions/lib/forms-uploads.js');
  const image = (id, maxFiles) => ({ id, type: 'image', label: id, settings: { formats: ['png'], maxSizeMb: 1, maxFiles } });
  const definition = {
    sections: [{ id: 'main', fields: [
      image('scan', 2),
      { id: 'words', type: 'group', label: 'Words', settings: { maxItems: 50 }, fields: [{ id: 'term', type: 'short_text', label: 'Word', settings: {} }, image('clip', 1)] },
      { id: 'pair', type: 'group', label: 'Pair', settings: { maxItems: 2 }, fields: [image('photo', 3)] },
      { id: 'plain', type: 'group', label: 'Default', settings: {}, fields: [image('shot', 1)] },
    ] }],
  };
  const field = (id) => definition.sections[0].fields.flatMap((item) => [item, ...(item.fields ?? [])]).find((item) => item.id === id);
  // Top level: unchanged (files in flight up to two more than allowed; 40 in all, for replacements).
  assert.deepEqual(uploadBounds(definition, field('scan')), { pending: 4, total: 40 });
  // Fifty words with a recording each: the old bounds refused the fourth upload in flight and the 41st in all.
  assert.deepEqual(uploadBounds(definition, field('clip')), { pending: 52, total: 100 });
  // Never below the top-level room for replacing files.
  assert.deepEqual(uploadBounds(definition, field('photo')), { pending: 8, total: 40 });
  // A group without maxItems allows five entries.
  assert.deepEqual(uploadBounds(definition, field('shot')), { pending: 7, total: 40 });
});

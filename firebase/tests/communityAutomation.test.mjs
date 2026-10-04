import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { AUTOMATION_ACCOUNTS, automationDate, cultureFactAddressesTopic, dailyPostId, evidenceExcerpts, publishedBotWord, safePublicUrl,
  shouldAnswerEnquiry, stableOrder, wordCardSvg, wrapCardText } from '../../services/functions/lib/community-automation-policy.js';

test('five distinct identities have distinct daily schedules and disclose automation', () => {
  assert.equal(new Set(AUTOMATION_ACCOUNTS.map(bot => bot.uid)).size, 5);
  assert.equal(new Set(AUTOMATION_ACCOUNTS.map(bot => bot.hour)).size, 5);
  for (const bot of AUTOMATION_ACCOUNTS) {
    assert.match(bot.username, /^[a-z][a-z0-9_]{2,19}$/);
    assert.match(bot.bio, /Automated/);
    assert.ok(bot.bio.length <= 300);
  }
  assert.equal(AUTOMATION_ACCOUNTS[2].name, 'NNaYeiri SeNBwei');
});
test('daily IDs are stable across invocations and change at Ghana midnight', () => {
  assert.equal(automationDate(new Date('2026-10-02T23:59:59Z')), '2026-10-02');
  assert.equal(automationDate(new Date('2026-10-03T00:00:00Z')), '2026-10-03');
  assert.equal(dailyPostId(AUTOMATION_ACCOUNTS[0], '2026-10-02'), 'daily_zem-botarebu_2026-10-02');
});
test('only published complete words enter the selection pool; exact diacritics survive', () => {
  const row = { isPublished: true, kasemText: 'kɔ́rɛ', englishText: 'A stored meaning' };
  assert.equal(publishedBotWord('w1', row).kasem, 'kɔ́rɛ');
  assert.equal(publishedBotWord('w1', { ...row, isPublished: false }), null);
  assert.equal(publishedBotWord('w1', { ...row, englishText: '' }), null);
  assert.equal(publishedBotWord('w1', { ...row, lexicalKind: 'phrase' }), null);
  assert.equal(publishedBotWord('w1', { ...row, kasemText: 'a'.repeat(66) }), null);
});
test('daily candidate order is repeatable and varies by seed', () => {
  const words = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
  assert.deepEqual(stableOrder(words, 'today'), stableOrder(words, 'today'));
  assert.notDeepEqual(stableOrder(words, 'today'), stableOrder(words, 'tomorrow'));
});
test('enquiry replies are confined to its own roots and do not answer bots or Kawuri summons', () => {
  const root = { authorId: AUTOMATION_ACCOUNTS[2].uid, automationAccountId: AUTOMATION_ACCOUNTS[2].id };
  const reply = { isReply: true, authorId: 'human', text: 'I enjoy the dictionary.' };
  assert.equal(shouldAnswerEnquiry(reply, root), true);
  assert.equal(shouldAnswerEnquiry(reply, { authorId: 'another-user' }), false);
  assert.equal(shouldAnswerEnquiry({ ...reply, isReply: false }, root), false);
  assert.equal(shouldAnswerEnquiry({ ...reply, text: '@kawuri can you answer?' }, root), false);
  assert.equal(shouldAnswerEnquiry({ ...reply, isAutomated: true }, root), false);
  for (const bot of AUTOMATION_ACCOUNTS) assert.equal(shouldAnswerEnquiry({ ...reply, authorId: bot.uid }, root), false);
  assert.equal(shouldAnswerEnquiry({ ...reply, authorId: 'kawuri' }, root), false);
});
test('culture citations cannot introduce arbitrary or private server URLs', () => {
  assert.equal(safePublicUrl('https://en.wikipedia.org/wiki/Kasem_language'), 'https://en.wikipedia.org/wiki/Kasem_language');
  assert.equal(safePublicUrl('https://whc.unesco.org/en/list/1713/'), 'https://whc.unesco.org/en/list/1713/');
  for (const url of ['http://en.wikipedia.org/wiki/Kasem', 'https://localhost/a', 'https://en.wikipedia.org.evil.test/a', 'https://user:pass@en.wikipedia.org/a', 'javascript:alert(1)']) assert.equal(safePublicUrl(url), null);
});
test('culture evidence is selected from exact complete retrieved sentences', () => {
  const source = 'Kasem is spoken in northern Ghana and southern Burkina Faso.\nIts speakers maintain a living language and culture.\n' + 'x'.repeat(270) + '.';
  const excerpts = evidenceExcerpts(source);
  assert.equal(excerpts.length, 2);
  assert.equal(excerpts[0], 'Kasem is spoken in northern Ghana and southern Burkina Faso.');
  for (const quote of excerpts) assert.ok(source.includes(quote));
});
test('culture facts address Kassena, Kasem or Tiébélé directly', () => {
  for (const name of ['Kassena', 'Kasena', 'Kasem', 'Tiébélé', 'Tiebele']) assert.equal(cultureFactAddressesTopic(`A fact about ${name}.`), true);
  assert.equal(cultureFactAddressesTopic('A broad fact about the Gurunsi people.'), false);
});
test('card wrapping retains every character of a long headword and escapes markup', () => {
  const headword = 'kɔ́rɛ'.repeat(10);
  assert.equal(wrapCardText(headword, 18).join(''), headword);
  const svg = wordCardSvg(AUTOMATION_ACCOUNTS[0], { id: 'w', kasem: 'kɔ́rɛ < &', english: 'A meaning <script>bad</script>' }, '2026-10-02');
  assert.ok(svg.includes('kɔ́rɛ &lt; &amp;'));
  assert.ok(!svg.includes('<script>'));
  const png = new Resvg(svg, { font: { fontFiles: ['services/functions/assets/fonts/NotoSans-Regular.ttf'], loadSystemFonts: false } }).render().asPng();
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1080);
});

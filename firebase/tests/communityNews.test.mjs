import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTOMATION_ACCOUNTS } from '../../services/functions/lib/community-automation-policy.js';
import { NEWS_SOURCES, ZEM_GHANA, canonicalArticleUrl, copiesPreview, decodeEntities, dueNewsSlot, feedText, fitHeadline, newsCandidates,
  newsCardSvg, newsPostId, newsPostText, newsSummaryBudget, parseNewsFeed } from '../../services/functions/lib/community-news-policy.js';
import { renderNewsCard } from '../../services/functions/lib/community-news.js';

const joy = NEWS_SOURCES.find(source => source.id === 'myjoyonline');
const graphic = NEWS_SOURCES.find(source => source.id === 'graphic');
const wordpressFeed = `<rss><channel><item>
  <title>Cedi gains &#8211; BoG says reserves &amp; inflow improved</title>
  <link>https://www.myjoyonline.com/cedi-gains/?utm_source=rss#respond</link>
  <pubDate>Thu, 15 Oct 2026 10:38:05 +0000</pubDate>
  <category><![CDATA[Business]]></category>
  <description><![CDATA[<p>The Bank of Ghana says the cedi gained against the dollar this week as reserves improved.</p><p>The post <a href="x">Cedi gains</a> appeared first on <a href="y">MyJoyOnline</a>.</p>]]></description>
</item><item>
  <title>Spoofed link elsewhere</title><link>https://evil.example/cedi</link><pubDate>Thu, 15 Oct 2026 10:00:00 +0000</pubDate>
  <description>A story whose link leaves the outlet's own website entirely.</description>
</item></channel></rss>`;

test('Zem Ghana is a separate, disclosed identity that cannot collide with the daily accounts', () => {
  assert.ok(!AUTOMATION_ACCOUNTS.some(bot => bot.uid === ZEM_GHANA.uid || bot.username === ZEM_GHANA.username || bot.id === ZEM_GHANA.id));
  assert.match(ZEM_GHANA.username, /^[a-z][a-z0-9_]{2,19}$/);
  assert.match(ZEM_GHANA.bio, /Automated/);
  assert.match(ZEM_GHANA.bio, /links to the original/);
  assert.ok(ZEM_GHANA.bio.length <= 300);
});
test('publisher feeds parse to clean text; links must stay on the outlet and lose tracking', () => {
  const [item, ...rest] = parseNewsFeed(wordpressFeed, joy);
  assert.equal(rest.length, 0, 'off-site link rejected');
  assert.equal(item.title, 'Cedi gains – BoG says reserves & inflow improved');
  assert.equal(item.url, 'https://www.myjoyonline.com/cedi-gains/');
  assert.equal(item.preview, 'The Bank of Ghana says the cedi gained against the dollar this week as reserves improved.');
  assert.deepEqual(item.categories, ['Business']);
  assert.equal(item.publishedAt, '2026-10-15T10:38:05.000Z');
  assert.equal(canonicalArticleUrl('http://www.myjoyonline.com/x', joy), null);
  assert.equal(canonicalArticleUrl('https://user:pw@www.myjoyonline.com/x', joy), null);
  assert.equal(decodeEntities('&#x20B5;5 &hellip; &rsquo;'), '₵5 … ’');
  assert.equal(feedText('<p><img src="x"><strong>Eight people arrested.</strong></p><p class="feed-readmore"><a>Read More &hellip;</a></p>'), 'Eight people arrested.');
  const graphicItem = parseNewsFeed(`<item><title>Police arrest eight over drug sales in Accra</title><link>https://www.graphic.com.gh/news/a.html</link><description><![CDATA[<p>Eight people have been arrested by the police in Accra.</p>]]></description><pubDate>Thu, 15 Oct 2026 09:53:00 +0000</pubDate></item>`, graphic);
  assert.equal(graphicItem.length, 1);
});
test('candidates are fresh, unused, de-duplicated, free of opinion pieces and mixed across outlets', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const item = (id, sourceId, title, hoursAgo, extra = {}) => ({ id, sourceId, sourceName: sourceId, url: `https://x/${id}`, title, preview: 'A preview long enough to describe the story in a sentence.', publishedAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(), categories: [], ...extra });
  const items = [item('a1', 'a', 'Story one from outlet A today', 1), item('a2', 'a', 'Story two from outlet A today', 2), item('a3', 'a', 'Story three from outlet A', 3),
    item('b1', 'b', 'Story one from outlet A today!', 1.5), item('b2', 'b', 'Fresh story from outlet B', 4), item('old', 'b', 'A story from two days ago', 48),
    item('op', 'b', 'Opinion: why the budget fails', 1), item('col', 'a', 'Weekend thoughts', 1, { categories: ['Columns'] }), item('used', 'b', 'Already posted story here', 1)];
  const picked = newsCandidates(items, now, { ids: new Set(['used']), titles: new Set() }).map(row => row.id);
  assert.deepEqual(picked, ['a1', 'b2', 'a2', 'a3']);
  assert.deepEqual(newsCandidates(items, now, { ids: new Set(), titles: new Set(['story two from outlet a today']) }).map(row => row.id).includes('a2'), false);
});
test('slots follow Ghana time, retry within the grace window and are never posted late', () => {
  assert.equal(dueNewsSlot(new Date('2026-10-15T06:59:00Z')), null);
  assert.deepEqual(dueNewsSlot(new Date('2026-10-15T07:00:00Z')), { date: '2026-10-15', slot: 7 });
  assert.deepEqual(dueNewsSlot(new Date('2026-10-15T09:30:00Z')), { date: '2026-10-15', slot: 7 });
  assert.equal(dueNewsSlot(new Date('2026-10-15T10:00:00Z')), null);
  assert.deepEqual(dueNewsSlot(new Date('2026-10-15T19:30:00Z')), { date: '2026-10-15', slot: 19 });
  assert.equal(dueNewsSlot(new Date('2026-10-15T23:00:00Z')), null);
  assert.equal(newsPostId('2026-10-15', 7), 'news_zem-ghana_2026-10-15_07');
});
test('post text attributes the outlet, links it, discloses automation and fits the 500-character limit', () => {
  const item = { id: 'x', sourceId: 'myjoyonline', sourceName: 'MyJoyOnline', url: 'https://www.myjoyonline.com/' + 'a'.repeat(120), title: 'T'.repeat(160), preview: '', publishedAt: '2026-10-15T10:00:00Z', categories: [] };
  const budget = newsSummaryBudget(item);
  const text = newsPostText(item, 's'.repeat(budget));
  assert.ok(text.length <= 500);
  assert.match(text, /Source: MyJoyOnline\nhttps:\/\/www\.myjoyonline\.com\//);
  assert.match(text, /Automated headline · AI summary/);
});
test('summaries that lift ten consecutive words from the preview are caught', () => {
  const preview = 'The Ghana Gold Board has rejected suggestions that the Bank of Ghana transferred its foreign exchange responsibilities to the Board.';
  assert.equal(copiesPreview('GoldBod rejected suggestions that the Bank of Ghana transferred its foreign exchange responsibilities to it.', preview), true);
  assert.equal(copiesPreview('GoldBod says the central bank has not handed it any foreign exchange duties, rejecting recent reports.', preview), false);
});
test('the headline card keeps every word, escapes markup and renders with the bundled fonts', () => {
  const title = 'Black Maidens: Joe Nana Adarkwa names final 21-player squad for U-17 Women’s World Cup <script> & more';
  const { lines } = fitHeadline(title);
  assert.equal(lines.join(' '), title);
  const long = fitHeadline('W'.repeat(40) + ' ' + 'word '.repeat(36).trim());
  assert.ok(long.size >= 34);
  const item = { id: 'x', sourceId: '3news', sourceName: '3News', url: 'https://3news.com/a', title, preview: '', publishedAt: '2026-10-15T10:46:05Z', categories: [] };
  const svg = newsCardSvg(item, 'Sports');
  assert.match(svg, /&lt;script&gt; &amp; more/);
  assert.match(svg, /Source: 3News/);
  assert.match(svg, /SPORTS/);
  const png = renderNewsCard(item, 'Sports');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1080);
});
test('over-long summaries keep whole leading sentences, never a cut-off one', async () => {
  const { fitSummary } = await import('../../services/functions/lib/community-news-policy.js');
  const first = 'The Ghana Police Service says sixteen suspects were arrested at a mining site in Talensi.';
  const second = 'Officers seized guns, ammunition and suspected narcotics during the operation, the service added.';
  assert.equal(fitSummary(`${first} ${second}`, 200), `${first} ${second}`);
  assert.equal(fitSummary(`${first} ${second}`, 120), first);
  assert.equal(fitSummary('Too short.', 200), null);
  assert.equal(fitSummary('A single sentence that runs on far beyond the limit without any break at all in sight', 50), null);
});
test('decimals and abbreviations survive summary fitting', async () => {
  const { fitSummary } = await import('../../services/functions/lib/community-news-policy.js');
  const text = 'Economic activity rose 7.4% in July, up from 4.9% a year earlier, the Bank of Ghana says. A second sentence explains the services sector led the growth.';
  assert.equal(fitSummary(text, 100), 'Economic activity rose 7.4% in July, up from 4.9% a year earlier, the Bank of Ghana says.');
  assert.equal(fitSummary(text, 300), text);
});

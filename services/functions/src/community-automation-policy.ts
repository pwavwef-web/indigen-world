import { createHash } from 'node:crypto';

export const AUTOMATION_TIME_ZONE = 'Africa/Accra';
export const AUTOMATION_ACCOUNTS = [
  { id: 'zem-botarebu', uid: 'bot_zem_botarebu', username: 'zem_botarebu', name: 'Zem Botarebu', kind: 'word', hour: 7, color: '#214B39', bio: 'Automated word of the day from the published Kasem dictionary. A new word and its English meaning every day at 07:00 Ghana time.' },
  { id: 'amo-yei-kasem', uid: 'bot_amo_yei_kasem', username: 'amo_yei_kasem', name: 'Amo Yei Kasem', kind: 'culture', hour: 10, color: '#9C492D', bio: 'Automated, sourced readings about Kasem and Kassena culture. Daily at 10:00 Ghana time. Practices can vary by community; corrections are welcome.' },
  { id: 'nnayeiri-senbwei', uid: 'bot_nnayeiri_senbwei', username: 'nnayeiri_senbwei', name: 'NNaYeiri SeNBwei', kind: 'enquiry', hour: 13, color: '#3F4585', bio: 'Automated conversation host. One project or culture question daily at 13:00 Ghana time, with brief AI replies in my own threads. I cannot speak for the team or every community.' },
  { id: 'kasem-practice', uid: 'bot_kasem_practice', username: 'kasem_practice', name: 'Kasem Practice', kind: 'practice', hour: 16, color: '#126D68', bio: 'Automated daily Kasem practice using published dictionary words. Join the exercise at 16:00 Ghana time. Speakers and learners are welcome.' },
  { id: 'indigen-guide', uid: 'bot_indigen_guide', username: 'indigen_guide', name: 'Indigen Guide', kind: 'guide', hour: 19, color: '#663B73', bio: 'Automated Indigen World tips at 19:00 Ghana time. Discover the dictionary, saved words and community tools. For account help, contact the project team.' },
] as const;
export type AutomationAccount = typeof AUTOMATION_ACCOUNTS[number];

export const GUIDE_TIPS = [
  'Open a word in the Kasem dictionary to read its published English meaning. Save words you want to revisit in your Collection.',
  'Follow community accounts you enjoy so you can find their posts again. Visit an account’s profile to see its posts and follow it.',
  'Save a community post you want to revisit using its bookmark action. Your saved posts help you return to useful conversations.',
  'A helpful dictionary correction names the entry and explains the change. Share the spelling, meaning and context you know with the project team.',
  'When discussing a cultural practice, include the town or community you mean. Customs and usage can differ between families and places.',
  'Before sharing a photo, recording or story from another person, ask for their permission and acknowledge the source.',
  'Community questions work best with context. Say what you already tried, and include the dictionary word or feature you are asking about.',
  'The artwork and English text on these automated accounts are learning aids. For Kasem pronunciation and usage, listen to speakers and published recordings.',
] as const;

export function automationDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AUTOMATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dailyPostId(account: AutomationAccount, date: string): string {
  return `daily_${account.id}_${date}`;
}
export function stableOrder<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  const score = (id: string) => createHash('sha256').update(`${seed}:${id}`).digest('hex');
  return [...items].sort((a, b) => score(a.id).localeCompare(score(b.id)));
}
export function plainText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
export function safePublicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !['en.wikipedia.org', 'whc.unesco.org'].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export interface PublishedBotWord { id: string; kasem: string; english: string; }
export function cultureFactAddressesTopic(text: string): boolean {
  return /(?:\b(?:Kassena|Kasena|Kasem|Tiebele)\b|Tiébélé)/i.test(text);
}
export function evidenceExcerpts(text: string): string[] {
  return [...text.matchAll(/[^.!?]+[.!?](?:\s|$)|[^.!?]+$/g)]
    .map(match => match[0].trim()).filter(quote => quote.length >= 30 && quote.length <= 260);
}
export function publishedBotWord(id: string, data: Record<string, unknown>): PublishedBotWord | null {
  if (data.isPublished !== true || data.lexicalKind === 'phrase' || data.lexicalKind === 'saying') return null;
  const first = (fields: string[]) => fields.map(key => plainText(data[key], 240)).find(Boolean) || '';
  const kasem = first(['kasemText', 'headword', 'kasem', 'word']);
  const english = first(['englishText', 'translation', 'english', 'definition']);
  // Skip overly long entries rather than truncating the spelling or meaning on the card.
  if (!kasem || !english || kasem.length > 65 || english.length > 180) return null;
  return { id, kasem, english };
}
export function shouldAnswerEnquiry(post: Record<string, unknown>, root: Record<string, unknown>): boolean {
  const enquiry = AUTOMATION_ACCOUNTS.find(account => account.kind === 'enquiry')!;
  return post.isReply === true && typeof post.authorId === 'string'
    && !AUTOMATION_ACCOUNTS.some(account => account.uid === post.authorId)
    && post.authorId !== 'kawuri' && post.isAssistant !== true && post.isAutomated !== true
    && root.authorId === enquiry.uid && root.automationAccountId === enquiry.id
    && typeof post.text === 'string' && post.text.trim().length > 0
    && !/@kawuri\b/i.test(post.text);
}
export function xml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}
export function wrapCardText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = ''; }
    // Long individual headwords must fit too, without dropping characters.
    if (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      const chars = Array.from(word);
      while (chars.length > width) lines.push(chars.splice(0, width).join(''));
      line = chars.join('');
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
export function wordCardSvg(account: AutomationAccount, word: PublishedBotWord, date: string): string {
  const kasem = wrapCardText(word.kasem, 18);
  const meaning = wrapCardText(word.english, 36);
  const kasemStep = Math.min(86, 255 / Math.max(1, kasem.length - 1));
  const meaningStep = Math.min(46, 200 / Math.max(1, meaning.length - 1));
  const line = (body: string, y: number, size: number, fill: string) => `<text x="88" y="${y}" fill="${fill}" font-family="Noto Sans" font-size="${size}">${xml(body)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#FAF6EC"/><rect x="0" y="0" width="1080" height="208" fill="${account.color}"/><circle cx="968" cy="96" r="58" fill="#E6B657"/><path d="M948 112 Q970 65 990 90 M968 106 L968 132" fill="none" stroke="${account.color}" stroke-width="8" stroke-linecap="round"/>${line('WORD OF THE DAY', 96, 34, '#FAF6EC')}${line(date, 157, 28, '#FAF6EC')}${kasem.map((text, i) => line(text, 320 + i * kasemStep, Math.min(74, kasemStep * 0.88), account.color)).join('')}${line('ENGLISH MEANING', 655, 26, '#6D6A60')}${meaning.map((text, i) => line(text, 715 + i * meaningStep, Math.min(38, meaningStep * 0.85), '#262C27')).join('')}<path d="M88 946 H992" stroke="#D4C9B5" stroke-width="2"/>${line(account.name, 995, 29, account.color)}${line('Published Kasem dictionary · Automated daily selection', 1034, 22, '#6D6A60')}</svg>`;
}

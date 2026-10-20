import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { plainAmount, type Report, type ReportTable } from './finance-ledger.js';

/**
 * Finance reports as a branded A4 PDF: the Indigen World mark and wordmark in
 * a navy band, the period and the summary up front, then each table, paged,
 * with the generation time and page number on every page.
 *
 * The standard PDF fonts cannot draw ₵, → or the true minus sign, so amounts
 * are printed as "GHS 4,000.00" and text is folded to what the font can show.
 */

const NAVY = rgb(16 / 255, 28 / 255, 54 / 255);
const BLUE = rgb(37 / 255, 99 / 255, 235 / 255);
const PALE = rgb(142 / 255, 180 / 255, 1);
const CYAN = rgb(34 / 255, 211 / 255, 238 / 255);
const INK = rgb(0.11, 0.13, 0.18);
const MUTED = rgb(0.42, 0.45, 0.52);
const LINE = rgb(0.86, 0.88, 0.92);
const WASH = rgb(0.95, 0.97, 1);
const GREEN = rgb(0.05, 0.5, 0.27);
const RED = rgb(0.75, 0.15, 0.15);

const W = 841.89, H = 595.28; // A4 landscape
const M = 36;

/** Folds text to WinAnsi so the standard fonts never throw on a character. */
export function pdfSafe(text: unknown): string {
  return String(text ?? '')
    .replace(/GH₵/g, 'GHS ').replace(/₵/g, 'GHS ')
    .replace(/[−–]/g, '-').replace(/→/g, '->').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/•/g, '*')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E -ÿ—]/g, '?');
}

/** `GHS 4,000.00` / `-GHS 200.00`. */
export function pdfMoney(minor: number | null | undefined): string {
  if (minor == null) return '';
  const plain = plainAmount(minor);
  const negative = plain.startsWith('-');
  const [whole, fraction] = (negative ? plain.slice(1) : plain).split('.');
  return `${negative ? '-' : ''}GHS ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let out = text;
  if (font.widthOfTextAtSize(out, size) <= width) return out;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width) out = out.slice(0, -1);
  return `${out}...`;
}

function drawLogo(page: PDFPage, x: number, y: number, size: number) {
  const s = size / 64;
  page.drawSvgPath('M16 0 H48 Q64 0 64 16 V48 Q64 64 48 64 H16 Q0 64 0 48 V16 Q0 0 16 0 Z', { x, y, scale: s, color: rgb(0.2, 0.3, 0.5) });
  page.drawSvgPath('M15 47 V23 L32 14 L49 23 V47', { x, y, scale: s, borderColor: PALE, borderWidth: 3.6 });
  page.drawSvgPath('M24 44 V29 M32 44 V24 M40 44 V29', { x, y, scale: s, borderColor: rgb(1, 1, 1), borderWidth: 3.6 });
  page.drawCircle({ x: x + 32 * s, y: y - 14 * s, size: 4 * s, color: CYAN });
}

export async function renderReportPdf(report: Report, preparedBy: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Indigen World — ${report.title}`);
  doc.setAuthor('Indigen World');
  doc.setSubject(`${report.from} to ${report.to}`);
  doc.setCreator('Indigen World admin console');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const header = (first: boolean) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    const band = first ? 74 : 40;
    page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: NAVY });
    drawLogo(page, M, H - (first ? 18 : 8), first ? 40 : 24);
    page.drawText('Indigen World', { x: M + (first ? 50 : 32), y: H - (first ? 40 : 26), size: first ? 17 : 11, font: bold, color: rgb(1, 1, 1) });
    if (first) page.drawText('Financial Management & Audit Centre', { x: M + 50, y: H - 56, size: 9, font: regular, color: PALE });
    const title = pdfSafe(report.title);
    const size = first ? 13 : 10;
    page.drawText(title, { x: W - M - bold.widthOfTextAtSize(title, size), y: H - (first ? 38 : 26), size, font: bold, color: rgb(1, 1, 1) });
    const period = pdfSafe(`${report.from} to ${report.to}`);
    if (first) page.drawText(period, { x: W - M - regular.widthOfTextAtSize(period, 9), y: H - 54, size: 9, font: regular, color: PALE });
    y = H - band - 22;
  };

  const ensure = (needed: number) => { if (y - needed < M + 24) header(false); };

  header(true);

  if (report.summary) {
    const s = report.summary;
    const items: [string, number, 'in' | 'out' | 'neutral'][] = [
      ['Opening balance', s.openingMinor, 'neutral'], ['Income', s.incomeMinor, 'in'], ['Refunds paid', -s.refundsOutMinor, 'out'], ['Expenditure', -s.expenseMinor, 'out'],
      ['Refunds received', s.refundsInMinor, 'in'], ['Adjustments', s.adjustmentsMinor, 'neutral'], ['Closing balance', s.closingMinor, 'neutral'],
    ];
    const boxW = (W - 2 * M - 6 * 8) / 7;
    items.forEach(([label, value, tone], i) => {
      const x = M + i * (boxW + 8);
      const last = i === items.length - 1;
      page.drawRectangle({ x, y: y - 46, width: boxW, height: 50, color: last ? NAVY : WASH, borderColor: last ? NAVY : LINE, borderWidth: 0.8 });
      page.drawText(label.toUpperCase(), { x: x + 8, y: y - 10, size: 6.5, font: bold, color: last ? PALE : MUTED });
      const text = pdfMoney(value);
      page.drawText(fit(text, bold, 11, boxW - 16), { x: x + 8, y: y - 30, size: 11, font: bold, color: last ? rgb(1, 1, 1) : tone === 'in' && value ? GREEN : tone === 'out' && value ? RED : INK });
    });
    y -= 70;
    const counts = `${s.counts.posted} posted ${s.counts.posted === 1 ? 'entry' : 'entries'}: ${s.counts.income} income, ${s.counts.expense} expense, ${s.counts.transfer} transfer, ${s.counts.refund} refund, ${s.counts.adjustment} adjustment${s.counts.reversed ? `; ${s.counts.reversed} reversed with ${s.counts.reversals} reversal ${s.counts.reversals === 1 ? 'entry' : 'entries'}` : ''}.`;
    page.drawText(pdfSafe(counts), { x: M, y, size: 8.5, font: regular, color: MUTED });
    y -= 22;
  }

  const drawTable = (table: ReportTable) => {
    const weights = table.columns.map((c) => c.weight ?? (c.key === 'description' || c.key === 'reason' ? 3.2 : c.key === 'category' || c.key === 'source' || c.key === 'account' || c.key === 'action' ? 1.8 : c.money ? 1.4 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (W - 2 * M) * w / total);
    const rowH = 15;
    const drawHead = () => {
      page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH + 2, color: NAVY });
      let x = M;
      table.columns.forEach((c, i) => {
        const label = fit(pdfSafe(c.label), bold, 7.5, widths[i] - 8);
        const tx = c.numeric ? x + widths[i] - 4 - bold.widthOfTextAtSize(label, 7.5) : x + 4;
        page.drawText(label, { x: tx, y: y + 1, size: 7.5, font: bold, color: rgb(1, 1, 1) });
        x += widths[i];
      });
      y -= rowH + 2;
    };
    ensure(60);
    page.drawText(pdfSafe(table.title), { x: M, y, size: 11.5, font: bold, color: NAVY });
    page.drawRectangle({ x: M, y: y - 5, width: 28, height: 2, color: BLUE });
    y -= 20;
    drawHead();
    if (!table.rows.length) {
      page.drawText('No records in this period.', { x: M + 4, y, size: 8.5, font: regular, color: MUTED });
      y -= rowH + 10;
      return;
    }
    table.rows.forEach((row, index) => {
      if (y - rowH < M + 24) { header(false); drawHead(); }
      if (index % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: rowH, color: WASH });
      let x = M;
      table.columns.forEach((c, i) => {
        const raw = row[c.key];
        const text = c.money ? pdfMoney(raw == null ? null : Number(raw)) : pdfSafe(raw ?? '');
        const value = fit(text, regular, 7.5, widths[i] - 8);
        const colour = c.money && typeof raw === 'number' && c.key === 'amountMinor' ? (raw < 0 ? RED : raw > 0 ? GREEN : INK) : INK;
        const tx = c.numeric ? x + widths[i] - 4 - regular.widthOfTextAtSize(value, 7.5) : x + 4;
        page.drawText(value, { x: tx, y, size: 7.5, font: regular, color: colour });
        x += widths[i];
      });
      page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: LINE });
      y -= rowH;
    });
    y -= 16;
  };

  for (const table of report.tables) drawTable(table);

  if (report.notes.length) {
    ensure(20 + report.notes.length * 12);
    page.drawText('Notes', { x: M, y, size: 9.5, font: bold, color: NAVY });
    y -= 14;
    for (const note of report.notes) {
      page.drawText(fit(pdfSafe(`* ${note}`), regular, 8, W - 2 * M), { x: M, y, size: 8, font: regular, color: MUTED });
      y -= 12;
    }
  }

  const generated = pdfSafe(`Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC (Africa/Accra) by ${preparedBy}. Figures come from posted ledger entries in Indigen World's finance records.`);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 6 }, end: { x: W - M, y: M + 6 }, thickness: 0.5, color: LINE });
    p.drawText(fit(generated, regular, 7, W - 2 * M - 70), { x: M, y: M - 6, size: 7, font: regular, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 7), y: M - 6, size: 7, font: regular, color: MUTED });
  });
  return doc.save();
}

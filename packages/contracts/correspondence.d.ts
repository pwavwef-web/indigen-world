export interface LetterRun { text: string; bold?: boolean; italic?: boolean; href?: string }
export interface LetterBlock { runs: LetterRun[]; list?: 'bullet' | 'number'; pageBreakBefore?: boolean }
export interface CorrespondenceLetter {
  date: string; reference?: string;
  recipient: { name?: string; organisation?: string; address?: string[]; email?: string };
  subject: string; salutation?: string; body: LetterBlock[]; closing?: string;
  sender: { name: string; role?: string; approvedSignatureId?: string }; enclosures?: string;
}
export const HERITAGE_FRAME: {
  version: string; widthMm: number; heightMm: number; leftMm: number; rightMm: number;
  topMm: number; bottomMm: number; font: string; sizePt: number; linePt: number;
  strokes: { colour: string; width: number; points: number[][] }[];
  diamonds: { colour: string; points: number[][] }[];
};
export function heritageSvg(): string;
export function parseLetterBody(text: string): LetterBlock[];
export function bodyPlainText(body: LetterBlock[]): string;
export function normalizeLetter(input: unknown, options?: { draft?: boolean }): CorrespondenceLetter;
export function letterFilename(letter: CorrespondenceLetter): string;

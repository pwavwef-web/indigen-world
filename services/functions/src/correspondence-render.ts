import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { Resvg } from '@resvg/resvg-js';
import { Document, Packer, Header, Footer, Paragraph, TextRun, ImageRun, ExternalHyperlink,
  AlignmentType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, LineRuleType } from 'docx';
import { HERITAGE_FRAME as design, heritageSvg, normalizeLetter, letterFilename,
  type CorrespondenceLetter, type LetterRun, type LetterBlock } from '@indigen-world/contracts/correspondence';

export const GENERATOR_VERSION = 'correspondence-v1';
const mm = (n: number) => n * 72 / 25.4;
const twip = (n: number) => Math.round(mm(n) * 20);
const navy = rgb(20 / 255, 44 / 255, 80 / 255);
const ink = rgb(0.08, 0.11, 0.16);
const fontBytes = (style: string) => readFileSync(new URL(`../assets/fonts/NotoSans-${style}.ttf`, import.meta.url));
// Approved signature assets must be added by a repository review. Never fetch a caller's URL.
const approvedSignatures: Record<string, string> = {};
function signatureFor(letter: CorrespondenceLetter) {
  const id = letter.sender.approvedSignatureId;
  if (!id) return undefined;
  if (!approvedSignatures[id]) throw new Error('This signature is not approved. Remove it or choose an approved signature.');
  return readFileSync(new URL(`../assets/letterhead/${approvedSignatures[id]}`, import.meta.url));
}
export function letterVersion(letter: CorrespondenceLetter, emailBody = '') {
  return createHash('sha256').update(JSON.stringify({ design: design.version, generator: GENERATOR_VERSION, letter: normalizeLetter(letter), emailBody })).digest('hex');
}
export function sha256(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }

export async function renderLetterPdf(input: CorrespondenceLetter): Promise<Buffer> {
  const letter = normalizeLetter(input), signature = signatureFor(letter);
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  pdf.setTitle(letter.subject); pdf.setAuthor(letter.sender.name); pdf.setCreator(`Indigen World ${design.version} ${GENERATOR_VERSION}`);
  // Fixed metadata makes regenerated versions stable, including attachment hashes.
  pdf.setCreationDate(new Date(`${letter.date}T00:00:00Z`)); pdf.setModificationDate(new Date(`${letter.date}T00:00:00Z`));
  const fonts = await Promise.all(['Regular','Bold','Italic','BoldItalic'].map(s => pdf.embedFont(fontBytes(s), { subset: true })));
  const fontFor = (r: LetterRun): PDFFont => fonts[(r.bold ? 1 : 0) + (r.italic ? 2 : 0)];
  const available = new Set(fonts[0].getCharacterSet());
  // Fail clearly instead of silently replacing an unsupported Unicode character.
  for (const text of [letter.subject, letter.sender.name, letter.sender.role || '', letter.recipient.name || '', letter.recipient.organisation || '', ...(letter.recipient.address || []), letter.salutation || '', letter.closing || '', letter.reference || '', letter.enclosures || '', ...letter.body.flatMap(b => b.runs.map(r => r.text))]) {
    for (const c of text) if (!/[\n\r\t]/.test(c) && !available.has(c.codePointAt(0)!)) throw new Error(`The correspondence font does not contain U+${c.codePointAt(0)!.toString(16).toUpperCase()}. Choose a supported font before generating.`);
  }
  const width = mm(design.widthMm), height = mm(design.heightMm), left = mm(design.leftMm), maxWidth = mm(design.widthMm - design.leftMm - design.rightMm), bottom = mm(design.bottomMm);
  let page!: PDFPage, y = 0;
  const newPage = () => {
    if (pdf.getPageCount() >= 100) throw new Error('This letter exceeds the 100-page limit.');
    page = pdf.addPage([width, height]); y = height - mm(design.topMm) - 12;
    for (const stroke of design.strokes) {
      const colour = stroke.colour.match(/[a-f\d]{2}/gi)!.map(c => parseInt(c, 16) / 255);
      for (let i = 1; i < stroke.points.length; i++) page.drawLine({ start: { x: mm(stroke.points[i-1][0]), y: height-mm(stroke.points[i-1][1]) }, end: { x: mm(stroke.points[i][0]), y: height-mm(stroke.points[i][1]) }, thickness: mm(stroke.width), color: rgb(colour[0],colour[1],colour[2]) });
    }
    for (const diamond of design.diamonds) {
      const colour = diamond.colour.match(/[a-f\d]{2}/gi)!.map(c=>parseInt(c,16)/255);
      page.drawSvgPath(diamond.points.map((p,i)=>`${i?'L':'M'} ${mm(p[0])} ${mm(p[1])}`).join(' ')+' Z',{x:0,y:height,color:rgb(colour[0],colour[1],colour[2])});
    }
    const logoScale=mm(10)/64,logoX=mm(10),logoY=height-mm(17);
    page.drawSvgPath('M16 0 H48 Q64 0 64 16 V48 Q64 64 48 64 H16 Q0 64 0 48 V16 Q0 0 16 0 Z',{x:logoX,y:logoY,scale:logoScale,color:rgb(16/255,28/255,54/255)});
    page.drawSvgPath('M15 47 V23 L32 14 L49 23 V47',{x:logoX,y:logoY,scale:logoScale,borderColor:rgb(142/255,180/255,1),borderWidth:3.6});
    page.drawSvgPath('M24 44 V29 M32 44 V24 M40 44 V29',{x:logoX,y:logoY,scale:logoScale,borderColor:rgb(1,1,1),borderWidth:3.6});
    page.drawCircle({x:logoX+32*logoScale,y:logoY-14*logoScale,size:4*logoScale,color:rgb(34/255,211/255,238/255)});
    const word = 'INDIGEN'; page.drawText(word, { x: left, y: height-mm(25), font: fonts[1], size: 25, color: navy });
    page.drawText(' WORLD', { x: left+fonts[1].widthOfTextAtSize(word,25), y: height-mm(25), font: fonts[0], size: 25, color: navy });
    const site = 'indigenworld.com'; page.drawText(site,{ x: width-mm(24)-fonts[0].widthOfTextAtSize(site,9), y: mm(18), font: fonts[0], size: 9, color: navy });
  };
  type Token = { run: LetterRun; text: string; width: number };
  function lines(runs: LetterRun[], limit: number, size = design.sizePt): Token[][] {
    const output: Token[][] = [[]]; let used = 0;
    const put = (text: string, run: LetterRun) => {
      const w = fontFor(run).widthOfTextAtSize(text, size);
      if (used + w > limit && output.at(-1)!.length) { output.push([]); used = 0; if (/^\s+$/.test(text)) return; }
      output.at(-1)!.push({ run, text, width: w }); used += w;
    };
    for (const run of runs) for (const word of run.text.replace(/\t/g, '    ').split(/(\n|[^\S\n]+|[^\s]+)/u).filter(Boolean)) {
      if (word === '\n') { output.push([]); used = 0; continue; }
      if (fontFor(run).widthOfTextAtSize(word,size) > limit) {
        // Split long addresses/URLs at grapheme boundaries so combining marks stay attached.
        for (const { segment } of new Intl.Segmenter('und',{granularity:'grapheme'}).segment(word)) put(segment,run);
      } else put(word,run);
    }
    return output;
  }
  let number = 0;
  function block(b: LetterBlock, options: { keepNext?: boolean; after?: number } = {}) {
    if (b.pageBreakBefore) newPage();
    number = b.list === 'number' ? number + 1 : 0;
    const indent = b.list ? 16 : 0, marker = b.list === 'bullet' ? '•' : b.list === 'number' ? `${number}.` : '';
    const wrapped = lines(b.runs, maxWidth-indent);
    if (y - Math.min(wrapped.length,2)*design.linePt - (options.keepNext ? 2*design.linePt : 0) < bottom) newPage();
    wrapped.forEach((line, index) => {
      if (y-design.linePt < bottom) newPage();
      if (index === 0 && marker) page.drawText(marker, { x:left, y, font:fonts[0], size:design.sizePt, color:ink });
      let x = left + indent;
      for (const token of line) {
        page.drawText(token.text, { x, y, font:fontFor(token.run), size:design.sizePt, color: token.run.href ? navy : ink });
        if (token.run.href && token.width) {
          const link = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x,y-2,x+token.width,y+12], Border:[0,0,0], A:{Type:'Action',S:'URI',URI:PDFString.of(token.run.href)} }));
          page.node.addAnnot(link); page.drawLine({start:{x,y:y-1.5},end:{x:x+token.width,y:y-1.5},thickness:0.4,color:navy});
        }
        x += token.width;
      }
      y -= design.linePt;
    });
    y -= options.after ?? 8;
  }
  const plain = (text: string, bold = false, keepNext = false, after = 8) => { if (text) block({runs:[{text,bold}]},{keepNext,after}); };
  newPage();
  plain(letter.date + (letter.reference ? `    Reference: ${letter.reference}` : ''));
  [letter.recipient.name,letter.recipient.organisation,...(letter.recipient.address || []),letter.recipient.email].filter(Boolean).forEach(s => plain(s!,false,true,0));
  y -= 12; plain(letter.subject,true,true,12); plain(letter.salutation || '',false,true);
  for (const b of letter.body) block(b);
  const signatureImage = signature ? await pdf.embedPng(signature) : undefined;
  const closingLines = [letter.closing,letter.sender.name,letter.sender.role].filter(Boolean);
  const closingHeight = closingLines.reduce((sum,text) => sum+lines([{text:text!}],maxWidth).length*design.linePt+4, 0) + (signatureImage ? 48 : 0);
  if (closingHeight > height-mm(design.topMm)-bottom) throw new Error('The sender block is too long for one page.');
  if (y-closingHeight < bottom) newPage();
  plain(letter.closing || '',false,true,4);
  if (signatureImage) { const ratio = signatureImage.width/signatureImage.height; page.drawImage(signatureImage,{x:left,y:y-40,width:Math.min(120,40*ratio),height:Math.min(40,120/ratio)}); y-=48; }
  plain(letter.sender.name,true,Boolean(letter.sender.role),4); plain(letter.sender.role || '',false,false,4);
  if (letter.enclosures) { y-=12; plain(`Enclosures: ${letter.enclosures}`); }
  // Identity metadata supports checking the exact generated content and design.
  pdf.catalog.set(PDFName.of('IWLetterVersion'),PDFString.of(letterVersion(letter)));
  return Buffer.from(await pdf.save());
}

export async function renderLetterDocx(input: CorrespondenceLetter): Promise<Buffer> {
  const letter = normalizeLetter(input), signature = signatureFor(letter);
  const svg = Buffer.from(heritageSvg());
  const fallback = new Resvg(svg,{fitTo:{mode:'width',value:1680}}).render().asPng();
  const artwork = new ImageRun({ type:'svg', data:svg, fallback:{type:'png',data:fallback}, transformation:{width:210*96/25.4,height:297*96/25.4}, altText:{title:'Heritage Frame',description:'Navy, cobalt and pale blue geometric frame',name:'Heritage Frame'}, floating:{horizontalPosition:{relative:HorizontalPositionRelativeFrom.PAGE,offset:0},verticalPosition:{relative:VerticalPositionRelativeFrom.PAGE,offset:0},behindDocument:true,allowOverlap:true,wrap:{type:TextWrappingType.NONE}} });
  const run = (r: LetterRun) => {
    return r.text.split('\n').map((line,i)=>{
      const text=new TextRun({text:line,...(i?{break:1}:{}),font:design.font,size:22,bold:r.bold,italics:r.italic,color:r.href?'142C50':'141C29',...(r.href?{underline:{}}:{})});
      return r.href?new ExternalHyperlink({link:r.href,children:[text]}):text;
    });
  };
  let number = 0;
  const para = (b: LetterBlock, keepNext = false, after = 160) => {
    number = b.list === 'number' ? number+1 : 0;
    return new Paragraph({children:[...(b.list ? [new TextRun({text:b.list === 'bullet' ? '•\t' : `${number}.\t`,font:design.font,size:22})] : []),...b.runs.flatMap(run)],spacing:{line:320,lineRule:LineRuleType.EXACT,after},widowControl:true,keepNext,pageBreakBefore:b.pageBreakBefore,...(b.list ? {indent:{left:320,hanging:320},tabStops:[{type:'left',position:320}]} : {})});
  };
  const plain = (text: string,bold = false,keepNext = false,after = 160) => para({runs:[{text,bold}]},keepNext,after);
  const children: Paragraph[] = [plain(letter.date+(letter.reference ? `    Reference: ${letter.reference}` : ''))];
  [letter.recipient.name,letter.recipient.organisation,...(letter.recipient.address||[]),letter.recipient.email].filter(Boolean).forEach(s=>children.push(plain(s!,false,true,0)));
  children.push(new Paragraph({spacing:{line:240,lineRule:LineRuleType.EXACT,after:0},children:[]}));
  children.push(plain(letter.subject,true,true,240));
  if (letter.salutation) children.push(plain(letter.salutation,false,true));
  children.push(...letter.body.map(b=>para(b)));
  if (letter.closing) children.push(plain(letter.closing,false,true,80));
  if (signature) children.push(new Paragraph({keepNext:true,children:[new ImageRun({type:'png',data:signature,transformation:{width:140,height:45}})]}));
  children.push(plain(letter.sender.name,true,Boolean(letter.sender.role),80));
  if (letter.sender.role) children.push(plain(letter.sender.role,false,false,80));
  if (letter.enclosures) children.push(new Paragraph({children:[new TextRun({text:`Enclosures: ${letter.enclosures}`,font:design.font,size:22,color:'141C29'})],spacing:{before:240,line:320,lineRule:LineRuleType.EXACT,after:160}}));
  const doc = new Document({ title:letter.subject,creator:letter.sender.name,description:`${design.version}; ${letterVersion(letter)}`,
    fonts: ['Regular','Bold','Italic','BoldItalic'].map(style=>({name:style==='Regular'?design.font:`${design.font} ${style}`,data:fontBytes(style)})),
    styles:{default:{document:{run:{font:design.font,size:22},paragraph:{spacing:{line:320,lineRule:LineRuleType.EXACT,after:160}}}}},
    sections:[{properties:{page:{size:{width:twip(210),height:twip(297)},margin:{left:twip(design.leftMm),right:twip(design.rightMm),top:twip(design.topMm),bottom:twip(design.bottomMm),header:twip(18),footer:twip(15)}}},
      headers:{default:new Header({children:[new Paragraph({children:[artwork,new TextRun({text:'INDIGEN',bold:true,font:design.font,size:50,color:'142C50'}),new TextRun({text:' WORLD',font:design.font,size:50,color:'142C50'})]})]})},
      footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,indent:{right:-twip(14)},children:[new TextRun({text:'indigenworld.com',font:design.font,size:18,color:'142C50'})]})]})},children}],
  });
  const zip=await JSZip.loadAsync(await Packer.toBuffer(doc));
  // docx 9 emits font part URIs containing spaces, which Word rejects as
  // corrupt. Give every embedded font a valid OPC part name and bind all four
  // typefaces to the same Noto Sans family instead of four unrelated families.
  let relationships=await zip.file('word/_rels/fontTable.xml.rels')!.async('string');
  for (const path of Object.keys(zip.files).filter(p=>p.endsWith('.odttf'))) {
    const safe=path.replace(/ /g,'_');
    zip.file(safe,await zip.file(path)!.async('nodebuffer'));zip.remove(path);
    relationships=relationships.replaceAll(path.slice(5),safe.slice(5));
  }
  zip.file('word/_rels/fontTable.xml.rels',relationships);
  const table=await zip.file('word/fontTable.xml')!.async('string'),families=table.match(/<w:font w:name="[^"]+">[\s\S]*?<\/w:font>/g)!;
  const extra=families.slice(1).map((family,i)=>family.match(/<w:embedRegular[^>]*\/>/)![0].replace('embedRegular',['embedBold','embedItalic','embedBoldItalic'][i])).join('');
  zip.file('word/fontTable.xml',table.replace(/<w:font w:name="[^"]+">[\s\S]*?<\/w:font>/g,'').replace('</w:fonts>',families[0].replace('</w:font>',extra+'</w:font>')+'</w:fonts>'));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
export async function generateLetterFiles(letter: CorrespondenceLetter) {
  // Validate/render PDF first: if a font or signature is unavailable, neither format ships.
  const pdf = await renderLetterPdf(letter), docx = await renderLetterDocx(letter);
  return { pdf, docx, filename:letterFilename(letter), version:letterVersion(letter), pdfSha256:sha256(pdf), designVersion:design.version, generatorVersion:GENERATOR_VERSION };
}

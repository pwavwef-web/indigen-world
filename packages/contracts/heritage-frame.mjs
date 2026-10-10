// Coordinates traced from the supplied Heritage Frame reference, in millimetres.
// The mark is reused from TribeStudio's existing favicon with no invented identity.
const navy = '#0A2C6A', cobalt = '#1769B5', pale = '#B7D1EB';
const motif = [
  [cobalt,.36,[[0,0],[0,5],[6,11],[0,17]]],
  [pale,.44,[[3,0],[3,4],[11,12],[4,19],[0,21]]],
  [navy,.36,[[6,0],[3,3],[12,12],[0,24]]],
  [pale,.48,[[9,0],[12,3],[7,8],[7,15]]],
  [cobalt,.34,[[12,17],[5,24],[12,31]]],
  [navy,.45,[[12,20],[8,24],[12,28]]],
  [pale,.48,[[0,24],[9,33]]],
  [navy,.36,[[0,29],[12,41],[12,47],[0,59]]],
  [cobalt,.36,[[0,33],[9,42],[0,51],[12,63],[12,70],[0,82]]],
  [pale,.48,[[0,37],[9,46],[0,55],[9,64],[0,73]]],
  [navy,.4,[[6,44],[12,50],[6,56],[0,50],[6,44]]],
  [pale,.48,[[3,39],[9,45],[3,51],[0,48]]],
  [cobalt,.36,[[12,76],[0,88],[0,94],[6,100]]],
  [navy,.36,[[12,79],[5,86],[12,93]]],
  [pale,.48,[[0,84],[6,90],[0,96],[6,102]]],
  [cobalt,.36,[[6,88],[12,94],[6,100],[0,94],[6,88]]],
];
const strokes = [], diamonds = [];
for (const offset of [8,108,208]) {
  for (const [colour,width,points] of motif) {
    const clipped = points.filter(p => p[1]+offset <= 287);
    if (clipped.length > 1) strokes.push({colour,width,points:clipped.map(p=>[190+p[0],offset+p[1]])});
  }
  for (const [x,y,r,colour] of [[10.5,24,2,navy],[6,50,3,cobalt],[7,82,1.8,cobalt],[6,94,3,cobalt]]) {
    if (offset+y+r<=287) diamonds.push({colour,points:[[190+x,offset+y-r],[190+x+r,offset+y],[190+x,offset+y+r],[190+x-r,offset+y]]});
  }
  for (const [x,y] of [[1,12],[1,98]]) if(offset+y+1<287) strokes.push({colour:cobalt,width:.3,points:[[190+x,offset+y-1],[191+x,offset+y],[190+x,offset+y+1],[189+x,offset+y],[190+x,offset+y-1]]});
}
strokes.push(
  {colour:cobalt,width:.36,points:[[10,264],[18,272],[18,277],[25,277],[25,283],[33,291]]},
  {colour:navy,width:.36,points:[[10,269],[17,276],[17,278],[24,278],[24,284],[28,284],[35,291]]},
  {colour:pale,width:.48,points:[[10,278],[14,274],[20,280],[20,283],[27,290],[24,293],[21,290],[24,287],[27,290]]},
  {colour:cobalt,width:.3,points:[[17,282],[27,282],[35,290]]},
);
diamonds.push({colour:navy,points:[[14,278],[18,282],[14,286],[10,282]]});
// Leave at least 10 mm around the lower ornament for office printers.
for (const stroke of strokes.slice(-4)) stroke.points=stroke.points.map(([x,y])=>[x,y-6]);
diamonds.at(-1).points=diamonds.at(-1).points.map(([x,y])=>[x,y-6]);
export const HERITAGE_FRAME = Object.freeze({version:'heritage-frame-v1',widthMm:210,heightMm:297,leftMm:22,rightMm:38,topMm:43,bottomMm:28,font:'Noto Sans',sizePt:11,linePt:16,strokes,diamonds});
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#101C36"/><path d="M15 47V23l17-9 17 9v24" fill="none" stroke="#8EB4FF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 44V29m8 15V24m8 20V29" fill="none" stroke="#FFF" stroke-width="3.6" stroke-linecap="round"/><circle cx="32" cy="14" r="4" fill="#22D3EE"/></svg>`;
export function heritageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">${strokes.map(s=>`<polyline fill="none" stroke="${s.colour}" stroke-width="${s.width}" points="${s.points.map(p=>p.join(',')).join(' ')}"/>`).join('')}${diamonds.map(d=>`<polygon fill="${d.colour}" points="${d.points.map(p=>p.join(',')).join(' ')}"/>`).join('')}<svg x="10" y="17" width="10" height="10" viewBox="0 0 64 64">${LOGO_SVG.slice(LOGO_SVG.indexOf('>')+1,-6)}</svg></svg>`;
}

// Renders the designed art for release posts: a 1200x630 cover and framed
// 1600x1000 figures that set real screenshots in a phone, browser window or card
// on a branded background.
//
//   node apps/updates-blog/scripts/render-post-art.mjs [post-folder-name ...]
//
// Each post folder holds an art.json spec and the raw screenshots in screens/.
// Output goes to images/ (cover.png and <screen-name>.jpg). The screenshots are
// never altered, only framed; the frame, background and titles are illustration.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const postsDir = join(here, '..', 'posts');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9341;

const PALETTES = {
  blue: ['#0b1225', '#19327f', '#2457d6', '#22d3ee'],
  teal: ['#06201f', '#0b4d52', '#12857f', '#80f4cf'],
  green: ['#07210f', '#0f4a2a', '#2b8a4b', '#f5c451'],
  amber: ['#1d1206', '#6b3a0c', '#c27a1c', '#ffd98a'],
  violet: ['#140b2e', '#3b1f7a', '#6f3fd1', '#22d3ee'],
  rose: ['#260a16', '#7a1c3f', '#c23a66', '#f5c451'],
};

const logoSvg = '<svg viewBox="0 0 64 64" width="46" height="46"><rect width="64" height="64" rx="16" fill="#101C36"/><path d="M15 47V23l17-9 17 9v24" fill="none" stroke="#8EB4FF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 44V29m8 15V24m8 20V29" fill="none" stroke="#FFF" stroke-width="3.6" stroke-linecap="round"/><circle cx="32" cy="14" r="4" fill="#22D3EE"/></svg>';

const css = `
*{box-sizing:border-box;margin:0}
html,body{width:100%;height:100%;overflow:hidden;font-family:"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;color:#fff}
body{position:relative;background:
 radial-gradient(circle at 84% 12%,var(--glow-a),transparent 42%),
 radial-gradient(circle at 4% 100%,var(--glow-b),transparent 48%),
 linear-gradient(135deg,var(--c0) 0%,var(--c1) 60%,var(--c2) 100%)}
.motif{position:absolute;inset:0;pointer-events:none}
.m-dots{background-image:radial-gradient(rgba(255,255,255,.1) 1.3px,transparent 1.4px);background-size:26px 26px}
.m-weave{background:repeating-linear-gradient(45deg,rgba(255,255,255,.055) 0 2px,transparent 2px 24px),repeating-linear-gradient(-45deg,rgba(255,255,255,.04) 0 2px,transparent 2px 24px)}
.m-rings{background:repeating-radial-gradient(circle at 88% 6%,rgba(255,255,255,.09) 0 2px,transparent 2px 52px),repeating-radial-gradient(circle at 0% 100%,rgba(255,255,255,.06) 0 2px,transparent 2px 60px)}
.m-chevrons{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='28'%3E%3Cpath d='M0 20 14 6l14 14 14-14 14 14' fill='none' stroke='white' stroke-opacity='.09' stroke-width='2'/%3E%3C/svg%3E");background-size:56px 28px}
.eyebrow{font-weight:700;letter-spacing:.17em;text-transform:uppercase;color:var(--glow-c)}
.phone{position:relative;flex:none;width:var(--w);aspect-ratio:1170/2532;padding:calc(var(--w)*.035);border-radius:calc(var(--w)*.15);background:linear-gradient(145deg,#2a2f3a,#0c0f15 40%,#1b1f27);box-shadow:0 0 0 2px rgba(255,255,255,.08) inset,0 40px 80px rgba(4,10,25,.55),0 12px 24px rgba(4,10,25,.35)}
.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% var(--y,0%);border-radius:calc(var(--w)*.118);background:#fff}
.phone::after{content:"";position:absolute;top:calc(var(--w)*.058);left:50%;width:calc(var(--w)*.06);aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:#05070b}
.browser{position:relative;flex:none;width:var(--w);border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 40px 80px rgba(4,10,25,.55),0 0 0 2px rgba(255,255,255,.14)}
.browser .bar{height:calc(var(--w)*.045);min-height:26px;background:#e8edf5;display:flex;align-items:center;gap:7px;padding:0 14px}
.browser .bar i{width:calc(var(--w)*.012);min-width:8px;aspect-ratio:1;border-radius:50%;background:#b7c2d6}
.browser .view{width:100%;height:var(--h);overflow:hidden}
.browser img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% var(--y,0%)}
.card{position:relative;flex:none;width:var(--w);height:var(--h);border-radius:26px;overflow:hidden;background:#fff;box-shadow:0 40px 80px rgba(4,10,25,.55),0 0 0 2px rgba(255,255,255,.16)}
.card img{display:block;width:100%;height:100%;object-fit:contain}
.pill{display:inline-flex;align-items:center;gap:9px;padding:9px 16px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);font-weight:600;white-space:nowrap}
.pill .dot{width:10px;height:10px;border-radius:50%;background:var(--glow-c);box-shadow:0 0 12px var(--glow-c)}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;letter-spacing:-.2px}
/* cover */
.cover .brand{position:absolute;left:72px;top:42px;font-size:22px}
.cover .copy{position:absolute;left:72px;top:112px;width:520px;bottom:48px;display:flex;flex-direction:column;justify-content:center}
.cover .eyebrow{font-size:16px}
.cover h1{margin-top:16px;font-size:var(--tsize,50px);line-height:1.04;font-weight:800;letter-spacing:-1.2px}
.cover p{margin-top:18px;font-size:19px;line-height:1.45;color:rgba(255,255,255,.84)}
.cover .tags{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.cover .pill{font-size:16px;padding:8px 15px}
.hero{position:absolute;left:600px;top:0;width:600px;height:630px}
.hero>*{position:absolute}
/* figure */
.fig .copy{position:absolute;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}
.fig .brand{position:absolute;top:56px;font-size:24px}
.fig .eyebrow{font-size:21px}
.fig h1{margin-top:18px;font-size:54px;line-height:1.05;font-weight:800;letter-spacing:-1.4px}
.fig p{margin-top:22px;font-size:25px;line-height:1.45;color:rgba(255,255,255,.84)}
.fig .dev{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;width:980px}
`;

function pageHtml(job) {
  const [c0, c1, c2, glow] = PALETTES[job.accent] || PALETTES.blue;
  const data = JSON.stringify(job).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><style>${css}</style>
<body style="--c0:${c0};--c1:${c1};--c2:${c2};--glow-a:${glow}47;--glow-b:${c2}57;--glow-c:${glow}">
<div class="motif m-${job.motif || 'dots'}"></div><div id="root"></div>
<script>
const job=${data};
const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const load=(src)=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('image '+src));i.src=src;});
function kindOf(img,over){if(over)return over;const r=img.naturalWidth/img.naturalHeight;return r<0.7?'phone':'browser';}
function device(img,src,kind,box,y){
  // box: {w,h} the space the device may fill; returns {html,w,h}
  const r=img.naturalHeight/img.naturalWidth;
  if(kind==='phone'){const h=box.h,w=Math.min(box.w,h*1170/2532);return{w,h:w*2532/1170,html:'<div class="phone" style="--w:'+w+'px;--y:'+y+'%"><img src="'+src+'"></div>'};}
  if(kind==='card'){let w=box.w,h=w*r;if(h>box.h){h=box.h;w=h/r;}return{w,h,html:'<div class="card" style="--w:'+w+'px;--h:'+h+'px"><img src="'+src+'"></div>'};}
  const bar=Math.max(26,box.w*0.045);let w=box.w;const maxView=box.h-bar;let vh=Math.min(w*r,maxView,w*0.78);
  if(w*r<vh)vh=w*r;
  return{w,h:vh+bar,html:'<div class="browser" style="--w:'+w+'px;--h:'+vh+'px;--y:'+y+'%"><div class="bar"><i></i><i></i><i></i></div><div class="view"><img src="'+src+'"></div></div>'};
}
(async()=>{
  const root=document.getElementById('root');
  if(job.type==='figure'){
    document.body.className='fig';
    const img=await load(job.src);const kind=kindOf(img,job.kind);
    const d=device(img,job.src,kind,kind==='phone'?{w:520,h:880}:{w:900,h:800},job.y??0);
    const flip=!!job.flip;
    root.innerHTML='<div class="brand" style="'+(flip?'right':'left')+':90px">'+${JSON.stringify(logoSvg)}+'<span>Indigen World Updates</span></div>'
      +'<div class="copy" style="'+(flip?'right':'left')+':90px"><div class="eyebrow">'+esc(job.eyebrow)+'</div><h1>'+esc(job.title)+'</h1>'+(job.note?'<p>'+esc(job.note)+'</p>':'')+'</div>'
      +'<div class="dev" style="'+(flip?'left':'right')+':20px">'+d.html+'</div>';
  }else{
    document.body.className='cover';
    const imgs=await Promise.all(job.hero.map(async(h)=>{const i=await load(h.src);return{i,h,kind:kindOf(i,h.kind)};}));
    const phones=imgs.filter((x)=>x.kind==='phone'),browsers=imgs.filter((x)=>x.kind==='browser'),cards=imgs.filter((x)=>x.kind==='card');
    let hero='';
    const place=(x,box,css)=>{const d=device(x.i,x.h.src,x.kind,box,x.h.y??0);return'<div style="'+css(d)+'">'+d.html+'</div>';};
    const main=browsers[0]||cards[0];
    if(main){
      const d=device(main.i,main.h.src,main.kind,{w:main===browsers[0]?560:520,h:main===browsers[0]?400:470},main.h.y??0);
      const second=phones[0]||(main===browsers[0]?cards[0]:null);
      const withPhone=!!second;
      hero+='<div style="left:'+(withPhone?0:20)+'px;top:'+((630-d.h)/2-(withPhone?30:0))+'px;transform:rotate(-2.5deg)">'+d.html+'</div>';
      if(withPhone)hero+=place(second,second.kind==='phone'?{w:210,h:454}:{w:230,h:330},()=>'right:'+(second.kind==='phone'?6:34)+'px;top:'+(second.kind==='phone'?150:200)+'px;transform:rotate(5deg)');
    }else if(phones.length===1){
      hero+=place(phones[0],{w:290,h:590},()=>'left:150px;top:20px;transform:rotate(4deg)');
    }else{
      hero+=place(phones[0],{w:262,h:567},()=>'left:20px;top:30px;transform:rotate(-6deg);z-index:2');
      hero+=place(phones[1],{w:250,h:541},()=>'right:20px;top:62px;transform:rotate(5deg)');
    }
    root.innerHTML='<div class="brand">'+${JSON.stringify(logoSvg)}+'<span>Indigen World Updates</span></div>'
      +'<div class="copy"><div class="eyebrow">'+esc(job.eyebrow)+'</div><h1 style="--tsize:'+(job.tsize||50)+'px">'+esc(job.title)+'</h1><p>'+esc(job.lede)+'</p>'
      +'<div class="tags">'+(job.tags||[]).slice(0,3).map((t)=>'<span class="pill"><span class="dot"></span>'+esc(t)+'</span>').join('')+'</div></div>'
      +'<div class="hero">'+hero+'</div>';
  }
  await document.fonts.ready;window.__ready=true;
})().catch((e)=>{window.__error=String(e);window.__ready=true;});
</script>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function collectJobs(names) {
  const scratch = mkdtempSync(join(tmpdir(), 'iw-art-pages-'));
  const jobs = [];
  const folders = names.length ? names : readdirSync(postsDir).filter((n) => existsSync(join(postsDir, n, 'art.json')));
  for (const name of folders) {
    const dir = join(postsDir, name);
    const spec = JSON.parse(readFileSync(join(dir, 'art.json'), 'utf8'));
    const src = (file) => pathToFileURL(join(dir, 'screens', file)).href;
    mkdirSync(join(dir, 'images'), { recursive: true });
    const base = { accent: spec.accent, motif: spec.motif };
    jobs.push({
      name, out: join(dir, 'images', 'cover.png'), width: 1200, height: 630, format: 'png',
      scratch,
      job: {
        ...base, type: 'cover', eyebrow: spec.eyebrow, title: spec.title, lede: spec.lede, tsize: spec.tsize,
        tags: spec.tags, hero: spec.hero.map((h) => (typeof h === 'string' ? { src: src(h) } : { ...h, src: src(h.file) })),
      },
    });
    let n = 0;
    for (const [file, fig] of Object.entries(spec.figures || {})) {
      jobs.push({
        name, out: join(dir, 'images', `${basename(file, extname(file))}.jpg`), width: 1600, height: 1000, format: 'jpeg',
        scratch,
        job: { ...base, ...(fig.accent ? { accent: fig.accent } : {}), type: 'figure', eyebrow: fig.eyebrow || spec.figureEyebrow || spec.eyebrow, title: fig.title, note: fig.note, kind: fig.kind, y: fig.y, flip: n % 2 === 1, src: src(file) },
      });
      n += 1;
    }
  }
  return jobs;
}

const jobs = collectJobs(process.argv.slice(2));
const browser = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'iw-art-chrome-'))}`,
  '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
], { stdio: 'ignore' });

try {
  let tab;
  for (let a = 0; a < 60 && !tab; a += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (r.ok) tab = await r.json();
    } catch { /* starting */ }
    if (!tab) await sleep(200);
  }
  if (!tab) throw new Error('Chrome did not start');
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  let count = 0;
  for (const j of jobs) {
    const file = join(j.scratch, `page-${count += 1}.html`);
    writeFileSync(file, pageHtml(j.job));
    await send('Emulation.setDeviceMetricsOverride', { width: j.width, height: j.height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    for (let w = 0; w < 120; w += 1) {
      const { result } = await send('Runtime.evaluate', { expression: 'window.__ready === true' });
      if (result.value === true) break;
      await sleep(100);
    }
    const { result: err } = await send('Runtime.evaluate', { expression: 'window.__error || ""' });
    if (err.value) throw new Error(`${j.name} ${basename(j.out)}: ${err.value}`);
    await sleep(120);
    const shot = await send('Page.captureScreenshot', {
      format: j.format, quality: j.format === 'jpeg' ? 90 : undefined,
      clip: { x: 0, y: 0, width: j.width, height: j.height, scale: 1 },
    });
    writeFileSync(j.out, Buffer.from(shot.data, 'base64'));
    console.log('rendered', j.name, basename(j.out));
  }
  socket.close();
} finally {
  browser.kill();
}

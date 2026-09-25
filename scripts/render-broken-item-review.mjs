import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const output = resolve('artifacts/broken-item-review');
await mkdir(output, { recursive: true });
let executable;
for (const path of [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean)) {
  try { await access(path); executable = path; break; } catch { /* Check next browser. */ }
}
if (!executable) throw new Error('Chrome or Edge is required.');
let complete, fail;
const completed = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
const received = new Set();
async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function handle(request, response, next) {
  if (request.method !== 'POST') return next();
  if (request.url === '/__broken-review-failed') {
    fail(new Error((await body(request)).toString())); response.end(); return;
  }
  if (request.url === '/__broken-review-complete') {
    const report = JSON.parse((await body(request)).toString());
    const expected = report.items.flatMap(({ id }) => report.views.flatMap(view => [`${id}-${view.id}`, `${id}-intact-${view.id}`])).concat(report.views.map(view => `grid-${view.id}`));
    if (report.items.length !== 10 || expected.some(id => !received.has(id))) throw new Error('Incomplete model captures');
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
    const cards = report.items.map(({ id, label }, index) => `<article><h2>${String(index + 1).padStart(2, '0')} ${label}</h2><div class="pair"><figure><figcaption>Intact</figcaption><a class="model" data-state="intact" href="${id}-intact-front.png" target="_blank"><img src="${id}-intact-front.png" alt="Intact ${label}"></a></figure><figure><figcaption>Broken</figcaption><a class="model" data-state="broken" href="${id}-front.png" target="_blank"><img src="${id}-front.png" alt="Broken ${label}"></a></figure></div></article>`).join('');
    await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Broken item review</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#102029;color:#f0e5d1;font:16px system-ui}header{max-width:1100px}h1{font-size:32px;margin:0 0 12px}p{color:#aec2ca;line-height:1.6}nav{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}button,a{color:inherit}button{font:inherit;background:#243e49;border:1px solid #6c8790;padding:10px 18px;border-radius:4px;cursor:pointer}button[aria-pressed=true]{background:#eadbc0;color:#102029}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:18px}article{background:#45565e;padding:16px;border:1px solid #35505d;border-radius:6px}h2{font-size:18px;margin:0}img{width:100%;display:block}.pair{display:grid;grid-template-columns:1fr 1fr}figure{margin:14px 0 0}figcaption{color:#e0e8eb;text-align:center}footer{margin-top:24px}</style><header><h1>Broken item review</h1><p>All 10 breakable items. Each pair uses the same camera and display size.<br>Select a view. Click a model to enlarge it. Current game geometry and boat storage poses.</p></header><nav>${report.views.map((v,i)=>`<button data-view="${v.id}" aria-pressed="${i===0}">${v.label}</button>`).join('')}</nav><main>${cards}</main><footer>Full grids: ${report.views.map(v=>`<a href="grid-${v.id}.png">${v.label}</a>`).join(' · ')}</footer><script>const ids=${JSON.stringify(report.items.map(i=>i.id))};for(const button of document.querySelectorAll('button'))button.onclick=()=>{for(const b of document.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));document.querySelectorAll('.model').forEach((a,i)=>{a.href=ids[Math.floor(i/2)]+'-'+(a.dataset.state==='intact'?'intact-':'')+button.dataset.view+'.png';a.firstElementChild.src=a.href})};</script></html>`);
    response.end(); complete(); return;
  }
  const id = /^\/__broken-review\/([\w-]+)$/.exec(request.url ?? '')?.[1];
  if (!id) return next();
  await writeFile(resolve(output, `${id}.png`), await body(request));
  received.add(id); console.log(`Captured ${id}`); response.end();
}
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, watch: { ignored: [`${output.replaceAll('\\', '/')}/**`] } }, plugins: [{ name: 'broken-item-review', configureServer(server) {
  server.middlewares.use((request, response, next) => { handle(request, response, next).catch(error => { response.statusCode = 500; response.end(); fail(error); }); });
} }] });
let browser, timeout;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  const profile = await mkdtemp(resolve(tmpdir(), 'broken-item-review-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/dont-sleep-with-the-fishes/scripts/broken-item-review/index.html`], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  browser.stderr.on('data', chunk => { log = (log + chunk).slice(-8000); });
  browser.once('error', fail);
  browser.once('exit', code => { if (code) fail(new Error(`Browser exited ${code}\n${log}`)); });
  timeout = setTimeout(() => fail(new Error(`Render timed out\n${log}`)), 90000);
  await completed;
  console.log(`Saved ${received.size} images and review page to ${output}`);
} finally { clearTimeout(timeout); browser?.kill(); await vite.close(); }


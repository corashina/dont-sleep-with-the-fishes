// Importance: 95/100. Compile production GPU shaders and verify foam coverage in both water qualities.
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const output = resolve(process.argv[2] ?? 'artifacts/ocean-foam');
const expected = new Set([
  '01-baseline', '02-crest-foam', '03-hull-foam', '04-combined', '05-close', '06-calm',
  '07-night', '08-low', '09-blood', '10-fog', '11-raised-hull', '12-moved-hull', 'comparison', 'motion',
  '13-source-off', '14-moving-hull', '15-origin-scroll', '16-paused', '17-quality-switch',
  '18-context-restored', 'aging-motion', 'hull-motion', 'origin-motion',
]);
const received = new Set();
await mkdir(output, { recursive: true });
const browserPaths = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
let executable;
for (const path of browserPaths) {
  try { await access(path); executable = path; break; } catch { /* Try the next installed browser. */ }
}
if (!executable) throw new Error('Set CHROME_PATH to Chrome or Edge.');
let complete, fail;
const completed = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function handle(request, response, next) {
  if (request.method !== 'POST') return next();
  if (request.url === '/__ocean-preview-failed') {
    fail(new Error((await body(request)).toString())); response.end(); return;
  }
  if (request.url === '/__ocean-preview-complete') {
    await writeFile(resolve(output, 'report.json'), await body(request));
    response.end(); complete(); return;
  }
  const id = /^\/__ocean-preview\/([\w-]+)$/.exec(request.url ?? '')?.[1];
  if (!id || !expected.has(id)) return next();
  await writeFile(resolve(output, `${id}.png`), await body(request));
  received.add(id); console.log(`Captured ${id}`); response.end();
}
const vite = await createServer({ server: { host: '127.0.0.1', port: 0,
  watch: { ignored: [`${output.replaceAll('\\', '/')}/**`] } }, plugins: [{
  name: 'ocean-preview-capture', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      handle(request, response, next).catch(error => { response.statusCode = 500; response.end(); fail(error); });
    });
  },
}] });
let browser, timeout;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  const profile = await mkdtemp(resolve(tmpdir(), 'ocean-preview-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu-sandbox', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${profile}`,
    `http://127.0.0.1:${address.port}/dont-sleep-with-the-fishes/scripts/ocean-foam-lab/index.html?capture${process.argv.includes('--benchmark') ? '&benchmark' : ''}`,
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let browserLog = '';
  browser.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-12000); });
  browser.once('error', fail);
  browser.once('exit', code => { if (code) fail(new Error(`Browser exited ${code}\n${browserLog}`)); });
  timeout = setTimeout(() => fail(new Error(`Preview timed out\n${browserLog}`)), process.argv.includes('--benchmark') ? 300000 : 120000);
  await completed;
  const missing = [...expected].filter(id => !received.has(id));
  if (missing.length) throw new Error(`Missing captures: ${missing.join(', ')}`);
  console.log(`Saved ${received.size} screenshots and report to ${output}`);
} finally {
  clearTimeout(timeout); browser?.kill(); await vite.close();
}

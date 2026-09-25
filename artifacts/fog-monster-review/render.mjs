import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
const output = resolve('artifacts/fog-monster-review');
await mkdir(output, { recursive: true });
let complete, fail;
const completed = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null }, plugins: [{ name: 'fog-review', configureServer(server) {
  server.middlewares.use(async (request, response, next) => {
    if (!request.url?.startsWith('/__fog-review/')) return next();
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (request.url.endsWith('/image')) await writeFile(resolve(output, 'attack.png'), data);
      if (request.url.endsWith('/done')) { await writeFile(resolve(output, 'report.json'), data); complete(); }
      if (request.url.endsWith('/error')) fail(new Error(data.toString()));
      response.end();
    } catch (error) { fail(error); response.end(); }
  });
} }] });
let browser, timeout;
try {
  await server.listen();
  const profile = await mkdtemp(resolve(tmpdir(), 'fog-review-'));
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu-sandbox', '--no-first-run', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.httpServer.address().port}/dont-sleep-with-the-fishes/artifacts/fog-monster-review/index.html`], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  browser.stderr.on('data', data => { log = (log + data).slice(-2000); });
  browser.once('error', fail);
  timeout = setTimeout(() => fail(new Error(log)), 90000);
  await completed;
  console.log(`Saved ${output}/attack.png`);
} finally { clearTimeout(timeout); browser?.kill(); await server.close(); }

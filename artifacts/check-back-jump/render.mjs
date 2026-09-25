import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
const output = resolve('artifacts/check-back-jump');
await mkdir(output, { recursive: true });
let complete, fail;
const completed = new Promise((res, rej) => { complete = res; fail = rej; });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'check-back-capture', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.method !== 'POST' || !request.url.startsWith('/__check-back-')) return next();
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (request.url === '/__check-back-failed') fail(new Error(data.toString()));
      if (request.url === '/__check-back-preview') await writeFile(resolve(output, 'preview.png'), data);
      response.end();
      if (request.url === '/__check-back-complete') { console.log(data.toString()); complete(); }
    });
  }
}] });
let browser, timeout;
try {
  await vite.listen();
  const profile = await mkdtemp(resolve(tmpdir(), 'check-back-render-'));
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `http://127.0.0.1:${vite.httpServer.address().port}/dont-sleep-with-the-fishes/artifacts/check-back-jump/index.html`], { windowsHide: true, stdio: 'ignore' });
  browser.once('error', fail);
  timeout = setTimeout(() => fail(new Error('Render timed out')), 60000);
  await completed;
  console.log('Saved artifacts/check-back-jump/preview.png');
} finally { clearTimeout(timeout); browser?.kill(); await vite.close(); }


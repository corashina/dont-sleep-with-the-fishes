import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createViteServer } from 'vite';

const ROOT = resolve('.');
const OUTPUT_DIR = resolve('src', 'assets', 'models', 'item-thumbnails');
const THUMBNAIL_IDS = await runtimeScavengeItemIds();
const expectedIds = new Set(THUMBNAIL_IDS);

async function runtimeScavengeItemIds() {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(resolve('src', 'game', 'itemCatalog.ts'), 'utf8');
  const declaration = /export const ITEM_IDS = \[([\s\S]*?)\] as const;/.exec(source)?.[1];
  if (!declaration) throw new Error('Unable to read runtime ITEM_IDS');
  return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]).filter((id) => id !== 'energyBar');
}

async function findBrowserPath() {
  const { access } = await import('node:fs/promises');
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((candidate) => typeof candidate === 'string');
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported browser location.
    }
  }
  throw new Error('Could not find Chrome or Edge. Set CHROME_PATH to its executable.');
}

function readRequest(request) {
  return new Promise((resolveRequest, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolveRequest(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const receivedIds = new Set();
  let complete;
  let rejectComplete;
  const completed = new Promise((resolveComplete, reject) => {
    complete = resolveComplete;
    rejectComplete = reject;
  });

  const thumbnailMiddleware = (request, response, next) => {
    void (async () => {
      const upload = /^\/__item-thumbnail\/([^/]+)$/.exec(request.url ?? '');
      if (request.method === 'POST' && upload) {
        const id = upload[1];
        if (!expectedIds.has(id)) {
          response.statusCode = 400;
          response.end('Unknown thumbnail ID');
          return;
        }
        try {
          const bytes = await readRequest(request);
          await writeFile(resolve(OUTPUT_DIR, `${id}.png`), bytes);
          receivedIds.add(id);
          response.statusCode = 204;
          response.end();
        } catch (error) {
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : String(error));
          rejectComplete(error);
        }
        return;
      }
      if (request.method === 'POST' && request.url === '/__item-thumbnail-complete') {
        complete();
        response.statusCode = 204;
        response.end();
        return;
      }
      next();
    })();
  };
  const vite = await createViteServer({
    root: ROOT,
    server: { host: '127.0.0.1', port: 0 },
    appType: 'spa',
    plugins: [{
      name: 'item-thumbnail-upload',
      configureServer(server) {
        server.middlewares.use(thumbnailMiddleware);
      },
    }],
  });

  let browser;
  let timeout;
  try {
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Could not determine Vite port');
    const rendererUrl = `http://127.0.0.1:${address.port}/dont-sleep-with-the-fishes/scripts/item-thumbnail-renderer.html`;
    const executable = await findBrowserPath();
    browser = spawn(executable, [
      '--headless=new',
      '--disable-gpu-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      rendererUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    browser.stderr.on('data', (chunk) => process.stderr.write(chunk));
    browser.once('error', rejectComplete);
    browser.once('exit', (code) => {
      if (code && code !== 0) rejectComplete(new Error(`Browser exited with code ${code}`));
    });
    timeout = setTimeout(() => rejectComplete(new Error('Thumbnail generation timed out after 60 seconds')), 60_000);
    await completed;
    const missing = THUMBNAIL_IDS.filter((id) => !receivedIds.has(id));
    if (missing.length > 0) throw new Error(`Missing thumbnails: ${missing.join(', ')}`);
  } finally {
    if (timeout) clearTimeout(timeout);
    browser?.kill();
    await vite.close();
  }
}

await main();

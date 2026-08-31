import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, preview, type PreviewServer } from 'vite';

const ENV_FILES = ['.env', '.env.local', '.env.playtest', '.env.playtest.local'];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

async function sourceFiles(root: string): Promise<string[]> {
  const listed = git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard');
  return [...new Set([...listed.split('\0').filter(Boolean), ...ENV_FILES])].sort();
}

async function treeFiles(root: string, directory = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const name = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await treeFiles(root, name));
    else files.push(name);
  }
  return files.sort();
}

async function fileState(root: string, files: readonly string[], contents: boolean) {
  const stamps = createHash('sha256');
  const bytes = createHash('sha256');
  for (const name of files) {
    const path = join(root, name);
    let stat;
    try { stat = await lstat(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      stamps.update(`${name}\0missing\0`);
      bytes.update(`${name}\0missing\0`);
      continue;
    }
    if (!stat.isFile()) throw new Error(`Playtest input must be a regular file: ${name}`);
    stamps.update(JSON.stringify([name, stat.size, stat.mtimeMs, stat.ctimeMs, stat.mode]));
    if (contents) {
      const fileHash = createHash('sha256');
      for await (const chunk of createReadStream(path)) fileHash.update(chunk);
      bytes.update(`${name}\0${fileHash.digest('hex')}\0`);
    }
  }
  return { stamp: stamps.digest('hex'), hash: bytes.digest('hex') };
}

async function sourceState(root: string, contents = false) {
  const files = await sourceFiles(root);
  return { ...await fileState(root, files, contents), commit: git(root, 'rev-parse', 'HEAD') };
}

async function buildState(root: string, contents = false) {
  return fileState(root, await treeFiles(root), contents);
}

interface FrozenBuildMetadata {
  status: 'building' | 'ready' | 'invalidated' | 'stopped';
  createdAt: string;
  sourceWorktree: string;
  commit: string;
  sourceHash: string;
  buildHash: string | null;
  serverUrl: string | null;
  invalidatedAt: string | null;
  reason: string | null;
}

export interface FrozenPlaytestOptions {
  readonly sourceRoot: string;
  readonly batchDir: string;
  readonly port: number;
}

export async function startFrozenPlaytest(options: FrozenPlaytestOptions) {
  const root = await realpath(options.sourceRoot);
  await mkdir(options.batchDir, { recursive: true });
  const buildRoot = join(await realpath(options.batchDir), 'build');
  const dist = join(buildRoot, 'dist');
  const metadataPath = join(buildRoot, 'build.json');
  // Never reuse or empty a previous batch's build.
  await mkdir(buildRoot);
  const source = await sourceState(root, true);
  const metadata: FrozenBuildMetadata = {
    status: 'building', createdAt: new Date().toISOString(), sourceWorktree: root,
    commit: source.commit, sourceHash: source.hash, buildHash: null,
    serverUrl: null, invalidatedAt: null, reason: null,
  };
  const saveMetadata = async () => {
    await writeFile(`${metadataPath}.tmp`, `${JSON.stringify(metadata, null, 2)}\n`);
    await rename(`${metadataPath}.tmp`, metadataPath);
  };
  await saveMetadata();
  let server: PreviewServer | undefined;
  let output: Awaited<ReturnType<typeof buildState>>;
  let base = '/';
  try {
    await build({
      root, mode: 'playtest', logLevel: 'warn', clearScreen: false,
      plugins: [{ name: 'frozen-playtest-base', configResolved: (config) => { base = config.base; } }],
      build: { outDir: dist, emptyOutDir: false, watch: null },
    });
    const after = await sourceState(root, true);
    if (after.hash !== source.hash || after.stamp !== source.stamp || after.commit !== source.commit) {
      throw new Error('Source files changed during build. Start a new batch.');
    }
    output = await buildState(dist, true);
    server = await preview({
      configFile: false, envFile: false, root: buildRoot, base, logLevel: 'warn',
      preview: { host: '127.0.0.1', port: options.port, strictPort: true, open: false },
    });
    metadata.buildHash = output.hash;
    metadata.serverUrl = server.resolvedUrls!.local[0]!;
    metadata.status = 'ready';
    await saveMetadata();
  } catch (error) {
    await server?.close();
    metadata.status = 'invalidated';
    metadata.invalidatedAt = new Date().toISOString();
    metadata.reason = String(error);
    await saveMetadata();
    throw error;
  }

  const activeServer = server;
  let finish!: (status: 'stopped' | 'invalidated') => void;
  const closed = new Promise<'stopped' | 'invalidated'>((done) => { finish = done; });
  let timer: ReturnType<typeof setInterval> | undefined;
  let closing: Promise<void> | undefined;
  let checking: Promise<boolean> | undefined;

  const close = (): Promise<void> => {
    if (closing) return closing;
    clearInterval(timer);
    if (metadata.status === 'ready') metadata.status = 'stopped';
    closing = (async () => {
      try {
        if ('closeAllConnections' in activeServer.httpServer) activeServer.httpServer.closeAllConnections();
        await activeServer.close();
        await saveMetadata();
      } finally {
        finish(metadata.status === 'invalidated' ? 'invalidated' : 'stopped');
      }
    })();
    return closing;
  };

  const verify = async (): Promise<boolean> => {
    if (metadata.status !== 'ready') return false;
    try {
      const current = await sourceState(root);
      if (current.stamp !== source.stamp || current.commit !== source.commit) {
        throw new Error('Source files changed. Start a new batch.');
      }
      if ((await buildState(dist)).stamp !== output.stamp) {
        throw new Error('Build files changed. Start a new batch.');
      }
      return true;
    } catch (error) {
      metadata.status = 'invalidated';
      metadata.invalidatedAt = new Date().toISOString();
      metadata.reason = String(error);
      await close();
      return false;
    }
  };
  const checkIntegrity = (): Promise<boolean> => {
    checking ??= verify().finally(() => { checking = undefined; });
    return checking;
  };
  timer = setInterval(() => { void checkIntegrity(); }, 1000);
  if (!await checkIntegrity()) throw new Error(metadata.reason!);
  return { url: metadata.serverUrl, metadataPath, checkIntegrity, close, closed };
}

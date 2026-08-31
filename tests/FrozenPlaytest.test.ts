import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startFrozenPlaytest } from '../scripts/frozenPlaytest';

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof startFrozenPlaytest>>[] = [];

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'frozen-playtest-')));
  roots.push(root);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, '.gitignore'), '.artifacts/\n');
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>');
  await writeFile(join(root, 'src/main.ts'), 'document.body.textContent = "frozen-" + import.meta.env.MODE;');
  await writeFile(join(root, 'vite.config.ts'), 'export default { base: "/game/" };');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '--quiet');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture');
  const batchDir = join(root, '.artifacts/batch');
  await mkdir(batchDir, { recursive: true });
  return { root, batchDir };
}

async function start(root: string, batchDir: string) {
  const server = await startFrozenPlaytest({ sourceRoot: root, batchDir, port: 0 });
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  // Only fixture roots created by mkdtemp belong to these tests.
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('frozen playtest server', () => {
  it('serves a dedicated static playtest build and ignores report writes', async () => {
    const { root, batchDir } = await fixture();
    const server = await start(root, batchDir);
    const html = await (await fetch(server.url)).text();
    expect(html).not.toContain('/@vite/client');
    const asset = html.match(/src="([^"]+\.js)"/)![1]!;
    expect(await (await fetch(new URL(asset, server.url))).text()).toContain('frozen-playtest');
    await writeFile(join(batchDir, 'report.md'), 'first player decision');
    expect(await server.checkIntegrity()).toBe(true);
    const metadata = JSON.parse(await readFile(server.metadataPath, 'utf8'));
    expect(metadata).toMatchObject({ status: 'ready', serverUrl: server.url, sourceWorktree: root });
    expect(metadata.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(metadata.buildHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(['edit', 'add', 'delete', 'environment', 'build'] as const)(
    'stops the batch after a %s change', async (change) => {
      const { root, batchDir } = await fixture();
      const server = await start(root, batchDir);
      if (change === 'delete') await rm(join(root, 'src/main.ts'));
      else {
        const target = {
          edit: join(root, 'src/main.ts'),
          add: join(root, 'src/new.ts'),
          environment: join(root, '.env.playtest.local'),
          build: join(batchDir, 'build/dist/index.html'),
        }[change];
        await writeFile(target, 'changed');
      }
      expect(await server.checkIntegrity()).toBe(false);
      expect(JSON.parse(await readFile(server.metadataPath, 'utf8')).status).toBe('invalidated');
      await expect(fetch(server.url)).rejects.toThrow();
    },
  );

  it('refuses to publish source changes made during the build', async () => {
    const { root, batchDir } = await fixture();
    await writeFile(join(root, 'vite.config.ts'), `
      import { writeFileSync } from 'node:fs';
      export default { plugins: [{ name: 'change-source', closeBundle() {
        writeFileSync(${JSON.stringify(join(root, 'src/main.ts'))}, 'changed during build');
      } }] };
    `);
    await expect(start(root, batchDir)).rejects.toThrow(/changed during build/i);
    expect(JSON.parse(await readFile(join(batchDir, 'build/build.json'), 'utf8')).status).toBe('invalidated');
  });

  it('does not overwrite an existing batch build', async () => {
    const { root, batchDir } = await fixture();
    const server = await start(root, batchDir);
    await server.close();
    await expect(server.closed).resolves.toBe('stopped');
    expect(JSON.parse(await readFile(server.metadataPath, 'utf8')).status).toBe('stopped');
    const before = await readFile(join(batchDir, 'build/dist/index.html'), 'utf8');
    await expect(start(root, batchDir)).rejects.toThrow(/exist/i);
    expect(await readFile(join(batchDir, 'build/dist/index.html'), 'utf8')).toBe(before);
  });

  it('detects changes automatically without a coordinator check', async () => {
    const { root, batchDir } = await fixture();
    const server = await start(root, batchDir);
    await writeFile(join(root, 'src/main.ts'), 'automatic change');
    await expect(server.closed).resolves.toBe('invalidated');
    await expect(fetch(server.url)).rejects.toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describe('Kenney item source guards', () => {
  let root: string;
  let archivePath: string;
  let hash: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kenney-item-sources-'));
    const inputRoot = join(root, 'input');
    await mkdir(join(inputRoot, 'Models', 'GLB format', 'Textures'), { recursive: true });
    await writeFile(join(inputRoot, 'License.txt'), 'CC0');
    await writeFile(join(inputRoot, 'Models', 'GLB format', 'model.glb'), 'model');
    await writeFile(join(inputRoot, 'Models', 'GLB format', 'Textures', 'colormap.png'), 'texture');
    await writeFile(join(inputRoot, 'unapproved-sentinel.txt'), 'must stay archived');
    archivePath = join(root, 'pack.zip');

    const archiveEntries: Array<readonly [string, string]> = [
      [join(inputRoot, 'License.txt'), 'License.txt'],
      [join(inputRoot, 'Models', 'GLB format', 'model.glb'), 'Models/GLB format/model.glb'],
      [join(inputRoot, 'Models', 'GLB format', 'Textures', 'colormap.png'), 'Models/GLB format/Textures/colormap.png'],
      [join(inputRoot, 'unapproved-sentinel.txt'), 'unapproved-sentinel.txt'],
    ];
    const createEntries = archiveEntries
      .map(([source, entry]) => `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, ${quotePowerShell(source)}, ${quotePowerShell(entry)}) | Out-Null`)
      .join('; ');
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $archive = [System.IO.Compression.ZipFile]::Open(${quotePowerShell(archivePath)}, [System.IO.Compression.ZipArchiveMode]::Create); try { ${createEntries} } finally { $archive.Dispose() }`,
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const archiveBuffer = await readFile(archivePath);
    const archiveBytes = new Uint8Array(archiveBuffer.byteLength);
    archiveBytes.set(archiveBuffer);
    hash = createHash('sha256').update(archiveBytes).digest('hex');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function runHelper(command: string) {
    const helperPath = resolve('scripts', 'kenney-item-sources.ps1');
    return spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `. ${quotePowerShell(helperPath)}; ${command}`,
    ], { encoding: 'utf8' });
  }


  it('rejects an archive with a mismatched SHA-256', () => {
    const wrongHash = '0'.repeat(64);
    const result = runHelper(
      `Assert-FileSha256 -Path ${quotePowerShell(archivePath)} -Expected ${quotePowerShell(wrongHash)}`,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Archive SHA-256 mismatch for ${archivePath}`);
    expect(result.stderr).toContain(wrongHash);
    expect(result.stderr).toContain(hash.toUpperCase());
  });

  it('extracts only approved archive entries', async () => {
    const destinationRoot = join(root, 'approved');
    const entries = [
      'License.txt',
      'Models/GLB format/model.glb',
      'Models/GLB format/Textures/colormap.png',
    ];
    const result = runHelper(
      `Expand-ApprovedArchiveEntries -ArchivePath ${quotePowerShell(archivePath)} -DestinationRoot ${quotePowerShell(destinationRoot)} -Entries @(${entries.map(quotePowerShell).join(', ')})`,
    );

    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(join(destinationRoot, 'License.txt'), 'utf8')).resolves.toBe('CC0');
    await expect(readFile(join(destinationRoot, 'Models', 'GLB format', 'model.glb'), 'utf8')).resolves.toBe('model');
    await expect(readFile(join(destinationRoot, 'Models', 'GLB format', 'Textures', 'colormap.png'), 'utf8')).resolves.toBe('texture');
    await expect(readFile(join(destinationRoot, 'unapproved-sentinel.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a missing approved archive entry', () => {
    const destinationRoot = join(root, 'missing');
    const result = runHelper(
      `Expand-ApprovedArchiveEntries -ArchivePath ${quotePowerShell(archivePath)} -DestinationRoot ${quotePowerShell(destinationRoot)} -Entries @('Models/GLB format/missing.glb')`,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing archive entry: Models/GLB format/missing.glb');
  });

  it('rejects a parent-directory archive entry', () => {
    const destinationRoot = join(root, 'unsafe');
    const result = runHelper(
      `Expand-ApprovedArchiveEntries -ArchivePath ${quotePowerShell(archivePath)} -DestinationRoot ${quotePowerShell(destinationRoot)} -Entries @('../escape.glb')`,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unsafe archive entry: ../escape.glb');
  });
});

describe('Kenney item fetch pipeline', () => {
  it('uses pinned pack descriptors without a Poly Pizza path', async () => {
    const source = await readFile(resolve('scripts', 'fetch-item-models.ps1'), 'utf8');

    expect(source).toContain('kenney-item-models.mjs --packs');
    expect(source).toContain('Assert-FileSha256');
    expect(source).toContain('Expand-ApprovedArchiveEntries');
    expect(source).not.toMatch(/poly\.pizza|static\.poly|ResourceID/i);
  });
});

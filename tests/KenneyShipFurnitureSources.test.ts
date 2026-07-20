import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const approvedEntries = [
  'Models/GLTF format/bedBunk.glb',
  'Models/GLTF format/desk.glb',
  'Models/GLTF format/chairDesk.glb',
  'Models/GLTF format/bookcaseOpen.glb',
  'Models/GLTF format/bookcaseClosedDoors.glb',
  'Models/GLTF format/table.glb',
  'Models/GLTF format/sideTableDrawers.glb',
] as const;

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describe('Kenney ship furniture source guards', () => {
  let root: string;
  let archivePath: string;
  let hash: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kenney-ship-furniture-sources-'));
    const inputRoot = join(root, 'input');
    await mkdir(join(inputRoot, 'Models', 'GLTF format'), { recursive: true });
    await writeFile(join(inputRoot, 'License.txt'), 'CC0');
    for (const entry of approvedEntries) {
      await writeFile(join(inputRoot, ...entry.split('/')), entry);
    }
    await writeFile(join(inputRoot, 'unapproved-sentinel.txt'), 'must stay archived');
    archivePath = join(root, 'pack.zip');

    const archiveEntries = [
      ['License.txt', join(inputRoot, 'License.txt')],
      ...approvedEntries.map((entry) => [entry, join(inputRoot, ...entry.split('/'))]),
      ['unapproved-sentinel.txt', join(inputRoot, 'unapproved-sentinel.txt')],
    ] as const;
    const createEntries = archiveEntries
      .map(([entry, source]) => `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, ${quotePowerShell(source)}, ${quotePowerShell(entry)}) | Out-Null`)
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
    expect(result.stderr).toContain(hash.toUpperCase());
  });

  it('extracts only the seven approved GLBs and License.txt', async () => {
    const destinationRoot = join(root, 'approved');
    const entries = ['License.txt', ...approvedEntries];
    const result = runHelper(
      `Expand-ApprovedArchiveEntries -ArchivePath ${quotePowerShell(archivePath)} -DestinationRoot ${quotePowerShell(destinationRoot)} -Entries @(${entries.map(quotePowerShell).join(', ')})`,
    );

    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(join(destinationRoot, 'License.txt'), 'utf8')).resolves.toBe('CC0');
    for (const entry of approvedEntries) {
      await expect(readFile(join(destinationRoot, ...entry.split('/')), 'utf8')).resolves.toBe(entry);
    }
    await expect(readFile(join(destinationRoot, 'unapproved-sentinel.txt'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a missing approved archive entry', () => {
    const result = runHelper(
      `Expand-ApprovedArchiveEntries -ArchivePath ${quotePowerShell(archivePath)} -DestinationRoot ${quotePowerShell(join(root, 'missing'))} -Entries @('Models/GLTF format/missing.glb')`,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Missing archive entry: Models/GLTF format/missing.glb');
  });

  it('rejects a parent-directory archive entry', () => {
    const result = runHelper(
      `Expand-ApprovedArchiveEntries -ArchivePath ${quotePowerShell(archivePath)} -DestinationRoot ${quotePowerShell(join(root, 'unsafe'))} -Entries @('../escape.glb')`,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unsafe archive entry: ../escape.glb');
  });
});

describe('Kenney ship furniture fetch pipeline', () => {
  it('uses the pinned descriptor, selective extraction, audit, and guarded publisher', async () => {
    const source = await readFile(resolve('scripts', 'fetch-ship-furniture.ps1'), 'utf8');

    expect(source).toContain('kenney-ship-furniture.mjs --pack');
    expect(source).toContain('Assert-FileSha256');
    expect(source).toContain('Expand-ApprovedArchiveEntries');
    expect(source).toContain('check-ship-furniture.mjs --assets-only --models-dir');
    expect(source).toContain('Publish-ShipFurnitureDirectory');
    expect(source).not.toMatch(/poly\.pizza|static\.poly|ResourceID/i);
  });
});

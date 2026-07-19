import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const expectedSources = {
  survival: {
    sha256: 'DB7E41CE2B2F872480E3C24236FDB5CE64AD05071C436B6C47BC455CD3540EB5',
    prefix: 'Survival Pack - Sept 2020/OBJ',
    entries: [
      'Compass_Open.obj', 'Compass_Open.mtl', 'FlareGun.obj', 'FlareGun.mtl',
    ],
  },
  pirate: {
    sha256: 'ED201326D2F80CFAC4E3CDC7DB34152078AE35F98D77AA14ED7416A931276D36',
    prefix: 'Pirate Kit - Nov 2023/OBJ',
    entries: [
      'Prop_Anchor.obj', 'Prop_Anchor.mtl',
    ],
  },
} as const;

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describe('Quaternius item source guard', () => {
  it('pins exactly the approved Quaternius source contract', async () => {
    const script = await readFile('scripts/quaternius-item-sources.ps1', 'utf8');

    expect(script).toContain(expectedSources.survival.sha256);
    expect(script).toContain(expectedSources.pirate.sha256);
    for (const entry of [
      expectedSources.survival.prefix, expectedSources.pirate.prefix,
      ...expectedSources.survival.entries, ...expectedSources.pirate.entries,
    ]) {
      expect(script).toContain(entry);
    }
    expect(script).toContain('Assert-FileSha256');
    expect(script).toContain('Expand-ApprovedArchiveEntries');
    expect(script).toContain('Assert-ExactModelDirectory');
    expect(script).toContain('New-Item -ItemType Directory -Force -Path $stage');
    expect(script).toContain('Move-Item -LiteralPath $stage -Destination $DestinationRoot');
  });

  it('resolves its default destination after script scope is available', () => {
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resolve('scripts', 'quaternius-item-sources.ps1'),
      '-SurvivalArchive',
      resolve('missing-survival.zip'),
      '-PirateArchive',
      resolve('missing-pirate.zip'),
    ], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cannot find path');
    expect(result.stderr).not.toContain('Cannot bind argument to parameter');
  });
});

describe('Quaternius item source destination guard', () => {
  let root: string;
  let survivalArchive: string;
  let pirateArchive: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'quaternius-item-sources-'));
    survivalArchive = join(root, 'survival.zip');
    pirateArchive = join(root, 'pirate.zip');

    const archiveInputs = [
      [survivalArchive, [
        'Survival Pack - Sept 2020/OBJ/Compass_Open.obj',
        'Survival Pack - Sept 2020/OBJ/Compass_Open.mtl',
        'Survival Pack - Sept 2020/OBJ/FlareGun.obj',
        'Survival Pack - Sept 2020/OBJ/FlareGun.mtl',
      ]],
      [pirateArchive, [
        'Pirate Kit - Nov 2023/OBJ/Prop_Anchor.obj',
        'Pirate Kit - Nov 2023/OBJ/Prop_Anchor.mtl',
      ]],
    ] as const;
    for (const [archivePath, entries] of archiveInputs) {
      const createEntries = entries
        .map((entry) => `$archive.CreateEntry(${quotePowerShell(entry)}) | Out-Null`)
        .join('; ');
      const result = spawnSync('powershell', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $archive = [System.IO.Compression.ZipFile]::Open(${quotePowerShell(archivePath)}, [System.IO.Compression.ZipArchiveMode]::Create); try { ${createEntries} } finally { $archive.Dispose() }`,
      ], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
    }
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function runSource(destinationRoot: string) {
    return spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resolve('scripts', 'quaternius-item-sources.ps1'),
      '-SurvivalArchive', survivalArchive,
      '-PirateArchive', pirateArchive,
      '-DestinationRoot', destinationRoot,
    ], { encoding: 'utf8' });
  }

  it('rejects a populated arbitrary destination before staging or reading source archives', async () => {
    const sentinelPath = join(root, 'outside-sentinel.txt');
    await writeFile(sentinelPath, 'must remain untouched');
    await mkdir(join(root, 'already-populated'));

    const result = runSource(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Refusing unsafe destination root');
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe('must remain untouched');
  });

  it('rejects filesystem roots and paths inside or around the repository', () => {
    const defaultRoot = resolve('third_party', 'quaternius-items');
    const unsafeRoots = [
      parse(root).root,
      resolve('.'),
      resolve('third_party'),
      join(defaultRoot, 'nested-output'),
    ];

    for (const destinationRoot of unsafeRoots) {
      const result = runSource(destinationRoot);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Refusing unsafe destination root');
    }
  });

  it('accepts an empty temporary child as a test destination', () => {
    const result = runSource(join(root, 'empty-output'));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Archive SHA-256 mismatch');
    expect(result.stderr).not.toContain('Refusing unsafe destination root');
  });
});

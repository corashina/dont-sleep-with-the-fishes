import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

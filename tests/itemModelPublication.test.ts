import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describe('item model directory publication', () => {
  let root: string;
  let modelsRoot: string;
  let outputRoot: string;
  let stagedRoot: string;
  let backupRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'item-model-publication-'));
    modelsRoot = join(root, 'models');
    outputRoot = join(modelsRoot, 'items');
    stagedRoot = join(modelsRoot, '.items-stage-test');
    backupRoot = join(modelsRoot, '.items-backup-test');
    await mkdir(outputRoot, { recursive: true });
    await mkdir(stagedRoot);
    await writeFile(join(outputRoot, 'old.txt'), 'old');
    await writeFile(join(stagedRoot, 'new.txt'), 'new');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function publishWithRenameFailure(failAt: number) {
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      '$script:moveCount = 0',
      `$moveDirectory = { param([string]$Source, [string]$Destination) $script:moveCount += 1; if ($script:moveCount -eq ${failAt}) { throw 'Injected rename failure' }; Move-Item -LiteralPath $Source -Destination $Destination }`,
      `Publish-ItemModelDirectory -ModelsRoot ${quotePowerShell(modelsRoot)} -OutputRoot ${quotePowerShell(outputRoot)} -StagedRoot ${quotePowerShell(stagedRoot)} -BackupRoot ${quotePowerShell(backupRoot)} -MoveDirectory $moveDirectory`,
    ].join('; ');
    return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      encoding: 'utf8',
    });
  }

  async function expectPreviousDirectoryRestored() {
    expect(await readFile(join(outputRoot, 'old.txt'), 'utf8')).toBe('old');
    expect(existsSync(join(outputRoot, 'new.txt'))).toBe(false);
    expect(existsSync(stagedRoot)).toBe(false);
    expect(existsSync(backupRoot)).toBe(false);
  }

  it('keeps the previous directory when its move to backup fails', async () => {
    const result = publishWithRenameFailure(1);

    expect(result.status).toBe(1);
    await expectPreviousDirectoryRestored();
  });

  it('restores the previous directory when publishing the stage fails', async () => {
    const result = publishWithRenameFailure(2);

    expect(result.status).toBe(1);
    await expectPreviousDirectoryRestored();
  });

  it('refuses to recursively clean a prefixed directory outside the models root', async () => {
    const unsafePath = join(root, '.items-stage-outside');
    await mkdir(unsafePath);
    await writeFile(join(unsafePath, 'sentinel.txt'), 'keep');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `Remove-GuardedSwapDirectory -ModelsRoot ${quotePowerShell(modelsRoot)} -Path ${quotePowerShell(unsafePath)} -Prefix '.items-stage-'`,
    ].join('; ');

    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing unsafe model swap path');
    expect(await readFile(join(unsafePath, 'sentinel.txt'), 'utf8')).toBe('keep');
  });

  it('refuses to recursively clean a prefixed nested descendant of the models root', async () => {
    const nestedPath = join(modelsRoot, 'nested', '.items-stage-child');
    await mkdir(nestedPath, { recursive: true });
    await writeFile(join(nestedPath, 'sentinel.txt'), 'keep');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `Remove-GuardedSwapDirectory -ModelsRoot ${quotePowerShell(modelsRoot)} -Path ${quotePowerShell(nestedPath)} -Prefix '.items-stage-'`,
    ].join('; ');

    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing unsafe model swap path');
    expect(await readFile(join(nestedPath, 'sentinel.txt'), 'utf8')).toBe('keep');
  });
});

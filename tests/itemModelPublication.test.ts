import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const publishers = [
  {
    name: 'item',
    functionName: 'Publish-ItemModelDirectory',
    outputName: 'items',
    stagePrefix: '.items-stage-',
    backupPrefix: '.items-backup-',
  },
  {
    name: 'ship furniture',
    functionName: 'Publish-ShipFurnitureDirectory',
    outputName: 'ship',
    stagePrefix: '.ship-stage-',
    backupPrefix: '.ship-backup-',
  },
] as const;

describe('model directory publication', () => {
  let root: string;
  let modelsRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'model-publication-'));
    modelsRoot = join(root, 'models');
    await mkdir(modelsRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function preparePublisher(config: typeof publishers[number]) {
    const outputRoot = join(modelsRoot, config.outputName);
    const stagedRoot = join(modelsRoot, `${config.stagePrefix}test`);
    const backupRoot = join(modelsRoot, `${config.backupPrefix}test`);
    await mkdir(outputRoot);
    await mkdir(stagedRoot);
    await writeFile(join(outputRoot, 'old.txt'), 'old');
    await writeFile(join(stagedRoot, 'new.txt'), 'new');
    return { outputRoot, stagedRoot, backupRoot };
  }

  function publishWithRenameFailure(
    config: typeof publishers[number],
    paths: Awaited<ReturnType<typeof preparePublisher>>,
    failAt: number,
  ) {
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      '$script:moveCount = 0',
      `$moveDirectory = { param([string]$Source, [string]$Destination) $script:moveCount += 1; if ($script:moveCount -eq ${failAt}) { throw 'Injected rename failure' }; Move-Item -LiteralPath $Source -Destination $Destination }`,
      `${config.functionName} -ModelsRoot ${quotePowerShell(modelsRoot)} -OutputRoot ${quotePowerShell(paths.outputRoot)} -StagedRoot ${quotePowerShell(paths.stagedRoot)} -BackupRoot ${quotePowerShell(paths.backupRoot)} -MoveDirectory $moveDirectory`,
    ].join('; ');
    return spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );
  }

  function publishWithBackupCleanupFailure(
    config: typeof publishers[number],
    paths: Awaited<ReturnType<typeof preparePublisher>>,
  ) {
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      '$script:originalCleanup = (Get-Command Remove-GuardedSwapDirectory -CommandType Function).ScriptBlock',
      `function Remove-GuardedSwapDirectory { param([string]$ModelsRoot, [string]$Path, [string]$Prefix) if ([System.IO.Path]::GetFullPath($Path) -eq [System.IO.Path]::GetFullPath(${quotePowerShell(paths.backupRoot)})) { throw 'Injected backup cleanup failure' }; & $script:originalCleanup -ModelsRoot $ModelsRoot -Path $Path -Prefix $Prefix }`,
      `${config.functionName} -ModelsRoot ${quotePowerShell(modelsRoot)} -OutputRoot ${quotePowerShell(paths.outputRoot)} -StagedRoot ${quotePowerShell(paths.stagedRoot)} -BackupRoot ${quotePowerShell(paths.backupRoot)}`,
    ].join('; ');
    return spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );
  }

  async function expectPreviousDirectoryRestored(
    paths: Awaited<ReturnType<typeof preparePublisher>>,
  ) {
    expect(await readFile(join(paths.outputRoot, 'old.txt'), 'utf8')).toBe('old');
    expect(existsSync(join(paths.outputRoot, 'new.txt'))).toBe(false);
    expect(existsSync(paths.stagedRoot)).toBe(false);
    expect(existsSync(paths.backupRoot)).toBe(false);
  }

  it.each(publishers)('$name wrapper keeps the previous directory when backup fails', async (config) => {
    const paths = await preparePublisher(config);
    const result = publishWithRenameFailure(config, paths, 1);

    expect(result.status).toBe(1);
    await expectPreviousDirectoryRestored(paths);
  });

  it.each(publishers)('$name wrapper restores the previous directory when publication fails', async (config) => {
    const paths = await preparePublisher(config);
    const result = publishWithRenameFailure(config, paths, 2);

    expect(result.status).toBe(1);
    await expectPreviousDirectoryRestored(paths);
  });

  it.each(publishers)('$name wrapper restores the previous directory when backup cleanup fails', async (config) => {
    const paths = await preparePublisher(config);
    const result = publishWithBackupCleanupFailure(config, paths);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Injected backup cleanup failure');
    await expectPreviousDirectoryRestored(paths);
  });

  it.each(publishers)('$name guard refuses a prefixed directory outside the models root', async (config) => {
    const unsafePath = join(root, `${config.stagePrefix}outside`);
    await mkdir(unsafePath);
    await writeFile(join(unsafePath, 'sentinel.txt'), 'keep');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `Remove-GuardedSwapDirectory -ModelsRoot ${quotePowerShell(modelsRoot)} -Path ${quotePowerShell(unsafePath)} -Prefix ${quotePowerShell(config.stagePrefix)}`,
    ].join('; ');

    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing unsafe model swap path');
    expect(await readFile(join(unsafePath, 'sentinel.txt'), 'utf8')).toBe('keep');
  });

  it.each(publishers)('$name guard refuses a prefixed nested descendant', async (config) => {
    const nestedPath = join(modelsRoot, 'nested', `${config.stagePrefix}child`);
    await mkdir(nestedPath, { recursive: true });
    await writeFile(join(nestedPath, 'sentinel.txt'), 'keep');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `Remove-GuardedSwapDirectory -ModelsRoot ${quotePowerShell(modelsRoot)} -Path ${quotePowerShell(nestedPath)} -Prefix ${quotePowerShell(config.stagePrefix)}`,
    ].join('; ');

    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing unsafe model swap path');
    expect(await readFile(join(nestedPath, 'sentinel.txt'), 'utf8')).toBe('keep');
  });

  it.each(publishers)('$name wrapper rejects a stage with the wrong prefix', async (config) => {
    const paths = await preparePublisher(config);
    const unsafeStage = join(modelsRoot, '.wrong-stage-test');
    await mkdir(unsafeStage);
    await writeFile(join(unsafeStage, 'sentinel.txt'), 'keep');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `${config.functionName} -ModelsRoot ${quotePowerShell(modelsRoot)} -OutputRoot ${quotePowerShell(paths.outputRoot)} -StagedRoot ${quotePowerShell(unsafeStage)} -BackupRoot ${quotePowerShell(paths.backupRoot)}`,
    ].join('; ');

    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing unsafe model swap path');
    expect(await readFile(join(paths.outputRoot, 'old.txt'), 'utf8')).toBe('old');
    expect(await readFile(join(unsafeStage, 'sentinel.txt'), 'utf8')).toBe('keep');
  });

  it('rejects duplicate compass.glb emitted by two of the three model builders before publication', async () => {
    const kenneyRoot = join(root, 'kenney-build');
    const quaterniusRoot = join(root, 'quaternius-build');
    const projectRoot = join(root, 'project-build');
    const stagedRoot = join(modelsRoot, '.items-stage-duplicate');
    await mkdir(kenneyRoot);
    await mkdir(quaterniusRoot);
    await mkdir(projectRoot);
    await mkdir(stagedRoot);
    await writeFile(join(kenneyRoot, 'compass.glb'), 'kenney');
    await writeFile(join(quaterniusRoot, 'compass.glb'), 'quaternius');
    await writeFile(join(projectRoot, 'energyBar.glb'), 'project');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `Copy-UniqueModelBuildOutputs -BuildRoots @(${quotePowerShell(kenneyRoot)}, ${quotePowerShell(quaterniusRoot)}, ${quotePowerShell(projectRoot)}) -DestinationRoot ${quotePowerShell(stagedRoot)}`,
    ].join('; ');

    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Duplicate generated item model output: compass.glb');
  });

  it('rejects a staged model directory with the wrong exact inventory', async () => {
    const stagedRoot = join(modelsRoot, '.items-stage-inventory');
    await mkdir(stagedRoot);
    await writeFile(join(stagedRoot, 'approved.glb'), 'approved');
    await writeFile(join(stagedRoot, 'unexpected.glb'), 'unexpected');
    const helperPath = resolve('scripts', 'item-model-publication.ps1');
    const command = [
      `. ${quotePowerShell(helperPath)}`,
      `Assert-ExactModelDirectory -Directory ${quotePowerShell(stagedRoot)} -ExpectedFiles @('approved.glb', 'metadata.json') -Description 'test inventory'`,
    ].join('; ');

    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('test inventory');
  });
});

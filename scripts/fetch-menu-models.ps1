$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'menu'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".menu-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".menu-backup-$swapId"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "dont-sleep-menu-models-$swapId"
$modelIds = @(
  'boat', 'rockA', 'rockB', 'rockC',
  'fishBone', 'skull', 'largeBone', 'shark'
)
$expectedFiles = @($modelIds | ForEach-Object { "$_.glb" }) +
  @('menu-model-metadata.json')

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.menu-stage-'
  $backupRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.menu-backup-'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $sourceRoot = Join-Path $tempRoot 'poly-pizza-sources'
  $buildRoot = Join-Path $tempRoot 'poly-pizza-build'
  New-Item -ItemType Directory -Path $sourceRoot | Out-Null

  Push-Location $repositoryRoot
  try {
    $sourceJson = & node scripts/poly-pizza-menu-models.mjs --sources
    if ($LASTEXITCODE -ne 0) { throw 'Pinned menu model descriptor query failed' }
  } finally {
    Pop-Location
  }
  $sources = $sourceJson | ConvertFrom-Json

  foreach ($modelId in $modelIds) {
    $source = $sources.$modelId
    if ($null -eq $source) { throw "Missing pinned menu model descriptor: $modelId" }
    $sourcePath = Join-Path $sourceRoot "$modelId.glb"
    Invoke-WebRequest -Uri $source.downloadUrl -OutFile $sourcePath
    Assert-FileSha256 -Path $sourcePath -Expected $source.sha256
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/poly-pizza-menu-models.mjs $sourceRoot $buildRoot
    if ($LASTEXITCODE -ne 0) { throw 'Menu model build failed' }

    & node scripts/event-model-metadata.mjs $buildRoot @modelIds
    if ($LASTEXITCODE -ne 0) { throw 'Menu model metadata build failed' }
  } finally {
    Pop-Location
  }
  Move-Item -LiteralPath (Join-Path $buildRoot 'event-model-metadata.json') -Destination (Join-Path $buildRoot 'menu-model-metadata.json')
  Copy-UniqueModelBuildOutputs -BuildRoots @($buildRoot) -DestinationRoot $stagedRoot
  Assert-ExactModelDirectory `
    -Directory $stagedRoot -ExpectedFiles $expectedFiles -Description 'Staged menu models'

  Push-Location $repositoryRoot
  try {
    & node scripts/check-menu-models.mjs --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged menu model validation failed' }
  } finally {
    Pop-Location
  }

  Publish-ModelDirectory `
    -ModelsRoot $modelsRoot `
    -OutputRoot $outputRoot `
    -StagedRoot $stagedRoot `
    -BackupRoot $backupRoot `
    -StagePrefix '.menu-stage-' `
    -BackupPrefix '.menu-backup-'
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -Recurse -Force -LiteralPath $tempRoot
  }
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.menu-stage-'
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.menu-backup-'
}

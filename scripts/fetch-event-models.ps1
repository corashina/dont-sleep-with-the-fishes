param(
  [string]$NodeExecutable = 'node'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'events'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".events-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".events-backup-$swapId"
$tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$tempRoot = Join-Path $tempParent "dont-sleep-event-models-$swapId"
$modelIds = @(
  'leakPlanks'
  'schoolFish'
  'snatcher'
  'anglerFish'
  'deathStareBlob'
  'tornadoCore'
)
$expectedFiles = @($modelIds | ForEach-Object { "$_.glb" }) + @('event-model-metadata.json')

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')

function Get-GuardedEventTempPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $fullPath)).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $leaf = Split-Path -Leaf $fullPath
  if (
    -not $fullParent.Equals($tempParent, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $leaf.StartsWith('dont-sleep-event-models-', [System.StringComparison]::Ordinal)
  ) {
    throw "Refusing unsafe event model temporary path: $fullPath"
  }
  return $fullPath
}

function Remove-GuardedEventTempDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return }
  $guardedPath = Get-GuardedEventTempPath -Path $Path
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  if (-not $resolvedPath.Equals($guardedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean redirected event model temporary path: $resolvedPath"
  }
  Remove-Item -Recurse -Force -LiteralPath $resolvedPath
}

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.events-stage-'
  $backupRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.events-backup-'
  $tempRoot = Get-GuardedEventTempPath -Path $tempRoot
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $sourceRoot = Join-Path $tempRoot 'poly-pizza-sources'
  $buildRoot = Join-Path $tempRoot 'poly-pizza-build'
  New-Item -ItemType Directory -Path $sourceRoot | Out-Null

  Push-Location $repositoryRoot
  try {
    & $NodeExecutable scripts/poly-pizza-event-models.mjs --verify-pages
    if ($LASTEXITCODE -ne 0) { throw 'Pinned event model page validation failed' }
    $sourceJson = & $NodeExecutable scripts/poly-pizza-event-models.mjs --sources
    if ($LASTEXITCODE -ne 0) { throw 'Pinned event model descriptor query failed' }
  } finally {
    Pop-Location
  }
  $sources = $sourceJson | ConvertFrom-Json

  foreach ($modelId in $modelIds) {
    $source = $sources.$modelId
    if ($null -eq $source) { throw "Missing pinned event model descriptor: $modelId" }
    $sourcePath = Join-Path $sourceRoot "$modelId.glb"
    Invoke-WebRequest -Uri $source.downloadUrl -OutFile $sourcePath
    Assert-FileSha256 -Path $sourcePath -Expected $source.sha256
  }

  Push-Location $repositoryRoot
  try {
    & $NodeExecutable scripts/poly-pizza-event-models.mjs $sourceRoot $buildRoot
    if ($LASTEXITCODE -ne 0) { throw 'Event model build failed' }
  } finally {
    Pop-Location
  }
  Copy-UniqueModelBuildOutputs -BuildRoots @($buildRoot) -DestinationRoot $stagedRoot
  Assert-ExactModelDirectory `
    -Directory $stagedRoot -ExpectedFiles $expectedFiles -Description 'Staged event models'

  Push-Location $repositoryRoot
  try {
    & $NodeExecutable scripts/check-event-models.mjs --assets-only --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged event model validation failed' }
  } finally {
    Pop-Location
  }

  Publish-ModelDirectory `
    -ModelsRoot $modelsRoot `
    -OutputRoot $outputRoot `
    -StagedRoot $stagedRoot `
    -BackupRoot $backupRoot `
    -StagePrefix '.events-stage-' `
    -BackupPrefix '.events-backup-'
} finally {
  Remove-GuardedEventTempDirectory -Path $tempRoot
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.events-stage-'
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.events-backup-'
}

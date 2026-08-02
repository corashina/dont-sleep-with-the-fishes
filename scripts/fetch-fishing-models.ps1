$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'fishing'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".fishing-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".fishing-backup-$swapId"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "dont-sleep-fishing-models-$swapId"
$modelIds = @(
  'cod'
  'salmon'
  'tuna'
  'crab'
  'squid'
  'sardine'
  'bass'
  'redSnapper'
  'clownfish'
  'seaweed'
  'boot'
  'plasticBottle'
  'fishBones'
)
$expectedFiles = @($modelIds | ForEach-Object { "$_.glb" }) + @('fishing-model-metadata.json')

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.fishing-stage-'
  $backupRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.fishing-backup-'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $sourceRoot = Join-Path $tempRoot 'poly-pizza-sources'
  $buildRoot = Join-Path $tempRoot 'poly-pizza-build'
  New-Item -ItemType Directory -Path $sourceRoot | Out-Null

  Push-Location $repositoryRoot
  try {
    $sourceJson = & node scripts/poly-pizza-fishing-models.mjs --sources
    if ($LASTEXITCODE -ne 0) { throw 'Pinned fishing model descriptor query failed' }
  } finally {
    Pop-Location
  }
  $sources = $sourceJson | ConvertFrom-Json

  foreach ($modelId in $modelIds) {
    $source = $sources.$modelId
    if ($null -eq $source) { throw "Missing pinned fishing model descriptor: $modelId" }
    $sourcePath = Join-Path $sourceRoot "$modelId.glb"
    Invoke-WebRequest -Uri $source.downloadUrl -OutFile $sourcePath
    Assert-FileSha256 -Path $sourcePath -Expected $source.sha256
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/poly-pizza-fishing-models.mjs $sourceRoot $buildRoot
    if ($LASTEXITCODE -ne 0) { throw 'Fishing model build failed' }
    & node scripts/item-model-metadata.mjs $buildRoot @modelIds
    if ($LASTEXITCODE -ne 0) { throw 'Fishing model metadata build failed' }
  } finally {
    Pop-Location
  }
  Move-Item `
    -LiteralPath (Join-Path $buildRoot 'item-model-metadata.json') `
    -Destination (Join-Path $buildRoot 'fishing-model-metadata.json')
  Copy-UniqueModelBuildOutputs -BuildRoots @($buildRoot) -DestinationRoot $stagedRoot
  Assert-ExactModelDirectory `
    -Directory $stagedRoot -ExpectedFiles $expectedFiles -Description 'Staged fishing models'

  Push-Location $repositoryRoot
  try {
    & node scripts/check-fishing-models.mjs --assets-only --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged fishing model validation failed' }
  } finally {
    Pop-Location
  }

  Publish-FishingModelDirectory `
    -ModelsRoot $modelsRoot `
    -OutputRoot $outputRoot `
    -StagedRoot $stagedRoot `
    -BackupRoot $backupRoot
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -Recurse -Force -LiteralPath $tempRoot
  }
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.fishing-stage-'
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.fishing-backup-'
}

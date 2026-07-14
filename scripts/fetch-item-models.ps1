$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'items'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".items-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".items-backup-$swapId"
$osTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempRoot = Join-Path $osTempRoot "dont-sleep-item-models-$([guid]::NewGuid().ToString('N'))"
$expectedFiles = @(
  'baitTin.glb'
  'cannedFood.glb'
  'ductTape.glb'
  'fishingRod.glb'
  'flareGun.glb'
  'flashlight.glb'
  'medicalKit.glb'
  'scubaSet.glb'
  'waterJug.glb'
)

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')
. (Join-Path $PSScriptRoot 'kenney-item-sources.ps1')

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.items-stage-'
  $backupRoot = Get-GuardedSwapPath -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.items-backup-'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $archivesRoot = Join-Path $tempRoot 'archives'
  $sourceRoot = Join-Path $tempRoot 'sources'
  New-Item -ItemType Directory -Path $archivesRoot | Out-Null
  New-Item -ItemType Directory -Path $sourceRoot | Out-Null

  Push-Location $repositoryRoot
  try {
    $packJson = & node scripts/kenney-item-models.mjs --packs
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Kenney pack descriptor query failed' }
  } finally {
    Pop-Location
  }
  $packs = $packJson | ConvertFrom-Json

  foreach ($packProperty in $packs.PSObject.Properties) {
    $packSlug = $packProperty.Name
    $pack = $packProperty.Value
    $archivePath = Join-Path $archivesRoot "$packSlug-$($pack.version).zip"
    Invoke-WebRequest -UseBasicParsing -Uri $pack.archiveUrl -OutFile $archivePath
    Assert-FileSha256 -Path $archivePath -Expected $pack.sha256
    Expand-ApprovedArchiveEntries `
      -ArchivePath $archivePath `
      -DestinationRoot (Join-Path $sourceRoot $packSlug) `
      -Entries @($pack.requiredEntries)
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/kenney-item-models.mjs $sourceRoot $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Kenney item model build failed' }
  } finally {
    Pop-Location
  }

  $stagedEntries = @(Get-ChildItem -Force -LiteralPath $stagedRoot)
  $stagedFiles = @($stagedEntries | Where-Object { -not $_.PSIsContainer } | ForEach-Object Name | Sort-Object)
  $entryDifference = @(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $stagedFiles)
  if ($stagedEntries.Count -ne $expectedFiles.Count -or $entryDifference.Count -ne 0) {
    throw 'Staged item model directory does not contain exactly the nine approved GLBs'
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/check-item-models.mjs --assets-only --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged item model audit failed' }
  } finally {
    Pop-Location
  }

  Publish-ItemModelDirectory -ModelsRoot $modelsRoot -OutputRoot $outputRoot -StagedRoot $stagedRoot -BackupRoot $backupRoot
} finally {
  Remove-GuardedSwapDirectory -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.items-stage-'
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
    $tempPrefix = $osTempRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTempRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean non-temporary path: $resolvedTempRoot"
    }
    Remove-Item -Recurse -Force -LiteralPath $resolvedTempRoot
  }
}

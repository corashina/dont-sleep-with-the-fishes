$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'ship'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".ship-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".ship-backup-$swapId"
$osTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempRoot = Join-Path $osTempRoot "dont-sleep-ship-furniture-$([guid]::NewGuid().ToString('N'))"
$expectedFiles = @(
  'barrel.glb'
  'bedBunk.glb'
  'bookcaseClosedDoors.glb'
  'bookcaseOpen.glb'
  'cargoBox.glb'
  'cargoCrate.glb'
  'chairDesk.glb'
  'desk.glb'
  'sideTableDrawers.glb'
  'table.glb'
)

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')
. (Join-Path $PSScriptRoot 'kenney-item-sources.ps1')

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.ship-stage-'
  $backupRoot = Get-GuardedSwapPath -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.ship-backup-'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $archivePath = Join-Path $tempRoot 'kenney_furniture-kit.zip'
  $sourceRoot = Join-Path $tempRoot 'source'
  $kenneyBuildRoot = Join-Path $tempRoot 'kenney-build'
  $polySourceRoot = Join-Path $tempRoot 'poly-pizza-sources'
  $polyBuildRoot = Join-Path $tempRoot 'poly-pizza-build'
  New-Item -ItemType Directory -Path $polySourceRoot | Out-Null

  Push-Location $repositoryRoot
  try {
    $packJson = & node scripts/kenney-ship-furniture.mjs --pack
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Kenney Furniture Kit descriptor query failed' }
  } finally {
    Pop-Location
  }
  $pack = $packJson | ConvertFrom-Json

  Invoke-WebRequest -UseBasicParsing -Uri $pack.archiveUrl -OutFile $archivePath
  Assert-FileSha256 -Path $archivePath -Expected $pack.sha256
  Expand-ApprovedArchiveEntries `
    -ArchivePath $archivePath `
    -DestinationRoot $sourceRoot `
    -Entries @($pack.requiredEntries)

  Push-Location $repositoryRoot
  try {
    & node scripts/kenney-ship-furniture.mjs $sourceRoot $kenneyBuildRoot
    if ($LASTEXITCODE -ne 0) { throw 'Kenney ship furniture build failed' }
  } finally {
    Pop-Location
  }

  Push-Location $repositoryRoot
  try {
    $polySourceJson = & node scripts/poly-pizza-ship-furniture.mjs --sources
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Poly Pizza ship descriptor query failed' }
  } finally {
    Pop-Location
  }
  $polySources = $polySourceJson | ConvertFrom-Json

  foreach ($sourceProperty in $polySources.PSObject.Properties) {
    $id = $sourceProperty.Name
    $source = $sourceProperty.Value
    $sourcePath = Join-Path $polySourceRoot "$id.glb"
    Invoke-WebRequest -UseBasicParsing -Uri $source.downloadUrl -OutFile $sourcePath
    Assert-FileSha256 -Path $sourcePath -Expected $source.sha256
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/poly-pizza-ship-furniture.mjs $polySourceRoot $polyBuildRoot
    if ($LASTEXITCODE -ne 0) { throw 'Poly Pizza ship furniture build failed' }
  } finally {
    Pop-Location
  }

  Copy-UniqueModelBuildOutputs `
    -BuildRoots @($kenneyBuildRoot, $polyBuildRoot) `
    -DestinationRoot $stagedRoot

  $stagedEntries = @(Get-ChildItem -Force -LiteralPath $stagedRoot)
  $stagedFiles = @($stagedEntries | Where-Object { -not $_.PSIsContainer } | ForEach-Object Name | Sort-Object)
  $entryDifference = @(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $stagedFiles)
  if ($stagedEntries.Count -ne $expectedFiles.Count -or $entryDifference.Count -ne 0) {
    throw 'Staged ship furniture directory does not contain exactly the ten approved GLBs'
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/check-ship-furniture.mjs --assets-only --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged ship furniture audit failed' }
  } finally {
    Pop-Location
  }

  Publish-ShipFurnitureDirectory `
    -ModelsRoot $modelsRoot `
    -OutputRoot $outputRoot `
    -StagedRoot $stagedRoot `
    -BackupRoot $backupRoot
} finally {
  Remove-GuardedSwapDirectory -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.ship-stage-'
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
    $tempPrefix = $osTempRoot.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTempRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean non-temporary path: $resolvedTempRoot"
    }
    Remove-Item -Recurse -Force -LiteralPath $resolvedTempRoot
  }
}

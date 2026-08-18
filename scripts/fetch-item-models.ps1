$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'items'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".items-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".items-backup-$swapId"
$osTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempRoot = Join-Path $osTempRoot "dont-sleep-item-models-$([guid]::NewGuid().ToString('N'))"
$modelIds = @(
  'cannedFood'
  'baitTin'
  'ductTape'
  'compass'
  'map'
  'medicalKit'
  'spyglass'
  'fishingNet'
  'bucket'
  'flareGun'
  'scubaSet'
  'anchor'
  'bottledPaper'
  'umbrella'
  'swimRing'
  'flashlight'
  'shotgun'
  'energyBar'
  'fishingRod'
  'hammer'
  'lantern'
  'ceilingLight'
)
$expectedFiles = @($modelIds | ForEach-Object { "$_.glb" }) + @('item-model-metadata.json')

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.items-stage-'
  $backupRoot = Get-GuardedSwapPath -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.items-backup-'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $sourceRoot = Join-Path $tempRoot 'poly-pizza-sources'
  $buildRoot = Join-Path $tempRoot 'poly-pizza-build'
  New-Item -ItemType Directory -Path $sourceRoot | Out-Null

  Push-Location $repositoryRoot
  try {
    $sourceJson = & node scripts/poly-pizza-models.mjs --sources
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Poly Pizza descriptor query failed' }
  } finally {
    Pop-Location
  }
  $sources = $sourceJson | ConvertFrom-Json

  foreach ($sourceProperty in $sources.PSObject.Properties) {
    $id = $sourceProperty.Name
    $source = $sourceProperty.Value
    $sourcePath = Join-Path $sourceRoot "$id.glb"
    Invoke-WebRequest -UseBasicParsing -Uri $source.downloadUrl -OutFile $sourcePath
    Assert-FileSha256 -Path $sourcePath -Expected $source.sha256

    foreach ($component in @($source.components)) {
      if ($null -eq $component) { continue }
      $componentPath = Join-Path $sourceRoot "$id--$($component.id).glb"
      Invoke-WebRequest -UseBasicParsing -Uri $component.downloadUrl -OutFile $componentPath
      Assert-FileSha256 -Path $componentPath -Expected $component.sha256
    }
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/poly-pizza-models.mjs $sourceRoot $buildRoot
    if ($LASTEXITCODE -ne 0) { throw 'Poly Pizza model build failed' }
  } finally {
    Pop-Location
  }

  Copy-UniqueModelBuildOutputs -BuildRoots @($buildRoot) -DestinationRoot $stagedRoot

  Push-Location $repositoryRoot
  try {
    & node scripts/item-model-metadata.mjs $stagedRoot @modelIds
    if ($LASTEXITCODE -ne 0) { throw 'Item model metadata build failed' }
  } finally {
    Pop-Location
  }

  Assert-ExactModelDirectory `
    -Directory $stagedRoot `
    -ExpectedFiles $expectedFiles `
    -Description 'Staged item model directory'

  Push-Location $repositoryRoot
  try {
    & node scripts/check-item-models.mjs --assets-only --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged item model audit failed' }
  } finally {
    Pop-Location
  }

  Publish-ItemModelDirectory `
    -ModelsRoot $modelsRoot `
    -OutputRoot $outputRoot `
    -StagedRoot $stagedRoot `
    -BackupRoot $backupRoot
} finally {
  Remove-GuardedSwapDirectory -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.items-stage-'
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

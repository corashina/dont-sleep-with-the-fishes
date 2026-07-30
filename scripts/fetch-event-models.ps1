$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$modelsRoot = Join-Path $repositoryRoot 'src\assets\models'
$outputRoot = Join-Path $modelsRoot 'events'
$swapId = [guid]::NewGuid().ToString('N')
$stagedRoot = Join-Path $modelsRoot ".events-stage-$swapId"
$backupRoot = Join-Path $modelsRoot ".events-backup-$swapId"
$eventSources = @(
  @{
    Id = 'fogMan'
    PublicId = 'mQnGoME1ez'
    ResourceId = '66b57880-bcb0-479a-8d72-5c3e88afaa39'
    Sha256 = '31FF1539E7A9A209D4EB1107E696D798FEDC7E35D84A58BBABFDC0F1B8B73763'
  },
  @{
    Id = 'ghost'
    PublicId = '112vpcommxv'
    ResourceId = '02d70fdb-284b-4799-a9ee-18c7277f158c'
    Sha256 = '3AFB58D595ECA2D5F7953847CF51230270BB9EEE40B59F56FE04CDF4A28CD1C3'
  },
  @{
    Id = 'siren'
    PublicId = 'nIItLV9nxS'
    ResourceId = '46d6db5a-3c9f-4238-8cdf-8eb7194498dc'
    Sha256 = 'A6522FE53D15DE21130A957D1BF2B8A9A58D4E4E9A12AF646645B667A9BB2D17'
  },
  @{
    Id = 'sirenRock'
    PublicId = 'CrSoV13mCU'
    ResourceId = '3e9d82ac-0749-42b6-8dfd-082393547ed5'
    Sha256 = '8A0595C2F0C6914CC1794CE8CB35517F4451EB4CFB6703D3A58CA654D5900BAB'
  }
)
$modelIds = @($eventSources | ForEach-Object { $_.Id })
$expectedFiles = @($modelIds | ForEach-Object { "$_.glb" }) + @('event-model-metadata.json')

. (Join-Path $PSScriptRoot 'item-model-publication.ps1')

function Assert-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected
  )
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if (-not $actual.Equals($Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Source SHA-256 mismatch for $Path`: expected $Expected, received $actual"
  }
}

try {
  New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null
  $stagedRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.events-stage-'
  $backupRoot = Get-GuardedSwapPath `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.events-backup-'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null

  foreach ($source in $eventSources) {
    $sourcePath = Join-Path $stagedRoot "$($source.Id).glb"
    $downloadUrl = "https://static.poly.pizza/$($source.ResourceId).glb"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $sourcePath
    Assert-FileSha256 -Path $sourcePath -Expected $source.Sha256
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/event-model-metadata.mjs $stagedRoot @modelIds
    if ($LASTEXITCODE -ne 0) { throw 'Event model metadata build failed' }
    & node scripts/check-event-models.mjs --assets-only --models-dir $stagedRoot
    if ($LASTEXITCODE -ne 0) { throw 'Staged event model validation failed' }
  } finally {
    Pop-Location
  }

  Assert-ExactModelDirectory `
    -Directory $stagedRoot -ExpectedFiles $expectedFiles -Description 'Staged event models'
  Publish-ModelDirectory `
    -ModelsRoot $modelsRoot `
    -OutputRoot $outputRoot `
    -StagedRoot $stagedRoot `
    -BackupRoot $backupRoot `
    -StagePrefix '.events-stage-' `
    -BackupPrefix '.events-backup-'
} finally {
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $stagedRoot -Prefix '.events-stage-'
  Remove-GuardedSwapDirectory `
    -ModelsRoot $modelsRoot -Path $backupRoot -Prefix '.events-backup-'
}

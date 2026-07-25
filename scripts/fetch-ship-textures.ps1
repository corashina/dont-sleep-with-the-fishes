$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot 'src\assets\ship'
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) (
  'dont-sleep-ship-textures-' + [Guid]::NewGuid().ToString('N')
)
$downloadDirectory = Join-Path $temporaryRoot 'downloads'
$stagingDirectory = Join-Path $temporaryRoot 'runtime'
$userAgent = 'dont-sleep-with-the-fishes/0.1 asset-pipeline'

$woodSources = @(
  @{
    Name = 'wood_floor_deck_diff_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_diff_1k.jpg'
    Sha256 = '1F2C623E87B0EE905F6F4EC8664DD19B4B135207C96E86198FF2919770B47166'
  },
  @{
    Name = 'wood_floor_deck_rough_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_rough_1k.jpg'
    Sha256 = '5754D2C2A91A288BB257E0FA8C697D97B48472C9FB77C4C7F0FFCC302F3F60A2'
  },
  @{
    Name = 'wood_floor_deck_nor_gl_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_floor_deck/wood_floor_deck_nor_gl_1k.jpg'
    Sha256 = '2FA427B9196099C0FF72D1A1AB472E2A79CA2A76906A5C46D134F8A86E086D23'
  }
)

$runtimeFiles = @(
  'deck-wood-color.webp',
  'deck-wood-normal.webp',
  'deck-wood-roughness.webp'
)

function Assert-ContainedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Child
  )
  $resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $resolvedChild = [IO.Path]::GetFullPath($Child)
  if (-not $resolvedChild.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing path outside guarded directory: $resolvedChild"
  }
}

try {
  New-Item -ItemType Directory -Force -Path (
    $downloadDirectory,
    $stagingDirectory
  ) | Out-Null

  foreach ($source in $woodSources) {
    $destination = Join-Path $downloadDirectory $source.Name
    Invoke-WebRequest -Uri $source.Url -OutFile $destination -Headers @{
      'User-Agent' = $userAgent
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
    if ($actualHash -ne $source.Sha256) {
      throw "SHA-256 mismatch for $($source.Name): $actualHash"
    }
  }

  & node (Join-Path $PSScriptRoot 'process-ship-textures.mjs') `
    (Join-Path $downloadDirectory 'wood_floor_deck_diff_1k.jpg') `
    (Join-Path $downloadDirectory 'wood_floor_deck_rough_1k.jpg') `
    (Join-Path $downloadDirectory 'wood_floor_deck_nor_gl_1k.jpg') `
    $stagingDirectory
  if ($LASTEXITCODE -ne 0) {
    throw "Texture processing failed with exit code $LASTEXITCODE"
  }

  $stagedNames = @(
    Get-ChildItem -LiteralPath $stagingDirectory -File |
      Sort-Object Name |
      ForEach-Object Name
  )
  if ([string]::Join('|', $stagedNames) -ne [string]::Join('|', ($runtimeFiles | Sort-Object))) {
    throw "Unexpected staged runtime files: $([string]::Join(', ', $stagedNames))"
  }

  New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
  foreach ($name in $runtimeFiles) {
    $sourcePath = Join-Path $stagingDirectory $name
    $destinationPath = Join-Path $runtimeDirectory $name
    Assert-ContainedPath -Parent $runtimeDirectory -Child $destinationPath
    Move-Item -Force -LiteralPath $sourcePath -Destination $destinationPath
  }

  foreach ($name in $runtimeFiles) {
    $path = Join-Path $runtimeDirectory $name
    Write-Output "$name SHA-256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash)"
  }
} finally {
  $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
  $resolvedSystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (
    $resolvedTemporaryRoot.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase) `
    -and (Split-Path -Leaf $resolvedTemporaryRoot).StartsWith('dont-sleep-ship-textures-')
  ) {
    Remove-Item -Recurse -Force -LiteralPath $resolvedTemporaryRoot -ErrorAction SilentlyContinue
  }
}

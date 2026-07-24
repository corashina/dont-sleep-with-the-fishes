$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot 'src\assets\lifeboat'
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) (
  'dont-sleep-lifeboat-textures-' + [Guid]::NewGuid().ToString('N')
)
$downloadDirectory = Join-Path $temporaryRoot 'downloads'
$stagingDirectory = Join-Path $temporaryRoot 'runtime'
$sourceArchive = Join-Path $temporaryRoot 'wood_planks_1k-source.zip'
$userAgent = 'dont-sleep-with-the-fishes/0.1 asset-pipeline'

$sources = @(
  @{
    Name = 'wood_planks_diff_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_planks/wood_planks_diff_1k.jpg'
    Md5 = '922505c35c2d0dc6a44da7ac77757134'
  },
  @{
    Name = 'wood_planks_rough_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_planks/wood_planks_rough_1k.jpg'
    Md5 = '69c9313315808cc9d858a648c2335fec'
  },
  @{
    Name = 'wood_planks_nor_gl_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/wood_planks/wood_planks_nor_gl_1k.jpg'
    Md5 = '98d2313130880f8ed7b87e843f6ba149'
  }
)

$runtimeFiles = @(
  'wood-planks-color.webp',
  'wood-planks-roughness.webp',
  'wood-planks-normal.webp'
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
  New-Item -ItemType Directory -Force -Path $downloadDirectory, $stagingDirectory | Out-Null

  foreach ($source in $sources) {
    $destination = Join-Path $downloadDirectory $source.Name
    Invoke-WebRequest -Uri $source.Url -OutFile $destination -Headers @{
      'User-Agent' = $userAgent
    }
    $actualMd5 = (Get-FileHash -Algorithm MD5 -LiteralPath $destination).Hash.ToLowerInvariant()
    if ($actualMd5 -ne $source.Md5) {
      throw "MD5 mismatch for $($source.Name): expected $($source.Md5), got $actualMd5"
    }
  }

  Add-Type -AssemblyName System.IO.Compression
  $archiveStream = [IO.File]::Open($sourceArchive, [IO.FileMode]::CreateNew)
  try {
    $archive = [IO.Compression.ZipArchive]::new(
      $archiveStream,
      [IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    try {
      foreach ($source in $sources) {
        $entry = $archive.CreateEntry(
          $source.Name,
          [IO.Compression.CompressionLevel]::Optimal
        )
        $entry.LastWriteTime = [DateTimeOffset]::Parse('2023-10-02T00:00:00Z')
        $entryStream = $entry.Open()
        try {
          $inputStream = [IO.File]::OpenRead((Join-Path $downloadDirectory $source.Name))
          try {
            $inputStream.CopyTo($entryStream)
          } finally {
            $inputStream.Dispose()
          }
        } finally {
          $entryStream.Dispose()
        }
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $archiveStream.Dispose()
  }

  & node (Join-Path $PSScriptRoot 'process-lifeboat-textures.mjs') `
    (Join-Path $downloadDirectory 'wood_planks_diff_1k.jpg') `
    (Join-Path $downloadDirectory 'wood_planks_rough_1k.jpg') `
    (Join-Path $downloadDirectory 'wood_planks_nor_gl_1k.jpg') `
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

  $archiveSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceArchive).Hash
  Write-Output "Source archive SHA-256: $archiveSha256"
  foreach ($name in $runtimeFiles) {
    $path = Join-Path $runtimeDirectory $name
    Write-Output "$name SHA-256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash)"
  }
} finally {
  $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
  $resolvedSystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (
    $resolvedTemporaryRoot.StartsWith($resolvedSystemTemp, [StringComparison]::OrdinalIgnoreCase) `
    -and (Split-Path -Leaf $resolvedTemporaryRoot).StartsWith('dont-sleep-lifeboat-textures-')
  ) {
    Remove-Item -Recurse -Force -LiteralPath $resolvedTemporaryRoot -ErrorAction SilentlyContinue
  }
}

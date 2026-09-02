function Assert-ContainedPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][string]$Child
  )
  $resolvedParent = [IO.Path]::GetFullPath($Parent).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  $resolvedChild = [IO.Path]::GetFullPath($Child)
  if (-not $resolvedChild.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing path outside guarded directory: $resolvedChild"
  }
}

function Publish-TextureFiles {
  param(
    [Parameter(Mandatory = $true)][string]$StagingDirectory,
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [Parameter(Mandatory = $true)][string[]]$RuntimeFiles
  )
  $stagedNames = @(
    Get-ChildItem -LiteralPath $StagingDirectory -File |
      Sort-Object Name |
      ForEach-Object Name
  )
  if ([string]::Join('|', $stagedNames) -ne [string]::Join('|', ($RuntimeFiles | Sort-Object))) {
    throw "Unexpected staged runtime files: $([string]::Join(', ', $stagedNames))"
  }
  New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null
  foreach ($name in $RuntimeFiles) {
    $sourcePath = Join-Path $StagingDirectory $name
    $destinationPath = Join-Path $RuntimeDirectory $name
    Assert-ContainedPath -Parent $RuntimeDirectory -Child $destinationPath
    Move-Item -Force -LiteralPath $sourcePath -Destination $destinationPath
  }
}

function Write-TextureHashes {
  param(
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [Parameter(Mandatory = $true)][string[]]$RuntimeFiles
  )
  foreach ($name in $RuntimeFiles) {
    $path = Join-Path $RuntimeDirectory $name
    Write-Output "$name SHA-256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash)"
  }
}

function Remove-GuardedTextureTempDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$TemporaryRoot,
    [Parameter(Mandatory = $true)][string]$Prefix
  )
  $resolvedRoot = [IO.Path]::GetFullPath($TemporaryRoot)
  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  if (
    $resolvedRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) `
    -and (Split-Path -Leaf $resolvedRoot).StartsWith($Prefix)
  ) {
    Remove-Item -Recurse -Force -LiteralPath $resolvedRoot -ErrorAction SilentlyContinue
  }
}

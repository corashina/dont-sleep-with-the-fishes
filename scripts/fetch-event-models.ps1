$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $repositoryRoot 'src\assets\models\events'
$downloadId = [guid]::NewGuid().ToString('N')
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "dont-sleep-event-models-$downloadId"

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
  New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
  $expectedTempParent = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
  if (-not $resolvedTempRoot.StartsWith($expectedTempParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Unsafe event model temporary directory'
  }

  Push-Location $repositoryRoot
  try {
    $sourceJson = & node scripts/poly-pizza-event-models.mjs --sources
    if ($LASTEXITCODE -ne 0) { throw 'Pinned event model descriptor query failed' }
    $metadataJson = & node scripts/poly-pizza-event-models.mjs --metadata
    if ($LASTEXITCODE -ne 0) { throw 'Pinned event model metadata query failed' }
  } finally {
    Pop-Location
  }
  $sources = $sourceJson | ConvertFrom-Json

  foreach ($property in $sources.PSObject.Properties) {
    $modelId = $property.Name
    $source = $property.Value
    $downloadPath = Join-Path $resolvedTempRoot "$modelId.glb"
    Invoke-WebRequest -Uri $source.downloadUrl -OutFile $downloadPath
    Assert-FileSha256 -Path $downloadPath -Expected $source.sha256
  }

  foreach ($property in $sources.PSObject.Properties) {
    $modelId = $property.Name
    Copy-Item `
      -LiteralPath (Join-Path $resolvedTempRoot "$modelId.glb") `
      -Destination (Join-Path $outputRoot "$modelId.glb") `
      -Force
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $outputRoot 'event-model-metadata.json'),
    ($metadataJson -join [Environment]::NewLine) + [Environment]::NewLine
  )
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    $resolved = (Resolve-Path -LiteralPath $tempRoot).Path
    $tempParent = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path
    if ($resolved.StartsWith($tempParent, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -Recurse -Force -LiteralPath $resolved
    }
  }
}

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$fixtureParent = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot = Join-Path $fixtureParent "kenney-item-selection-fetch-test-$([guid]::NewGuid().ToString('N'))"

try {
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  Set-Content -LiteralPath (Join-Path $fixtureRoot 'selection-catalog.json') -Value '{"packs":{},"items":{}}'

  & (Join-Path $PSScriptRoot 'fetch-packs.ps1') -SelectionRoot $fixtureRoot

  foreach ($directory in @('archives', 'sources')) {
    $path = Join-Path $fixtureRoot $directory
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
      throw "fetch-packs.ps1 did not create the fresh $directory directory"
    }
  }

  Write-Output 'fresh selection root created archives and sources directories'
} finally {
  $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
  $safePrefix = $fixtureParent.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $resolvedFixture.StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe fixture cleanup: $resolvedFixture"
  }
  if (Test-Path -LiteralPath $resolvedFixture) {
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
  }
}

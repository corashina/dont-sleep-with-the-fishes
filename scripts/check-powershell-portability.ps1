$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') |
  ConvertFrom-Json

$powerShellCommands = @(
  $package.scripts.PSObject.Properties |
    Where-Object { [string]$_.Value -match '\.ps1(?:\s|$)' }
)
foreach ($command in $powerShellCommands) {
  $value = [string]$command.Value
  if (-not $value.StartsWith('pwsh -NoProfile -File scripts/', [StringComparison]::Ordinal)) {
    throw "Package command $($command.Name) does not use portable PowerShell 7: $value"
  }
}

$parseFailures = @()
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $file.FullName,
    [ref]$tokens,
    [ref]$errors
  ) | Out-Null
  foreach ($error in $errors) {
    $parseFailures += "$($file.Name): $($error.Message)"
  }
}
if ($parseFailures.Count -gt 0) {
  throw "PowerShell syntax errors:`n$($parseFailures -join "`n")"
}

$assetFetchFiles = Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'fetch-*.ps1' -File
foreach ($file in $assetFetchFiles) {
  $source = Get-Content -Raw -LiteralPath $file.FullName
  if ($source.Contains('src\assets')) {
    throw "$($file.Name) contains a Windows-only asset path."
  }
}

$publicationPath = Join-Path $PSScriptRoot 'texture-publication.ps1'
$publicationSource = Get-Content -Raw -LiteralPath $publicationPath
if ($publicationSource.Contains("TrimEnd('\\')") -or $publicationSource.Contains("+ '\\'")) {
  throw 'texture-publication.ps1 contains a Windows-only path separator.'
}

. $publicationPath
$probeName = "dont-sleep-path-probe-$([Guid]::NewGuid().ToString('N'))"
$parent = Join-Path ([IO.Path]::GetTempPath()) $probeName
$inside = Join-Path $parent 'child'
Assert-ContainedPath -Parent $parent -Child $inside

$outside = [IO.Path]::GetFullPath((Join-Path $parent '..'))
$rejected = $false
try {
  Assert-ContainedPath -Parent $parent -Child $outside
} catch {
  $rejected = $true
}
if (-not $rejected) {
  throw 'Assert-ContainedPath accepted a path outside its parent.'
}

Write-Output "Verified $($powerShellCommands.Count) PowerShell commands and $($assetFetchFiles.Count) asset scripts."

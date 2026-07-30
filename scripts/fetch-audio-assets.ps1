param([switch]$Force)

$ErrorActionPreference = 'Stop'
$arguments = @((Join-Path $PSScriptRoot 'fetch-audio-assets.mjs'))
if ($Force) {
  $arguments += '--force'
}

& node $arguments
if ($LASTEXITCODE -ne 0) {
  throw 'Audio asset download failed.'
}

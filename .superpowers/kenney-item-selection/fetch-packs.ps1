param(
  [string]$SelectionRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$selectionRoot = [System.IO.Path]::GetFullPath($SelectionRoot)
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $selectionRoot '..\..'))
. (Join-Path $repositoryRoot 'scripts\kenney-item-sources.ps1')

$catalog = Get-Content -Raw (Join-Path $selectionRoot 'selection-catalog.json') | ConvertFrom-Json
$archivesRoot = Join-Path $selectionRoot 'archives'
$sourcesRoot = Join-Path $selectionRoot 'sources'
New-Item -ItemType Directory -Force -Path $archivesRoot, $sourcesRoot | Out-Null

foreach ($property in $catalog.packs.PSObject.Properties) {
  $packId = $property.Name
  $pack = $property.Value
  $archivePath = Join-Path $archivesRoot "$packId.zip"
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    Invoke-WebRequest -Uri $pack.archiveUrl -OutFile $archivePath
  }
  Assert-FileSha256 -Path $archivePath -Expected $pack.sha256
  $destination = Join-Path $sourcesRoot $packId
  $entries = [string[]]@($pack.requiredEntries)
  Expand-ApprovedArchiveEntries -ArchivePath $archivePath -DestinationRoot $destination -Entries $entries
}

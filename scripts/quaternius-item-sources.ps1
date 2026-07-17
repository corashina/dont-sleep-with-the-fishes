[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SurvivalArchive,
  [Parameter(Mandatory = $true)][string]$PirateArchive,
  [string]$DestinationRoot
)

$ErrorActionPreference = 'Stop'
if (-not $PSBoundParameters.ContainsKey('DestinationRoot')) {
  $DestinationRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'third_party\quaternius-items'
}
. (Join-Path $PSScriptRoot 'kenney-item-sources.ps1')

$packs = @(
  @{ Archive = $SurvivalArchive; Hash = 'DB7E41CE2B2F872480E3C24236FDB5CE64AD05071C436B6C47BC455CD3540EB5'; Prefix = 'Survival Pack - Sept 2020/OBJ'; Target = 'survival'; Entries = @('Compass_Open.obj', 'Compass_Open.mtl', 'FlareGun.obj', 'FlareGun.mtl') },
  @{ Archive = $PirateArchive; Hash = 'ED201326D2F80CFAC4E3CDC7DB34152078AE35F98D77AA14ED7416A931276D36'; Prefix = 'Pirate Kit - Nov 2023/OBJ'; Target = 'pirate'; Entries = @('Prop_Anchor.obj', 'Prop_Anchor.mtl') }
)

function Assert-ExactModelDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$ExpectedPaths
  )

  $root = (Resolve-Path -LiteralPath $Path).Path.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $actualPaths = @(
    Get-ChildItem -LiteralPath $root -Recurse -File |
      ForEach-Object { $_.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/') } |
      Sort-Object
  )
  $expected = @($ExpectedPaths | Sort-Object)

  if ($actualPaths.Count -ne $expected.Count -or (Compare-Object -ReferenceObject $expected -DifferenceObject $actualPaths)) {
    throw "Unexpected prepared source files: $($actualPaths -join ', ')"
  }
}

$destinationParent = Split-Path -Parent $DestinationRoot
$destinationLeaf = Split-Path -Leaf $DestinationRoot
New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
$stage = Join-Path $destinationParent ".${destinationLeaf}.stage.$([System.Guid]::NewGuid().ToString('N'))"

try {
  New-Item -ItemType Directory -Force -Path $stage | Out-Null

  foreach ($pack in $packs) {
    Assert-FileSha256 -Path $pack.Archive -Expected $pack.Hash
    $archiveEntries = @($pack.Entries | ForEach-Object { "$($pack.Prefix)/$_" })
    Expand-ApprovedArchiveEntries -ArchivePath $pack.Archive -DestinationRoot $stage -Entries $archiveEntries

    foreach ($entry in $pack.Entries) {
      $source = Join-Path $stage ("$($pack.Prefix)/$entry" -replace '/', '\\')
      $target = Join-Path $stage ("$($pack.Target)/$entry" -replace '/', '\\')
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $source -Destination $target -Force
    }

    Remove-Item -LiteralPath (Join-Path $stage $pack.Prefix.Split('/')[0]) -Recurse -Force
  }

  $expectedPaths = @(
    foreach ($pack in $packs) {
      foreach ($entry in $pack.Entries) {
        "$($pack.Target)/$entry"
      }
    }
  )
  Assert-ExactModelDirectory -Path $stage -ExpectedPaths $expectedPaths

  if (Test-Path -LiteralPath $DestinationRoot) {
    Remove-Item -LiteralPath $DestinationRoot -Recurse -Force
  }
  Move-Item -LiteralPath $stage -Destination $DestinationRoot
} finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}

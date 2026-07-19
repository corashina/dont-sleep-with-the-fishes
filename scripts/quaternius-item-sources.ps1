[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SurvivalArchive,
  [Parameter(Mandatory = $true)][string]$PirateArchive,
  [string]$DestinationRoot
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$defaultDestinationRoot = Join-Path $repositoryRoot 'third_party\quaternius-items'
if (-not $PSBoundParameters.ContainsKey('DestinationRoot')) {
  $DestinationRoot = $defaultDestinationRoot
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

function Get-NormalizedDirectoryPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $filesystemRoot = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Length -gt $filesystemRoot.Length) {
    return $fullPath.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    )
  }
  return $fullPath
}

function Test-IsSameOrDescendantPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )

  return $Path.Equals($Root, [System.StringComparison]::OrdinalIgnoreCase) -or
    $Path.StartsWith($Root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeDestinationRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$RepositoryRoot,
    [Parameter(Mandatory = $true)][string]$DefaultRoot
  )

  $destination = Get-NormalizedDirectoryPath -Path $Path
  $filesystemRoot = [System.IO.Path]::GetPathRoot($destination)
  if ($destination.Equals($filesystemRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe destination root: filesystem roots are not allowed: $destination"
  }

  if ($destination.Equals($DefaultRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $destination
  }

  if ((Test-IsSameOrDescendantPath -Path $destination -Root $RepositoryRoot) -or
      (Test-IsSameOrDescendantPath -Path $RepositoryRoot -Root $destination)) {
    throw "Refusing unsafe destination root: only $DefaultRoot may be used inside or around the repository"
  }

  $temporaryRoot = Get-NormalizedDirectoryPath -Path ([System.IO.Path]::GetTempPath())
  if (-not (Test-IsSameOrDescendantPath -Path $destination -Root $temporaryRoot) -or
      $destination.Equals($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe destination root: test destinations must be empty children of $temporaryRoot"
  }

  if (Test-Path -LiteralPath $destination -PathType Leaf) {
    throw "Refusing unsafe destination root: destination must be a directory: $destination"
  }
  if (Test-Path -LiteralPath $destination) {
    $destinationItem = Get-Item -LiteralPath $destination -Force
    if (($destinationItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing unsafe destination root: reparse-point destinations are not allowed: $destination"
    }
    if (@(Get-ChildItem -LiteralPath $destination -Force).Count -ne 0) {
      throw "Refusing unsafe destination root: arbitrary populated destinations are not allowed: $destination"
    }
  }

  return $destination
}

$DestinationRoot = Assert-SafeDestinationRoot `
  -Path $DestinationRoot `
  -RepositoryRoot $repositoryRoot `
  -DefaultRoot $defaultDestinationRoot

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

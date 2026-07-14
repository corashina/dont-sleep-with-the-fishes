function Assert-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected
  )
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if (-not $actual.Equals($Expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Archive SHA-256 mismatch for $Path`: expected $Expected, received $actual"
  }
}

function Expand-ApprovedArchiveEntries {
  param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$DestinationRoot,
    [Parameter(Mandatory = $true)][string[]]$Entries
  )
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $root = [System.IO.Path]::GetFullPath($DestinationRoot).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    foreach ($entryName in $Entries) {
      if ([System.IO.Path]::IsPathRooted($entryName) -or $entryName -match '(^|[\\/])\.\.([\\/]|$)') {
        throw "Unsafe archive entry: $entryName"
      }
      $entry = $archive.GetEntry($entryName)
      if ($null -eq $entry) { throw "Missing archive entry: $entryName" }
      $target = [System.IO.Path]::GetFullPath((Join-Path $root $entryName))
      if (-not $target.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe archive target: $target"
      }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
    }
  } finally {
    $archive.Dispose()
  }
}

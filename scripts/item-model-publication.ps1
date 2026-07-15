function Get-GuardedSwapPath {
  param(
    [Parameter(Mandatory = $true)][string]$ModelsRoot,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Prefix
  )
  $fullModelsRoot = [System.IO.Path]::GetFullPath($ModelsRoot).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $fullPath)).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $leaf = Split-Path -Leaf $fullPath
  if (
    -not $fullParent.Equals($fullModelsRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $leaf.StartsWith($Prefix, [System.StringComparison]::Ordinal)
  ) {
    throw "Refusing unsafe model swap path: $fullPath"
  }
  return $fullPath
}

function Remove-GuardedSwapDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$ModelsRoot,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Prefix
  )
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $guardedPath = Get-GuardedSwapPath -ModelsRoot $ModelsRoot -Path $Path -Prefix $Prefix
  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  if ($resolvedPath -ne $guardedPath) {
    throw "Refusing to clean redirected model swap path: $resolvedPath"
  }
  Remove-Item -Recurse -Force -LiteralPath $resolvedPath
}

function Publish-ModelDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$ModelsRoot,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$StagedRoot,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [Parameter(Mandatory = $true)][string]$StagePrefix,
    [Parameter(Mandatory = $true)][string]$BackupPrefix,
    [scriptblock]$MoveDirectory = {
      param([string]$Source, [string]$Destination)
      Move-Item -LiteralPath $Source -Destination $Destination
    }
  )

  $StagedRoot = Get-GuardedSwapPath -ModelsRoot $ModelsRoot -Path $StagedRoot -Prefix $StagePrefix
  $BackupRoot = Get-GuardedSwapPath -ModelsRoot $ModelsRoot -Path $BackupRoot -Prefix $BackupPrefix
  $previousMoved = $false
  $newPublished = $false
  $published = $false
  try {
    try {
      if (Test-Path -LiteralPath $OutputRoot) {
        & $MoveDirectory $OutputRoot $BackupRoot
        $previousMoved = $true
      }
      & $MoveDirectory $StagedRoot $OutputRoot
      $newPublished = $true
    } catch {
      $publishError = $_
      try {
        if ($newPublished -and (Test-Path -LiteralPath $OutputRoot)) {
          & $MoveDirectory $OutputRoot $StagedRoot
          $newPublished = $false
        }
        if ($previousMoved -and (Test-Path -LiteralPath $BackupRoot)) {
          & $MoveDirectory $BackupRoot $OutputRoot
          $previousMoved = $false
        }
      } catch {
        throw "Model directory publication failed and rollback also failed: $($publishError.Exception.Message); $($_.Exception.Message)"
      }
      throw $publishError
    }

    if ($previousMoved) {
      Remove-GuardedSwapDirectory -ModelsRoot $ModelsRoot -Path $BackupRoot -Prefix $BackupPrefix
    }
    $published = $true
  } finally {
    if (-not $published) {
      Remove-GuardedSwapDirectory -ModelsRoot $ModelsRoot -Path $StagedRoot -Prefix $StagePrefix
    }
  }
}

function Publish-ItemModelDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$ModelsRoot,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$StagedRoot,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [scriptblock]$MoveDirectory = {
      param([string]$Source, [string]$Destination)
      Move-Item -LiteralPath $Source -Destination $Destination
    }
  )
  Publish-ModelDirectory `
    -ModelsRoot $ModelsRoot `
    -OutputRoot $OutputRoot `
    -StagedRoot $StagedRoot `
    -BackupRoot $BackupRoot `
    -StagePrefix '.items-stage-' `
    -BackupPrefix '.items-backup-' `
    -MoveDirectory $MoveDirectory
}

function Publish-ShipFurnitureDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$ModelsRoot,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$StagedRoot,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [scriptblock]$MoveDirectory = {
      param([string]$Source, [string]$Destination)
      Move-Item -LiteralPath $Source -Destination $Destination
    }
  )
  Publish-ModelDirectory `
    -ModelsRoot $ModelsRoot `
    -OutputRoot $OutputRoot `
    -StagedRoot $StagedRoot `
    -BackupRoot $BackupRoot `
    -StagePrefix '.ship-stage-' `
    -BackupPrefix '.ship-backup-' `
    -MoveDirectory $MoveDirectory
}

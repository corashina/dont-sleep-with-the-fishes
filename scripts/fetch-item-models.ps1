$ErrorActionPreference = 'Stop'

$models = @(
  [ordered]@{ ItemId = 'flareGun'; PublicId = '44H9OBUqTC'; ResourceId = '9ec52cda-c918-43f0-b7af-354e7fe96c37'; Title = 'Flare Gun'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'ductTape'; PublicId = 'fu49rGO7Ukc'; ResourceId = '06934616-1393-451d-bdf6-2101a5e32703'; Title = 'Tape'; Creator = 'Poly by Google'; License = 'CC-BY 3.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'fishingRod'; PublicId = 'lDlWQjn9Zg'; ResourceId = 'c15761f7-4aef-4bf4-9565-50a68a981f34'; Title = 'Fishing Rod'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'baitTin'; PublicId = 'IuoYedcdXQ'; ResourceId = 'f6b52ca9-61b1-42d5-a42f-d8748a41eb45'; Title = 'Can Red'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'medicalKit'; PublicId = 'Hp80p6148W'; ResourceId = '41249676-0965-40df-8dd7-eee79dd9e6cf'; Title = 'First Aid Kit'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'waterJug'; PublicId = 'KpxDpidn1Z'; ResourceId = '3ebef9a3-c2df-49ee-abe1-df38b5777bcd'; Title = 'Water Bottle'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'cannedFood'; PublicId = 'YnowJvWqxE'; ResourceId = 'e16e13cf-fbc4-48c8-9927-ae34920a498e'; Title = 'Can'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'flashlight'; PublicId = 'WGsvr4KOZd'; ResourceId = '035c4897-22f3-4e9c-b29f-ebafe2b566da'; Title = 'Torch'; Creator = 'Quaternius'; License = 'CC0 1.0'; Processing = 'copy' },
  [ordered]@{ ItemId = 'scubaSet'; PublicId = '7igrHLjaQlW'; ResourceId = 'efda7497-db5e-47e9-b317-8e8baeb1c616'; Title = 'Scuba equipment'; Creator = 'Steren Giannini'; License = 'CC-BY 3.0'; Processing = 'simplify' }
)

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $repositoryRoot 'src\assets\models\items'
$osTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempRoot = Join-Path $osTempRoot "dont-sleep-item-models-$([guid]::NewGuid().ToString('N'))"
$sources = @{}

if (-not (Get-Command bunx.cmd -ErrorAction SilentlyContinue)) {
  $bunx = Get-Command bunx.exe -ErrorAction Stop
  Set-Alias -Name bunx.cmd -Value $bunx.Source -Scope Script
}

try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $tempRoot = (Resolve-Path -LiteralPath $tempRoot).Path

  foreach ($model in $models) {
    $pageUrl = "https://poly.pizza/m/$($model.PublicId)"
    $page = (Invoke-WebRequest -UseBasicParsing -Uri $pageUrl).Content
    $resourceId = [regex]::Match($page, '"ResourceID":"([^"]+)"').Groups[1].Value
    $title = [regex]::Match($page, '"Title":"([^"]+)"').Groups[1].Value
    $publicId = [regex]::Match($page, '"PublicID":"([^"]+)"').Groups[1].Value
    $creator = [regex]::Match($page, '"Username":"([^"]+)"').Groups[1].Value
    $license = [regex]::Match($page, '"Licence":"([^"]+)"').Groups[1].Value
    if (
      $resourceId -ne $model.ResourceId -or
      $title -ne $model.Title -or
      $publicId -ne $model.PublicId -or
      $creator -ne $model.Creator -or
      $license -ne $model.License
    ) {
      throw "Poly Pizza metadata mismatch for $($model.ItemId)"
    }
    $source = Join-Path $tempRoot "$($model.ItemId).source.glb"
    Invoke-WebRequest -UseBasicParsing -Uri "https://static.poly.pizza/$resourceId.glb" -OutFile $source
    $sources[$model.ItemId] = $source
  }

  $stagedRoot = Join-Path $tempRoot 'output'
  New-Item -ItemType Directory -Path $stagedRoot | Out-Null

  foreach ($model in $models | Where-Object Processing -eq 'copy') {
    Copy-Item -LiteralPath $sources[$model.ItemId] -Destination (Join-Path $stagedRoot "$($model.ItemId).glb")
  }

  $scubaSource = $sources.scubaSet
  $scubaWelded = Join-Path $tempRoot 'scubaSet.welded.glb'
  & bunx.cmd gltf-transform weld $scubaSource $scubaWelded
  if ($LASTEXITCODE -ne 0) { throw 'Scuba equipment weld failed' }
  $scubaOutput = Join-Path $stagedRoot 'scubaSet.glb'
  # 0.001 produced 3,634 triangles; 0.005 is the first tested error meeting the 3,000 cap (2,786).
  & bunx.cmd gltf-transform simplify $scubaWelded $scubaOutput --ratio 0.55 --error 0.005
  if ($LASTEXITCODE -ne 0) { throw 'Scuba equipment simplification failed' }

  $stagedFiles = @(Get-ChildItem -LiteralPath $stagedRoot -File -Filter '*.glb')
  if ($stagedFiles.Count -ne $models.Count) {
    throw "Expected $($models.Count) staged GLBs, found $($stagedFiles.Count)"
  }

  New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
  foreach ($model in $models) {
    $stagedFile = Join-Path $stagedRoot "$($model.ItemId).glb"
    if (-not (Test-Path -LiteralPath $stagedFile -PathType Leaf)) {
      throw "Missing staged model for $($model.ItemId)"
    }
    Copy-Item -Force -LiteralPath $stagedFile -Destination (Join-Path $outputRoot "$($model.ItemId).glb")
  }

  Push-Location $repositoryRoot
  try {
    & node scripts/check-item-models.mjs --assets-only
    if ($LASTEXITCODE -ne 0) { throw 'Downloaded item model audit failed' }
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path
    $tempPrefix = $osTempRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedTempRoot.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean non-temporary path: $resolvedTempRoot"
    }
    Remove-Item -Recurse -Force -LiteralPath $resolvedTempRoot
  }
}

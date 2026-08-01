$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectRoot 'src\assets\ship'
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) (
  'dont-sleep-ship-textures-' + [Guid]::NewGuid().ToString('N')
)
$downloadDirectory = Join-Path $temporaryRoot 'downloads'
$stagingDirectory = Join-Path $temporaryRoot 'runtime'
$userAgent = 'dont-sleep-with-the-fishes/0.1 asset-pipeline'

$directSources = @(
  @{
    Name = 'dark_wooden_planks_diff_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dark_wooden_planks/dark_wooden_planks_diff_1k.jpg'
    Sha256 = 'E8216BAA6B2D701B5523FCB904D45570ACF7B96D160EF815E96E2DBFA82BDD9B'
  },
  @{
    Name = 'dark_wooden_planks_rough_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dark_wooden_planks/dark_wooden_planks_rough_1k.jpg'
    Sha256 = 'A10EA0B52FE395A7AD205CACFD28BD1AEA48EF8545D171209F528DCF58D0A8D3'
  },
  @{
    Name = 'dark_wooden_planks_nor_gl_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/dark_wooden_planks/dark_wooden_planks_nor_gl_1k.jpg'
    Sha256 = '87A7B26BC674477865D4589C6589200BFA649A6461422BF56F5600C05A470206'
  },
  @{
    Name = 'white_planks_clean_diff_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_diff_1k.jpg'
    Sha256 = '1BE65E3940B59A4E7EB902F47DA5D00DDB2B427B5EF18E7959FD82F17A3AFB2C'
  },
  @{
    Name = 'white_planks_clean_rough_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_rough_1k.jpg'
    Sha256 = 'A707C6FFC7CFA8F354E0E62E351009E1CED71A6150738D39EB20FAA814AC39F1'
  },
  @{
    Name = 'white_planks_clean_nor_gl_1k.jpg'
    Url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_planks_clean/white_planks_clean_nor_gl_1k.jpg'
    Sha256 = '8D9CEEF61DBC4BD567BA1B10691C890CAF74CDDB9861B576F194533B7089FF7E'
  }
)

$runtimeFiles = @(
  'dark-wood-color.webp',
  'dark-wood-normal.webp',
  'dark-wood-roughness.webp',
  'room-painted-wood-color.webp',
  'room-painted-wood-normal.webp',
  'room-painted-wood-roughness.webp'
)
. (Join-Path $PSScriptRoot 'texture-publication.ps1')

try {
  New-Item -ItemType Directory -Force -Path (
    $downloadDirectory,
    $stagingDirectory
  ) | Out-Null

  foreach ($source in $directSources) {
    $destination = Join-Path $downloadDirectory $source.Name
    Invoke-WebRequest -Uri $source.Url -OutFile $destination -Headers @{
      'User-Agent' = $userAgent
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash
    if ($actualHash -ne $source.Sha256) {
      throw "SHA-256 mismatch for $($source.Name): $actualHash"
    }
  }

  & node (Join-Path $PSScriptRoot 'process-ship-textures.mjs') `
    (Join-Path $downloadDirectory 'dark_wooden_planks_diff_1k.jpg') `
    (Join-Path $downloadDirectory 'dark_wooden_planks_rough_1k.jpg') `
    (Join-Path $downloadDirectory 'dark_wooden_planks_nor_gl_1k.jpg') `
    (Join-Path $downloadDirectory 'white_planks_clean_diff_1k.jpg') `
    (Join-Path $downloadDirectory 'white_planks_clean_rough_1k.jpg') `
    (Join-Path $downloadDirectory 'white_planks_clean_nor_gl_1k.jpg') `
    $stagingDirectory
  if ($LASTEXITCODE -ne 0) {
    throw "Texture processing failed with exit code $LASTEXITCODE"
  }

  Publish-TextureFiles $stagingDirectory $runtimeDirectory $runtimeFiles
  Write-TextureHashes $runtimeDirectory $runtimeFiles
} finally {
  Remove-GuardedTextureTempDirectory $temporaryRoot 'dont-sleep-ship-textures-'
}

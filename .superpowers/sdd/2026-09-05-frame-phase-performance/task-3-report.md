# Task 3 report: embedded texture reduction

## Result

The map and starfish now use embedded WebP color textures with a 512-pixel limit.

| Model | Before | After | Reduction | Source SHA-256 | Output SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| map | 1,309,892 bytes | 41,448 bytes | 1,268,444 bytes (96.84%) | `ACA3349080F1BDFF11AA6A7EA3C6C2854008B52ECB4624EEFC882724986087D4` | `4A851FCDC3D073822391DB7687F4A7F70528F0D1B3F723F4565D384417BDA127` |
| starfish | 3,456,468 bytes | 58,396 bytes | 3,398,072 bytes (98.31%) | `71F088AB919DBB4961532D325A04E03504910F5C4ED72FCB67A5876ADC390A4A` | `15ED596F7321A5B8A911E3DC9636C0B8B5FAFF15876664E48F289DB92E67CEAC` |
| Combined | 4,766,360 bytes | 99,844 bytes | 4,666,516 bytes (97.91%) | — | — |

The source files remain unchanged in the task scratch directory.

## Profiles

Both profiles use a maximum dimension of 512 pixels.

Color and packed textures use WebP quality 85. Normal textures use WebP quality 95.

The map file ceiling is 500,000 bytes. The starfish file ceiling is 1,000,000 bytes.

The build checks alpha before and after encoding. It rejects changed alpha use.

The checks pin image format, dimensions, channels, alpha, texture names, and material slots.

## Texture inspection

| Model | Texture | Before | After | After bytes | Slot | Alpha |
| --- | --- | --- | --- | ---: | --- | --- |
| map | `mapTxt` | JPEG, 4096×2048, 3 channels | WebP, 512×256, 3 channels | 31,856 | base color | No |
| starfish | `starFishAquaTxt` | PNG, 2048×2048, 3 channels | WebP, 512×512, 3 channels | 15,628 | base color | No |
| starfish | `starFishWhiteTxt` | PNG, 2048×2048, 3 channels | WebP, 512×512, 3 channels | 17,242 | base color | No |
| starfish | `starFishOrangeTxt` | PNG, 2048×2048, 3 channels | WebP, 512×512, 3 channels | 14,244 | base color | No |

Neither source model has a normal texture or packed texture.

Before and after image inspection found no lost regions, wrong colors, or alpha changes.

The starfish silhouettes and surface patterns remain clear. The map layout remains clear.

Small map labels are softer at 512 pixels. The runtime item does not show those labels at full size.

## Geometry and materials

The map remains one mesh, two primitives, two opaque materials, and 480 triangles.

`lambert5SG` still uses `mapTxt`. `lambert6SG` remains untextured.

The starfish remains one mesh, three primitives, three opaque materials, and 780 triangles.

Each starfish material keeps its original color texture assignment.

No material uses alpha, a normal texture, a metallic-roughness texture, or an occlusion texture.

Model bounds and animation metadata remain unchanged. Texture metadata now records the processed images.

## Reproducibility

Generation used Node.js 24.18.0, Sharp 0.34.5, and glTF Transform 4.4.1.

The shared workspace had glTF Transform 4.5.0. Its transitive Sharp 0.35.4 binary could not load.

Generation used the hash-verified 4.4.1 scratch runtime from the committed lock data.

The scratch import hook only changed module resolution for generation and checks. It is not a project file.

Two clean rebuilds produced the exact output hashes shown above.

Fresh frozen-lock installs use the standard script imports and the pinned 4.4.1 packages.

## Validation

- Locked item model check: pass, 27,081 of 40,000 triangles.
- Locked menu model check: pass, 9,155 of 10,000 triangles.
- Full asset checks: pass for item, ship, fishing, event, menu, lifeboat texture, and ship texture assets.
- `node node_modules/eslint/bin/eslint.js . --max-warnings 0`: pass.
- `node node_modules/typescript/bin/tsc --noEmit`: pass.
- `node node_modules/vite/bin/vite.js build`: pass, 540 modules transformed.
- `git diff --check`: pass.

The production build emits the map at 41.45 kB and the starfish at 58.40 kB.

## Self-review

The change only affects the model pipeline, model checks, metadata, attribution, and two GLB files.

The change does not modify phase loading, frame work, gameplay, timing, or runtime model IDs.

The profile code handles normal textures separately. It rejects one image used for normal and color data.

The check scripts enforce strict decimal file ceilings and exact committed hashes.

The source attribution, license, source URL, source asset ID, and source hashes remain intact.

## Concern

The parent still needs to run the planned browser smoke for the menu starfish and in-game map.

No FPS profile was recorded. This task only proves file and texture reductions.

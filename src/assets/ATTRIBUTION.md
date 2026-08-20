# Third-Party Assets

Poly Pizza is the default source for runtime item models. Carlitos uses
DreamNoms' Somali Cat from Sketchfab under CC-BY 4.0. Models credited to
**Poly by Google** are preferred when they fit the item, license, visual style,
and performance budget. Every collectible, lifeboat-equipment, and practical
light model below otherwise comes from Poly Pizza and is pinned by its static
resource ID and source SHA-256. Ship furniture combines the existing Kenney CC0 set with
pinned Poly Pizza barrel, shelf, crate, and cargo-box models, and the lifeboat
uses one locally processed Poly Haven CC0 texture set.

## Runtime font asset ledger

The Latin WOFF2 files were downloaded from Fontsource's generated webfont
repository at commit `1fdb61d90d0e5a234f14b562aebf3e2a7addf374`.

| Runtime files | Family | Permanent source | License | Runtime verification |
|---|---|---|---|---|
| `src/assets/fonts/bowlby-one-sc-latin-400-normal.woff2` | Bowlby One SC | https://github.com/google/fonts/tree/main/ofl/bowlbyonesc | [OFL 1.1](https://github.com/google/fonts/blob/main/ofl/bowlbyonesc/OFL.txt) | SHA-256 `C6860FFE6F98701C1B0CDDAD6F6CF7D57EC1B1226647C9F7BA45A3BF5CE1261A` |
| `src/assets/fonts/alegreya-sans-latin-{400,700}-normal.woff2` | Alegreya Sans | https://github.com/google/fonts/tree/main/ofl/alegreyasans | [OFL 1.1](https://github.com/google/fonts/blob/main/ofl/alegreyasans/OFL.txt) | 400 SHA-256 `B2A5A35A2563A2F9BF9FB91939FC6EA6C115E9811CDA5C4A37D02F623C7C4DBE`; 700 SHA-256 `5ACD19A588614D23E52B741A21DD8555178AB4932C3195C6D8FB4B296F84ACAE` |
| `src/assets/fonts/ibm-plex-mono-latin-600-normal.woff2` | IBM Plex Mono | https://github.com/IBM/plex | [OFL 1.1](https://github.com/IBM/plex/blob/master/LICENSE.txt) | SHA-256 `0D1F0B8D0722224E32E9F28261BDC86C79115BE73444AE5ECEB73976A1BCDF83` |

## Runtime texture asset ledger

| Runtime files | Texture / creator | Permanent source | License | Processing | Downloaded |
|---|---|---|---|---|---|
| `src/assets/lifeboat/wood-planks-{color,roughness,normal}.webp` | Wood Planks / Amal Kumar, Poly Haven | https://polyhaven.com/a/wood_planks | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `scripts/fetch-lifeboat-textures.ps1` verifies the official 1K JPEG maps and produces 512x512 lossless WebP maps. Runtime SHA-256: color `7A31AE86AE9B0A0B18671859788549CEDC08323271B6F2F580CDAFD4A36DCADA`; roughness `E0DDAD3CE2D94B7AD7FB69277FC7C068DF64A40CEDA242F787594006300E9B9B`; normal `D7031EE7E5D1184DE6BBACE40F097C12CF8E4F1ECC5C46F9B909EF112F66209C`. | 2026-07-24 |
| `src/assets/ship/dark-wood-{color,roughness,normal}.webp` | Dark Wooden Planks / Amal Kumar, Poly Haven | https://polyhaven.com/a/dark_wooden_planks | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `scripts/fetch-ship-textures.ps1` verifies the official 1K JPEG maps and produces 512x512 WebP maps. Runtime SHA-256: color `7B5E5BFEB9037CC8300FA863104CE1BEC5CD184776F77C59D7CB3F18212E1441`; roughness `71FF0E9102388B108AC6A2C0C44776A70BBD1363435D63EC874FF7DCC4072082`; normal `7CB243AE6C56179CC66E49DFEB467F15097F225074BBF06EC42F8530312C6C22`. | 2026-07-29 |
| `src/assets/ship/room-painted-wood-{color,roughness,normal}.webp` | White Planks Clean / Poly Haven | https://polyhaven.com/a/white_planks_clean | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `scripts/fetch-ship-textures.ps1` verifies the official 1K JPEG maps and produces 512x512 WebP maps. Runtime SHA-256: color `6734ECCC799B2954C2F3D9EE8CB4D8343EB4BBC4175DE3E8A834E078E05DDC6F`; roughness `AD00EB72E24ABA99CB518FDA947C15713B809C88CB64A149056D7D296D478D98`; normal `56866DE8136A804DDEC4DF7C4B32135C8D47B4F5E951EB271F153B96DC287FCB`. | 2026-07-29 |

| `src/assets/menu-sand/aerial-beach-01-diffuse.jpg` | Aerial Beach 01 / Rob Tuytel, Poly Haven | https://polyhaven.com/a/aerial_beach_01 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Retained the official 1K JPEG diffuse map for the smooth near and middle terrain. Runtime SHA-256 `5B849983D08FDA1C6D28B95B55851C2227697598721B25FF2B85E57CF8B04FC4`. | 2026-08-17 |
| `src/assets/menu-sand/sandy-gravel-diffuse.jpg` | Sandy Gravel / Charlotte Baglioni, Poly Haven | https://polyhaven.com/a/sandy_gravel | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Source file retained for attribution. The game does not load it. SHA-256 `38829E669DC246E86B7CE94C4141485709988450B13F82CFC4BC6067DD69ED48`. | 2026-08-17 |

## Runtime item and practical-light model ledger

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| cannedFood | `cannedFood.glb` | tin can / bobbeh | https://poly.pizza/m/onPuYPx0q7 | `poly-pizza:fd443036-3eca-46e4-8342-06fd48f93e8b` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 700 | 700 | Source GLB SHA-256 `73EB054C04E778FE38F9AF2747AE7F9028710AA1527867FE02768A75F7E0F10A`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| baitTin | `baitTin.glb` | Jars / Kay Lousberg | https://poly.pizza/m/ubNPKDn2yH | `poly-pizza:1246c082-49d3-45b3-86b8-bd44e49c5384` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2192 | 192 | Source GLB SHA-256 `3DEC909E1FFE93ABE2D274ECF81875FFDB46B7AA3E5601CFE57853A984635A31`; downloaded from the official Poly Pizza static GLB; selected the `jar_D_small` node; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| ductTape | `ductTape.glb` | Time Hotel 5.25 Painters Tape / S. Paul Michael | https://poly.pizza/m/dLlslRdbHfs | `poly-pizza:0db201fd-36aa-4c36-8047-ebec79f146b8` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 2376 | 2376 | Source GLB SHA-256 `67CEDDF0FB84F8AC6F6B458BE6C8561B6649EEC43EA3E4C4C543B006219F4AC3`; downloaded from the official Poly Pizza static GLB; retained the source materials without recoloring; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| compass | `compass.glb` | compass / Chase Lortie | https://poly.pizza/m/0_8Fl9uTtY2 | `poly-pizza:c9a055de-363b-4d31-9525-ac044f2958f1` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 720 | 720 | Source GLB SHA-256 `0B613A4C350666590341AF5B5FC7EF2F6629E9D8DDC60955D2FC12CBE481476B`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-08-20 |
| map | `map.glb` | Map / Poly by Google | https://poly.pizza/m/bU3B6P0ngfi | `poly-pizza:c06cc95b-6a05-469c-aa4a-a44fdac2e9c0` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 480 | 480 | Source GLB SHA-256 `ACA3349080F1BDFF11AA6A7EA3C6C2854008B52ECB4624EEFC882724986087D4`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| medicalKit | `medicalKit.glb` | First Aid Kit / Quaternius | https://poly.pizza/m/wP00rePSRD | `poly-pizza:ac2e0be3-3279-48be-ac2b-d50077b44eab` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 754 | 754 | Source GLB SHA-256 `69BA229801C2156228389BA4498F75DDC8663A768D794668E29780DE4E803B5E`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| spyglass | `spyglass.glb` | Binoculars / Poly by Google | https://poly.pizza/m/6nj5FdUlsEW | `poly-pizza:fffe317f-3c82-4447-a0a1-317c2972889f` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 928 | 928 | Source GLB SHA-256 `036AE3ED3486EFEED1EE33387143A205A2AF561F3E1EDBFA8000C6E5C61DC561`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| fishingNet | `fishingNet.glb` | Fishing net / Poly by Google | https://poly.pizza/m/6xRmXaU-L7e | `poly-pizza:9d291011-bf4c-4202-ad84-97bf9e964dae` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 8422 | 8422 | Source GLB SHA-256 `676BB90BE7356794BFE07D607C1BA1AF45F4C756BD94B400FEFBCF73C5582FB5`; downloaded from the official Poly Pizza static GLB; retained the source lattice geometry to prevent strand tearing; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| bucket | `bucket.glb` | Bucket / Poly by Google | https://poly.pizza/m/5HPoa3eX0Jb | `poly-pizza:df6131e2-b851-4482-8c78-9f5f35fbd3aa` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1844 | 1844 | Source GLB SHA-256 `933973478E0F0553E799BF751C751D14BB827A5DD942CE5749B65032BD929415`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| flareGun | `flareGun.glb` | Flare Gun / Quaternius | https://poly.pizza/m/44H9OBUqTC | `poly-pizza:9ec52cda-c918-43f0-b7af-354e7fe96c37` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 540 | 540 | Source GLB SHA-256 `0CEB763BEF74624C710A278C3415F00469AF9CBFB954781787B42615138872EC`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| scubaSet | `scubaSet.glb` | Scuba tank / Steren Giannini<br>Ski Goggles / iPoly3D | https://poly.pizza/m/4GhtCNARi8c<br>https://poly.pizza/m/4YCjSY3U6H | `poly-pizza:432fff46-415f-417b-a8ce-92a52725b7c4`<br>`poly-pizza:d9c725b3-b39a-49c9-bc51-1159c1a747db` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/)<br>[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 928 | 928 | Source GLB SHA-256 `B2F25A9A79F7FA72BAA0D954AAD592DBBCFE975F6051B1E31E872D295FB8EC7D` and `B6B77A97AA72EF36815192BFD274FC0F79422F121BD7AE736EAFDDA349450CB9`; downloaded from the official Poly Pizza static GLB; scaled and positioned the goggles against the tank, merged both sources, pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| anchor | `anchor.glb` | Anchor / Poly by Google | https://poly.pizza/m/fjAwIosTQHy | `poly-pizza:f1d42e89-af89-4276-9160-2a52c7f5368e` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 520 | 520 | Source GLB SHA-256 `C0DB06912345342FFFE764B87A7C8532644691957A885E00B268CF84BE669EE4`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| bottledPaper | `bottledPaper.glb` | Scroll / Poly by Google | https://poly.pizza/m/arIYNl9gMyr | `poly-pizza:ec54b417-3509-498c-9b09-75eef6db1363` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 796 | 796 | Source GLB SHA-256 `9F9BC296790FD8B1E95E1B02BF3B92C73E488CF837F5C39E4A3CCFDC2A4A17C7`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| umbrella | `umbrella.glb` | Umbrella / Poly by Google | https://poly.pizza/m/ez4MoDQFgXz | `poly-pizza:f5b5e5cb-5438-4f9b-bc62-ea23e1dd89e0` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 664 | 664 | Source GLB SHA-256 `6A67B136D4BEBCF982599085B8BA7ACE6DFF6BD43A1FDAB2FE6E184C7848A672`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| swimRing | `swimRing.glb` | Life preserver / Poly by Google | https://poly.pizza/m/7n1vrlFN0GH | `poly-pizza:6b9eb5e5-a2d9-41b8-b6b1-4db908eadd46` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 3744 | 2086 | Source GLB SHA-256 `C0BB0D093A4964064330193E8F5A75B0366A31ADD63AF16FD9B6B3D99E614791`; downloaded from the official Poly Pizza static GLB; removed the separate `Rectangle_sweep` rope mesh while retaining the ring and its white bands; welded and simplified with meshoptimizer ratio 0.75 and error 0.01, regenerated normals; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| flashlight | `flashlight.glb` | Flashlight / Bruno Oliveira | https://poly.pizza/m/8t1DZLLvofk | `poly-pizza:82e1bb6b-c322-4663-ba6e-a44f146bcd41` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 508 | 508 | Source GLB SHA-256 `4DFF38A60AA716D8E7EDD7828C5B3C4E4685DBC983B40E0D400399FBFEFB6C6E`; downloaded from the official Poly Pizza static GLB; retained the original orange, black, silver, and lens materials; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| shotgun | `shotgun.glb` | Rifle / Quaternius | https://poly.pizza/m/neEjwx9bBJ | `poly-pizza:da83f4f9-7a4e-4739-9033-79d688aa3b5e` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1534 | 1534 | Source GLB SHA-256 `44A923B9358CA07247F125521A85BCE03654AE802984F6333B876C75AE2D0507`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| energyBar | `energyBar.glb` | Chocolate Bar / Quaternius | https://poly.pizza/m/vJsJ1EIiOO | `poly-pizza:c2fe4825-1aed-430d-8925-4541a98d70f8` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 436 | 436 | Source GLB SHA-256 `D34C9AC94FDCE13CA2CB99110EB4A47451DB8F1B9D12B32EA89D12F6C0686FF2`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| carlitos | `carlitos.glb` | Somali Cat Animated ver 1.2 / DreamNoms | https://sketchfab.com/3d-models/somali-cat-animated-ver-12-e185c3fd92b64c32b4515a32b29252fc | `sketchfab:e185c3fd92b64c32b4515a32b29252fc` | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 7632 | 7620 | Source GLB SHA-256 `52F3B3260D2610BA82E2B7FE0FD4A9E610A5A387F1B2D4C7C2419719AD3BD408`; retained only the source `SittingIdle` skin animation; removed the display floor; pruned unused clips and data, deduplicated, unpartitioned, and kept embedded textures. Regenerate with `node scripts/carlitos-model.mjs <source.glb>`. | 2026-08-04 |
| fishingRod | `fishingRod.glb` | Fishing Rod / Quaternius | https://poly.pizza/m/0YAR0Lg58p | `poly-pizza:54eb8952-a61d-45c1-9e64-761376721e14` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 522 | 522 | Source GLB SHA-256 `6D5BD9D93D74B61C68BD053F8B94F5D594DF998938D1A71D38119E2832F8FDB5`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| hammer | `hammer.glb` | Hammer / jeremy | https://poly.pizza/m/cOizz1RJnb3 | `poly-pizza:c4e48baf-d6de-4d27-9edb-7364bc6994b6` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 246 | 246 | Source GLB SHA-256 `1D0B075FE64074255AB33F4BE232AE60CFF9B20DBD2592541831AFA238CE84C7`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-08-18 |
| lantern | `lantern.glb` | Lantern / Kay Lousberg | https://poly.pizza/m/CtHBJ1ufeW | `poly-pizza:ecbc7b04-09ca-4068-bb3c-4e5ce1163c9a` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 264 | 264 | Source GLB SHA-256 `24EE9E4B9E280023CBBAF9FF6284E7BA51A07753F8D5EC8690ECC61DD156981D`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| ceilingLight | `ceilingLight.glb` | Light Ceiling Single / Quaternius | https://poly.pizza/m/JT44JUXU2d | `poly-pizza:2cc064fb-2b1b-4269-9007-473dfe78bffc` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 232 | 232 | Source GLB SHA-256 `4E307B591D68D8AFF049F07B59E5AA75B81E8DA211FD48B752BF847918EDED1B`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |

## Optional five-night event model ledger

These six individual Poly Pizza models support five-night event tableaus.
No model pack or kit is used. Event load failures keep the game playable.
The existing Lantern model remains the event lantern source.

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| chestClosed | `mysteryChest.glb` | Chest / Quaternius | https://poly.pizza/m/O72u4Drp8k | `poly-pizza:803af4ae-433f-4b05-b1f1-c6a2da02d768` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1676 | 1676 | Reuses the Drifting Chest model. Runtime setup uses `Chest_Top` as the animated lid. Source GLB SHA-256 `07193221A749D5DCF2B0A3D82D4EE9831DA2E2C4CA71B395050A88BB2BABE75B`. | 2026-08-19 |
| midnightIsland | `midnightIsland.glb` | Island / J-Toastie | https://poly.pizza/m/C03O8OQq6O | `poly-pizza:1fda6a0b-6228-4c16-9a3f-8ca36d9af6b6` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 84 | 84 | Source GLB SHA-256 `F2CA3A8EE6856FD312C8B6E5B1F2AA1D5234CB220FB441F836942CF4125274E6`; output GLB SHA-256 `DD2CF11A77DCFFEB7F259D0D2302AEEDB595DD564FB9383F6A9A1391218A76CB`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| deadTree | `deadTree.glb` | Dead Tree / Quaternius | https://poly.pizza/m/CD4edbPSGm | `poly-pizza:4db29f97-8e10-413d-be54-39ecda1a7c8d` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 5648 | 5648 | Source GLB SHA-256 `C6A2B34DE53EA610D4DCF20785340B12B023BD3B648A8F3DB3DCDB962008B9D3`; output GLB SHA-256 `20BB0B01D7BC968AA966452B9B290B4AA5793E60AC6D77A86CA43B2DA304B628`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| traderRowboat | `traderRowboat.glb` | Boat / Quaternius | https://poly.pizza/m/5UEl54KsuC | `poly-pizza:c5fe6584-9f6e-46cf-bcf6-95979c7494e4` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 224 | 224 | Source GLB SHA-256 `263E5D46F79E8B37AFECD0DB9056B22DC33C6456074D260589285D1891192335`; output GLB SHA-256 `6DCE2E97F0C18F6CCC7551B2C6F84D392FA070B5409F47DE97DF649156953360`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-08-01 |
| traderOctopus | `traderOctopus.glb` | Octopus / Poly by Google | https://poly.pizza/m/9F8QJKUT77V | `poly-pizza:81286501-750b-4d4b-9c41-2e3bbadcc9ae` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 3150 | 3150 | Source GLB SHA-256 `1FCDB4451FB1FD2B9F9EE6B75D929322BA0084DBE104683EF4D43593F434491F`; output GLB SHA-256 `2D241056973BF43445A2991F7A5C59CE1AC46531BA170EBF10E9E885F8070600`; removed unused accessors and deduplicated the static model. | 2026-08-03 |
| riggedHand | `riggedHand.glb` | Rigged Hand / J-Toastie | https://poly.pizza/m/BEy8jbxm6A | `poly-pizza:a36ea2d8-8437-4215-98d3-2fa53be67d85` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1518 | 1518 | Source GLB SHA-256 `32705E2EE2BADC9DF04886CC0705545D6640C34E927D4DB67AFFF2802AEC945E`; output GLB SHA-256 `C63A08C01D86DD26C5260BD17BCC026BB60C0843A04D94DC52CD199DFCFD13B1`; retained the skin, 20 named joints, and 19-channel source animation; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| containerShip | `containerShip.glb` | Container Ship / Alex Safayan | https://poly.pizza/m/3AmDGcCu6Ll | `poly-pizza:df197d9f-5d8c-4744-bc03-75ee514e8df3` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1620 | 1620 | Source GLB SHA-256 `A6F5E74082C8DFE8D251B7D70AF5C2BD8570D108B3CA2A97C3D55F38871FCB4B`; output GLB SHA-256 `B969EF01204841B4E09965740BEE30E7B5227576E4921253F3AFA0D306E2404D`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| midnightPalmTrees | `midnightPalmTrees.glb` | Palm Trees / Quaternius | https://poly.pizza/m/VYslw9DEi6 | `poly-pizza:88fb0209-5e1e-4cb0-9d11-112e6140ab13` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1920 | 1920 | Source GLB SHA-256 `70275B7159F1790E2997113CE1373A6ABC93DD609A2FA778E6EDD5C0D4BA2904`; output GLB SHA-256 `7D66BAC6B02803C6ECA2E0C3B37CCAB7BE8593ECD10B5C211A6270CACD91F9BC`; verified zero skins and zero animations; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-08-19 |

## Runtime ship-furniture and deck-detail model ledger

Five models come from [Kenney Furniture Kit 1.0](https://kenney.nl/assets/furniture-kit),
licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The verified archive SHA-256 is
`E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0`;
models are pruned, deduplicated, unpartitioned, and embedded without geometry scaling.

The remaining room and cargo models come from Poly Pizza under
[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) or
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), as identified
by their source credits. Their pinned source GLBs are pruned, deduplicated,
unpartitioned, renamed, and embedded.
The shelf is instanced once per open storage unit. The crate is fitted to the
existing cargo colliders, while three differently rotated and scaled boxes
provide secondary deck clutter.

| Runtime ID | File | Model / creator | Source asset ID | Source triangles | Committed triangles | Downloaded |
|---|---|---|---|---:|---:|---|
| barrel | `barrel.glb` | [Barrel / Poly by Google](https://poly.pizza/m/22QmtJi62zQ) | `poly-pizza:25991bc2-a56c-446d-86c4-03e406cc4a40` | 700 | 700 | 2026-07-26 |
| bedBunk | `bedBunk.glb` | Bed bunk / Kenney | `furniture-kit@1.0:Models/GLTF format/bedBunk.glb` | 580 | 580 | 2026-07-15 |
| desk | `desk.glb` | Desk / Kenney | `furniture-kit@1.0:Models/GLTF format/desk.glb` | 198 | 198 | 2026-07-15 |
| chairDesk | `chairDesk.glb` | Desk chair / Kenney | `furniture-kit@1.0:Models/GLTF format/chairDesk.glb` | 588 | 588 | 2026-07-15 |
| bookcaseOpen | `bookcaseOpen.glb` | [Shelf / Poly by Google](https://poly.pizza/m/fAfJzZmQpgY) | `poly-pizza:e9ed133e-cf29-4c63-b8dd-9e3e0503fa95` | 84 | 84 | 2026-07-26 |
| bookcaseClosedDoors | `bookcaseClosedDoors.glb` | Closed-door bookcase / Kenney | `furniture-kit@1.0:Models/GLTF format/bookcaseClosedDoors.glb` | 296 | 296 | 2026-07-15 |
| cargoCrate | `cargoCrate.glb` | [Crate / Quaternius](https://poly.pizza/m/NlXe0ZJGUd) | `poly-pizza:56f2385f-285a-4df8-a00f-6837a711f5cc` | 264 | 264 | 2026-07-26 |
| cargoBox | `cargoBox.glb` | [Box / Kay Lousberg](https://poly.pizza/m/ykZ23x9d6p) | `poly-pizza:f54e45d1-81ed-4323-9e35-8acd46533702` | 32 | 32 | 2026-07-26 |
| table | `table.glb` | Table / Kenney | `furniture-kit@1.0:Models/GLTF format/table.glb` | 120 | 120 | 2026-07-15 |
| crewNightStand | `crewNightStand.glb` | [Night Stand / Quaternius](https://poly.pizza/m/9LI73c5uFA) | `poly-pizza:deb08e3b-cd54-4252-b5b2-53f86f1c1d04` | 184 | 184 | 2026-07-28 |
| crewDesk | `crewDesk.glb` | [Desk / CreativeTrio](https://poly.pizza/m/YJyJam67hJ) | `poly-pizza:b8d0347a-c711-4eb4-8b8b-cda390d3840f` | 166 | 166 | 2026-07-28 |
| crewCabinet | `crewCabinet.glb` | [Cabinet / CreativeTrio](https://poly.pizza/m/wOiMrnUuhe) | `poly-pizza:57d9a5e8-3130-42eb-b436-28e1586facc0` | 324 | 324 | 2026-07-28 |
| crewCeilingLight | `crewCeilingLight.glb` | [Ceiling Light / Quaternius](https://poly.pizza/m/sRNcgQFbLB) | `poly-pizza:7f5240a6-e02a-4084-b899-8b84784cd76d` | 196 | 196 | 2026-07-28 |
| crewWallPainting | `crewWallPainting.glb` | [Wall painting / Poly by Google](https://poly.pizza/m/3dycV-ViQH-) | `poly-pizza:4ef69f1e-f03d-4e04-904c-0037b875306b` | 100 | 100 | 2026-07-28 |
| crewWallArt | `crewWallArt.glb` | [Wall Art 06 / Jarlan Perez](https://poly.pizza/m/1U5roiXQZAM) | `poly-pizza:bcefd659-a484-47b4-a385-d35cefd55804` | 70 | 70 | 2026-07-28 |
| crewTable | `crewTable.glb` | [Table / Zsky](https://poly.pizza/m/dwmBkQTulc) | `poly-pizza:7a32e3e5-316e-479a-a6cc-d6aab490be50` | 220 | 220 | 2026-07-28 |
| wheelhouseCorkboard | `wheelhouseCorkboard.glb` | [Wall Corkboard / CreativeTrio](https://poly.pizza/m/U8yQZ9l0HZ) | `poly-pizza:09cf2ec1-8b2c-4543-b773-962fba13aac5` | 218 | 218 | 2026-07-28 |
| workroomCardboardBox | `workroomCardboardBox.glb` | [Cardboard Box / Nick Slough](https://poly.pizza/m/j2u0dWIebu) | `poly-pizza:12b9bc45-0581-474d-87ad-0869c28e69ac` | 144 | 144 | 2026-07-28 |
| workroomStorageShelf | `workroomStorageShelf.glb` | [Storage Shelf / Jarlan Perez](https://poly.pizza/m/6gKdASmfB9U) | `poly-pizza:9badb54d-f687-45cb-a5cd-0dde270d76ab` | 96 | 96 | 2026-07-28 |
| workroomPallet | `workroomPallet.glb` | [Pallet / Kenney](https://poly.pizza/m/J6bhnc2wFP) | `poly-pizza:40dc910f-3ee1-4dde-a692-41ec82a9ae1f` | 108 | 108 | 2026-07-28 |
| pumpkin | `pumpkin.glb` | [Pumpkin / Quaternius](https://poly.pizza/m/bvLvqnU1jX), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `poly-pizza:49202ae4-62ac-4035-9726-1834228e7d08` | 644 | 644 | 2026-08-05 |
| propaneTank | `propaneTank.glb` | [Propane Tank / Quaternius](https://poly.pizza/m/3revwBHxDC), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `poly-pizza:d694382c-fd11-4ed0-a300-e5e7891a842b` | 516 | 516 | 2026-08-05 |
| redCan | `redCan.glb` | [Can Red / Quaternius](https://poly.pizza/m/IuoYedcdXQ), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `poly-pizza:f6b52ca9-61b1-42d5-a42f-d8748a41eb45` | 332 | 332 | 2026-08-05 |
| shippingBox | `shippingBox.glb` | [Box / Kenney](https://poly.pizza/m/HvjissDrdr), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `poly-pizza:abf06b96-4a0c-466b-b091-919cfad7a478` | 124 | 124 | 2026-08-05 |
| package | `package.glb` | [Package / Quaternius](https://poly.pizza/m/mWkgWyrCfM), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `poly-pizza:8ee025af-e6cf-46d8-879b-62befe03ae9d` | 464 | 464 | 2026-08-05 |

Pinned Poly Pizza source SHA-256 values: barrel
`452B5BDC6C7A07B37B95D38D942ADB7CEB2B07B240AAFF93646A6AE3E4B535C7`;
shelf `FDA303ACFD2B118ED163735E10D04E2DF7A6745552CA4A2BC57183D76D576B39`;
crate `30604302C679A2A9A2C83A28CD54EC8A5664989EC32A75C1F78299B3ABFAD669`;
box `4B6F7B2D17997F75192C706B28E2F894B6DFF691BCED17963470D2B2CEDDBFF9`;
pumpkin `AF4AE31BA704F8B05B69BEC18726468FEAF527A221E929BBFDF11D6B4C26BD0B`;
propane tank `D38FA01373FFB00C255A877BC59686BBF7AB89BA63752A556C6E440483381BEA`;
red can `233A200BEB5FF9E36B0E6AC52415D64DB506A2600CC7F8B0B0C83376A9F7B642`;
shipping box `83D88C4C255F868B8FD77C6DC80B666AEFD17B07223B12644AC046EBE32727A8`;
package `B8DE8103D8CA412129F4E55CA6942B7496DCFE271F832C600B4A3F62CEADE3BC`.

Room source SHA-256 values: night stand
`1C08A98905EA18850FC91932FAE9976A556AA30A564F7C45845C2F4F1BC5289A`;
desk `C3C85D0A0848030DF3E6A5AA810066FCD8329E719726D1DBEF14C9A33CEF9717`;
cabinet `E5226312183A51C5027F6E6C2E46873C0B0A7B3C9B4FF334C02CB03954B1B944`;
ceiling light `5A429947D77AB820605844864C4E4C3177407CAACB373BC47359CAFD45812DD4`;
painting `A5657C57B3406EB340E002B0E25419E46EAC0EAA703F42D6819E61311747B19D`;
wall art `7D1D99021EC630FA1E6174DF92F7CEA59887702D89CED823F7BDAF14A17082B2`;
table `33B58D3359CDC343AEB663534CBACE19EEB5BFB21D7CF93E33D13F9C2E57236E`;
corkboard `251EF29E18DFAFF8D5ACA202AE21BB8DDD6D4D6CD601CC2AA09D394CF41ACA05`;
cardboard box `81982A2F0CF2D04CB60B5194897D9CB76E688E01DB5A7F8FA757E5B55679D7C2`;
storage shelf `5AB0C13CC921F63C16F07C63AD4D29B5FDE0E8E7F150114D406728B12DA9C667`;
pallet `6EF862AC5F278117164D6CDDD3EA98CE3495C27FF06A6D6CF377A06B1E710952`.

## Runtime survival-event model ledger

- "Ghoooooost" by Nikki Morin.
  Source: https://poly.pizza/m/112vpcommxv
  License: CC BY 3.0.
  Source asset ID: `poly-pizza:02d70fdb-284b-4799-a9ee-18c7277f158c`.
  Source GLB SHA-256: `3AFB58D595ECA2D5F7953847CF51230270BB9EEE40B59F56FE04CDF4A28CD1C3`.
- "Man in Suit" by Quaternius.
  Source: https://poly.pizza/m/mQnGoME1ez
  License: CC0 1.0.
  Source asset ID: `poly-pizza:66b57880-bcb0-479a-8d72-5c3e88afaa39`.
  Source GLB SHA-256: `31FF1539E7A9A209D4EB1107E696D798FEDC7E35D84A58BBABFDC0F1B8B73763`.
- "Mermaid" by Kamylle B. Grenier.
  Source: https://poly.pizza/m/7X8_6iciXvk
  License: CC-BY 3.0.
  Source asset ID: `poly-pizza:3d0f814b-505e-45b1-b82b-b2148653ea28`.
  Source GLB SHA-256: `C6752A93684A1A1DAE07CBA84B7F059645A4FEF9F4963060F6E7AE41AFDC2757`.
- "Rock Flat" by Kenney.
  Source: https://poly.pizza/m/CrSoV13mCU
  License: CC0 1.0.
  Source asset ID: `poly-pizza:3e9d82ac-0749-42b6-8dfd-082393547ed5`.
  Source GLB SHA-256: `8A0595C2F0C6914CC1794CE8CB35517F4451EB4CFB6703D3A58CA654D5900BAB`.

These files keep their source geometry. Runtime code normalizes scale, rotation, and offset.

## Runtime underwater-menu model ledger

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| boat | `boat.glb` | Boat / Pixel | https://poly.pizza/m/YwdXrwbN3o | `poly-pizza:66ae3fa9-d6de-45dc-86c0-659786b865e1` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 412 | 412 | Source GLB SHA-256 `FEE1EE45E5457D146857D064982922A378D909794E34A2FC89572BB946BA8464`; output GLB SHA-256 `D1B71C2F9222B93C32AA4C5764B543F7471A046D047997473CAB82364F97942A`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| rockA | `rockA.glb` | Rock Large / Quaternius | https://poly.pizza/m/d2VWOdthtR | `poly-pizza:d7bc2b98-2c73-4e78-b0bd-e5e24d65734a` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 448 | 448 | Source GLB SHA-256 `76F1F4BABFEFED5FF852C97978065AC6FF1EEC5B6930BAE9E62EA095BFAE0FB5`; output GLB SHA-256 `DFE74B88D1E8C31C3242E151C620463858154BB32F36D3A7042BFB4A75AC78BE`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| rockB | `rockB.glb` | Rock Large / Quaternius | https://poly.pizza/m/54jZKTAt5p | `poly-pizza:c14651f6-9ef8-41e8-8aca-cafed61d9ca2` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 222 | 222 | Source GLB SHA-256 `C4E9F04C04419E67E919C4533DFD6044ABC5F0640AFA9D0E174CF474285D380C`; output GLB SHA-256 `223C02346797221792B6FFFFAC3B0AEA4C8094BB854055D0D13B0F3C092F0E5F`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| rockC | `rockC.glb` | Rock Large / Quaternius | https://poly.pizza/m/li0YBlBEMz | `poly-pizza:a50f220b-3c4c-4226-ae97-0458ed615cd2` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 432 | 432 | Source GLB SHA-256 `AFF6F5DF4CB5309400C9E85790D8FBAAB5EBE281402A54E7BA4308038DEFC9F3`; output GLB SHA-256 `B9EB2A8A48D1E99474DDAD1B7EFE438085EEB783F816E43B1608978C508D97CB`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| coral | `coral.glb` | Coral / Poly by Google | https://poly.pizza/m/4KUXdtDdgHR | `poly-pizza:7fc1ccd0-aa82-4eff-8881-dd7a83ebf6ea` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 817 | 817 | Source GLB SHA-256 `63219C5123CE4A69B2283DE514DCA9AE08E9EC2C1BCAD3094AFD2EC5043B12B7`; output GLB SHA-256 `2ACA833051D14C22B107D14B2AE84E533B69A1EFBEC2B7F0A087416B9079D0AD`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-06 |
| starfish | `starfish.glb` | Starfish / Poly by Google | https://poly.pizza/m/6H-0K9IEr56 | `poly-pizza:c9c1bc97-d76e-4e87-bd3a-87ab44b78aac` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 780 | 780 | Source GLB SHA-256 `71F088AB919DBB4961532D325A04E03504910F5C4ED72FCB67A5876ADC390A4A`; output GLB SHA-256 `7B79DB36F41814317A5888D10E5A7EA9EDEA7998DAE7F982F19608BC7F2D98A1`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-06 |
| fishBone | `fishBone.glb` | Fish Bone / Quaternius | https://poly.pizza/m/bU5RLZnq6v | `poly-pizza:ed285a5f-7c35-47b0-a12d-60006f5eb74c` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 588 | 588 | Source GLB SHA-256 `D15FC15F86F84BA38B3A0CF18E5B23651F7541433B59D045233793B2A54FB51E`; output GLB SHA-256 `6FCD27536B4691BD0D639055BAC1C3D84AD3978654F310A3DF0C3F157EED371E`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| skull | `skull.glb` | Skull / Quaternius | https://poly.pizza/m/VGtSTNRf2O | `poly-pizza:2a686e08-5456-405f-a6ef-03274e080b2f` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 3132 | 3132 | Source GLB SHA-256 `3A05AC7A8FE56832E988285D24F755F2D22DB51CC0E70F2BD559077F6324349B`; output GLB SHA-256 `8E0BAC5BA9A119D70798163D744D4925487C6F8CB6155EB92585B8EEA59E9823`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| largeBone | `largeBone.glb` | Large Bone / Quaternius | https://poly.pizza/m/A67un3x9nV | `poly-pizza:dc066333-7257-425b-bbc0-7d93403d019d` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1680 | 1680 | Source GLB SHA-256 `AD3442D1998FE6AAA27EFC585EBA2C651C80ED2BB9467A6082DC6507509F3AF9`; output GLB SHA-256 `48DE96535E005B857ABC76BB5817062A06410B4F06DB8D32981D5999B2F3415C`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |
| shark | `shark.glb` | Shark / Quaternius | https://poly.pizza/m/AyHTK3zUSG | `poly-pizza:d2d374ea-eb1d-4659-8cc7-816a83b82470` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 644 | 644 | Source GLB SHA-256 `6D5CF3CD7EA749583B622A306CFCAE4DE85432EFCC74A1EC6F52E5430CF13AFF`; output GLB SHA-256 `1311D6750FB737669557C45855568E8DD2D8C8D8B5C374704028C656712A4648`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-05 |

## Runtime fishing-catch model ledger

These models are loaded only for a successful catch reveal and disposed when
that presentation ends. Runtime length follows the existing catch catalog:
tuna and squid remain large two-food catches; the other fish remain small
one-food catches. All current fishing outcomes have mapped Poly Pizza models.

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| cod | `cod.glb` | Fish / Poly by Google | https://poly.pizza/m/etCg5GTESNY | `poly-pizza:e1f17180-0416-4297-8471-b8f2fbe71b99` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 162 | 162 | Source GLB SHA-256 `BC9026922C020B7CEC66C72EFFB0E7F43B30E0A592091826F93EFF0891BF4408`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| salmon | `salmon.glb` | Trout / Poly by Google | https://poly.pizza/m/0HCLwTdxvz5 | `poly-pizza:6eac34d9-f6f3-4d08-bbf8-162709a89797` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 876 | 876 | Source GLB SHA-256 `1D770869650A3B6F5135CBD0E71B7B8E1B7EA6D854367EB64266318C2DA69B0F`; used for the same salmonid body type; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| tuna | `tuna.glb` | Fish / Quaternius | https://poly.pizza/m/Ymu8ftrmuT | `poly-pizza:8410757e-6594-4011-817a-633730fbcaf8` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 502 | 502 | Source GLB SHA-256 `6E04C645836F1AD6CABF1B999976FA74D50FD7DD23F504154EE03427EB194D51`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| crab | `crab.glb` | Crab / Poly by Google | https://poly.pizza/m/1O5Q4pE8X6e | `poly-pizza:15379421-a6c9-4266-913b-7d6a46c4a2f0` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1340 | 1340 | Source GLB SHA-256 `436B13AFA9C2FC4A99402C4F23D5813CAF9936702FB99EB0727792013000C569`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| squid | `squid.glb` | Squid / Poly by Google | https://poly.pizza/m/6ar_2XbrzCp | `poly-pizza:3bc4b003-d0b1-455b-aa66-c2c4c79bbd9f` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 616 | 616 | Source GLB SHA-256 `C940CA6AFAF19988237A2577D67AD868E3311DE08D1F9DAE3F206E638FEA2FD8`; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| sardine | `sardine.glb` | Fish / Kenney | https://poly.pizza/m/HkUAXudvBt | `poly-pizza:401cad25-1cb8-4842-8f3a-ad4c3440ed2a` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 233 | 233 | Source GLB SHA-256 `26893FFED61079A4A045D050631C2B59EFDAF7119BBFBA8BD134FB2A8754E1F3`; normalized to the catalog's small sardine length; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| bass | `bass.glb` | Fish / Poly by Google | https://poly.pizza/m/aEyLrUMMoUK | `poly-pizza:55537d5f-d9f2-45f0-8740-6357ca7784df` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 506 | 506 | Source GLB SHA-256 `1F91914D26C1680EBB73A9BE87B7936528ADB5F2DDB32CC787EF4E73C32F8BDF`; selected from its bass/seabass tags; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| redSnapper | `redSnapper.glb` | Fish / Quaternius | https://poly.pizza/m/XWl86YFtpF | `poly-pizza:311a79f6-ba3e-47aa-80ce-04185fc76b2a` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 544 | 544 | Source GLB SHA-256 `BFEA34878B92EB05D9B2C584C3A9E97ABE2B402141B9C7B4B3F1ECB55A29DF02`; selected for its reddish body; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| clownfish | `clownfish.glb` | Fish / Kenney | https://poly.pizza/m/bJs4f0SFlO | `poly-pizza:72d5414c-2748-4862-b7ae-d4192be9e806` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 233 | 233 | Source GLB SHA-256 `78A8C5ABCF26C698E2C51AF21312455928AA7B9D9A531FAD508327DBE1567143`; selected for its orange palette and normalized to the smallest catalog length; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-26 |
| seaweed | `seaweed.glb` | Kelp / Poly by Google | https://poly.pizza/m/4cFllH6Iazk | `poly-pizza:8c51572a-1938-4c61-b971-63c3b69f3ea7` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 784 | 784 | Source GLB SHA-256 `3D8E3071C69E6F701A7061AB820293F63E96023CED132C559CC0CDB12542C7C6`; used for the seaweed junk catch; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-27 |
| boot | `boot.glb` | Boots / Poly by Google | https://poly.pizza/m/7HbqG8RwRcA | `poly-pizza:888317ad-20f0-4b0d-ba01-0bdd017adfd8` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 154 | 154 | Source GLB SHA-256 `4FA4372D9AF01C2CD0E67462C9AFDD3EBA86FECCDB8FE3FEF3F71FB51B7CCA94`; used for the boot junk catch; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-27 |
| plasticBottle | `plasticBottle.glb` | Water bottle / Poly by Google | https://poly.pizza/m/dha06wFxUwA | `poly-pizza:31674c92-502a-453a-a484-6da95ae4f13c` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 480 | 480 | Source GLB SHA-256 `926B58E4B9E5EFFBCB330DD708D7BA0BBF05D61DCC3294C1FA546E4567AA8211`; used for the plastic-bottle junk catch; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-07-27 |
| fishBones | `fishBones.glb` | Fish Bones / Kenney | https://poly.pizza/m/NZg3APPfF8 | `poly-pizza:79359761-c093-48ca-a32e-e1703aadb582` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 384 | 384 | Source GLB SHA-256 `CA78E2970A6E8FEFA5498F71B664B90A4C2DD8F87B31861BFCAAA2EC037E1FC9`; used for the Fish Bones junk catch; pruned, deduplicated, unpartitioned, renamed, and embedded. | 2026-08-01 |

## Runtime featured-event model ledger

These individual low-poly models show the five featured survival events.
Runtime setup normalizes their scale and applies the game palette.

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| driftingBarrel | `driftingBarrel.glb` | Barrel / Don Carson | https://poly.pizza/m/cu9GJ0j13fj | `poly-pizza:2244f3ae-5583-4ea0-b980-6fdd0084cee7` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 282 | 282 | Source GLB SHA-256 `89031BAAA180FD8040C8C2A27F56AC479BD6FE8A7C4EC5495D1433D185840EF5`; committed without geometry changes. | 2026-07-30 |
| driftingBottle | `driftingBottle.glb` | Bottle of Wine / Jeremy | https://poly.pizza/m/13g9ucgxbHV | `poly-pizza:b1a8f402-de55-4e49-b63e-1439e5851c13` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 304 | 304 | Source GLB SHA-256 `5C1169A709CF2B897E9037771BC8B33EDE3C546A2CA872F33BF8A9348F112D54`; committed without geometry changes. | 2026-07-30 |
| mysteryChest | `mysteryChest.glb` | Chest / Quaternius | https://poly.pizza/m/O72u4Drp8k | `poly-pizza:803af4ae-433f-4b05-b1f1-c6a2da02d768` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1676 | 1676 | Source GLB SHA-256 `07193221A749D5DCF2B0A3D82D4EE9831DA2E2C4CA71B395050A88BB2BABE75B`; committed without geometry changes. | 2026-07-30 |
| flowers | `flowers.glb` | Anemone / Poly by Google | https://poly.pizza/m/1FMGb52XdD- | `poly-pizza:e038aa13-5138-4504-9737-a9e90539275f` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1024 | 1024 | Source GLB SHA-256 `7CB57FE979D7D6FD71DED0787C91C1EC61B75B9EF2C28F32F9C5034E18E292E0`; committed without geometry changes. | 2026-08-01 |

## Runtime night-event model ledger

These five models support authored night-event presentations.
Static models use safe vertex welding.
The Tentacle Attack model keeps its source rig and four animation clips.

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source SHA-256 | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---|---:|---:|---|---|
| leakPlanks | `leakPlanks.glb` | Wood Planks / Quaternius | https://poly.pizza/m/hwQ1Fx5P8U | `poly-pizza:27afd21d-e642-4ec8-8688-d99f693388d1` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `6E3DAA7AEDFBD2FD0B999555B165895552D80D0A6B413C181FFFE4CF4A8E9987` | 150 | 150 | pruned, deduplicated, welded, unpartitioned, renamed, and embedded | 2026-07-31 |
| schoolFish | `schoolFish.glb` | Fish / Kenney | https://poly.pizza/m/HkUAXudvBt | `poly-pizza:401cad25-1cb8-4842-8f3a-ad4c3440ed2a` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `26893FFED61079A4A045D050631C2B59EFDAF7119BBFBA8BD134FB2A8754E1F3` | 233 | 233 | pruned, deduplicated, welded, unpartitioned, renamed, and embedded | 2026-07-31 |
| snatcher | `snatcher.glb` | Tentacle / Quaternius | https://poly.pizza/m/BR1vpIvvvv | `poly-pizza:b39d86e5-e51f-4bd8-bc63-c7fc0cdea864` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `B53DB44D80B3CE066849009DD39CFCADBAC82EFAA5A0C5D52BACBC0656ADE931` | 3874 | 3874 | pruned, deduplicated, unpartitioned, renamed, and embedded; retained source skin and animation data | 2026-07-31 |
| anglerFish | `anglerFish.glb` | Angler Fish / Anonymous | https://poly.pizza/m/85n5_RiSeSf | `poly-pizza:b682255b-2f96-44fe-9221-9e3f126b4ddd` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `E0A9D0AF0A00FE6254831A6CC2C8980E292AD8B9BCEE37570163BC195DF0F1E8` | 2150 | 2150 | pruned, deduplicated, welded, unpartitioned, renamed, and embedded | 2026-07-31 |
| deathStareBlob | `deathStareBlob.glb` | Green Spiky Blob / Quaternius | https://poly.pizza/m/IoWG5F9WUc | `poly-pizza:cd25a048-719e-4ec4-bbf5-a266776fe129` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `AD5E8B1CDF8C0D328B4B44537D3DA8FA98119A9A99FB6163E2F325DBB8BBECC1` | 4888 | 4888 | pruned, deduplicated, unpartitioned, renamed, and embedded; retained source skin and animation data | 2026-08-01 |
| tornadoCore | `tornadoCore.glb` | Tornado / Poly by Google | https://poly.pizza/m/2TBzV_5N0ci | `poly-pizza:b48384ed-dc47-4bce-8c0b-c60bb3369ee2` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `A3199265639E07658F4D30AB1384CF9CE33832D0CDAFBCAB6CD268357A91AF4F` | 324 | 324 | pruned, deduplicated, welded, unpartitioned, renamed, and embedded | 2026-07-31 |

## Runtime audio ledger

Audio in this ledger uses
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/),
unless its entry states a different license.

Freesound files use the public high-quality MP3 preview of the approved recording.

The dawn file contains the first eight seconds of its source WAVE file.

- "woman humming cathedral" by Pennywind.
  Source: https://freesound.org/people/Pennywind/sounds/816687/
  License: CC0 1.0.

| Runtime ID | File | Source / creator |
|---|---|---|
| menuAmbient | `menuAmbient.mp3` | [Underwater Ambience / Tim_Verberne](https://freesound.org/people/Tim_Verberne/sounds/482167/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| calmOcean | `calmOcean.mp3` | [Calm Ocean Waves / SamsterBirdies](https://freesound.org/people/SamsterBirdies/sounds/578524/) |
| roughOcean | `roughOcean.mp3` | [Storm Sea Close / frodeims](https://freesound.org/people/frodeims/sounds/616222/) |
| lightWind | `lightWind.mp3` | [Soft Breeze / Vrymaa](https://freesound.org/people/Vrymaa/sounds/734663/) |
| strongWind | `strongWind.mp3` | [Heavy Gusts / SamsterBirdies](https://freesound.org/people/SamsterBirdies/sounds/565140/) |
| rain | `rain.mp3` | [Rain Loop / Snoopy20111](https://freesound.org/people/Snoopy20111/sounds/399072/) |
| thunderLightning | `thunderLightning.mp3` | [Thunder2 / Yoyodaman234](https://freesound.org/people/Yoyodaman234/sounds/267551/) |
| thunderLightningCrack | `thunderLightningCrack.mp3` | [Thunderclap / Fission9](https://freesound.org/people/Fission9/sounds/534023/) |
| thunderLightningDry | `thunderLightningDry.mp3` | [big thunder clap / seth-m](https://freesound.org/people/seth-m/sounds/458015/) |
| roomTone | `roomTone.mp3` | [Ferry Room Tone / kyles](https://freesound.org/people/kyles/sounds/454012/) |
| shipAlarm | `shipAlarm.mp3` | [Klaxon / InfamousLazure](https://freesound.org/people/InfamousLazure/sounds/584001/) |
| scavengeChase | `scavengeChase.mp3` | [The Chase / Victor_Natas](https://freesound.org/people/Victor_Natas/sounds/634513/) |
| scavengeCountdown | `scavengeCountdown.mp3` | [Time Running Out / qubodup](https://freesound.org/people/qubodup/sounds/211102/) |
| woodStep | `woodStep.mp3` | [Wood Footstep / SoundsAreGr8](https://freesound.org/people/SoundsAreGr8/sounds/340983/) |
| jump | `jump.mp3` | [Quick Whoosh / florianreichelt](https://freesound.org/people/florianreichelt/sounds/683101/) |
| itemHandling | `itemHandling.mp3` | [Short Whoosh / petenice](https://freesound.org/people/petenice/sounds/9509/) |
| boatCreak | `boatCreak.mp3` | [Boat Creaking / craigsmith](https://freesound.org/people/craigsmith/sounds/675783/) |
| lightWaveImpact | `lightWaveImpact.mp3` | [Waves Against Fishing Boat / kyles](https://freesound.org/people/kyles/sounds/637645/) |
| hardWaveImpact | `hardWaveImpact.mp3` | [Strong Waves / Sheyvan](https://freesound.org/people/Sheyvan/sounds/520511/) |
| confirm | `confirm.mp3` | [Wooden Confirmation / qubodup](https://freesound.org/people/qubodup/sounds/822568/) |
| denied | `denied.mp3` | [UI Reject / Rob_Marion](https://freesound.org/people/Rob_Marion/sounds/542040/) |
| pause | `pause.mp3` | [Wooden Click / BenjaminNelan](https://freesound.org/people/BenjaminNelan/sounds/321083/) |
| resume | `resume.mp3` | [Menu Click / Leszek_Szary](https://freesound.org/people/Leszek_Szary/sounds/146720/) |
| journal | `journal.mp3` | [Opening a Book / mateusboga](https://freesound.org/people/mateusboga/sounds/614081/) |
| eating | `eating.mp3` | [Eating Sound / User391915396](https://freesound.org/people/User391915396/sounds/570336/) |
| medkit | `medkit.mp3` | [Tape Bandage Rip / SecureSubset](https://freesound.org/people/SecureSubset/sounds/800275/) |
| hullRepair | `hullRepair.mp3` | [hammer pounding on wood / Ryujin95](https://freesound.org/people/Ryujin95/sounds/394891/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| tapeRepair | `tapeRepair.mp3` | [Duct Tape Rip / baidonovan](https://freesound.org/people/baidonovan/sounds/187338/) |
| ductTapePickup | `ductTapePickup.mp3` | [Tape Handling 8 / Geoff-Bremner-Audio](https://freesound.org/people/Geoff-Bremner-Audio/sounds/795714/), [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| diveEntry | `diveEntry.mp3` | [Jump into Water / Urkki69](https://freesound.org/people/Urkki69/sounds/628350/) |
| underwaterMovement | `underwaterMovement.mp3` | [Underwater Movement / Tim_Verberne](https://freesound.org/people/Tim_Verberne/sounds/484187/) |
| diveSurface | `diveSurface.mp3` | [Water Splash / audiosmedia](https://freesound.org/people/audiosmedia/sounds/243519/) |
| fishingCast | `fishingCast.mp3` | [Fishing Reel Cast with Splash / mwchristian95](https://freesound.org/people/mwchristian95/sounds/725425/) |
| fishingBite | `fishingBite.mp3` | [Fish Splash Release 1 / paulprit](https://freesound.org/people/paulprit/sounds/507094/) |
| fishingReel | `fishingReel.mp3` | [Fishing Reel / mwchristian95](https://freesound.org/people/mwchristian95/sounds/725424/) |
| fishCatch | `fishCatch.mp3` | [Fish Flopping / RatBird](https://freesound.org/people/RatBird/sounds/570208/) |
| junkCatch | `junkCatch.mp3` | [Light Metal Trash / loganzsound](https://freesound.org/people/loganzsound/sounds/850720/) |
| fishingMiss | `fishingMiss.mp3` | [Rope Quick Snatch / Vrymaa](https://freesound.org/people/Vrymaa/sounds/802697/) |
| bucketRain | `bucketRain.mp3` | [Rain Drips in Bucket / TheGloomWorker](https://freesound.org/people/TheGloomWorker/sounds/683249/) |
| umbrella | `umbrella.mp3` | [Opening an Umbrella / randbsoundbites](https://freesound.org/people/randbsoundbites/sounds/792526/) |
| anchorChain | `anchorChain.mp3` | [Thick Chain on Metal / kyles](https://freesound.org/people/kyles/sounds/452577/) |
| anchorSplash | `anchorSplash.mp3` | [Water Splosh / benj500](https://freesound.org/people/benj500/sounds/545823/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| flashlight | `flashlight.mp3` | [Small Flashlight Click / Rudmer_Rotteveel](https://freesound.org/people/Rudmer_Rotteveel/sounds/457458/) |
| flareGunShot | `flareGunShot.mp3` | [Heathers Gunshot Effect2 / okieactor](https://freesound.org/people/okieactor/sounds/415912/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| flareGun | `flareGun.mp3` | [Firework Launch (1) / LukaCafuka](https://freesound.org/people/LukaCafuka/sounds/750684/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| shotgun | `shotgun.mp3` | [Shotgun Fire / hyperix6](https://freesound.org/people/hyperix6/sounds/660299/) |
| goingToSleep | `goingToSleep.mp3` | [Rustling Bed Sheets / Froey_](https://freesound.org/people/Froey_/sounds/644490/) |
| yawn | `yawn.mp3` | [Yawn.wav / spookymodem](https://freesound.org/people/spookymodem/sounds/202105/) |
| nightfall | `nightfall.mp3` | [Transition Sound Effect / DeVern](https://freesound.org/people/DeVern/sounds/427533/) |
| dawn | `dawn.wav` | [First Light Particles / Yoiyami](https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track) |
| eventReveal | `eventReveal.mp3` | [Dissonant Sting / nomiqbomi](https://freesound.org/people/nomiqbomi/sounds/578362/) |
| tornadoWind | `tornadoWind.mp3` | [JM_NATURAL ELEMENTS_Wind 01 - Tornado - Inside a metalic squeaking building.wav / Julien_Matthey](https://freesound.org/people/Julien_Matthey/sounds/557188/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| leak | `leak.mp3` | [Water - Leak, small / colinpoh](https://freesound.org/people/colinpoh/sounds/146346/) |
| tentacleMovement | `tentacleMovement.mp3` | [Slimy flesh / iampagan](https://freesound.org/people/iampagan/sounds/177017/) |
| eerieMelody | `eerieMelody.mp3` | [woman humming cathedral / Pennywind](https://freesound.org/people/Pennywind/sounds/816687/) |
| chest | `chest.mp3` | [Wooden Chest Open / The_Frisbee_of_Peace](https://freesound.org/people/The_Frisbee_of_Peace/sounds/573654/) |
| rescueEnding | `rescueEnding.mp3` | [Rescue Vessel Engine / Lydmakeren](https://freesound.org/people/Lydmakeren/sounds/510907/) |
| deathEnding | `deathEnding.mp3` | [Ominous Drone / SilverIllusionist](https://freesound.org/people/SilverIllusionist/sounds/693405/) |
| sinkingEnding | `sinkingEnding.mp3` | [Wooden Ship Break / Kodack](https://freesound.org/people/Kodack/sounds/257752/) |
| shipCrash | `sinkingEnding.mp3` | Reuses [Wooden Ship Break / Kodack](https://freesound.org/people/Kodack/sounds/257752/). |

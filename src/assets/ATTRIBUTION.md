# Third-Party Assets

Poly Pizza is the default source for runtime item models. Captain Whiskers uses
livingroom38's PSX Low Poly Cat from itch.io with creator permission. Models credited to
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

## Runtime item and practical-light model ledger

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| cannedFood | `cannedFood.glb` | tin can / bobbeh | https://poly.pizza/m/onPuYPx0q7 | `poly-pizza:fd443036-3eca-46e4-8342-06fd48f93e8b` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 700 | 700 | Source GLB SHA-256 `73EB054C04E778FE38F9AF2747AE7F9028710AA1527867FE02768A75F7E0F10A`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| baitTin | `baitTin.glb` | Jars / Kay Lousberg | https://poly.pizza/m/ubNPKDn2yH | `poly-pizza:1246c082-49d3-45b3-86b8-bd44e49c5384` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2192 | 192 | Source GLB SHA-256 `3DEC909E1FFE93ABE2D274ECF81875FFDB46B7AA3E5601CFE57853A984635A31`; downloaded from the official Poly Pizza static GLB; selected the `jar_D_small` node; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| ductTape | `ductTape.glb` | Time Hotel 5.25 Painters Tape / S. Paul Michael | https://poly.pizza/m/dLlslRdbHfs | `poly-pizza:0db201fd-36aa-4c36-8047-ebec79f146b8` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 2376 | 2376 | Source GLB SHA-256 `67CEDDF0FB84F8AC6F6B458BE6C8561B6649EEC43EA3E4C4C543B006219F4AC3`; downloaded from the official Poly Pizza static GLB; retained the source materials without recoloring; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| compass | `compass.glb` | Compass / Quaternius | https://poly.pizza/m/LlnxQPETHh | `poly-pizza:db18fada-a70e-44da-961c-0cc31dffdaa6` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 656 | 656 | Source GLB SHA-256 `02B285836B276A907019DF65F51674C3975364316B58FE859863921838867C7D`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
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
| harpoonGun | `harpoonGun.glb` | Rifle / Quaternius | https://poly.pizza/m/neEjwx9bBJ | `poly-pizza:da83f4f9-7a4e-4739-9033-79d688aa3b5e` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1534 | 1534 | Source GLB SHA-256 `44A923B9358CA07247F125521A85BCE03654AE802984F6333B876C75AE2D0507`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-26 |
| energyBar | `energyBar.glb` | Chocolate Bar / Quaternius | https://poly.pizza/m/vJsJ1EIiOO | `poly-pizza:c2fe4825-1aed-430d-8925-4541a98d70f8` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 436 | 436 | Source GLB SHA-256 `D34C9AC94FDCE13CA2CB99110EB4A47451DB8F1B9D12B32EA89D12F6C0686FF2`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| captainWhiskers | `captainWhiskers.glb` | PSX Low Poly Cat / livingroom38 | https://livingroom38.itch.io/psx-low-poly-cat | `itch:3163214` | [Creator permission](https://livingroom38.itch.io/psx-low-poly-cat) | 608 | 608 | Source archive SHA-256 `1C32B25CDB6E359EB2F98A5C20689540096F78328ED7BE86D8770857532A4D73`; orange FBX SHA-256 `8088349B354E9263D2AF429E28C1441122C5E356ADEBE4F8F263822B608675FF`; texture SHA-256 `FB045E0AA7452D57A3C6A5C5F4385C40C16CAA757DEC3123D69FAB705C4A67EB`. The distributed FBX contains no rig or animation data, so conversion adds the restrained object-level `CaptainWhiskersIdle` clip, centers the resting mesh, embeds the orange texture, prunes unused data, deduplicates, and unpartitions. Regenerate with `node scripts/captain-whiskers-model.mjs <source.fbx> <texture.png>`. | 2026-07-30 |
| fishingRod | `fishingRod.glb` | Fishing Rod / Quaternius | https://poly.pizza/m/0YAR0Lg58p | `poly-pizza:54eb8952-a61d-45c1-9e64-761376721e14` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 522 | 522 | Source GLB SHA-256 `6D5BD9D93D74B61C68BD053F8B94F5D594DF998938D1A71D38119E2832F8FDB5`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| lantern | `lantern.glb` | Lantern / Kay Lousberg | https://poly.pizza/m/CtHBJ1ufeW | `poly-pizza:ecbc7b04-09ca-4068-bb3c-4e5ce1163c9a` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 264 | 264 | Source GLB SHA-256 `24EE9E4B9E280023CBBAF9FF6284E7BA51A07753F8D5EC8690ECC61DD156981D`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |
| ceilingLight | `ceilingLight.glb` | Light Ceiling Single / Quaternius | https://poly.pizza/m/JT44JUXU2d | `poly-pizza:2cc064fb-2b1b-4269-9007-473dfe78bffc` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 232 | 232 | Source GLB SHA-256 `4E307B591D68D8AFF049F07B59E5AA75B81E8DA211FD48B752BF847918EDED1B`; downloaded from the official Poly Pizza static GLB; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-25 |

## Optional five-night event model ledger

These six individual Poly Pizza models support five-night event tableaus.
No model pack or kit is used. Event load failures keep the game playable.
The existing Lantern model remains the event lantern source.

| Runtime ID | File | Model / creator | Permanent source | Source asset ID | License | Source triangles | Committed triangles | Modifications | Downloaded |
|---|---|---|---|---|---|---:|---:|---|---|
| chestClosed | `chestClosed.glb` | Chest Closed / Quaternius | https://poly.pizza/m/AngpV0HxD8 | `poly-pizza:0ae3f497-8628-4864-b5d4-e81ab14704f8` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1636 | 1636 | Source GLB SHA-256 `1E018BAAB333027683C867357180B25F4228B878116CE5A69220161543A2A057`; output GLB SHA-256 `0DB2596F63196835A2B988D6438476008DE44D8802C66D3456ED6178DD93421F`; separated the closed lid at its seam and added a named hinge pivot; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| midnightIsland | `midnightIsland.glb` | Island / J-Toastie | https://poly.pizza/m/C03O8OQq6O | `poly-pizza:1fda6a0b-6228-4c16-9a3f-8ca36d9af6b6` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 84 | 84 | Source GLB SHA-256 `F2CA3A8EE6856FD312C8B6E5B1F2AA1D5234CB220FB441F836942CF4125274E6`; output GLB SHA-256 `DD2CF11A77DCFFEB7F259D0D2302AEEDB595DD564FB9383F6A9A1391218A76CB`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| deadTree | `deadTree.glb` | Dead Tree / Quaternius | https://poly.pizza/m/CD4edbPSGm | `poly-pizza:4db29f97-8e10-413d-be54-39ecda1a7c8d` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 5648 | 5648 | Source GLB SHA-256 `C6A2B34DE53EA610D4DCF20785340B12B023BD3B648A8F3DB3DCDB962008B9D3`; output GLB SHA-256 `20BB0B01D7BC968AA966452B9B290B4AA5793E60AC6D77A86CA43B2DA304B628`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| traderRowboat | `traderRowboat.glb` | Rowboat / Poly by Google | https://poly.pizza/m/dt1yhb5AYXD | `poly-pizza:0c76d378-c3fb-4a1c-aa5f-a25f09bd3ea4` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1898 | 1898 | Source GLB SHA-256 `D044E98D9C87D65CD650D6F054940A5F3C62C06457F32BB864D24615E71906FA`; output GLB SHA-256 `A1756FD3E6857F99029CBD6DF9901600DA207C384E8CEF3EC1D4E0A3E977D67E`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| riggedHand | `riggedHand.glb` | Rigged Hand / J-Toastie | https://poly.pizza/m/BEy8jbxm6A | `poly-pizza:a36ea2d8-8437-4215-98d3-2fa53be67d85` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1518 | 1518 | Source GLB SHA-256 `32705E2EE2BADC9DF04886CC0705545D6640C34E927D4DB67AFFF2802AEC945E`; output GLB SHA-256 `C63A08C01D86DD26C5260BD17BCC026BB60C0843A04D94DC52CD199DFCFD13B1`; retained the skin, 20 named joints, and 19-channel source animation; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |
| containerShip | `containerShip.glb` | Container Ship / Alex Safayan | https://poly.pizza/m/3AmDGcCu6Ll | `poly-pizza:df197d9f-5d8c-4744-bc03-75ee514e8df3` | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | 1620 | 1620 | Source GLB SHA-256 `A6F5E74082C8DFE8D251B7D70AF5C2BD8570D108B3CA2A97C3D55F38871FCB4B`; output GLB SHA-256 `B969EF01204841B4E09965740BEE30E7B5227576E4921253F3AFA0D306E2404D`; pruned unused data, deduplicated, unpartitioned, renamed, and embedded all resources. | 2026-07-30 |

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

Pinned Poly Pizza source SHA-256 values: barrel
`452B5BDC6C7A07B37B95D38D942ADB7CEB2B07B240AAFF93646A6AE3E4B535C7`;
shelf `FDA303ACFD2B118ED163735E10D04E2DF7A6745552CA4A2BC57183D76D576B39`;
crate `30604302C679A2A9A2C83A28CD54EC8A5664989EC32A75C1F78299B3ABFAD669`;
box `4B6F7B2D17997F75192C706B28E2F894B6DFF691BCED17963470D2B2CEDDBFF9`.

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

## Runtime audio ledger

All audio in this ledger uses
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Freesound files use the public high-quality MP3 preview of the approved recording.

The dawn file contains the first eight seconds of its source WAVE file.

| Runtime ID | File | Source / creator |
|---|---|---|
| calmOcean | `calmOcean.mp3` | [Calm Ocean Waves / SamsterBirdies](https://freesound.org/people/SamsterBirdies/sounds/578524/) |
| roughOcean | `roughOcean.mp3` | [Storm Sea Close / frodeims](https://freesound.org/people/frodeims/sounds/616222/) |
| lightWind | `lightWind.mp3` | [Soft Breeze / Vrymaa](https://freesound.org/people/Vrymaa/sounds/734663/) |
| strongWind | `strongWind.mp3` | [Heavy Gusts / SamsterBirdies](https://freesound.org/people/SamsterBirdies/sounds/565140/) |
| rain | `rain.mp3` | [Rain Loop / Snoopy20111](https://freesound.org/people/Snoopy20111/sounds/399072/) |
| thunderLightning | `thunderLightning.mp3` | [Thunder2 / Yoyodaman234](https://freesound.org/people/Yoyodaman234/sounds/267551/) |
| roomTone | `roomTone.mp3` | [Ferry Room Tone / kyles](https://freesound.org/people/kyles/sounds/454012/) |
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
| hullRepair | `hullRepair.mp3` | [Repair Metal / zbig77](https://freesound.org/people/zbig77/sounds/244985/) |
| tapeRepair | `tapeRepair.mp3` | [Duct Tape Rip / baidonovan](https://freesound.org/people/baidonovan/sounds/187338/) |
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
| flashlight | `flashlight.mp3` | [Small Flashlight Click / Rudmer_Rotteveel](https://freesound.org/people/Rudmer_Rotteveel/sounds/457458/) |
| flareGun | `flareGun.mp3` | [Firework Rocket Ignition / derplayer](https://freesound.org/people/derplayer/sounds/587173/) |
| harpoonGun | `harpoonGun.mp3` | [Crossbow Shot / Lunevix](https://freesound.org/people/Lunevix/sounds/246015/) |
| goingToSleep | `goingToSleep.mp3` | [Rustling Bed Sheets / Froey_](https://freesound.org/people/Froey_/sounds/644490/) |
| nightfall | `nightfall.mp3` | [Transition Sound Effect / DeVern](https://freesound.org/people/DeVern/sounds/427533/) |
| dawn | `dawn.wav` | [First Light Particles / Yoiyami](https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track) |
| eventReveal | `eventReveal.mp3` | [Dissonant Sting / nomiqbomi](https://freesound.org/people/nomiqbomi/sounds/578362/) |
| chest | `chest.mp3` | [Wooden Chest Open / The_Frisbee_of_Peace](https://freesound.org/people/The_Frisbee_of_Peace/sounds/573654/) |
| driftingCargo | `driftingCargo.mp3` | [Dragging a Crate / hz37](https://freesound.org/people/hz37/sounds/792375/) |
| rescueEnding | `rescueEnding.mp3` | [Rescue Vessel Engine / Lydmakeren](https://freesound.org/people/Lydmakeren/sounds/510907/) |
| deathEnding | `deathEnding.mp3` | [Ominous Drone / SilverIllusionist](https://freesound.org/people/SilverIllusionist/sounds/693405/) |
| sinkingEnding | `sinkingEnding.mp3` | [Wooden Ship Break / Kodack](https://freesound.org/people/Kodack/sounds/257752/) |

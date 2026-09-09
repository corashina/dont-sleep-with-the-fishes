# Drifting loot

Approved September 9, 2026.

One drifting-supplies event has barrel, lifeboat, container, and debris variants.
Remove the separate wreckage event and all wreckage diving code.
Keep the normal scuba day action and chest event.
Debris uses mirrored placement and shared wave motion. Retrieval sinks its pieces over two seconds.
Other supplies reach the player. Chests go to the stern.
Show every granted reward after retrieval ends.

Each retrieval draws a supply bundle, a common item, and at most one valuable item.
Food and bait quantities each use a uniform integer roll from 1 through 3.
Common item quantity is one.

| Variant | Food / bait / both | Common item | Valuable item |
|---|---|---|---|
| Barrel | 30 / 20 / 50 | tape 20, energy bar 25, none 55 | none 100 |
| Lifeboat | 25 / 15 / 60 | energy bar 20, none 80 | map 15, compass 15, binoculars 10, flashlight 10, medical kit 10, umbrella 10, swim ring 5, none 25 |
| Container | 30 / 30 / 40 | none 100 | net 20, binoculars 15, flashlight 15, scuba 10, medical kit 10, radio 10, flare gun 5, shotgun 5, anchor 5, none 5 |
| Debris | 20 / 35 / 45 | tape 15, none 85 | knife 20, bucket 15, flashlight 15, medical kit 10, anchor 5, none 35 |

Exclude owned durable items. Keep each pool's no-item probability fixed.
Redistribute eligible item weight proportionally. If no items remain, grant supplies only.
Keep common consumables repeatable.

The journal and save data must preserve all rewards. No legacy wreckage migration.

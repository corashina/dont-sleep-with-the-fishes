# Event item return audit

## Cause and fix

`EventItemUseController` hid returned items until dawn unless their animation appeared in a return list.
The list included net scooping but omitted net attacks, binocular use, and radio use.
The inventory still contained the item. `BoatSupplyDisplay.eventStowedUntilDay` hid its stored model.

Completed return animations now release kept items into visible storage.
The same rule applies to broken items that remain in inventory.
Lost or consumed items still depart.

## Normal event uses affected by this defect

| Item | Event | Details |
| --- | --- | --- |
| Fishing net | Swarm of Sharks | Both usable and broken outcomes. |
| Fishing net | Tentacle Attack (`snatcher`) | Both usable and broken outcomes. |
| Fishing net | Death Stare | The net breaks but remains in inventory. |
| Binoculars (`spyglass`) | Dangerous Waters | Both outcomes. |
| Binoculars (`spyglass`) | School of Fish | Observation use. |
| Binoculars (`spyglass`) | Monster in the Fog | Observation use. |
| Binoculars (`spyglass`) | Eerie Melody | Observation use. |
| Binoculars (`spyglass`) | Face on the Moon | Observation use. |
| Binoculars (`spyglass`) | Ghost Ship | Observation returns to item selection before event resolution. |
| Radio | Other People | The radio returns after the call. |

The shared fix covers all ten combinations.
Animation Lab previews use the same controller.
Its radio reception and returned trade previews also lacked the return-list exemption.
Normal completed trades remove the offered item and must still hide it.

## Other hiding paths

These paths do not complete a return animation. This fix does not change them.

| Path | Item uses and events |
| --- | --- |
| Deployed anchor stays until scene cleanup | Dangerous Waters, Tornado, Thunderstorm, Restless Waves. |
| Open umbrella stays until scene cleanup | Shower Night, Windy Night, Thunderstorm. |
| Shield umbrella stays until scene cleanup | Bad Sleep, Death Stare, Eerie Melody, Face on the Moon. |
| Worn swimming ring stays until scene cleanup | Bad Sleep. |
| Deployed swimming ring stays until scene cleanup | Restless Waves. |
| Map remains on the leak until scene cleanup | Leak. |

Night scene cleanup hides these items until dawn when they remain in inventory.
Night cancellation also hides any borrowed item still held by the controller, except the bucket.
This includes cancellation when the document becomes hidden.
Items already returned by a completed animation have no held actor and avoid this cleanup path.

Consumed supplies, completed trades, and explicit lost-item outcomes have separate reasons to disappear.
Ordinary net fishing uses `NetFishingPresentation` and restores its hidden storage model through `BoatWorld.exitFishingView`.
Windy Night net use bypasses this shared item-use controller.

## Verification

Twelve regression cases reproduced invisible storage before the fix.
They now check visible storage, position, rotation, and scale after return and night cleanup.
The cases cover all ten event combinations, including both shark and tentacle net outcomes.
Existing controller, storage, boat world, and event flow tests also passed.
TypeScript and ESLint checks passed. No browser playtest was run.

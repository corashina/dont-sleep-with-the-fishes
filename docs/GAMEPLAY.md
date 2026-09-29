# Gameplay

[Game overview](../README.md) · [Architecture](ARCHITECTURE.md) · [Events](EVENTS.md)

This guide includes equipment rules and ending spoilers. Balance values come from the linked source files.

## Controls

| Phase | Input | Action |
| --- | --- | --- |
| Scavenging | WASD / mouse | Move / look. |
| Scavenging | Shift / Space | Sprint / jump. |
| Scavenging | Left click | Pick up, drop the newest carried supply, or deposit supplies at the lifeboat. Follow the prompt. |
| Survival | Mouse | Inspect and use boat props. Select event responses. |
| Survival | Tab / Shift+Tab | Move between controls. |
| Survival | Enter / Space | Activate the focused control. Cast or reel during rod fishing. |
| Survival | Journal button | Read completed entries. `NEW` marks unread entries. |
| Survival | Pillow | End the day or choose sleep during an event. |
| Survival | Chest camera control | Turn toward a chest aboard the boat, then return to the forward view. |
| Gameplay | Escape | Pause or resume. Scavenging releases pointer lock while paused. |
| Gameplay | Backquote | Open System Tuning. |

## Escape Dorothy

Search the crew cabin, wheelhouse, cargo deck, and storage room within 60 seconds.
Carry up to three weight points per trip. Deposit supplies in the lifeboat, which has unlimited storage.
Stand in the marked evacuation area at zero seconds. You cannot launch early.
Stored supplies enter survival; supplies still in your hands do not.

Dorothy contains 20 item types and 29 pickups: seven Food, four Bait, and one of each remaining type.

| Weight | Supplies |
| --- | --- |
| 1 | Food, Bait, Duct Tape, Compass, Map, Binoculars, Knife, Flare Gun, Radio, Flashlight, Energy Bar. |
| 2 | Medkit, Fishing Net, Bucket, Umbrella, Swim Ring, Shotgun, Carlitos. |
| 3 | Scuba Gear, Anchor. |

Sources: [scavenging rules](../src/game/scavengeRules.ts), [session](../src/game/ScavengeSession.ts), [item catalog](../src/game/itemCatalog.ts).

## Supplies aboard

Food and Bait each have a shared quantity. Tools retain their item instances and conditions.
Usable props provide actions and event responses. Broken props remain aboard and need repair before use.
Consumed and lost props leave the usable inventory. Duct Tape repairs one selected repairable item.
You can discard broken equipment through its controls.

Food, Bait, Duct Tape, Medkit, Flare Gun, Shotgun, Energy Bar, and Swim Ring have one use per instance.
The Fishing Rod, repair toolbox, and pillow belong to the lifeboat. You do not collect them on Dorothy.
Carlitos becomes a companion on arrival and leaves the item inventory.

Hover or focus a prop to read its quantity, condition, action cost, and unavailable reason.
The Food meter shows fullness. Inspect the supplies to check the stored Food quantity.

Sources: [inventory](../src/survival/inventory.ts), [item descriptions](../src/survival/itemDescriptions.ts), [boat controls](../src/ui/BoatAnchorView.ts).

## Spend the day

Start with 100 Health, 100 Hull, and three Energy. Hunger rises at dawn and can reduce your next energy allowance.
Night outcomes can change that allowance too.

| Action | Cost or requirement | Result |
| --- | --- | --- |
| Fish with rod | 1 Energy; permanent rod | Catch fish, junk, or supplies. |
| Fish with net | 2 Energy; usable Fishing Net | Use the net catch pool. |
| Dive | 3 Energy; usable Scuba Gear | Search for equipment, Food, or Bait. Injury and equipment damage are possible. |
| Eat | 1 Food | Reduce hunger by 18–24; recover 1–5 Health. |
| Repair hull | Up to 3 Energy; fixed toolbox | Restore up to 33 Hull per Energy. |
| Treat | 1 Medkit | Restore Health to 100. |
| Repair item | 1 Duct Tape; broken repairable item | Restore the selected item. |
| Answer radio | 1 Energy; incoming signal | Add hidden rescue lead. Keep the Radio. |
| Eat Energy Bar | 1 Energy Bar | Restore Energy to three. |
| Retrieve drifting loot | 1 Energy, or Carlitos's help | Bring supplies or a chest aboard. |
| Open chest | 3 Energy; closed chest aboard | Recover a heart piece or later loot. |
| End day | Pillow | Enter the night sequence. |

Drifting encounters start from day three. Variants include a barrel, abandoned lifeboat, container, debris, and whale carcass.
Seagulls can steal Food during the day. Optional loot encounters allow other daytime actions before you leave.

Ordinary dives have a 65% reward chance and an independent 25% injury chance.
Overcast changes those chances to 60% and 30%. Injury removes 15–45 Health.
Scuba Gear has a separate 15% wear chance after a dive. Diving does not add rescue lead.

Sources: [balance](../src/survival/survivalBalance.ts), [action rules](../src/survival/dayActionRules.ts), [session](../src/survival/SurvivalSession.ts), [drifting supplies](../src/survival/driftingSupplies.ts).

## Fishing

Select the bow rod and click valid water to cast. Click the moving bite bubbles within six seconds to reel.
Enter or Space casts at the centered water point and reels during a bite.
Escape pauses the attempt. Resuming preserves its state and spent energy.

Rod fishing uses available Bait to improve fish catches. Landing a fish consumes one Bait; junk and missed bites do not.
Net fishing costs two Energy and uses its own catch weights without Bait.
You can recover utility items or backpacks as well as fish. Junk provides no Food.
The catch catalog excludes unique utility rewards you already hold, including broken copies.

Sources: [fishing session](../src/survival/FishingSession.ts), [catch catalog](../src/survival/fishingCatalog.ts), [settlement rules](../src/survival/fishingSettlementRules.ts).

## Care for Carlitos

Save Carlitos on Dorothy to bring him aboard. He cannot die during survival.
His care card shows rest, hunger, and happiness. Rest has three states: rested, tired, and exhausted.

A rested Carlitos can help with events and gives a small fishing bonus.
Keeping watch makes him tired. Retrieving supplies makes him exhausted.
Feed him one Food to restore fullness. Pet him once per day when his happiness needs care.

At dawn, a full stomach and low unhappiness improve rest by one stage.
Poor care can lower rest. Feeding and petting do not restore rest at once.

Source: [Carlitos state](../src/survival/CarlitosState.ts).

## Nights and endings

Night events use your equipment, condition, and earlier choices. Some nights pass without an encounter.
Ordinary night wear removes 8–13 Hull, except every fifth night. Event damage can apply on top.
Read completed days and nights in the journal. Entries describe results in the selected language.

Rescue uses hidden lead and a random dawn check. Its earliest chance is day 28 with maximum lead, or day 33 without lead.
An owned Radio can receive signals from day five. Answering signals and some event responses add lead.
Signaling another crew does not rescue you at once.

Collect the Heart of the Sea from these sources:

| Source | Requirement |
| --- | --- |
| Jellyfish | Collect the piece with a Fishing Net or Bucket. The internal event and piece ID is `flowers`. |
| Ocean of Blood | Use Scuba Gear. |
| Chest | Open a retrieved chest for its first heart reward. |

Heart pieces stay separate from tools. A complete heart schedules the Kraken at the next nightfall.
Fatal damage can end the run before you return the heart.

| Ending | Trigger |
| --- | --- |
| Sunk with Dorothy | Miss evacuation from the ship. |
| Rescue Found You | Pass the dawn rescue check. |
| The Sea Releases You | Return the complete heart to the Kraken. |
| The Sea Outlasted You | Reach zero Health. |
| The Boat Is Gone | Reach zero Hull. |

Sources: [event rules](EVENTS.md), [heart state](../src/survival/heartOfTheSea.ts), [ending records](../src/game/ending.ts).

## Saves and settings

Enable **Auto-save** in System Tuning to keep one local survival checkpoint. The default is off.
Use **Continue** to restore the last stable checkpoint. Scavenging has no checkpoint.
Disabling auto-save or reaching an ending clears the checkpoint.
The parser accepts save version 9 and rejects older or invalid data.

Select English, Polish, or Argentinian Spanish. Language and settings use browser storage.
System Tuning also provides audio, graphics, weather, and inspection controls. See [Development](DEVELOPMENT.md).

Sources: [save store](../src/browser/SurvivalSaveStore.ts), [save format](../src/survival/SurvivalSaveData.ts), [language](../src/i18n/language.ts).

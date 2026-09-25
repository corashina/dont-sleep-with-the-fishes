# Event and item interaction review

Review date: 2026-09-24. Scope: current working tree, including existing local edits.

## Follow-up corrections

The owner requested a one-Food Death Stare cost and fixes for the mismatched animations.
Death Stare now spends one Food on either outcome. Its choice and success text were updated in all three languages.

Flowers bucket use now scoops and carries the heart piece through the item return.
Rain map use places the map over supplies. Wind net use places the net over supplies.
Wind map use shows the map caught by a gust, then blown away.
Rain and thunderstorm bucket uses now bail from the boat and tip over the side.

“Hands” below meant the existing **Collect brain** choice. It requires no item, but has no visible hand model.
The reward moves from the nearby flower into the boat. A new hand model was not added.

The remaining sections record the original audit snapshot. Other game changes may also alter the listed balance values.

## Result

The core event system works, but some resource checks and presentation paths need correction.
There are **37 catalog events**, plus the **Quiet Waters day fallback**.
The item catalog has **19 items and Carlitos**.

The original review was an analysis and design proposal. The follow-up changes are listed above.
Success means understandable costs, useful item choices, and visible links between actions and results.

The review covers the catalog, choice rules, session effects, event flow, inventory, translations, and animation routes.
I ran **295 existing tests across 17 files**. All passed.
Direct session probes confirmed the resource defects below.
No browser playtest was run. Animation findings concern code paths, not verified screen appearance.

## Confirmed implementation findings

### 1. Two choices accept less than their stated cost

**Death Stare / Food:** the successful outcome subtracts two Food. The choice has no minimum Food requirement.
With one Food and one usable can, a direct session probe accepted the choice and deducted only one Food.
The player received the successful result. Its text says two Food were lost.

**Swarm of Sharks / Bait:** the outcome subtracts two Bait. It also has no minimum resource requirement.
With one Bait and one usable bait item, a direct probe accepted the choice and deducted only one Bait.

The resource clamp prevents negative values. It does not enforce the cost.
The shark Food option already requires two Food and rejects partial payment correctly.

**Proposal:** require two Bait for the shark option. Require two Food for Death Stare, or explicitly define partial offerings.
Keep availability, labels, and deductions consistent.

Sources: [eventCatalog.ts](../../src/survival/eventCatalog.ts), [eventChoiceRules.ts](../../src/survival/eventChoiceRules.ts), [SurvivalSession.ts](../../src/survival/SurvivalSession.ts).

### 2. Food and Bait availability depends on their storage form

Most event choices require a usable `cannedFood` or `baitTin` inventory instance.
Food and Bait can also exist as resource totals, including rewards from fishing and events.

Direct probes with three Food but no can instance rejected Food availability for:

- Swarm of Sharks.
- Something Under Us.

The same item rule also applies to Death Stare Food and both non-trader Bait choices.
Night Trader already accepts resource payment without an inventory instance.

**Proposal:** use resource requirements for all choices labeled Food or Bait.
Use a temporary presentation prop when no physical inventory instance exists.
Preserve instance requirements for equipment.
If cans are intentionally required, rename these choices and explain why caught food cannot work.

### 3. Some actions do not have matching item motion

| Action | Current code path | Proposal |
| --- | --- | --- |
| Flowers / Bucket | `BoatWorld.blocksEventItemUse` skips bucket use. The shared resolver also has no Flowers bucket context. | Scoop the heart piece into the bucket, then tip it into storage. |
| Shower Night / Map | Uses `map-read`, while result text says the map covers supplies. | Spread it across supplies. Show water soaking and folding it. |
| Windy Night / Map | Uses `map-read`, then loses the map and grants Food. | Show the map escaping and the food discovery as connected beats. |
| Windy Night / Net | Shared item use is explicitly skipped. | Stretch the net over cargo and pull its corners tight. |

These are presentation gaps. The underlying outcomes still resolve.
Rain Bucket uses a helmet context. Either clarify that purpose or change it to bailing to match the description.

Sources: [BoatWorld.ts](../../src/survival/BoatWorld.ts), [eventItemUseChoreography.ts](../../src/survival/eventItemUseChoreography.ts), [FlowersPresentation.ts](../../src/survival/FlowersPresentation.ts), [eventMessages.ts](../../src/i18n/eventMessages.ts).

## Correct behavior worth keeping

- Broken, consumed, and lost items cannot be used as equipment.
- Explicit item costs target the selected instance.
- Guns are single-use items. Their removal after firing follows the catalog and descriptions.
- Swim Ring is consumed after every event use, including success. An existing test confirms this rule.
- Radio is retained after calling Other People. The call costs one Energy at dawn.
- Ghost Ship binocular use returns to item selection. It does not commit the event outcome in normal UI flow.
- Check the Back automatically uses an available knife after the player chooses to investigate.
- Chest Attack automatically uses an available knife. Its catalog rows are not two manual UI buttons.
- Starry Night shows two missing-item wishes from its seven-item pool.
- Night Trader shows five seeded offers, not its entire trade catalog.
- Returned net, binocular, and radio items have storage-return regression coverage.
- Outcome weights are normalized. They do not need to total 100.

For example, Shower Night umbrella weights `100:50` mean a 33.3% break chance, not 50%.
Tornado sleep weights `80:30` mean 72.7% versus 27.3%.
Use percentages derived from weights in future labels or balance reports.

## Design concerns, not implementation defects

**Identical choices reduce useful decisions.** Flowers grants the same heart piece through hands, net, or bucket, without a mechanical cost.
Ocean of Blood gives identical salvage rewards through net and bucket.

**Some choices only punish the player.** Death Stare net always breaks and causes severe damage.
Eerie Melody binoculars always trigger damage. Shark flashlight always triggers damage.
These can support horror, but the scene needs a clue before the player commits.

**Shadow Figure rewards doing nothing.** Waiting has no listed cost. Flare spends an item; flashlight can cause harm.
If this is intentional, frame it as resisting a lure. Otherwise, give active choices a separate benefit.

**Some ownership effects are automatic.** Check the Back and Chest Attack use the knife without a separate equipment choice.
This is consistent code behavior, but the UI should make the automatic use clear.

**The compass has few direct event roles.** It serves Dangerous Waters and Monster in the Fog.
Medkit and Energy Bar have day actions and trade uses, but no direct non-trade event response.
Do not remove their day value when adding event roles.

## Complete event list

The current column lists usable responses or automatic item use, not items awarded by loot.
“No item” means no inventory item is required. Carlitos is a companion action.
The proposal column contains new design options. None are implemented by this review.

| Event | Current items and behavior | Proposed interaction |
| --- | --- | --- |
| Dangerous Waters | Anchor: 80% safe, otherwise breaks with minor hull damage. Binoculars: 60% safe, always lose one dawn Energy. Map: 80% safe. Compass: 50% safe. Sleep damages hull. | Let binoculars reveal a gap, then let the player choose a bearing. Map or compass can support the route. |
| Leak | Tape: consumed, stops damage. Bucket: 80% safe; failure breaks it. Map: 40% break risk. Sleep risks damage and item loss. | Knife carves a temporary plug from the damaged plank. Show the leak slowing, with reduced dawn Energy as the cost. |
| School of Fish | Net: three Food, or two and a broken net. Bucket: one Food or break. Binoculars: nothing or one Food. Sleep passes. | Use Bait to gather fish near a chosen side. Then choose net or bucket for a better catch. |
| Tentacle Attack (`tentacle-attack`) | Net: repels it, 20% break risk. Knife: safe defense. Shotgun or flare: consumed, safe defense. Sleep loses the targeted item and 30 Health. | Offer one Food away from the targeted supply. Show the tentacle changing targets before release. |
| Death Stare | Flashlight: 80% protection, separate 40% wear chance. Umbrella: risky shield. Food: two for success, or one with damage. Shotgun: safe, consumed. Net: always breaks with severe damage. | Let the player angle the umbrella to hide their face. The creature tests the screen before the outcome. |
| Swarm of Sharks | Two Food or two Bait divert them. Net: 20% break risk. Knife: 20% break and injury risk. Shotgun: consumed, grants two Food. Flashlight causes damage. | Let the player choose where to throw the distraction. Sharks visibly turn away from the boat. |
| Tornado | Anchor: 90% safe. Swim Ring: 60% safe, always consumed. Sleep causes hull damage and low dawn Energy. | Tape secures loose supplies while the player braces. It preserves cargo but does not stop all hull damage. |
| Shower Night | Bucket: 10% break risk. Umbrella: 33.3% break risk. Map always breaks. Sleep sometimes reduces dawn Energy. | Make bucket bailing an active alternative to umbrella shelter. Bailing protects the boat but costs sleep. |
| Windy Night | Tape: consumed; hull still takes damage. Net: 20% break risk. Map: lost, grants one Food. Umbrella: lost. Sleep risks damage and broken items. | Choose which cargo group to secure with tape or net. Show the unprotected cargo moving. |
| Bad Sleep | Bucket: retained. Swim Ring: consumed. Umbrella: about 4.8% break risk. Sleep gives two dawn Energy. | Let the player use the ring as a cushion or consume an Energy Bar for normal dawn Energy. |
| Thunderstorm | Anchor: usually safe. Bucket: damage or item loss, sometimes breaks. Umbrella: 60% safe, otherwise breaks with damage. | Offer bucket bailing or overhead shelter as distinct actions. Bailing should trade sleep for lower hull damage. |
| Restless Waves | Anchor: safe. Swim Ring: 50% safe, always consumed. Sleep risks damage and item loss. | Let the player place the ring as a fender on the exposed side. Show it absorbing one impact. |
| Ocean of Blood | Net or bucket: one Food and more pressure. Scuba: blood heart piece and more pressure. Waiting limits dawn Energy to two. | Binoculars locate a safe dive area before committing the scuba set. Keep this a clue, not another reward. |
| Monster in the Fog | Compass: lowers pressure. Binoculars: raises pressure. Flashlight: 60% safe; failure causes injury, pressure, and poor sleep. | Let the compass needle guide a heading. Looking directly at the creature remains dangerous. |
| Ghosts | Flare: consumed, lowers pressure. Flashlight: 60% protection, otherwise one dawn Energy. Sleep reduces dawn Energy. | Let the player sweep the flashlight between approaching shapes. The beam buys space while they decide. |
| Eerie Melody | Tape: consumed, lowers pressure. Umbrella: 60% protection. Bucket always breaks and gives one dawn Energy. Binoculars cause hull and Health damage. | Radio emits interference. Choosing it reduces injury risk but costs one dawn Energy. |
| Face on the Moon | Bucket or umbrella: two dawn Energy. Binoculars: 60% break and exhaustion; otherwise pressure rises. | Let the player position the cover between their view and the moon. Keep a narrow view of the sea. |
| Shadow Figure | Flashlight: pressure or 50 Health loss. Flare: consumed, drives it away. Waiting is harmless. Requires Carlitos. | Let Carlitos identify the false figure through a distinct reaction. Preserve the option to resist the lure. |
| Guarded Sleep | Carlitos watches: 85% quiet night, otherwise another night event. Declining always continues the night. | Offer one Food before watch duty. Improve reliability at the cost of tomorrow's meal. |
| Drifting Supplies | Retrieve with Energy, delegate to Carlitos, or pass. No equipment response. | Net retrieves small nearby cargo. Anchor stabilizes the boat for heavy cargo. Give each a clear cost. |
| Drifting Chest | Retrieve for one Energy, delegate to Carlitos, or pass. No equipment response. | Binoculars inspect the seam and movement before retrieval. Reveal clues, not a guaranteed mimic label. |
| Seagull Theft | Automatic loss of one Food. No defensive item choice. | Allow a brief umbrella shoo or net block. Failure still loses Food; successful defense saves it. |
| Check the Back | Investigate or ignore. Investigating automatically uses an available knife. Knife can break; unarmed failure injures the player. | Flashlight reveals the stern silhouette before the player chooses to touch it. |
| Flowers | Hands, net, or bucket grant the same flower heart piece. Passing loses the opportunity. | Give each collection method a distinct physical action. Preserve the free hand option for ending access. |
| Chest Attack | Automatic knife defense costs 10 Health. Automatic unarmed defense costs 25. The chest is destroyed. | Let an available bucket block the bite, with break risk. Make the defense choice before opening the chest. |
| Midnight Tour | Visit or pass. No equipment response. Visit can produce chest, grave, camp, or attack outcomes. | Flashlight reveals tracks. Compass marks the return bearing. Knife clears a blocked route with a stated risk. |
| Night Trader | Five offers drawn from the fixed trade list below. Payments include supplies and equipment. | Let binoculars inspect the offered item's condition before handover. Show payment and reward together. |
| Handyman | Accepts every item type except Carlitos, when an eligible missing reward exists. Reward has equal or lower weight. Touching him causes severe damage. | Offer one broken item plus Tape for guaranteed repair. Keep exchange and repair as distinct services. |
| Other People | Radio: +5 rescue progress, one less dawn Energy. Flare: +6, consumed. Flashlight: +4, retained. | Add binocular observation, then a radio call using the observed vessel bearing. Keep the numeric rescue meter hidden. |
| Ghost Ship | Binoculars inspect and return to selection. Flashlight, flare, or shotgun cause 20 Health loss and more pressure. Guns are consumed. Silence is safe. | Compass shows an impossible bearing. It gives a warning without directly naming the ship. |
| Plane | Flare: +4 rescue progress, consumed. Flashlight: +2, 5% break risk. Passing gives no progress. Ten-second choice window. | Radio sends a short distress call. Require keeping the aircraft in view long enough for a reply. |
| Flying Saucer | Flare or flashlight causes 40 Health loss. Flare is consumed. Ignoring is safe. Twelve-second choice window. | Radio detects a repeating tone. Let the player stop transmitting when the beam begins to turn. |
| Lighthouse | Flare: +4 rescue progress. Flashlight: +2. Shotgun: +1. Guns are consumed. Passing gives no progress. | Map records the bearing. This creates a later navigation benefit without another immediate rescue reward. |
| Something Under Us | One Food or one Bait diverts the shadow. Waiting loses one dawn Energy. | Compass tests whether the boat is drifting or being pulled. The result informs whether to spend supplies. |
| Starry Night | Wish for one of two missing items. Pool: Food, Bait, Tape, compass, map, knife, Energy Bar. No payment item required. | Binoculars trace a constellation before the wish. Keep the existing reward amount and free wish. |
| Kraken | Automatically returns the completed Heart of the Sea. No ordinary equipment choice. | Keep the ending focused. Add a deliberate heart handover beat, not an unrelated item puzzle. |
| Quiet Night | Sleep. No item response. | Keep the pause. A small Carlitos settling animation can add life without another task. |
| Quiet Waters (`day-calm-fallback`) | Continue. No item response. Used when the day draw has no eligible event. | Keep it quiet. Existing day item actions already supply interaction. |

Sources: [eventCatalog.ts](../../src/survival/eventCatalog.ts), [eventSelection.ts](../../src/survival/eventSelection.ts), [SurvivalEventFlow.ts](../../src/survival/SurvivalEventFlow.ts), [starryNight.ts](../../src/survival/starryNight.ts).

## Complete Night Trader item pairs

Each row lists possible rewards for that payment. A visit shows only five distinct offers.
Owned rewards, including broken equipment, block those offers under the current rules.

| Payment | Possible rewards |
| --- | --- |
| Food | Tape, Energy Bar, Bait |
| Bait | Energy Bar, Food |
| Energy Bar | Food, Tape |
| Tape | Food, Energy Bar |
| Map | Compass, binoculars |
| Compass | Map |
| Binoculars | Flashlight, map |
| Flashlight | Binoculars, knife |
| Knife | Flashlight, bucket |
| Bucket | Knife, anchor |
| Umbrella | Medkit, Swim Ring |
| Swim Ring | Radio, umbrella |
| Medkit | Umbrella |
| Flare Gun | Shotgun |
| Shotgun | Flare Gun |
| Net | Scuba gear |
| Scuba gear | Net, anchor |
| Anchor | Bucket, scuba gear |

There are 32 directed pairs. Radio can be a reward but cannot be payment here.
Carlitos never participates as trade payment. Handyman separately accepts all 19 ordinary item types.

Sources: [nightTraderTrades.ts](../../src/survival/nightTraderTrades.ts), [tradeRules.ts](../../src/survival/tradeRules.ts).

## Animation proposals for all current catalog entries

Existing code already supplies throws, scoops, net strikes, knife thrusts, binocular views, signals, anchor drops, shields, and trade handovers.
The following proposals add context or clearer results. They do not replace all existing animation.

| Item | New or improved motion |
| --- | --- |
| Food | Open the can, pour a visible portion, then throw it toward the selected water target. Show two portions for two-Food costs. |
| Bait | Open the tin and scatter a short trail. Fish or sharks turn toward the trail before approaching. |
| Tape | Show separate uses: seal a leaking seam, strap cargo, or tear two small strips to block the melody. |
| Compass | Let the needle overshoot, settle, and respond to the chosen bearing. Near supernatural threats, give it a clear abnormal pattern. |
| Map | Add distinct reading, cargo-cover, and leak-plug poses. Water damage darkens the fold before it tears. |
| Medkit | Open the case, pull out a bandage, and tighten it around an injured forearm. Close or remove the empty case. |
| Binoculars | Add a short focus adjustment. Reveal a specific clue, then lower them while the target remains visible. |
| Net | Add cargo tie-down motion. During retrieval, let the catch load the mesh before water drains away. |
| Knife | Add cutting and trimming strokes for plugs or tangled material. Keep thrusts for defense. Show resistance before a blade breaks. |
| Bucket | Separate bailing, collection, and helmet poses. For Flowers, hold the heart piece inside until it reaches the boat. |
| Flare Gun | Expand the existing shot with a descending flare, wind drift, and a distant response where appropriate. |
| Scuba gear | Check the mask seal and regulator before entry. Use a bubble trail during descent and a heavy wet return. |
| Anchor | Add a clear retrieval sequence after deployment. Show chain load before a slip or break, and slack after release. |
| Radio | Sweep the tuning dial. Let static narrow into a voice, followed by a short response click and antenna movement. |
| Umbrella | Add ribs loading under gusts and a visible catch against a threat. A broken rib should remain bent afterward. |
| Swim Ring | Show fastening or tethering before use. Show puncture, tearing, or loss afterward to explain guaranteed consumption. |
| Flashlight | Retain existing Morse signals. Add a deliberate beam sweep and a sputtering contact before a broken-light result. |
| Shotgun | Retain the existing blast. Open the breech afterward and show the spent shell to explain single use. |
| Energy Bar | Tear the wrapper, remove one bite, then fold the empty wrapper. Use a small steadying breath as feedback. |
| Carlitos | Add a question-like glance before delegation, a low warning stance at danger, and a tired return after work. |

Use the visual guide's restrained dark comedy. Favor weight, pauses, water, cloth, and contact over elastic motion.
Keep each action readable: preparation, contact, consequence, then return or loss.
Show consumption and breakage before the model disappears.
Do not add decorative motion that obscures the event target.

Reuse the existing item controller, event presenters, and action cues.
Keep event rules outside animation sampling. Reuse scene objects and vectors during frame updates.

Sources: [VISUAL_STYLE_GUIDE.md](../../VISUAL_STYLE_GUIDE.md), [eventItemUseChoreography.ts](../../src/survival/eventItemUseChoreography.ts), [EventItemUseController.ts](../../src/survival/EventItemUseController.ts).

## Recommended approach

| Approach | Benefit | Cost | Recommendation |
| --- | --- | --- | --- |
| Add contextual targets to existing choices | Clearer actions, limited changes, reuses current event flow | Some event-specific presentation work | Start here |
| Add short two-item sequences | More planning; observation can inform commitment | New intermediate state, save handling, cancellation rules, and balancing | Add selectively after the first approach works |
| Add a separate minigame to most events | More direct input | Large implementation scope; repeated tasks can weaken pacing | Do not start here |

For a first release, fix resource checks and the four presentation gaps first.
Then add three interactions: net retrieval for small supplies, flashlight inspection at the stern, and umbrella defense against the gull.
Each action should show its target, cost, and known risk before commitment.
Keep unknown creature outcomes mysterious, but give the scene a visible clue.

Next, expand observation where it changes a later choice: Ghost Ship, Dangerous Waters, and Midnight Tour.
Use the existing Ghost Ship observation loop as the reference.
Reserve two-item sequences for these events rather than expanding every event at once.

## Verification record

Passed test files:

`eventResolver`, `survivalEvents`, `survivalInventory`, `SurvivalSession`, `SurvivalEventFlow`,
`EventPlayerOptions`, `EventItemUseController`, `EventItemReturn`, `ConsumedItemReturn`,
`NightTraderTrades`, `tradeRules`, `StarryNight`, `FlowersCatch`, `GhostShipEvent`,
`SwimRingWavesPresentation`, `ItemCirculation`, and `SurvivalUI`.

Direct probes used `SurvivalSession` and `eventChoiceDecision` with fixed resources and deterministic rolls.
They confirmed partial payments and instance-dependent resource availability.
They also confirmed selected Food consumption with mixed resource storage in the tested case.

The first probe runner hit a Vite config access error. The second runner completed its probes.
Its unused dependency scan printed shutdown errors after the results. The separate Vitest run exited cleanly.

Suggested regression tests for a later implementation, rated before implementation:

| Test | Importance |
| --- | --- |
| Reject a two-unit event payment when only one unit exists | 98/100 |
| Allow resource payment without a can or tin instance | 96/100 |
| Keep selected item consumption and displayed costs consistent | 96/100 |
| Return surviving items and remove consumed items after cancellation or scene cleanup | 95/100 |
| Preserve an observation-then-action event through saving and cancellation | 95/100 |

The initial review added no tests or product code. The follow-up added payment, collection, placement, and cleanup regression coverage.

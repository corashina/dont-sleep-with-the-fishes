# Survival Length and Endings Balance

## Goal

Make successful runs last about 30 days.

Let weak supply sets extend successful runs toward day 40.

Keep the game difficult, fair, and possible with any three missing Dorothy pickups.

Target a 70 percent rescue rate for a competent player who saves 18 of 21 pickups.

## Evidence

Natural rescue currently starts on day 5.

Its chance reaches 60 percent per dawn from day 12.

The current natural-rescue mean is about day 8.47 when the player survives.

This ends most runs before pressure days 15, 25, and 40 matter.

The survivor gains 18 hunger each dawn. One Food removes 35 hunger.

The survivor therefore needs about 0.51 Food per day.

Three skilled unbaited fishing attempts produce about 1.3 Food per day.

The current food economy gives a large surplus.

Dorothy contains 21 survival pickups. The target run starts with 18 saved pickups.

Some event outcomes can remove more than 60 Hull. Night damage doubles from day 50.

The ending UI currently derives short titles from terminal state and one special reason.

## Scope

- Delay and reshape natural rescue.
- Let signals accelerate rescue without ending the run immediately.
- Rebalance fishing energy.
- Scale quiet nights and dangerous-event weights with pressure.
- Cap one outcome's Health and Hull damage.
- Standardize item-counter quality.
- Preserve five endings.
- Add cause-aware ending records and short epilogues.
- Add deterministic balance simulation.

## Non-goals

- Do not add difficulty modes.
- Do not expose rescue progress, rescue odds, or pressure.
- Do not add a fixed rescue day.
- Do not add events, items, models, sounds, or packages.
- Do not add passive Hull loss.
- Do not add a reduced-motion variant.
- Do not preserve obsolete rescue or ending interfaces.

## Selected direction

Use a delayed daily rescue chance.

Time raises the hidden chance. Signals advance the chance curve by whole effective days.

Natural rescue remains possible without supplies. Strong supplies shorten the wait.

Keep the existing survival systems. Change their numbers and ownership where required.

## Rescue curve

Do not check rescue before real day 24.

At each later dawn, calculate `effectiveDay` as real day plus `rescueLead`.

Use this chance once per dawn:

| Effective day | Rescue chance |
| --- | ---: |
| 24 through 27 | 1 percent |
| 28 through 30 | 3 percent |
| 31 through 33 | 6 percent |
| 34 through 36 | 10 percent |
| 37 through 39 | 16 percent |
| 40 through 42 | 24 percent |
| 43 and later | 38 percent |

Failed checks continue into the normal day-event flow.

Successful checks create the rescue ending at dawn.

The unmodified curve has an expected rescue day of about 36.6 for continuous survival.

Eight lead days reduce the expected rescue day to about 30.3.

Do not show the chance, effective day, or lead value to the player.

## Rescue lead

Replace `rescueProgress` with integer `rescueLead`.

Clamp rescue lead from zero through eight.

Apply these persistent gains:

| Source | Lead gain | Limit |
| --- | ---: | --- |
| Send Bottled Paper | 2 | Once |
| Find a rescue trace while diving | 1 | Twice |
| Use Flashlight during Other People | 4 | Event availability |
| Use Flare Gun during Other People | 6 | Event availability |

Sending Bottled Paper still costs one Energy and consumes the item.

A rescue-trace dive remains one possible successful dive reward.

Track successful rescue-trace dives separately. Only the first two add lead.

Other People requires at least two rescue-lead days.

Bottled Paper can meet this gate. Two rescue-trace dives can also meet it.

Other People does not rescue the player during the event.

Its signal changes the chance from the next dawn onward.

Using the Flare Gun consumes it. The Flashlight remains durable.

The ending record notes whether any signal created rescue lead.

## Day economy

Keep maximum Energy at three.

Raise the fishing cost from one Energy to two.

Keep these approved values:

- Dawn hunger gain: 18
- Food hunger reduction: 35
- Normal morning Energy: 3
- Hungry morning Energy: 2
- Starving morning Energy: 1
- Repair Energy: 1
- Dive Energy: 3
- Bottled Paper Energy: 1

Eating remains free.

A normal fishing day leaves one Energy for repair or Bottled Paper.

Diving and three-Energy drifting-cargo retrieval each replace fishing for that day.

An Energy Bar can create an exceptional second fishing attempt.

A starving survivor cannot afford fishing that day.

This makes early eating important and creates a recoverable hunger spiral.

Do not add a daily fishing limit. Energy remains the only action limit.

## Pressure and pacing

Keep pressure hidden and clamped from zero through four.

Keep normal pressure increases on days 8, 15, 25, and 40.

Keep successful supernatural pressure reductions persistent.

Use actual pressure to select the quiet-night chance:

| Pressure | Typical days | Quiet-night chance |
| ---: | --- | ---: |
| 0 | 1 through 7 | 30 percent |
| 1 | 8 through 14 | 25 percent |
| 2 | 15 through 24 | 20 percent |
| 3 | 25 through 39 | 15 percent |
| 4 | 40 and later | 10 percent |

The day ranges are typical. Event gains and reductions can move pressure earlier or later.

Multiply only dangerous-event draw weights by `1 + 0.25 * pressure`.

Keep safe and uncertain event weights unchanged.

Keep current event day gates, cooldowns, and appearance limits unless another approved rule changes them.

Remove the day-50 night-damage multiplier.

Pressure changes the event mix. It does not multiply resolved damage.

## Event damage

One resolved outcome can remove at most 60 Health.

One resolved outcome can remove at most 60 Hull.

The limit applies to the sum of all subtract effects for the same resource.

Revise every existing outcome that exceeds either limit.

Keep lower current damage unchanged unless balance simulation requires a documented adjustment.

Health or Hull below 60 can still reach zero after a bad outcome.

The rule prevents an ordinary event from killing a full-condition player.

Taken in the Dark is not resource damage. It remains an explicit special ending.

## Event responses and item attrition

Audit each dangerous event against three response levels.

| Response level | No-loss target |
| --- | ---: |
| Primary counter | 80 through 100 percent |
| Secondary counter | 50 through 75 percent |
| No matching item | High loss risk |

No-loss means no Health, Hull, Energy, pressure, or involuntary item loss.

A matching one-use counter gives a certain protective result and is consumed.

A breakable durable primary counter can break on 10 through 25 percent of uses.

A secondary counter can cause moderate damage, breakage, or loss.

A no-item response can cause 20 through 60 damage or one item loss.

Random item loss occurs only after a deliberately risky response.

One outcome can remove at most one random item.

Every event must retain a no-item response. Missing supplies must never block event resolution.

Do not show exact response odds to the player.

## Endings

Keep these five ending IDs:

| Ending ID | Display title | Trigger |
| --- | --- | --- |
| `dorothy` | `SUNK WITH DOROTHY` | The ship timer ends before evacuation. |
| `rescue` | `RESCUE FOUND YOU` | A dawn rescue check succeeds. |
| `death` | `THE SEA OUTLASTED YOU` | Health reaches zero. |
| `sinking` | `THE BOAT IS GONE` | Hull reaches zero. |
| `taken` | `TAKEN IN THE DARK` | Shadow Figure takes the player. |

Natural rescue and signal-assisted rescue use the same ending ID and title.

Use a different rescue epilogue when the run used a signal.

Use these short epilogues:

- Dorothy: `Dorothy took you down before the lifeboat cleared her side.`
- Natural rescue: `At dawn, an engine answered the empty horizon.`
- Signal rescue: `A distant crew followed the signs you left across the sea.`
- Starvation: `Hunger left you too weak to meet another dawn.`
- Diving death: `The water returned you to the boat, but not for long.`
- Event death: `The last encounter left wounds the next dawn could not mend.`
- Other death: `Your strength failed before help crossed the horizon.`
- Sinking: `The last damage opened the boat to the sea.`
- Taken: `The light found something that had been waiting for you.`

The sinking panel also names the last damaging event when one exists.

The ending panel shows the title, epilogue, reached day, and saved-pickup count.

Do not show the seed or hidden rescue data.

Keep one primary `Start From the Ship` action.

## Taken in the Dark

Keep Shadow Figure gated by a living Carlitos.

Keep its earliest day at 20 and its minimum pressure at three.

High pressure makes its normal appearance period day 25 or later.

Keep these choices:

- Flare Gun always creates Taken in the Dark and consumes the item.
- Flashlight has a 50 percent Taken in the Dark chance.
- Sleep ends the event safely.

This event does not change Health or Hull when it creates the ending.

The explicit risky choice is the approved exception to ordinary event survival.

## Ending data model

Add one shared ending module under `src/game`.

Define one `EndingRecord` with these values:

- Ending ID
- Reached day
- Saved-pickup count
- Cause
- Last event ID when relevant
- Signal-assisted rescue flag

Use cause variants for starvation, diving, an event, and other Health loss.

Use the terminal event ID as the sinking cause when available.

The session owns terminal state and cause.

The session stores the starting saved-pickup count and creates the complete survival ending record.

The scavenging phase creates the Dorothy ending record.

The ending module owns titles and epilogue selection.

GameUI and SurvivalUI render the shared record. They do not derive ending meaning.

Create one terminal record per run. Repeated terminal checks return the same record.

## Ownership

`survivalBalance.ts` owns the rescue curve, Energy costs, and quiet-night chances.

`RunPressure.ts` owns pressure thresholds and dangerous-event weight scaling.

`SurvivalSession.ts` owns rescue lead, dawn checks, resources, and terminal cause.

`events.ts` owns signal effects, counter outcomes, and authored damage.

The shared ending module owns ending IDs, record types, titles, and epilogues.

`SurvivalPhase.ts` controls terminal cues and ending timing.

GameUI and SurvivalUI render ending records.

Presentation code does not select rescue, damage, or endings.

## Data flow

1. A day action or event can add rescue lead.
2. SurvivalSession clamps the lead from zero through eight.
3. Dawn advances hunger, Energy, pressure, and companion state.
4. Real days before 24 skip the rescue check.
5. Later dawns resolve one chance from effective day.
6. A failed check continues into normal day-event scheduling.
7. A successful check creates one complete rescue ending record.
8. Health, Hull, or Shadow Figure can create another terminal record.
9. SurvivalPhase waits for the terminal cue.
10. The shared ending UI renders the stored record and restart action.

## Validation and error handling

Validate the rescue curve during module construction.

Reject unsorted day thresholds, decreasing chances, invalid probabilities, or a first threshold other than day 24.

Clamp runtime rescue lead. Reject authored gains outside one through eight.

Validate each event outcome's summed maximum Health and Hull subtraction.

Reject totals above 60.

Require every event to have a no-item response.

Require every terminal record to contain a valid ending-specific cause.

Reject repeated actions after terminal state without consuming a random draw.

Keep the existing deterministic empty-event fallback.

Do not add compatibility fields, migrations, or legacy title paths.

## Balance simulation

Add a deterministic simulation command that uses the production rule layer.

Enumerate all 1,330 ways to omit three of Dorothy's 21 physical pickups.

Each simulated run starts with the other 18 pickups.

Use a documented competent-player policy with these rules:

- Never select Taken in the Dark deliberately.
- Prefer the safest available authored event counter.
- Eat before the next dawn would enter a worse hunger tier.
- Treat or repair before the related meter enters fatal-event range.
- Use Bottled Paper when one Energy remains.
- Seek up to two rescue-trace dives when food and condition permit.
- Fish when no urgent survival or rescue action has priority.
- Resolve fishing reactions successfully 90 percent of the time.

Resolve policy ties with a fixed order. Keep that order in the simulation source.

Run at least 100 seeds per missing-pickup set for final balance evaluation.

Keep a smaller deterministic smoke sample in the normal test suite.

The simulator reports rescue, death, sinking, taken, and day distributions.

It also reports results grouped by missing-pickup set and rescue lead.

## Tests

### Rescue rules

- No rescue random draw occurs before day 24.
- Each effective-day band uses its approved chance.
- Rescue lead changes effective day but not real day.
- Rescue lead clamps at eight.
- Bottled Paper adds two lead once.
- Only two rescue-trace dives add lead.
- Other People requires two lead.
- Flashlight adds four lead without ending the event.
- Flare Gun adds six lead, is consumed, and does not end the event.
- Failed rescue checks continue into day events.
- Successful rescue checks create one rescue ending.

### Economy and pressure

- Fishing costs two Energy.
- Hunger and Food keep the approved values.
- Starving Energy cannot fund fishing.
- Quiet-night chances follow actual pressure.
- Dangerous-event weights use the pressure multiplier.
- Safe and uncertain weights do not change.
- Night damage never receives a day-50 multiplier.

### Catalog safety

- Summed Health subtraction never exceeds 60 per outcome.
- Summed Hull subtraction never exceeds 60 per outcome.
- Random item loss never exceeds one.
- Every event has a no-item response.
- Primary and secondary counters meet their approved ranges.
- Shadow Figure keeps its approved special outcomes.

### Ending flow

- Every terminal path creates the correct ending ID.
- Health loss records starvation, diving, event, or other cause.
- Hull loss records the final damaging event when available.
- Signal and natural rescue share one ending ID.
- Signal and natural rescue select different epilogues.
- Ending records include day and saved-pickup count.
- The ending UI does not show seed or rescue lead.
- Repeated terminal checks and cues show one ending.
- Restart creates a fresh scavenging run.

### Balance acceptance

- All 1,330 missing-pickup sets remain structurally winnable.
- No rescue occurs before day 24.
- Competent-policy rescue rate is 68 through 72 percent.
- Successful runs average 29 through 32 days.
- No-signal successful runs average 36 through 40 days.
- No ordinary event outcome ends a full Health or full Hull run.

### Project verification

- Run focused survival and ending tests.
- Run the complete test suite.
- Run TypeScript checking.
- Run the production build.

## Delivery order

1. Add the rescue curve and replace rescue progress with rescue lead.
2. Convert Bottled Paper, diving, and Other People to lead gains.
3. Change fishing cost and pressure-based pacing.
4. Remove night damage multiplication.
5. Audit and validate event damage and response quality.
6. Add the shared ending record and update both ending interfaces.
7. Add the balance simulator and tune authored numbers.
8. Update current gameplay documentation.
9. Run the complete verification suite.

Each step must leave the game playable.

## Acceptance criteria

- A skilled, well-supplied successful run lasts about 30 days.
- A weak no-signal successful run can last about 40 days.
- Competent players with 18 pickups reach rescue in about 70 percent of simulated runs.
- Active signals help but never create rescue before day 24.
- Rescue odds and progress remain hidden.
- Food, Energy, item attrition, and pressure remain relevant through the rescue window.
- One ordinary outcome cannot kill a full-condition player.
- Natural and signal-assisted rescue use one ending.
- Five distinct ending IDs remain.
- Every ending gives a concise cause-aware summary.
- No obsolete rescue, damage-multiplier, or ending-reason path remains.

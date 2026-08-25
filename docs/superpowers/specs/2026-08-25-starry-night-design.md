# Starry Night Design

## Goal

Add a positive nighttime survival event named **Starry Night**.

The event makes the night sky bright, glowy, and calm. It offers three useful choices.

## Success criteria

- Starry Night can appear from day 3.
- The event has weight 2.
- The event has a 12-day cooldown.
- The event can appear at most twice per run.
- The enhanced stars fade in during the reveal.
- Stars use bright blue-white cores, soft halos, and slow uneven twinkles.
- The normal sky returns after the event ends.
- Binoculars grant four energy at dawn.
- The HUD shows this energy as `4 / 3`.
- Compass grants one rescue lead and three dawn energy.
- Sleep grants three dawn energy.
- Standard energy recovery stays capped at three.

## Non-goals

- Do not add an audio asset.
- Do not add a model or texture asset.
- Do not change normal night skies.
- Do not add a Carlitos choice.
- Do not add reduced-motion behavior.
- Do not raise the standard energy limit.

## Event definition

Add `starry-night` to the survival event catalog.

Use these event settings:

| Field | Value |
|---|---|
| Phase | Night |
| Risk | Safe |
| Cue | Darkness |
| Weight | 2 |
| Earliest day | 3 |
| Cooldown | 12 days |
| Maximum appearances | 2 |

Use this reveal text: `The clouds part, and clear stars shine over still water.`

The event offers these choices:

| Choice | Requirement | Result |
|---|---|---|
| Use Binoculars | Usable Binoculars | Set next dawn energy to 4 |
| Use Compass | Usable Compass | Add one rescue lead and set next dawn energy to 3 |
| Sleep | None | Set next dawn energy to 3 |

Each choice has one deterministic outcome. The event never breaks, consumes, or loses an item.

Use these outcome messages:

- Binoculars: `Through the binoculars, the stars seem close enough to touch.`
- Compass: `The stars confirm your bearing and the boat's drift.`
- Sleep: `You sleep beneath the quiet sky and wake rested.`

## Presentation architecture

Add a dedicated `starry` presentation route. Keep it separate from moon and weather presentations.

Add a small Starry Night presentation class. It owns reveal progress, event strength, and twinkle time.

The presentation controls the existing sky through a narrow transient API. It does not own sky resources.

The sky shader owns star shape, color, glow, density, and twinkle math.

The presentation does not add scene geometry. It reuses the current Binoculars and Compass item motion.

The registry creates the Starry Night adapter only for `starry-night`.

## Visual design

Normal stars remain unchanged outside this event.

During Starry Night, the shader adds these layers:

- Brighter blue-white star cores.
- Soft additive halos around sparse large stars.
- A modest increase in visible small stars.
- Slow twinkles with different phase, speed, and strength per star.

The effect must keep the moon and horizon readable. It must preserve open sky and avoid uniform brightness.

The reveal fades event strength from zero to full strength over two seconds.

The outcome reaction fades event strength to zero over one second. Cleanup then resets every value.

The fixed camera does not move for this event.

## Energy model

Keep three as the standard energy limit. Add four as the stored bonus limit.

Allow `nextDawnEnergy` to contain integer values from zero through four.

At dawn, the Binoculars result sets energy to four. Normal actions then spend the bonus first.

Rest and Energy Bar still target three energy. They cannot restore the spent bonus.

Other resource effects cannot raise stored energy above four.

The event does not persist a separate bonus flag. The value above three is the bonus state.

## HUD behavior

When energy is four, show `4 / 3` in the energy tooltip.

Keep the visual fill at 100 percent. Do not enlarge the icon or change its normal scale.

Use accessible text that says the player has three standard energy and one bonus energy.

Use a valid accessible maximum while the bonus exists. Restore the normal maximum after spending it.

## Data flow

1. Event selection checks the day, cooldown, and appearance count.
2. Event flow stages the Starry Night adapter.
3. The adapter starts the star reveal.
4. The selected outcome stores the next dawn energy and any rescue lead.
5. Event cleanup resets the star effect.
6. Dawn applies the stored energy value.
7. The HUD renders four energy against the standard limit of three.
8. Day actions reduce energy through the current action rules.

## Lifecycle and errors

The presentation must tolerate repeated clear and dispose calls.

Clear, disposal, test-event replacement, and phase exit must reset every transient star value.

Visibility settlement must stop pending reveal work and apply a stable current state.

Catalog validation must reject an unknown route or a dawn energy outside zero through four.

Registry validation must require one presentation factory for the new route.

## Tests

Add focused tests for these cases:

- Catalog order includes `starry-night`.
- The event has the approved day, weight, cooldown, and appearance limit.
- Each choice has the approved requirement and deterministic result.
- Event selection enforces the cooldown and two-appearance limit.
- Catalog validation accepts dawn energy four and rejects larger values.
- Binoculars produce four energy at dawn.
- Compass adds one rescue lead and produces three energy at dawn.
- Sleep produces three energy at dawn.
- Spending from four reaches three through normal action costs.
- Rest and Energy Bar do not restore energy above three.
- The HUD shows `4 / 3` and valid accessible bonus text.
- The star reveal reaches full strength.
- Twinkle values change with time and remain bounded.
- Clear and disposal reset all star values.
- Registry coverage includes the new route.

Run the focused tests first. Then run the full test suite, type check, and production build.

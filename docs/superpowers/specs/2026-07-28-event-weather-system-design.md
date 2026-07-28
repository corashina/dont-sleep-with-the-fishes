# Event Weather System Design

## Goal

Add eight visually distinct weather presentations:

- Calm
- Overcast
- Squall
- Rain
- Wind
- Thunderstorm
- Waves
- Fog

Normal gameplay is Calm outside weather events. Rain, Wind, Thunderstorm,
Waves, and Fog activate only for their matching survival events. Overcast and
Squall are complete presentation options reserved for future event mappings.
The backquote system-tuning menu can force any weather during scavenging or
survival.

## Gameplay Rules

The survival session no longer rolls daily weather. Its normal weather is
always Calm during the day and during ordinary nighttime outside an active
weather event. This removes weather-driven gameplay variation from the daily
loop.

The five current automatic mappings are:

| Event | Presentation weather |
| --- | --- |
| Shower Night | Rain |
| Windy Night | Wind |
| Thunderstorm | Thunderstorm |
| Restless Waves | Waves |
| Man in the Fog | Fog |

Event weather starts when the matching event is staged and remains active
through reveal, choice, and outcome presentation. It clears when the event
presentation is cleared. Overcast and Squall have no automatic mapping in this
change.

Presentation weather does not alter event eligibility, outcomes, resources,
action availability, journal data, or other gameplay rules. It is deterministic
from the active event or explicit debug selection.

## Weather Model

Keep gameplay state and visual presentation separate.

- The survival session retains only the Calm normal-weather behavior.
- A presentation-weather identifier contains all eight values.
- A pure weather catalog contains labels, atmosphere modifiers, shared-wave
  multipliers, precipitation/mist settings, lightning settings, and event
  mappings.
- A resolver selects one effective presentation weather from the automatic
  event weather and optional debug override.

The optional debug override has higher priority than automatic event weather.
It is initially absent. Before manual input, the menu reflects the effective
weather and automatic events work normally. Once the player selects any menu
value, that value becomes a persistent override. Because the menu intentionally
has no `AUTO` option, reloading the game is the way to restore automatic event
control.

## Ownership and Data Flow

`Game` owns the optional debug override because it must survive transitions
between scavenging and survival. The system-tuning menu reports selection
changes to `Game`, and `Game` passes the current override to the active phase.
Newly created phases receive the existing override before their first visible
frame.

Both phases expose a narrow optional weather-override method through the phase
interface:

1. The scavenging phase forwards the override to its world environment.
2. The survival phase forwards the override to its boat world.
3. The survival phase also supplies automatic event weather as event
   presentation state changes.
4. Each world resolves its effective weather and applies one catalog profile.

A shared `WeatherEffects` component is created once per scene. It owns every
weather-specific geometry, material, particle buffer, and listener it creates,
and disposes each resource exactly once. Scavenging `Environment` and
`BoatWorld` own their respective component instances.

Per-frame updates reuse fixed buffers and scratch values. They do not create
new arrays, vectors, materials, geometries, or render objects.

## Shared-Wave Contract

Each profile provides a wave multiplier. The effective multiplier is applied
to the existing phase-specific wave scale:

- Scavenging multiplies the sinking-state scale.
- Survival multiplies its Calm base scale.

The resulting scale is passed unchanged to ocean rendering, wave sampling,
buoyancy, vessel motion, and weather-dependent spray. This preserves the
shared wave field as the single source of truth.

## Visual Direction

The system interprets the visual guide through authored atmosphere, restrained
continuous motion, and scene-integrated controls. Geometry, palette, lighting,
fog, and shared-wave response establish each weather. Particles and any print
treatment remain supporting layers.

### Calm

Use the existing muted blue daylight, soft haze, readable horizon, covered but
warm maritime light, and gentle shared waves. Calm is the quiet reference
against which every other profile is judged.

### Overcast

Flatten the lighting into cool grey-blue values, cover the sun, lower distant
contrast, and slightly increase sea weight. It should feel still and oppressive,
not stormy: no rain, lightning, or aggressive spray.

### Squall

Stage a dark, wind-driven storm front with fast low mist and salt-spray bands,
sharper gust movement, and a rough sea. Keep it distinct from Thunderstorm by
excluding lightning and sustained rainfall. It should read as an approaching
wall of weather.

### Rain

Use uneven slanted rain streaks, restrained near-surface impacts, cool wet
atmosphere, and moderately stronger waves. Rain has no lightning and should
remain readable rather than becoming a dense screen overlay.

### Wind

Use directional salt-mist ribbons, sparse airborne flecks, stronger lateral
surface movement, and gust-weighted sea motion. It has no falling rain and no
lightning. Directionality, rather than darkness, is its primary signature.

### Thunderstorm

Combine heavy rain, the darkest storm palette, forceful shared waves, and brief
irregular lightning illumination. Lightning uses isolated authored beats, not
rapid or periodic flicker. Thunderstorm is the most dramatic combined weather.

### Waves

Use the largest shared-wave multiplier, stronger foam and bow spray, and the
most pronounced vessel response. Keep the sky comparatively open so the sea,
not atmospheric darkness or precipitation, defines the profile.

### Fog

Use dense desaturated depth loss, a softened horizon, low-contrast lighting,
and relatively quiet water. Fog contains no rain, lightning, or forceful wind.
Nearby boat and interaction silhouettes remain legible.

## System-Tuning Menu

Add a `WEATHER` section to the existing backquote panel with one native
keyboard-accessible select containing all eight labels. A compact adjacent
status reads:

- `NORMAL` while Calm controls the scene outside an event.
- `EVENT` while automatic event weather controls the scene.
- `FORCED` after the player manually selects a value.

Before a manual override, the select follows the current effective weather,
including automatic event entry and exit. After manual selection, it stays on
the forced value across event endings and phase changes. A short note states
that forced weather persists until reload.

The control remains a development/system-tuning element rather than persistent
player HUD. Opening the panel continues to release pointer lock and suspend
direct controls according to the existing overlay contract.

## Accessibility and Fallback

Weather remains identifiable through multiple signals: motion direction,
precipitation shape, fog depth, lighting value, wave response, and explicit
menu labels. Color is never the only distinction.

Reduced-motion handling preserves the effective weather while reducing
particle density and suppressing rapid lightning variation. Ocean and vessel
motion remain continuous because they are physical systems, but optional mist
and spray movement is restrained.

If optional particle presentation is unavailable, atmosphere, fog, lighting,
and shared-wave changes still distinguish the weather profiles. The direct
renderer and post-processing renderer use the same scene-owned weather
geometry.

## Testing

Automated tests cover:

- Normal survival weather remains Calm and no random weather roll occurs.
- Each of the five events maps to the correct presentation weather.
- Event weather begins during staging and clears with event presentation.
- Overcast and Squall have no automatic mapping.
- A debug selection overrides automatic event weather.
- The override persists when switching from scavenging to survival.
- New phases receive the override before their first visible frame.
- The menu contains exactly the eight ordered choices and reports `NORMAL`,
  `EVENT`, or `FORCED` correctly.
- Keyboard handling, overlay callbacks, and listener disposal remain correct.
- Every profile has a distinct signature and valid wave multiplier.
- Ocean, buoyancy, vessel motion, and spray receive the same resolved wave
  scale.
- Weather resources are disposed exactly once.
- Reduced-motion settings suppress rapid lightning and reduce optional
  particles without changing weather identity.

Manual visual verification covers all eight weather types in both scavenging
and survival, including event entry/exit, a forced override across the phase
handoff, low and high visual quality, and reduced-motion preference.

## Scope

This change does not add new survival events, map Overcast or Squall to an
event, add weather audio, change event balance, or add a menu command that
restores automatic weather. Those remain separate future changes.

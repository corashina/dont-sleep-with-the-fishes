# Audio System Design

## Goal

Add the 47 selected sounds through one attachable audio module.

Keep audio separate from deterministic game rules and renderer ownership.

Add persistent master volume and mute controls to System Tuning.

## Source Catalog

`docs/AUDIO_CANDIDATES.md` is the approved source catalog.

All runtime audio files stay local under `src/assets/audio`.

The game never depends on Freesound or OpenGameArt at runtime.

`src/assets/ATTRIBUTION.md` records each title, author, license, and source URL.

The implementation uses these sound identifiers:

- Music and ambience: `music`, `calmOcean`, `roughOcean`, `lightWind`, `strongWind`, `rain`, and `thunderLightning`.
- Ship: `roomTone`.
- Scavenging: `woodStep`, `jump`, and `itemHandling`.
- Lifeboat: `boatCreak`, `lightWaveImpact`, and `hardWaveImpact`.
- Interface: `confirm`, `denied`, `pause`, and `resume`.
- Actions: `journal`, `eating`, `medkit`, `hullRepair`, and `tapeRepair`.
- Diving: `diveEntry`, `underwaterMovement`, and `diveSurface`.
- Fishing: `fishingCast`, `fishingBite`, `fishingReel`, `fishCatch`, `junkCatch`, and `fishingMiss`.
- Tools: `bucketRain`, `umbrella`, `anchorChain`, `flashlight`, `flareGun`, and `harpoonGun`.
- Time: `goingToSleep`, `nightfall`, and `dawn`.
- Events: `eventReveal`, `chest`, and `driftingCargo`.
- Endings: `rescueEnding`, `deathEnding`, and `sinkingEnding`.

## Architecture

`Game` owns one `AudioSystem`.

`AudioSystem` owns the browser audio context, decoded buffers, buses, preferences, and active voices.

Each game phase creates one audio scope from the shared system.

A phase scope owns its loops and effects.

Scope disposal stops only that phase's sounds.

System disposal stops all voices and closes the browser audio context.

The module exposes semantic sound identifiers instead of file paths.

Game rules do not import audio files or browser audio types.

## Components

`audioManifest.ts` defines each sound file and its playback settings.

Settings include bus, gain, loop state, and voice limit.

`AudioBackend.ts` defines the testable playback boundary.

`WebAudioBackend.ts` implements that boundary with the Web Audio API.

`AudioSystem.ts` loads assets and manages global state.

`AudioScope.ts` manages sounds owned by one phase.

`audioPreference.ts` stores master volume and mute state.

`ScavengeAudio.ts` maps scavenging events to sound identifiers.

`SurvivalAudio.ts` maps survival events and weather to sound identifiers.

## Audio Graph

The audio graph has one master bus.

The master bus contains music, ambience, effects, and interface buses.

Master volume uses a linear user value from zero to one.

Bus and source gains use authored manifest values.

Mute sets the master gain to zero without changing the saved volume.

Gain changes use short ramps to prevent clicks.

## Playback Rules

Audio decoding begins during normal asset loading.

Playback unlocks after the first pointer or keyboard gesture.

Unlock listeners remove themselves after success.

Music uses one loop and one adaptive layer.

Music intensity changes gain only.

Scavenging intensity follows sinking progress.

Survival intensity uses calm, event, and terminal states.

Weather changes crossfade ocean, wind, and rain loops.

Thunder plays once for each authored lightning strike.

Repeated effects use small voice limits.

The oldest matching voice stops when a limit is full.

Pause lowers music and ambience to 35 percent.

Pause plays the pause cue once.

Resume restores bus gains and plays the resume cue once.

## Scavenging Integration

Scavenging starts music and ship room tone.

Movement plays wood steps at a stable grounded cadence.

An accepted jump plays the jump cue.

Pickup, drop, and throw actions share `itemHandling`.

Accepted interface actions play `confirm`.

Rejected actions play `denied`.

Scavenging failure plays `sinkingEnding`.

The survival handoff fades the scavenging scope before disposal.

## Survival Integration

Survival starts music, calm ocean, and boat creak.

Presentation weather drives ocean, wind, rain, thunder, and wave effects.

Journal open, page, and close actions share `journal`.

Food and energy bar actions share `eating`.

Treatment, hull repair, and tape repair use their selected cues.

Diving uses entry, underwater movement, and surface cues.

Fishing uses cast, bite, reel, catch, junk, and miss cues.

Supported tools play their selected cues after accepted use.

End Day starts `goingToSleep` with the existing sleep cover.

Night presentation plays `nightfall`.

The return to daytime plays `dawn`.

Event presentation plays `eventReveal`.

Chest and drifting cargo use their selected event cues.

Terminal states play rescue, death, or sinking cues.

## System Tuning

System Tuning adds a master volume slider and a mute control.

The slider range is zero through 100.

The slider step is five.

The default volume is 70.

Mute is off by default.

The preference uses local storage when storage is available.

Invalid saved values fall back to the defaults.

Control changes affect active sounds without restarting a phase.

## Failure Handling

Missing required audio files fail startup asset loading.

Playback failures do not stop gameplay.

The module logs each playback failure once.

An unavailable audio context leaves the game silent.

Disposal remains safe after partial loading or context failure.

## Determinism and Performance

Audio never changes game state or rule results.

Timed ambient cues use an injected random source.

Tests can replace the clock, random source, and backend.

The update path reuses existing nodes and state.

It does not fetch, decode, or rebuild the audio graph per frame.

## Tests

Unit tests cover manifest completeness and unique identifiers.

Unit tests cover volume validation, mute, persistence, and storage failure.

Backend tests cover loading, voice limits, ramps, pause mixing, and disposal.

Scope tests confirm that one phase cannot stop another phase's sounds.

Scavenging tests verify steps, jump, item handling, pause, failure, and handoff.

Survival tests verify actions, weather layers, fishing, events, days, and endings.

Launch tests verify audio loading ownership and failed-load cleanup.

The production build confirms that every manifest import resolves.

## Completion Criteria

All 47 selected sources exist as local runtime assets.

Each current game hook plays its mapped sound.

System Tuning changes and persists master volume and mute.

Phase changes and disposal leave no active audio owners.

All automated tests and the production build pass.

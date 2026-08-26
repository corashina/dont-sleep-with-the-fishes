# Survival Save System Design

## Goal

Add one optional survival auto-save. The player controls it through System
Tuning with the backquote key.

The feature is off for a new player. The enabled choice persists across page
reloads. Turning it off deletes the saved run.

## Scope

The save covers lifeboat survival only. It does not save the main menu or the
scavenging phase.

The system stores one run. It does not add save slots, manual saves, cloud
storage, imports, exports, or old save support.

## Player Flow

System Tuning gets a **SAVE SYSTEM** group. It contains:

- An **Auto-save** switch.
- A status that reads **OFF**, **NO SAVE**, or **DAY N**.
- A **CONTINUE** button.

The switch defaults to off when no preference exists. Changing it writes the
preference at once.

Enabling the switch during a stable survival state creates a checkpoint at
once. Enabling it in another phase waits until survival starts.

The Continue button is active only when the system has a valid saved run. It
can replace the current menu, scavenging phase, or survival phase. Continuing
disposes the current phase, exits pointer lock, resets the camera, and starts
survival from the saved state.

Starting a fresh run does not delete the old save. The first checkpoint in the
new survival run replaces it.

Turning the switch off deletes the saved run at once. Reaching a terminal
ending also deletes it. The enabled preference remains after terminal cleanup.

## Checkpoint Rules

The system saves only stable player states. It never saves a running
animation, transition, fishing attempt, delayed result, or other presentation
task.

A stable checkpoint is created after:

- Survival finishes its initial setup.
- A day action and its presentation finish.
- A fishing attempt and its result presentation finish.
- An event reveal reaches its choice state.
- An event result and its presentation finish.
- A quiet night finishes.
- A dawn transition finishes.
- A journal or companion change becomes part of one of these states.

If the page closes during a task, Continue restores the previous stable
checkpoint. The game does not try to resume the task.

Terminal state handling deletes the checkpoint instead of storing an ending.

## Architecture

### Save storage

Add a small browser save module beside the current preference storage helper.
It owns two local storage records:

- The persistent enabled preference.
- The versioned survival checkpoint.

The module exposes the current enabled state, checkpoint metadata, enable and
disable commands, checkpoint writes, checkpoint reads, and checkpoint
deletion. Game code does not read local storage directly.

Storage exceptions do not stop the game. The in-memory enabled choice remains
active for the page. A failed checkpoint write keeps the prior valid
checkpoint when the browser permits it.

### Save data

Use one explicit save data transfer object. It contains a format version,
scavenging elapsed time, and the complete authoritative survival state.

The survival state includes:

- Phase, day, meters, resources, pressure, weather, and rescue progress.
- Saved items, live inventory conditions, chest state, and Carlitos state.
- Radio state and pending dawn changes.
- The pending event and its target.
- Event cooldown days, appearance counts, and prior event identity.
- Completed journal entries and unfinished journal records.
- Daily action flags and counters that affect later rules.
- The pseudo-random generator state.

Transient UI, Three.js objects, audio, timers, promises, and presentation
objects are not saved.

### Session export and restore

SurvivalSession gains one checkpoint export method and one restore
construction path. Restore creates a valid session from the data. It does not
construct a normal session and patch private fields later.

Replace the closure-only random source used in production with a small
stateful random source. It provides the same sequence and can export its
current integer state. Tests can still inject a RandomSource where save tests
do not require restoration.

The session invalidates cached public snapshots after restore construction.
Derived counts come from restored authoritative data through normal session
rules.

### Phase and game ownership

Game owns save storage and the Continue command. It passes a checkpoint sink
to SurvivalPhase and can create SurvivalPhase from either fresh scavenging
results or restored save data.

SurvivalPhase knows when presentation work reaches a stable boundary. At that
point, it exports the session checkpoint and sends it to Game. Session methods
do not write browser storage.

The existing phase generation checks guard Continue in the same way they guard
restart and event test transitions. A replaced phase cannot write a late
checkpoint.

PostProcessingConsole renders controls and reports user actions. It does not
own save state or browser storage.

## Validation

Parse unknown browser data as untrusted input. Validate the complete object
before creating a session.

Validation rejects:

- Invalid JSON or a non-object root.
- A missing or unsupported exact format version.
- Missing fields, invalid numbers, or values outside required ranges.
- Unknown item, condition, event, journal, chest, weather, or phase values.
- Duplicate item instance IDs or inconsistent saved and inventory items.
- Terminal states, active fishing state, or another transient state.
- Invalid random state or impossible pending event data.

Rejected checkpoint data is deleted. The enabled preference remains on, and
the UI changes to **NO SAVE**.

Only the current format version is supported. A new format replaces the old
format. Do not add migrations, fallback parsing, or compatibility layers.

## UI and Accessibility

Follow the current System Tuning material, type, spacing, and control patterns.
Keep the save group compact. Do not change the world composition.

Use a native checkbox switch and button. Give both controls clear accessible
names. The visible status explains why Continue is unavailable. Keyboard focus
follows the current System Tuning order.

Opening and closing System Tuning keeps the current overlay and pointer lock
behavior.

## Tests

Add focused tests for:

- Default-off behavior and persisted enable state.
- Immediate deletion when the switch turns off.
- Initial and stable-boundary checkpoint writes.
- No writes during active presentations or fishing.
- Complete session round trips, including random state and hidden event data.
- Restore of day, pending day event, and pending night event states.
- Continue from menu, scavenging, and survival.
- Correct disposal, camera reset, pointer lock exit, resize, and phase start.
- Terminal checkpoint deletion.
- Invalid JSON, invalid fields, unsupported versions, and storage exceptions.
- System Tuning labels, status, button state, actions, and keyboard access.

Run the related Vitest files, the full test suite, type checking, and the
production build before completion.

## Documentation

Update the README System Tuning section. State that auto-save is off by
default, covers survival only, stores one local checkpoint, and deletes that
checkpoint when disabled or when the run ends.

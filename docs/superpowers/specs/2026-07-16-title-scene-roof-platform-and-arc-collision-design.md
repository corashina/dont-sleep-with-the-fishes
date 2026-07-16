# Title Scene, Roof, Platform, and Arc Collision Design

- **Status:** Approved
- **Date:** 2026-07-16
- **Target:** Desktop web browser
- **Scope:** Scavenging title presentation, freighter roof line, chimney platform, and bow/stern rail collision

## 1. Objective

Improve the scavenging phase in four places:

1. Show the freighter, ocean, and sky behind the title menu before the player begins the run.
2. Give the crew cabin, wheelhouse, and storage/workroom one roof elevation.
3. Widen the machinery island beneath the twin smokestacks so each collar has visible edge clearance.
4. Let the player slide along the curved bow and stern rails instead of catching on box-shaped collision steps.

The work keeps the current ship layout, furniture, item distribution, timer length, materials, visual rail geometry, smoke outlets, survival phase, and controls.

## 2. Title Presentation

### 2.1 Scene ownership

`ScavengePhase` keeps one `World`, scene, and renderer for the title and active run. The title does not create a second ship or ocean. The phase tracks a presentation state with two values:

- `title`: the menu owns the camera and the scavenging session remains ready;
- `playing`: the player controller owns the camera and the session may advance.

The phase starts in `title`. It keeps the sinking state at zero and the countdown at `02:00`. The world renders the ship, ocean, sky, smoke, and lighting behind the menu. A phase-owned `worldTime` advances during the title and active play, then freezes during a gameplay pause. Water, boat buoyancy, and atmospheric effects use `worldTime`. Sinking and the countdown use session elapsed time. This separation animates the title ocean without spending scavenging time or causing a wave jump at the camera cut.

### 2.2 Camera composition

The title state sets the camera position to `(-26, 8, -4)` and its look target to `(0, 3.5, -4)`. The camera views the freighter broadside from the port side with a slight downward angle. Browser inspection may adjust these two named constants if the production post-processing changes the framing. At a 1280 by 720 viewport, the final constants must produce this composition:

- the full hull fits between the top and bottom safe margins;
- the bow and stern remain on screen;
- the ship occupies the center-right portion of the frame;
- ocean and sky surround the silhouette;
- the left portion of the frame has enough low-detail water and sky for menu copy.

The camera does not orbit or respond to pointer movement. Reduced-motion mode uses the same stationary camera.

### 2.3 Menu and HUD

`GameUI` exposes the presentation state on its root element. In `title` state, CSS hides the crosshair, prompt, carry circles, and pocket-watch timer. The start layer uses a transparent background with a dark gradient on the left. It places the kicker, title, description, controls, button, input error, and fine print in a left-aligned column. The gradient must preserve text contrast without covering the center-right ship view.

Pause, failure, and result screens keep their current full-screen treatment. The active scavenging HUD returns when the phase enters `playing`.

### 2.4 Start transition and failures

The start button requests pointer lock while the title state remains active. A failed request shows the existing error and leaves the exterior camera, menu, timer, and session unchanged.

After pointer lock succeeds, `PlayerController` places the shared camera at the existing player start and applies the existing initial yaw and pitch. `ScavengePhase` then changes the UI to `playing`, hides the title layer, and starts the session. The title fade covers the camera cut. This order prevents the timer from losing time during pointer-lock prompts.

Disposal removes the same listeners and owned scene objects from either presentation state.

## 3. Common Roof Elevation

The wheelhouse keeps its current wall height of `3.4` units. `ShipGeometry` uses that height for the crew cabin and storage/workroom as well. The change raises those two rooms by `0.2` units.

The builder raises each affected wall segment and corner cap. It places each roof slab on its wall top. The three roofs retain their `0.24` thickness, `0.175` overhang, painted-steel material, horizontal bounds, and lack of player collision.

Given the current deck elevation of `2.22`, each roof bottom sits at `5.62` and each roof top sits at `5.86`. Door footprints, room footprints, furniture, item surfaces, and wheelhouse windows keep their current values.

## 4. Wider Chimney Platform

`ShipLayout.machineryClosure` expands across the ship from `x = -2.0..2.0` to `x = -2.6..2.6`. Its fore-aft range stays `z = -14.4..-11.4`.

`ShipGeometry` continues to derive the machinery island mesh and collider from that rectangle. The visible platform and its collider become `5.2` units wide. Their center, length, and height do not change.

The stacks retain their centers at `x = -1.35` and `x = 1.35`, collar radius of `0.72`, and outlet height of `7.1`. Each collar gains about `0.53` units of clearance between its outer edge and the platform edge. Smoke sources and stack weathering keep their current positions.

Route tests must confirm that the wider collider does not block the approved stern deck targets or the exterior loop.

## 5. Bow and Stern Arc Collision

### 5.1 Collider model

The visual end rails keep their twelve chord meshes and rail posts. `ShipGeometry` stops creating one rotated box collider per chord. It creates one `CollisionArc` for the bow and one for the stern.

Each arc stores:

- center coordinates in ship-local space;
- horizontal radius from the rail inner-face position;
- longitudinal radius of `4.0` units;
- bow or stern direction;
- rail collision thickness;
- minimum and maximum collision heights.

The arc describes the same half-ellipse used by `addCurvedEndRail`. Side rails keep their box colliders.

`ShipGeometryBuild`, `ShipBuild`, and `World` expose arc barriers through an `arcColliders` collection beside `CollisionBox[]`. Furniture visibility, support-height checks, item-surface validation, and ray tests continue to consume boxes. `PlayerController` passes both collections to horizontal movement resolution.

### 5.2 Movement resolution

`resolveLocalMovement` accepts an optional arc collection so existing box-only callers keep their current behavior. The solver performs a bounded sequence:

1. resolve movement against boxes;
2. test the resolved player circle against each height-overlapping arc;
3. project an illegal position to the nearest legal point on the deck side of the ellipse;
4. apply the player radius plus half the rail collision thickness along the inward normal;
5. run box resolution once more at the side-rail junctions.

Projection removes the outward normal component and retains the tangent component. Diagonal movement follows the curve. The solver handles approach from either shoulder, the center of each end, walking speed, and sprint speed. The deck side remains legal; the ocean side remains blocked.

Arc barriers cannot act as floor support and cannot change jump height.

## 6. Code Boundaries

The implementation touches these areas:

- `src/phases/ScavengePhase.ts`: title/playing state, title camera application, and successful-start transition;
- `src/player/PlayerController.ts`: camera placement without a movement tick and arc-barrier input;
- `src/player/collisions.ts`: `CollisionArc` and arc projection;
- `src/ui/GameUI.ts` and `src/styles/main.css`: presentation-state hooks, left menu layout, transparent title treatment, and title HUD visibility;
- `src/world/ShipGeometry.ts`: common wall height, end-rail arcs, and platform geometry;
- `src/world/ShipLayout.ts`: machinery closure width;
- `src/world/Ship.ts` and `src/world/World.ts`: arc-collider plumbing.

The change adds no dependency, model, texture, audio file, or remote asset request.

## 7. Testing

Add focused tests before production edits.

### 7.1 Title state

- `ScavengePhase` applies the exterior camera before the session starts.
- Title updates keep the session at `02:00` and sinking progress at zero.
- `GameUI` hides gameplay HUD elements in title state and restores them in playing state.
- Pointer-lock failure keeps title presentation active.
- Pointer-lock success places the first-person camera before the session begins.
- Disposal works before and after the transition.

### 7.2 Geometry

- The three named roof meshes share bottom and top elevations.
- Each roof bottom meets the top of its walls and corner caps.
- The machinery island mesh and collider span `5.2` units across the ship.
- The stack centers and outlets keep their current coordinates.
- Each stack collar has the specified platform clearance.
- Existing stern and exterior routes remain reachable.

### 7.3 Collision

- Ship geometry exports two end-rail arcs and no chord box colliders.
- The bow and stern centers block outward movement at player radius.
- Both shoulders block outward movement.
- Diagonal movement from both directions advances along the tangent instead of stopping.
- Sprint-sized steps cannot cross either arc.
- Side-rail collision, box sliding, support selection, jump behavior, and approved bow/stern targets keep passing.

Run:

```text
bun run models:check
bun run test
bun run typecheck
bun run build
```

## 8. Browser Inspection

Inspect the title at 1280 by 720 and 1024 by 768. Confirm that the left menu stays readable, the whole ship remains visible, ocean and sky fill the background, gameplay HUD stays hidden, and the camera does not move.

Begin evacuation and confirm that the camera cuts to the current first-person start, the timer begins at `02:00`, and the gameplay HUD appears. Reject pointer lock once and confirm that the title state does not change.

Inspect the three roof lines from both sides. Check the platform edge clearance around both chimney collars. Walk and sprint along the inside of the bow and stern rails in both directions, including each shoulder and center. Confirm that the player slides without crossing the rail or catching at chord boundaries.

Enter the survival phase and confirm that renderer ownership, camera reset, and phase cleanup still work.

## 9. Acceptance Criteria

1. The pre-start screen shows a stationary broadside freighter over live ocean and sky, with left-aligned menu copy and no gameplay HUD.
2. Pointer-lock failure preserves the title scene. Pointer-lock success starts the timer and transfers the camera to the player.
3. The crew-cabin, wheelhouse, and storage/workroom roof tops sit at `y = 5.86`.
4. The machinery island measures `5.2` units across the ship and leaves about `0.53` units outside each chimney collar.
5. The player slides along both curved end rails at walk and sprint speeds without passing through them.
6. Side rails, room access, approved deck routes, smoke, items, sinking behavior, and survival behavior remain intact.
7. Model checks, tests, typecheck, build, and browser inspection pass.

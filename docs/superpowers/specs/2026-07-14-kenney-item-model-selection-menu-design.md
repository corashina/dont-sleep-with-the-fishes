# Kenney Item Model Selection Menu Design

## Goal

Give the user one visual board for choosing replacements for the game's nine item models. Each row compares the current model with three candidates from official Kenney CC0 packs. The board records one choice per item and keeps the current model selected until the user chooses an alternative.

## Scope

The board covers these runtime item IDs and preserves their current names:

- `flareGun`
- `ductTape`
- `fishingRod`
- `baitTin`
- `medicalKit`
- `waterJug`
- `cannedFood`
- `flashlight`
- `scubaSet`

Candidate research may use complete Kenney models or composites assembled from parts in Kenney packs. Production assets, manifests, tests, and gameplay code stay unchanged during selection.

## Source Rules

Researchers will use official asset pages on `kenney.nl` and free individual CC0 packs. They will not use the optional All-in-1 bundle or another asset store. Each candidate record will contain:

- the official asset-page URL and pack version;
- the archive-relative source entry for a direct model;
- the source entries and part transforms for a composite;
- a direct or composite classification;
- a triangle estimate;
- a short note on recognition and in-game fit.

The shortlist should include one direct model and one composite where the catalog supports both without weakening the result. The researcher may use three candidates of one type when that item lacks a credible alternative of the other type.

## Candidate Evaluation

The researcher will judge each option against the game's existing prop scale and visual style:

1. The silhouette should identify the item without a tooltip.
2. Details should remain readable on ship surfaces and inside the lifeboat.
3. The model should suit a maritime survival setting.
4. The geometry should fit the existing 3,000-triangle per-item budget.
5. The candidate should avoid adding a pack when an equal option exists in an approved pack.

The researcher will exclude a candidate if the official pack or license cannot be verified, the archive lacks the required entry, the parts cannot reproduce the shown composite, or the geometry does not fit the runtime constraints.

## Preview Production

The selection board will use renders made from the candidate geometry instead of pack-page thumbnails. Each card will use the same camera angle, neutral background, lighting, and normalized display volume. Small orientation adjustments may expose an item's defining feature, such as the tape hole, rod reel, medical cross, flashlight lens, or scuba tanks.

Research downloads and generated previews will live outside the runtime asset directory. The selection pass will not overwrite files under `src/assets/models/items`.

## Selection Board

The browser companion will show one scrollable page with nine rows and four cards per row:

1. current model;
2. candidate A;
3. candidate B;
4. candidate C.

Each card will show the preview, pack name, direct or composite status, triangle estimate, and fit note. Clicking a card will select one option for that row. All rows will start on the current model. A sticky summary will list the nine current selections so the user can review the set before confirming it.

The page will preserve the selected state while the user compares rows. The terminal response remains the approval record; browser click events provide the structured per-item choices.

## Data Flow

1. Read the current model manifest and asset ledger.
2. Search official Kenney asset pages for relevant packs.
3. Inspect pack archives and record reproducible source entries.
4. Build research-only direct or composite candidate files.
5. Render the current model and three candidates for each item.
6. Publish the comparison board through the brainstorming companion.
7. Read the user's browser selections and terminal confirmation.
8. Write a separate implementation plan for the approved replacements.

## Failure Handling

The researcher will remove an invalid candidate and replace it before showing the board. A failed preview render will not produce a blank selectable card. If the catalog cannot supply three credible alternatives for an item, that row will show the credible options and state why it has fewer cards.

The companion can restart on the same project session and port if its local server stops. The research files and screen fragments persist in the project brainstorming directory so a restart does not lose the shortlist.

## Verification

Before showing the board, verify:

- nine rows exist and use the runtime item IDs;
- each row contains the current model and up to three verified candidates;
- each source link points to an official Kenney asset page;
- each composite lists all source parts;
- preview labels match their rendered files;
- one click per row updates the sticky summary;
- current models remain selected until the user changes them;
- no production model, manifest, or asset-ledger file changed during research.

After the user confirms the set, the implementation plan will cover pinned downloads, archive hashes, processed GLBs, provenance edits, model audits, tests, builds, and visual checks in both game phases.

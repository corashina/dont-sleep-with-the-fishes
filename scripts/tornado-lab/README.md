# Tornado preview

Run `node scripts/render-tornado-preview.mjs` from the repository root.

This renders the production `TornadoPresentation` with the production ocean.
It captures the full funnel, a later animation frame, and a boat-height view.
Night captures use the survival scene's moon direction and show the close view as well as the full funnel.
It also checks that clouds cannot cover an opaque hull surface placed in front of the funnel.
The hull check compares 4,096 pixels with the tornado shown and hidden. Any difference fails the check.
The full-funnel view uses a preview camera. It does not change the game camera.

Screenshots and shader checks are saved in `artifacts/tornado-preview/`.
Headless frame timings include the ocean and forced GPU synchronization.
They are not measurements of full-game frame time.

For a moving preview, open `/dont-sleep-with-the-fishes/scripts/tornado-lab/index.html` on the development server.

The effect uses procedural cloud density, cloud self-shadowing, foam, and sea mist.
It has no downloaded model or textures. Geometry and uniforms are reused during animation.

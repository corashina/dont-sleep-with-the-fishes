# Ocean effects preview

This is a visual experiment. It does not change the game.
It imports the current ocean renderer and patches only the preview material.
The simple hull comes from the existing water lab.

## Capture

Run from the project root:

```powershell
node scripts/render-ocean-effects-preview.mjs
```

The script starts Vite and a separate headless browser.
It renders eleven views, writes a comparison sheet, then closes both processes.
Output goes to `artifacts/ocean-effects-preview/`.
Pass a different output directory as the first argument.
Set `CHROME_PATH` if Chrome or Edge is installed elsewhere.

## Interactive preview

```powershell
npm run dev -- --port 5188
```

Open the URL below. Select an effect. Press Play to inspect motion.

<http://127.0.0.1:5188/dont-sleep-with-the-fishes/scripts/ocean-effects-lab/index.html>

## Comparisons

The first seven views use the same camera, wave time, and rough sea state.
The final views show calm water, night, bubbles close up, and combined effects close up.

| View | Purpose |
| --- | --- |
| Baseline | Current water appearance |
| Crest foam | Broken patches on compressed wave crests |
| Hull foam | Irregular froth at hull contact |
| Bubbles | Small rings in churned water |
| Ripples | Hull rings and fine wind detail |
| Lighting | Broader, softer water highlights |
| Combined | All effects, including foam lighting |

## Scope and checks

- This experiment targets High water quality.
- Bubbles are surface shading, not underwater particles.
- Foam is procedural. It has no stored history or physical transport.
- Hull contact uses the lab's rectangular hull dimensions.
- Captures show raw ocean rendering without game post-processing.
- The capture script fails on shader errors, WebGL errors, and missing images.
- `report.json` records the captured settings and shader errors.
- Type checking and linting apply to the preview files.
- Screenshots establish appearance. They do not establish game performance.

Before integration, adapt contact effects to the real hull and check both quality settings.
Check animation, weather, fishing visibility, and frame time in the game.

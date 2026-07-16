import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const renderingDirectory = 'src/rendering';
const renderingFileNames = [
  'PostProcessingPipeline.ts',
  'PrintShader.ts',
  'SceneRenderer.ts',
  'postProcessingProfiles.ts',
];
const renderingFiles = renderingFileNames.map((fileName) => `${renderingDirectory}/${fileName}`);
const forbiddenRuntimeResourcePattern =
  /https?:\/\/|new\s+URL\s*\(|\bfetch\s*\(|\b(?:TextureLoader|ImageLoader|CubeTextureLoader)\b|(?:assets?|models?|textures?)[\\/]|\.(?:png|jpe?g|webp|gif|bmp|ktx2?|hdr|exr|glb|gltf|obj|fbx|lut|cube)\b/i;

function extractCssRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`^[ \\t]*${escapedSelector}[ \\t]*\\{([^}]*)\\}`, 'm'));
  expect(match, `Expected CSS rule for selector "${selector}"`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('post-processing presentation policy', () => {
  it('uses only the expected local rendering sources and no added dependency', async () => {
    expect((await readdir(renderingDirectory)).sort()).toEqual([...renderingFileNames].sort());
    const sources = await Promise.all(renderingFiles.map((path) => readFile(path, 'utf8')));
    for (const [index, source] of sources.entries()) {
      expect(source, `${renderingFiles[index]} must not load a runtime asset`).not.toMatch(
        forbiddenRuntimeResourcePattern,
      );
    }
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toEqual({ three: '^0.180.0' });
  });

  it('keeps only a light normal UI frame shade and preserves the critical vignette', async () => {
    const css = await readFile('src/styles/main.css', 'utf8');
    const normalRule = extractCssRule(css, '.ui-treatment::before');
    expect(normalRule).toContain(
      'background: radial-gradient(circle at 50% 44%, transparent 55%, #02030326 100%);',
    );
    expect(normalRule).not.toContain('#020303e8 108%');

    const criticalRule = extractCssRule(
      css,
      '.game-ui[data-sinking-severity="critical"] .ui-treatment::before',
    );
    expect(criticalRule).toContain(
      'background: radial-gradient(circle at 50% 44%, transparent 30%, #30050580 64%, #020303f5 100%);',
    );
    expect(criticalRule).toContain(
      'animation: critical-vignette .8s steps(2, end) infinite;',
    );
    extractCssRule(css, '@keyframes critical-vignette');
  });
});

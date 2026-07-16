import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const renderingFiles = [
  'src/rendering/SceneRenderer.ts',
  'src/rendering/postProcessingProfiles.ts',
  'src/rendering/PrintShader.ts',
  'src/rendering/PostProcessingPipeline.ts',
];

describe('post-processing presentation policy', () => {
  it('uses no remote runtime resource or added dependency', async () => {
    const sources = await Promise.all(renderingFiles.map((path) => readFile(path, 'utf8')));
    for (const source of sources) expect(source).not.toMatch(/https?:\/\//);
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toEqual({ three: '^0.180.0' });
  });

  it('keeps only a light normal UI frame shade and preserves the critical vignette', async () => {
    const css = await readFile('src/styles/main.css', 'utf8');
    expect(css).toContain('#02030326 100%');
    expect(css).not.toContain('#020303e8 108%');
    expect(css).toContain('#30050580 64%');
    expect(css).toContain('critical-vignette');
  });
});

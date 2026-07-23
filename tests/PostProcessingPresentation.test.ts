import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createInkFrameMask } from '../src/rendering/inkFrameMask';

const renderingDirectory = 'src/rendering';
const renderingFileNames = [
  'PostProcessingPipeline.ts',
  'PrintShader.ts',
  'SceneRenderer.ts',
  'inkFrameMask.ts',
  'postProcessingProfiles.ts',
];
const renderingFiles = renderingFileNames.map((fileName) => `${renderingDirectory}/${fileName}`);
const forbiddenRuntimeResourcePattern =
  /https?:\/\/|new\s+URL\s*\(|\bfetch\s*\(|\b(?:TextureLoader|ImageLoader|CubeTextureLoader)\b|(?:assets?|models?|textures?)[\\/]|\.(?:png|jpe?g|webp|gif|bmp|ktx2?|hdr|exr|glb|gltf|obj|fbx|lut|cube)\b/i;

describe('post-processing presentation policy', () => {
  it('builds a deterministic frame with a clear center and dark irregular perimeter', () => {
    const texture = createInkFrameMask(64);
    const data = texture.image.data as Uint8Array;

    expect(data[(32 * 64 + 32) * 4]).toBeLessThan(20);
    expect(data[(1 * 64 + 1) * 4]).toBeGreaterThan(180);
    expect(data[(1 * 64 + 32) * 4]).not.toBe(data[(1 * 64 + 10) * 4]);

    texture.dispose();
  });

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


});

import { Scene, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { Skybox } from '../src/world/Skybox';

function createTestSkybox(): Skybox {
  return new Skybox(
    new Scene(),
    { weather: 'calm', phase: 'night', severity: 0 },
    new Texture(),
  );
}

describe('Skybox moon face', () => {
  it('uploads clamped moon face state and resets every transient', () => {
    const sky = createTestSkybox();

    sky.setMoonFace({
      reveal: 1.2,
      grin: 0.6,
      starScale: 0.2,
      dim: 0.35,
      scale: 3.6,
    });

    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(1);
    expect(sky.material.uniforms.uMoonGrin?.value).toBe(0.6);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBe(0.2);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0.35);
    expect(sky.material.uniforms.uMoonScale?.value).toBe(3.6);

    sky.resetTransient();

    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(sky.material.uniforms.uMoonGrin?.value).toBe(0);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBe(1);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
    expect(sky.material.uniforms.uMoonScale?.value).toBe(1);
    sky.dispose();
  });

  it('keeps face features moon-local and sequences both eyes before the mouth', () => {
    const sky = createTestSkybox();
    const shader = sky.material.fragmentShader;

    expect(shader).toContain('vec4 sampleMoon');
    expect(shader).toContain('float eyeShape');
    expect(shader).toContain('float mouthShape');
    expect(shader).toContain('leftEyeReveal');
    expect(shader).toContain('rightEyeReveal');
    expect(shader).toContain('mouthReveal');
    expect(shader).toContain('* uMoonStarScale');
    expect(shader).toContain('1.0 - uMoonEventDim');
    sky.dispose();
  });

  it('clears moon transients before disposal', () => {
    const sky = createTestSkybox();
    sky.setMoonFace({
      reveal: 1,
      grin: 1,
      starScale: 0,
      dim: 1,
      scale: 3.6,
    });

    sky.dispose();

    expect(sky.material.uniforms.uMoonFaceReveal?.value).toBe(0);
    expect(sky.material.uniforms.uMoonGrin?.value).toBe(0);
    expect(sky.material.uniforms.uMoonStarScale?.value).toBe(1);
    expect(sky.material.uniforms.uMoonEventDim?.value).toBe(0);
    expect(sky.material.uniforms.uMoonScale?.value).toBe(1);
  });
});

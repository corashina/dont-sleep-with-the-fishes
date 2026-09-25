import { DirectionalLight, Group, Mesh, PerspectiveCamera, Scene, ShaderMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WeatherEffects } from '../src/world/WeatherEffects';

// Importance: 90/100. Both storm paths must render, fade, and release their bolt resources.
function expectBolt(object: unknown): asserts object is Mesh<import('three').BufferGeometry, ShaderMaterial> {
  expect(object).toBeInstanceOf(Mesh);
  const bolt = object as Mesh;
  expect(bolt.material).toBeInstanceOf(ShaderMaterial);
  expect(bolt.geometry.index!.count).toBeGreaterThan(100);
  expect((bolt.material as ShaderMaterial).transparent).toBe(true);
  expect((bolt.material as ShaderMaterial).depthTest).toBe(true);
}

describe('lightning presentation', () => {
  // Importance: 95/100. Strikes must cover the view without clipping after camera turns or on narrow screens.
  it.each([{ fov: 110, aspect: 9 / 16 }])(
    'keeps complete lightning paths large and in front at FOV $fov and aspect $aspect', ({ fov, aspect }) => {
      const camera = new PerspectiveCamera(fov, aspect, 0.08, 1000);
      camera.position.set(8, 1.5, -6);
      const cameraRig = new Group();
      cameraRig.add(camera);
      for (const yaw of [0, Math.PI / 2, Math.PI]) {
        cameraRig.rotation.y = yaw;
        camera.rotation.x = -0.06;
        camera.updateWorldMatrix(true, false);
        const cameraPosition = camera.getWorldPosition(new Vector3());
        let leftmost = Infinity;
        let rightmost = -Infinity;
        for (const randomValue of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.999]) {
          const scene = new Scene();
          const weather = new WeatherEffects(scene, () => randomValue);
          weather.setWeather('thunderstorm');
          weather.setLightningView(camera);
          weather.update(0.65, 0.65, cameraPosition);
          scene.updateMatrixWorld(true);
          const bolts = scene.getObjectByName('weather-lightning')!.children.filter(
            (object) => object.name.startsWith('weather-lightning-bolt-') && object.visible,
          ) as Mesh[];
          expect(bolts.length).toBeGreaterThan(0);
          for (const bolt of bolts) {
            const positions = bolt.geometry.getAttribute('position');
            let minimumY = Infinity;
            let maximumY = -Infinity;
            for (let vertex = 0; vertex < positions.count; vertex += 1) {
              const projected = new Vector3().fromBufferAttribute(positions, vertex)
                .applyMatrix4(bolt.matrixWorld).project(camera);
              expect(Math.abs(projected.x)).toBeLessThan(0.95);
              expect(Math.abs(projected.y)).toBeLessThan(0.95);
              expect(projected.z).toBeGreaterThan(-1);
              expect(projected.z).toBeLessThan(1);
              leftmost = Math.min(leftmost, projected.x);
              rightmost = Math.max(rightmost, projected.x);
              minimumY = Math.min(minimumY, projected.y);
              maximumY = Math.max(maximumY, projected.y);
            }
            // At least one fifth of the screen height, including at the widest game FOV.
            expect(maximumY - minimumY).toBeGreaterThan(0.4);
          }
          weather.dispose();
        }
        expect(leftmost).toBeLessThan(-0.7);
        expect(rightmost).toBeGreaterThan(0.7);
      }
  });

  it('renders weather strikes, fades without rebuilding, and hides when weather changes', () => {
    const scene = new Scene();
    const weather = new WeatherEffects(scene, () => 0.5);
    const thunder = vi.fn();
    weather.setThunderListener(thunder);
    weather.setWeather('thunderstorm');
    weather.update(1.35, 1.35, new Vector3());
    const bolt = scene.getObjectByName('weather-lightning-bolt-5');
    expectBolt(bolt);
    expect(bolt.visible).toBe(true);
    expect(thunder).not.toHaveBeenCalled();
    const light = scene.getObjectByName('weather-lightning-light') as DirectionalLight;
    expect(light).toBeInstanceOf(DirectionalLight);
    expect(light.position.x).toBe(bolt.position.x);
    expect(light.position.z).toBe(bolt.position.z);
    expect(light.intensity).toBeGreaterThan(0);
    const geometry = bolt.geometry;
    weather.update(1.45, 0.1, new Vector3());
    expect(thunder).not.toHaveBeenCalled();
    weather.update(1.85, 0.4, new Vector3());
    expect(bolt.visible).toBe(false);
    expect(bolt.geometry).toBe(geometry);
    expect(light.intensity).toBe(0);
    expect(thunder).toHaveBeenCalledOnce();
    weather.setWeather('calm');
    expect(bolt.visible).toBe(false);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(bolt.material, 'dispose');
    weather.dispose();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  // Importance: 95/100. Pending audio and flash lighting must not leak into the next event.
  it.each(['calm', 'dispose'] as const)('cancels delayed thunder on %s', (action) => {
    const scene = new Scene();
    const weather = new WeatherEffects(scene, () => 0.5);
    const thunder = vi.fn();
    const camera = new Vector3();
    weather.setThunderListener(thunder);
    weather.setWeather('thunderstorm');
    weather.update(1.35, 1.35, camera);
    if (action === 'calm') weather.setWeather('calm');
    else weather.dispose();
    weather.update(3, 1.65, camera);
    expect(thunder).not.toHaveBeenCalled();
    if (action === 'calm') {
      const rain = scene.getObjectByName('weather-rain') as Mesh<import('three').BufferGeometry, ShaderMaterial>;
      expect(rain.material.uniforms.lightningGlow!.value).toBe(0);
      expect((scene.getObjectByName('weather-lightning-light') as DirectionalLight).intensity).toBe(0);
    }
    weather.dispose();
  });

  // Importance: 95/100. Storm strikes must continue while the player waits to choose an item.
  it('keeps producing strikes and thunder throughout a long event', () => {
    const scene = new Scene();
    const weather = new WeatherEffects(scene, () => 0.5);
    const thunder = vi.fn();
    const camera = new Vector3();
    weather.setThunderListener(thunder);
    weather.setWeather('thunderstorm');
    for (let frame = 1; frame <= 600; frame += 1) weather.update(frame * 0.05, 0.05, camera);
    expect(thunder.mock.calls.length).toBeGreaterThanOrEqual(13);
    expect(scene.getObjectByName('weather-rain')!.visible).toBe(true);
    const calls = thunder.mock.calls.length;
    weather.setWeather('calm');
    weather.update(40, 10, camera);
    expect(thunder).toHaveBeenCalledTimes(calls);
    weather.dispose();
  });
});

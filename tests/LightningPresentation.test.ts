import { DirectionalLight, Group, Mesh, PerspectiveCamera, Scene, ShaderMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
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
  // Importance: 95/100. Both strikes must remain inside the view after camera turns and on narrow screens.
  it.each([16 / 9, 9 / 16])('places complete lightning paths inside the camera view at aspect %s', (aspect) => {
    const camera = new PerspectiveCamera(50, aspect, 0.08, 1000);
    camera.position.set(8, 1.5, -6);
    const cameraRig = new Group();
    cameraRig.add(camera);
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      cameraRig.rotation.y = yaw;
      camera.rotation.x = -0.06;
      camera.updateWorldMatrix(true, false);
      const cameraPosition = camera.getWorldPosition(new Vector3());
      for (const randomValue of [0, 0.5, 0.999]) {
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
          for (let vertex = 0; vertex < positions.count; vertex += 1) {
            const projected = new Vector3().fromBufferAttribute(positions, vertex)
              .applyMatrix4(bolt.matrixWorld).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(0.95);
            expect(Math.abs(projected.y)).toBeLessThan(0.95);
            expect(projected.z).toBeGreaterThan(-1);
            expect(projected.z).toBeLessThan(1);
          }
        }
        weather.dispose();
      }
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
    weather.update(1.85, 0.5, new Vector3());
    expect(bolt.visible).toBe(false);
    expect(bolt.geometry).toBe(geometry);
    expect(light.intensity).toBe(0);
    expect(thunder).not.toHaveBeenCalled();
    weather.update(2.05, 0.2, new Vector3());
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

  // Importance: 90/100. Repeat strokes must use the same channel and release it when the flash ends.
  it('dims between return strokes and waits for the next strike', () => {
    const scene = new Scene();
    const weather = new WeatherEffects(scene, () => 0.5);
    const camera = new Vector3();
    weather.setWeather('thunderstorm');
    weather.update(1.35, 1.35, camera);
    const bolt = scene.getObjectByName('weather-lightning-bolt-5');
    expectBolt(bolt);
    const geometry = bolt.geometry;
    weather.update(1.43, 0.08, camera);
    const dim = bolt.material.uniforms.intensity!.value as number;
    weather.update(1.52, 0.09, camera);
    expect(bolt.material.uniforms.intensity!.value).toBeGreaterThan(dim * 5);
    expect(bolt.geometry).toBe(geometry);
    weather.update(3.45, 1.93, camera);
    expect(bolt.visible).toBe(false);
    weather.update(3.56, 0.11, camera);
    expect(bolt.visible).toBe(true);
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

  it('renders the event flash without scaling its path and clears it after the reveal', async () => {
    const supplies = {
      clearEventPose: vi.fn(), resetEventPoseForFrame: vi.fn(), applyEventAmbientPose: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const weather = new WeatherEventAnimator(new Group(), supplies, undefined, undefined, 'thunderstorm');
    const reveal = weather.reveal('thunderstorm');
    weather.update(2.2, 2.2);
    const bolt = weather.worldRoot.getObjectByName('weather-lightning-flash');
    expectBolt(bolt);
    expect(bolt.visible).toBe(true);
    const light = weather.worldRoot.getObjectByName('weather-event-lightning-light') as DirectionalLight;
    expect(light.intensity).toBeGreaterThan(0);
    const geometry = bolt.geometry;
    const scale = bolt.scale.clone();
    weather.update(2.3, 0.1);
    expect(bolt.scale.equals(scale)).toBe(true);
    expect(bolt.geometry).toBe(geometry);
    weather.update(4, 1.7);
    await reveal;
    expect(bolt.visible).toBe(false);
    expect(light.intensity).toBe(0);
    const dispose = vi.spyOn(geometry, 'dispose');
    weather.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

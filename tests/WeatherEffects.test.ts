import {
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  Material,
  Object3D,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PRESENTATION_WEATHER_IDS } from '../src/weather/presentationWeather';
import { WeatherEffects } from '../src/world/WeatherEffects';

function layer(scene: Scene, name: string): Object3D {
  const object = scene.getObjectByName(name);
  if (object === undefined) throw new Error(`Expected ${name}`);
  return object;
}

function points(scene: Scene, name: string): Points<BufferGeometry, Material> {
  const object = layer(scene, name);
  if (!(object instanceof Points)) throw new Error(`Expected ${name} to be Points`);
  return object;
}

function resources(root: Object3D): ReadonlyArray<BufferGeometry | Material> {
  const owned = new Set<BufferGeometry | Material>();
  root.traverse((object) => {
    if (!(object instanceof Points) && !(object instanceof LineSegments)) return;
    owned.add(object.geometry);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) owned.add(material);
  });
  return [...owned];
}

describe('WeatherEffects', () => {
  it('adds one named root and applies every presentation weather profile', () => {
    const scene = new Scene();
    const effects = new WeatherEffects(scene);

    expect(scene.children.filter((child) => child.name === 'weather-effects-root')).toHaveLength(1);
    for (const id of PRESENTATION_WEATHER_IDS) {
      effects.setWeather(id);
      expect(effects.state.profile.id).toBe(id);
    }

    effects.dispose();
  });

  it('shows only the authored optional layers for each distinct weather behavior', () => {
    const scene = new Scene();
    const effects = new WeatherEffects(scene);
    const rain = layer(scene, 'weather-rain');
    const farRain = layer(scene, 'weather-rain-far');
    const mist = layer(scene, 'weather-mist');
    const impacts = layer(scene, 'weather-impacts');
    const spray = layer(scene, 'weather-spray');
    const lightning = layer(scene, 'weather-lightning');

    effects.setWeather('overcast');
    expect([rain.visible, farRain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, false, true, true, false],
    );

    effects.setWeather('squall');
    expect([rain.visible, farRain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, false, true, true, false],
    );

    effects.setWeather('rain');
    expect([rain.visible, farRain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [true, true, true, true, true, false],
    );

    effects.setWeather('wind');
    expect([rain.visible, farRain.visible, impacts.visible, mist.visible, lightning.visible]).toEqual(
      [false, false, false, true, false],
    );

    effects.setWeather('thunderstorm');
    expect([rain.visible, farRain.visible, impacts.visible, spray.visible]).toEqual(
      [true, true, true, true],
    );

    effects.setWeather('waves');
    expect([rain.visible, farRain.visible, impacts.visible, spray.visible]).toEqual(
      [false, false, false, true],
    );

    effects.setWeather('fog');
    expect([rain.visible, farRain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, false, true, false, false],
    );

    effects.setWeather('calm');
    expect([rain.visible, farRain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, false, false, false, false],
    );

    effects.dispose();
  });

  it('authors severe rain streaks, fog veils, and wind-driven horizontal spray', () => {
    const scene = new Scene();
    const effects = new WeatherEffects(scene);
    const rain = points(scene, 'weather-rain');
    const farRain = points(scene, 'weather-rain-far');
    const mist = points(scene, 'weather-mist');
    const spray = points(scene, 'weather-spray');
    const rainMaterial = rain.material as ShaderMaterial;
    const mistMaterial = mist.material as ShaderMaterial;
    const sprayMaterial = spray.material as ShaderMaterial;

    effects.setWeather('rain');
    const rainShape = rainMaterial.uniforms.particleShape!.value as Vector2;
    expect(rain.geometry.drawRange.count).toBeGreaterThanOrEqual(300);
    expect(rain.geometry.drawRange.count + farRain.geometry.drawRange.count)
      .toBeGreaterThanOrEqual(1_200);
    expect(rainMaterial.uniforms.pointSize!.value).toBeGreaterThan(0.25);
    expect(rainShape.x).toBeGreaterThan(rainShape.y * 4);

    effects.setWeather('fog');
    const fogShape = mistMaterial.uniforms.particleShape!.value as Vector2;
    expect(mist.visible).toBe(true);
    expect(mist.geometry.drawRange.count).toBe(120);
    expect(mistMaterial.uniforms.pointSize!.value).toBeGreaterThan(1);
    expect(fogShape.x).toBeLessThan(1);
    expect(fogShape.y).toBeLessThanOrEqual(1);

    effects.setWeather('wind');
    const windMistShape = mistMaterial.uniforms.particleShape!.value as Vector2;
    const windSprayShape = sprayMaterial.uniforms.particleShape!.value as Vector2;
    expect(mist.geometry.drawRange.count).toBe(120);
    expect(spray.geometry.drawRange.count).toBe(160);
    expect(windMistShape.y).toBeGreaterThan(windMistShape.x * 5);
    expect(windSprayShape.y).toBeGreaterThan(windSprayShape.x * 4);

    effects.dispose();
  });

  it('reuses deterministically seeded particle attributes while following the camera', () => {
    const firstScene = new Scene();
    const secondScene = new Scene();
    const first = new WeatherEffects(firstScene);
    const second = new WeatherEffects(secondScene);
    first.setWeather('thunderstorm');
    second.setWeather('thunderstorm');
    const firstRain = points(firstScene, 'weather-rain');
    const secondRain = points(secondScene, 'weather-rain');
    const position = firstRain.geometry.getAttribute('position') as BufferAttribute;
    const opacity = firstRain.geometry.getAttribute('opacity') as BufferAttribute;
    const seeded = Array.from(position.array);

    expect(Array.from(secondRain.geometry.getAttribute('position').array)).toEqual(seeded);

    first.update(4, 1 / 60, new Vector3(18, 7, -23));

    expect(firstRain.geometry.getAttribute('position')).toBe(position);
    expect(firstRain.geometry.getAttribute('opacity')).toBe(opacity);
    expect(Array.from(position.array)).not.toEqual(seeded);
    expect(layer(firstScene, 'weather-effects-root').position.toArray()).toEqual([18, 0, -23]);

    first.dispose();
    second.dispose();
  });

  it('renders the pooled opacity attribute as per-particle alpha', () => {
    const scene = new Scene();
    const effects = new WeatherEffects(scene);
    const material = points(scene, 'weather-rain').material;

    expect(material).toBeInstanceOf(ShaderMaterial);
    if (!(material instanceof ShaderMaterial)) throw new Error('Expected alpha-aware shader');
    expect(material.vertexShader).toContain('attribute float opacity');
    expect(material.vertexShader).toContain('vParticleOpacity = opacity');
    expect(material.fragmentShader).toContain('diffuseColor.a *= vParticleOpacity');

    effects.dispose();
  });

  it('consumes skipped lightning intervals instead of replaying them on later frames', () => {
    const scene = new Scene();
    const effects = new WeatherEffects(scene);
    effects.setWeather('thunderstorm');
    const lightning = layer(scene, 'weather-lightning-light');

    effects.update(20, 20, new Vector3());
    expect(lightning.visible).toBe(true);

    effects.update(20.01, 0.01, new Vector3());
    expect(lightning.visible).toBe(false);

    effects.dispose();
  });

  it('randomizes intermittent strikes and usually activates one prebuilt bolt', () => {
    const scene = new Scene();
    const strikeValues = [
      0.5, 0.1, 0.2, 0.3, 0.4, 0.5,
      0.5, 0.6, 0.7, 0.8, 0.9, 0.4,
    ];
    let strikeValueIndex = 0;
    const effects = new WeatherEffects(
      scene,
      () => strikeValues[strikeValueIndex++ % strikeValues.length]!,
    );
    effects.setWeather('thunderstorm');
    const bolts = Array.from(
      { length: 8 },
      (_, index) => layer(scene, `weather-lightning-bolt-${index + 1}`),
    );

    expect(bolts.every((bolt) => bolt instanceof LineSegments)).toBe(true);
    expect(bolts.every((bolt) => !bolt.visible)).toBe(true);
    for (const bolt of bolts) {
      if (!(bolt instanceof LineSegments)) throw new Error('Expected line-segment bolt');
      expect(bolt.geometry.getAttribute('position').count).toBeGreaterThan(100);
      const material = Array.isArray(bolt.material) ? bolt.material[0]! : bolt.material;
      expect(bolt.renderOrder).toBeLessThan(0);
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(false);
    }

    effects.update(1.35, 1.35, new Vector3());

    const firstStrike = bolts.filter((bolt) => bolt.visible);
    expect(firstStrike).toHaveLength(1);
    const firstPosition = firstStrike[0]!.position.toArray();

    effects.update(1.36, 0.01, new Vector3());
    expect(bolts.every((bolt) => !bolt.visible)).toBe(true);

    effects.update(6.16, 4.8, new Vector3());
    const secondStrike = bolts.filter((bolt) => bolt.visible);
    expect(secondStrike).toHaveLength(1);
    expect(secondStrike[0]!.position.toArray()).not.toEqual(firstPosition);

    effects.dispose();
  });

  it('disposes every owned resource exactly once', () => {
    const scene = new Scene();
    const effects = new WeatherEffects(scene);
    const root = layer(scene, 'weather-effects-root');
    const disposals = resources(root).map((resource) => vi.spyOn(resource, 'dispose'));

    effects.dispose();
    effects.dispose();

    expect(root.parent).toBeNull();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});

import {
  BufferAttribute,
  BufferGeometry,
  Material,
  Object3D,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PRESENTATION_WEATHER_IDS } from '../src/weather/presentationWeather';
import { WeatherEffects } from '../src/world/WeatherEffects';

class ReducedMotionQuery implements MediaQueryList {
  readonly media = '(prefers-reduced-motion: reduce)';
  readonly onchange = null;
  private listener: EventListenerOrEventListenerObject | null = null;

  constructor(readonly matches: boolean) {}

  addEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    this.listener = listener;
  }

  removeEventListener(
    _type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    if (this.listener === listener) this.listener = null;
  }

  addListener(_callback: ((this: MediaQueryList, event: MediaQueryListEvent) => void) | null): void {}
  removeListener(_callback: ((this: MediaQueryList, event: MediaQueryListEvent) => void) | null): void {}
  dispatchEvent(): boolean { return true; }
}

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
    if (!(object instanceof Points)) return;
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
    const mist = layer(scene, 'weather-mist');
    const impacts = layer(scene, 'weather-impacts');
    const spray = layer(scene, 'weather-spray');
    const lightning = layer(scene, 'weather-lightning');

    effects.setWeather('overcast');
    expect([rain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, true, true, false],
    );

    effects.setWeather('squall');
    expect([rain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, true, true, false],
    );

    effects.setWeather('rain');
    expect([rain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [true, true, true, true, false],
    );

    effects.setWeather('wind');
    expect([rain.visible, impacts.visible, mist.visible, lightning.visible]).toEqual(
      [false, false, true, false],
    );

    effects.setWeather('thunderstorm');
    expect([rain.visible, impacts.visible, spray.visible]).toEqual([true, true, true]);

    effects.setWeather('waves');
    expect([rain.visible, impacts.visible, spray.visible]).toEqual([false, false, true]);

    effects.setWeather('fog');
    expect([rain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, false, false, false],
    );

    effects.setWeather('calm');
    expect([rain.visible, impacts.visible, mist.visible, spray.visible, lightning.visible]).toEqual(
      [false, false, false, false, false],
    );

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
    const effects = new WeatherEffects(scene, new ReducedMotionQuery(false));
    effects.setWeather('thunderstorm');
    const lightning = layer(scene, 'weather-lightning-light');

    effects.update(20, 20, new Vector3());
    expect(lightning.visible).toBe(true);

    effects.update(20.01, 0.01, new Vector3());
    expect(lightning.visible).toBe(false);

    effects.dispose();
  });

  it('uses lower active particle counts and suppresses repeated lightning for reduced motion', () => {
    const standardScene = new Scene();
    const reducedScene = new Scene();
    const standard = new WeatherEffects(standardScene, new ReducedMotionQuery(false));
    const reduced = new WeatherEffects(reducedScene, new ReducedMotionQuery(true));
    standard.setWeather('thunderstorm');
    reduced.setWeather('thunderstorm');

    expect(points(reducedScene, 'weather-rain').geometry.drawRange.count).toBeLessThan(
      points(standardScene, 'weather-rain').geometry.drawRange.count,
    );

    let standardFlashed = false;
    let reducedFlashed = false;
    for (let step = 0; step < 240; step += 1) {
      const time = step * 0.1;
      standard.update(time, 0.1, new Vector3());
      reduced.update(time, 0.1, new Vector3());
      standardFlashed ||= layer(standardScene, 'weather-lightning-light').visible;
      reducedFlashed ||= layer(reducedScene, 'weather-lightning-light').visible;
    }
    expect(standardFlashed).toBe(true);
    expect(reducedFlashed).toBe(false);

    standard.dispose();
    reduced.dispose();
  });

  it('removes its listener and disposes every owned resource exactly once', () => {
    const scene = new Scene();
    const query = new ReducedMotionQuery(false);
    const removeListener = vi.spyOn(query, 'removeEventListener');
    const effects = new WeatherEffects(scene, query);
    const root = layer(scene, 'weather-effects-root');
    const disposals = resources(root).map((resource) => vi.spyOn(resource, 'dispose'));

    effects.dispose();
    effects.dispose();

    expect(root.parent).toBeNull();
    expect(removeListener).toHaveBeenCalledOnce();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});

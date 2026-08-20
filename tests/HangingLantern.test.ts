import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import type { BoatPose } from '../src/ocean/BoatBuoyancy';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import {
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_NIGHT_INTENSITY,
  HANGING_LANTERN_LINE_LENGTH,
  HANGING_LANTERN_MOUNT,
  HANGING_LANTERN_TIP,
  HANGING_LANTERN_MAX_SWING,
  createHangingLantern,
} from '../src/survival/HangingLantern';

const ZERO_POSE: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };

function swingMagnitude(lantern: ReturnType<typeof createHangingLantern>): number {
  const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
  return Math.hypot(pivot.rotation.x, pivot.rotation.z);
}

function simulateWeather(id: 'calm' | 'wind' | 'waves' | 'thunderstorm'): number {
  const lantern = createHangingLantern(lanternModel());
  const weather = presentationWeatherProfile(id);
  let peak = 0;
  for (let frame = 0; frame < 360; frame += 1) {
    lantern.update(ZERO_POSE, weather, frame / 60, 1 / 60);
    if (frame >= 120) peak = Math.max(peak, swingMagnitude(lantern));
  }
  lantern.dispose();
  return peak;
}

function lanternModel(): Group {
  const root = new Group();
  const mesh = new Mesh(
    new BoxGeometry(0.22, 0.48, 0.22),
    new MeshStandardMaterial({ color: 0x6c4b2d }),
  );
  mesh.position.y = 0.24;
  root.add(mesh);
  return root;
}

describe('hanging lantern', () => {
  it('mounts at the stern center and hangs below the pole tip', () => {
    const lantern = createHangingLantern(lanternModel());
    const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
    const model = lantern.root.getObjectByName('hanging-lantern:model')!;
    lantern.root.updateMatrixWorld(true);
    const pivotWorld = pivot.getWorldPosition(new Vector3());
    const modelBounds = new Box3().setFromObject(model);

    expect(lantern.root.position.toArray()).toEqual([
      HANGING_LANTERN_MOUNT.x,
      HANGING_LANTERN_MOUNT.y,
      HANGING_LANTERN_MOUNT.z,
    ]);
    expect(HANGING_LANTERN_MOUNT.x).toBe(0);
    expect(pivot.position.toArray()).toEqual([
      HANGING_LANTERN_TIP.x,
      HANGING_LANTERN_TIP.y,
      HANGING_LANTERN_TIP.z,
    ]);
    expect(pivotWorld.y - modelBounds.max.y).toBeCloseTo(HANGING_LANTERN_LINE_LENGTH, 5);
    expect(modelBounds.min.y).toBeGreaterThan(0.9);

    lantern.dispose();
  });

  it('builds a warm emissive model and shadow-casting point light', () => {
    const lantern = createHangingLantern(lanternModel());
    const model = lantern.root.getObjectByName('hanging-lantern:model')!;
    const mesh = model.children[0] as Mesh;
    const material = mesh.material as MeshStandardMaterial;

    expect(lantern.light).toBeInstanceOf(PointLight);
    expect(lantern.light.color.getHex()).toBe(0xffb261);
    expect(HANGING_LANTERN_DAY_INTENSITY).toBe(5.2);
    expect(HANGING_LANTERN_NIGHT_INTENSITY).toBe(7.2);
    expect(lantern.light.intensity).toBe(HANGING_LANTERN_DAY_INTENSITY);
    expect(lantern.light.distance).toBe(5);
    expect(lantern.light.castShadow).toBe(true);
    expect(lantern.light.shadow.camera.far).toBe(5);
    expect(lantern.light.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(material.emissive.getHex()).toBe(0xffc56a);
    expect(material.emissiveIntensity).toBe(1.35);

    lantern.dispose();
  });

  it('disposes owned render resources once', () => {
    const model = lanternModel();
    const modelMesh = model.children[0] as Mesh;
    const modelGeometryDispose = vi.spyOn(modelMesh.geometry, 'dispose');
    const modelMaterialDispose = vi.spyOn(modelMesh.material as MeshStandardMaterial, 'dispose');
    const lantern = createHangingLantern(model);
    const shadowDispose = vi.spyOn(lantern.light.shadow, 'dispose');

    lantern.dispose();
    lantern.dispose();

    expect(modelGeometryDispose).toHaveBeenCalledOnce();
    expect(modelMaterialDispose).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalledOnce();
    expect(lantern.root.children).toHaveLength(0);
  });

  it('uses weather strength to increase the continuous swing', () => {
    const calm = simulateWeather('calm');
    expect(calm).toBeGreaterThan(0.005);
    expect(simulateWeather('wind')).toBeGreaterThan(calm * 1.25);
    expect(simulateWeather('waves')).toBeGreaterThan(calm * 1.25);
    expect(simulateWeather('thunderstorm')).toBeGreaterThan(calm * 1.25);
  });

  it('reacts to boat pitch, roll, and drift changes', () => {
    const passive = createHangingLantern(lanternModel());
    const driven = createHangingLantern(lanternModel());
    const calm = presentationWeatherProfile('calm');
    passive.update(ZERO_POSE, calm, 0, 1 / 60);
    driven.update(ZERO_POSE, calm, 0, 1 / 60);
    passive.update(ZERO_POSE, calm, 1 / 60, 1 / 60);
    driven.update({ y: 0.08, pitch: 0.16, roll: -0.13, driftX: 0.18, driftZ: -0.16 }, calm, 1 / 60, 1 / 60);
    expect(swingMagnitude(driven)).toBeGreaterThan(swingMagnitude(passive));
    passive.dispose();
    driven.dispose();
  });

  it('caps large frame steps and the combined swing angle', () => {
    const lantern = createHangingLantern(lanternModel());
    const storm = presentationWeatherProfile('thunderstorm');
    for (let frame = 0; frame < 80; frame += 1) {
      const sign = frame % 2 === 0 ? 1 : -1;
      lantern.update({ y: sign, pitch: sign * 2, roll: -sign * 2, driftX: sign * 4, driftZ: -sign * 4 }, storm, frame, 1);
    }
    const magnitude = swingMagnitude(lantern);
    expect(Number.isFinite(magnitude)).toBe(true);
    expect(magnitude).toBeLessThanOrEqual(HANGING_LANTERN_MAX_SWING + 1e-8);
    lantern.dispose();
  });

  it('does not move after disposal', () => {
    const lantern = createHangingLantern(lanternModel());
    const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
    lantern.dispose();
    const before = pivot.rotation.toArray();
    lantern.update(ZERO_POSE, presentationWeatherProfile('waves'), 3, 0.1);
    expect(pivot.rotation.toArray()).toEqual(before);
  });
});

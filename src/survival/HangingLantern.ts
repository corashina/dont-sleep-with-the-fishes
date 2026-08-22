import {
  Box3,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  MathUtils,
  PointLight,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { BoatPose } from '../ocean/BoatBuoyancy';
import type { PresentationWeatherProfile } from '../weather/presentationWeather';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';

export const HANGING_LANTERN_DAY_INTENSITY = 0;
export const HANGING_LANTERN_NIGHT_INTENSITY = 15;
export const HANGING_LANTERN_LIGHT_DISTANCE = 6;
export const HANGING_LANTERN_LINE_LENGTH = 0.36;
export const HANGING_LANTERN_LINE_RADIUS = 0.003;
export const HANGING_LANTERN_MODEL_SCALE = 0.375;
export const HANGING_LANTERN_POLE_RADIUS = 0.0225;
export const HANGING_LANTERN_MOUNT = Object.freeze({ x: 0, y: 0.28, z: 2.35 });
export const HANGING_LANTERN_TIP = Object.freeze({ x: 0, y: 1.57, z: -1.7 });
export const HANGING_LANTERN_MAX_SWING = Math.PI / 9;

export interface HangingLantern {
  readonly root: Group;
  readonly light: PointLight;
  setNight(night: boolean): void;
  update(
    pose: Readonly<BoatPose>,
    weather: Readonly<PresentationWeatherProfile>,
    time: number,
    delta: number,
  ): void;
  dispose(): void;
}

export function createHangingLantern(
  model: Group,
  poleMaterialSource: MeshStandardMaterial,
): HangingLantern {
  const root = new Group();
  root.name = 'hanging-lantern';
  root.position.set(HANGING_LANTERN_MOUNT.x, HANGING_LANTERN_MOUNT.y, HANGING_LANTERN_MOUNT.z);

  const bindingMaterial = new MeshStandardMaterial({ color: 0x3d3027, roughness: 0.98, metalness: 0 });
  const poleMaterial = poleMaterialSource.clone();
  const mount = new Mesh(new CylinderGeometry(0.13, 0.16, 0.42, 8), poleMaterial);
  mount.name = 'hanging-lantern:mount';
  mount.position.y = 0.18;
  const bindingGeometry = new TorusGeometry(0.105, 0.016, 6, 8);
  const lowBinding = new Mesh(bindingGeometry, bindingMaterial);
  lowBinding.name = 'hanging-lantern:binding-low';
  lowBinding.position.y = 0.10;
  lowBinding.rotation.x = Math.PI / 2;
  const highBinding = new Mesh(bindingGeometry.clone(), bindingMaterial);
  highBinding.name = 'hanging-lantern:binding-high';
  highBinding.position.y = 0.29;
  highBinding.rotation.x = Math.PI / 2;

  const poleCurve = new CatmullRomCurve3([
    new Vector3(0, 0.08, 0),
    new Vector3(0, 0.72, -0.06),
    new Vector3(0, 1.22, -0.42),
    new Vector3(0, 1.49, -1.08),
    new Vector3(HANGING_LANTERN_TIP.x, HANGING_LANTERN_TIP.y, HANGING_LANTERN_TIP.z),
  ], false, 'centripetal');
  const pole = new Mesh(
    new TubeGeometry(poleCurve, 24, HANGING_LANTERN_POLE_RADIUS, 7, false),
    poleMaterial,
  );
  pole.name = 'hanging-lantern:pole';

  const pivot = new Group();
  pivot.name = 'hanging-lantern:swing-pivot';
  pivot.position.set(HANGING_LANTERN_TIP.x, HANGING_LANTERN_TIP.y, HANGING_LANTERN_TIP.z);
  const line = new Mesh(
    new CylinderGeometry(
      HANGING_LANTERN_LINE_RADIUS,
      HANGING_LANTERN_LINE_RADIUS,
      HANGING_LANTERN_LINE_LENGTH,
      6,
    ),
    poleMaterial,
  );
  line.name = 'hanging-lantern:line';
  line.position.y = -HANGING_LANTERN_LINE_LENGTH / 2;

  model.name = 'hanging-lantern:model';
  model.scale.setScalar(HANGING_LANTERN_MODEL_SCALE);
  const modelBounds = new Box3().setFromObject(model);
  const modelCenterY = (modelBounds.min.y + modelBounds.max.y) / 2;
  model.position.y = -HANGING_LANTERN_LINE_LENGTH - modelBounds.max.y;
  const glowingMaterials = new Set<MeshStandardMaterial>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      if (!(material instanceof MeshStandardMaterial)) return;
      glowingMaterials.add(material);
      material.emissive.setHex(0xffc56a);
      material.emissiveIntensity = 0;
      material.emissiveMap = material.map;
    });
  });

  const light = new PointLight(
    0xffb261,
    HANGING_LANTERN_DAY_INTENSITY,
    HANGING_LANTERN_LIGHT_DISTANCE,
    2,
  );
  light.name = 'hanging-lantern:light';
  light.position.y = model.position.y + modelCenterY;
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.08;
  light.shadow.camera.far = HANGING_LANTERN_LIGHT_DISTANCE;
  light.shadow.bias = -0.001;
  light.shadow.normalBias = 0.025;
  light.shadow.camera.updateProjectionMatrix();

  root.add(mount, lowBinding, highBinding, pole, pivot);
  pivot.add(line, model, light);
  [mount, lowBinding, highBinding, pole, line].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(root, geometries, materials);
  let disposed = false;
  const MAX_PROCESSED_DELTA = 0.1;
  const MAX_STEP = 1 / 120;
  const GRAVITY_OVER_LENGTH = 9.81 / 0.68;
  const DAMPING = 1.75;
  const MAX_BOAT_DRIVE = 4.5;
  let angleX = 0;
  let angleZ = 0;
  let velocityX = 0;
  let velocityZ = 0;
  let previousPitch = 0;
  let previousRoll = 0;
  let previousDriftX = 0;
  let previousDriftZ = 0;
  let hasPreviousPose = false;
  let nightLit = false;
  const swingPivot = pivot;
  return {
    root,
    light,
    setNight: (night) => {
      if (disposed || nightLit === night) return;
      nightLit = night;
      light.intensity = night
        ? HANGING_LANTERN_NIGHT_INTENSITY
        : HANGING_LANTERN_DAY_INTENSITY;
      glowingMaterials.forEach((material) => {
        material.emissiveIntensity = night ? 1.35 : 0;
      });
    },
    update: (pose, weather, time, delta) => {
      if (disposed) return;
      const processedDelta = Math.min(MAX_PROCESSED_DELTA, Math.max(0, delta));
      if (processedDelta === 0) return;

      let driveX = 0;
      let driveZ = 0;
      if (hasPreviousPose) {
        driveX = MathUtils.clamp(
          -(pose.pitch - previousPitch) * 1.2 / processedDelta
            -(pose.driftZ - previousDriftZ) * 0.7 / processedDelta,
          -MAX_BOAT_DRIVE,
          MAX_BOAT_DRIVE,
        );
        driveZ = MathUtils.clamp(
          (pose.roll - previousRoll) * 1.2 / processedDelta
            +(pose.driftX - previousDriftX) * 0.7 / processedDelta,
          -MAX_BOAT_DRIVE,
          MAX_BOAT_DRIVE,
        );
      }
      previousPitch = pose.pitch;
      previousRoll = pose.roll;
      previousDriftX = pose.driftX;
      previousDriftZ = pose.driftZ;
      hasPreviousPose = true;

      const weatherForce = 0.32
        + weather.waveScale * 0.38
        + weather.sprayIntensity * 0.52;
      driveX += (
        Math.sin(time * 0.83)
        + Math.sin(time * 1.93 + 0.6) * 0.45
      ) * weatherForce;
      driveZ += (
        Math.sin(time * 0.71 + 1.8)
        + Math.sin(time * 2.17 + 0.2) * 0.35
      ) * weatherForce;

      const stepCount = Math.ceil(processedDelta / MAX_STEP);
      const step = processedDelta / stepCount;
      for (let index = 0; index < stepCount; index += 1) {
        const accelerationX = -GRAVITY_OVER_LENGTH * Math.sin(angleX)
          - DAMPING * velocityX
          + driveX;
        const accelerationZ = -GRAVITY_OVER_LENGTH * Math.sin(angleZ)
          - DAMPING * velocityZ
          + driveZ;
        velocityX += accelerationX * step;
        velocityZ += accelerationZ * step;
        angleX += velocityX * step;
        angleZ += velocityZ * step;

        const magnitude = Math.hypot(angleX, angleZ);
        if (magnitude <= HANGING_LANTERN_MAX_SWING) continue;
        const scale = HANGING_LANTERN_MAX_SWING / magnitude;
        angleX *= scale;
        angleZ *= scale;
        const outwardVelocity = (
          angleX * velocityX + angleZ * velocityZ
        ) / (HANGING_LANTERN_MAX_SWING ** 2);
        if (outwardVelocity > 0) {
          velocityX -= outwardVelocity * angleX;
          velocityZ -= outwardVelocity * angleZ;
        }
      }
      swingPivot.rotation.set(angleX, 0, angleZ);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runCleanupSteps([
        () => light.shadow.dispose(),
        () => disposeResourceSets(geometries, materials),
        () => root.clear(),
      ]);
    },
  };
}

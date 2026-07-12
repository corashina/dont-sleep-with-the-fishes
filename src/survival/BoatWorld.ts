import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
} from '../game/ItemState';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { createWaterExclusion } from '../ocean/WaterExclusion';
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import { boatStorageTransform } from '../world/BoatStorage';
import { createLifeboat } from '../world/Lifeboat';
import { createProp } from '../world/PropFactory';
import {
  ACTION_FOR_ITEM,
  projectBoatAnchor,
  type BoatInteractionAnchor,
} from './BoatInteraction';
import type {
  DayActionId,
  PresentationCue,
  SurvivalSnapshot,
  WeatherId,
} from './survivalTypes';

export interface SurvivalLighting {
  ambient: number;
  key: number;
  fogDensity: number;
}

export const WEATHER_IDS = ['calm', 'overcast', 'squall'] as const satisfies readonly WeatherId[];

export function clampParallax(
  x: number,
  y: number,
  reducedMotion: boolean,
): { yaw: number; pitch: number } {
  if (reducedMotion) return { yaw: 0, pitch: 0 };
  return {
    yaw: Math.min(0.045, Math.max(-0.045, x * 0.045)),
    pitch: Math.min(0.025, Math.max(-0.025, y * 0.025)),
  };
}

export function survivalLighting(weather: WeatherId, phase: 'day' | 'night'): SurvivalLighting {
  if (phase === 'night') {
    return {
      ambient: weather === 'squall' ? 0.18 : 0.28,
      key: 0.22,
      fogDensity: weather === 'squall' ? 0.032 : 0.022,
    };
  }
  if (weather === 'calm') return { ambient: 1.1, key: 2.2, fogDensity: 0.012 };
  if (weather === 'squall') return { ambient: 0.48, key: 0.7, fogDensity: 0.028 };
  return { ambient: 0.72, key: 1.15, fogDensity: 0.018 };
}

const CUE_DURATION: Readonly<Record<PresentationCue, number>> = {
  none: 0,
  fish: 1.2,
  dive: 1.4,
  repair: 0.9,
  treat: 0.8,
  rest: 0.8,
  storm: 1.2,
  impact: 0.8,
  darkness: 1,
  sighting: 1.2,
  nightfall: 1.1,
  dawn: 1.1,
  rescue: 1.5,
  death: 1.5,
  sinking: 1.5,
};

interface ActiveSequence {
  cue: PresentationCue;
  elapsed: number;
  duration: number;
  resolve: () => void;
}

interface SavedProp {
  instance: ItemInstance;
  prop: Object3D;
}

interface FixedAnchor {
  id: string;
  action: DayActionId;
  target: Object3D;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const easeOut = (value: number): number => 1 - (1 - value) ** 3;

function collectResources(
  root: Object3D,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
}

function setPropDepleted(root: Object3D, depleted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const original = material.userData.originalColor as number | undefined
      ?? material.color.getHex();
    material.userData.originalColor = original;
    material.color.setHex(original);
    if (depleted) material.color.lerp(new Color(0x4f5756), 0.65);
  });
  root.userData.depleted = depleted;
}

export class BoatWorld {
  readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly reducedMotion: MediaQueryList;
  private readonly ocean: OceanRenderer;
  private readonly motionRig = new Group();
  private readonly cameraRig = new Group();
  private readonly boat: Group;
  private readonly ambient = new AmbientLight(0xc4d1cf, 1.1);
  private readonly key = new DirectionalLight(0xffe1b5, 2.2);
  private readonly distantVessel = new Group();
  private readonly vesselMaterial = new MeshStandardMaterial({
    color: 0x172126,
    roughness: 1,
    transparent: true,
    opacity: 0,
  });
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly originalCameraParent: Object3D | null;
  private readonly originalCameraPosition: Vector3;
  private readonly originalCameraQuaternion: Quaternion;
  private readonly baseCameraQuaternion: Quaternion;
  private readonly savedProps: SavedProp[] = [];
  private readonly savedPropByInstanceId = new Map<ItemInstance['instanceId'], Object3D>();
  private readonly fixedAnchors: FixedAnchor[] = [];
  private readonly rod: Object3D | undefined;
  private readonly line: Object3D | undefined;
  private readonly catchMesh: Object3D | undefined;
  private readonly baseRodRotationZ: number;
  private readonly worldCameraPosition = new Vector3();
  private weather: WeatherId = 'calm';
  private phase: 'day' | 'night' = 'day';
  private pointerX = 0;
  private pointerY = 0;
  private smoothedY = 0;
  private smoothedPitch = 0;
  private smoothedRoll = 0;
  private activeSequence: ActiveSequence | null = null;
  private settledCue: PresentationCue | null = null;
  private disposed = false;

  constructor(
    camera: PerspectiveCamera,
    reducedMotion: MediaQueryList,
    savedItems: readonly ItemInstance[] = [],
  ) {
    this.scene = new Scene();
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.originalCameraParent = camera.parent;
    this.originalCameraPosition = camera.position.clone();
    this.originalCameraQuaternion = camera.quaternion.clone();

    const build = createLifeboat();
    this.boat = build.root;
    savedItems.forEach((instance, index) => {
      const prop = createProp(instance);
      const transform = boatStorageTransform(index);
      prop.position.copy(transform.position);
      prop.rotation.copy(transform.rotation);
      prop.scale.setScalar(transform.scale);
      build.storageRoot.add(prop);
      this.savedProps.push({ instance, prop });
      this.savedPropByInstanceId.set(instance.instanceId, prop);
    });

    const repairPatch = this.boat.getObjectByName('damaged-plank-patch');
    if (repairPatch !== undefined) {
      this.fixedAnchors.push({ id: 'repair-patch', action: 'repair', target: repairPatch });
    }
    const horizon = new Object3D();
    horizon.name = 'horizon-anchor';
    horizon.position.set(0, 1.15, -12);
    this.boat.add(horizon);
    this.fixedAnchors.push({ id: 'horizon', action: 'endDay', target: horizon });

    this.motionRig.name = 'boat-motion-rig';
    this.cameraRig.name = 'boat-camera-rig';
    this.motionRig.add(this.boat, this.cameraRig);
    this.cameraRig.add(camera);
    camera.position.set(0, 0.65, 1.55);
    camera.lookAt(0, 0.08, -2.7);
    this.baseCameraQuaternion = camera.quaternion.clone();

    const rodInstance = savedItems.find(({ type }) => type === 'fishingRod');
    this.rod = rodInstance === undefined
      ? undefined
      : this.savedPropByInstanceId.get(rodInstance.instanceId);
    this.line = this.boat.getObjectByName('fishing-line');
    this.catchMesh = this.boat.getObjectByName('fishing-catch');
    this.baseRodRotationZ = this.rod?.rotation.z ?? 0;

    this.ocean = new OceanRenderer();
    this.key.position.set(-5, 8, 4);
    this.key.target.position.set(0, 0, -3);
    this.key.castShadow = true;

    this.buildDistantVessel();
    this.scene.add(
      this.motionRig,
      this.ocean.mesh,
      this.ambient,
      this.key,
      this.key.target,
      this.distantVessel,
    );
    collectResources(this.boat, this.ownedGeometries, this.ownedMaterials);
    collectResources(this.distantVessel, this.ownedGeometries, this.ownedMaterials);
    this.applyBasePresentation();
  }

  setPointer(normalizedX: number, normalizedY: number): void {
    if (this.disposed) return;
    this.pointerX = clamp(normalizedX, -1, 1);
    this.pointerY = clamp(normalizedY, -1, 1);
  }

  setPhase(phase: 'day' | 'night'): void {
    if (this.disposed) return;
    this.phase = phase;
    this.applyBaseLighting();
  }

  setWeather(weather: WeatherId): void {
    if (this.disposed) return;
    this.weather = weather;
    this.applyBaseLighting();
  }

  syncInventory(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    const syncedTypes = new Set<ItemId>();
    this.savedProps.forEach(({ instance }) => {
      if (syncedTypes.has(instance.type)) return;
      syncedTypes.add(instance.type);
      this.syncType(instance.type, snapshot);
    });
  }

  projectInteractionAnchors(width: number, height: number): BoatInteractionAnchor[] {
    if (this.disposed || width <= 0 || height <= 0) return [];
    this.scene.updateMatrixWorld(true);

    const itemAnchors = this.savedProps.map(({ instance, prop }) => {
      const projected = projectBoatAnchor(
        prop.getWorldPosition(new Vector3()),
        this.camera,
        width,
        height,
      );
      return {
        id: instance.instanceId,
        itemType: instance.type,
        action: ACTION_FOR_ITEM[instance.type] ?? null,
        ...projected,
        visible: prop.visible && projected.visible,
        depleted: prop.userData.depleted === true,
      } satisfies BoatInteractionAnchor;
    });
    const fixedAnchors = this.fixedAnchors.map(({ id, action, target }) => ({
      id,
      itemType: null,
      action,
      ...projectBoatAnchor(
        target.getWorldPosition(new Vector3()),
        this.camera,
        width,
        height,
      ),
      depleted: false,
    } satisfies BoatInteractionAnchor));
    return [...itemAnchors, ...fixedAnchors];
  }

  play(cue: PresentationCue): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelActiveSequence();
    this.settledCue = null;
    this.applyBasePresentation();
    const duration = CUE_DURATION[cue];
    if (duration === 0) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.activeSequence = { cue, duration, elapsed: 0, resolve };
      this.applyCue(cue, 0, 0);
    });
  }

  presentationCueForTest(): PresentationCue | null { return this.settledCue; }

  skipSequence(): void {
    if (!this.activeSequence) return;
    const sequence = this.activeSequence;
    this.activeSequence = null;
    this.settledCue = this.isTerminalCue(sequence.cue) ? sequence.cue : null;
    this.applyBasePresentation();
    this.applyCue(sequence.cue, 1, sequence.duration);
    sequence.resolve();
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta <= 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const amplitudeScale = this.weather === 'squall' ? 1.35 : this.weather === 'overcast' ? 1 : 0.78;
    const sample = sampleWaveField(DEFAULT_WAVES, time, 0, 0, amplitudeScale);
    const reduced = this.reducedMotion.matches;
    const targetY = sample.height * 0.62;
    const targetPitch = clamp(Math.atan2(sample.normal.z, sample.normal.y), -0.11, 0.11);
    const targetRoll = clamp(-Math.atan2(sample.normal.x, sample.normal.y), -0.13, 0.13);
    const response = 1 - Math.exp(-Math.min(delta, 0.1) * 4.5);
    if (reduced) {
      this.smoothedY = 0;
      this.smoothedPitch = 0;
      this.smoothedRoll = 0;
    } else {
      this.smoothedY += (targetY - this.smoothedY) * response;
      this.smoothedPitch += (targetPitch - this.smoothedPitch) * response;
      this.smoothedRoll += (targetRoll - this.smoothedRoll) * response;
    }

    this.applyBasePresentation();
    if (this.settledCue) this.applyCue(this.settledCue, 1, time);

    const sequence = this.activeSequence;
    if (sequence) {
      sequence.elapsed = Math.min(sequence.duration, sequence.elapsed + delta);
      const progress = sequence.elapsed / sequence.duration;
      this.applyCue(sequence.cue, progress, sequence.elapsed);
      if (progress >= 1) {
        this.activeSequence = null;
        this.settledCue = this.isTerminalCue(sequence.cue) ? sequence.cue : null;
        sequence.resolve();
      }
    }

    const fog = this.scene.fog as FogExp2;
    this.ocean.update(time, amplitudeScale, fog.density);
    this.scene.updateMatrixWorld(true);
    this.ocean.setExclusions([createWaterExclusion(this.boat, 1.02, 2.28)]);
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.ocean.follow(this.worldCameraPosition.x, this.worldCameraPosition.z);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActiveSequence();
    this.ocean.dispose();
    this.scene.remove(
      this.motionRig,
      this.ocean.mesh,
      this.ambient,
      this.key,
      this.key.target,
      this.distantVessel,
    );
    this.camera.removeFromParent();
    this.camera.position.copy(this.originalCameraPosition);
    this.camera.quaternion.copy(this.originalCameraQuaternion);
    this.originalCameraParent?.add(this.camera);
    this.ownedGeometries.forEach((geometry) => geometry.dispose());
    this.ownedMaterials.forEach((material) => material.dispose());
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
  }

  private buildDistantVessel(): void {
    this.distantVessel.name = 'distant-rescue-vessel';
    this.distantVessel.position.set(-9, 1.25, -48);
    const hull = new Mesh(new BoxGeometry(8.5, 1.05, 1.2), this.vesselMaterial);
    const cabin = new Mesh(new BoxGeometry(2.2, 1.15, 0.86), this.vesselMaterial);
    const mast = new Mesh(new BoxGeometry(0.12, 3.2, 0.12), this.vesselMaterial);
    cabin.position.set(1.2, 0.85, 0);
    mast.position.set(-0.7, 1.75, 0);
    this.distantVessel.add(hull, cabin, mast);
    this.distantVessel.visible = false;
  }

  private remainingUses(type: ItemId, snapshot: SurvivalSnapshot): number | null {
    if (type === 'cannedFood') return snapshot.food;
    if (type === 'baitTin') return snapshot.bait;
    return snapshot.inventory[type].charges;
  }

  private syncType(type: ItemId, snapshot: SurvivalSnapshot): void {
    const instances = this.savedProps.filter((entry) => entry.instance.type === type);
    const remaining = this.remainingUses(type, snapshot);
    if (remaining === null) return;
    const perInstance = ITEM_DEFINITIONS[type].charges ?? 1;
    const activeCount = Math.ceil(remaining / perInstance);
    instances.forEach(({ prop }, index) => {
      prop.visible = type !== 'cannedFood' || index < activeCount;
      setPropDepleted(prop, index >= activeCount);
    });
  }

  private applyBasePresentation(): void {
    this.applyBaseLighting();
    this.motionRig.position.set(0, 0.22 + this.smoothedY, 0);
    this.motionRig.rotation.set(this.smoothedPitch, 0, this.smoothedRoll);
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.rotation.set(0, 0, 0);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
    const parallax = clampParallax(this.pointerX, this.pointerY, this.reducedMotion.matches);
    this.camera.rotateY(parallax.yaw);
    this.camera.rotateX(parallax.pitch);
    if (this.rod) this.rod.rotation.z = this.baseRodRotationZ;
    if (this.line) this.line.visible = false;
    if (this.catchMesh) this.catchMesh.visible = false;
    this.distantVessel.visible = false;
    this.vesselMaterial.opacity = 0;
  }

  private applyBaseLighting(): void {
    const lighting = survivalLighting(this.weather, this.phase);
    this.ambient.intensity = lighting.ambient;
    this.key.intensity = lighting.key;
    const fogColor = this.phase === 'night'
      ? new Color(0x101922)
      : new Color(this.weather === 'squall' ? 0x27343b : 0x59777c);
    this.scene.background = fogColor.clone();
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(fogColor);
      this.scene.fog.density = lighting.fogDensity;
    } else {
      this.scene.fog = new FogExp2(fogColor, lighting.fogDensity);
    }
  }

  private applyCue(cue: PresentationCue, progress: number, elapsed: number): void {
    const eased = easeOut(clamp(progress, 0, 1));
    const pulse = Math.sin(Math.PI * clamp(progress, 0, 1));
    const reduced = this.reducedMotion.matches;
    switch (cue) {
      case 'none':
        break;
      case 'fish':
        if (this.rod) {
          this.rod.rotation.z = this.baseRodRotationZ - eased * 0.82;
          if (this.line) this.line.visible = progress > 0.12;
          if (this.catchMesh) this.catchMesh.visible = progress > 0.42;
        }
        break;
      case 'dive':
        if (!reduced) this.cameraRig.position.y -= pulse * 0.72;
        (this.scene.fog as FogExp2).density += pulse * 0.035;
        (this.scene.background as Color).lerp(new Color(0x0d5063), pulse * 0.8);
        break;
      case 'repair':
        if (!reduced) {
          this.camera.rotateY(-0.18 * eased);
          this.camera.rotateX(-0.035 * eased);
        }
        this.key.intensity *= 1 + pulse * 0.18;
        break;
      case 'treat':
        this.ambient.intensity *= 1 + pulse * 0.12;
        break;
      case 'rest':
        this.ambient.intensity *= 1 - eased * 0.2;
        break;
      case 'storm':
        if (!reduced) {
          this.motionRig.rotation.x += Math.sin(elapsed * 18) * 0.025 * (1 - progress);
          this.motionRig.rotation.z += Math.sin(elapsed * 23) * 0.035 * (1 - progress);
        }
        break;
      case 'impact':
        if (!reduced) {
          this.motionRig.rotation.x += pulse * 0.075;
          this.cameraRig.position.z -= pulse * 0.08;
        }
        break;
      case 'darkness':
        this.ambient.intensity *= 1 - eased * 0.68;
        this.key.intensity *= 1 - eased * 0.72;
        break;
      case 'sighting':
        this.distantVessel.visible = progress > 0.08;
        this.vesselMaterial.opacity = 0.16 + eased * 0.38;
        break;
      case 'nightfall':
        this.ambient.intensity *= 1 - eased * 0.72;
        this.key.intensity *= 1 - eased * 0.78;
        break;
      case 'dawn':
        this.ambient.intensity *= 0.35 + eased * 0.65;
        this.key.intensity *= 0.3 + eased * 0.7;
        break;
      case 'rescue':
        this.distantVessel.visible = true;
        this.vesselMaterial.opacity = 0.25 + eased * 0.75;
        if (!reduced) this.camera.rotateY(-0.12 * eased);
        break;
      case 'death':
        this.ambient.intensity *= 1 - eased * 0.88;
        this.key.intensity *= 1 - eased * 0.9;
        break;
      case 'sinking':
        if (!reduced) this.motionRig.position.y -= eased * 1.05;
        this.ambient.intensity *= 1 - eased * 0.72;
        this.key.intensity *= 1 - eased * 0.8;
        (this.scene.fog as FogExp2).density += eased * 0.02;
        break;
    }
  }

  private cancelActiveSequence(): void {
    const sequence = this.activeSequence;
    this.activeSequence = null;
    sequence?.resolve();
  }

  private isTerminalCue(cue: PresentationCue): boolean {
    return cue === 'rescue' || cue === 'death' || cue === 'sinking';
  }
}

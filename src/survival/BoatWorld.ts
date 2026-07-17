import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Euler,
  FogExp2,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
} from '../game/ItemState';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { createWaterExclusion } from '../ocean/WaterExclusion';
import { boatStorageTransform } from '../world/BoatStorage';
import { createLifeboat, type LifeboatBuild } from '../world/Lifeboat';
import { createProp } from '../world/PropFactory';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';
import { Skybox } from '../world/Skybox';
import type { SkyPalette } from '../world/skyPalette';
import {
  ACTION_FOR_ITEM,
  projectBoatBounds,
  type BoatInteractionAnchor,
} from './BoatInteraction';
import {
  BoatDriftMotion,
  NEUTRAL_BOAT_DRIFT_FRAME,
  sampleBoatWaveHeights,
  weatherAmplitudeScale,
  type BoatDriftFrame,
} from './BoatDriftMotion';
import { BoatSpray } from './BoatSpray';
import type {
  PresentationCue,
  SurvivalSnapshot,
  WeatherId,
} from './survivalTypes';

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

const CUE_DURATION: Readonly<Record<PresentationCue, number>> = {
  none: 0,
  fish: 1.2,
  dive: 1.4,
  repair: 0.9,
  treat: 0.8,
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

const DIVE_SKY_TINT = new Color(0x0d5063);

interface ActiveSequence {
  cue: PresentationCue;
  elapsed: number;
  duration: number;
  resolve: () => void;
}

interface SavedProp {
  instance: ItemInstance;
  prop: Object3D;
  materials: readonly ConditionMaterialBinding[];
}

interface ConditionMaterialBinding {
  readonly mesh: Mesh;
  readonly usable: Material | Material[];
  readonly broken: Material | Material[];
}

interface InteractionHighlightState {
  emissive: number;
  emissiveIntensity: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const easeOut = (value: number): number => 1 - (1 - value) ** 3;

function brokenMaterial(material: Material): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(new Color(0x384243), 0.68);
    clone.roughness = Math.max(0.82, clone.roughness);
    clone.metalness *= 0.45;
  }
  return clone;
}

function setPropHighlighted(root: Object3D, highlighted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const state = material.userData.interactionHighlight as InteractionHighlightState | undefined;
    if (state === undefined) {
      material.userData.interactionHighlight = {
        emissive: material.emissive.getHex(),
        emissiveIntensity: material.emissiveIntensity,
      } satisfies InteractionHighlightState;
    }
    const original = material.userData.interactionHighlight as InteractionHighlightState;
    if (highlighted) {
      material.emissive.setHex(0x6f4218);
      material.emissiveIntensity = Math.max(.65, original.emissiveIntensity);
    } else {
      material.emissive.setHex(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;
    }
  });
}

export class BoatWorld {
  readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly reducedMotion: MediaQueryList;
  private readonly ocean: OceanRenderer;
  private readonly sky: Skybox;
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
  private readonly ownedTextures = new Set<Texture>();
  private readonly oceanAtmosphere = {
    fogColor: new Color(),
    horizonColor: new Color(),
    skyColor: new Color(),
    sunColor: new Color(0xfff1cf),
    sunVisibility: 1,
  };
  private readonly waterExclusion: LifeboatBuild['waterExclusion'];
  private readonly originalCameraParent: Object3D | null;
  private readonly originalCameraPosition: Vector3;
  private readonly originalCameraQuaternion: Quaternion;
  private readonly baseCameraQuaternion: Quaternion;
  private readonly savedProps: SavedProp[] = [];
  private readonly savedPropByInstanceId = new Map<ItemInstance['instanceId'], Object3D>();
  private readonly repairTools: Object3D;
  private readonly repairToolsBounds = new Box3();
  private readonly rod: Object3D | undefined;
  private readonly line: Object3D | undefined;
  private readonly catchMesh: Object3D | undefined;
  private readonly baseRodRotationZ: number;
  private readonly drift = new BoatDriftMotion();
  private readonly spray = new BoatSpray();
  private readonly bowAnchor = new Object3D();
  private readonly bowWorldPosition = new Vector3();
  private readonly baseLineRotation: Euler | undefined;
  private readonly worldCameraPosition = new Vector3();
  private weather: WeatherId = 'calm';
  private phase: 'day' | 'night' = 'day';
  private pointerX = 0;
  private pointerY = 0;
  private driftFrame: BoatDriftFrame = NEUTRAL_BOAT_DRIFT_FRAME;
  private sprayCooldown = 0;
  private activeSequence: ActiveSequence | null = null;
  private settledCue: PresentationCue | null = null;
  private highlightedItemId: string | null = null;
  private disposed = false;

  constructor(
    camera: PerspectiveCamera,
    reducedMotion: MediaQueryList,
    propModels: PropModelLibrary,
    moonTexture: Texture,
    savedItems: readonly ItemInstance[] = [],
  ) {
    this.scene = new Scene();
    this.sky = new Skybox(
      this.scene,
      { weather: 'calm', phase: 'day', severity: 0 },
      moonTexture,
    );
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.originalCameraParent = camera.parent;
    this.originalCameraPosition = camera.position.clone();
    this.originalCameraQuaternion = camera.quaternion.clone();

    const build = createLifeboat();
    this.boat = build.root;
    this.waterExclusion = build.waterExclusion;
    build.textures.forEach((texture) => this.ownedTextures.add(texture));
    savedItems.forEach((instance) => {
      const prop = createProp(propModels, instance);
      const materials: ConditionMaterialBinding[] = [];
      prop.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const usable = object.material;
        const broken = Array.isArray(usable)
          ? usable.map((material) => brokenMaterial(material))
          : brokenMaterial(usable);
        const brokenList = Array.isArray(broken) ? broken : [broken];
        brokenList.forEach((material) => this.ownedMaterials.add(material));
        materials.push({ mesh: object, usable, broken });
      });
      const transform = boatStorageTransform(instance);
      prop.position.copy(transform.position);
      prop.rotation.copy(transform.rotation);
      prop.scale.setScalar(transform.scale);
      build.storageRoot.add(prop);
      this.savedProps.push({ instance, prop, materials });
      this.savedPropByInstanceId.set(instance.instanceId, prop);
      prop.userData.remainingUses = ITEM_DEFINITIONS[instance.type].charges;
      prop.userData.condition = 'usable';
    });

    const repairTools = this.boat.getObjectByName('hull-repair-tools');
    if (repairTools === undefined) throw new Error('Lifeboat requires hull repair tools');
    this.repairTools = repairTools;

    this.motionRig.name = 'boat-motion-rig';
    this.cameraRig.name = 'boat-camera-rig';
    this.motionRig.add(this.boat, this.cameraRig);
    this.cameraRig.add(camera);
    camera.position.set(0, 0.88, 2.35);
    camera.lookAt(0, -0.18, -1.35);
    this.baseCameraQuaternion = camera.quaternion.clone();

    const rodInstance = savedItems.find(({ type }) => type === 'fishingRod');
    this.rod = rodInstance === undefined
      ? undefined
      : this.savedPropByInstanceId.get(rodInstance.instanceId);
    this.line = this.boat.getObjectByName('fishing-line');
    this.catchMesh = this.boat.getObjectByName('fishing-catch');
    this.baseLineRotation = this.line?.rotation.clone();
    this.baseRodRotationZ = this.rod?.rotation.z ?? 0;

    this.bowAnchor.name = 'survival-bow-motion-anchor';
    this.bowAnchor.position.set(0, 0.1, -2.75);
    this.boat.add(this.bowAnchor);

    this.ocean = new OceanRenderer();
    this.key.position.set(-5, 8, 4);
    this.key.target.position.set(0, 0, -3);
    this.key.castShadow = true;

    this.buildDistantVessel();
    this.scene.add(
      this.motionRig,
      this.ocean.mesh,
      this.spray.points,
      this.ambient,
      this.key,
      this.key.target,
      this.distantVessel,
    );
    collectMeshResources(this.boat, this.ownedGeometries, this.ownedMaterials);
    collectMeshResources(this.distantVessel, this.ownedGeometries, this.ownedMaterials);
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
  }

  setWeather(weather: WeatherId): void {
    if (this.disposed) return;
    this.weather = weather;
  }

  syncInventory(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.savedProps.forEach(({ instance, prop, materials }) => {
      const condition = snapshot.inventory[instance.instanceId]?.condition ?? 'lost';
      const visible = condition === 'usable' || condition === 'broken';
      prop.visible = visible;
      prop.userData.condition = condition;
      prop.userData.depleted = false;
      prop.userData.remainingUses = condition === 'usable'
        ? ITEM_DEFINITIONS[instance.type].charges
        : 0;
      materials.forEach(({ mesh, usable, broken }) => {
        mesh.material = condition === 'broken' ? broken : usable;
      });
    });
    if (this.highlightedItemId !== null) {
      const highlighted = this.savedPropByInstanceId.get(this.highlightedItemId as ItemInstance['instanceId']);
      if (highlighted === undefined || !highlighted.visible) this.setHighlightedItem(null);
    }
  }

  setHighlightedItem(instanceId: string | null): void {
    if (this.disposed || instanceId === this.highlightedItemId) return;
    if (this.highlightedItemId !== null) {
      const previous = this.savedPropByInstanceId.get(this.highlightedItemId as ItemInstance['instanceId']);
      if (previous !== undefined) setPropHighlighted(previous, false);
    }
    this.highlightedItemId = null;
    if (instanceId === null) return;
    const next = this.savedPropByInstanceId.get(instanceId as ItemInstance['instanceId']);
    if (next === undefined || !next.visible) return;
    setPropHighlighted(next, true);
    this.highlightedItemId = instanceId;
  }

  projectInteractionAnchors(width: number, height: number): BoatInteractionAnchor[] {
    if (this.disposed || width <= 0 || height <= 0) return [];
    this.scene.updateMatrixWorld(true);

    const itemAnchors = this.savedProps.map(({ instance, prop }) => {
      const projection = projectBoatBounds(
        new Box3().setFromObject(prop, true),
        this.camera,
        width,
        height,
      );
      const { width: hitWidth, height: hitHeight, depth, ...point } = projection;
      return {
        id: instance.instanceId,
        itemType: instance.type,
        action: prop.userData.condition === 'usable' ? ACTION_FOR_ITEM[instance.type] ?? null : null,
        ...point,
        visible: prop.visible && point.visible,
        depleted: false,
        remainingUses: prop.userData.remainingUses as number | null,
        hitArea: { width: hitWidth, height: hitHeight, depth },
      } satisfies BoatInteractionAnchor;
    });
    const repairProjection = projectBoatBounds(
      this.repairToolsBounds.setFromObject(this.repairTools, true),
      this.camera,
      width,
      height,
    );
    const { width: hitWidth, height: hitHeight, depth, ...point } = repairProjection;
    const repairAnchor = {
      id: 'repair-tools',
      itemType: null,
      action: 'repair',
      ...point,
      visible: this.repairTools.visible && point.visible,
      depleted: false,
      remainingUses: null,
      hitArea: { width: hitWidth, height: hitHeight, depth },
    } satisfies BoatInteractionAnchor;
    return [...itemAnchors, repairAnchor];
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

    const amplitudeScale = weatherAmplitudeScale(this.weather);
    const waveHeights = sampleBoatWaveHeights(time, amplitudeScale);
    this.driftFrame = this.drift.update(
      waveHeights,
      time,
      delta,
      this.reducedMotion.matches,
    );
    this.applyBasePresentation();
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.sky.update(
      delta,
      { weather: this.weather, phase: this.phase, severity: 0 },
      this.worldCameraPosition,
    );
    this.applyBaseLighting(this.sky.palette);
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

    this.updateSecondaryMotion(delta);

    const fog = this.scene.fog as FogExp2;
    const atmosphere = this.sky.palette;
    this.oceanAtmosphere.fogColor.copy(fog.color);
    this.oceanAtmosphere.horizonColor.copy(atmosphere.horizonColor);
    this.oceanAtmosphere.skyColor.copy(atmosphere.zenithColor);
    this.oceanAtmosphere.sunColor.copy(atmosphere.sunColor);
    this.oceanAtmosphere.sunVisibility = atmosphere.sunVisibility;
    this.ocean.update(time, amplitudeScale, fog.density, this.oceanAtmosphere);
    this.scene.updateMatrixWorld(true);
    this.ocean.setExclusions([
      createWaterExclusion(
        this.boat,
        this.waterExclusion.halfWidth,
        this.waterExclusion.halfLength,
        this.waterExclusion.taperStart,
        this.waterExclusion.minimumLocalY,
      ),
    ]);
    this.camera.getWorldPosition(this.worldCameraPosition);
    this.ocean.follow(this.worldCameraPosition.x, this.worldCameraPosition.z);
  }

  dispose(): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.setHighlightedItem(null),
      () => { this.disposed = true; },
      () => this.cancelActiveSequence(),
      () => this.ocean.dispose(),
      () => this.spray.dispose(),
      () => this.sky.dispose(),
      () => this.scene.remove(
        this.motionRig,
        this.ocean.mesh,
        this.spray.points,
        this.ambient,
        this.key,
        this.key.target,
        this.distantVessel,
      ),
      () => this.camera.removeFromParent(),
      () => this.camera.position.copy(this.originalCameraPosition),
      () => this.camera.quaternion.copy(this.originalCameraQuaternion),
      () => this.originalCameraParent?.add(this.camera),
      () => disposeResourceSets(
        this.ownedGeometries,
        this.ownedMaterials,
        this.ownedTextures,
      ),
    ]);
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

  private applyBasePresentation(): void {
    this.sky.resetTransient();
    this.applyBaseLighting(this.sky.palette);
    const { boat, rider } = this.driftFrame;
    this.motionRig.position.set(0, 0.22 + boat.heave, 0);
    this.motionRig.rotation.set(boat.pitch, boat.yaw, boat.roll);
    this.cameraRig.position.set(0, rider.y, 0);
    this.cameraRig.rotation.set(rider.pitch, rider.yaw, rider.roll);
    this.camera.quaternion.copy(this.baseCameraQuaternion);
    const parallax = clampParallax(this.pointerX, this.pointerY, this.reducedMotion.matches);
    this.camera.rotateY(parallax.yaw);
    this.camera.rotateX(parallax.pitch);
    if (this.rod) this.rod.rotation.z = this.baseRodRotationZ;
    if (this.line && this.baseLineRotation) this.line.rotation.copy(this.baseLineRotation);
    if (this.line) this.line.visible = false;
    if (this.catchMesh) this.catchMesh.visible = false;
    this.distantVessel.visible = false;
    this.vesselMaterial.opacity = 0;
  }

  private updateSecondaryMotion(delta: number): void {
    const reduced = this.reducedMotion.matches;
    if (reduced) {
      this.spray.reset();
      this.sprayCooldown = 0;
      return;
    }

    this.spray.update(delta);
    this.sprayCooldown = Math.max(0, this.sprayCooldown - Math.min(delta, 0.1));
    if (this.driftFrame.bowImpact >= 0.25 && this.sprayCooldown === 0) {
      this.scene.updateMatrixWorld(true);
      this.bowAnchor.getWorldPosition(this.bowWorldPosition);
      this.spray.emit(this.bowWorldPosition, this.driftFrame.bowImpact);
      this.sprayCooldown = this.weather === 'squall' ? 0.18 : 0.35;
    }

    if (this.line?.visible && this.baseLineRotation) {
      const pitchLag = clamp(this.driftFrame.angularVelocity.pitch * 0.06, -0.08, 0.08);
      const rollLag = clamp(this.driftFrame.angularVelocity.roll * 0.06, -0.08, 0.08);
      this.line.rotation.x = this.baseLineRotation.x - rollLag;
      this.line.rotation.z = this.baseLineRotation.z + pitchLag;
    }
  }

  private applyBaseLighting(atmosphere: Readonly<SkyPalette>): void {
    this.ambient.color.copy(atmosphere.ambientLightColor);
    this.ambient.intensity = atmosphere.ambientLightIntensity;
    this.key.color.copy(atmosphere.keyLightColor);
    this.key.intensity = atmosphere.keyLightIntensity;
    if (this.scene.background instanceof Color) {
      this.scene.background.copy(atmosphere.horizonColor);
    } else {
      this.scene.background = atmosphere.horizonColor.clone();
    }
    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.copy(atmosphere.fogColor);
      this.scene.fog.density = atmosphere.fogDensity;
    } else {
      this.scene.fog = new FogExp2(atmosphere.fogColor, atmosphere.fogDensity);
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
        this.sky.setTint(DIVE_SKY_TINT, pulse * 0.8);
        if (this.scene.background instanceof Color) {
          this.scene.background.lerp(DIVE_SKY_TINT, pulse * 0.8);
        }
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

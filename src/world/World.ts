import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import {
  createItemInstances,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SinkingState } from '../game/sinking';
import {
  BoatBuoyancy,
  smoothBoatPoseInto,
  type BoatFootprint,
  type BoatPose,
} from '../ocean/BoatBuoyancy';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { createWaterExclusion } from '../ocean/WaterExclusion';
import {
  DEFAULT_WAVES,
  sampleWaveField,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import type { CollisionArc, CollisionBox } from '../player/collisions';
import type { LadderClimbZone } from '../player/LadderTraversal';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import {
  SCAVENGE_BARREL_HALF_HEIGHT,
  ScavengePhysics,
  createScavengeStaticCuboids,
  type PhysicsPose,
} from '../physics/ScavengePhysics';
import { ScavengePhysicsDebugView } from '../physics/ScavengePhysicsDebugView';
import type { PhysicsMode } from '../physics/PhysicsOptions';
import type { PhysicsRuntime } from '../physics/PhysicsRuntime';
import type { PresentationWeatherId } from '../weather/presentationWeather';
import { boatStorageTransform } from './BoatStorage';
import { BoatDepositSmoke } from './BoatDepositSmoke';
import { Environment } from './Environment';
import { createLifeboat, type LifeboatBuild } from './Lifeboat';
import { LifeboatAssets } from './LifeboatAssets';
import { ITEM_MODEL_SPECS } from './itemModelManifest';
import { createProp } from './PropFactory';
import type {
  PropModelLibrary,
  PropPresentation,
} from './PropModelLibrary';
import { collectMeshResources, disposeResourceSets, runCleanupSteps } from './SceneResources';
import { createShip, type ShipBuild } from './Ship';
import type { ShipAssets } from './ShipAssets';
import { assignShipItems, shipItemTransformBounds } from './ShipItemPlacement';
import type { ShipFurnitureLibrary } from './ShipFurnitureLibrary';
import { FREIGHTER_DIMENSIONS, SHIP_LAYOUT, type Rect2 } from './ShipLayout';

export type WorldConstructionStage =
  | 'physics'
  | 'lifeboat'
  | 'ocean'
  | 'environment'
  | 'buoyancy';

export interface WorldConstructionDependencies {
  readonly checkpoint?: (stage: WorldConstructionStage) => void;
  readonly physicsMode?: PhysicsMode;
}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Constructor rollback preserves the original construction error.
  }
}

function sampleDefaultWaveInto(
  output: WaveSample,
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
): void {
  sampleWaveFieldInto(output, DEFAULT_WAVES, time, x, z, amplitudeScale);
}

function sampleDefaultWave(
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
): WaveSample {
  return sampleWaveField(DEFAULT_WAVES, time, x, z, amplitudeScale);
}

const MODEL_AXES = [
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 1),
] as const;
const DECK_UP = new Vector3(0, 1, 0);

function floorRestingQuaternion(itemId: ItemId, output: Quaternion): Quaternion {
  const size = ITEM_MODEL_SPECS[itemId].normalizedSize;
  let upAxisIndex = 0;
  let lengthAxisIndex = 0;
  for (let axis = 1; axis < 3; axis += 1) {
    if (size[axis]! < size[upAxisIndex]!) upAxisIndex = axis;
    if (size[axis]! > size[lengthAxisIndex]!) lengthAxisIndex = axis;
  }
  if (lengthAxisIndex === upAxisIndex) lengthAxisIndex = (upAxisIndex + 1) % 3;
  output.setFromUnitVectors(MODEL_AXES[upAxisIndex]!, DECK_UP);
  const lengthDirection = MODEL_AXES[lengthAxisIndex]!.clone().applyQuaternion(output);
  const yaw = -Math.atan2(lengthDirection.x, lengthDirection.z);
  return output.premultiply(new Quaternion().setFromAxisAngle(DECK_UP, yaw));
}

const FREIGHTER_BUOYANCY_FOOTPRINT: BoatFootprint = { length: 38, width: 13 };
const FREIGHTER_BUOYANCY_DAMPING = 2.4;
const FREIGHTER_DRAFT = 0.76;

function copyThreePoseIntoPhysicsPose(
  output: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  },
  translation: Vector3,
  rotation: Quaternion,
): void {
  output.translation.x = translation.x;
  output.translation.y = translation.y;
  output.translation.z = translation.z;
  output.rotation.x = rotation.x;
  output.rotation.y = rotation.y;
  output.rotation.z = rotation.z;
  output.rotation.w = rotation.w;
}

export class World {
  readonly ship: Group;
  readonly lifeboat: Group;
  readonly physicsBarrels!: readonly Group[];
  readonly physicsMode: PhysicsMode;
  readonly boatDepositTarget!: Mesh<BoxGeometry, MeshBasicMaterial>;
  readonly itemObjects = new Map<ItemInstanceId, Group>();
  readonly colliders: CollisionBox[];
  readonly interactionOccluders: readonly CollisionBox[];
  readonly arcColliders: CollisionArc[];
  readonly climbZones: readonly LadderClimbZone[];
  readonly playerStart: Vector3;
  readonly evacuationPoint: Vector3;
  readonly evacuationBounds: Rect2;
  readonly playerNavigationBounds: PlayerNavigationBounds;
  readonly deckY = FREIGHTER_DIMENSIONS.deckY;
  readonly lifeboatAcceptance: Box3;
  private readonly ocean: OceanRenderer;
  private readonly environment: Environment;
  private readonly boatStorage: Group;
  private readonly boatDepositSmoke!: BoatDepositSmoke;
  private readonly groundDropSmoke!: BoatDepositSmoke;
  private readonly buoyancy: BoatBuoyancy;
  private scavengePhysics: ScavengePhysics | null = null;
  private physicsDebugView: ScavengePhysicsDebugView | null = null;
  private physicsBarrelsAttachedToShip = false;
  private readonly freighterBuoyancy = new BoatBuoyancy(
    sampleDefaultWave,
    FREIGHTER_BUOYANCY_FOOTPRINT,
    sampleDefaultWaveInto,
  );
  private readonly shipBuild: ShipBuild;
  private readonly boatAnchor: Vector3;
  private readonly shipItemScales = new Map<ItemInstanceId, number>();
  private readonly animatedItemPresentations = new Map<ItemInstanceId, PropPresentation>();
  private readonly itemDropPosition = new Vector3();
  private readonly itemDropRotation = new Quaternion();
  private readonly shipPhysicsTranslation = new Vector3();
  private readonly shipPhysicsRotation = new Quaternion();
  private readonly barrelVisualOffset = new Vector3();
  private readonly shipPhysicsPose: PhysicsPose = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedTextures = new Set<Texture>();
  private readonly waterExclusion: LifeboatBuild['waterExclusion'];
  private readonly oceanAtmosphere = {
    fogColor: new Color(),
    horizonColor: new Color(),
    skyColor: new Color(),
    sunColor: new Color(0xfff1cf),
    sunVisibility: 1,
  };
  private readonly boatPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly boatTargetPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly freighterPose: BoatPose = {
    y: 0,
    pitch: 0,
    roll: 0,
    driftX: 0,
    driftZ: 0,
  };
  private readonly freighterTargetPose: BoatPose = {
    y: 0,
    pitch: 0,
    roll: 0,
    driftX: 0,
    driftZ: 0,
  };
  private readonly flightWaveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly propModels: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    maxTextureAnisotropy: number,
    moonTexture: Texture,
    physicsRuntime: PhysicsRuntime | null,
    instances: readonly ItemInstance[] = createItemInstances(),
    random: () => number = Math.random,
    construction: WorldConstructionDependencies = {},
    lifeboatAssets?: LifeboatAssets,
    shipAssets?: ShipAssets,
  ) {
    this.physicsMode = construction.physicsMode ?? 'enabled';
    const rollback: (() => void)[] = [];
    this.shipBuild = createShip(shipFurniture, maxTextureAnisotropy, shipAssets);
    rollback.push(() => this.shipBuild.dispose());
    this.ship = this.shipBuild.root;
    this.ship.position.y = -FREIGHTER_DRAFT;
    const barrelSpecs = SHIP_LAYOUT.details.filter(({ kind }) => kind === 'barrel');
    const dynamicBarrelColliders = new Set(
      barrelSpecs.map(({ id }) => this.shipBuild.detailColliderById.get(id)),
    );
    this.colliders = this.physicsMode === 'off'
      ? this.shipBuild.colliders
      : this.shipBuild.colliders.filter(
        (collider) => !dynamicBarrelColliders.has(collider),
      );
    this.interactionOccluders = this.shipBuild.interactionOccluders;
    this.arcColliders = this.shipBuild.arcColliders;
    this.climbZones = this.shipBuild.climbZones;
    this.playerStart = this.shipBuild.playerStart.clone();
    this.evacuationPoint = this.shipBuild.evacuationPoint.clone();
    const lifeboatStation = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation');
    if (!lifeboatStation) throw new Error('Missing lifeboat station deposit zone');
    this.evacuationBounds = {
      minX: lifeboatStation.bounds.minX,
      maxX: lifeboatStation.bounds.maxX,
      minZ: lifeboatStation.bounds.minZ,
      maxZ: lifeboatStation.bounds.maxZ,
    };
    this.playerNavigationBounds = this.shipBuild.playerNavigationBounds;
    this.boatAnchor = this.shipBuild.lifeboatAnchor.clone();
    const initialSceneChildren = new Set(scene.children);
    const initialBackground = scene.background;
    const initialFog = scene.fog;

    try {
      scene.add(this.ship);
      rollback.push(() => scene.remove(this.ship));
      this.ship.updateMatrixWorld(true);
      this.physicsBarrels = barrelSpecs.map(({ id }) => {
        const barrel = this.ship.getObjectByName(`detail:${id}`);
        if (!(barrel instanceof Group)) throw new Error(`Missing ship barrel detail ${id}`);
        return barrel;
      });

      this.ship.getWorldPosition(this.shipPhysicsTranslation);
      this.ship.getWorldQuaternion(this.shipPhysicsRotation);
      copyThreePoseIntoPhysicsPose(
        this.shipPhysicsPose,
        this.shipPhysicsTranslation,
        this.shipPhysicsRotation,
      );
      const physicsConfig = {
        colliders: this.colliders,
        arcColliders: this.shipBuild.arcColliders,
        safeBounds: this.playerNavigationBounds.safe,
        deckY: this.deckY,
        shipWidth: FREIGHTER_DIMENSIONS.width,
        shipLength: FREIGHTER_DIMENSIONS.length,
        initialShipPose: this.shipPhysicsPose,
        barrelSpawns: barrelSpecs.map(({ position }) => ({
          x: position[0],
          y: position[1] + SCAVENGE_BARREL_HALF_HEIGHT,
          z: position[2],
        })),
      };
      if (this.physicsMode !== 'off') {
        if (physicsRuntime === null) {
          throw new Error('Physics runtime is required unless physics is disabled');
        }
        this.physicsBarrels.forEach((barrel) => this.scene.attach(barrel));
        rollback.push(() => this.physicsBarrels.forEach((barrel) => barrel.removeFromParent()));
        this.scavengePhysics = new ScavengePhysics(physicsRuntime, physicsConfig);
        rollback.push(() => this.scavengePhysics?.dispose());
        if (this.physicsMode === 'debug') {
          this.physicsDebugView = new ScavengePhysicsDebugView(
            this.scene,
            this.ship,
            createScavengeStaticCuboids(physicsConfig),
            this.physicsBarrels.length,
          );
          rollback.push(() => this.physicsDebugView?.dispose());
        }
        this.syncPhysicsObjects();
      }
      construction.checkpoint?.('physics');

      const depositWidth = lifeboatStation.bounds.maxX - lifeboatStation.bounds.minX;
      const depositLength = lifeboatStation.bounds.maxZ - lifeboatStation.bounds.minZ;
      const depositGeometry = new BoxGeometry(depositWidth, 0.08, depositLength);
      const depositMaterial = new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      });
      this.ownedGeometries.add(depositGeometry);
      this.ownedMaterials.add(depositMaterial);
      rollback.push(() => {
        depositMaterial.dispose();
        this.ownedMaterials.delete(depositMaterial);
      });
      rollback.push(() => {
        depositGeometry.dispose();
        this.ownedGeometries.delete(depositGeometry);
      });
      this.boatDepositTarget = new Mesh(depositGeometry, depositMaterial);
      this.boatDepositTarget.name = 'lifeboat-deposit-target';
      this.boatDepositTarget.userData.boatDepositTarget = true;
      this.boatDepositTarget.position.set(
        (lifeboatStation.bounds.minX + lifeboatStation.bounds.maxX) / 2,
        FREIGHTER_DIMENSIONS.deckY + 0.04,
        (lifeboatStation.bounds.minZ + lifeboatStation.bounds.maxZ) / 2,
      );
      this.ship.add(this.boatDepositTarget);
      rollback.push(() => this.boatDepositTarget.removeFromParent());
      const assignments = assignShipItems(
        instances,
        this.shipBuild.itemSurfaces,
        random,
        this.shipBuild.colliders,
      );
      instances.forEach((instance) => {
        const transform = assignments.get(instance.instanceId)!;
        const presentation = createProp(this.propModels, instance);
        const prop = presentation.root;
        rollback.push(() => presentation.dispose());
        collectMeshResources(
          prop,
          this.ownedGeometries,
          this.ownedMaterials,
          ({ kind, resource }) => {
            rollback.push(() => {
              try {
                resource.dispose();
              } finally {
                if (kind === 'geometry') this.ownedGeometries.delete(resource);
                else this.ownedMaterials.delete(resource);
              }
            });
          },
        );
        prop.position.copy(transform.position);
        prop.rotation.copy(transform.rotation);
        prop.scale.setScalar(transform.scale);
        prop.userData.shipSurfaceId = transform.surfaceId;
        prop.userData.shipPhysicalSlotId = transform.physicalSlotId;
        prop.userData.shipFurnitureId = transform.furnitureId;
        this.ship.add(prop);
        rollback.push(() => prop.removeFromParent());
        this.itemObjects.set(instance.instanceId, prop);
        if (presentation.animation !== null) {
          this.animatedItemPresentations.set(instance.instanceId, presentation);
        }
        this.shipItemScales.set(instance.instanceId, transform.scale);
      });
      this.groundDropSmoke = new BoatDepositSmoke('ground-drop-smoke');
      this.ship.add(this.groundDropSmoke.points);
      rollback.push(() => {
        this.groundDropSmoke.points.removeFromParent();
        this.groundDropSmoke.dispose();
      });

      const resolvedLifeboatAssets = lifeboatAssets ?? LifeboatAssets.fromTextures(
        new Texture(),
        new Texture(),
        new Texture(),
      );
      if (lifeboatAssets === undefined) {
        for (const texture of [
          resolvedLifeboatAssets.color,
          resolvedLifeboatAssets.roughness,
          resolvedLifeboatAssets.normal,
        ]) {
          this.ownedTextures.add(texture);
          rollback.push(() => {
            try {
              texture.dispose();
            } finally {
              this.ownedTextures.delete(texture);
            }
          });
        }
      }
      const boatBuild = createLifeboat(resolvedLifeboatAssets);
      this.lifeboat = boatBuild.root;
      this.lifeboat.position.copy(this.boatAnchor);
      this.boatStorage = boatBuild.storageRoot;
      this.lifeboatAcceptance = boatBuild.acceptanceBox;
      this.waterExclusion = boatBuild.waterExclusion;
      collectMeshResources(
        this.lifeboat,
        this.ownedGeometries,
        this.ownedMaterials,
        ({ kind, resource }) => {
          rollback.push(() => {
            try {
              resource.dispose();
            } finally {
              if (kind === 'geometry') this.ownedGeometries.delete(resource);
              else this.ownedMaterials.delete(resource);
            }
          });
        },
      );
      this.boatDepositSmoke = new BoatDepositSmoke();
      this.boatDepositSmoke.points.position.set(0, 0.92, 0);
      this.boatStorage.add(this.boatDepositSmoke.points);
      rollback.push(() => {
        this.boatDepositSmoke.points.removeFromParent();
        this.boatDepositSmoke.dispose();
      });
      scene.add(this.lifeboat);
      rollback.push(() => scene.remove(this.lifeboat));
      construction.checkpoint?.('lifeboat');

      this.ocean = new OceanRenderer();
      rollback.push(() => this.ocean.dispose());
      scene.add(this.ocean.mesh);
      rollback.push(() => scene.remove(this.ocean.mesh));
      construction.checkpoint?.('ocean');
      this.environment = new Environment(scene, moonTexture);
      rollback.push(() => this.environment.dispose());
      construction.checkpoint?.('environment');
      this.buoyancy = new BoatBuoyancy(sampleDefaultWave, undefined, sampleDefaultWaveInto);
      construction.checkpoint?.('buoyancy');
    } catch (error) {
      for (let index = rollback.length - 1; index >= 0; index -= 1) {
        attemptCleanup(rollback[index]!);
      }
      [...scene.children].forEach((child) => {
        if (!initialSceneChildren.has(child)) attemptCleanup(() => scene.remove(child));
      });
      attemptCleanup(() => { scene.background = initialBackground; });
      attemptCleanup(() => { scene.fog = initialFog; });
      this.ownedGeometries.clear();
      this.ownedMaterials.clear();
      this.ownedTextures.clear();
      this.itemObjects.clear();
      this.animatedItemPresentations.clear();
      this.shipItemScales.clear();
      throw error;
    }
  }

  update(
    time: number,
    delta: number,
    sinking: SinkingState,
    cameraPosition: Vector3,
    simulatePhysics: boolean,
  ): void {
    if (this.disposed) return;
    const weatherWaveScale = sinking.waveAmplitudeScale
      * this.environment.weatherProfile.waveScale;
    this.freighterBuoyancy.sampleTargetInto(
      this.freighterTargetPose,
      time,
      0,
      0,
      weatherWaveScale,
    );
    smoothBoatPoseInto(
      this.freighterPose,
      this.freighterPose,
      this.freighterTargetPose,
      delta,
      FREIGHTER_BUOYANCY_DAMPING,
    );
    this.ship.position.set(
      0,
      sinking.sinkOffset + this.freighterPose.y - FREIGHTER_DRAFT,
      0,
    );
    this.ship.rotation.set(
      sinking.pitchRadians + this.freighterPose.pitch,
      0,
      sinking.rollRadians - this.freighterPose.roll,
    );
    this.ship.updateMatrixWorld(true);
    this.ship.getWorldPosition(this.shipPhysicsTranslation);
    this.ship.getWorldQuaternion(this.shipPhysicsRotation);
    copyThreePoseIntoPhysicsPose(
      this.shipPhysicsPose,
      this.shipPhysicsTranslation,
      this.shipPhysicsRotation,
    );
    this.scavengePhysics?.update(this.shipPhysicsPose, delta, simulatePhysics);
    if (!this.physicsBarrelsAttachedToShip) this.syncPhysicsObjects();
    this.shipBuild.updateEffects(delta, sinking.progress);
    for (const presentation of this.animatedItemPresentations.values()) {
      presentation.update(delta);
    }
    this.boatDepositSmoke.update(delta);
    this.groundDropSmoke.update(delta);

    this.buoyancy.sampleTargetInto(
      this.boatTargetPose,
      time,
      this.boatAnchor.x,
      this.boatAnchor.z,
      weatherWaveScale,
    );
    smoothBoatPoseInto(this.boatPose, this.boatPose, this.boatTargetPose, delta, 7);
    this.lifeboat.position.set(
      this.boatAnchor.x + this.boatPose.driftX,
      this.boatAnchor.y + this.boatPose.y,
      this.boatAnchor.z + this.boatPose.driftZ,
    );
    this.lifeboat.rotation.set(this.boatPose.pitch, 0, -this.boatPose.roll);
    this.environment.update(
      time,
      delta,
      cameraPosition,
    );
    const atmosphere = this.environment.atmosphere;
    this.oceanAtmosphere.fogColor.copy(atmosphere.fogColor);
    this.oceanAtmosphere.horizonColor.copy(atmosphere.horizonColor);
    this.oceanAtmosphere.skyColor.copy(atmosphere.zenithColor);
    this.oceanAtmosphere.sunColor.copy(atmosphere.sunColor);
    this.oceanAtmosphere.sunVisibility = atmosphere.sunVisibility;
    this.ocean.update(
      time,
      weatherWaveScale,
      atmosphere.fogDensity * this.environment.weatherProfile.fogDensityScale,
      this.oceanAtmosphere,
    );
    this.ocean.follow(cameraPosition.x, cameraPosition.z);
    this.ocean.setExclusions([
      createWaterExclusion(
        this.ship,
        this.shipBuild.waterExclusion.halfWidth,
        this.shipBuild.waterExclusion.halfLength,
        this.shipBuild.waterExclusion.taperStart,
        this.shipBuild.waterExclusion.minimumLocalY,
        this.shipBuild.waterExclusion.heightProfile,
      ),
      createWaterExclusion(
        this.lifeboat,
        this.waterExclusion.halfWidth,
        this.waterExclusion.halfLength,
        this.waterExclusion.taperStart,
        this.waterExclusion.minimumLocalY,
      ),
    ]);
  }

  setPresentationWeather(id: PresentationWeatherId): void {
    if (this.disposed) return;
    this.environment.setWeather(id);
  }

  attachPhysicsBarrelsToShip(): void {
    if (this.disposed || this.physicsBarrelsAttachedToShip) return;
    this.ship.updateMatrixWorld(true);
    this.physicsBarrels.forEach((barrel) => this.ship.attach(barrel));
    this.physicsBarrelsAttachedToShip = true;
  }

  sampleFlightWaterHeight(
    time: number,
    x: number,
    z: number,
    sinkingWaveScale: number,
  ): number {
    sampleWaveFieldInto(
      this.flightWaveSample,
      DEFAULT_WAVES,
      time,
      x,
      z,
      sinkingWaveScale * this.environment.weatherProfile.waveScale,
    );
    return this.flightWaveSample.height;
  }

  saveItem(instance: ItemInstance): void {
    this.storeItem(instance);
  }

  private syncPhysicsObjects(): void {
    const physics = this.scavengePhysics;
    if (physics === null) return;
    this.physicsBarrels.forEach((barrel, index) => {
      const pose = physics.barrelPoses[index]!;
      barrel.quaternion.set(
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      );
      this.barrelVisualOffset
        .set(0, -SCAVENGE_BARREL_HALF_HEIGHT, 0)
        .applyQuaternion(barrel.quaternion);
      barrel.position.set(
        pose.translation.x + this.barrelVisualOffset.x,
        pose.translation.y + this.barrelVisualOffset.y,
        pose.translation.z + this.barrelVisualOffset.z,
      );
    });
    this.physicsDebugView?.sync(physics.barrelPoses);
  }

  saveItems(instances: readonly ItemInstance[]): void {
    let stored = 0;
    instances.forEach((instance) => {
      if (this.storeItem(instance)) stored += 1;
    });
    if (stored > 0) this.boatDepositSmoke.trigger();
  }

  private storeItem(instance: ItemInstance): boolean {
    const item = this.itemObjects.get(instance.instanceId);
    if (!item || item.userData.itemType !== instance.type) return false;
    const transform = boatStorageTransform(instance);
    item.removeFromParent();
    this.boatStorage.add(item);
    item.position.copy(transform.position);
    item.rotation.copy(transform.rotation);
    item.scale.setScalar(transform.scale);
    return true;
  }

  loseItem(instanceId: ItemInstanceId): void {
    this.itemObjects.get(instanceId)?.removeFromParent();
  }

  landItem(instanceId: ItemInstanceId): void {
    const item = this.itemObjects.get(instanceId);
    if (!item) return;
    this.ship.attach(item);
    item.scale.setScalar(this.shipItemScales.get(instanceId) ?? 1);
  }

  dropItem(instanceId: ItemInstanceId, worldPoint: Vector3): void {
    const item = this.itemObjects.get(instanceId);
    if (!item) return;
    const itemType = item.userData.itemType as ItemId;
    this.itemDropPosition.copy(worldPoint);
    this.ship.worldToLocal(this.itemDropPosition);
    this.ship.add(item);
    const scale = this.shipItemScales.get(instanceId) ?? 1;
    item.quaternion.copy(floorRestingQuaternion(itemType, this.itemDropRotation));
    item.scale.setScalar(scale);
    const bounds = shipItemTransformBounds(itemType, {
      position: new Vector3(),
      rotation: item.rotation,
      scale,
    });
    item.position.set(
      this.itemDropPosition.x,
      this.deckY - bounds.min.y,
      this.itemDropPosition.z,
    );
    this.groundDropSmoke.points.position.set(
      this.itemDropPosition.x,
      this.deckY + 0.02,
      this.itemDropPosition.z,
    );
    this.groundDropSmoke.trigger();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    runCleanupSteps([
      () => this.ocean.dispose(),
      () => this.environment.dispose(),
      () => this.scene.remove(
        this.ship,
        this.lifeboat,
        this.ocean.mesh,
        ...this.physicsBarrels,
      ),
      () => this.boatDepositSmoke.dispose(),
      () => this.groundDropSmoke.dispose(),
      () => this.physicsDebugView?.dispose(),
      () => this.scavengePhysics?.dispose(),
      () => {
        for (const presentation of this.animatedItemPresentations.values()) {
          presentation.dispose();
        }
        this.animatedItemPresentations.clear();
      },
      () => this.shipBuild.dispose(),
      () => disposeResourceSets(
        this.ownedGeometries,
        this.ownedMaterials,
        this.ownedTextures,
      ),
    ]);
  }

}

import {
  Box3,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Texture,
  Vector3,
} from 'three';
import {
  createItemInstances,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SinkingState } from '../game/sinking';
import { BoatBuoyancy, smoothBoatPose, type BoatPose } from '../ocean/BoatBuoyancy';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { createWaterExclusion } from '../ocean/WaterExclusion';
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import type { CollisionBox } from '../player/collisions';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import { boatStorageTransform } from './BoatStorage';
import { Environment } from './Environment';
import { createLifeboat } from './Lifeboat';
import { createProp } from './PropFactory';
import type { PropModelLibrary } from './PropModelLibrary';
import { createShip, type ShipBuild } from './Ship';
import { assignShipItems } from './ShipItemPlacement';
import type { ShipFurnitureLibrary } from './ShipFurnitureLibrary';

function collectOwnedResources(
  root: Object3D,
  geometries: Set<BufferGeometry>,
  materials?: Set<Material>,
  rollback?: (() => void)[],
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (!geometries.has(object.geometry)) {
      const geometry = object.geometry;
      geometries.add(geometry);
      rollback?.push(() => {
        try {
          geometry.dispose();
        } finally {
          geometries.delete(geometry);
        }
      });
    }
    if (!materials) return;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      if (materials.has(material)) return;
      materials.add(material);
      rollback?.push(() => {
        try {
          material.dispose();
        } finally {
          materials.delete(material);
        }
      });
    });
  });
}

export type WorldConstructionStage = 'lifeboat' | 'ocean' | 'environment' | 'buoyancy';

export interface WorldConstructionDependencies {
  readonly checkpoint?: (stage: WorldConstructionStage) => void;
}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Constructor rollback preserves the original construction error.
  }
}

export class World {
  readonly ship: Group;
  readonly lifeboat: Group;
  readonly itemObjects = new Map<ItemInstanceId, Group>();
  readonly colliders: CollisionBox[];
  readonly playerStart: Vector3;
  readonly evacuationPoint: Vector3;
  readonly playerNavigationBounds: PlayerNavigationBounds;
  readonly lifeboatAcceptance: Box3;
  private readonly ocean: OceanRenderer;
  private readonly environment: Environment;
  private readonly boatStorage: Group;
  private readonly buoyancy: BoatBuoyancy;
  private readonly shipBuild: ShipBuild;
  private readonly boatAnchor: Vector3;
  private readonly shipItemScales = new Map<ItemInstanceId, number>();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedTextures = new Set<Texture>();
  private readonly waterExclusion: { readonly halfWidth: number; readonly halfLength: number };
  private readonly oceanAtmosphere = {
    fogColor: new Color(),
    horizonColor: new Color(),
    skyColor: new Color(),
    sunColor: new Color(0xfff1cf),
  };
  private boatPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly propModels: PropModelLibrary,
    shipFurniture: ShipFurnitureLibrary,
    maxTextureAnisotropy: number,
    moonTexture: Texture,
    instances: readonly ItemInstance[] = createItemInstances(),
    random: () => number = Math.random,
    construction: WorldConstructionDependencies = {},
  ) {
    const rollback: (() => void)[] = [];
    this.shipBuild = createShip(shipFurniture, maxTextureAnisotropy);
    rollback.push(() => this.shipBuild.dispose());
    this.ship = this.shipBuild.root;
    this.colliders = this.shipBuild.colliders;
    this.playerStart = this.shipBuild.playerStart.clone();
    this.evacuationPoint = this.shipBuild.evacuationPoint.clone();
    this.playerNavigationBounds = this.shipBuild.playerNavigationBounds;
    this.boatAnchor = this.shipBuild.lifeboatAnchor.clone();
    const initialSceneChildren = new Set(scene.children);
    const initialBackground = scene.background;
    const initialFog = scene.fog;

    try {
      scene.add(this.ship);
      rollback.push(() => scene.remove(this.ship));
      const assignments = assignShipItems(
        instances,
        this.shipBuild.itemSurfaces,
        random,
        this.shipBuild.colliders,
      );
      instances.forEach((instance) => {
        const transform = assignments.get(instance.instanceId)!;
        const prop = createProp(this.propModels, instance);
        collectOwnedResources(prop, this.ownedGeometries, this.ownedMaterials, rollback);
        prop.position.copy(transform.position);
        prop.rotation.copy(transform.rotation);
        prop.scale.setScalar(transform.scale);
        prop.userData.shipSurfaceId = transform.surfaceId;
        prop.userData.shipPhysicalSlotId = transform.physicalSlotId;
        prop.userData.shipFurnitureId = transform.furnitureId;
        this.ship.add(prop);
        rollback.push(() => prop.removeFromParent());
        this.itemObjects.set(instance.instanceId, prop);
        this.shipItemScales.set(instance.instanceId, transform.scale);
      });

      const boatBuild = createLifeboat();
      this.lifeboat = boatBuild.root;
      this.lifeboat.position.copy(this.boatAnchor);
      this.boatStorage = boatBuild.storageRoot;
      this.lifeboatAcceptance = boatBuild.acceptanceBox;
      this.waterExclusion = boatBuild.waterExclusion;
      boatBuild.textures.forEach((texture) => {
        if (this.ownedTextures.has(texture)) return;
        this.ownedTextures.add(texture);
        rollback.push(() => {
          try {
            texture.dispose();
          } finally {
            this.ownedTextures.delete(texture);
          }
        });
      });
      collectOwnedResources(
        this.lifeboat,
        this.ownedGeometries,
        this.ownedMaterials,
        rollback,
      );
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
      this.buoyancy = new BoatBuoyancy((time, x, z, scale) =>
        sampleWaveField(DEFAULT_WAVES, time, x, z, scale));
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
      this.shipItemScales.clear();
      throw error;
    }
  }

  update(
    time: number,
    delta: number,
    sinking: SinkingState,
    cameraPosition: Vector3,
    reducedMotion: boolean,
  ): void {
    if (this.disposed) return;
    this.ship.position.y = sinking.sinkOffset;
    this.ship.rotation.set(sinking.pitchRadians, 0, sinking.rollRadians);
    this.shipBuild.updateEffects(delta, sinking.progress, reducedMotion);

    this.environment.update(delta, sinking, cameraPosition, reducedMotion);
    const atmosphere = this.environment.atmosphere;
    this.oceanAtmosphere.fogColor.copy(atmosphere.fogColor);
    this.oceanAtmosphere.horizonColor.copy(atmosphere.horizonColor);
    this.oceanAtmosphere.skyColor.copy(atmosphere.zenithColor);
    this.oceanAtmosphere.sunColor.copy(atmosphere.sunColor);
    this.ocean.update(
      time,
      sinking.waveAmplitudeScale,
      atmosphere.fogDensity,
      this.oceanAtmosphere,
    );
    this.ocean.follow(cameraPosition.x, cameraPosition.z);
    const target = this.buoyancy.sampleTarget(
      time,
      this.boatAnchor.x,
      this.boatAnchor.z,
      sinking.waveAmplitudeScale,
    );
    this.boatPose = smoothBoatPose(this.boatPose, target, delta, 7);
    this.lifeboat.position.set(
      this.boatAnchor.x + this.boatPose.driftX,
      this.boatAnchor.y + this.boatPose.y,
      this.boatAnchor.z + this.boatPose.driftZ,
    );
    this.lifeboat.rotation.set(this.boatPose.pitch, 0, -this.boatPose.roll);
    this.ocean.setExclusions([
      createWaterExclusion(
        this.ship,
        this.shipBuild.waterExclusion.halfWidth,
        this.shipBuild.waterExclusion.halfLength,
      ),
      createWaterExclusion(
        this.lifeboat,
        this.waterExclusion.halfWidth,
        this.waterExclusion.halfLength,
      ),
    ]);
    const beacon = this.ship.getObjectByName('alarm-beacon');
    if (beacon instanceof Mesh && beacon.material instanceof MeshStandardMaterial) {
      const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
      beacon.material.emissiveIntensity = 0.25 + pulse * 1.35;
    }
  }

  saveItem(instance: ItemInstance): void {
    const item = this.itemObjects.get(instance.instanceId);
    if (!item || item.userData.itemType !== instance.type) return;
    const transform = boatStorageTransform(instance);
    item.removeFromParent();
    this.boatStorage.add(item);
    item.position.copy(transform.position);
    item.rotation.copy(transform.rotation);
    item.scale.setScalar(transform.scale);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ocean.dispose();
    this.environment.dispose();
    this.scene.remove(this.ship, this.lifeboat, this.ocean.mesh);
    this.shipBuild.dispose();
    this.ownedGeometries.forEach((geometry) => geometry.dispose());
    this.ownedMaterials.forEach((material) => material.dispose());
    this.ownedTextures.forEach((texture) => texture.dispose());
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
    this.ownedTextures.clear();
  }
}

import {
  Box3,
  BufferGeometry,
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
import { createLifeboat, type LifeboatBuild } from './Lifeboat';
import { createProp } from './PropFactory';
import type { PropModelLibrary } from './PropModelLibrary';
import { createShip, type ShipBuild } from './Ship';
import { assignShipItems } from './ShipItemPlacement';

function collectOwnedResources(
  root: Object3D,
  geometries: Set<BufferGeometry>,
  materials?: Set<Material>,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    if (!materials) return;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
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
  private readonly lifeboatWaterExclusion: LifeboatBuild['waterExclusion'];
  private readonly buoyancy: BoatBuoyancy;
  private readonly shipBuild: ShipBuild;
  private readonly boatAnchor: Vector3;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedTextures = new Set<Texture>();
  private boatPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly propModels: PropModelLibrary,
    instances: readonly ItemInstance[] = createItemInstances(),
    random: () => number = Math.random,
  ) {
    this.shipBuild = createShip();
    this.ship = this.shipBuild.root;
    this.colliders = this.shipBuild.colliders;
    this.playerStart = this.shipBuild.playerStart.clone();
    this.evacuationPoint = this.shipBuild.evacuationPoint.clone();
    this.playerNavigationBounds = this.shipBuild.playerNavigationBounds;
    this.boatAnchor = this.shipBuild.lifeboatAnchor.clone();
    scene.add(this.ship);

    try {
      const assignments = assignShipItems(instances, this.shipBuild.itemAnchors, random);
      instances.forEach((instance) => {
        const transform = assignments.get(instance.instanceId)!;
        const prop = createProp(this.propModels, instance);
        collectOwnedResources(prop, this.ownedGeometries, this.ownedMaterials);
        prop.position.copy(transform.position);
        prop.rotation.copy(transform.rotation);
        prop.scale.setScalar(transform.scale);
        prop.userData.shipAnchorId = transform.anchorId;
        this.ship.add(prop);
        this.itemObjects.set(instance.instanceId, prop);
      });
    } catch (error) {
      scene.remove(this.ship);
      this.shipBuild.dispose();
      this.ownedGeometries.forEach((geometry) => geometry.dispose());
      this.ownedMaterials.forEach((material) => material.dispose());
      this.ownedGeometries.clear();
      this.ownedMaterials.clear();
      throw error;
    }

    const boatBuild = createLifeboat();
    this.lifeboat = boatBuild.root;
    this.lifeboat.position.copy(this.boatAnchor);
    this.boatStorage = boatBuild.storageRoot;
    this.lifeboatAcceptance = boatBuild.acceptanceBox;
    this.lifeboatWaterExclusion = boatBuild.waterExclusion;
    boatBuild.textures.forEach((texture) => this.ownedTextures.add(texture));
    scene.add(this.lifeboat);
    collectOwnedResources(this.lifeboat, this.ownedGeometries, this.ownedMaterials);

    this.ocean = new OceanRenderer();
    scene.add(this.ocean.mesh);
    this.environment = new Environment(scene);
    this.buoyancy = new BoatBuoyancy((time, x, z, scale) =>
      sampleWaveField(DEFAULT_WAVES, time, x, z, scale));
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

    this.ocean.update(time, sinking.waveAmplitudeScale, 0.018 + sinking.progress * 0.009);
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
        this.lifeboatWaterExclusion.halfWidth,
        this.lifeboatWaterExclusion.halfLength,
      ),
    ]);
    this.environment.update(delta, sinking, cameraPosition.x, cameraPosition.z, reducedMotion);

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
    item.scale.setScalar(1);
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

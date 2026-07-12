import {
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
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
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import type { CollisionBox } from '../player/collisions';
import { boatStorageTransform } from './BoatStorage';
import { Environment } from './Environment';
import { createLifeboat } from './Lifeboat';
import { createProp } from './PropFactory';
import { createShip, selectSpawnPoints } from './Ship';

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
  readonly lifeboatAcceptance: Box3;
  private readonly ocean: OceanRenderer;
  private readonly environment: Environment;
  private readonly boatStorage: Group;
  private readonly buoyancy: BoatBuoyancy;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private boatPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly boatAnchor = new Vector3(5.5, 0.35, -5.8);
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    instances: readonly ItemInstance[] = createItemInstances(),
  ) {
    const shipBuild = createShip();
    this.ship = shipBuild.root;
    this.colliders = shipBuild.colliders;
    this.playerStart = shipBuild.playerStart.clone();
    this.evacuationPoint = shipBuild.evacuationPoint.clone();
    scene.add(this.ship);
    collectOwnedResources(this.ship, this.ownedGeometries);

    const selectedSpawnPoints = selectSpawnPoints(shipBuild.itemSpawnPoints);
    instances.forEach((instance, index) => {
      const prop = createProp(instance);
      collectOwnedResources(prop, this.ownedGeometries, this.ownedMaterials);
      prop.position.copy(selectedSpawnPoints[index]!);
      prop.rotation.y = index * 0.73;
      this.ship.add(prop);
      this.itemObjects.set(instance.instanceId, prop);
    });

    const boatBuild = createLifeboat();
    this.lifeboat = boatBuild.root;
    this.lifeboat.scale.setScalar(1.15);
    this.lifeboat.position.copy(this.boatAnchor);
    this.boatStorage = boatBuild.storageRoot;
    this.lifeboatAcceptance = boatBuild.acceptanceBox;
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
    this.environment.update(delta, sinking, cameraPosition.x, cameraPosition.z, reducedMotion);

    const beacon = this.ship.getObjectByName('alarm-beacon');
    if (beacon instanceof Mesh && beacon.material instanceof MeshStandardMaterial) {
      const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
      beacon.material.emissiveIntensity = 0.25 + pulse * 1.35;
    }
  }

  saveItem(instanceId: ItemInstanceId, storageIndex: number): void {
    const item = this.itemObjects.get(instanceId);
    if (!item) return;
    const transform = boatStorageTransform(storageIndex);
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
    this.ownedGeometries.forEach((geometry) => geometry.dispose());
    this.ownedMaterials.forEach((material) => material.dispose());
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
  }
}

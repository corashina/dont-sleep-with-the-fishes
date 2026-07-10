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
import { ITEM_IDS, type ItemId } from '../game/ItemState';
import type { SinkingState } from '../game/sinking';
import { BoatBuoyancy, smoothBoatPose, type BoatPose } from '../ocean/BoatBuoyancy';
import { OceanRenderer } from '../ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveField } from '../ocean/WaveField';
import type { CollisionBox } from '../player/collisions';
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
  readonly itemObjects = new Map<ItemId, Group>();
  readonly colliders: CollisionBox[];
  readonly playerStart: Vector3;
  readonly evacuationPoint: Vector3;
  readonly lifeboatAcceptance: Box3;
  private readonly ocean: OceanRenderer;
  private readonly environment: Environment;
  private readonly boatSlots: Group[];
  private readonly buoyancy: BoatBuoyancy;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly settlingItems = new Map<ItemId, number>();
  private boatPose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly boatAnchor = new Vector3(6.2, 0.35, -5.8);
  private disposed = false;

  constructor(private readonly scene: Scene) {
    const shipBuild = createShip();
    this.ship = shipBuild.root;
    this.colliders = shipBuild.colliders;
    this.playerStart = shipBuild.playerStart.clone();
    this.evacuationPoint = shipBuild.evacuationPoint.clone();
    scene.add(this.ship);
    collectOwnedResources(this.ship, this.ownedGeometries);

    const selectedSpawnPoints = selectSpawnPoints(shipBuild.itemSpawnPoints);
    ITEM_IDS.forEach((id, index) => {
      const prop = createProp(id);
      collectOwnedResources(prop, this.ownedGeometries, this.ownedMaterials);
      prop.position.copy(selectedSpawnPoints[index]!);
      prop.rotation.y = index * 0.73;
      this.ship.add(prop);
      this.itemObjects.set(id, prop);
    });

    const boatBuild = createLifeboat();
    this.lifeboat = boatBuild.root;
    this.lifeboat.position.copy(this.boatAnchor);
    this.boatSlots = boatBuild.slots;
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
    this.updateSettlingItems(reducedMotion ? 0.3 : delta);

    const beacon = this.ship.getObjectByName('alarm-beacon');
    if (beacon instanceof Mesh && beacon.material instanceof MeshStandardMaterial) {
      const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
      beacon.material.emissiveIntensity = 0.25 + pulse * 1.35;
    }
  }

  saveItem(id: ItemId, slotIndex: number): void {
    const item = this.itemObjects.get(id);
    const slot = this.boatSlots[slotIndex];
    if (!item || !slot) return;
    item.removeFromParent();
    item.position.set(0, 0.14, 0);
    item.rotation.set(0, slotIndex * 0.5, 0);
    item.scale.setScalar(0.68);
    slot.add(item);
    this.settlingItems.set(id, 0);
  }

  loseItem(id: ItemId): void {
    this.settlingItems.delete(id);
    this.itemObjects.get(id)?.removeFromParent();
  }

  landItem(id: ItemId): void {
    const item = this.itemObjects.get(id);
    if (!item) return;
    this.settlingItems.delete(id);
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
    this.settlingItems.clear();
  }

  private updateSettlingItems(delta: number): void {
    this.settlingItems.forEach((elapsed, id) => {
      const item = this.itemObjects.get(id);
      if (!item) {
        this.settlingItems.delete(id);
        return;
      }
      const nextElapsed = elapsed + Math.max(0, delta);
      const progress = Math.min(1, nextElapsed / 0.25);
      const eased = 1 - (1 - progress) ** 3;
      item.position.y = 0.14 * (1 - eased);
      item.scale.setScalar(0.68 + 0.14 * eased);
      if (progress === 1) {
        item.position.y = 0;
        item.scale.setScalar(0.82);
        this.settlingItems.delete(id);
      } else {
        this.settlingItems.set(id, nextElapsed);
      }
    });
  }
}

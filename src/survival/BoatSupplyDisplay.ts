import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import {
  BOAT_SUPPLY_GROUP_IDS,
  boatSupplyCopyOffsets,
  boatSupplyGroupTransform,
  type BoatSupplyGroupId,
} from '../world/BoatSupplyLayout';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type {
  ItemCondition,
  SurvivalSnapshot,
} from './survivalTypes';

export interface BoatSupplyPresentationRecord {
  readonly groupId: BoatSupplyGroupId;
  readonly root: Group;
  readonly quantity: number;
  readonly usableQuantity: number;
  readonly brokenQuantity: number;
  readonly visibleCopies: 0 | 1 | 2 | 3;
  readonly backingInstanceId: ItemInstanceId | null;
}

interface MutableRecord {
  readonly groupId: BoatSupplyGroupId;
  readonly root: Group;
  quantity: number;
  usableQuantity: number;
  brokenQuantity: number;
  visibleCopies: 0 | 1 | 2 | 3;
  backingInstanceId: ItemInstanceId | null;
}

interface CopyBinding {
  readonly root: Group;
  readonly materials: readonly ConditionMaterialBinding[];
  instanceId: ItemInstanceId | null;
  condition: ItemCondition;
}

interface ConditionMaterialBinding {
  readonly mesh: Mesh;
  readonly usable: Material | Material[];
  readonly broken: Material | Material[];
  readonly mutedUsable: Material | Material[];
  readonly mutedBroken: Material | Material[];
}

interface HighlightState {
  readonly emissive: number;
  readonly emissiveIntensity: number;
}

interface ActiveAnimation {
  readonly root: Group;
  readonly basePosition: Vector3;
  readonly baseQuaternion: Quaternion;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

const EVENT_ITEM_USE_DURATION = 0.65;

function visibleCopyCount(quantity: number): 0 | 1 | 2 | 3 {
  return Math.min(3, Math.max(0, Math.floor(quantity))) as 0 | 1 | 2 | 3;
}

function transformMaterial(
  material: Material | Material[],
  transform: (entry: Material) => Material,
): Material | Material[] {
  return Array.isArray(material) ? material.map(transform) : transform(material);
}

function materialList(material: Material | Material[]): readonly Material[] {
  return Array.isArray(material) ? material : [material];
}

function brokenMaterial(material: Material): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(new Color(0x384243), 0.68);
    clone.roughness = Math.max(0.82, clone.roughness);
    clone.metalness *= 0.45;
  }
  return clone;
}

function mutedMaterial(material: Material): Material {
  const clone = material.clone();
  if (clone instanceof MeshStandardMaterial) {
    clone.color.lerp(new Color(0x596063), 0.78);
    clone.emissive.lerp(new Color(0x1d2224), 0.8);
    clone.emissiveIntensity *= 0.25;
    clone.roughness = Math.max(0.8, clone.roughness);
  }
  return clone;
}

function setHighlighted(root: Object3D, highlighted: boolean): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    const state = material.userData.supplyHighlight as HighlightState | undefined;
    if (state === undefined) {
      material.userData.supplyHighlight = {
        emissive: material.emissive.getHex(),
        emissiveIntensity: material.emissiveIntensity,
      } satisfies HighlightState;
    }
    const original = material.userData.supplyHighlight as HighlightState;
    if (highlighted) {
      material.emissive.setHex(0x6f4218);
      material.emissiveIntensity = Math.max(0.65, original.emissiveIntensity);
    } else {
      material.emissive.setHex(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;
    }
  });
}

function createRepairMaterialBundle(index: number): Group {
  const wood = new MeshStandardMaterial({
    color: index % 2 === 0 ? 0x73543a : 0x5c402d,
    roughness: 0.94,
    flatShading: true,
  });
  const rope = new MeshStandardMaterial({
    color: 0x413323,
    roughness: 1,
    flatShading: true,
  });
  const root = new Group();
  root.name = `repair-material-bundle-${index + 1}`;
  for (let plankIndex = 0; plankIndex < 3; plankIndex += 1) {
    const plank = new Mesh(new BoxGeometry(0.42, 0.045, 0.10), wood);
    plank.position.set(0, plankIndex * 0.05, (plankIndex - 1) * 0.018);
    plank.rotation.y = (plankIndex - 1) * 0.06;
    root.add(plank);
  }
  const lashing = new Mesh(new TorusGeometry(0.105, 0.012, 5, 10), rope);
  lashing.rotation.y = Math.PI / 2;
  lashing.position.y = 0.06;
  root.add(lashing);
  return root;
}

function createConditionBindings(
  root: Group,
  ownedMaterials: Set<Material>,
): readonly ConditionMaterialBinding[] {
  const bindings: ConditionMaterialBinding[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const usable = object.material;
    const broken = transformMaterial(usable, brokenMaterial);
    const mutedUsable = transformMaterial(usable, mutedMaterial);
    const mutedBroken = transformMaterial(broken, mutedMaterial);
    for (const material of [
      ...materialList(broken),
      ...materialList(mutedUsable),
      ...materialList(mutedBroken),
    ]) {
      ownedMaterials.add(material);
    }
    bindings.push({ mesh: object, usable, broken, mutedUsable, mutedBroken });
  });
  return bindings;
}

export class BoatSupplyDisplay {
  private readonly recordsById = new Map<BoatSupplyGroupId, MutableRecord>();
  private readonly copiesById = new Map<BoatSupplyGroupId, CopyBinding[]>();
  private readonly instancesByType = new Map<ItemId, readonly ItemInstance[]>();
  private readonly groupByInstanceId = new Map<ItemInstanceId, BoatSupplyGroupId>();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly basePositionById = new Map<BoatSupplyGroupId, Vector3>();
  private readonly baseQuaternionById = new Map<BoatSupplyGroupId, Quaternion>();
  private currentSnapshot: SurvivalSnapshot | null = null;
  private eventEligibleItemIds: ReadonlySet<ItemInstanceId> | null = null;
  private eventSelectedItemId: ItemInstanceId | null = null;
  private highlightedGroupId: BoatSupplyGroupId | null = null;
  private activeAnimation: ActiveAnimation | null = null;
  private disposed = false;

  constructor(
    propModels: PropModelLibrary,
    parent: Group,
    savedItems: readonly ItemInstance[],
    private readonly reducedMotion = false,
  ) {
    const sortedItems = [...savedItems].sort(
      (first, second) => first.instanceId.localeCompare(second.instanceId),
    );
    for (const item of sortedItems) {
      const siblings = this.instancesByType.get(item.type) ?? [];
      this.instancesByType.set(item.type, [...siblings, item]);
      this.groupByInstanceId.set(item.instanceId, item.type);
    }

    for (const groupId of BOAT_SUPPLY_GROUP_IDS) {
      const root = new Group();
      root.name = `boat-supply:${groupId}`;
      const transform = boatSupplyGroupTransform(groupId);
      root.position.copy(transform.position);
      root.rotation.copy(transform.rotation);
      root.scale.setScalar(transform.scale);
      parent.add(root);
      this.basePositionById.set(groupId, root.position.clone());
      this.baseQuaternionById.set(groupId, root.quaternion.clone());

      const poolSize = groupId === 'repairMaterial'
        || groupId === 'cannedFood'
        || groupId === 'baitTin'
        ? 3
        : Math.min(3, this.instancesByType.get(groupId)?.length ?? 0);
      const copies: CopyBinding[] = [];
      for (let index = 0; index < poolSize; index += 1) {
        const instance = groupId === 'repairMaterial'
          ? null
          : this.instancesByType.get(groupId)?.[index] ?? {
            instanceId: `${groupId}-${index + 1}` as ItemInstanceId,
            type: groupId,
          };
        const copy = groupId === 'repairMaterial'
          ? createRepairMaterialBundle(index)
          : propModels.create(instance!);
        copy.name = `boat-supply:${groupId}:copy-${index + 1}`;
        copy.visible = false;
        root.add(copy);
        collectMeshResources(copy, this.ownedGeometries, this.ownedMaterials);
        copies.push({
          root: copy,
          materials: createConditionBindings(copy, this.ownedMaterials),
          instanceId: instance?.instanceId ?? null,
          condition: 'lost',
        });
      }
      this.copiesById.set(groupId, copies);
      this.recordsById.set(groupId, {
        groupId,
        root,
        quantity: 0,
        usableQuantity: 0,
        brokenQuantity: 0,
        visibleCopies: 0,
        backingInstanceId: null,
      });
    }
  }

  records(): readonly BoatSupplyPresentationRecord[] {
    return BOAT_SUPPLY_GROUP_IDS.map((id) => this.recordsById.get(id)!);
  }

  recordFor(id: BoatSupplyGroupId): BoatSupplyPresentationRecord | undefined {
    return this.recordsById.get(id);
  }

  sync(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    for (const groupId of BOAT_SUPPLY_GROUP_IDS) this.syncGroup(groupId, snapshot);
    if (
      this.highlightedGroupId !== null
      && this.recordsById.get(this.highlightedGroupId)?.visibleCopies === 0
    ) {
      this.setHighlighted(null);
    }
  }

  setHighlighted(anchorId: string | null): void {
    if (this.disposed) return;
    if (this.highlightedGroupId !== null) {
      setHighlighted(this.recordsById.get(this.highlightedGroupId)!.root, false);
    }
    this.highlightedGroupId = null;
    if (anchorId === null) return;
    const rawGroupId = anchorId.startsWith('supply:')
      ? anchorId.slice('supply:'.length)
      : this.groupByInstanceId.get(anchorId as ItemInstanceId);
    if (!rawGroupId || !this.recordsById.has(rawGroupId as BoatSupplyGroupId)) return;
    const groupId = rawGroupId as BoatSupplyGroupId;
    const record = this.recordsById.get(groupId)!;
    if (record.visibleCopies === 0) return;
    setHighlighted(record.root, true);
    this.highlightedGroupId = groupId;
  }

  setEventEligibleItems(instanceIds: ReadonlySet<ItemInstanceId> | null): void {
    if (this.disposed) return;
    this.eventEligibleItemIds = instanceIds === null ? null : new Set(instanceIds);
    if (
      this.eventSelectedItemId !== null
      && this.eventEligibleItemIds?.has(this.eventSelectedItemId) !== true
    ) {
      this.eventSelectedItemId = null;
    }
    if (this.currentSnapshot !== null) this.sync(this.currentSnapshot);
  }

  setEventSelectedItem(instanceId: ItemInstanceId | null): void {
    if (this.disposed) return;
    this.eventSelectedItemId = instanceId;
    if (this.currentSnapshot !== null) this.sync(this.currentSnapshot);
  }

  playEventItemUse(instanceId: ItemInstanceId): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelActiveAnimation();
    const groupId = this.groupByInstanceId.get(instanceId);
    if (groupId === undefined) return Promise.resolve();
    const record = this.recordsById.get(groupId)!;
    if (record.visibleCopies === 0) return Promise.resolve();
    const duration = this.reducedMotion ? Number.EPSILON : EVENT_ITEM_USE_DURATION;
    return new Promise((resolve) => {
      this.activeAnimation = {
        root: record.root,
        basePosition: this.basePositionById.get(groupId)!,
        baseQuaternion: this.baseQuaternionById.get(groupId)!,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  update(deltaSeconds: number): void {
    const animation = this.activeAnimation;
    if (animation === null || this.disposed) return;
    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, deltaSeconds),
    );
    const progress = animation.elapsed / animation.duration;
    const eased = progress * progress * (3 - 2 * progress);
    animation.root.position.copy(animation.basePosition);
    animation.root.position.y += Math.sin(Math.PI * eased) * 0.28;
    animation.root.quaternion.copy(animation.baseQuaternion);
    animation.root.rotateZ(Math.sin(Math.PI * eased) * 0.16);
    if (progress < 1) return;
    this.activeAnimation = null;
    animation.root.position.copy(animation.basePosition);
    animation.root.quaternion.copy(animation.baseQuaternion);
    animation.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.setHighlighted(null);
    this.cancelActiveAnimation();
    this.disposed = true;
    for (const record of this.recordsById.values()) record.root.removeFromParent();
    disposeResourceSets(
      this.ownedGeometries,
      this.ownedMaterials,
      new Set(),
    );
  }

  private syncGroup(groupId: BoatSupplyGroupId, snapshot: SurvivalSnapshot): void {
    const record = this.recordsById.get(groupId)!;
    const activeItems = groupId === 'repairMaterial'
      ? []
      : (this.instancesByType.get(groupId) ?? [])
        .map((instance) => ({
          instance,
          condition: snapshot.inventory[instance.instanceId]?.condition ?? 'lost',
        }))
        .filter(({ condition }) => condition === 'usable' || condition === 'broken');
    const usableItems = activeItems.filter(({ condition }) => condition === 'usable');
    const brokenItems = activeItems.filter(({ condition }) => condition === 'broken');
    const quantity = groupId === 'cannedFood'
      ? snapshot.food
      : groupId === 'baitTin'
        ? snapshot.bait
        : groupId === 'repairMaterial'
          ? snapshot.repairMaterial
          : activeItems.length;
    record.quantity = Math.max(0, Math.floor(quantity));
    record.usableQuantity = groupId === 'cannedFood'
      || groupId === 'baitTin'
      || groupId === 'repairMaterial'
      ? record.quantity
      : usableItems.length;
    record.brokenQuantity = groupId === 'cannedFood'
      || groupId === 'baitTin'
      || groupId === 'repairMaterial'
      ? 0
      : brokenItems.length;
    record.visibleCopies = visibleCopyCount(record.quantity);
    record.backingInstanceId = this.preferredBackingId(
      groupId,
      usableItems.map(({ instance }) => instance.instanceId),
      brokenItems.map(({ instance }) => instance.instanceId),
    );
    record.root.visible = record.visibleCopies > 0;

    const offsets = record.visibleCopies === 0
      ? []
      : boatSupplyCopyOffsets(groupId, record.visibleCopies);
    const copies = this.copiesById.get(groupId)!;
    for (let index = 0; index < copies.length; index += 1) {
      const copy = copies[index]!;
      copy.root.visible = index < record.visibleCopies;
      if (!copy.root.visible) continue;
      copy.root.position.copy(offsets[index]!);
      const activeItem = activeItems[index];
      copy.instanceId = activeItem?.instance.instanceId ?? copy.instanceId;
      copy.condition = activeItem?.condition
        ?? (groupId === 'repairMaterial' || groupId === 'cannedFood' || groupId === 'baitTin'
          ? 'usable'
          : 'lost');
      this.applyCopyMaterials(groupId, copy);
    }
  }

  private preferredBackingId(
    groupId: BoatSupplyGroupId,
    usableIds: readonly ItemInstanceId[],
    brokenIds: readonly ItemInstanceId[],
  ): ItemInstanceId | null {
    if (groupId === 'repairMaterial') return null;
    if (
      this.eventSelectedItemId !== null
      && this.groupByInstanceId.get(this.eventSelectedItemId) === groupId
      && usableIds.includes(this.eventSelectedItemId)
    ) {
      return this.eventSelectedItemId;
    }
    const eligible = usableIds.find((id) => this.eventEligibleItemIds?.has(id) === true);
    return eligible ?? usableIds[0] ?? brokenIds[0] ?? null;
  }

  private applyCopyMaterials(groupId: BoatSupplyGroupId, copy: CopyBinding): void {
    setHighlighted(copy.root, false);
    let groupEligible = false;
    if (this.eventEligibleItemIds !== null) {
      for (const id of this.eventEligibleItemIds) {
        if (this.groupByInstanceId.get(id) !== groupId) continue;
        groupEligible = true;
        break;
      }
    }
    const muted = this.eventEligibleItemIds !== null
      && !groupEligible
      && this.eventSelectedItemId !== copy.instanceId;
    const broken = copy.condition === 'broken';
    for (const binding of copy.materials) {
      binding.mesh.material = broken
        ? muted ? binding.mutedBroken : binding.broken
        : muted ? binding.mutedUsable : binding.usable;
    }
    const highlighted = copy.instanceId !== null && (
      this.eventSelectedItemId === copy.instanceId
      || this.eventEligibleItemIds?.has(copy.instanceId) === true
    );
    if (highlighted) setHighlighted(copy.root, true);
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    animation.root.position.copy(animation.basePosition);
    animation.root.quaternion.copy(animation.baseQuaternion);
    animation.resolve();
  }
}

import {
  BoxGeometry,
  BufferGeometry,
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
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import {
  BOAT_SUPPLY_GROUP_IDS,
  boatSupplyTransform,
  type BoatSupplyGroupId,
} from '../world/BoatStorage';
import type {
  PropModelLibrary,
  PropPresentation,
} from '../world/PropModelLibrary';
import { enableItemAmbientOcclusion } from '../rendering/ItemAmbientOcclusion';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import type {
  ItemCondition,
  SurvivalSnapshot,
} from './survivalTypes';
import { scaleEventItemDuration } from './eventItemTiming';
import { applyBrokenMaterialTreatment } from './itemConditionAppearance';

export interface BoatSupplyPresentationRecord {
  readonly groupId: BoatSupplyGroupId;
  readonly root: Group;
  readonly quantity: number;
  readonly usableQuantity: number;
  readonly brokenQuantity: number;
  readonly visibleCopies: 0 | 1 | 2 | 3;
  readonly backingInstanceId: ItemInstanceId | null;
}

export interface SupplyAdditivePose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
}

export interface BorrowedSupplyActor {
  readonly instanceId: ItemInstanceId;
  readonly root: Group;
  applyPose(pose: SupplyAdditivePose): void;
  releaseOnNextSync(): void;
  release(): void;
}

export function borrowSupplyActor(
  current: BorrowedSupplyActor | null,
    supplies: Pick<BoatSupplyDisplay, 'borrowEventActor'>,
    instanceId: ItemInstanceId,
    prepare?: (actor: BorrowedSupplyActor) => void,
): BorrowedSupplyActor | null {
    if (current?.instanceId === instanceId) return current;
    current?.release();
    const actor = supplies.borrowEventActor(instanceId);
    if (actor === null) return null;
    prepare?.(actor);
    return actor;
}

export function releaseSupplyActor(actor: BorrowedSupplyActor | null): null {
  actor?.release();
  return null;
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
  readonly presentation: PropPresentation | null;
  readonly materials: readonly ConditionMaterialBinding[];
  instanceId: ItemInstanceId | null;
  condition: ItemCondition;
}

interface ConditionMaterialBinding {
  readonly mesh: Mesh;
  readonly usable: Material | Material[];
  readonly broken: Material | Material[];
}

interface ActiveAnimation {
  readonly root: Group;
  elapsed: number;
  readonly duration: number;
  readonly resolve: () => void;
}

export interface MutableSupplyPose extends SupplyAdditivePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

interface EventItemPoseBinding {
  instanceId: ItemInstanceId;
  readonly pose: MutableSupplyPose;
}

interface BorrowedSupplyBinding {
  readonly groupId: BoatSupplyGroupId;
  readonly motionIndex: number;
  readonly root: Group;
  readonly copyPosition: Vector3;
  readonly copyQuaternion: Quaternion;
  readonly copyScale: Vector3;
  readonly pose: MutableSupplyPose;
}

interface PreparedEventActor {
  readonly root: Group;
  readonly heldCopy: Object3D;
  readonly copyPosition: Vector3;
  readonly copyQuaternion: Quaternion;
  readonly copyScale: Vector3;
  readonly materialBindings: readonly {
    readonly source: Mesh;
    readonly target: Mesh;
  }[];
}

export const GENERIC_EVENT_ITEM_USE_DURATION = scaleEventItemDuration(0.65);
const AGGREGATE_ITEM_IDS = new Set<ItemId>(['cannedFood', 'baitTin']);

function createIdentitySupplyPose(): MutableSupplyPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
}

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

function enableBoatSupplyShadows(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function brokenMaterial(material: Material): Material {
  const clone = material.clone();
  applyBrokenMaterialTreatment(clone);
  return clone;
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
  enableItemAmbientOcclusion(root);
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
    for (const material of materialList(broken)) {
      ownedMaterials.add(material);
    }
    bindings.push({ mesh: object, usable, broken });
  });
  return bindings;
}

export class BoatSupplyDisplay {
  private readonly recordsById = new Map<BoatSupplyGroupId, MutableRecord>();
  private readonly eventMotionRecords: MutableRecord[] = [];
  private readonly copiesById = new Map<BoatSupplyGroupId, CopyBinding[]>();
  private readonly instancesByType = new Map<ItemId, readonly ItemInstance[]>();
  private readonly groupByInstanceId = new Map<ItemInstanceId, BoatSupplyGroupId>();
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly basePositionById = new Map<BoatSupplyGroupId, Vector3>();
  private readonly baseQuaternionById = new Map<BoatSupplyGroupId, Quaternion>();
  private readonly borrowedCopyOffset = new Vector3();
  private readonly borrowedActors = new Map<ItemInstanceId, BorrowedSupplyActor>();
  private readonly preparedEventActors = new Map<
    ItemInstanceId,
    PreparedEventActor
  >();
  private readonly borrowedBindings =
    new Map<ItemInstanceId, BorrowedSupplyBinding>();
  private readonly borrowedCountByGroup = new Map<BoatSupplyGroupId, number>();
  private readonly releaseBorrowedOnSync = new Set<ItemInstanceId>();
  private readonly presentationHiddenItemIds = new Set<ItemInstanceId>();
  private readonly eventStowedUntilDay = new Set<ItemInstanceId>();
  private currentSnapshot: SurvivalSnapshot | null = null;
  private eventEligibleItemIds: ReadonlySet<ItemInstanceId> | null = null;
  private eventSelectedItemId: ItemInstanceId | null = null;
  private activeAnimation: ActiveAnimation | null = null;
  private eventAmbientRoll = 0;
  private eventAmbientLift = 0;
  private readonly eventItemPosesByGroupId = new Map<
    BoatSupplyGroupId,
    EventItemPoseBinding
  >();
  private pinnedEventActorId: ItemInstanceId | null = null;
  private pinnedEventGroupId: BoatSupplyGroupId | null = null;
  private readonly preparedEventActorIds = new Set<ItemInstanceId>();
  private releasePinnedActorOnSync = false;
  private disposed = false;

  constructor(
    propModels: PropModelLibrary,
    parent: Group,
    savedItems: readonly ItemInstance[],
  ) {
    const sortedItems = [
      ...savedItems,
      ...ITEM_IDS
        .filter((itemId) => !AGGREGATE_ITEM_IDS.has(itemId))
        .map((type) => ({
          instanceId: `${type}-1` as ItemInstanceId,
          type,
        })),
    ].sort(
      (first, second) => first.instanceId.localeCompare(second.instanceId),
    );
    for (const item of sortedItems) {
      if (this.groupByInstanceId.has(item.instanceId)) continue;
      const siblings = this.instancesByType.get(item.type) ?? [];
      this.instancesByType.set(item.type, [...siblings, item]);
      this.groupByInstanceId.set(item.instanceId, item.type);
    }

    for (const groupId of BOAT_SUPPLY_GROUP_IDS) {
      const root = new Group();
      root.name = `boat-supply:${groupId}`;
      parent.add(root);
      this.basePositionById.set(groupId, root.position.clone());
      this.baseQuaternionById.set(groupId, root.quaternion.clone());
      const poolSize = groupId === 'carlitos'
        ? 0
        : groupId === 'repairMaterial'
        || groupId === 'cannedFood'
        || groupId === 'baitTin'
        ? 3
        : 1;
      const copies: CopyBinding[] = [];
      for (let index = 0; index < poolSize; index += 1) {
        const instance = groupId === 'repairMaterial'
          ? null
          : this.instancesByType.get(groupId)?.[index] ?? {
            instanceId: `${groupId}-${index + 1}` as ItemInstanceId,
            type: groupId,
          };
        const presentation = groupId === 'repairMaterial'
          ? null
          : propModels.createPresentation(instance!);
        const copy = presentation?.root ?? createRepairMaterialBundle(index);
        enableBoatSupplyShadows(copy);
        const transform = boatSupplyTransform(groupId, index);
        copy.name = `boat-supply:${groupId}:copy-${index + 1}`;
        copy.position.copy(transform.position);
        copy.rotation.copy(transform.rotation);
        copy.scale.setScalar(transform.scale);
        copy.visible = false;
        root.add(copy);
        collectMeshResources(copy, this.ownedGeometries, this.ownedMaterials);
        copies.push({
          root: copy,
          presentation,
          materials: createConditionBindings(copy, this.ownedMaterials),
          instanceId: instance?.instanceId ?? null,
          condition: 'lost',
        });
      }
      this.copiesById.set(groupId, copies);
      const record: MutableRecord = {
        groupId,
        root,
        quantity: 0,
        usableQuantity: 0,
        brokenQuantity: 0,
        visibleCopies: 0,
        backingInstanceId: null,
      };
      this.recordsById.set(groupId, record);
      this.eventMotionRecords.push(record);
    }
    for (const [instanceId, groupId] of this.groupByInstanceId) {
      this.prepareEventActor(instanceId, groupId);
    }
  }

  records(): readonly BoatSupplyPresentationRecord[] {
    return BOAT_SUPPLY_GROUP_IDS.map((id) => this.recordsById.get(id)!);
  }

  recordFor(id: BoatSupplyGroupId): BoatSupplyPresentationRecord | undefined {
    return this.recordsById.get(id);
  }

  itemType(instanceId: ItemInstanceId): ItemId | null {
    const groupId = this.groupByInstanceId.get(instanceId);
    return groupId === undefined || groupId === 'repairMaterial' ? null : groupId;
  }

  setPresentationItemHidden(instanceId: ItemInstanceId, hidden: boolean): void {
    if (this.disposed) return;
    if (hidden) this.presentationHiddenItemIds.add(instanceId);
    else this.presentationHiddenItemIds.delete(instanceId);
    if (this.currentSnapshot !== null) this.sync(this.currentSnapshot);
  }

  stowEventItemUntilDay(instanceId: ItemInstanceId): void {
    if (this.disposed) return;
    this.eventStowedUntilDay.add(instanceId);
    if (this.currentSnapshot !== null) this.sync(this.currentSnapshot);
  }

  releaseDayStowedItems(): void {
    if (this.disposed || this.eventStowedUntilDay.size === 0) return;
    this.eventStowedUntilDay.clear();
    if (this.currentSnapshot !== null) this.sync(this.currentSnapshot);
  }

  sync(snapshot: SurvivalSnapshot): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    for (const item of Object.values(snapshot.inventory)) {
      if (item === undefined) continue;
      this.groupByInstanceId.set(item.instanceId, item.type);
      this.prepareEventActor(item.instanceId, item.type);
    }
    if (this.releasePinnedActorOnSync) this.releasePinnedEventActor(false);
    for (const instanceId of this.releaseBorrowedOnSync) {
      this.releaseBorrowedEventActor(instanceId, false);
    }
    for (const groupId of BOAT_SUPPLY_GROUP_IDS) {
      if (
        groupId !== this.pinnedEventGroupId
        && !this.hasBorrowedGroup(groupId)
      ) {
        this.syncGroup(groupId, snapshot);
      } else if (this.hasBorrowedGroup(groupId)) {
        this.recordsById.get(groupId)!.root.visible = false;
      }
    }
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
    const duration = GENERIC_EVENT_ITEM_USE_DURATION;
    return new Promise((resolve) => {
      this.activeAnimation = {
        root: record.root,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  applyEventAmbientPose(roll: number, lift: number): void {
    if (this.disposed) return;
    this.eventAmbientRoll = roll;
    this.eventAmbientLift = lift;
  }

  applyEventItemPose(instanceId: ItemInstanceId, pose: SupplyAdditivePose): boolean {
    if (this.disposed) return false;
    if (
      this.pinnedEventActorId !== instanceId
      && !this.preparedEventActorIds.has(instanceId)
    ) return false;
    const groupId = this.groupByInstanceId.get(instanceId);
    if (groupId === undefined || this.recordsById.get(groupId)?.visibleCopies === 0) return false;
    const binding = this.eventItemPosesByGroupId.get(groupId);
    if (binding === undefined || binding.instanceId !== instanceId) return false;
    const target = binding.pose;
    target.x = pose.x;
    target.y = pose.y;
    target.z = pose.z;
    target.yaw = pose.yaw;
    target.pitch = pose.pitch;
    target.roll = pose.roll;
    target.scaleX = pose.scaleX;
    target.scaleY = pose.scaleY;
    target.scaleZ = pose.scaleZ;
    return true;
  }

  borrowEventActor(instanceId: ItemInstanceId): BorrowedSupplyActor | null {
    const existing = this.borrowedActors.get(instanceId);
    if (existing !== undefined) {
      this.releaseBorrowedOnSync.delete(instanceId);
      return existing;
    }
    const binding = this.createBorrowedEventBinding(instanceId);
    if (binding === null) return null;
    const actor: BorrowedSupplyActor = {
      instanceId,
      root: binding.root,
      applyPose: (pose) => {
        if (this.borrowedBindings.get(instanceId) !== binding) return;
        const target = binding.pose;
        target.x = pose.x;
        target.y = pose.y;
        target.z = pose.z;
        target.yaw = pose.yaw;
        target.pitch = pose.pitch;
        target.roll = pose.roll;
        target.scaleX = pose.scaleX;
        target.scaleY = pose.scaleY;
        target.scaleZ = pose.scaleZ;
        this.applyBorrowedEventMotion(binding);
      },
      releaseOnNextSync: () => {
        if (this.borrowedBindings.get(instanceId) !== binding) return;
        this.releaseBorrowedOnSync.add(instanceId);
      },
      release: () => {
        if (this.borrowedBindings.get(instanceId) !== binding) return;
        this.releaseBorrowedEventActor(instanceId, true);
      },
    };
    this.borrowedActors.set(instanceId, actor);
    return actor;
  }

  pinEventActor(instanceId: ItemInstanceId): boolean {
    if (this.disposed) return false;
    if (this.pinnedEventActorId === instanceId) {
      this.preparedEventActorIds.add(instanceId);
      this.releasePinnedActorOnSync = false;
      return true;
    }
    const groupId = this.groupByInstanceId.get(instanceId);
    if (groupId === undefined) return false;
    if (this.hasBorrowedGroup(groupId)) return false;
    const previousSelectedItemId = this.eventSelectedItemId;
    if (this.currentSnapshot !== null) {
      this.eventSelectedItemId = instanceId;
      this.syncGroup(groupId, this.currentSnapshot);
    }
    const record = this.recordsById.get(groupId);
    if (
      record === undefined
      || record.visibleCopies === 0
      || record.backingInstanceId !== instanceId
    ) {
      this.eventSelectedItemId = previousSelectedItemId;
      if (this.currentSnapshot !== null) {
        this.syncGroup(groupId, this.currentSnapshot);
      }
      return false;
    }
    if (this.pinnedEventActorId !== null) this.releasePinnedEventActor(true);
    this.pinnedEventActorId = instanceId;
    this.pinnedEventGroupId = groupId;
    this.preparedEventActorIds.add(instanceId);
    const binding = this.eventItemPosesByGroupId.get(groupId);
    if (binding === undefined) {
      this.eventItemPosesByGroupId.set(groupId, {
        instanceId,
        pose: {
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
          roll: 0,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
        },
      });
    } else {
      binding.instanceId = instanceId;
    }
    this.releasePinnedActorOnSync = false;
    return true;
  }

  releaseEventActorOnNextSync(): void {
    if (this.disposed || this.pinnedEventActorId === null) return;
    this.preparedEventActorIds.clear();
    this.releasePinnedActorOnSync = true;
  }

  releaseEventActor(): void {
    if (this.disposed) return;
    this.preparedEventActorIds.clear();
    this.releasePinnedEventActor(true);
  }

  resetEventPoseForFrame(): void {
    if (this.disposed) return;
    this.resetEventPose();
  }

  clearEventPose(): void {
    if (this.disposed) return;
    this.resetEventPose();
    this.restoreEventMotionBase();
  }

  settleEventItemUse(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
  }

  clearEventMotion(): void {
    this.resetEventPose();
    this.cancelActiveAnimation();
    this.preparedEventActorIds.clear();
    this.releasePinnedEventActor(false);
    this.eventItemPosesByGroupId.clear();
    this.releaseAllBorrowedEventActors(false);
    this.restoreEventMotionBase();
    if (this.currentSnapshot !== null) {
      for (const groupId of BOAT_SUPPLY_GROUP_IDS) {
        this.syncGroup(groupId, this.currentSnapshot);
      }
    }
  }

  updatePropAnimations(deltaSeconds: number): void {
    if (this.disposed) return;
    for (const copies of this.copiesById.values()) {
      for (const copy of copies) copy.presentation?.update(deltaSeconds);
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const animation = this.activeAnimation;
    this.applyEventMotion();
    if (animation === null) return;
    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, deltaSeconds),
    );
    const progress = animation.elapsed / animation.duration;
    const eased = progress * progress * (3 - 2 * progress);
    const lift = progress >= 1 ? 0 : Math.sin(Math.PI * eased);
    animation.root.position.y += lift * 0.28;
    animation.root.rotateZ(lift * 0.16);
    if (progress >= 1) {
      this.activeAnimation = null;
      animation.resolve();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearEventMotion();
    this.cancelActiveAnimation();
    this.presentationHiddenItemIds.clear();
    this.eventStowedUntilDay.clear();
    this.disposed = true;
    for (const copies of this.copiesById.values()) {
      for (const copy of copies) copy.presentation?.dispose();
    }
    for (const record of this.recordsById.values()) record.root.removeFromParent();
    this.borrowedActors.clear();
    this.preparedEventActors.clear();
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
      : Object.values(snapshot.inventory)
        .filter((instance) => instance?.type === groupId)
        .filter((instance) => instance?.condition === 'usable' || instance?.condition === 'broken')
        .sort((first, second) => first!.instanceId.localeCompare(second!.instanceId))
        .map((instance) => ({
          instance: instance!,
          condition: instance!.condition,
        }));
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
    record.visibleCopies = groupId === 'carlitos'
      ? 0
      : visibleCopyCount(record.quantity);
    record.backingInstanceId = this.preferredBackingId(
      groupId,
      usableItems.map(({ instance }) => instance.instanceId),
      brokenItems.map(({ instance }) => instance.instanceId),
    );
    if (record.backingInstanceId !== null) {
      const backingIndex = activeItems.findIndex(
        ({ instance }) => instance.instanceId === record.backingInstanceId,
      );
      if (backingIndex > 0) {
        const [backing] = activeItems.splice(backingIndex, 1);
        activeItems.unshift(backing!);
      }
    }
    const copies = this.copiesById.get(groupId)!;
    for (let index = 0; index < copies.length; index += 1) {
      const copy = copies[index]!;
      const hasVisibleSlot = index < record.visibleCopies;
      if (!hasVisibleSlot) {
        copy.root.visible = false;
        continue;
      }
      const activeItem = activeItems[index];
      copy.instanceId = activeItem?.instance.instanceId ?? copy.instanceId;
      copy.condition = activeItem?.condition
        ?? (groupId === 'repairMaterial' || groupId === 'cannedFood' || groupId === 'baitTin'
          ? 'usable'
          : 'lost');
      copy.root.visible = copy.instanceId === null
        || (
          !this.presentationHiddenItemIds.has(copy.instanceId)
          && !this.eventStowedUntilDay.has(copy.instanceId)
        );
      this.applyCopyMaterials(copy);
    }
    record.root.visible = copies.some((copy) => copy.root.visible);
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

  private applyCopyMaterials(copy: CopyBinding): void {
    const broken = copy.condition === 'broken';
    for (const binding of copy.materials) {
      binding.mesh.material = broken ? binding.broken : binding.usable;
    }
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    this.applyEventMotion();
    animation.resolve();
  }

  private resetEventPose(): void {
    this.eventAmbientRoll = 0;
    this.eventAmbientLift = 0;
    for (let index = 0; index < this.eventMotionRecords.length; index += 1) {
      const binding = this.eventItemPosesByGroupId.get(
        this.eventMotionRecords[index]!.groupId,
      );
      if (binding === undefined) continue;
      const pose = binding.pose;
      pose.x = 0;
      pose.y = 0;
      pose.z = 0;
      pose.yaw = 0;
      pose.pitch = 0;
      pose.roll = 0;
      pose.scaleX = 1;
      pose.scaleY = 1;
      pose.scaleZ = 1;
    }
  }

  private releasePinnedEventActor(syncLatestSnapshot: boolean): void {
    const groupId = this.pinnedEventGroupId;
    this.pinnedEventActorId = null;
    this.pinnedEventGroupId = null;
    this.releasePinnedActorOnSync = false;
    this.resetEventPose();
    this.restoreEventMotionBase();
    if (syncLatestSnapshot && groupId !== null && this.currentSnapshot !== null) {
      this.syncGroup(groupId, this.currentSnapshot);
    }
  }

  private createBorrowedEventBinding(
    instanceId: ItemInstanceId,
  ): BorrowedSupplyBinding | null {
    if (this.disposed || this.currentSnapshot === null) return null;
    const groupId = this.groupByInstanceId.get(instanceId);
    if (
      groupId === undefined
      || groupId === this.pinnedEventGroupId
    ) {
      return null;
    }

    const previousSelectedItemId = this.eventSelectedItemId;
    this.eventSelectedItemId = instanceId;
    this.syncGroup(groupId, this.currentSnapshot);
    const record = this.recordsById.get(groupId);
    if (
      record === undefined
      || record.visibleCopies === 0
      || record.backingInstanceId !== instanceId
    ) {
      this.eventSelectedItemId = previousSelectedItemId;
      this.syncGroup(groupId, this.currentSnapshot);
      if (record !== undefined && this.hasBorrowedGroup(groupId)) {
        record.root.visible = false;
      }
      return null;
    }

    const prepared = this.preparedEventActors.get(instanceId);
    if (prepared === undefined) {
      this.eventSelectedItemId = previousSelectedItemId;
      this.syncGroup(groupId, this.currentSnapshot);
      return null;
    }
    for (const binding of prepared.materialBindings) {
      binding.target.material = binding.source.material;
    }
    prepared.heldCopy.visible = true;
    const root = prepared.root;
    record.root.parent!.add(root);

    this.eventSelectedItemId = previousSelectedItemId;
    this.syncGroup(groupId, this.currentSnapshot);
    record.root.visible = false;
    const binding: BorrowedSupplyBinding = {
      groupId,
      motionIndex: BOAT_SUPPLY_GROUP_IDS.indexOf(groupId),
      root,
      copyPosition: prepared.copyPosition,
      copyQuaternion: prepared.copyQuaternion,
      copyScale: prepared.copyScale,
      pose: createIdentitySupplyPose(),
    };
    this.borrowedBindings.set(instanceId, binding);
    this.borrowedCountByGroup.set(
      groupId,
      (this.borrowedCountByGroup.get(groupId) ?? 0) + 1,
    );
    this.releaseBorrowedOnSync.delete(instanceId);
    this.applyBorrowedEventMotion(binding);
    return binding;
  }

  private prepareEventActor(
    instanceId: ItemInstanceId,
    groupId: BoatSupplyGroupId,
  ): void {
    if (this.preparedEventActors.has(instanceId)) return;
    const record = this.recordsById.get(groupId);
    const sourceCopy = record?.root.children[0];
    if (record === undefined || sourceCopy === undefined) return;
    const root = cloneSkeleton(record.root) as Group;
    const heldCopy = root.children[0];
    if (heldCopy === undefined) return;
    root.name = `boat-supply-event:${instanceId}`;
    root.userData.supplyInstanceId = instanceId;
    root.visible = false;
    const copyPosition = heldCopy.position.clone();
    const copyQuaternion = heldCopy.quaternion.clone();
    const copyScale = heldCopy.scale.clone();
    heldCopy.position.set(0, 0, 0);
    heldCopy.quaternion.identity();
    heldCopy.scale.set(1, 1, 1);
    for (let index = 1; index < root.children.length; index += 1) {
      root.children[index]!.visible = false;
    }
    const sourceMeshes: Mesh[] = [];
    const targetMeshes: Mesh[] = [];
    sourceCopy.traverse((object) => {
      if (object instanceof Mesh) sourceMeshes.push(object);
    });
    heldCopy.traverse((object) => {
      if (object instanceof Mesh) targetMeshes.push(object);
    });
    if (sourceMeshes.length !== targetMeshes.length) {
      throw new Error(`Prepared event actor mesh mismatch for ${instanceId}.`);
    }
    this.preparedEventActors.set(instanceId, {
      root,
      heldCopy,
      copyPosition,
      copyQuaternion,
      copyScale,
      materialBindings: sourceMeshes.map((source, index) => ({
        source,
        target: targetMeshes[index]!,
      })),
    });
  }

  private releaseBorrowedEventActor(
    instanceId: ItemInstanceId,
    syncLatestSnapshot: boolean,
  ): void {
    const binding = this.borrowedBindings.get(instanceId);
    if (binding === undefined) return;
    const groupId = binding.groupId;
    this.borrowedBindings.delete(instanceId);
    this.borrowedActors.delete(instanceId);
    this.releaseBorrowedOnSync.delete(instanceId);
    const remaining = (this.borrowedCountByGroup.get(groupId) ?? 1) - 1;
    if (remaining <= 0) this.borrowedCountByGroup.delete(groupId);
    else this.borrowedCountByGroup.set(groupId, remaining);
    binding.root.position.copy(this.basePositionById.get(groupId)!);
    binding.root.quaternion.copy(this.baseQuaternionById.get(groupId)!);
    binding.root.scale.set(1, 1, 1);
    binding.root.visible = false;
    binding.root.removeFromParent();
    if (
      syncLatestSnapshot
      && this.currentSnapshot !== null
      && !this.hasBorrowedGroup(groupId)
    ) {
      this.syncGroup(groupId, this.currentSnapshot);
    }
  }

  private releaseAllBorrowedEventActors(syncLatestSnapshot: boolean): void {
    for (const instanceId of this.borrowedBindings.keys()) {
      this.releaseBorrowedEventActor(instanceId, syncLatestSnapshot);
    }
  }

  private hasBorrowedGroup(groupId: BoatSupplyGroupId): boolean {
    return (this.borrowedCountByGroup.get(groupId) ?? 0) > 0;
  }

  private applyEventMotion(): void {
    for (let index = 0; index < this.eventMotionRecords.length; index += 1) {
      const record = this.eventMotionRecords[index]!;
      const groupId = record.groupId;
      const root = record.root;
      root.position.copy(this.basePositionById.get(groupId)!);
      root.quaternion.copy(this.baseQuaternionById.get(groupId)!);
      root.scale.set(1, 1, 1);
      root.position.y += this.eventAmbientLift;
      root.rotateZ(this.eventAmbientRoll * (1 + index * 0.08));
      if (this.hasBorrowedGroup(groupId)) {
        root.visible = false;
        continue;
      }
      const binding = this.eventItemPosesByGroupId.get(groupId);
      if (binding !== undefined) {
        const pose = binding.pose;
        root.position.x += pose.x;
        root.position.y += pose.y;
        root.position.z += pose.z;
        root.rotateY(pose.yaw);
        root.rotateX(pose.pitch);
        root.rotateZ(pose.roll);
        root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
      }
    }
    for (const binding of this.borrowedBindings.values()) {
      this.applyBorrowedEventMotion(binding);
    }
  }

  private applyBorrowedEventMotion(binding: BorrowedSupplyBinding): void {
    const root = binding.root;
    const pose = binding.pose;
    root.visible = true;
    root.position.copy(this.basePositionById.get(binding.groupId)!);
    root.quaternion.copy(this.baseQuaternionById.get(binding.groupId)!);
    root.scale.set(1, 1, 1);
    root.position.y += this.eventAmbientLift;
    root.rotateZ(this.eventAmbientRoll * (1 + binding.motionIndex * 0.08));
    this.borrowedCopyOffset.copy(binding.copyPosition).applyQuaternion(root.quaternion);
    root.position.add(this.borrowedCopyOffset);
    root.quaternion.multiply(binding.copyQuaternion);
    root.position.x += pose.x;
    root.position.y += pose.y;
    root.position.z += pose.z;
    root.rotateY(pose.yaw);
    root.rotateX(pose.pitch);
    root.rotateZ(pose.roll);
    root.scale.set(
      binding.copyScale.x * pose.scaleX,
      binding.copyScale.y * pose.scaleY,
      binding.copyScale.z * pose.scaleZ,
    );
  }

  private restoreEventMotionBase(): void {
    for (let index = 0; index < this.eventMotionRecords.length; index += 1) {
      const record = this.eventMotionRecords[index]!;
      const groupId = record.groupId;
      record.root.position.copy(this.basePositionById.get(groupId)!);
      record.root.quaternion.copy(this.baseQuaternionById.get(groupId)!);
      record.root.scale.set(1, 1, 1);
    }
  }
}

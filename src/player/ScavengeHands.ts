import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from 'three';
import {
  applyHandJointCurl,
  findImportedHandRig,
  type ImportedHandRig,
} from '../rendering/RiggedHandRig';
import type { EventModelInstance } from '../survival/EventModelLibrary';
import {
  HAND_GESTURE_DURATIONS,
  createScavengeHandPose,
  sampleScavengeHandPoseInto,
  type MutableScavengeHandPose,
  type ScavengeHandGesture,
  type ScavengeHandLocomotion,
} from './scavengeHandAnimation';

export interface ScavengeHandModelFactory {
  create(id: 'riggedHand'): EventModelInstance;
}

interface MutableAnimationFrame {
  locomotion: ScavengeHandLocomotion;
  idleSeconds: number;
  locomotionPhase: number;
  gesture: ScavengeHandGesture | null;
  gestureSeconds: number;
}

function copyHandPose(
  target: MutableScavengeHandPose,
  source: MutableScavengeHandPose,
): void {
  target.left.x = source.left.x;
  target.left.y = source.left.y;
  target.left.z = source.left.z;
  target.left.pitch = source.left.pitch;
  target.left.yaw = source.left.yaw;
  target.left.roll = source.left.roll;
  target.left.curl = source.left.curl;
  target.right.x = source.right.x;
  target.right.y = source.right.y;
  target.right.z = source.right.z;
  target.right.pitch = source.right.pitch;
  target.right.yaw = source.right.yaw;
  target.right.roll = source.right.roll;
  target.right.curl = source.right.curl;
}

function blendHandPose(
  output: MutableScavengeHandPose,
  start: MutableScavengeHandPose,
  target: MutableScavengeHandPose,
  amount: number,
): void {
  const blend = Math.min(1, Math.max(0, amount));
  const inverse = 1 - blend;
  output.left.x = start.left.x * inverse + target.left.x * blend;
  output.left.y = start.left.y * inverse + target.left.y * blend;
  output.left.z = start.left.z * inverse + target.left.z * blend;
  output.left.pitch = start.left.pitch * inverse + target.left.pitch * blend;
  output.left.yaw = start.left.yaw * inverse + target.left.yaw * blend;
  output.left.roll = start.left.roll * inverse + target.left.roll * blend;
  output.left.curl = start.left.curl * inverse + target.left.curl * blend;
  output.right.x = start.right.x * inverse + target.right.x * blend;
  output.right.y = start.right.y * inverse + target.right.y * blend;
  output.right.z = start.right.z * inverse + target.right.z * blend;
  output.right.pitch = start.right.pitch * inverse + target.right.pitch * blend;
  output.right.yaw = start.right.yaw * inverse + target.right.yaw * blend;
  output.right.roll = start.right.roll * inverse + target.right.roll * blend;
  output.right.curl = start.right.curl * inverse + target.right.curl * blend;
}

export class ScavengeHands {
  readonly root = new Group();
  readonly available: boolean;

  private readonly leftWrist = new Group();
  private readonly rightWrist = new Group();
  private readonly leftVisual = new Group();
  private readonly rightVisual = new Group();
  private readonly currentPose = createScavengeHandPose();
  private readonly targetPose = createScavengeHandPose();
  private readonly gestureStartPose = createScavengeHandPose();
  private readonly animationFrame: MutableAnimationFrame = {
    locomotion: 'idle',
    idleSeconds: 0,
    locomotionPhase: 0,
    gesture: null,
    gestureSeconds: 0,
  };
  private leftModel: EventModelInstance | null = null;
  private rightModel: EventModelInstance | null = null;
  private leftRig: ImportedHandRig | null = null;
  private rightRig: ImportedHandRig | null = null;
  private locomotionPhase = 0;
  private idleSeconds = 0;
  private gesture: ScavengeHandGesture | null = null;
  private gestureSeconds = 0;
  private disposed = false;

  constructor(
    camera: PerspectiveCamera,
    models?: ScavengeHandModelFactory,
  ) {
    this.root.name = 'scavenge-hands';
    this.root.visible = false;
    this.root.userData.gesture = null;
    this.leftWrist.name = 'scavenge-hand:left';
    this.rightWrist.name = 'scavenge-hand:right';
    this.leftVisual.scale.set(-0.22, 0.22, 0.22);
    this.leftVisual.rotation.z = Math.PI / 2;
    this.rightVisual.scale.setScalar(0.22);
    this.rightVisual.rotation.z = -Math.PI / 2;
    this.leftWrist.add(this.leftVisual);
    this.rightWrist.add(this.rightVisual);
    this.root.add(this.leftWrist, this.rightWrist);
    camera.add(this.root);

    if (models === undefined) {
      this.available = false;
      return;
    }

    let left: EventModelInstance | null = null;
    let right: EventModelInstance | null = null;
    try {
      left = models.create('riggedHand');
      right = models.create('riggedHand');
      const leftRig = findImportedHandRig(left.root);
      const rightRig = findImportedHandRig(right.root);
      if (leftRig === null || rightRig === null) {
        throw new Error('Scavenge hand model has an invalid rig.');
      }
      this.prepareModel(left.root);
      this.prepareModel(right.root);
      this.leftVisual.add(left.root);
      this.rightVisual.add(right.root);
      this.leftModel = left;
      this.rightModel = right;
      this.leftRig = leftRig;
      this.rightRig = rightRig;
      this.available = true;
    } catch {
      left?.root.removeFromParent();
      right?.root.removeFromParent();
      left?.dispose();
      right?.dispose();
      this.available = false;
    }
  }

  update(
    deltaSeconds: number,
    movedDistance: number,
    grounded: boolean,
    sprinting: boolean,
    visible: boolean,
  ): void {
    if (this.disposed) return;
    if (!visible) {
      this.hideAndReset();
      return;
    }
    if (!this.available || this.leftRig === null || this.rightRig === null) {
      this.root.visible = false;
      return;
    }

    const moving = grounded && movedDistance > 1e-5;
    const locomotion = !grounded
      ? 'steady'
      : moving
        ? sprinting ? 'sprint' : 'walk'
        : 'idle';
    const distance = Number.isFinite(movedDistance) ? movedDistance : 0;
    if (locomotion === 'walk') this.locomotionPhase += distance / 1.3;
    if (locomotion === 'sprint') this.locomotionPhase += distance / 1.8;
    const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0
      ? deltaSeconds
      : 0;
    if (locomotion === 'idle') this.idleSeconds += delta;
    if (this.gesture !== null) {
      this.gestureSeconds += delta;
      if (this.gestureSeconds >= HAND_GESTURE_DURATIONS[this.gesture]) {
        this.gesture = null;
        this.gestureSeconds = 0;
      }
    }

    this.animationFrame.locomotion = locomotion;
    this.animationFrame.idleSeconds = this.idleSeconds;
    this.animationFrame.locomotionPhase = this.locomotionPhase;
    this.animationFrame.gesture = this.gesture;
    this.animationFrame.gestureSeconds = this.gestureSeconds;
    sampleScavengeHandPoseInto(this.targetPose, this.animationFrame);
    if (this.gesture !== null && this.gestureSeconds < 0.08) {
      blendHandPose(
        this.currentPose,
        this.gestureStartPose,
        this.targetPose,
        this.gestureSeconds / 0.08,
      );
    } else {
      copyHandPose(this.currentPose, this.targetPose);
    }
    this.applyPose();
    this.root.userData.gesture = this.gesture;
    this.root.visible = true;
  }

  playGesture(kind: ScavengeHandGesture): void {
    if (this.disposed || !this.available) return;
    copyHandPose(this.gestureStartPose, this.currentPose);
    this.gesture = kind;
    this.gestureSeconds = 0;
    this.root.userData.gesture = kind;
  }

  hideAndReset(): void {
    if (this.disposed) return;
    this.locomotionPhase = 0;
    this.idleSeconds = 0;
    this.gesture = null;
    this.gestureSeconds = 0;
    this.animationFrame.locomotion = 'idle';
    this.animationFrame.idleSeconds = 0;
    this.animationFrame.locomotionPhase = 0;
    this.animationFrame.gesture = null;
    this.animationFrame.gestureSeconds = 0;
    sampleScavengeHandPoseInto(this.currentPose, this.animationFrame);
    copyHandPose(this.targetPose, this.currentPose);
    copyHandPose(this.gestureStartPose, this.currentPose);
    if (this.available && this.leftRig !== null && this.rightRig !== null) {
      this.applyPose();
    }
    this.root.userData.gesture = null;
    this.root.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.leftModel?.root.removeFromParent();
    this.rightModel?.root.removeFromParent();
    this.leftModel?.dispose();
    this.rightModel?.dispose();
    this.leftModel = null;
    this.rightModel = null;
    this.leftRig = null;
    this.rightRig = null;
    this.root.clear();
  }

  private prepareModel(root: Group): void {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.color.multiplyScalar(0.82);
        material.roughness = Math.max(material.roughness, 0.92);
        material.metalness = 0;
        material.emissive.setHex(0x241812);
        material.emissiveIntensity = 0.2;
        material.flatShading = true;
        material.needsUpdate = true;
      }
    });
  }

  private applyPose(): void {
    this.leftWrist.position.set(
      this.currentPose.left.x,
      this.currentPose.left.y,
      this.currentPose.left.z,
    );
    this.leftWrist.rotation.set(
      this.currentPose.left.pitch,
      this.currentPose.left.yaw,
      this.currentPose.left.roll,
    );
    this.rightWrist.position.set(
      this.currentPose.right.x,
      this.currentPose.right.y,
      this.currentPose.right.z,
    );
    this.rightWrist.rotation.set(
      this.currentPose.right.pitch,
      this.currentPose.right.yaw,
      this.currentPose.right.roll,
    );
    applyHandJointCurl(this.leftRig!.joints, this.currentPose.left.curl);
    applyHandJointCurl(this.rightRig!.joints, this.currentPose.right.curl);
  }
}

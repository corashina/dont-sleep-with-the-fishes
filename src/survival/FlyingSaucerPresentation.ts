import {
  AdditiveBlending, BufferGeometry, CylinderGeometry, DoubleSide, Group, Material,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, ShaderMaterial,
  PlaneGeometry, PointLight, SphereGeometry, SpotLight, TorusGeometry, Vector3,
} from 'three';
import { hasRenderableBounds } from '../rendering/modelPresentation';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { EventChoicePresentation, FocusedEventPresentation, FocusedEventPresentationDependencies } from './FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';
import { eventSideFromSeed } from './eventVariant';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

export const UFO_ABDUCTION_DURATION = 11;
const CRUISE_SPEED = 10;
type Animation = 'reveal' | 'hide' | 'pass' | 'abduct';
const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export class FlyingSaucerPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly craft = new Group();
  private readonly beamMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    uniforms: { strength: { value: 0 } },
    vertexShader: `varying vec2 beamUv;
      void main() { beamUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float strength; varying vec2 beamUv;
      void main() {
        float edge = smoothstep(0.0, 0.12, beamUv.y);
        float bands = 0.88 + 0.12 * sin(beamUv.y * 85.0);
        gl_FragColor = vec4(vec3(0.32, 0.86, 0.81), strength * edge * bands * (0.13 + 0.38 * beamUv.y));
      }`,
  });
  private readonly beam = new Mesh(new CylinderGeometry(1.15, 5.5, 1, 48, 1, true), this.beamMaterial);
  private readonly light = new SpotLight(0xa2ffe8, 0, 35, 0.36, 0.65, 1);
  private readonly runningLight = new PointLight(0xa2ffe8, 6, 8, 2);
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly exit = new Vector3();
  private readonly reactionStart = new Vector3();
  private readonly overhead = new Vector3(0, 18, -0.5);
  private readonly cameraStart = new Vector3();
  private readonly cameraStartQuaternion = new Quaternion();
  private readonly cameraTargetQuaternion = new Quaternion();
  private readonly parentQuaternion = new Quaternion();
  private readonly lookMatrix = new Matrix4();
  private readonly worldCamera = new Vector3();
  private readonly worldTarget = new Vector3();
  private readonly animation = new TimedPresentationAnimation<Animation>(
    (kind, _time, progress) => this.sample(kind, progress),
    (kind) => this.finish(kind),
  );
  private side = 1;
  private flightSeconds = 0;
  private reactionBank = 0;
  private cruising = false;
  private ownsCamera = false;
  private cameraLift = 0;
  private cameraTurn = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly dependencies: FocusedEventPresentationDependencies) {
    this.root.name = 'focused-event:flying-saucer';
    this.root.userData.motionSource = 'steady-authored-path';
    const model = dependencies.propModels.createEventModel('flyingSaucer')?.root;
    if (model === undefined || !hasRenderableBounds(model)) throw new Error('Missing required Flying Saucer event model.');
    model.name = 'event-model:flyingSaucer';
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.emissive.setHex(0x5e8c87);
        material.emissiveIntensity = 0.5;
        material.roughness = Math.max(0.5, material.roughness);
      }
    });
    this.craft.name = 'ufo-craft';
    this.craft.add(model);
    const rim = new Mesh(new TorusGeometry(3.6, 0.055, 6, 64), new MeshBasicMaterial({ color: 0xa8ddce }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -1.55;
    this.craft.add(rim);
    const lamp = new Mesh(new SphereGeometry(0.32, 12, 8), new MeshBasicMaterial({
      color: 0xc4fff0, toneMapped: false,
    }));
    lamp.name = 'ufo-running-light';
    lamp.position.y = -1.9;
    const glow = new Mesh(new PlaneGeometry(2.4, 2.4), new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
      vertexShader: `varying vec2 glowUv;
        void main() {
          glowUv = uv;
          vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          center.xy += position.xy;
          gl_Position = projectionMatrix * center;
        }`,
      fragmentShader: `varying vec2 glowUv;
        void main() {
          float radius = length(glowUv - 0.5) * 2.0;
          float halo = exp(-radius * radius * 5.0) * (1.0 - smoothstep(0.65, 1.0, radius));
          gl_FragColor = vec4(0.42, 1.0, 0.83, halo * 0.65);
        }`,
    }));
    glow.position.copy(lamp.position);
    this.runningLight.position.copy(lamp.position);
    this.craft.add(lamp, glow, this.runningLight);
    this.beam.name = 'ufo-abduction-beam';
    this.beam.frustumCulled = false;
    this.light.target.position.set(0, -0.5, 0);
    this.root.add(this.craft, this.beam, this.light, this.light.target);
    collectMeshResources(this.root, this.geometries, this.materials);
    this.clear();
  }

  itemAimTarget(): Group | null { return this.staged ? this.craft : null; }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.clear();
    this.side = eventSideFromSeed(variantSeed);
    this.exit.set(-155 * this.side, 44, -165);
    this.craft.rotation.set(0, 0, 0);
    this.sampleFlyby(0);
    this.root.visible = true;
    this.staged = true;
    this.root.userData.state = 'staged';
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stage();
    return this.startAnimation('reveal', 2);
  }

  playChoice(choice: EventChoicePresentation): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (choice.choiceId === 'flareGun' || choice.choiceId === 'flashlight') return Promise.resolve();
    if (choice.choiceId !== 'sleep') throw new Error(`Unsupported UFO choice: ${choice.choiceId}`);
    this.acquireCamera();
    return this.startAnimation('hide', 0.8);
  }

  react(result: EventResultPresentation, _outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'flying-saucer') throw new Error(`UFO received result for ${result.eventId}`);
    this.cruising = false;
    this.reactionStart.copy(this.craft.position);
    this.reactionBank = this.craft.rotation.z;
    this.acquireCamera();
    if (result.resultId === 'ufo-pass') return this.startAnimation('pass', 5);
    if (result.resultId === 'ufo-abduction') return this.startAnimation('abduct', UFO_ABDUCTION_DURATION);
    throw new Error(`Unsupported UFO result: ${result.resultId}`);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged || delta < 0) return;
    const wasCruising = this.cruising;
    this.animation.update(time, delta);
    if (wasCruising && this.cruising) this.sampleFlyby(this.flightSeconds + delta);
    this.craft.rotation.y = time * 0.12;
    if (this.ownsCamera) this.applyCamera();
  }

  settleForVisibilityChange(): void {
    if (!this.disposed) this.animation.settle();
  }

  clear(): void {
    this.animation.cancel();
    this.cruising = false;
    this.flightSeconds = 0;
    this.staged = false;
    this.root.visible = false;
    this.beam.visible = false;
    this.beamMaterial.uniforms.strength!.value = 0;
    this.light.intensity = 0;
    if (this.ownsCamera) {
      this.dependencies.camera.position.copy(this.cameraStart);
      this.dependencies.camera.quaternion.copy(this.cameraStartQuaternion);
    }
    this.ownsCamera = false;
    this.cameraLift = 0;
    this.cameraTurn = 0;
    this.root.userData.state = 'idle';
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.light.dispose();
    this.runningLight.dispose();
    this.root.removeFromParent();
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

  private startAnimation(kind: Animation, duration: number): Promise<void> {
    const pending = this.animation.start(kind, duration);
    this.root.userData.state = kind;
    this.sample(kind, 0);
    return pending;
  }

  private sample(kind: Animation, progress: number): void {
    if (kind === 'reveal') this.sampleFlyby(progress * 2);
    if (kind === 'hide') this.cameraLift = -0.65 * smooth(progress);
    if (kind === 'pass') this.cameraLift = -0.65;
    if (kind === 'pass') this.sampleApproach(this.exit, progress, 8);
    if (kind === 'abduct') {
      const seconds = progress * UFO_ABDUCTION_DURATION;
      this.sampleApproach(this.overhead, seconds / 5, 12);
      const beamStrength = smooth((seconds - 5) / 1.5);
      this.beam.visible = beamStrength > 0;
      const beamHeight = this.overhead.y - 0.9;
      this.beam.position.set(this.overhead.x, beamHeight / 2 - 0.5, this.overhead.z);
      this.beam.scale.y = beamHeight;
      this.beamMaterial.uniforms.strength!.value = beamStrength;
      this.light.position.copy(this.craft.position);
      this.light.intensity = beamStrength * 45;
      this.cameraTurn = smooth(seconds / 4);
      this.cameraLift = smooth((seconds - 6.5) / 4.5) * 12;
    }
    if (this.ownsCamera) this.applyCamera();
  }

  private sampleFlyby(seconds: number): void {
    this.flightSeconds = seconds;
    this.craft.position.set(
      this.side * (110 - CRUISE_SPEED * seconds),
      34 + 3 * Math.sin(seconds * 0.26),
      -125 + 12 * Math.sin(seconds * 0.19),
    );
    this.craft.rotation.z = this.side * 0.04 * Math.sin(seconds * 0.19);
  }

  private sampleApproach(target: Vector3, progress: number, rise: number): void {
    const t = smooth(progress);
    const arc = 4 * t * (1 - t);
    this.craft.position.lerpVectors(this.reactionStart, target, t);
    this.craft.position.x += this.side * 18 * arc;
    this.craft.position.y += rise * arc;
    this.craft.position.z -= 10 * arc;
    this.craft.rotation.z = this.reactionBank * (1 - t) + this.side * 0.06 * arc;
  }

  private finish(kind: Animation): void {
    this.cruising = kind === 'reveal';
    this.root.userData.state = kind === 'abduct' ? 'abducted' : kind === 'pass' ? 'passed' : 'revealed';
    if (kind === 'pass') this.root.visible = false;
  }

  private acquireCamera(): void {
    if (this.ownsCamera) return;
    this.dependencies.takeCameraControl();
    this.cameraStart.copy(this.dependencies.camera.position);
    this.cameraStartQuaternion.copy(this.dependencies.camera.quaternion);
    this.ownsCamera = true;
  }

  private applyCamera(): void {
    const camera = this.dependencies.camera;
    camera.position.copy(this.cameraStart);
    camera.position.y += this.cameraLift;
    camera.getWorldPosition(this.worldCamera);
    this.craft.getWorldPosition(this.worldTarget);
    this.lookMatrix.lookAt(this.worldCamera, this.worldTarget, camera.up);
    this.cameraTargetQuaternion.setFromRotationMatrix(this.lookMatrix);
    if (camera.parent !== null) {
      camera.parent.getWorldQuaternion(this.parentQuaternion).invert();
      this.cameraTargetQuaternion.premultiply(this.parentQuaternion);
    }
    camera.quaternion.copy(this.cameraStartQuaternion).slerp(this.cameraTargetQuaternion, this.cameraTurn);
  }
}

import {
  AdditiveBlending, BufferGeometry, CubicBezierCurve3, CylinderGeometry, DoubleSide, Group, Material,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, ShaderMaterial,
  PlaneGeometry, PointLight, SphereGeometry, SpotLight, TorusGeometry, Vector3,
} from 'three';
import { hasRenderableBounds } from '../rendering/modelPresentation';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';
import type { EventChoicePresentation, FocusedEventPresentation, FocusedEventPresentationDependencies } from './FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';
import { eventSideFromSeed } from './eventVariant';
import { TimedPresentationAnimation } from './TimedPresentationAnimation';

const CRUISE_SPEED = 10;
const APPROACH_END = 5;
const BEAM_END = 8.2;
const DEPART_START = 8;
const DEPART_DURATION = 3.5;
export const UFO_BEAM_DURATION = DEPART_START + DEPART_DURATION;
const CAMERA_RELEASE_START = 9.3;
const BEAM_EMITTER_Y = -1.9;
const PLAYER_BEAM_DROP = 0.6;
const VELOCITY_STEP = 1 / 30;
const BANK_PER_SPEED = 0.008;
const MAX_BANK = 0.35;
type Animation = 'reveal' | 'pass' | 'beam';
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOut = (value: number): number => {
  const t = clamp01(value);
  return 1 - (1 - t) * (1 - t);
};
const easeIn = (value: number): number => {
  const t = clamp01(value);
  return t * t;
};
const bank = (speed: number, weight: number): number => (
  Math.max(-MAX_BANK, Math.min(MAX_BANK, speed * BANK_PER_SPEED)) * weight
);

export class FlyingSaucerPresentation implements FocusedEventPresentation {
  readonly root = new Group();
  private readonly craft = new Group();
  private readonly hull = new Group();
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
  private readonly beam = new Mesh(new CylinderGeometry(0.9, 3.4, 1, 48, 1, true), this.beamMaterial);
  private readonly light = new SpotLight(0xa2ffe8, 0, 35, 0.36, 0.65, 1);
  private readonly runningLight = new PointLight(0xa2ffe8, 6, 8, 2);
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly approach = new CubicBezierCurve3();
  private readonly departure = new CubicBezierCurve3();
  private readonly hover = new Vector3();
  private readonly velocity = new Vector3();
  private readonly beamSource = new Vector3();
  private readonly beamTarget = new Vector3();
  private readonly beamAxis = new Vector3();
  private readonly beamUp = new Vector3(0, 1, 0);
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
  private cruising = false;
  private ownsCamera = false;
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
    this.hull.add(model);
    this.craft.add(this.hull);
    const rim = new Mesh(new TorusGeometry(3.6, 0.055, 6, 64), new MeshBasicMaterial({ color: 0xa8ddce }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -1.55;
    this.hull.add(rim);
    const lamp = new Mesh(new SphereGeometry(0.32, 12, 8), new MeshBasicMaterial({
      color: 0xc4fff0, toneMapped: false,
    }));
    lamp.name = 'ufo-running-light';
    lamp.position.y = BEAM_EMITTER_Y;
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
    this.beam.name = 'ufo-beam';
    this.beam.frustumCulled = false;
    this.root.add(this.craft, this.beam, this.light, this.light.target);
    collectMeshResources(this.root, this.geometries, this.materials);
    this.clear();
  }

  itemAimTarget(): Group | null { return this.staged ? this.craft : null; }

  stage(variantSeed = 0): void {
    if (this.disposed) return;
    this.clear();
    this.side = eventSideFromSeed(variantSeed);
    this.craft.rotation.set(0, 0, 0);
    this.craft.scale.setScalar(1);
    this.sampleFlyby(0);
    this.root.visible = true;
    this.staged = true;
    this.cruising = true;
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
    return Promise.resolve();
  }

  react(result: EventResultPresentation, _outcome: ActionOutcome): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (result.eventId !== 'flying-saucer') throw new Error(`UFO received result for ${result.eventId}`);
    if (result.resultId === 'ufo-pass') return this.startAnimation('pass', 5);
    this.cruising = false;
    this.planFlight();
    this.acquireCamera();
    if (result.resultId === 'ufo-beam-hit') return this.startAnimation('beam', UFO_BEAM_DURATION);
    throw new Error(`Unsupported UFO result: ${result.resultId}`);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged || delta < 0) return;
    if (this.cruising) this.sampleFlyby(this.flightSeconds + delta);
    this.animation.update(time, delta);
    this.hull.rotation.y = time * 0.12;
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
    if (kind === 'beam') this.sampleBeam(progress * UFO_BEAM_DURATION);
    if (this.ownsCamera) this.applyCamera();
  }

  private sampleBeam(seconds: number): void {
    if (seconds < DEPART_START) {
      this.sampleCurve(this.approach, easeOut, seconds, APPROACH_END, smooth(seconds / 0.8));
    } else {
      const flight = seconds - DEPART_START;
      this.sampleCurve(this.departure, easeIn, flight, DEPART_DURATION, smooth(flight));
    }
    this.craft.scale.setScalar(1 - smooth((seconds - UFO_BEAM_DURATION + 0.5) / 0.5));
    const hold = smooth((seconds - APPROACH_END + 0.6) / 0.8) * (1 - smooth((seconds - DEPART_START) / 0.5));
    this.craft.position.y += 0.35 * Math.sin(seconds * 2.2) * hold;
    this.craft.rotation.x += 0.16 * hold;
    const flicker = seconds < APPROACH_END + 0.45
      ? 0.55 + 0.45 * Math.sin(seconds * 70)
      : 0.92 + 0.08 * Math.sin(seconds * 19);
    const fade = 1 - smooth((seconds - BEAM_END + 0.5) / 0.5);
    this.sampleBeamMesh(smooth((seconds - APPROACH_END) / 0.45) * fade * flicker);
    const release = smooth((seconds - CAMERA_RELEASE_START) / (UFO_BEAM_DURATION - CAMERA_RELEASE_START));
    this.cameraTurn = smooth(seconds / 2.5) * (1 - release);
  }

  private sampleCurve(
    curve: CubicBezierCurve3,
    ease: (value: number) => number,
    seconds: number,
    duration: number,
    bankWeight: number,
  ): void {
    curve.getPoint(ease(seconds / duration), this.craft.position);
    curve.getPoint(ease((seconds + VELOCITY_STEP) / duration), this.velocity);
    this.velocity.sub(this.craft.position).divideScalar(VELOCITY_STEP);
    this.craft.rotation.x = bank(this.velocity.z, bankWeight);
    this.craft.rotation.z = bank(-this.velocity.x, bankWeight);
  }

  private sampleBeamMesh(strength: number): void {
    this.beam.visible = strength > 0.001;
    this.beamMaterial.uniforms.strength!.value = strength;
    this.light.intensity = strength * 45;
    if (!this.beam.visible) return;
    this.beamSource.set(0, BEAM_EMITTER_Y, 0).applyQuaternion(this.craft.quaternion).add(this.craft.position);
    this.playerPosition(this.beamTarget).y -= PLAYER_BEAM_DROP;
    this.beamAxis.subVectors(this.beamSource, this.beamTarget);
    const length = this.beamAxis.length();
    this.beam.position.addVectors(this.beamSource, this.beamTarget).multiplyScalar(0.5);
    this.beam.quaternion.setFromUnitVectors(this.beamUp, this.beamAxis.divideScalar(length));
    this.beam.scale.y = length;
    this.light.position.copy(this.beamSource);
    this.light.target.position.copy(this.beamTarget);
  }

  private planFlight(): void {
    const start = this.craft.position;
    const away = -this.side;
    this.playerPosition(this.hover);
    this.hover.x -= away * 1.5;
    this.hover.y += 11;
    this.hover.z -= 8;
    this.approach.v0.copy(start);
    this.approach.v1.set(start.x + away * CRUISE_SPEED * APPROACH_END / 6, start.y, start.z);
    this.approach.v2.set(this.hover.x - away * 12, this.hover.y + 7, this.hover.z - 16);
    this.approach.v3.copy(this.hover);
    this.departure.v0.copy(this.hover);
    this.departure.v1.set(this.hover.x, this.hover.y + 6, this.hover.z);
    this.departure.v2.set(this.hover.x + away * 30, this.hover.y + 25, this.hover.z - 50);
    this.departure.v3.set(this.hover.x + away * 120, this.hover.y + 70, this.hover.z - 200);
  }

  private playerPosition(target: Vector3): Vector3 {
    this.dependencies.camera.getWorldPosition(target);
    return this.root.worldToLocal(target);
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

  private finish(kind: Animation): void {
    this.cruising = kind !== 'beam';
    if (kind === 'beam') this.root.visible = false;
    this.root.userData.state = kind === 'beam' ? 'hit' : kind === 'pass' ? 'passed' : 'revealed';
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

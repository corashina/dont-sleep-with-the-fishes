import { Euler, Group, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { SinkingBoatBreakup } from './SinkingBoatBreakup';

export const SINKING_BREAK_TIME = 2.15;
export const SINKING_FALL_TIME = SINKING_BREAK_TIME + 0.25;
export const SINKING_BLACKOUT_TIME = SINKING_BREAK_TIME + 0.6;
export const SINKING_DURATION = SINKING_BLACKOUT_TIME + 1;
export type SinkingSoundCue = 'strain' | 'break' | 'finish';

/** Creak, crack, visible hull failure, brief fall, then an opaque cut above the water. */
export class SinkingEndingPresentation {
  private readonly blackout = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    // Render after transparent water and effects, with fully opaque fragment output.
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
  }));
  private readonly boatPosition: Vector3;
  private readonly boatRotation: Euler;
  private readonly cameraPosition: Vector3;
  private readonly cameraRotation: Euler;
  private readonly breakup: SinkingBoatBreakup;
  private lastTime = -1;
  private disposed = false;

  constructor(
    private readonly boatRig: Group,
    private readonly cameraRig: Group,
    camera: PerspectiveCamera,
    private readonly onSound: (cue: SinkingSoundCue) => void,
  ) {
    this.boatPosition = boatRig.position.clone();
    this.boatRotation = boatRig.rotation.clone();
    this.cameraPosition = cameraRig.position.clone();
    this.cameraRotation = cameraRig.rotation.clone();
    this.breakup = new SinkingBoatBreakup(boatRig);
    this.blackout.name = 'sinking-blackout';
    this.blackout.frustumCulled = false;
    this.blackout.renderOrder = 100;
    this.blackout.visible = false;
    camera.add(this.blackout);
  }

  apply(elapsed: number): void {
    if (this.disposed) return;
    const time = Math.max(0, Math.min(SINKING_DURATION, elapsed));
    this.emitSound(time, 0, 'strain');
    this.emitSound(time, SINKING_BREAK_TIME, 'break');
    this.emitSound(time, SINKING_DURATION, 'finish');
    this.lastTime = time;
    const progress = Math.min(1, time / SINKING_BREAK_TIME);
    const strain = progress * progress * (3 - 2 * progress);
    const fracture = Math.max(0, Math.min(1, (time - SINKING_BREAK_TIME - 0.08) / 0.2));
    const fall = Math.max(0, Math.min(1, (time - SINKING_FALL_TIME) / (SINKING_BLACKOUT_TIME - SINKING_FALL_TIME)));
    this.breakup.apply(fracture);
    this.boatRig.position.copy(this.boatPosition);
    this.boatRig.position.y -= strain * 0.14;
    this.boatRig.rotation.copy(this.boatRotation);
    this.boatRig.rotation.x += strain * 0.028;
    this.boatRig.rotation.z += strain * 0.075 + fracture * 0.06;
    this.cameraRig.position.copy(this.cameraPosition);
    this.cameraRig.position.y -= strain * 0.1 + fall * fall * 0.65;
    this.cameraRig.rotation.copy(this.cameraRotation);
    this.cameraRig.rotation.x += strain * 0.035 - fall * 0.08;
    this.cameraRig.rotation.z += strain * 0.045 + fall * 0.025;
    this.blackout.visible = time >= SINKING_BLACKOUT_TIME;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.lastTime >= 0 && this.lastTime < SINKING_DURATION) this.onSound('finish');
    this.blackout.removeFromParent();
    this.blackout.geometry.dispose();
    this.blackout.material.dispose();
    this.breakup.dispose();
    this.boatRig.position.copy(this.boatPosition);
    this.boatRig.rotation.copy(this.boatRotation);
    this.cameraRig.position.copy(this.cameraPosition);
    this.cameraRig.rotation.copy(this.cameraRotation);
  }

  private emitSound(time: number, boundary: number, cue: SinkingSoundCue): void {
    if (this.lastTime < boundary && time >= boundary) this.onSound(cue);
  }
}

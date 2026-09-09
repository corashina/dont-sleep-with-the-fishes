import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { clamp01Unchecked as clamp01, smoothstepUnchecked as smoothstep } from './animationMath';
import {
  CHEST_DIG_END_SECONDS, CHEST_SEARCH_END_SECONDS, CHEST_STROKE_SECONDS, SHOVEL_THROW_PHASE,
  sampleShovelStroke, type ShovelStrokePose,
} from './midnightTourChoreography';

export class MidnightShovelAnimation {
  readonly root = new Group();
  readonly pose: ShovelStrokePose = {
    x: 0, y: 0, z: 0, pitch: 0, roll: 0, yaw: 0,
    impact: 0, excavation: 0, deposit: 0, contacts: 0, phase: 0,
  };
  private readonly bladePivot = new Group();
  private readonly soil = new Group();
  private readonly soilOffset = new Vector3();
  private readonly soilLaunches: Vector3[][] = [];

  constructor(model: Group, bladeTipY: number, origin: Readonly<Vector3>) {
    this.root.name = 'midnight-tour-shovel';
    this.root.position.copy(origin);
    this.bladePivot.name = 'midnight-tour-shovel-blade-pivot';
    model.position.y -= bladeTipY;
    this.bladePivot.add(model);
    this.root.add(this.bladePivot, this.soil);
    this.soil.name = 'midnight-tour-thrown-soil';
    const geometry = new IcosahedronGeometry(0.055, 0);
    const material = new MeshStandardMaterial({ color: 0x74553a, roughness: 1, flatShading: true });
    for (let index = 0; index < 4; index += 1) {
      const clod = new Mesh(geometry, material);
      this.soil.add(clod);
    }
    for (let stroke = 0; stroke < 3; stroke += 1) {
      sampleShovelStroke(CHEST_SEARCH_END_SECONDS + (stroke + SHOVEL_THROW_PHASE) * CHEST_STROKE_SECONDS, this.pose);
      this.bladePivot.rotation.set(this.pose.pitch, this.pose.yaw, this.pose.roll);
      this.bladePivot.position.set(this.pose.x, this.pose.y, this.pose.z);
      this.soilLaunches.push(this.soil.children.map((_, index) => new Vector3(
        (index - 1.5) * 0.035, 0.045, 0.025,
      ).applyQuaternion(this.bladePivot.quaternion).add(this.bladePivot.position)));
    }
    this.update(0);
  }

  update(elapsedSeconds: number): void {
    sampleShovelStroke(elapsedSeconds, this.pose);
    const enter = smoothstep(clamp01((elapsedSeconds - CHEST_SEARCH_END_SECONDS + 0.55) / 0.55));
    const exit = smoothstep(clamp01((elapsedSeconds - CHEST_DIG_END_SECONDS) / 0.65));
    const carry = 1 - enter + exit;
    this.bladePivot.visible = enter > 0 && exit < 1;
    this.bladePivot.position.set(this.pose.x + carry * 0.35, this.pose.y - carry * 0.9, this.pose.z + carry * 0.5);
    this.bladePivot.rotation.set(this.pose.pitch, this.pose.yaw, this.pose.roll);
    this.updateSoil(elapsedSeconds);
  }

  private updateSoil(elapsedSeconds: number): void {
    const phase = this.pose.phase;
    this.soil.visible = elapsedSeconds < CHEST_DIG_END_SECONDS && phase >= 0.58;
    if (!this.soil.visible) return;
    const flight = clamp01((phase - SHOVEL_THROW_PHASE) / (1 - SHOVEL_THROW_PHASE));
    const stroke = Math.min(2, Math.floor((elapsedSeconds - CHEST_SEARCH_END_SECONDS) / CHEST_STROKE_SECONDS));
    for (let index = 0; index < this.soil.children.length; index += 1) {
      const clod = this.soil.children[index]!;
      if (phase < SHOVEL_THROW_PHASE) {
        this.soilOffset.set((index - 1.5) * 0.035, 0.045, 0.025);
        clod.position.copy(this.soilOffset).applyQuaternion(this.bladePivot.quaternion).add(this.bladePivot.position);
      } else {
        const launch = this.soilLaunches[stroke]![index]!;
        clod.position.set(
          launch.x + (-0.52 + (index - 1.5) * 0.045 - launch.x) * flight,
          launch.y + (0.2 - launch.y) * flight + Math.sin(flight * Math.PI) * 0.18,
          launch.z + (-0.05 + Math.sin(index * 2) * 0.045 - launch.z) * flight,
        );
      }
      clod.rotation.set(index + flight * 4, flight * (index + 2), index * 0.8);
      const size = 1 - smoothstep(clamp01((flight - 0.8) / 0.2));
      clod.scale.set(size, size * (0.6 + index * 0.13), size * 0.8);
    }
  }
}

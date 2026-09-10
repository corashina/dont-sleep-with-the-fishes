import {
  CircleGeometry, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Vector2,
} from 'three';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import { EVENT_MODEL_SPECS } from '../world/eventModelManifest';

export const CAMP_RESULT_DURATION_SECONDS = 8;

const LOG_PLACEMENTS = [
  [-1.05, 0.3, -0.4, 1],
  [0.95, -0.65, 0.7, 0.8],
  [1.05, -0.45, -0.25, 0.6],
] as const;

/** Owns the camp pose. The enclosing event owns and disposes mesh resources. */
export class MidnightCampPresentation {
  readonly root = new Group();
  private readonly flames: Group[] = [];
  private readonly light = new PointLight(0xffa14d, 1.5, 3, 2);

  constructor(propModels: PropModelLibrary) {
    this.root.name = 'midnight-tour-abandoned-camp';
    const fire = propModels.createEventModel('midnightCampfire');
    if (fire === null) throw new Error('Missing required Midnight Tour campfire model.');
    fire.root.position.y = -EVENT_MODEL_SPECS.midnightCampfire.normalizedBounds.min[1];
    this.root.add(fire.root);
    for (const [x, z, rotation, scale] of LOG_PLACEMENTS) {
      const log = propModels.createEventModel('midnightWoodLog');
      if (log === null) throw new Error('Missing required Midnight Tour wood log model.');
      log.root.scale.setScalar(scale);
      log.root.rotation.y = rotation;
      log.root.position.set(x, -EVENT_MODEL_SPECS.midnightWoodLog.normalizedBounds.min[1] * scale, z);
      this.root.add(log.root);
    }
    this.buildFire();
    this.update(0);
  }

  update(time: number): void {
    for (let index = 0; index < this.flames.length; index += 1) {
      const flame = this.flames[index]!;
      const phase = time * 1.7 + index * 2.1;
      flame.scale.y = 0.85 + Math.sin(phase) * 0.12 + Math.sin(phase * 0.63) * 0.05;
      flame.rotation.z = Math.sin(phase * 0.8) * 0.09;
      flame.rotation.x = Math.cos(phase * 0.7) * 0.06;
    }
    this.light.intensity = 1.5 + Math.sin(time * 1.7) * 0.12 + Math.sin(time * 2.3) * 0.07;
  }

  private buildFire(): void {
    const ash = new Mesh(new CircleGeometry(0.88, 13), new MeshStandardMaterial({ color: 0x33291f, roughness: 1 }));
    ash.name = 'midnight-tour-camp-ash';
    ash.rotation.x = -Math.PI / 2;
    ash.scale.set(1, 0.88, 1);
    ash.position.y = 0.008;
    this.root.add(ash);
    const geometry = new LatheGeometry([
      new Vector2(0, 0), new Vector2(0.055, 0.035), new Vector2(0.075, 0.085),
      new Vector2(0.045, 0.16), new Vector2(0.025, 0.23), new Vector2(0, 0.32),
    ], 6);
    const outer = new MeshBasicMaterial({ color: 0xe97724, transparent: true, opacity: 0.8, depthWrite: false });
    const inner = new MeshBasicMaterial({ color: 0xffc15e });
    const positions = [[-0.15, -0.06], [0.1, 0.04], [-0.02, 0.14], [0.04, -0.15]] as const;
    for (const [x, z] of positions) {
      const flame = new Group();
      flame.name = 'midnight-tour-camp-flame';
      flame.position.set(x, 0.15, z);
      const shell = new Mesh(geometry, outer);
      const core = new Mesh(geometry, inner);
      core.scale.set(0.55, 0.65, 0.55);
      flame.add(shell, core);
      this.flames.push(flame);
      this.root.add(flame);
    }
    const ember = new Mesh(geometry, new MeshBasicMaterial({ color: 0xb84519 }));
    ember.name = 'midnight-tour-camp-embers';
    ember.scale.set(3.2, 0.11, 3.2);
    ember.position.y = 0.125;
    this.light.name = 'midnight-tour-camp-light';
    this.light.position.set(0, 0.42, 0);
    this.root.add(ember, this.light);
  }
}

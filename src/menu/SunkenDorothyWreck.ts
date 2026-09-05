import { Group, Mesh } from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { createWreckMaterials } from './WreckMaterials';
import { WreckGeometry } from './WreckGeometry';
import { buildWreckHull } from './WreckHull';
import { buildWreckSuperstructure } from './WreckSuperstructure';

export const DOROTHY_WRECK_POSITION = [1.6, 1.8, -19.5] as const;
export const DOROTHY_WRECK_ROTATION = [0.06, -1.42, -0.16] as const;
export const DOROTHY_WRECK_SCALE = 2;

export class SunkenDorothyWreck implements MenuSceneComponent {
  readonly root = new Group();
  private readonly materials = createWreckMaterials();
  private disposed = false;

  constructor() {
    this.root.name = 'menu:dorothy-wreck';
    this.root.position.set(...DOROTHY_WRECK_POSITION);
    this.root.rotation.set(...DOROTHY_WRECK_ROTATION);
    this.root.scale.setScalar(DOROTHY_WRECK_SCALE);
    const geometry = new WreckGeometry();
    buildWreckHull(geometry, this.materials);
    buildWreckSuperstructure(geometry, this.materials);
    geometry.finish(this.root);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const child of this.root.children) {
      if (child instanceof Mesh) child.geometry.dispose();
    }
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

import { Group, Mesh } from 'three';
import type { MenuSceneComponent } from './MenuSceneComponent';
import { createWreckMaterials } from './WreckMaterials';
import { WreckGeometry } from './WreckGeometry';
import { buildWreckHull } from './WreckHull';
import { buildWreckSuperstructure } from './WreckSuperstructure';
import { buildWreckGrowth } from './WreckGrowth';
import { buildWreckDetails } from './WreckDetails';
import { applyMenuSurfaceDetail } from './MenuSurfaceDetail';
import type { MenuCaustics } from './MenuCaustics';

export const DOROTHY_WRECK_POSITION = [1.6, 1.8, -19.5] as const;
export const DOROTHY_WRECK_ROTATION = [0.06, -1.42, -0.24] as const;
export const DOROTHY_WRECK_SCALE = 2;

export class SunkenDorothyWreck implements MenuSceneComponent {
  readonly root = new Group();
  private readonly materials = createWreckMaterials();
  private disposed = false;

  constructor(caustics: MenuCaustics) {
    this.root.name = 'menu:dorothy-wreck';
    this.root.position.set(...DOROTHY_WRECK_POSITION);
    this.root.rotation.set(...DOROTHY_WRECK_ROTATION);
    this.root.scale.setScalar(DOROTHY_WRECK_SCALE);
    // Plating and fittings collect weed on top and silt near the sand.
    for (const material of [this.materials.hull, this.materials.paint, this.materials.timber,
      this.materials.iron, this.materials.rust, this.materials.buoy]) {
      applyMenuSurfaceDetail(material, { cellSize: 0.8, bump: 0.12, growth: 0.6, grime: 0.55 }, caustics);
    }
    for (const material of [this.materials.silt, this.materials.growth, this.materials.coral]) {
      applyMenuSurfaceDetail(material, { cellSize: 0.35, bump: 0.2, growth: 0, grime: 0.3 }, caustics);
    }
    const geometry = new WreckGeometry();
    buildWreckHull(geometry, this.materials);
    buildWreckSuperstructure(geometry, this.materials);
    buildWreckDetails(geometry, this.materials);
    buildWreckGrowth(geometry, this.materials);
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

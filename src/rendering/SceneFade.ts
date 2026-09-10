import { Light, Material, Mesh, type Object3D } from 'three';

/** Fade scene objects without changing shared source materials or their motion. */
export class SceneFade {
  private readonly bindings: { mesh: Mesh; material: Material | Material[] }[] = [];
  private readonly materials: { material: Material; opacity: number }[] = [];
  private readonly lights: { light: Light; intensity: number }[] = [];

  begin(roots: readonly Object3D[]): void {
    this.reset();
    const clones = new Map<Material, Material>();
    const clone = (source: Material): Material => {
      const existing = clones.get(source);
      if (existing !== undefined) return existing;
      const material = source.clone();
      material.transparent = true;
      material.depthWrite = false;
      material.alphaTest = 0;
      clones.set(source, material);
      this.materials.push({ material, opacity: source.opacity });
      return material;
    };
    for (const root of roots) {
      root.traverse((object) => {
        if (object instanceof Mesh) {
          const material = object.material;
          this.bindings.push({ mesh: object, material });
          object.material = Array.isArray(material) ? material.map(clone) : clone(material);
        } else if (object instanceof Light) {
          this.lights.push({ light: object, intensity: object.intensity });
        }
      });
    }
  }

  apply(visibility: number): void {
    for (const entry of this.materials) entry.material.opacity = entry.opacity * visibility;
    for (const entry of this.lights) entry.light.intensity = entry.intensity * visibility;
  }

  reset(): void {
    for (const binding of this.bindings) binding.mesh.material = binding.material;
    for (const entry of this.materials) entry.material.dispose();
    for (const entry of this.lights) entry.light.intensity = entry.intensity;
    this.bindings.length = 0;
    this.materials.length = 0;
    this.lights.length = 0;
  }
}

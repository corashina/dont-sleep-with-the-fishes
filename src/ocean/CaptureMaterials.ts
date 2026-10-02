import { Material, Mesh, type Object3D } from 'three';

interface CaptureMaterial {
  readonly material: Material;
  readonly keys: string[];
  readonly dispose: () => void;
  generation: number;
}

interface Binding {
  readonly mesh: Mesh;
  original: Material | Material[];
  readonly materials: Material[];
}

/** Keeps water captures from replacing the main pass's material lighting cache. */
export class CaptureMaterials {
  private readonly entries = new Map<Material, CaptureMaterial>();
  private readonly bindings = new WeakMap<Mesh, Binding>();
  private readonly active: Binding[] = [];
  private generation = 0;

  apply(scene: Object3D): void {
    this.generation++;
    scene.traverseVisible(this.replace);
  }

  restore(): void {
    for (const binding of this.active) binding.mesh.material = binding.original;
    this.active.length = 0;
  }

  dispose(): void {
    this.restore();
    for (const entry of this.entries.values()) entry.dispose();
  }

  private readonly replace = (object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    let binding = this.bindings.get(object);
    if (binding === undefined) {
      binding = { mesh: object, original: object.material, materials: [] };
      this.bindings.set(object, binding);
    }
    binding.original = object.material;
    this.active.push(binding);
    if (Array.isArray(object.material)) {
      binding.materials.length = object.material.length;
      for (let index = 0; index < object.material.length; index++) {
        binding.materials[index] = this.capture(object.material[index]!);
      }
      object.material = binding.materials;
    } else {
      object.material = this.capture(object.material);
    }
  };

  private capture(source: Material): Material {
    // Only lit built-in materials use the renderer's lighting state cache.
    if (!('isMeshStandardMaterial' in source || 'isMeshPhongMaterial' in source
      || 'isMeshLambertMaterial' in source || 'isMeshToonMaterial' in source)) return source;
    let entry = this.entries.get(source);
    if (entry === undefined) {
      const material = source.clone();
      const dispose = (): void => {
        source.removeEventListener('dispose', dispose);
        material.dispose();
        this.entries.delete(source);
      };
      entry = {
        material,
        keys: Object.keys(source).filter(key => key !== 'uuid' && key !== 'id' && key !== '_listeners'),
        dispose,
        generation: -1,
      };
      source.addEventListener('dispose', dispose);
      this.entries.set(source, entry);
    }
    if (entry.generation !== this.generation) {
      // Share current values, textures, and shader hooks. Do not allocate copies per frame.
      const target = entry.material as unknown as Record<string, unknown>;
      const properties = source as unknown as Record<string, unknown>;
      for (const key of entry.keys) target[key] = properties[key];
      entry.material.onBeforeRender = source.onBeforeRender;
      entry.material.onBeforeCompile = source.onBeforeCompile;
      entry.material.customProgramCacheKey = source.customProgramCacheKey;
      entry.generation = this.generation;
    }
    return entry.material;
  }
}

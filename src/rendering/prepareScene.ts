import { Group, Material, Texture, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';

function collectTextures(value: unknown, textures: Set<Texture>, visited: Set<object>): void {
  if (value instanceof Texture) {
    if (!value.isRenderTargetTexture) textures.add(value);
    return;
  }
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return;
  visited.add(value);
  for (const child of Object.values(value)) collectTextures(child, textures, visited);
}

/** Run behind a cover. Download completion alone does not make a scene ready to render. */
export async function prepareScene(
  renderer: Pick<WebGLRenderer, 'initTexture' | 'compileAsync'>,
  scene: Scene,
  camera: Camera,
  templates: Iterable<Object3D> = [],
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const roots = [...templates];
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  const visited = new Set<object>();
  for (const root of [scene, ...roots]) {
    root.traverse(object => {
      if (!('material' in object)) return;
      const values = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of values) {
        if (!(material instanceof Material) || materials.has(material)) continue;
        materials.add(material);
        for (const value of Object.values(material)) collectTextures(value, textures, visited);
      }
    });
  }
  collectTextures(scene.background, textures, visited);
  collectTextures(scene.environment, textures, visited);
  let uploaded = 0;
  for (const texture of textures) {
    if (!isCurrent()) return;
    renderer.initTexture(texture);
    // Keep the loading screen responsive during large upload batches.
    if (++uploaded % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (!isCurrent()) return;
  await renderer.compileAsync(scene, camera);
  if (!isCurrent() || roots.length === 0) return;
  const group = new Group();
  const parents = roots.map(root => root.parent);
  let compilation: Promise<unknown>;
  try {
    for (const root of roots) group.add(root);
    compilation = renderer.compileAsync(group, camera, scene);
  } finally {
    roots.forEach((root, index) => {
      if (root.parent !== group) return;
      root.removeFromParent();
      parents[index]?.add(root);
    });
  }
  await compilation;
}

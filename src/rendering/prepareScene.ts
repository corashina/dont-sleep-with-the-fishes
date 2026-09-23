import { Group, Material, Texture, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { reportLoadingStage, type ReportLoadingProgress } from '../app/LoadingProgress';

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

function sceneTextures(scene: Scene, roots: Object3D[]): Set<Texture> {
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
  return textures;
}

async function uploadTextures(
  renderer: Pick<WebGLRenderer, 'initTexture'>,
  textures: Set<Texture>,
  isCurrent: () => boolean,
  report?: ReportLoadingProgress,
): Promise<void> {
  let uploaded = 0;
  if (!isCurrent()) return;
  report?.({ stage: 'preparingTextures', completed: 0, total: textures.size });
  for (const texture of textures) {
    if (!isCurrent()) return;
    renderer.initTexture(texture);
    // Keep the loading screen responsive during large upload batches.
    if (++uploaded % 8 === 0) {
      report?.({ stage: 'preparingTextures', completed: uploaded, total: textures.size });
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  if (!isCurrent()) return;
  report?.({ stage: 'preparingTextures', completed: uploaded, total: textures.size });
}

/** Run behind a cover. Download completion alone does not make a scene ready to render. */
export async function prepareScene(
  renderer: Pick<WebGLRenderer, 'initTexture' | 'compileAsync'>,
  scene: Scene,
  camera: Camera,
  templates: Iterable<Object3D> = [],
  isCurrent: () => boolean = () => true,
  report?: ReportLoadingProgress,
): Promise<void> {
  const roots = [...templates];
  await uploadTextures(renderer, sceneTextures(scene, roots), isCurrent, report);
  if (!isCurrent()) return;
  if (report !== undefined) await reportLoadingStage(report, 'preparingSceneShaders');
  if (!isCurrent()) return;
  await renderer.compileAsync(scene, camera);
  if (!isCurrent() || roots.length === 0) return;
  if (report !== undefined) await reportLoadingStage(report, 'preparingObjectShaders');
  if (!isCurrent()) return;
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

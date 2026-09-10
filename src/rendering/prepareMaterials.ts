import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  type Camera,
  type Material,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export async function prepareFullscreenMaterials(
  renderer: WebGLRenderer,
  materials: readonly Material[],
): Promise<void> {
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  for (const material of materials) scene.add(new Mesh(geometry, material));
  try {
    await renderer.compileAsync(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
  } finally {
    geometry.dispose();
  }
}

export function prepareOverrideMaterial(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  material: Material,
): Promise<unknown> {
  // compileAsync reads mesh materials, not scene.overrideMaterial.
  const originalMaterials = new Map<Mesh, Material | Material[]>();
  try {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      originalMaterials.set(object, object.material);
      object.material = material;
    });
    return renderer.compileAsync(scene, camera);
  } finally {
    for (const [mesh, originalMaterial] of originalMaterials) mesh.material = originalMaterial;
  }
}

export async function prepareOutputPass(
  renderer: WebGLRenderer,
  pass: OutputPass,
  writeBuffer: WebGLRenderTarget,
  readBuffer: WebGLRenderTarget,
): Promise<void> {
  let compilation: Promise<unknown> | undefined;
  // Let OutputPass configure its own defines, but compile its quad without drawing it.
  const compileRenderer = {
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    setRenderTarget: (target: WebGLRenderTarget | null) => renderer.setRenderTarget(target),
    render: (scene: Scene, camera: Camera) => {
      compilation = renderer.compileAsync(scene, camera);
    },
  } as WebGLRenderer;
  pass.render(compileRenderer, writeBuffer, readBuffer, 0, false);
  await compilation;
}

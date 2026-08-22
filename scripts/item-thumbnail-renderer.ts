import {
  Box3,
  DirectionalLight,
  Group,
  BufferGeometry,
  Material,
  HemisphereLight,
  Mesh,
  OrthographicCamera,
  Vector3,
  WebGLRenderer,
} from 'three';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { PropModelLibrary } from '../src/world/PropModelLibrary';

const SIZE = 256;
const CAMERA_DIRECTION = new Vector3(1, 0.8, 1).normalize();
const CAMERA_TARGET = new Vector3();
const THUMBNAIL_ROTATIONS: Readonly<Partial<Record<ItemId, readonly [number, number, number]>>> = {
  map: [-0.35, 0.25, -0.08],
  fishingNet: [0, -0.35, 0],
  radio: [0, -0.3, 0],
  umbrella: [0, -0.45, 0],
  swimRing: [-0.25, 0.3, 0],
  shotgun: [0, -0.35, 0],
};

function disposeClone(root: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function fitCamera(camera: OrthographicCamera, root: Group): void {
  const box = new Box3().setFromObject(root);
  const center = box.getCenter(new Vector3());
  const corners = [
    new Vector3(box.min.x, box.min.y, box.min.z), new Vector3(box.min.x, box.min.y, box.max.z),
    new Vector3(box.min.x, box.max.y, box.min.z), new Vector3(box.min.x, box.max.y, box.max.z),
    new Vector3(box.max.x, box.min.y, box.min.z), new Vector3(box.max.x, box.min.y, box.max.z),
    new Vector3(box.max.x, box.max.y, box.min.z), new Vector3(box.max.x, box.max.y, box.max.z),
  ];
  const distance = Math.max(box.getSize(new Vector3()).length() * 2, 1);
  camera.position.copy(center).addScaledVector(CAMERA_DIRECTION, distance);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  let halfWidth = 0;
  let halfHeight = 0;
  for (const corner of corners) {
    const viewPoint = corner.clone().applyMatrix4(camera.matrixWorldInverse);
    halfWidth = Math.max(halfWidth, Math.abs(viewPoint.x));
    halfHeight = Math.max(halfHeight, Math.abs(viewPoint.y));
  }
  const halfSpan = Math.max(halfWidth, halfHeight) * 1.12;
  camera.left = -halfSpan;
  camera.right = halfSpan;
  camera.top = halfSpan;
  camera.bottom = -halfSpan;
  camera.near = Math.max(0.01, distance - box.getSize(new Vector3()).length() * 2);
  camera.far = distance + box.getSize(new Vector3()).length() * 2;
  camera.updateProjectionMatrix();
}

async function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create thumbnail PNG'));
    }, 'image/png');
  });
}

async function uploadThumbnail(id: ItemId, canvas: HTMLCanvasElement): Promise<void> {
  const response = await fetch(`/__item-thumbnail/${id}`, {
    method: 'POST',
    body: await pngBlob(canvas),
    headers: { 'content-type': 'image/png' },
  });
  if (!response.ok) throw new Error(`Could not upload ${id}: ${response.status}`);
}

async function main(): Promise<void> {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  const scene = new Group();
  scene.add(new HemisphereLight(0xd8e5f0, 0x273746, 2.2));
  const key = new DirectionalLight(0xffefd6, 3.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new DirectionalLight(0x8db7d1, 1.4);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  let library: PropModelLibrary | undefined;
  try {
    library = await PropModelLibrary.load();
    for (const id of ITEM_IDS) {
      const root = library.create({ instanceId: `${id}-1`, type: id });
      try {
        root.rotation.set(...(THUMBNAIL_ROTATIONS[id] ?? [0, 0, 0]));
        scene.add(root);
        root.updateMatrixWorld(true);
        const center = new Box3().setFromObject(root).getCenter(new Vector3());
        root.position.sub(center);
        root.updateMatrixWorld(true);
        fitCamera(camera, root);
        renderer.render(scene, camera);
        await uploadThumbnail(id, renderer.domElement);
      } finally {
        scene.remove(root);
        disposeClone(root);
      }
    }
    const response = await fetch('/__item-thumbnail-complete', { method: 'POST' });
    if (!response.ok) throw new Error(`Could not complete thumbnail generation: ${response.status}`);
  } finally {
    library?.dispose();
    renderer.dispose();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = error instanceof Error ? error.message : String(error);
});

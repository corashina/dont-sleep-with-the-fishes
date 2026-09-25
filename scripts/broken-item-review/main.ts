import { Box3, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, OrthographicCamera, Vector3, WebGLRenderer } from 'three';
import { ITEM_DEFINITIONS, ITEM_IDS } from '../../src/game/ItemState';
import { PropModelLibrary } from '../../src/world/PropModelLibrary';
import { boatSupplyTransform } from '../../src/world/BoatStorage';
import { prepareItemCondition, setItemBroken } from '../../src/survival/itemConditionAppearance';
import { fitBrokenItemToStorage } from '../../src/survival/brokenItemStorage';

const views = [
  { id: 'front', label: 'Front three-quarter', direction: new Vector3(1, 1.25, 1) },
  { id: 'reverse', label: 'Reverse three-quarter', direction: new Vector3(-1, 1.25, -1) },
  { id: 'top', label: 'Top', direction: new Vector3(0, 1, 0.001) },
];
const ids = ITEM_IDS.filter(id => ITEM_DEFINITIONS[id].breakable);
const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1024, 1024, false);
renderer.setClearColor(0, 0);
const scene = new Group();
scene.add(new HemisphereLight(0xd8e5f0, 0x273746, 2.2));
const key = new DirectionalLight(0xffefd6, 3.4);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new DirectionalLight(0x8db7d1, 1.4);
fill.position.set(-4, 2, -3);
scene.add(fill);
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.001, 100);

async function upload(id: string, canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG failed'))));
  const response = await fetch(`/__broken-review/${id}`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`Upload failed: ${id}`);
}

function fit(bounds: Box3, direction: Vector3): void {
  const center = bounds.getCenter(new Vector3());
  const distance = Math.max(bounds.getSize(new Vector3()).length() * 3, 1);
  camera.position.copy(center).addScaledVector(direction.clone().normalize(), distance);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  let span = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    span = Math.max(span, Math.abs(point.x), Math.abs(point.y));
  }
  camera.left = camera.bottom = -span * 1.13;
  camera.right = camera.top = span * 1.13;
  camera.near = 0.001;
  camera.far = distance * 4;
  camera.updateProjectionMatrix();
}

async function main(): Promise<void> {
  const library = await PropModelLibrary.load(undefined, []);
  const sheets = views.map(view => {
    const canvas = document.createElement('canvas');
    canvas.width = 2560; canvas.height = 1450;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#102029'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0e5d1'; ctx.font = 'bold 44px Arial';
    ctx.fillText('BROKEN ITEMS / ' + view.label.toUpperCase(), 40, 66);
    ctx.font = '23px Arial'; ctx.fillStyle = '#aec2ca';
    ctx.fillText('10 breakable items · current game geometry · boat storage poses · small inset: intact reference', 40, 110);
    return { canvas, ctx };
  });
  const records = [];
  for (const [index, id] of ids.entries()) {
    const root = library.create({ instanceId: `${id}-1`, type: id });
    const transform = boatSupplyTransform(id, 0);
    root.position.copy(transform.position); root.rotation.copy(transform.rotation); root.scale.setScalar(transform.scale);
    if (id === 'umbrella') root.traverse(object => {
      if (object instanceof Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.side = DoubleSide;
    });
    scene.add(root);
    const geometries = new Set<import('three').BufferGeometry>();
    const materials = new Set<import('three').Material>();
    const bindings = prepareItemCondition(root, id, geometries, materials);
    fitBrokenItemToStorage(root, bindings, id);
    if (!bindings.length) throw new Error(`Missing broken geometry: ${id}`);
    const bounds = new Box3().setFromObject(root, true);
    setItemBroken(bindings, true);
    bounds.union(new Box3().setFromObject(root, true));
    if (![...bounds.min, ...bounds.max].every(Number.isFinite)) throw new Error(`Invalid bounds: ${id}`);
    for (const [viewIndex, view] of views.entries()) {
      const { ctx } = sheets[viewIndex]!;
      const x = 30 + (index % 5) * 506;
      const y = 148 + Math.floor(index / 5) * 623;
      ctx.fillStyle = '#45565e'; ctx.fillRect(x, y, 482, 600);
      ctx.fillStyle = '#f0e5d1'; ctx.font = 'bold 25px Arial';
      ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${ITEM_DEFINITIONS[id].label}`, x + 20, y + 39);
      fit(bounds, view.direction);
      setItemBroken(bindings, true); renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, x + 7, y + 45, 468, 468);
      await upload(`${id}-${view.id}`, renderer.domElement);
      setItemBroken(bindings, false); renderer.render(scene, camera);
      ctx.fillStyle = '#14262f'; ctx.fillRect(x + 332, y + 450, 138, 138);
      ctx.drawImage(renderer.domElement, x + 339, y + 455, 124, 124);
      ctx.fillStyle = '#aec2ca'; ctx.font = '18px Arial';
      ctx.fillText('INTACT', x + 20, y + 562);
      ctx.fillText('reference →', x + 20, y + 583);
      await upload(`${id}-intact-${view.id}`, renderer.domElement);
    }
    records.push({ id, label: ITEM_DEFINITIONS[id].label, meshes: bindings.length });
    scene.remove(root);
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
    document.querySelector('#status')!.textContent = `Rendered ${index + 1}/${ids.length}`;
  }
  for (const [index, view] of views.entries()) await upload(`grid-${view.id}`, sheets[index]!.canvas);
  library.dispose(); renderer.dispose();
  const response = await fetch('/__broken-review-complete', { method: 'POST', body: JSON.stringify({ generatedAt: new Date().toISOString(), items: records, views: views.map(({ id, label }) => ({ id, label })), note: 'Models use production damage and storage fitting. Studio lighting; each item is fitted separately. Not a world-scale comparison.' }) });
  if (!response.ok) throw new Error('Completion failed');
}
void main().catch(async error => {
  document.body.textContent = String(error);
  await fetch('/__broken-review-failed', { method: 'POST', body: String(error) });
});


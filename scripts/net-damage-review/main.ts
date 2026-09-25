import { Box3, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { PropModelLibrary } from '../../src/world/PropModelLibrary';
import { boatSupplyTransform } from '../../src/world/BoatStorage';
import { createLifeboat } from '../../src/world/Lifeboat';
import { LifeboatAssets } from '../../src/world/LifeboatAssets';
import { prepareItemCondition, setItemBroken } from '../../src/survival/itemConditionAppearance';
import { fitBrokenItemToStorage } from '../../src/survival/brokenItemStorage';

async function main(): Promise<void> {
  const [library, assets] = await Promise.all([PropModelLibrary.load(undefined, []), LifeboatAssets.load()]);
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1000, 1000, false);
  renderer.setClearColor(0x45565e);
  assets.configure(renderer.capabilities.getMaxAnisotropy());
  const scene = new Group();
  scene.add(new HemisphereLight(0xd8e5f0, 0x273746, 2.2));
  const light = new DirectionalLight(0xffefd6, 3.4);
  light.position.set(3, 5, 4);
  scene.add(light);
  const { root: boat } = createLifeboat(assets);
  scene.add(boat);
  for (const id of ['compass', 'flashlight', 'knife', 'map'] as const) {
    const item = library.create({ instanceId: `${id}-1`, type: id });
    const pose = boatSupplyTransform(id, 0);
    item.position.copy(pose.position); item.rotation.copy(pose.rotation); item.scale.setScalar(pose.scale);
    boat.add(item);
  }
  const net = library.create({ instanceId: 'fishingNet-1', type: 'fishingNet' });
  const pose = boatSupplyTransform('fishingNet', 0);
  net.position.copy(pose.position); net.rotation.copy(pose.rotation); net.scale.setScalar(pose.scale);
  scene.add(net);
  const bindings = prepareItemCondition(net, 'fishingNet', new Set(), new Set());
  fitBrokenItemToStorage(net, bindings, 'fishingNet');
  const center = new Box3().setFromObject(net, true).getCenter(new Vector3());
  const camera = new PerspectiveCamera(30, 1, 0.01, 100);
  camera.position.set(0, 0.88, 0.96);
  camera.lookAt(center);
  function capture(label: string): void {
    renderer.render(scene, camera);
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    const image = document.createElement('img');
    image.src = renderer.domElement.toDataURL('image/png'); image.alt = label;
    figure.append(caption, image); document.querySelector('#views')!.append(figure);
  }
  capture('Cała — widok z miejsca gracza');
  setItemBroken(bindings, true);
  capture('Uszkodzona — widok z miejsca gracza');
  boat.visible = false;
  camera.position.copy(center).add(new Vector3(1.8, 2.7, 1.8));
  camera.lookAt(center);
  capture('Uszkodzona — szczegóły');
  document.querySelector('#status')!.textContent = 'Gotowe';
  renderer.dispose();
}
void main().catch(error => { document.querySelector('#status')!.textContent = String(error); });

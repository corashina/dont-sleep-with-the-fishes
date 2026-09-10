import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, HemisphereLight,
  OrthographicCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { catchLabel } from '../src/i18n/itemMessages';
import type { SimpleJunkId } from '../src/survival/JunkCatchModels';
import { modelTriangleCount } from '../src/rendering/modelPresentation';

const items: readonly [number, SimpleJunkId][] = [
  [1, 'trafficCone'], [2, 'clothesHanger'], [4, 'toiletPlunger'],
  [5, 'golfBall'], [6, 'bowlingPin'], [16, 'tableTennisPaddle'],
];

const disposals: (() => void)[] = [];

async function addItem(number: number, id: SimpleJunkId): Promise<void> {
  const label = catchLabel(id);
  const article = document.createElement('article');
  article.innerHTML = `<div class="viewport"></div><div class="caption"><h2><span class="number">${String(number).padStart(2, '0')}</span>${label}</h2><div class="controls"><button aria-label="Turn ${label} left">↶ Turn</button><button aria-label="Turn ${label} right">Turn ↷</button><button aria-label="Reset ${label}">Reset</button></div></div>`;
  document.querySelector('#gallery')!.append(article);
  const viewport = article.querySelector<HTMLElement>('.viewport')!;
  const loader = new GLTFLoader();
  const library = new FishingCatchLibrary({ load: async url => (await loader.loadAsync(url)).scene });
  const model = (await library.prepare(id))!;
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const details = document.createElement('p');
  details.textContent = `${modelTriangleCount(model, 'Missing geometry')} triangles · ${(Math.max(size.x, size.y, size.z) * 100).toFixed(1)} cm`;
  article.querySelector('h2')!.after(details);
  const scale = 1.55 / Math.max(size.x, size.y, size.z);
  model.scale.multiplyScalar(scale);
  model.position.sub(center).multiplyScalar(scale);
  const scene = new Scene();
  scene.background = new Color(0xd9dfda);
  scene.add(model, new HemisphereLight(0xe9f1fa, 0x697565, 2.1));
  const key = new DirectionalLight(0xffecd5, 3.1);
  key.position.set(-3, 5, 4);
  const rim = new DirectionalLight(0xd2e8f2, 1.4);
  rim.position.set(4, 2, -2);
  scene.add(key, rim);
  const camera = new OrthographicCamera(-1.3, 1.3, 1.1, -1.1, 0.01, 100);
  camera.position.set(1.6, 1.0, 4);
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  viewport.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', `3D view of ${label}`);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minZoom = 0.5;
  controls.maxZoom = 3;
  controls.update();
  controls.saveState();
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  const observer = new ResizeObserver(() => {
    const { width, height } = viewport.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.left = -1.1 * width / height;
    camera.right = 1.1 * width / height;
    camera.updateProjectionMatrix();
    render();
  });
  observer.observe(viewport);
  const buttons = article.querySelectorAll('button');
  buttons[0]!.onclick = () => { model.rotation.y -= Math.PI / 6; render(); };
  buttons[1]!.onclick = () => { model.rotation.y += Math.PI / 6; render(); };
  buttons[2]!.onclick = () => { model.rotation.y = 0; controls.reset(); render(); };
  disposals.push(() => { observer.disconnect(); controls.dispose(); library.dispose(); renderer.dispose(); });
}

await Promise.all(items.map(([number, id]) => addItem(number, id)));
document.body.dataset.ready = 'true';
window.addEventListener('pagehide', () => disposals.forEach((dispose) => dispose()), { once: true });

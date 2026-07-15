import {
  Box3, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { initialSelections, selectChoice, selectionSummary } from './board-state.mjs';

const catalog = await fetch('/files/selection-catalog.json').then((response) => {
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  return response.json();
});
const itemIds = Object.keys(catalog.items);
const choiceCount = itemIds.reduce((total, itemId) => total + catalog.items[itemId].length, 0);
let selections = initialSelections(itemIds);
const cardsByModel = new Map();
const itemsRoot = document.querySelector('#items');
const summaryRoot = document.querySelector('#summary');
const progress = document.querySelector('#progress');

function displayName(itemId) {
  return itemId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

function redrawSummary() {
  const summary = selectionSummary(selections, catalog);
  summaryRoot.replaceChildren(...itemIds.map((itemId) => {
    const node = document.createElement('div');
    node.className = 'summary-item';
    node.innerHTML = `<strong>${displayName(itemId)}</strong><span>${summary[itemId].label}</span>`;
    return node;
  }));
  window.brainstorm?.choice('selection-summary', { selections: summary });
}

for (const itemId of itemIds) {
  const section = document.createElement('section');
  section.className = 'item-row';
  section.innerHTML = `<h2>${displayName(itemId)}</h2>`;
  const cards = document.createElement('div');
  cards.className = 'cards';
  for (const choice of catalog.items[itemId]) {
    const card = document.createElement('article');
    card.className = `card${choice.id === 'current' ? ' selected' : ''}`;
    card.dataset.choice = `${itemId}:${choice.id}`;
    card.innerHTML = `
      <img class="preview" alt="${choice.label} preview">
      <span class="preview-error" role="status"></span>
      <button class="select-choice" type="button" aria-label="Select ${choice.label}" aria-pressed="${choice.id === 'current'}"></button>
      <div class="card-body">
        <h3>${choice.label}</h3>
        <div class="meta"><span class="badge">${choice.kind}</span><span class="badge">${choice.triangles} triangles</span></div>
        <a class="source" href="${choice.sourceUrl}" target="_blank" rel="noreferrer">Open Kenney source pack</a>
        <p class="fit">${choice.fit}</p>
      </div>`;
    card.addEventListener('click', (event) => {
      if (event.target.closest('a') || card.dataset.renderFailed === 'true') return;
      window.toggleSelect?.(card);
      cards.querySelectorAll('.card').forEach((node) => {
        const isSelected = node === card;
        node.classList.toggle('selected', isSelected);
        node.querySelector('.select-choice').setAttribute('aria-pressed', String(isSelected));
      });
      selections = selectChoice(selections, itemId, choice.id);
      redrawSummary();
    });
    cards.append(card);
    cardsByModel.set(choice.modelFile, card);
  }
  section.append(cards);
  itemsRoot.append(section);
}
redrawSummary();

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(480, 320, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = SRGBColorSpace;
renderer.domElement.hidden = true;
const loader = new GLTFLoader();
const camera = new PerspectiveCamera(35, 1.5, 0.1, 100);
camera.position.set(2.4, 1.8, 2.8);
camera.lookAt(0, 0, 0);
const box = new Box3();
const size = new Vector3();
const center = new Vector3();
let rendered = 0;
let failed = 0;

async function renderModel(choice) {
  const scene = new Scene();
  scene.background = new Color('#172027');
  scene.add(new HemisphereLight(0xdcecf3, 0x36424a, 2.1));
  const key = new DirectionalLight(0xffe3cf, 3.3);
  key.position.set(3, 4, 2);
  scene.add(key);
  const floor = new Mesh(new PlaneGeometry(6, 6), new MeshStandardMaterial({ color: 0x25343a, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.92;
  scene.add(floor);

  const gltf = await loader.loadAsync(`/files/${choice.modelFile}`);
  const model = gltf.scene;
  box.setFromObject(model).getSize(size);
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0)) throw new Error(`${choice.modelFile} has empty bounds`);
  model.scale.setScalar(1.7 / longest);
  box.setFromObject(model).getCenter(center);
  model.position.sub(center);
  model.rotation.y = -0.55;
  scene.add(model);
  renderer.render(scene, camera);
  cardsByModel.get(choice.modelFile).querySelector('img').src = renderer.domElement.toDataURL('image/png');
  floor.geometry.dispose();
  floor.material.dispose();
  model.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    materials.forEach((material) => material.dispose());
  });
}

for (const itemId of itemIds) {
  for (const choice of catalog.items[itemId]) {
    try {
      await renderModel(choice);
    } catch (error) {
      failed += 1;
      const card = cardsByModel.get(choice.modelFile);
      const message = error instanceof Error ? error.message : String(error);
      card.dataset.renderFailed = 'true';
      card.setAttribute('aria-disabled', 'true');
      card.querySelector('.select-choice').disabled = true;
      card.querySelector('img').alt = `Preview failed: ${message}`;
      card.querySelector('.preview-error').textContent = `Preview unavailable: ${message}`;
      const badge = document.createElement('span');
      badge.className = 'badge error';
      badge.textContent = 'Preview failed';
      card.querySelector('.meta').append(badge);
    }
    rendered += 1;
    progress.textContent = `Preparing ${rendered} / ${choiceCount} previews…`;
  }
}
progress.textContent = failed === 0
  ? `All ${choiceCount} previews are ready.`
  : `${choiceCount - failed} / ${choiceCount} previews ready; ${failed} failed.`;
renderer.dispose();

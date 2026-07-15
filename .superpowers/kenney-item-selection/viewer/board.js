import {
  Box3, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  candidateMetadata,
  initialPreviewStates,
  initialSelections,
  isChoiceSelectable,
  readySelectionSummary,
  reconcileSelections,
  selectionEvent,
  selectChoice,
  selectionSummary,
  setPreviewState,
  validatedKenneySourceUrl,
} from './board-state.mjs';

const catalog = await fetch('/files/selection-catalog.json').then((response) => {
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  return response.json();
});
const itemIds = Object.keys(catalog.items);
const choiceCount = itemIds.reduce((total, itemId) => total + catalog.items[itemId].length, 0);
let selections = initialSelections(itemIds);
let previewStates = initialPreviewStates(catalog);
let renderingComplete = false;
const cardsByChoice = new Map();
const itemsRoot = document.querySelector('#items');
const summaryRoot = document.querySelector('#summary');
const progress = document.querySelector('#progress');

function displayName(itemId) {
  return itemId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function choiceKey(itemId, candidateId) {
  return `${itemId}:${candidateId}`;
}

function redrawSummary({ emit = renderingComplete } = {}) {
  const summary = selectionSummary(selections, catalog);
  summaryRoot.replaceChildren(...itemIds.map((itemId) => {
    const node = element('div', 'summary-item');
    const selectedId = selections[itemId];
    node.append(
      element('strong', undefined, displayName(itemId)),
      element(
        'span',
        undefined,
        isChoiceSelectable(previewStates, itemId, selectedId)
          ? summary[itemId].label
          : 'Awaiting successful preview…',
      ),
    );
    return node;
  }));

  const readySummary = readySelectionSummary(selections, catalog, previewStates);
  if (emit && readySummary) {
    window.brainstorm?.send?.(selectionEvent(readySummary));
  }
}

function applySelectionVisuals(itemId) {
  const selectedId = selections[itemId];
  for (const choice of catalog.items[itemId]) {
    const card = cardsByChoice.get(choiceKey(itemId, choice.id));
    const isSelected = choice.id === selectedId
      && isChoiceSelectable(previewStates, itemId, choice.id);
    card.classList.toggle('selected', isSelected);
    card.querySelector('.select-choice').setAttribute('aria-pressed', String(isSelected));
  }
}

function buildCard(itemId, choice) {
  const metadata = candidateMetadata(choice.sourceAssetId);
  const card = element('article', `card${choice.id === 'current' ? ' selected' : ''}`);
  card.dataset.item = itemId;
  card.dataset.candidate = choice.id;
  card.dataset.choice = choiceKey(itemId, choice.id);
  card.dataset.previewState = 'pending';
  card.setAttribute('aria-disabled', 'true');

  const preview = element('img', 'preview');
  preview.alt = `${choice.label} preview pending`;
  const previewError = element('span', 'preview-error');
  previewError.setAttribute('role', 'status');
  const selectButton = element('button', 'select-choice');
  selectButton.type = 'button';
  selectButton.disabled = true;
  selectButton.setAttribute('aria-label', `Select ${choice.label}`);
  selectButton.setAttribute('aria-pressed', String(choice.id === 'current'));

  const body = element('div', 'card-body');
  const meta = element('div', 'meta');
  meta.append(element('span', 'badge', metadata.status));
  for (const pack of metadata.packs) {
    meta.append(element('span', 'badge', `Pack: ${pack.name} · Version: ${pack.version}`));
  }
  meta.append(element('span', 'badge', `${choice.triangles} triangles`));

  const source = element('a', 'source', 'Open Kenney source pack');
  source.href = validatedKenneySourceUrl(choice.sourceUrl);
  source.target = '_blank';
  source.rel = 'noreferrer';
  body.append(
    element('h3', undefined, choice.label),
    meta,
    source,
    element('p', 'fit', choice.fit),
  );
  card.append(preview, previewError, selectButton, body);

  card.addEventListener('click', (event) => {
    if (event.target instanceof Node && source.contains(event.target)) return;
    if (!isChoiceSelectable(previewStates, itemId, choice.id)) return;
    window.toggleSelect?.(card);
    selections = selectChoice(selections, itemId, choice.id);
    applySelectionVisuals(itemId);
    redrawSummary();
  });
  return card;
}

for (const itemId of itemIds) {
  const section = element('section', 'item-row');
  section.append(element('h2', undefined, displayName(itemId)));
  const cards = element('div', 'cards');
  for (const choice of catalog.items[itemId]) {
    const card = buildCard(itemId, choice);
    cards.append(card);
    cardsByChoice.set(choiceKey(itemId, choice.id), card);
  }
  section.append(cards);
  itemsRoot.append(section);
}
redrawSummary({ emit: false });

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

function disposeModel(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model?.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material)
      ? node.material
      : node.material ? [node.material] : [];
    for (const material of nodeMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
        if (Array.isArray(value)) {
          value.filter((entry) => entry?.isTexture).forEach((texture) => textures.add(texture));
        }
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

async function renderModel(itemId, choice) {
  const scene = new Scene();
  scene.background = new Color('#172027');
  scene.add(new HemisphereLight(0xdcecf3, 0x36424a, 2.1));
  const key = new DirectionalLight(0xffe3cf, 3.3);
  key.position.set(3, 4, 2);
  scene.add(key);
  const floor = new Mesh(
    new PlaneGeometry(6, 6),
    new MeshStandardMaterial({ color: 0x25343a, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.92;
  scene.add(floor);
  let model;

  try {
    const gltf = await loader.loadAsync(`/files/${choice.modelFile}`);
    model = gltf.scene;
    box.setFromObject(model).getSize(size);
    const longest = Math.max(size.x, size.y, size.z);
    if (!(longest > 0)) throw new Error(`${choice.modelFile} has empty bounds`);
    model.scale.setScalar(1.7 / longest);
    box.setFromObject(model).getCenter(center);
    model.position.sub(center);
    model.rotation.y = -0.55;
    scene.add(model);
    renderer.render(scene, camera);
    const card = cardsByChoice.get(choiceKey(itemId, choice.id));
    card.querySelector('img').src = renderer.domElement.toDataURL('image/png');
  } finally {
    floor.geometry.dispose();
    floor.material.dispose();
    disposeModel(model);
    scene.clear();
  }
}

function markPreviewReady(itemId, choice) {
  previewStates = setPreviewState(previewStates, itemId, choice.id, 'ready');
  const card = cardsByChoice.get(choiceKey(itemId, choice.id));
  card.dataset.previewState = 'ready';
  card.removeAttribute('aria-disabled');
  card.querySelector('.select-choice').disabled = false;
  card.querySelector('img').alt = `${choice.label} preview`;
  applySelectionVisuals(itemId);
}

function markPreviewFailed(itemId, choice, error) {
  failed += 1;
  previewStates = setPreviewState(previewStates, itemId, choice.id, 'failed');
  const card = cardsByChoice.get(choiceKey(itemId, choice.id));
  const message = error instanceof Error ? error.message : String(error);
  card.dataset.previewState = 'failed';
  card.setAttribute('aria-disabled', 'true');
  card.querySelector('.select-choice').disabled = true;
  card.querySelector('img').alt = `Preview failed: ${message}`;
  card.querySelector('.preview-error').textContent = `Preview unavailable: ${message}`;
  card.querySelector('.meta').append(element('span', 'badge error', 'Preview failed'));
  applySelectionVisuals(itemId);
  redrawSummary({ emit: false });
}

for (const itemId of itemIds) {
  for (const choice of catalog.items[itemId]) {
    try {
      await renderModel(itemId, choice);
      markPreviewReady(itemId, choice);
    } catch (error) {
      markPreviewFailed(itemId, choice, error);
    }
    rendered += 1;
    progress.textContent = `Preparing ${rendered} / ${choiceCount} previews…`;
  }
}

try {
  selections = reconcileSelections(selections, catalog, previewStates);
  itemIds.forEach(applySelectionVisuals);
  renderingComplete = true;
  redrawSummary();
} catch (error) {
  console.error(error);
}

progress.textContent = failed === 0
  ? `All ${choiceCount} previews are ready.`
  : `${choiceCount - failed} / ${choiceCount} previews ready; ${failed} failed.`;
renderer.dispose();

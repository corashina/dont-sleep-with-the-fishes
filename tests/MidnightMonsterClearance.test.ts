import { readFile } from 'node:fs/promises';
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import { MONSTER_RESULT_DURATION_SECONDS, MONSTER_TURN_BACK_END_SECONDS } from '../src/survival/midnightTourChoreography';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import { EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { PropModelLibrary } from '../src/world/PropModelLibrary';
import { createTestPropModels } from './helpers/propModels';

it('keeps the production monster outside the camera near plane throughout the bite', async () => {
  const bytes = await readFile('src/assets/models/events/midnightMonster.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const loader = new GLTFLoader().register(() => ({
    name: 'clearance-materials',
    loadMaterial: async () => new MeshStandardMaterial(),
  }));
  const gltf = await loader.parseAsync(data, '');
  normalizeLongestDimensionTemplate(gltf.scene, EVENT_MODEL_SPECS.midnightMonster, (message) => new Error(message));
  const template = new Group();
  template.add(gltf.scene);
  const monsterModels = PropModelLibrary.fromTemplatesForTest(new Map(), new Map(), new Map(), new Map(),
    new Map([['midnightMonster', template]]), new Map([['midnightMonster', gltf.animations]]));
  const propModels = createTestPropModels();
  const createEventModel = propModels.createEventModel.bind(propModels);
  vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => id === 'midnightMonster'
    ? monsterModels.createEventModel(id) : createEventModel(id));
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  const cameraRig = new Group();
  cameraRig.add(camera);
  const presentation = new MidnightTourPresentation({
    camera, cameraRig, propModels, emitCue: vi.fn(), waves: [],
  } as unknown as FocusedEventPresentationDependencies);
  const point = new Vector3();
  try {
    for (const seed of [0, 1]) {
      presentation.stage(seed);
      await presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
      void presentation.react({ eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-attack' },
        { accepted: true } as ActionOutcome);
      const monster = presentation.root.getObjectByName('midnight-tour-monster')!;
      const meshes: Mesh[] = [];
      monster.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
      let previous = 0;
      let minimumDepth = Infinity;
      let closestTime = 0;
      const frames = Math.ceil((MONSTER_RESULT_DURATION_SECONDS - MONSTER_TURN_BACK_END_SECONDS) * 120);
      for (let frame = 0; frame <= frames; frame += 1) {
        const time = Math.min(MONSTER_RESULT_DURATION_SECONDS, MONSTER_TURN_BACK_END_SECONDS + frame / 120);
        presentation.update(time, time - previous);
        previous = time;
        presentation.root.updateMatrixWorld(true);
        for (const mesh of meshes) {
          if (mesh instanceof SkinnedMesh) mesh.skeleton.update();
          const count = mesh.geometry.getAttribute('position').count;
          for (let index = 0; index < count; index += 1) {
            mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
            if (-point.z < minimumDepth) { minimumDepth = -point.z; closestTime = time; }
          }
        }
      }
      expect(minimumDepth, `seed ${seed}, closest at ${closestTime.toFixed(3)}s`).toBeGreaterThan(camera.near + 0.12);
      presentation.clear();
    }
  } finally {
    presentation.dispose();
    propModels.dispose();
    monsterModels.dispose();
  }
});

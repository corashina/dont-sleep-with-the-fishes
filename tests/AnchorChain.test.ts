import { describe, expect, it } from 'vitest';
import { Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { createEventItemUseSample } from '../src/survival/eventItemUseChoreography';

function readLinks(root: Group): { position: Vector3; length: number }[] {
  const links: { position: Vector3; length: number }[] = [];
  root.updateWorldMatrix(true, true);
  root.getObjectByName('event-item-chain')!.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const length = object.geometry.boundingBox!.getSize(new Vector3()).y;
    if (object instanceof InstancedMesh) {
      for (let index = 0; index < object.count; index += 1) {
        const matrix = new Matrix4();
        object.getMatrixAt(index, matrix);
        links.push({ position: new Vector3().setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld), length });
      }
    } else {
      links.push({ position: object.getWorldPosition(new Vector3()), length });
    }
  });
  return links;
}

describe('anchor chain', () => {
  it.each([0, 0.4])('keeps adjacent links overlapping throughout the throw with boat roll %s', (roll) => {
    const effects = new EventItemEffects();
    const boat = new Group();
    boat.position.set(2, 0.3, -1);
    boat.rotation.set(0.1, 0.6, roll);
    const actor = new Group();
    boat.add(actor);
    const sample = createEventItemUseSample();
    sample.effectKind = 'chain';
    sample.primaryEffect = 1;
    try {
      for (let frame = 0; frame <= 20; frame += 1) {
        const progress = frame / 20;
        actor.position.set(0.8 + progress * 3, 1 + Math.sin(progress * Math.PI) - progress * 1.4, 0.5);
        actor.rotation.set(progress * 3, 0, progress * 2);
        sample.secondaryEffect = progress;
        effects.apply(sample, actor);
        const links = readLinks(effects.root);
        expect(links.length).toBeGreaterThan(1);
        for (let index = 1; index < links.length; index += 1) {
          const gap = links[index]!.position.distanceTo(links[index - 1]!.position);
          expect(gap).toBeLessThan(links[index]!.length * 0.75);
          expect(gap).toBeGreaterThan(links[index]!.length * 0.3);
        }
        const anchorAttachment = actor.localToWorld(new Vector3(0, 0.22, 0));
        expect(links.at(-1)!.position.distanceTo(anchorAttachment)).toBeLessThan(0.00001);
      }
    } finally {
      effects.dispose();
    }
  });
});

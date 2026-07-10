import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

export interface LifeboatBuild {
  root: Group;
  slots: Group[];
  acceptanceBox: Box3;
}

export function createLifeboat(): LifeboatBuild {
  const root = new Group();
  root.name = 'lifeboat';
  const orange = new MeshStandardMaterial({ color: 0x9b6848, roughness: 0.78, flatShading: true });
  const inner = new MeshStandardMaterial({ color: 0x403b35, roughness: 0.9, flatShading: true });
  const sideGeometry = new BoxGeometry(0.35, 0.75, 5.4);
  const left = new Mesh(sideGeometry, orange);
  const right = new Mesh(sideGeometry, orange);
  left.position.x = -1.25;
  right.position.x = 1.25;
  left.rotation.z = -0.16;
  right.rotation.z = 0.16;
  const floor = new Mesh(new BoxGeometry(2.2, 0.25, 4.9), inner);
  floor.position.y = -0.4;
  const bow = new Mesh(new BoxGeometry(2.2, 0.7, 0.35), orange);
  bow.position.z = -2.55;
  const stern = bow.clone();
  stern.position.z = 2.55;
  root.add(left, right, floor, bow, stern);

  const slots = [
    [-0.68, 0, -1.45], [0.68, 0, -1.45], [-0.68, 0, 0], [0.68, 0, 0], [0, 0, 1.45],
  ].map(([x, y, z], index) => {
    const slot = new Group();
    slot.name = `supply-slot-${index + 1}`;
    slot.position.set(x!, y!, z!);
    root.add(slot);
    return slot;
  });

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return {
    root,
    slots,
    acceptanceBox: new Box3(new Vector3(-1.55, -0.8, -2.9), new Vector3(1.55, 1.2, 2.9)),
  };
}

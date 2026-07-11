import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { ItemId } from '../game/ItemState';

const material = (color: number, metalness = 0.15): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.72, metalness, flatShading: true });

const box = (size: [number, number, number], color: number): Mesh =>
  new Mesh(new BoxGeometry(...size), material(color));

const cylinder = (radius: number, length: number, color: number, radialSegments = 8): Mesh => {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, radialSegments), material(color, 0.25));
  mesh.rotation.z = Math.PI / 2;
  return mesh;
};

export function createProp(id: ItemId): Group {
  const root = new Group();
  root.name = `prop:${id}`;
  root.userData.itemId = id;

  if (id === 'flareGun') {
    const barrel = box([0.18, 0.18, 0.72], 0x9c4f3f);
    barrel.position.z = -0.15;
    const grip = box([0.16, 0.42, 0.18], 0x393735);
    grip.position.set(0, -0.24, 0.12);
    grip.rotation.x = -0.22;
    root.add(barrel, grip);
  } else if (id === 'ductTape') {
    const roll = new Mesh(new TorusGeometry(0.25, 0.1, 6, 12), material(0x666c6c, 0.45));
    roll.rotation.x = Math.PI / 2;
    root.add(roll);
  } else if (id === 'fishingRod') {
    const rod = cylinder(0.025, 1.8, 0x765535, 6);
    const reel = cylinder(0.12, 0.12, 0x788184, 8);
    reel.rotation.set(Math.PI / 2, 0, 0);
    reel.position.set(0.18, -0.04, 0);
    root.add(rod, reel);
  } else if (id === 'baitTin') {
    const tin = cylinder(0.28, 0.22, 0x86989a, 12);
    tin.rotation.z = 0;
    const label = box([0.58, 0.12, 0.03], 0x9c4f3f);
    label.position.z = 0.25;
    root.add(tin, label);
  } else if (id === 'medicalKit') {
    const caseMesh = box([0.7, 0.42, 0.28], 0xb8b29f);
    const vertical = box([0.12, 0.26, 0.03], 0x9c4f3f);
    vertical.position.z = 0.16;
    const horizontal = box([0.3, 0.1, 0.03], 0x9c4f3f);
    horizontal.position.z = 0.16;
    root.add(caseMesh, vertical, horizontal);
  } else if (id === 'waterJug') {
    const body = new Mesh(new CylinderGeometry(0.25, 0.3, 0.72, 8), material(0x547b82));
    const cap = new Mesh(new CylinderGeometry(0.13, 0.13, 0.11, 8), material(0xc6bd9e));
    cap.position.y = 0.42;
    root.add(body, cap);
  } else if (id === 'cannedFood') {
    const can = new Mesh(new CylinderGeometry(0.2, 0.2, 0.38, 12), material(0x7c8582, 0.45));
    const band = new Mesh(new CylinderGeometry(0.205, 0.205, 0.18, 12), material(0x9b6848));
    root.add(can, band);
  } else if (id === 'scubaSet') {
    const leftTank = new Mesh(new CylinderGeometry(0.14, 0.14, 0.72, 8), material(0x547b82, 0.4));
    leftTank.position.x = -0.18;
    const rightTank = leftTank.clone();
    rightTank.position.x = 0.18;
    const harness = box([0.5, 0.5, 0.1], 0x353b3c);
    harness.position.z = -0.14;
    root.add(leftTank, rightTank, harness);
  } else {
    const body = cylinder(0.11, 0.58, 0x353b3c, 10);
    const head = new Mesh(new CylinderGeometry(0.2, 0.13, 0.2, 10), material(0x9b8b61, 0.35));
    head.rotation.z = Math.PI / 2;
    head.position.x = 0.36;
    const lens = new Mesh(new SphereGeometry(0.115, 8, 6), material(0xd4c894));
    lens.scale.x = 0.32;
    lens.position.x = 0.47;
    root.add(body, head, lens);
  }

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}

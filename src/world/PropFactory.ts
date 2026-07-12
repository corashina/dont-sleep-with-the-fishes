import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { ItemInstance } from '../game/ItemState';

const material = (color: number, metalness = 0.15): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.72, metalness, flatShading: true });

const box = (size: [number, number, number], color: number, metalness = 0.15): Mesh =>
  new Mesh(new BoxGeometry(...size), material(color, metalness));

const cylinder = (
  radius: number,
  length: number,
  color: number,
  radialSegments = 8,
): Mesh => {
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, length, radialSegments),
    material(color, 0.25),
  );
  mesh.rotation.z = Math.PI / 2;
  return mesh;
};

const torus = (
  radius: number,
  tube: number,
  color: number,
  radialSegments = 6,
  tubularSegments = 12,
): Mesh => new Mesh(
  new TorusGeometry(radius, tube, radialSegments, tubularSegments),
  material(color, 0.25),
);

function populateModel(model: Group, type: string): void {
  switch (type) {
    case 'flareGun': {
      const barrel = box([0.18, 0.18, 0.72], 0x9c4f3f);
      barrel.position.z = -0.15;
      const grip = box([0.16, 0.42, 0.18], 0x393735);
      grip.position.set(0, -0.24, 0.12);
      grip.rotation.x = -0.22;
      model.add(barrel, grip);
      break;
    }
    case 'ductTape': {
      const roll = torus(0.25, 0.1, 0x666c6c, 6, 12);
      roll.rotation.x = Math.PI / 2;
      model.add(roll);
      break;
    }
    case 'fishingRod': {
      const rod = cylinder(0.025, 1.8, 0x765535, 6);
      const reel = cylinder(0.12, 0.12, 0x788184, 8);
      reel.rotation.set(Math.PI / 2, 0, 0);
      reel.position.set(0.18, -0.04, 0);
      model.add(rod, reel);
      break;
    }
    case 'baitTin': {
      const tin = cylinder(0.28, 0.22, 0x86989a, 12);
      tin.rotation.z = 0;
      const label = box([0.58, 0.12, 0.03], 0x9c4f3f);
      label.position.z = 0.25;
      model.add(tin, label);
      break;
    }
    case 'medicalKit': {
      const caseMesh = box([0.7, 0.42, 0.28], 0xb8b29f);
      const vertical = box([0.12, 0.26, 0.03], 0x9c4f3f);
      vertical.position.z = 0.16;
      const horizontal = box([0.3, 0.1, 0.03], 0x9c4f3f);
      horizontal.position.z = 0.16;
      model.add(caseMesh, vertical, horizontal);
      break;
    }
    case 'waterJug': {
      const body = new Mesh(
        new CylinderGeometry(0.25, 0.3, 0.72, 8),
        material(0x547b82),
      );
      const cap = new Mesh(
        new CylinderGeometry(0.13, 0.13, 0.11, 8),
        material(0xc6bd9e),
      );
      cap.position.y = 0.42;
      model.add(body, cap);
      break;
    }
    case 'cannedFood': {
      const can = new Mesh(
        new CylinderGeometry(0.2, 0.2, 0.38, 12),
        material(0x7c8582, 0.45),
      );
      const band = new Mesh(
        new CylinderGeometry(0.205, 0.205, 0.18, 12),
        material(0x9b6848),
      );
      model.add(can, band);
      break;
    }
    case 'flashlight': {
      const body = cylinder(0.11, 0.58, 0x353b3c, 10);
      const head = new Mesh(
        new CylinderGeometry(0.2, 0.13, 0.2, 10),
        material(0x9b8b61, 0.35),
      );
      head.rotation.z = Math.PI / 2;
      head.position.x = 0.36;
      const lens = new Mesh(new SphereGeometry(0.115, 8, 6), material(0xd4c894));
      lens.scale.x = 0.32;
      lens.position.x = 0.47;
      model.add(body, head, lens);
      break;
    }
    case 'scubaSet': {
      const leftTank = new Mesh(
        new CylinderGeometry(0.14, 0.14, 0.72, 8),
        material(0x547b82, 0.4),
      );
      leftTank.name = 'scuba-tank-left';
      leftTank.position.x = -0.18;
      const rightTank = leftTank.clone();
      rightTank.name = 'scuba-tank-right';
      rightTank.position.x = 0.18;
      const harness = box([0.5, 0.5, 0.1], 0x353b3c);
      harness.name = 'scuba-harness';
      harness.position.z = -0.14;
      const maskFrame = torus(0.16, 0.035, 0x252d30, 6, 12);
      maskFrame.name = 'scuba-mask-frame';
      maskFrame.scale.set(1.35, 0.85, 1);
      maskFrame.position.set(0, 0.5, 0.05);
      const maskLens = box([0.32, 0.16, 0.025], 0x78969a);
      maskLens.name = 'scuba-mask-lens';
      maskLens.position.set(0, 0.5, 0.045);
      model.add(leftTank, rightTank, harness, maskFrame, maskLens);
      break;
    }
    case 'compass': {
      const casing = new Mesh(
        new CylinderGeometry(0.28, 0.28, 0.1, 12),
        material(0xb18a48, 0.55),
      );
      const face = new Mesh(
        new CylinderGeometry(0.21, 0.21, 0.015, 12),
        material(0xe0d6b6),
      );
      face.position.y = 0.058;
      const needle = box([0.035, 0.025, 0.3], 0x9c4f3f);
      needle.position.y = 0.075;
      model.add(casing, face, needle);
      break;
    }
    case 'map': {
      const sheet = box([0.78, 0.025, 0.52], 0xd2c39a);
      const foldA = box([0.025, 0.012, 0.5], 0x8d7d5b);
      foldA.position.set(-0.13, 0.02, 0);
      const foldB = foldA.clone();
      foldB.position.x = 0.13;
      const route = box([0.52, 0.012, 0.025], 0x547b82);
      route.position.set(0, 0.025, 0.06);
      route.rotation.y = 0.28;
      model.add(sheet, foldA, foldB, route);
      break;
    }
    case 'telescope': {
      const mainTube = cylinder(0.13, 0.62, 0x9b6848, 10);
      const eyeTube = cylinder(0.09, 0.25, 0xb18a48, 10);
      eyeTube.position.x = -0.41;
      const rim = torus(0.17, 0.035, 0xb18a48, 6, 12);
      rim.rotation.y = Math.PI / 2;
      rim.position.x = 0.34;
      model.add(mainTube, eyeTube, rim);
      break;
    }
    case 'fishingNet': {
      const frame = torus(0.35, 0.035, 0x765535, 6, 14);
      frame.scale.y = 1.2;
      const handle = cylinder(0.035, 0.9, 0x765535, 6);
      handle.position.x = -0.65;
      const meshA = box([0.025, 0.58, 0.02], 0x9aa5a1);
      const meshB = meshA.clone();
      meshA.rotation.z = Math.PI / 4;
      meshB.rotation.z = -Math.PI / 4;
      model.add(frame, handle, meshA, meshB);
      break;
    }
    case 'bucket': {
      const pail = new Mesh(
        new CylinderGeometry(0.29, 0.22, 0.5, 10, 1, true),
        material(0x75898b, 0.35),
      );
      const base = new Mesh(
        new CylinderGeometry(0.22, 0.22, 0.045, 10),
        material(0x5c6d70, 0.35),
      );
      base.position.y = -0.25;
      const handle = new Mesh(
        new TorusGeometry(0.34, 0.025, 6, 12, Math.PI),
        material(0x343c3d, 0.45),
      );
      handle.position.y = 0.22;
      model.add(pail, base, handle);
      break;
    }
    case 'anchor': {
      const shaft = box([0.08, 0.86, 0.08], 0x525b5c, 0.5);
      const stock = box([0.72, 0.08, 0.08], 0x525b5c, 0.5);
      stock.position.y = 0.2;
      const crown = box([0.66, 0.08, 0.08], 0x525b5c, 0.5);
      crown.position.y = -0.4;
      const ring = torus(0.15, 0.035, 0x525b5c, 6, 12);
      ring.position.y = 0.54;
      model.add(shaft, stock, crown, ring);
      break;
    }
    case 'umbrella': {
      const stem = new Mesh(
        new CylinderGeometry(0.025, 0.025, 0.9, 6),
        material(0x4e5657, 0.35),
      );
      stem.position.y = -0.1;
      const canopy = new Mesh(
        new CylinderGeometry(0.04, 0.5, 0.22, 10),
        material(0xb65c4c),
      );
      canopy.position.y = 0.48;
      const handle = torus(0.11, 0.025, 0x4e5657, 6, 10);
      handle.position.set(0.09, -0.58, 0);
      model.add(stem, canopy, handle);
      break;
    }
    case 'swimRing': {
      const ring = torus(0.34, 0.13, 0xd56f48, 8, 16);
      const stripeA = box([0.13, 0.3, 0.08], 0xe2d7ba);
      stripeA.position.x = -0.25;
      stripeA.rotation.z = -0.45;
      const stripeB = stripeA.clone();
      stripeB.position.x = 0.25;
      stripeB.rotation.z = 0.45;
      model.add(ring, stripeA, stripeB);
      break;
    }
    case 'harpoonGun': {
      const body = box([0.2, 0.2, 0.82], 0x4b5353);
      const grip = box([0.17, 0.38, 0.18], 0x765535);
      grip.position.set(0, -0.25, 0.12);
      grip.rotation.x = -0.2;
      const spear = cylinder(0.025, 1.05, 0x9aa5a1, 6);
      spear.rotation.set(Math.PI / 2, 0, 0);
      spear.position.z = -0.02;
      const tip = box([0.14, 0.04, 0.14], 0x9aa5a1, 0.5);
      tip.position.z = -0.53;
      tip.rotation.y = Math.PI / 4;
      model.add(body, grip, spear, tip);
      break;
    }
    case 'energyBar': {
      const wrapper = box([0.68, 0.18, 0.09], 0x9c4f3f);
      const label = box([0.28, 0.19, 0.02], 0xd7c86f);
      label.position.z = 0.055;
      const crimpA = box([0.06, 0.21, 0.08], 0xb6aaa0, 0.35);
      crimpA.position.x = -0.34;
      const crimpB = crimpA.clone();
      crimpB.position.x = 0.34;
      model.add(wrapper, label, crimpA, crimpB);
      break;
    }
    case 'repairKit': {
      const caseMesh = box([0.76, 0.34, 0.3], 0xb18a48);
      const claspA = box([0.1, 0.1, 0.04], 0x596163, 0.45);
      claspA.position.set(-0.2, 0.05, 0.17);
      const claspB = claspA.clone();
      claspB.position.x = 0.2;
      const handle = torus(0.17, 0.035, 0x343c3d, 6, 10);
      handle.scale.y = 0.65;
      handle.position.y = 0.22;
      model.add(caseMesh, claspA, claspB, handle);
      break;
    }
    case 'chest': {
      const base = box([0.78, 0.42, 0.46], 0x765535);
      base.position.y = -0.12;
      const lid = new Mesh(
        new CylinderGeometry(0.25, 0.25, 0.78, 8, 1, false, 0, Math.PI),
        material(0x8c663d),
      );
      lid.rotation.z = Math.PI / 2;
      lid.rotation.y = Math.PI / 2;
      lid.position.y = 0.12;
      const bandA = box([0.08, 0.58, 0.5], 0x4e5657, 0.45);
      bandA.position.x = -0.24;
      const bandB = bandA.clone();
      bandB.position.x = 0.24;
      const lock = box([0.14, 0.18, 0.06], 0xb18a48, 0.55);
      lock.position.set(0, 0, 0.26);
      model.add(base, lid, bandA, bandB, lock);
      break;
    }
    default: {
      model.name = 'generic-supply';
      const crate = box([0.55, 0.38, 0.42], 0x7d725d);
      const strap = box([0.12, 0.4, 0.44], 0x4e5657, 0.35);
      model.add(crate, strap);
    }
  }
}

export function createProp(instance: ItemInstance): Group {
  const { instanceId, type } = instance;
  const root = new Group();
  root.name = `prop:${instanceId}`;
  root.userData.instanceId = instanceId;
  root.userData.itemType = type;

  const model = new Group();
  model.name = `prop-model:${type}`;
  populateModel(model, type);
  root.add(model);

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}

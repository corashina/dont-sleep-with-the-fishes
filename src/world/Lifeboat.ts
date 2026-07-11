import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';

export interface LifeboatBuild {
  root: Group;
  storageRoot: Group;
  acceptanceBox: Box3;
  interiorBounds: Box3;
}

export function createLifeboat(options: { fishingRod?: boolean } = {}): LifeboatBuild {
  const root = new Group();
  root.name = 'lifeboat';
  const orange = new MeshStandardMaterial({ color: 0xb8693f, roughness: 0.78, flatShading: true });
  const inner = new MeshStandardMaterial({ color: 0x403b35, roughness: 0.9, flatShading: true });
  const metal = new MeshStandardMaterial({ color: 0x847c68, roughness: 0.72, flatShading: true });
  const rope = new MeshStandardMaterial({ color: 0x33291f, roughness: 1, flatShading: true });
  const supply = new MeshStandardMaterial({ color: 0xb18a51, roughness: 0.88, flatShading: true });
  const sideGeometry = new BoxGeometry(0.35, 0.75, 5.4);
  const left = new Mesh(sideGeometry, orange);
  const right = new Mesh(sideGeometry, orange);
  left.name = 'hull-port';
  right.name = 'hull-starboard';
  left.position.x = -1.25;
  right.position.x = 1.25;
  left.rotation.z = -0.16;
  right.rotation.z = 0.16;
  const floor = new Mesh(new BoxGeometry(2.2, 0.25, 4.9), inner);
  floor.name = 'boat-floor';
  floor.position.y = -0.4;
  const bow = new Mesh(new BoxGeometry(2.2, 0.7, 0.35), orange);
  bow.name = 'boat-bow';
  bow.position.z = -2.55;
  const stern = bow.clone();
  stern.name = 'boat-stern';
  stern.position.z = 2.55;
  root.add(left, right, floor, bow, stern);

  const mountGeometry = new TorusGeometry(0.12, 0.04, 5, 10, Math.PI);
  for (const x of [-1, 1]) {
    const mount = new Mesh(mountGeometry, metal);
    mount.name = x < 0 ? 'oar-mount-port' : 'oar-mount-starboard';
    mount.position.set(x * 1.04, 0.42, -0.45);
    mount.rotation.set(Math.PI / 2, 0, x * Math.PI / 2);
    root.add(mount);
  }

  const patch = new Mesh(new BoxGeometry(0.72, 0.06, 0.52), supply);
  patch.name = 'damaged-plank-patch';
  patch.position.set(-0.88, 0.14, -1.52);
  patch.rotation.set(0.05, -0.18, 0.28);
  root.add(patch);

  const crate = new Group();
  crate.name = 'supply-crate';
  crate.position.set(0.62, -0.08, 0.82);
  const crateBody = new Mesh(new BoxGeometry(0.72, 0.55, 0.62), supply);
  const crateBandGeometry = new BoxGeometry(0.78, 0.08, 0.68);
  const crateBandTop = new Mesh(crateBandGeometry, metal);
  const crateBandBottom = crateBandTop.clone();
  crateBandTop.position.y = 0.18;
  crateBandBottom.position.y = -0.18;
  crate.add(crateBody, crateBandTop, crateBandBottom);
  root.add(crate);

  const rod = new Mesh(new CylinderGeometry(0.018, 0.025, 2.05, 7), metal);
  rod.name = 'fishing-rod';
  rod.position.set(0.94, 0.72, -0.2);
  rod.rotation.set(0.18, 0, -0.62);
  if (options.fishingRod) root.add(rod);

  const line = new Mesh(new CylinderGeometry(0.004, 0.004, 1.55, 4), rope);
  line.name = 'fishing-line';
  line.position.set(1.58, 0.18, -0.2);
  line.visible = false;
  root.add(line);

  const catchMesh = new Mesh(new SphereGeometry(0.12, 7, 5), metal);
  catchMesh.name = 'fishing-catch';
  catchMesh.position.set(1.58, -0.58, -0.2);
  catchMesh.scale.set(1.8, 0.65, 0.45);
  catchMesh.visible = false;
  root.add(catchMesh);

  const storageRoot = new Group();
  storageRoot.name = 'lifeboat-storage';
  root.add(storageRoot);

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  const interiorBounds = new Box3(
    new Vector3(-1.02, -0.42, -2.28),
    new Vector3(1.02, 1, 2.28),
  );
  return {
    root,
    storageRoot,
    acceptanceBox: new Box3(new Vector3(-1, -0.2, -2.3), new Vector3(1, 1, 2.3)),
    interiorBounds,
  };
}

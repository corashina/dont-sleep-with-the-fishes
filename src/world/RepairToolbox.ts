import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';

function box(
  name: string,
  size: readonly [number, number, number],
  material: MeshStandardMaterial,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.name = name;
  return mesh;
}

export function createRepairToolbox(): Group {
  const steel = new MeshStandardMaterial({
    color: 0x8c2f27,
    roughness: 0.78,
    metalness: 0.42,
    flatShading: true,
  });
  const darkSteel = new MeshStandardMaterial({
    color: 0x342d2a,
    roughness: 0.86,
    metalness: 0.48,
    flatShading: true,
  });
  const wornSteel = new MeshStandardMaterial({
    color: 0xa77860,
    roughness: 0.9,
    metalness: 0.24,
    flatShading: true,
  });
  const wood = new MeshStandardMaterial({
    color: 0x6f4b2f,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  const rubber = new MeshStandardMaterial({
    color: 0x20201e,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
  });
  const yellow = new MeshStandardMaterial({
    color: 0xc58a24,
    roughness: 0.82,
    metalness: 0.08,
    flatShading: true,
  });

  const toolbox = new Group();
  toolbox.name = 'repair-toolbox';

  const caseRoot = new Group();
  caseRoot.name = 'repair-toolbox-case';
  const base = box('repair-toolbox-base', [0.92, 0.10, 0.46], steel);
  const back = box('repair-toolbox-case-back', [0.92, 0.28, 0.07], steel);
  back.position.set(0, 0.14, 0.195);
  const front = box('repair-toolbox-case-front', [0.92, 0.28, 0.07], steel);
  front.position.set(0, 0.14, -0.195);
  const left = box('repair-toolbox-case-left', [0.07, 0.28, 0.34], steel);
  left.position.set(-0.425, 0.14, 0);
  const right = left.clone();
  right.name = 'repair-toolbox-case-right';
  right.position.x = 0.425;
  caseRoot.add(base, back, front, left, right);
  caseRoot.position.y = 0.05;
  toolbox.add(caseRoot);

  const lid = new Group();
  lid.name = 'repair-toolbox-lid';
  lid.position.set(0, 0.31, 0.22);
  lid.rotation.x = -1.02;
  const lidPanel = box('repair-toolbox-lid-panel', [0.92, 0.07, 0.42], steel);
  lidPanel.position.z = 0.18;
  const lidRibTop = box('repair-toolbox-lid-rib-top', [0.76, 0.025, 0.035], darkSteel);
  lidRibTop.position.set(0, -0.05, 0.08);
  const lidRibBottom = lidRibTop.clone();
  lidRibBottom.position.z = 0.29;
  lid.add(lidPanel, lidRibTop, lidRibBottom);
  toolbox.add(lid);

  const tray = new Group();
  tray.name = 'repair-toolbox-tray';
  tray.position.set(0, 0.31, 0.03);
  const trayBase = box('repair-toolbox-tray-base', [0.72, 0.035, 0.26], darkSteel);
  const trayLip = box('repair-toolbox-tray-lip', [0.72, 0.07, 0.035], wornSteel);
  trayLip.position.set(0, 0.035, -0.13);
  tray.add(trayBase, trayLip);
  toolbox.add(tray);

  const handle = new Mesh(
    new TorusGeometry(0.22, 0.025, 6, 16, Math.PI),
    darkSteel,
  );
  handle.name = 'repair-toolbox-handle';
  handle.position.set(0, 0.51, 0.08);
  handle.rotation.set(Math.PI / 2, 0, Math.PI);
  toolbox.add(handle);

  for (const [index, x] of [-0.26, 0.26].entries()) {
    const latch = box(`repair-toolbox-latch-${index}`, [0.11, 0.12, 0.04], wornSteel);
    latch.position.set(x, 0.23, -0.245);
    toolbox.add(latch);
  }

  const hammer = new Group();
  hammer.name = 'repair-toolbox-hammer';
  const hammerHandle = new Mesh(new CylinderGeometry(0.024, 0.032, 0.48, 8), wood);
  hammerHandle.rotation.z = Math.PI / 2;
  const hammerHead = box('repair-toolbox-hammer-head', [0.18, 0.085, 0.09], darkSteel);
  hammerHead.position.x = 0.24;
  hammer.add(hammerHandle, hammerHead);
  hammer.position.set(-0.12, 0.39, 0.01);
  hammer.rotation.y = -0.25;
  toolbox.add(hammer);

  const wrench = new Group();
  wrench.name = 'repair-toolbox-wrench';
  const wrenchShaft = box('repair-toolbox-wrench-shaft', [0.38, 0.035, 0.075], wornSteel);
  const wrenchJawTop = box('repair-toolbox-wrench-jaw-top', [0.12, 0.04, 0.045], wornSteel);
  wrenchJawTop.position.set(0.21, 0, 0.06);
  wrenchJawTop.rotation.y = 0.38;
  const wrenchJawBottom = wrenchJawTop.clone();
  wrenchJawBottom.position.z = -0.06;
  wrenchJawBottom.rotation.y = -0.38;
  wrench.add(wrenchShaft, wrenchJawTop, wrenchJawBottom);
  wrench.position.set(0.12, 0.43, 0.11);
  wrench.rotation.y = 0.34;
  toolbox.add(wrench);

  const screwdriver = new Group();
  screwdriver.name = 'repair-toolbox-screwdriver';
  const driverGrip = new Mesh(new CylinderGeometry(0.045, 0.065, 0.22, 8), yellow);
  driverGrip.rotation.z = Math.PI / 2;
  const driverShaft = new Mesh(new CylinderGeometry(0.012, 0.012, 0.30, 6), wornSteel);
  driverShaft.rotation.z = Math.PI / 2;
  driverShaft.position.x = 0.25;
  const driverCap = new Mesh(new CylinderGeometry(0.05, 0.05, 0.025, 8), rubber);
  driverCap.rotation.z = Math.PI / 2;
  driverCap.position.x = -0.12;
  screwdriver.add(driverGrip, driverShaft, driverCap);
  screwdriver.position.set(0.02, 0.38, -0.12);
  screwdriver.rotation.y = -0.18;
  toolbox.add(screwdriver);

  const wear = new Group();
  wear.name = 'repair-toolbox-wear';
  for (const [index, x] of [-0.34, -0.08, 0.22, 0.37].entries()) {
    const chip = box(`repair-toolbox-paint-chip-${index}`, [0.09, 0.012, 0.035], wornSteel);
    chip.position.set(x, 0.34 + (index % 2) * 0.035, -0.236);
    chip.rotation.z = index % 2 === 0 ? -0.15 : 0.12;
    wear.add(chip);
  }
  toolbox.add(wear);

  toolbox.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return toolbox;
}

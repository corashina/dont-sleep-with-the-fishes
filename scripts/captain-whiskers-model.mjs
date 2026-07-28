import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AnimationClip,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  TorusGeometry,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const OUTPUT_PATH = resolve('src', 'assets', 'models', 'items', 'captainWhiskers.glb');
const IDLE_CLIP_NAME = 'CaptainWhiskersIdle';

class NodeFileReader {
  result = null;
  onload = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((result) => {
        this.result = result;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}

if (typeof globalThis.FileReader === 'undefined') globalThis.FileReader = NodeFileReader;

function material(name, color, roughness = 0.9, metalness = 0) {
  const result = new MeshStandardMaterial({
    color: new Color(color),
    flatShading: true,
    metalness,
    roughness,
  });
  result.name = name;
  return result;
}

const ginger = material('sun-faded ginger fur', 0x9f4e2c);
const gingerLight = material('warm ginger fur', 0xc27444);
const gingerDark = material('dark tabby markings', 0x603224);
const cream = material('weathered white fur', 0xd7cfb7);
const eyeGreen = material('sea-glass eyes', 0x6f9b76, 0.55);
const pupil = material('ink pupils', 0x171814);
const nose = material('muted rose nose', 0x9e5f58);
const collar = material('deep teal collar', 0x214f52, 0.72);
const brass = material('tarnished brass tag', 0x98733d, 0.48, 0.32);
const whisker = material('soft whiskers', 0xddd7c7);

function ellipsoid(parent, name, position, scale, modelMaterial, detail = 1) {
  const mesh = new Mesh(new IcosahedronGeometry(0.5, detail), modelMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function cone(parent, name, position, scale, rotation, modelMaterial) {
  const mesh = new Mesh(new ConeGeometry(0.5, 1, 5, 1, false), modelMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function cylinderBetween(parent, name, start, end, radius, modelMaterial, radialSegments = 6) {
  const from = new Vector3(...start);
  const to = new Vector3(...end);
  const direction = to.clone().sub(from);
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, direction.length(), radialSegments, 1, false),
    modelMaterial,
  );
  mesh.name = name;
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

function quaternionValues(eulers) {
  return eulers.flatMap(([x, y, z]) => {
    const value = new Quaternion().setFromEuler(new Euler(x, y, z));
    return value.toArray();
  });
}

function createCaptainWhiskers() {
  const scene = new Scene();
  scene.name = 'CaptainWhiskersScene';

  const root = new Group();
  root.name = 'CaptainWhiskers';
  scene.add(root);

  const breath = new Group();
  breath.name = 'WhiskersBreath';
  root.add(breath);

  ellipsoid(breath, 'Body', [0, 0.78, 0.08], [0.94, 1.30, 0.73], gingerLight, 2);
  ellipsoid(breath, 'WhiteBib', [0, 0.82, -0.345], [0.54, 0.83, 0.14], cream, 1);
  ellipsoid(breath, 'LeftHaunch', [-0.43, 0.42, 0.11], [0.60, 0.70, 0.62], ginger, 1);
  ellipsoid(breath, 'RightHaunch', [0.43, 0.42, 0.11], [0.60, 0.70, 0.62], ginger, 1);

  ellipsoid(breath, 'LeftForeleg', [-0.27, 0.36, -0.39], [0.25, 0.73, 0.24], cream, 1);
  ellipsoid(breath, 'RightForeleg', [0.27, 0.36, -0.39], [0.25, 0.73, 0.24], cream, 1);
  ellipsoid(breath, 'LeftPaw', [-0.28, 0.09, -0.47], [0.34, 0.18, 0.42], cream, 1);
  ellipsoid(breath, 'RightPaw', [0.28, 0.09, -0.47], [0.34, 0.18, 0.42], cream, 1);

  const bodyStripes = [
    [-0.46, 0.95, 0.48, -0.22],
    [-0.51, 0.70, 0.48, -0.12],
    [0.46, 0.91, 0.48, 0.18],
    [0.50, 0.65, 0.46, 0.11],
  ];
  bodyStripes.forEach(([x, y, z, rotation], index) => {
    const stripe = ellipsoid(
      breath,
      `BodyStripe${index + 1}`,
      [x, y, z],
      [0.12, 0.34, 0.07],
      gingerDark,
      1,
    );
    stripe.rotation.z = rotation;
  });

  const headPivot = new Group();
  headPivot.name = 'WhiskersHead';
  headPivot.position.set(0, 1.58, -0.08);
  breath.add(headPivot);

  ellipsoid(headPivot, 'Head', [0, 0, 0], [0.82, 0.68, 0.68], gingerLight, 2);
  ellipsoid(headPivot, 'FaceMask', [0, -0.05, -0.315], [0.58, 0.50, 0.15], cream, 1);

  const leftEarPivot = new Group();
  leftEarPivot.name = 'WhiskersLeftEar';
  leftEarPivot.position.set(-0.32, 0.28, -0.01);
  headPivot.add(leftEarPivot);
  cone(leftEarPivot, 'LeftEar', [0, 0.19, 0], [0.37, 0.48, 0.28], [0, 0, 0.08], ginger,);
  cone(leftEarPivot, 'LeftEarInner', [0, 0.19, -0.09], [0.18, 0.29, 0.10], [0, 0, 0.08], nose);

  const rightEarPivot = new Group();
  rightEarPivot.name = 'WhiskersRightEar';
  rightEarPivot.position.set(0.33, 0.27, -0.01);
  rightEarPivot.rotation.z = -0.13;
  headPivot.add(rightEarPivot);
  cone(rightEarPivot, 'RightEar', [0, 0.17, 0], [0.35, 0.41, 0.28], [0, 0, -0.06], ginger);
  cone(rightEarPivot, 'RightEarInner', [0, 0.16, -0.09], [0.17, 0.23, 0.10], [0, 0, -0.06], nose);

  for (const side of [-1, 1]) {
    ellipsoid(headPivot, `${side < 0 ? 'Left' : 'Right'}Eye`, [side * 0.21, 0.08, -0.335], [0.15, 0.18, 0.075], eyeGreen, 1);
    ellipsoid(headPivot, `${side < 0 ? 'Left' : 'Right'}Pupil`, [side * 0.21, 0.08, -0.377], [0.050, 0.12, 0.030], pupil, 1);
    ellipsoid(headPivot, `${side < 0 ? 'Left' : 'Right'}Muzzle`, [side * 0.13, -0.14, -0.38], [0.29, 0.22, 0.17], cream, 1);
  }
  ellipsoid(headPivot, 'Nose', [0, -0.075, -0.50], [0.12, 0.075, 0.065], nose, 1);
  cylinderBetween(headPivot, 'Mouth', [0, -0.12, -0.505], [0, -0.24, -0.49], 0.012, gingerDark, 5);

  [-0.20, -0.13, -0.06].forEach((height, index) => {
    const outward = 0.56 + index * 0.04;
    cylinderBetween(
      headPivot,
      `LeftWhisker${index + 1}`,
      [-0.13, height, -0.48],
      [-outward, height + (index - 1) * 0.06, -0.48],
      0.009,
      whisker,
      5,
    );
    cylinderBetween(
      headPivot,
      `RightWhisker${index + 1}`,
      [0.13, height, -0.48],
      [outward, height + (index - 1) * 0.06, -0.48],
      0.009,
      whisker,
      5,
    );
  });

  const foreheadStripes = [
    [-0.19, 0.23, -0.34, -0.20],
    [0, 0.27, -0.37, 0],
    [0.19, 0.23, -0.34, 0.20],
  ];
  foreheadStripes.forEach(([x, y, z, rotation], index) => {
    const stripe = ellipsoid(
      headPivot,
      `ForeheadStripe${index + 1}`,
      [x, y, z],
      [0.09, 0.25, 0.055],
      gingerDark,
      1,
    );
    stripe.rotation.z = rotation;
  });

  const collarMesh = new Mesh(new TorusGeometry(0.38, 0.045, 5, 18), collar);
  collarMesh.name = 'Collar';
  collarMesh.position.set(0, -0.35, 0);
  collarMesh.rotation.x = Math.PI / 2;
  headPivot.add(collarMesh);
  ellipsoid(headPivot, 'CaptainTag', [0, -0.45, -0.36], [0.16, 0.20, 0.055], brass, 1);

  const tailBase = new Group();
  tailBase.name = 'WhiskersTailBase';
  tailBase.position.set(0.38, 0.53, 0.30);
  tailBase.rotation.set(0.42, 0.12, -0.78);
  breath.add(tailBase);

  const tailMid = new Group();
  tailMid.name = 'WhiskersTailMid';
  tailMid.position.set(0, 0.34, 0);
  tailMid.rotation.set(-0.08, 0.12, -0.56);
  tailBase.add(tailMid);

  const tailTip = new Group();
  tailTip.name = 'WhiskersTailTip';
  tailTip.position.set(0, 0.31, 0);
  tailTip.rotation.set(0.05, -0.08, -0.42);
  tailMid.add(tailTip);

  cylinderBetween(tailBase, 'TailBaseFur', [0, 0, 0], [0, 0.38, 0], 0.13, ginger, 7);
  cylinderBetween(tailMid, 'TailMidFur', [0, 0, 0], [0, 0.35, 0], 0.115, gingerLight, 7);
  cylinderBetween(tailTip, 'WhiteTailTip', [0, 0, 0], [0, 0.33, 0], 0.10, cream, 7);
  ellipsoid(tailTip, 'TailTipCap', [0, 0.35, 0], [0.20, 0.25, 0.20], cream, 1);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const idleTimes = [0, 1.5, 3, 4.5, 6];
  const clip = new AnimationClip(IDLE_CLIP_NAME, 6, [
    new VectorKeyframeTrack('WhiskersBreath.scale', idleTimes, [
      1, 1, 1,
      1.008, 1.018, 0.996,
      1, 1, 1,
      1.006, 1.014, 0.997,
      1, 1, 1,
    ]),
    new QuaternionKeyframeTrack('WhiskersHead.quaternion', idleTimes, quaternionValues([
      [0, 0, 0],
      [0.018, -0.018, 0.008],
      [0, 0.012, 0],
      [-0.012, 0.020, -0.006],
      [0, 0, 0],
    ])),
    new QuaternionKeyframeTrack('WhiskersLeftEar.quaternion', [0, 2.8, 3.02, 3.22, 6], quaternionValues([
      [0, 0, 0],
      [0, 0, 0],
      [-0.10, 0, 0.17],
      [0, 0, 0],
      [0, 0, 0],
    ])),
    new QuaternionKeyframeTrack('WhiskersTailTip.quaternion', idleTimes, quaternionValues([
      [0.05, -0.08, -0.42],
      [0.02, 0.04, -0.30],
      [0.06, 0.10, -0.46],
      [0.03, -0.02, -0.35],
      [0.05, -0.08, -0.42],
    ])),
  ]);

  return { clip, scene };
}

async function exportBinary(scene, clip) {
  return new Promise((resolveExport, rejectExport) => {
    new GLTFExporter().parse(
      scene,
      (result) => resolveExport(result),
      rejectExport,
      {
        animations: [clip],
        binary: true,
        includeCustomExtensions: false,
        onlyVisible: false,
        trs: true,
      },
    );
  });
}

const { scene, clip } = createCaptainWhiskers();
const binary = await exportBinary(scene, clip);
if (!(binary instanceof ArrayBuffer)) throw new Error('Captain Whiskers export was not binary');
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, new Uint8Array(binary));
console.log(`Wrote ${OUTPUT_PATH} with animation ${IDLE_CLIP_NAME}`);

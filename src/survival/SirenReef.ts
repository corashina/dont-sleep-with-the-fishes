import {
  BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, Group, InstancedMesh,
  Mesh, MeshStandardMaterial, Object3D, RingGeometry,
} from 'three';
import { applySeaFogMaterial } from '../world/SeaFogMaterial';
import { mulberry32 } from './random';

// Each outcrop has its own footprint, fracture pattern, and lean.
const OUTCROPS = [
  { x: -4.6, z: -0.8, width: 3.5, depth: 2.7, height: 3.6, lean: -0.5 },
  { x: -6.8, z: 1.2, width: 2.1, depth: 2.8, height: 1.2, lean: 0.3 },
  { x: -8.2, z: -5.1, width: 3.1, depth: 3.4, height: 6.1, lean: 0.8 },
  { x: 4.2, z: -1.7, width: 3.4, depth: 3.2, height: 4.4, lean: -0.6 },
  { x: 6.3, z: 0.9, width: 2.8, depth: 2.1, height: 1.5, lean: 0.3 },
  { x: 7.6, z: -6.8, width: 3.6, depth: 3.2, height: 6.7, lean: -0.8 },
  { x: 1.8, z: -8.1, width: 2.4, depth: 2.9, height: 2.7, lean: 0.4 },
] as const;

function stoneMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0x8d9a94, vertexColors: true, roughness: 0.91, flatShading: true,
    emissive: 0x657f85, emissiveIntensity: 0.045,
  });
  applySeaFogMaterial(material);
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${cacheKey}:tidal-stone`;
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 vStoneWorld;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vStoneWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vStoneWorld;
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      float wet = 1.0 - smoothstep(0.12, 0.85, vStoneWorld.y);
      float strata = sin(vStoneWorld.y * 13.0 + sin(vStoneWorld.x * 1.7)
        + sin(vStoneWorld.z * 2.1) * 0.6);
      float seams = smoothstep(0.88, 0.99, strata);
      float grain = sin(vStoneWorld.x * 43.0 + vStoneWorld.z * 29.0)
        * sin(vStoneWorld.y * 51.0 - vStoneWorld.z * 37.0);
      diffuseColor.rgb *= (1.0 - seams * 0.16 + grain * 0.035);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.48, 0.62, 0.59), wet);
      float salt = (1.0 - smoothstep(0.0, 0.24, abs(vStoneWorld.y - 0.86)))
        * smoothstep(-0.2, 0.8, sin(vStoneWorld.x * 6.0 + vStoneWorld.z * 4.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.59, 0.51), salt * 0.23);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.36, wet);
    `);
  };
  return material;
}

function rockGeometry(width: number, depth: number, height: number, lean: number, seed: number): BufferGeometry {
  const random = mulberry32(seed);
  const sides = 9;
  const rings = [0, 0.12, 0.37, 0.4, 0.73, 1];
  const radii = [0.92, 1, 0.85, 0.91, 0.67, 0.42];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new Color();
  const outline = Array.from({ length: sides }, () => 0.8 + random.next() * 0.4);
  const crest = Array.from({ length: sides }, () => (random.next() - 0.5) * height * 0.24);
  for (let ring = 0; ring < rings.length; ring += 1) {
    const level = rings[ring]!;
    for (let side = 0; side < sides; side += 1) {
      const angle = side / sides * Math.PI * 2;
      const radius = radii[ring]! * outline[side]! * (0.95 + random.next() * 0.1);
      positions.push(
        Math.cos(angle) * radius * width * 0.5 + lean * level,
        level * height + crest[side]! * level,
        Math.sin(angle) * radius * depth * 0.5 + level * lean * 0.3,
      );
      const value = 0.64 + random.next() * 0.23 + level * 0.1;
      color.setRGB(value * 0.93, value, value * 0.98);
      colors.push(color.r, color.g, color.b);
      if (ring === 0) continue;
      const a = (ring - 1) * sides + side;
      const b = (ring - 1) * sides + (side + 1) % sides;
      const c = ring * sides + side;
      const d = ring * sides + (side + 1) % sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  const top = positions.length / 3;
  positions.push(lean, height * 0.98, lean * 0.3);
  colors.push(0.94, 0.98, 0.91);
  for (let side = 0; side < sides; side += 1) {
    indices.push(top, (rings.length - 1) * sides + (side + 1) % sides, (rings.length - 1) * sides + side);
    if (side > 0 && side < sides - 1) indices.push(0, side, side + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function barnacles(width: number, depth: number, material: MeshStandardMaterial, seed: number): InstancedMesh {
  const random = mulberry32(seed);
  const shells = new InstancedMesh(new ConeGeometry(0.1, 0.12, 6, 1, true), material, 22);
  shells.name = 'siren-reef:barnacles';
  const pose = new Object3D();
  for (let index = 0; index < shells.count; index += 1) {
    const angle = 0.5 + Math.floor(index / 6) * 0.64 + random.next() * 0.28;
    pose.position.set(Math.cos(angle) * width * 0.46, 0.3 + random.next() * 0.35, Math.sin(angle) * depth * 0.46);
    pose.rotation.set(Math.PI / 2, 0, -angle);
    pose.scale.setScalar(0.6 + random.next() * 0.8);
    pose.updateMatrix();
    shells.setMatrixAt(index, pose.matrix);
  }
  return shells;
}

function foam(width: number, depth: number, waterline: number, material: MeshStandardMaterial): Group {
  const root = new Group();
  root.name = 'siren-reef:foam';
  root.position.y = waterline + 0.025;
  for (let index = 0; index < 3; index += 1) {
    const arc = new Mesh(new RingGeometry(1.02, 1.055, 16, 1, index * 2.1, 0.65 + index * 0.18), material);
    arc.rotation.x = -Math.PI / 2;
    arc.scale.set(width * 0.5, depth * 0.5, 1);
    root.add(arc);
  }
  return root;
}

export function createSirenRock(): Group {
  const rock = new Group();
  rock.name = 'event-siren-rock';
  const stone = stoneMaterial();
  const mass = new Mesh(rockGeometry(5.2, 3.6, 2.7, -0.16, 472), stone);
  mass.name = 'event-siren-rock:mass';
  rock.add(mass);
  return rock;
}

export function createSirenReef(rock: Group, waterline: number): Group {
  const reef = new Group();
  reef.name = 'siren-reef';
  const stone = (rock.children[0] as Mesh<BufferGeometry, MeshStandardMaterial>).material;
  const shell = new MeshStandardMaterial({ color: 0xb5b2a0, roughness: 0.94 });
  const froth = new MeshStandardMaterial({
    color: 0x9bbab9, roughness: 0.8, transparent: true, opacity: 0.32,
    depthWrite: false, emissive: 0x749493, emissiveIntensity: 0.08,
  });
  applySeaFogMaterial(shell);
  applySeaFogMaterial(froth);
  reef.add(barnacles(5.2, 3.6, shell, 824), foam(5.8, 4.1, waterline, froth));
  for (let index = 0; index < OUTCROPS.length; index += 1) {
    const p = OUTCROPS[index]!;
    const outcrop = new Group();
    outcrop.name = `siren-reef-rock-${index + 1}`;
    outcrop.position.set(p.x, waterline - 0.38, p.z);
    const mass = new Mesh(rockGeometry(p.width, p.depth, p.height, p.lean, 157 + index * 83), stone);
    mass.name = `${outcrop.name}:mass`;
    outcrop.add(mass, barnacles(p.width, p.depth, shell, 331 + index));
    // Low broken shoulders make the stacks rooted in a shelf, not isolated pillars.
    const shoulder = new Mesh(rockGeometry(p.width * 0.7, p.depth * 0.75, p.height * 0.46, -p.lean, 923 + index), stone);
    shoulder.position.set(p.width * 0.34, 0, -p.depth * 0.16);
    shoulder.rotation.y = 0.7 + index * 0.9;
    outcrop.add(shoulder, foam(p.width * 1.18, p.depth * 1.2, 0.38, froth));
    reef.add(outcrop);
  }
  return reef;
}

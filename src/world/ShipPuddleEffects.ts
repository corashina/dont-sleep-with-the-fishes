import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Shape,
} from 'three';
import { disposeResourceSets } from './SceneResources';
import {
  SHIP_PUDDLE_OUTLINE,
  type FootprintAnchor,
} from './ShipDangerLayout';

export class ShipPuddleEffects {
  readonly root = new Group();

  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<MeshPhysicalMaterial>();
  private disposed = false;

  constructor(private readonly puddles: readonly FootprintAnchor[]) {
    this.root.name = 'ship-danger-puddle-effects';
    const material = new MeshPhysicalMaterial({
      color: 0x253c42,
      transparent: true,
      opacity: 0.74,
      vertexColors: true,
      roughness: 0.075,
      metalness: 0,
      ior: 1.333,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    // Approximate reflected sky from the existing hemisphere light. Its color and
    // intensity follow weather and night without reflection cameras or textures.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `
        #include <lights_fragment_maps>
        #if NUM_HEMI_LIGHTS > 0 && defined( RE_IndirectSpecular )
          vec3 puddleReflection = reflect(-geometryViewDir, geometryNormal);
          vec3 puddleWorldReflection = inverseTransformDirection(puddleReflection, viewMatrix);
          float cloudBand = sin(puddleWorldReflection.x * 11.0 + puddleWorldReflection.z * 7.0)
            * sin(puddleWorldReflection.z * 13.0 - puddleWorldReflection.y * 5.0);
          float cloudSheen = mix(0.35, 1.25, smoothstep(-0.15, 0.65, cloudBand));
          for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
            float skyWeight = smoothstep(-0.04, 0.35, dot(puddleReflection, hemisphereLights[i].direction));
            vec3 puddleSky = mix(hemisphereLights[i].groundColor,
              hemisphereLights[i].skyColor * cloudSheen * 0.35, skyWeight);
            radiance += puddleSky;
            clearcoatRadiance += puddleSky;
          }
        #endif
      `);
    };
    material.customProgramCacheKey = () => 'dorothy-puddle-sky';
    this.materials.add(material);
    const outline = createPuddleShape().getPoints(4);
    outline.pop(); // The shape closes by repeating its first point.
    puddles.forEach((anchor) => {
      const geometry = createPuddleGeometry(outline, anchor.id);
      this.geometries.add(geometry);
      const puddle = new Mesh(geometry, material);
      puddle.name = `ship-danger-puddle:${anchor.id}`;
      puddle.position.set(...anchor.position);
      puddle.rotation.set(...anchor.rotation);
      puddle.scale.set(anchor.size[0], anchor.size[1], 1);
      this.root.add(puddle);
    });
  }

  snapshotForTest(): { puddleCount: number } {
    return { puddleCount: this.puddles.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeResourceSets(this.geometries, this.materials);
    this.root.clear();
  }

}

function createPuddleShape(): Shape {
  const first = SHIP_PUDDLE_OUTLINE[0]!;
  const last = SHIP_PUDDLE_OUTLINE[SHIP_PUDDLE_OUTLINE.length - 1]!;
  const shape = new Shape();
  shape.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
  SHIP_PUDDLE_OUTLINE.forEach((point, index) => {
    const next = SHIP_PUDDLE_OUTLINE[(index + 1) % SHIP_PUDDLE_OUTLINE.length]!;
    shape.quadraticCurveTo(
      point[0],
      point[1],
      (point[0] + next[0]) / 2,
      (point[1] + next[1]) / 2,
    );
  });
  shape.closePath();
  return shape;
}

function createPuddleGeometry(outline: readonly { x: number; y: number }[], id: string): BufferGeometry {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
  seed = (seed ^ (seed >>> 16)) >>> 0;
  const radii = Array.from({ length: 8 }, (_, index) => 0.46 + ((seed >>> (index * 4)) & 15) / 30);
  // Shrink toward the center so each silhouette stays inside its validated footprint.
  const boundary = outline.map(({ x, y }) => {
    const sector = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2) * radii.length;
    const index = Math.floor(sector);
    const blend = (1 - Math.cos((sector - index) * Math.PI)) / 2;
    const start = radii[index % radii.length]!;
    const scale = start + (radii[(index + 1) % radii.length]! - start) * blend;
    return [x * scale, y * scale] as const;
  });
  const positions = [0, 0, 0];
  const colors = [1, 1, 1, 1];
  const indices: number[] = [];
  const count = boundary.length;
  for (const [ring, fraction] of [0.45, 0.93, 1].entries()) {
    boundary.forEach(([x, y], index) => {
      positions.push(x * fraction, y * fraction, 0);
      const alpha = ring === 2 ? 0 : 1;
      colors.push(1, 1, 1, alpha);
      const current = 1 + ring * count + index;
      const next = 1 + ring * count + (index + 1) % count;
      if (ring === 0) indices.push(0, current, next);
      else indices.push(current - count, current, next, current - count, next, next - count);
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

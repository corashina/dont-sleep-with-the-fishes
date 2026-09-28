import {
  Color, ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, MeshStandardMaterial,
  Object3D, Shape, Vector3,
} from 'three';
import { CannonImpactParticles, impactSeed } from './CannonImpactParticles';
import { smoothstep } from './animationMath';

const VARIANTS = 6;
const PER_VARIANT = 8;
const WATER_Y = -0.06;

function brokenTimber(variant: number): ExtrudeGeometry {
  const width = 0.035 + impactSeed(variant, 41) * 0.065;
  const length = 0.22 + impactSeed(variant, 42) * 0.28;
  const shape = new Shape();
  shape.moveTo(-width * 0.5, -length * 0.48);
  shape.lineTo(-width * 0.24, -length * 0.34);
  shape.lineTo(width * 0.06, -length * 0.56);
  shape.lineTo(width * 0.5, -length * 0.43);
  shape.lineTo(width * 0.43, length * 0.27);
  shape.lineTo(width * 0.18, length * 0.52);
  shape.lineTo(width * 0.04, length * 0.29);
  shape.lineTo(-width * 0.18, length * 0.59);
  shape.lineTo(-width * 0.47, length * 0.32);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.012 + impactSeed(variant, 43) * 0.016, steps: 1,
    bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors: number[] = [];
  const weathered = new Color(0x66503b);
  const fresh = new Color(0xb9915b);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const z = positions.getZ(index);
    const torn = smoothstep((Math.abs(z) / length - 0.23) / 0.22);
    color.copy(weathered).lerp(fresh, torn * 0.85);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

interface Fragment {
  readonly velocity: Vector3;
  readonly spin: Vector3;
  readonly offset: Vector3;
  readonly scale: number;
  readonly drag: number;
}

/** Broken planks, chips, and fine dust share one authored impact origin. */
export class CannonWoodImpact {
  readonly root = new Group();
  private readonly batches: InstancedMesh[] = [];
  private readonly fragments: Fragment[] = [];
  private readonly transform = new Object3D();
  private readonly dust = new CannonImpactParticles('dust', 24);
  private readonly material = new MeshStandardMaterial({
    name: 'ghost-ship-broken-timber', vertexColors: true, roughness: 0.94, metalness: 0,
  });

  constructor() {
    this.root.name = 'ghost-ship-wood-impact';
    // Grain follows each shard, including when instanced timber tumbles.
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 vTimberPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTimberPosition = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        '#include <common>\nvarying vec3 vTimberPosition;')
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          float grainPhase = vTimberPosition.x * 950.0 + sin(vTimberPosition.z * 21.0) * 1.6;
          float grain = sin(grainPhase) * (1.0 - smoothstep(0.5, 3.0, fwidth(grainPhase)));
          diffuseColor.rgb *= 0.91 + grain * 0.09;
        `);
    };
    for (let variant = 0; variant < VARIANTS; variant += 1) {
      const batch = new InstancedMesh(brokenTimber(variant), this.material, PER_VARIANT);
      batch.name = 'ghost-ship-hull-splinter';
      batch.frustumCulled = false;
      this.batches.push(batch);
      this.root.add(batch);
    }
    for (let index = 0; index < VARIANTS * PER_VARIANT; index += 1) {
      const chip = index % 3 !== 0;
      this.fragments.push({
        velocity: new Vector3(), spin: new Vector3(
          (impactSeed(index, 32) - 0.5) * 18,
          (impactSeed(index, 33) - 0.5) * 14,
          (impactSeed(index, 34) - 0.5) * 18,
        ),
        offset: new Vector3(),
        scale: chip ? 0.18 + impactSeed(index, 35) * 0.38 : 0.8 + impactSeed(index, 35) * 0.7,
        drag: chip ? 1.1 : 0.25,
      });
    }
    this.root.add(this.dust.mesh);
    this.reset();
  }

  place(impact: Vector3, toShip: Vector3, lateral: Vector3): void {
    this.root.position.copy(impact);
    for (let index = 0; index < this.fragments.length; index += 1) {
      const fragment = this.fragments[index]!;
      fragment.offset.copy(lateral).multiplyScalar((impactSeed(index, 36) - 0.5) * 0.18);
      fragment.offset.y = (impactSeed(index, 37) - 0.5) * 0.08;
      fragment.velocity.set(0, 2 + impactSeed(index, 38) * 4.2, 0)
        .addScaledVector(toShip, -(0.6 + impactSeed(index, 39) * 2.4))
        .addScaledVector(lateral, (impactSeed(index, 40) - 0.5) * 4.2);
    }
  }

  sample(age: number): void {
    this.root.visible = age >= 0 && age < 2.5;
    if (!this.root.visible) return;
    this.dust.sample(age);
    for (let variant = 0; variant < this.batches.length; variant += 1) {
      const batch = this.batches[variant]!;
      for (let index = 0; index < PER_VARIANT; index += 1) {
        const fragment = this.fragments[variant * PER_VARIANT + index]!;
        const travel = (1 - Math.exp(-fragment.drag * age)) / fragment.drag;
        this.transform.position.copy(fragment.offset).addScaledVector(fragment.velocity, travel);
        this.transform.position.y -= 4.9 * age * age;
        const aboveWater = this.transform.position.y + this.root.position.y > WATER_Y;
        // Shrink only during the final water entry, not while fragments are airborne.
        const entry = smoothstep((this.transform.position.y + this.root.position.y - WATER_Y) / 0.12);
        this.transform.scale.setScalar(aboveWater ? fragment.scale * entry : 0);
        this.transform.rotation.set(fragment.spin.x * travel, fragment.spin.y * travel, fragment.spin.z * travel);
        this.transform.updateMatrix();
        batch.setMatrixAt(index, this.transform.matrix);
      }
      batch.instanceMatrix.needsUpdate = true;
    }
  }

  reset(): void { this.root.visible = false; }

  dispose(): void {
    this.root.removeFromParent();
    this.dust.dispose();
    for (const batch of this.batches) {
      batch.dispose();
      batch.geometry.dispose();
    }
    this.material.dispose();
  }
}

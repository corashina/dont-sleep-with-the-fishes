import {
  DoubleSide, Group, Material, Mesh, MeshStandardMaterial, ShaderChunk,
} from 'three';

/** Owns spectral materials. The presentation owns and disposes their scene resources. */
export class GhostShipAppearance {
  private readonly surfaces: MeshStandardMaterial[] = [];

  constructor(model: Group) {
    const replaced = new Set<Material>();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of source) replaced.add(material);
      const sail = /sail/i.test(object.name);
      const surfaces = source.map((material) => this.surface(material, sail));
      object.material = Array.isArray(object.material) ? surfaces : surfaces[0]!;
      object.castShadow = false;
      object.receiveShadow = false;
    });
    for (const material of replaced) material.dispose();
  }

  setStrength(value: number): void {
    for (const material of this.surfaces) material.opacity = Math.min(1, value * 0.82);
  }

  private surface(source: Material, sail: boolean): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      name: `ghost-ship-${source.name}`,
      color: sail ? 0x83c99b : 0x185239,
      emissive: sail ? 0x54ff94 : 0x16c765,
      emissiveIntensity: sail ? 0.7 : 0.4,
      roughness: 0.9, metalness: 0,
      transparent: true, opacity: 0, depthWrite: false, side: DoubleSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        varying vec3 ghostNormal; varying vec3 ghostView;
        ${shader.vertexShader}`.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          ghostNormal = normalize(normalMatrix * normal);
          ghostView = -(modelViewMatrix * vec4(transformed, 1.0)).xyz;
        `);
      shader.fragmentShader = `
        varying vec3 ghostNormal; varying vec3 ghostView;
        ${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float rim = pow(1.0 - abs(dot(normalize(ghostNormal), normalize(ghostView))), 2.0);
          totalEmissiveRadiance += vec3(0.35, 1.0, 0.52) * rim;
          diffuseColor.a *= 0.78 + 0.22 * rim;
        `).replace('#include <fog_fragment>', ShaderChunk.fog_fragment.replaceAll('fogDensity', '(fogDensity * 0.35)'));
    };
    material.customProgramCacheKey = () => `ghost-ship-spectral-${sail}`;
    this.surfaces.push(material);
    return material;
  }
}

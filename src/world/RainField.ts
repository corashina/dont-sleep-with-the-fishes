import {
  Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3,
} from 'three';

const VERTEX_SHADER = `
  attribute vec4 drop;
  uniform float time;
  uniform vec3 volume;
  uniform float gust;
  varying vec2 vRainUv;
  varying float vRainAlpha;

  void main() {
    float speed = 9.0 + drop.w * 5.0;
    float fall = fract(drop.z + time * speed / volume.y);
    vec3 center = vec3(
      (fract(drop.x + fall * 0.16 * gust) - 0.5) * volume.x,
      volume.y * (1.0 - fall) - 1.8,
      (fract(drop.y - fall * 0.035 * gust) - 0.5) * volume.z
    );
    vec4 viewCenter = modelViewMatrix * vec4(center, 1.0);
    vec3 velocity = vec3(volume.x * 0.16 * gust, -volume.y, -volume.z * 0.035 * gust);
    vec2 projectedFall = (modelViewMatrix * vec4(velocity, 0.0)).xy;
    vec2 along = normalize(projectedFall + vec2(0.0001));
    vec2 across = vec2(-along.y, along.x);
    // Real quads keep their width through post-processing and on small viewports.
    float width = max(0.012 + drop.w * 0.008, -viewCenter.z * 0.0022);
    float streakLength = min(0.28 + drop.w * 0.38, max(0.08, -viewCenter.z * 0.085));
    viewCenter.xy += across * position.x * width + along * position.y * streakLength;
    gl_Position = projectionMatrix * viewCenter;
    vRainUv = uv;
    vRainAlpha = smoothstep(0.0, 0.07, fall) * (1.0 - smoothstep(0.94, 1.0, fall));
    vRainAlpha *= smoothstep(0.55, 1.6, -viewCenter.z) * mix(0.5, 0.9, drop.w);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 rainColor;
  uniform float intensity;
  uniform float lightningGlow;
  varying vec2 vRainUv;
  varying float vRainAlpha;

  void main() {
    float edge = abs(vRainUv.x * 2.0 - 1.0);
    float filament = 1.0 - smoothstep(0.2, 1.0, edge);
    float tail = smoothstep(0.0, 0.25, vRainUv.y) * (1.0 - smoothstep(0.85, 1.0, vRainUv.y));
    float alpha = filament * tail * vRainAlpha * intensity;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(rainColor + lightningGlow * vec3(0.52, 0.6, 0.7), alpha);
  }
`;

/** Static instance data; all falling motion runs on the GPU. */
export class RainField extends Mesh<InstancedBufferGeometry, ShaderMaterial> {
  constructor(name: string, count: number, volume: Vector3, random: () => number) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([
      -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
    ], 3));
    geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    const drops = new Float32Array(count * 4);
    for (let index = 0; index < drops.length; index += 1) drops[index] = random();
    geometry.setAttribute('drop', new InstancedBufferAttribute(drops, 4));
    geometry.instanceCount = count;
    super(geometry, new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        time: { value: 0 }, volume: { value: volume }, gust: { value: 1 },
        rainColor: { value: new Color(0xc1d5df) }, intensity: { value: 0 },
        lightningGlow: { value: 0 },
      },
      transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
    }));
    this.name = name;
    this.frustumCulled = false;
    this.visible = false;
  }

  setIntensity(intensity: number): void {
    this.material.uniforms.intensity!.value = intensity;
    this.visible = intensity > 0;
  }

  update(time: number, gust: number): void {
    this.material.uniforms.time!.value = time;
    this.material.uniforms.gust!.value = gust;
  }

  dispose(): void {
    this.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

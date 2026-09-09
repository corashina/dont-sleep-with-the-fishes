import {
  AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  type Object3D, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';

const TURN_SECONDS = 8;
const BEAM_LENGTH = 150;

/** Distant rotating light. The presentation owns and disposes its mesh resources. */
export class LighthouseLight extends Group {
  private readonly rotor = new Group();
  private readonly beaconMaterial = new MeshBasicMaterial({
    color: 0xffeac4, fog: false, toneMapped: false,
  });
  private readonly haloMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    uniforms: { strength: { value: 0.5 } },
    vertexShader: `varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Put the optical glow in front of the model's opaque lantern glass.
        center.xyz -= normalize(center.xyz) * 2.5;
        vec2 size = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        center.xy += position.xy * size;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `varying vec2 vUv;
      uniform float strength;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radiusSquared = dot(p, p);
        float halo = exp(-radiusSquared * 6.0) * 0.35;
        float core = exp(-radiusSquared * 85.0);
        float edge = 1.0 - smoothstep(0.65, 1.0, radiusSquared);
        gl_FragColor = vec4(1.0, 0.91, 0.72, (halo + core) * edge * strength);
      }`,
  });
  private readonly halo = new Mesh(new PlaneGeometry(1, 1), this.haloMaterial);
  private readonly towardCamera = new Vector3();
  private readonly worldPosition = new Vector3();
  private readonly direction = new Vector3();
  private elapsed = 0;

  constructor() {
    super();
    this.rotor.name = 'lighthouse-rotating-beam';
    const geometry = new CylinderGeometry(0.22, 6, BEAM_LENGTH, 48, 1, true);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, BEAM_LENGTH / 2);
    const beam = new Mesh(geometry, new ShaderMaterial({
      transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true,
      blending: AdditiveBlending, toneMapped: false,
      vertexShader: `varying float vDistance;
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;
        void main() {
          vDistance = uv.y;
          vViewNormal = normalMatrix * normal;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `varying float vDistance;
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;
        void main() {
          // Fade the silhouette, where the view grazes the cone surface.
          float facing = abs(dot(normalize(vViewNormal), normalize(vViewPosition)));
          float softEdge = pow(smoothstep(0.0, 0.85, facing), 2.0);
          float distanceFade = pow(vDistance, 1.7) * smoothstep(0.0, 0.3, vDistance);
          gl_FragColor = vec4(1.0, 0.94, 0.8, 0.13 * softEdge * distanceFade);
        }`,
    }));
    beam.name = 'lighthouse-beam';
    this.rotor.add(beam);
    const beacon = new Mesh(new SphereGeometry(0.32, 12, 8), this.beaconMaterial);
    beacon.name = 'lighthouse-beacon';
    this.halo.name = 'lighthouse-halo';
    // The vertex shader faces the camera; disable bounds based on the unturned plane.
    this.halo.frustumCulled = false;
    this.add(this.rotor, beacon, this.halo);
  }

  reset(): void {
    this.elapsed = 0;
    this.rotor.rotation.y = 0;
  }

  update(delta: number, camera: Object3D): void {
    this.elapsed = (this.elapsed + delta) % TURN_SECONDS;
    this.rotor.rotation.y = this.elapsed * Math.PI * 2 / TURN_SECONDS;
    camera.getWorldPosition(this.towardCamera);
    this.getWorldPosition(this.worldPosition);
    this.towardCamera.sub(this.worldPosition).normalize();
    this.rotor.getWorldDirection(this.direction);
    const alignment = Math.max(0, this.direction.dot(this.towardCamera));
    const flash = Math.pow(alignment, 100);
    const brightness = 1.5 + flash * 6;
    this.beaconMaterial.color.setRGB(brightness, brightness * 0.92, brightness * 0.76);
    this.haloMaterial.uniforms.strength!.value = 0.5 + flash * 1.7;
    this.halo.scale.setScalar(7 + flash * 6);
  }
}

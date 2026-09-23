// Importance: 95/100. Run the production reflection GLSL on the GPU.
import {
  Color, FloatType, Mesh, Object3D, OrthographicCamera, PerspectiveCamera,
  PlaneGeometry, Scene, ShaderMaterial, Texture, Vector2, Vector3, WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { Skybox } from '../../src/world/Skybox';
import { OceanCapture } from '../../src/ocean/OceanCapture';
import { OCEAN_REFLECTION_FUNCTIONS } from '../../src/ocean/oceanOptics';

export function checkReflections(renderer: WebGLRenderer): string {
  const capture = new OceanCapture();
  const target = new WebGLRenderTarget(1, 1, { type: FloatType, depthBuffer: false });
  const scene = new Scene();
  const skyColor = new Color().setRGB(0.2, 0.7, 0.4);
  scene.background = skyColor;
  const water = new Object3D();
  const camera = new PerspectiveCamera(48, 16 / 9, 0.1, 1600);
  const position = new Vector3(2, 0, -3);
  const normal = new Vector3(0.2, Math.sqrt(0.95), 0.1);
  const material = new ShaderMaterial({
    uniforms: {
      uWaterReflectionMatrix: { value: capture.reflectionMatrix },
      uWaterReflection: { value: capture.reflectionTexture },
      testPosition: { value: position }, testNormal: { value: normal },
      testSky: { value: false }, testUv: { value: new Vector2(0.5, 0.5) },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform mat4 uWaterReflectionMatrix;
      uniform sampler2D uWaterReflection;
      uniform vec3 testPosition;
      uniform vec3 testNormal;
      uniform bool testSky;
      uniform vec2 testUv;
      ${OCEAN_REFLECTION_FUNCTIONS}
      void main() {
        vec3 projected = projectWaterReflection(testPosition, testNormal);
        gl_FragColor = testSky ? vec4(sampleWaterReflection(testUv), 1.0)
          : vec4(projected.xy, 0.0, 1.0);
      }
    `,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  const quad = new Mesh(geometry, material);
  const testScene = new Scene();
  testScene.add(quad);
  const testCamera = new OrthographicCamera();
  const pixels = new Float32Array(4);
  const originalTarget = renderer.getRenderTarget();
  const results: string[] = [];
  const read = (): number[] => {
    renderer.setRenderTarget(target);
    renderer.render(testScene, testCamera);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
    renderer.setRenderTarget(originalTarget);
    return Array.from(pixels.slice(0, 3));
  };
  const check = (name: string, actual: number[], expected: number[]): void => {
    const error = Math.max(...actual.map((value, i) => Math.abs(value - expected[i]!)));
    results.push(`${error < 0.001 ? 'PASS' : 'FAIL'} ${name} (error ${error.toFixed(6)})`);
  };
  try {
    let reference: number[] = [];
    for (const degrees of [0, 90, 180, 270]) {
      const angle = degrees * Math.PI / 180;
      const axis = new Vector3(0, 1, 0);
      camera.position.set(0, 6, 14).applyAxisAngle(axis, angle);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      position.set(2, 0, -3).applyAxisAngle(axis, angle);
      normal.set(0.2, Math.sqrt(0.95), 0.1).applyAxisAngle(axis, angle);
      capture.update(renderer, scene, camera, water);
      const actual = read();
      if (degrees === 0) reference = actual;
      else check(`Rotation ${degrees} degrees`, actual, reference);
    }
    normal.set(0, 1, 0);
    const flat = position.clone().applyMatrix4(capture.reflectionMatrix);
    check('Flat surface alignment', read(), [flat.x, flat.y, 0]);
    material.uniforms.testSky!.value = true;
    check('Sky color without depth', read(), skyColor.toArray());
    // Importance: 95/100. The mirror clip plane must not cut a band out of the sky.
    const moon = new Texture();
    const sky = new Skybox(scene, { phase: 'day', weather: 'calm', severity: 0 }, moon);
    scene.background = new Color(0);
    try {
      camera.position.set(0, 6, 14);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      capture.update(renderer, scene, camera, water);
      const horizon = new Vector3(0, 4, -986).applyMatrix4(capture.reflectionMatrix);
      material.uniforms.testUv!.value.set(horizon.x, horizon.y);
      const color = read();
      const brightness = Math.max(...color);
      results.push(`${brightness > 0.05 ? 'PASS' : 'FAIL'} Sky near horizon (brightness ${brightness.toFixed(6)})`);
    } finally { sky.dispose(); moon.dispose(); }
    return results.join('\n');
  } finally {
    renderer.setRenderTarget(originalTarget);
    capture.dispose(); target.dispose(); material.dispose(); geometry.dispose();
  }
}

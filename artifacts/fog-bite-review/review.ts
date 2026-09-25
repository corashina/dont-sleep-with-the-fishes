import { createLifeboat } from '../../src/world/Lifeboat';
import { LifeboatAssets } from '../../src/world/LifeboatAssets';
import { Box3, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Texture, WebGLRenderer } from 'three';
import { EventModelLibrary } from '../../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../../src/survival/WeatherEventAnimator';
import { Skybox } from '../../src/world/Skybox';
import { applySeaFogMaterial } from '../../src/world/SeaFogMaterial';

try {
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(640, 400);
  document.body.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color(0x273c45);
  const camera = new PerspectiveCamera(80, 1.6, 0.1, 150);
  camera.position.set(0, 1.38, -1.42);
  const sky = new Skybox(scene, { phase: 'night', weather: 'fog', severity: 0 }, new Texture());
  const oceanMaterial = new MeshStandardMaterial({ color: 0x203841, roughness: 0.75 });
  applySeaFogMaterial(oceanMaterial);
  const sea = new Mesh(new PlaneGeometry(200, 200), oceanMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.08;
  scene.add(sea, new HemisphereLight(0xadc7e2, 0x1d242a, 1.1));
  const light = new DirectionalLight(0xbad5f1, 2);
  light.position.set(-4, 8, 4);
  scene.add(light);
  const models = await EventModelLibrary.load(['fogMonster']);
  const boatAssets = await LifeboatAssets.load();
  const boat = createLifeboat(boatAssets).root; scene.add(boat);
  const animator = new WeatherEventAnimator(new Group(), {
    clearEventPose() {}, resetEventPoseForFrame() {},
  } as never, models, camera, 'monster-in-the-fog', undefined, () => {}, boat);
  scene.add(animator.worldRoot);
  const frames = [0, 1, 2.5, 3.5, 3.99, 4];
  const sheet = document.createElement('canvas');
  sheet.width = 1920;
  sheet.height = 856;
  const context = sheet.getContext('2d')!;
  const rows = [];
  for (let index = 0; index < frames.length; index++) {
    const time = frames[index]!;
    animator.stage('monster-in-the-fog', 19);
    void animator.react('monster-in-the-fog', {
      accepted: true, code: 'review', message: '', deltas: { hull: -20 }, cue: 'impact',
    }, { choiceId: 'flashlight', actors: [] });
    animator.update(time, time);
    sky.update(time, { phase: 'night', weather: 'fog', severity: 0 }, camera.position);
    renderer.render(scene, camera);
    const x = index % 3 * 640;
    const y = Math.floor(index / 3) * 428;
    context.drawImage(renderer.domElement, x, y + 28);
    context.fillStyle = '#111d25'; context.fillRect(x, y, 640, 28);
    context.fillStyle = '#e9e2d2'; context.font = '17px sans-serif';
    context.fillText(`${time.toFixed(2)} s`, x + 15, y + 20);
    const monster = animator.worldRoot.getObjectByName('fog-monster')!;
    const bounds = new Box3().setFromObject(monster, true);
    rows.push({ time, position: monster.position.toArray(), nearestDistance: camera.position.z - bounds.max.z, camera: camera.quaternion.toArray() });
  }
  renderer.domElement.remove();
  sheet.style.width = '100%'; document.body.append(sheet);
  const report = document.createElement('pre'); report.textContent = JSON.stringify(rows,null,2); document.body.append(report);
  animator.dispose(); models.dispose(); sky.dispose(); renderer.dispose();
} catch (error) {
  document.body.textContent = String(error);
}

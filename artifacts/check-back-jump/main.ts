import { AmbientLight, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CheckBackPresentation } from '../../src/survival/CheckBackPresentation';
import { SurvivalEventModelLibrary } from '../../src/survival/SurvivalEventModelLibrary';

async function main() {
  const scene = new Scene();
  scene.background = new Color(0x142b34);
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(535, 575);
  const camera = new PerspectiveCamera(80, 535 / 575, 0.1, 500);
  camera.position.set(0, 0.88, 0.96);
  scene.add(camera, new AmbientLight(0xa6c2d0, 1.2));
  const light = new DirectionalLight(0xffdfb2, 2);
  light.position.set(-2, 4, -2);
  scene.add(light);
  const bench = new Group();
  bench.position.set(0, 0.22, 0.88);
  bench.rotation.y = Math.PI;
  scene.add(bench);
  const wood = new MeshStandardMaterial({ color: 0x675144, roughness: 0.9 });
  const seat = new Mesh(new BoxGeometry(1.9, 0.08, 0.52), wood);
  seat.position.set(0, 0.18, 0.88);
  scene.add(seat);
  const floor = new Mesh(new BoxGeometry(2.3, 0.08, 4.5), wood);
  floor.position.y = -0.2;
  scene.add(floor);
  const models = await SurvivalEventModelLibrary.load(['checkBackAnglerfish']);
  const presentation = new CheckBackPresentation(new Group(), models.clone('checkBackAnglerfish'), camera, bench, bench, () => {});
  scene.add(presentation.root);
  presentation.stage();
  void presentation.react('check-the-back.bad');
  const sheet = document.createElement('canvas');
  sheet.width = 535 * 4;
  sheet.height = 615 * 2;
  const ctx = sheet.getContext('2d')!;
  let previous = 0;
  const times = [0.74, 0.75, 1.8, 3.84, 4.0, 4.15, 4.28, 4.5];
  for (const [index, time] of times.entries()) {
    presentation.update(time, time - previous);
    previous = time;
    renderer.render(scene, camera);
    const x = index % 4 * 535, y = Math.floor(index / 4) * 615;
    ctx.drawImage(renderer.domElement, x, y);
    ctx.fillStyle = '#101b21'; ctx.fillRect(x, y + 575, 535, 40);
    ctx.fillStyle = '#ffffff'; ctx.font = '22px sans-serif';
    ctx.fillText(`${time.toFixed(2)} seconds`, x + 16, y + 603);
  }
  await fetch('/__check-back-preview', { method: 'POST', body: await new Promise<Blob>((resolve) => sheet.toBlob(blob => resolve(blob!))) });
  const audio = new AudioContext();
  const clip = await audio.decodeAudioData(await (await fetch(new URL('../../src/assets/audio/checkBackAnglerfish.mp3', import.meta.url))).arrayBuffer());
  await fetch('/__check-back-complete', { method: 'POST', body: JSON.stringify({ audioDuration: clip.duration, rms: Array.from({ length: Math.ceil(clip.duration * 10) }, (_, index) => { const samples = clip.getChannelData(0).subarray(index * clip.sampleRate / 10, (index + 1) * clip.sampleRate / 10); return Math.round(Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 1000) / 1000; }) }) });
  await audio.close();
}
main().catch(error => fetch('/__check-back-failed', { method: 'POST', body: String(error.stack || error) }));




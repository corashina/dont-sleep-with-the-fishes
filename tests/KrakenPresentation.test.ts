// Importance: 97/100. Protects physical handover, ending completion, and borrowed scene ownership.
import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { BoatHeartDisplay } from '../src/survival/BoatHeartDisplay';
import { COMPLETE_HEART, HEART_PIECE_IDS } from '../src/survival/heartOfTheSea';
import { KrakenPresentation } from '../src/survival/events/KrakenPresentation';
import { KRAKEN_RELEASE_SECONDS, KRAKEN_REVEAL_SECONDS } from '../src/survival/events/krakenChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';

function setup() {
  const geometry = new BoxGeometry(0.2, 0.18, 0.12);
  const material = new MeshStandardMaterial();
  const display = new BoatHeartDisplay({ clone: () => new Group().add(new Mesh(geometry, material)) });
  display.sync({ heartPieces: COMPLETE_HEART, ending: null });
  const boat = new Group();
  boat.position.set(0.2, 0.1, -0.1);
  boat.rotation.z = 0.035;
  boat.add(display.root);
  const scene = new KrakenPresentation({
    heartDisplay: display,
    sampleWorldWaveInto: (wave) => { wave.height = 0; }, readWorldWaveAmplitudeScale: () => 1,
  });
  scene.stage({ eventId: 'kraken', targetInstanceId: null, variantSeed: 7 });
  const dispose = () => { scene.dispose(); display.dispose(); geometry.dispose(); material.dispose(); };
  return { scene, display, boat, dispose };
}
const returned = { outcome: { accepted: true, eventResult: { resultId: 'heart-returned' } } } as EventOutcomePresentation;

it('finishes only after the nine-second reveal and full eleven-second collection and descent', async () => {
  const { scene, display, dispose } = setup();
  const revealDone = vi.fn();
  const reveal = scene.reveal().then(revealDone);
  scene.update(8, KRAKEN_REVEAL_SECONDS - 1); await Promise.resolve();
  expect(revealDone).not.toHaveBeenCalled();
  scene.update(9, 1); await reveal;
  const releaseDone = vi.fn();
  const release = scene.react(returned).then(releaseDone);
  scene.update(19, KRAKEN_RELEASE_SECONDS - 1); await Promise.resolve();
  expect(releaseDone).not.toHaveBeenCalled();
  scene.update(20, 1); await release;
  expect(scene.worldRoot.getObjectByName('kraken-body')?.visible).toBe(false);
  expect(display.root.visible).toBe(false);
  expect(display.tooltip).toBe('?');
  dispose();
});

it('takes the whole basket at contact and carries all pieces together through descent', async () => {
  const { scene, display, boat, dispose } = setup();
  const reveal = scene.reveal();
  scene.settleForVisibilityChange(); await reveal;
  const release = scene.react(returned);
  scene.update(0, 2.4);
  expect(display.tooltip).toBe('Brain, Heart, Kidneys');
  expect(display.root.parent).toBe(boat);
  const restPositions = HEART_PIECE_IDS.map(id => display.piece(id).position.clone());
  boat.position.x += 0.15;
  const before = display.root.getWorldPosition(new Vector3());
  scene.update(0, 0.1);
  expect(display.root.parent?.name).toBe('kraken-grip');
  expect(display.root.getWorldPosition(new Vector3()).distanceTo(before)).toBeLessThan(1e-6);
  expect(display.root.getObjectByName('heart-basket')?.parent).toBe(display.root);
  scene.update(0, 0.5);
  expect(display.root.getWorldPosition(new Vector3()).y).toBeGreaterThan(before.y);
  scene.update(0, 2);
  const carriedHeight = display.root.getWorldPosition(new Vector3()).y;
  scene.update(0, 3);
  expect(display.root.getWorldPosition(new Vector3()).y).toBeLessThan(carriedHeight);
  HEART_PIECE_IDS.forEach((id, index) => {
    expect(display.piece(id).parent).toBe(display.root);
    expect(display.piece(id).position).toEqual(restPositions[index]);
    expect(display.piece(id).visible).toBe(true);
  });
  scene.settleForVisibilityChange(); await release;
  expect(display.root.parent).toBe(boat);
  expect(display.root.visible).toBe(false);
  for (const id of HEART_PIECE_IDS) {
    expect(display.piece(id).parent).toBe(display.root);
    expect(display.piece(id).visible).toBe(false);
  }
  dispose();
});

it('restores untouched pieces when the reveal is cancelled', async () => {
  const { scene, display, boat, dispose } = setup();
  const reveal = scene.reveal();
  scene.update(2, 2);
  scene.clear(); await reveal;
  expect(display.root.parent).toBe(boat);
  expect(display.root.visible).toBe(true);
  expect(display.tooltip).toBe('Brain, Heart, Kidneys');
  dispose();
});

it.each(['settle', 'clear', 'dispose'] as const)('releases models and resolves the handover on %s', async (action) => {
  const { scene, display, dispose } = setup();
  const reveal = scene.reveal();
  scene.settleForVisibilityChange(); await reveal;
  const release = scene.react(returned);
  scene.update(0, 2.6);
  if (action === 'settle') scene.settleForVisibilityChange();
  else scene[action]();
  await release;
  expect(display.root.visible).toBe(false);
  for (const id of HEART_PIECE_IDS) expect(display.piece(id).parent).toBe(display.root);
  expect(display.tooltip).toBe('?');
  dispose();
});

it('reuses tentacle buffers and disposes owned geometry once', async () => {
  const { scene, dispose } = setup();
  const mantle = scene.worldRoot.getObjectByName('kraken-mantle') as Mesh;
  const arm = scene.worldRoot.getObjectByName('kraken-arm-0')!.children[0] as Mesh;
  const positions = arm.geometry.getAttribute('position').array;
  const before = positions.slice();
  const geometryDispose = vi.spyOn(mantle.geometry, 'dispose');
  const reveal = scene.reveal();
  scene.update(2, 2);
  expect(arm.geometry.getAttribute('position').array).toBe(positions);
  expect(positions).not.toEqual(before);
  scene.dispose(); scene.dispose(); await reveal;
  expect(geometryDispose).toHaveBeenCalledTimes(1);
  dispose();
});


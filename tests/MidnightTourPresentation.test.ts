import { AnimationClip,Group,NumberKeyframeTrack,PerspectiveCamera,PointLight } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';
import { MONSTER_IMPACT_SECONDS,MONSTER_RESULT_DURATION_SECONDS,MONSTER_TURN_BACK_END_SECONDS } from '../src/survival/midnightTourChoreography';

function setup(animatedMonster = false) {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  const cameraRig = new Group();
  cameraRig.add(camera);
  camera.position.set(0, 0.88, 1.56);
  const propModels = createTestPropModels();
  if (animatedMonster) {
    const createEventModel = propModels.createEventModel.bind(propModels);
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => {
      const selected = createEventModel(id);
      if (id !== 'midnightMonster' || selected === null) return selected;
      const probe = new Group();
      probe.name = 'bite-probe';
      selected.root.add(probe);
      return {
        ...selected,
        animations: selected.animations.map((clip) => new AnimationClip(clip.name, clip.duration, [
          new NumberKeyframeTrack('bite-probe.position[z]', [0, clip.duration],
            clip.name.endsWith('|Idle_Attack') ? [0, 1] : [0, 0]),
        ])),
      };
    });
  }
  const emitCue = vi.fn();
  const presentation = new MidnightTourPresentation({
    camera, cameraRig, propModels, emitCue, waves: [],
  } as unknown as FocusedEventPresentationDependencies);
  presentation.stage();
  let time = 0;
  return {
    presentation, camera, cameraRig, emitCue,
    advance: (seconds: number) => {
      const delta = seconds - time;
      time = seconds;
      presentation.update(time, delta);
    },
    dispose: () => { presentation.dispose(); propModels.dispose(); },
  };
}

const outcome = { accepted: true } as ActionOutcome;

describe('Midnight Tour animation', () => {
  it.each(['tour-camp', 'tour-camp-backpack'])('holds the %s fire until return and restores the boat camera', async (resultId) => {
    const rig = setup();
    const boatPosition = rig.camera.position.clone();
    const boatQuaternion = rig.camera.quaternion.clone();
    await rig.presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
    const shorePosition = rig.camera.position.clone();
    const shoreQuaternion = rig.camera.quaternion.clone();
    const result = rig.presentation.react({ eventId: 'midnight-tour', choiceId: 'visit', resultId }, outcome);
    expect(rig.camera.position.equals(shorePosition)).toBe(true);
    expect(rig.camera.quaternion.angleTo(shoreQuaternion)).toBeLessThan(0.00001);
    const camp = rig.presentation.root.getObjectByName('midnight-tour-abandoned-camp')!;
    const flame = camp.getObjectByName('midnight-tour-camp-flame')!;
    const light = camp.getObjectByName('midnight-tour-camp-light') as PointLight;
    rig.advance(8);
    await result;
    expect(rig.presentation.root.userData.state).toBe('held-camp');
    const flameHeight = flame.scale.y;
    rig.presentation.settleForVisibilityChange();
    rig.advance(9);
    expect(flame.scale.y).not.toBe(flameHeight);
    expect(light.intensity).toBeGreaterThan(0);
    expect(rig.emitCue).not.toHaveBeenCalled();
    rig.presentation.clear();
    expect(rig.presentation.root.getObjectByName('midnight-tour-abandoned-camp')).toBeUndefined();
    expect(rig.camera.parent).toBe(rig.cameraRig);
    expect(rig.camera.position.equals(boatPosition)).toBe(true);
    expect(rig.camera.quaternion.angleTo(boatQuaternion)).toBeLessThan(0.00001);
    rig.dispose();
  });

  it('keeps arrival continuous and grows soil through three strokes before lowering the shovel', async () => {
    const rig = setup();
    const { presentation, camera } = rig;
    const boatPosition = camera.position.clone();
    const boatQuaternion = camera.quaternion.clone();
    await presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
    const shorePosition = camera.position.clone();
    const shoreQuaternion = camera.quaternion.clone();
    const result = presentation.react({ eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-chest' }, outcome);
    expect(camera.position.distanceTo(shorePosition)).toBeLessThan(0.00001);
    expect(camera.quaternion.angleTo(shoreQuaternion)).toBeLessThan(0.00001);
    const pile = presentation.root.getObjectByName('midnight-tour-dirt-pile')!;
    const chest = presentation.root.getObjectByName('midnight-tour-reward-chest')!;
    const initialChestHeight = chest.position.y;
    expect(pile.scale.y).toBe(0.25);
    rig.advance(5);
    expect(pile.scale.y).toBeCloseTo(0.5);
    expect(chest.position.y).toBeGreaterThan(initialChestHeight);
    rig.advance(9);
    expect(pile.scale.y).toBe(1);
    expect(presentation.root.userData.digContacts).toBe(3);
    const shovel = presentation.root.getObjectByName('midnight-tour-shovel-blade-pivot')!;
    expect(shovel).toBeDefined();
    const shovelHeight = shovel.position.y;
    rig.advance(9.3);
    expect(shovel.position.y).toBeLessThan(shovelHeight);
    rig.advance(9.7);
    expect(shovel.visible).toBe(false);
    rig.advance(12);
    await result;
    expect(rig.emitCue.mock.calls.filter(([cue]) => cue.cue === 'dig-start')).toHaveLength(1);
    presentation.clear();
    expect(camera.parent).toBe(rig.cameraRig);
    expect(camera.position.equals(boatPosition)).toBe(true);
    expect(camera.quaternion.angleTo(boatQuaternion)).toBeLessThan(0.00001);
    expect(presentation.root.getObjectByName('midnight-tour-dirt-pile')).toBeUndefined();
    rig.dispose();
  });

  it('turns toward the monster without a camera height jump and ends at impact', async () => {
    const rig = setup();
    await rig.presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
    const result = rig.presentation.react({ eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-attack' }, outcome);
    rig.advance(3.1999);
    const before = rig.camera.quaternion.clone();
    rig.advance(3.2001);
    expect(before.angleTo(rig.camera.quaternion)).toBeLessThan(0.001);
    rig.advance(MONSTER_TURN_BACK_END_SECONDS);
    const monster = rig.presentation.root.getObjectByName('midnight-tour-monster')!;
    const waitingPosition = monster.position.clone();
    expect(monster.position.x).toBeCloseTo(rig.camera.position.x);
    expect(monster.position.z - rig.camera.position.z).toBeGreaterThan(1);
    expect(monster.position.z - rig.camera.position.z).toBeLessThan(1.5);
    expect(rig.emitCue).not.toHaveBeenCalled();
    rig.advance(MONSTER_IMPACT_SECONDS);
    expect(monster.position.equals(waitingPosition)).toBe(true);
    expect(rig.emitCue.mock.calls.filter(([cue]) => cue.cue === 'attack')).toHaveLength(1);
    rig.advance(MONSTER_RESULT_DURATION_SECONDS);
    await result;
    expect(rig.presentation.root.userData.cameraKicks).toBe(1);
    expect(rig.emitCue.mock.calls.filter(([cue]) => cue.cue === 'attack')).toHaveLength(1);
    rig.presentation.clear();
    expect(rig.camera.parent).toBe(rig.cameraRig);
    rig.dispose();
  });

  it('keeps the bite pose and hit cue aligned when a frame skips the turn', async () => {
    const rigs = [setup(true), setup(true)];
    for (const rig of rigs) {
      await rig.presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
      void rig.presentation.react({ eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-attack' }, outcome);
    }
    for (let time = 1 / 60; time < MONSTER_IMPACT_SECONDS; time += 1 / 60) rigs[0]!.advance(time);
    rigs.forEach((rig) => rig.advance(MONSTER_IMPACT_SECONDS));
    const monsters = rigs.map((rig) => rig.presentation.root.getObjectByName('midnight-tour-monster')!);
    for (const monster of monsters) {
      expect(monster.getObjectByName('bite-probe')!.position.z).toBeCloseTo(0.45);
    }
    expect(monsters[0]!.position.distanceTo(monsters[1]!.position)).toBeLessThan(0.00001);
    expect(rigs[0]!.camera.quaternion.angleTo(rigs[1]!.camera.quaternion)).toBeLessThan(0.00001);
    rigs.forEach((rig) => {
      expect(rig.emitCue.mock.calls.filter(([cue]) => cue.cue === 'attack')).toHaveLength(1);
      rig.dispose();
    });
  });

  it('waits behind the player and snaps into the bite as soon as the turn ends', async () => {
    const rig = setup(true);
    try {
      await rig.presentation.playChoice({ choiceId: 'visit', instanceId: null, condition: null });
      void rig.presentation.react({ eventId: 'midnight-tour', choiceId: 'visit', resultId: 'tour-attack' }, outcome);
      const monster = rig.presentation.root.getObjectByName('midnight-tour-monster')!;
      const position = monster.position.clone();
      for (let time = 0; time < MONSTER_TURN_BACK_END_SECONDS; time += 0.1) {
        rig.advance(time);
        expect(monster.position.equals(position)).toBe(true);
        expect(monster.getObjectByName('bite-probe')!.position.z).toBe(0);
      }
      rig.advance(MONSTER_TURN_BACK_END_SECONDS + 0.05);
      expect(monster.getObjectByName('bite-probe')!.position.z).toBeGreaterThan(0.1);
      expect(rig.emitCue).not.toHaveBeenCalled();
      rig.advance(MONSTER_TURN_BACK_END_SECONDS + 0.18);
      expect(monster.getObjectByName('bite-probe')!.position.z).toBeCloseTo(0.45);
      expect(rig.emitCue).toHaveBeenCalledExactlyOnceWith({ eventId: 'midnight-tour', cue: 'attack' });
      rig.advance(MONSTER_RESULT_DURATION_SECONDS);
      expect(monster.position.equals(position)).toBe(true);
      expect(monster.getObjectByName('bite-probe')!.position.z).toBeCloseTo(0.45);
    } finally {
      rig.dispose();
    }
  });
});

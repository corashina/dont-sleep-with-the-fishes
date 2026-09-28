// Importance: 90/100. The ghosts must face the player, pass through the player, cue the sounds once, and leave.
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import type { EventPresentationCue } from '../src/survival/eventPresentationCue';
import {
  GHOST_BAIT_REACTION_DURATION,
  ghostBaitPassProgress,
} from '../src/survival/ghostBaitChoreography';

describe('Ghosts bait reaction', () => {
  it('turns every ghost to the player, rushes each one through the player, and clears them', async () => {
    const models = { create: () => {
      const root = new Group();
      root.add(new Mesh(new BoxGeometry(0.5, 1, 0.5), new MeshStandardMaterial()));
      return root;
    } } as unknown as EventModelLibrary;
    const supplies = {
      resetEventPoseForFrame: vi.fn(), clearEventPose: vi.fn(), pinEventActor: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.5, 0);
    const cues: EventPresentationCue[] = [];
    const animator = new SupernaturalEventAnimator(
      new Group(), supplies, models, camera, 'ghosts', cue => cues.push(cue),
    );
    animator.stage('ghosts', 17);
    animator.update(0, 2);
    const ghosts = Array.from({ length: 5 }, (_, index) => animator.worldRoot.getObjectByName('ghost-' + (index + 1))!);
    const player = new Vector3(0, 1.5, 0);
    const toPlayer = new Vector3();
    const forward = new Vector3();
    let previous = 0;
    const step = (progress: number) => {
      animator.update(0, (progress - previous) * GHOST_BAIT_REACTION_DURATION);
      previous = progress;
    };
    try {
      const reaction = animator.react(
        'ghosts',
        { accepted: true, code: 'event-resolved', message: '', deltas: { bait: -1 }, cue: 'none' },
        { choiceId: 'baitTin', actors: [] },
      );
      step(0.42);
      expect(cues).toEqual([{ eventId: 'ghosts', cue: 'turn' }]);
      for (const ghost of ghosts) {
        expect(ghost.visible).toBe(true);
        toPlayer.subVectors(player, ghost.position).setY(0).normalize();
        forward.set(-Math.sin(ghost.rotation.y), 0, -Math.cos(ghost.rotation.y));
        expect(forward.dot(toPlayer)).toBeGreaterThan(0.99);
      }
      for (let index = 0; index < ghosts.length; index += 1) {
        step(ghostBaitPassProgress(index));
        const ghost = ghosts[index]!;
        expect(ghost.visible).toBe(true);
        expect(Math.hypot(ghost.position.x - player.x, ghost.position.z - player.z)).toBeLessThan(0.5);
      }
      expect(cues).toEqual([{ eventId: 'ghosts', cue: 'turn' }, { eventId: 'ghosts', cue: 'rush' }]);
      step(1);
      await reaction;
      expect(ghosts.every(ghost => !ghost.visible)).toBe(true);
      animator.update(0, 1);
      expect(ghosts.every(ghost => !ghost.visible)).toBe(true);
      expect(cues).toHaveLength(2);
    } finally { animator.dispose(); }
  });
});

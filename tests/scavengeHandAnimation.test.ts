import { describe, expect, it } from 'vitest';
import {
  HAND_GESTURE_DURATIONS,
  createScavengeHandPose,
  sampleScavengeHandPoseInto,
} from '../src/player/scavengeHandAnimation';

describe('scavenge hand animation', () => {
  it('reuses the supplied pose object', () => {
    const pose = createScavengeHandPose();
    expect(sampleScavengeHandPoseInto(pose, {
      locomotion: 'idle',
      idleSeconds: 0,
      locomotionPhase: 0,
      gesture: null,
      gestureSeconds: 0,
    })).toBe(pose);
  });

  it('swings walk hands in opposite directions', () => {
    const pose = createScavengeHandPose();
    sampleScavengeHandPoseInto(pose, {
      locomotion: 'walk', idleSeconds: 0, locomotionPhase: 0.25,
      gesture: null, gestureSeconds: 0,
    });
    expect(pose.left.z).toBeLessThan(-0.64);
    expect(pose.right.z).toBeGreaterThan(-0.64);
  });

  it('moves sprint hands farther than walk hands', () => {
    const walk = createScavengeHandPose();
    const sprint = createScavengeHandPose();
    const frame = {
      idleSeconds: 0,
      locomotionPhase: 0.25,
      gesture: null,
      gestureSeconds: 0,
    } as const;
    sampleScavengeHandPoseInto(walk, { ...frame, locomotion: 'walk' });
    sampleScavengeHandPoseInto(sprint, { ...frame, locomotion: 'sprint' });
    expect(sprint.left.z).toBeLessThan(walk.left.z);
  });

  it('closes both hands at pickup contact', () => {
    const pose = createScavengeHandPose();
    sampleScavengeHandPoseInto(pose, {
      locomotion: 'idle', idleSeconds: 0, locomotionPhase: 0,
      gesture: 'pickup',
      gestureSeconds: HAND_GESTURE_DURATIONS.pickup * 0.58,
    });
    expect(pose.left.curl).toBeGreaterThan(0.75);
    expect(pose.right.curl).toBeGreaterThan(0.75);
    expect(pose.left.z).toBeLessThan(-0.85);
  });

  it('opens both hands at ground-drop release', () => {
    const pose = createScavengeHandPose();
    sampleScavengeHandPoseInto(pose, {
      locomotion: 'idle', idleSeconds: 0, locomotionPhase: 0,
      gesture: 'ground-drop',
      gestureSeconds: HAND_GESTURE_DURATIONS['ground-drop'] * 0.58,
    });
    expect(pose.left.curl).toBeLessThan(0.05);
    expect(pose.right.curl).toBeLessThan(0.05);
  });

  it('moves boat deposit lower than ground drop', () => {
    const drop = createScavengeHandPose();
    const deposit = createScavengeHandPose();
    sampleScavengeHandPoseInto(drop, {
      locomotion: 'idle', idleSeconds: 0, locomotionPhase: 0,
      gesture: 'ground-drop', gestureSeconds: 0.3,
    });
    sampleScavengeHandPoseInto(deposit, {
      locomotion: 'idle', idleSeconds: 0, locomotionPhase: 0,
      gesture: 'boat-deposit', gestureSeconds: 0.3,
    });
    expect(deposit.left.y).toBeLessThan(drop.left.y);
  });
});

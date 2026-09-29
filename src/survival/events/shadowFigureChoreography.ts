import { clamp01, pulse, smoothstep } from '../animationMath';
import {
  eventItemActionCueProgresses,
  eventItemUseDuration,
} from '../eventItemUseChoreography';

export type ShadowFigureWeapon = 'knife' | 'shotgun';
export type ShadowFigureReaction = 'scatter' | 'claw';

export const SHADOW_FIGURE_REACTION_DURATION = 1.35;

const KNIFE_DURATION = eventItemUseDuration('knife-stab');
const KNIFE_CONTACT = eventItemActionCueProgresses('knife-stab')[0]!;
const SHOTGUN_DURATION = eventItemUseDuration('shotgun-fire');
const SHOTGUN_FIRE = eventItemActionCueProgresses('shotgun-fire')[0]!;

/** Pose offsets for the false cat. Outward points away from the boat center. */
export interface ShadowFigureSample {
  outward: number;
  lift: number;
  lunge: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  opacity: number;
}

export function identityShadowFigureSample(): ShadowFigureSample {
  return {
    outward: 0,
    lift: 0,
    lunge: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    opacity: 1,
  };
}

export function resetShadowFigureSample(output: ShadowFigureSample): void {
  output.outward = 0;
  output.lift = 0;
  output.lunge = 0;
  output.pitch = 0;
  output.roll = 0;
  output.scaleX = 1;
  output.scaleY = 1;
  output.scaleZ = 1;
  output.opacity = 1;
}

export function isShadowFigureWeapon(choiceId: string): choiceId is ShadowFigureWeapon {
  return choiceId === 'knife' || choiceId === 'shotgun';
}

export function shadowFigureWeaponDuration(weapon: ShadowFigureWeapon): number {
  return weapon === 'knife' ? KNIFE_DURATION : SHOTGUN_DURATION;
}

function applyCrouch(output: ShadowFigureSample, crouch: number): void {
  output.lift -= 0.05 * crouch;
  output.pitch += 0.12 * crouch;
  output.scaleX *= 1 + 0.08 * crouch;
  output.scaleY *= 1 - 0.18 * crouch;
  output.scaleZ *= 1 + 0.1 * crouch;
}

/** Samples the false cat while the hand animation stabs or fires at it. */
export function sampleShadowFigureWeapon(
  weapon: ShadowFigureWeapon,
  progress: number,
  output: ShadowFigureSample,
): void {
  resetShadowFigureSample(output);
  const t = clamp01(progress);
  if (weapon === 'knife') {
    // The cat hisses as the blade rises, then the blade passes through smoke.
    applyCrouch(output, smoothstep((t - 0.28) / 0.3));
    const recoil = pulse(t, KNIFE_CONTACT - 0.04, KNIFE_CONTACT + 0.03, 0.96);
    const smear = pulse(t, KNIFE_CONTACT - 0.02, KNIFE_CONTACT + 0.02, KNIFE_CONTACT + 0.2);
    output.outward += 0.12 * recoil;
    output.roll += 0.32 * recoil;
    output.scaleX *= 1 + 0.22 * smear;
    output.opacity = 1 - 0.6 * smear;
    return;
  }
  applyCrouch(output, pulse(t, 0.12, 0.38, SHOTGUN_FIRE + 0.02));
  // Use seconds so the hit matches the brief discharge.
  const elapsed = (t - SHOTGUN_FIRE) * SHOTGUN_DURATION;
  const knock = elapsed >= 0 ? pulse(elapsed, 0, 0.05, 0.45) : 0;
  const tear = elapsed >= 0 ? smoothstep(elapsed / 0.3) : 0;
  const flicker = elapsed >= 0 ? pulse(elapsed, 0.02, 0.08, 0.24) : 0;
  output.outward += 0.3 * tear + 0.12 * knock;
  output.lift += 0.06 * knock;
  output.pitch -= 0.3 * tear + 0.12 * knock;
  output.roll += 0.2 * tear;
  output.scaleX *= 1 + 0.34 * tear;
  output.scaleY *= 1 - 0.22 * tear;
  output.scaleZ *= 1 + 0.18 * tear;
  output.opacity = (1 - 0.45 * tear) * (1 - 0.4 * flicker);
}

/** Samples the false cat after the weapon result. */
export function sampleShadowFigureReaction(
  weapon: ShadowFigureWeapon,
  reaction: ShadowFigureReaction,
  progress: number,
  output: ShadowFigureSample,
): void {
  sampleShadowFigureWeapon(weapon, 1, output);
  const t = clamp01(progress);
  if (reaction === 'claw') {
    const lunge = pulse(t, 0.04, 0.26, 0.56);
    const retreat = smoothstep((t - 0.5) / 0.44);
    output.lunge = 0.55 * lunge;
    output.lift += 0.1 * lunge;
    output.pitch -= 0.22 * lunge;
    output.outward += 0.9 * retreat;
    output.opacity *= 1 - retreat;
    return;
  }
  // The shape thins upward and drifts off as smoke.
  const rise = smoothstep((t - 0.08) / 0.8);
  output.outward += 0.3 * rise;
  output.lift += 0.35 * rise;
  output.scaleX *= 1 - 0.6 * rise;
  output.scaleY *= 1 + 0.45 * rise;
  output.scaleZ *= 1 - 0.6 * rise;
  output.opacity *= 1 - smoothstep((t - 0.05) / 0.75);
}

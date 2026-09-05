import { clamp01, pulse, smoothstep } from './animationMath';

export const NET_ATTACK_BASE_DURATION = 1.2;
export const NET_ATTACK_LIFT_END = 0.48;
export const NET_ATTACK_TRAVEL_START = 0.5;
export const NET_ATTACK_SWING_START = 0.63;
export const NET_ATTACK_CONTACT_PROGRESS = 0.68;
export const NET_ATTACK_FOLLOW_THROUGH_END = 0.71;
export const NET_ATTACK_RETURN_START = 0.73;
export const NET_ATTACK_RETURN_END = 0.96;
export const NET_ATTACK_GRIP = [0, 0.095, 0.62] as const;
export const NET_ATTACK_CONTACT = [0, 0.095, -0.7] as const;
export const NET_ATTACK_CONTACT_PITCH = -0.45;
export const NET_ATTACK_ROLL = Math.PI / 2;

/** One swing through contact, with no pause or reversal at impact. */
export function sampleNetAttackSwing(progress: number): number {
  if (progress < NET_ATTACK_SWING_START) {
    return smoothstep((progress - NET_ATTACK_TRAVEL_START)
      / (NET_ATTACK_SWING_START - NET_ATTACK_TRAVEL_START));
  }
  if (progress < NET_ATTACK_CONTACT_PROGRESS) {
    const strike = (progress - NET_ATTACK_SWING_START)
      / (NET_ATTACK_CONTACT_PROGRESS - NET_ATTACK_SWING_START);
    return 1 - strike * strike;
  }
  const followThrough = clamp01((progress - NET_ATTACK_CONTACT_PROGRESS)
    / (NET_ATTACK_FOLLOW_THROUGH_END - NET_ATTACK_CONTACT_PROGRESS));
  const remaining = 1 - smoothstep((progress - NET_ATTACK_RETURN_START)
    / (NET_ATTACK_RETURN_END - NET_ATTACK_RETURN_START));
  return -0.6 * (1 - (1 - followThrough) ** 2) * remaining;
}

/** Reactions begin at contact, never during the approaching swing. */
export function sampleNetAttackContact(progress: number): number {
  return pulse(progress, NET_ATTACK_CONTACT_PROGRESS, 0.692, 0.753);
}

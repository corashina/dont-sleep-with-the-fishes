import { clamp01, pulse, smoothstep } from './animationMath';

export const NET_ATTACK_BASE_DURATION = 1.2;
export const NET_ATTACK_CONTACT_PROGRESS = 0.62;
export const NET_ATTACK_GRIP = [0, 0.095, 0.62] as const;
export const NET_ATTACK_CONTACT = [0, 0.095, -0.7] as const;

/** One swing through contact, with no pause or reversal at impact. */
export function sampleNetAttackSwing(progress: number): number {
  if (progress < 0.5) return smoothstep((progress - 0.36) / 0.14);
  if (progress < NET_ATTACK_CONTACT_PROGRESS) {
    const strike = (progress - 0.5) / (NET_ATTACK_CONTACT_PROGRESS - 0.5);
    return 1 - strike * strike;
  }
  const followThrough = clamp01((progress - NET_ATTACK_CONTACT_PROGRESS) / 0.06);
  const remaining = 1 - smoothstep((progress - 0.76) / 0.2);
  return -0.5 * (1 - (1 - followThrough) ** 2) * remaining;
}

/** Reactions begin at contact, never during the approaching swing. */
export function sampleNetAttackContact(progress: number): number {
  return pulse(progress, NET_ATTACK_CONTACT_PROGRESS, 0.65, 0.78);
}

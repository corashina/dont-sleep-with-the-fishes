import { Vector3, Vector4 } from 'three';

export const CLOUD_RINGS = [
  { count: 5, radius: 2.8, width: 0.85, height: 1.20 },
  { count: 7, radius: 6.2, width: 1.20, height: 1.50 },
  { count: 10, radius: 12, width: 1.80, height: 1.85 },
  { count: 14, radius: 23, width: 2.60, height: 2.30 },
  { count: 18, radius: 48, width: 4.00, height: 2.60 },
] as const;

export const CLOUD_GROUP_COUNT = CLOUD_RINGS.reduce((count, ring) => count + ring.count, 0);
export const CLOUD_RING_PHASE = 0.91;

export interface CloudImpostorLayout {
  centers: Vector4[];
  scales: Vector4[];
  blockers: Vector4[];
  bounds: Float32Array;
}

const variation = (index: number, salt: number): number => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

// Create once per sky. Cloud motion rotates the viewing ray; these arrays never change per frame.
export function createCloudImpostorLayout(): CloudImpostorLayout {
  const centers: Vector4[] = [];
  const scales: Vector4[] = [];
  for (const [ringIndex, ring] of CLOUD_RINGS.entries()) {
    for (let slot = 0; slot < ring.count; slot++) {
      const index = centers.length;
      const angle = (slot + variation(index, 1) * 0.55) / ring.count * Math.PI * 2
        + ringIndex * CLOUD_RING_PHASE;
      const radius = ring.radius * (0.86 + variation(index, 2) * 0.28);
      const size = 0.35 + Math.pow(variation(index, 8), 0.8) * 0.80;
      centers.push(new Vector4(
        Math.sin(angle) * radius,
        2.8 + variation(index, 3) * 1.4,
        -Math.cos(angle) * radius,
        variation(index, 4),
      ));
      scales.push(new Vector4(
        ring.width * (0.85 + variation(index, 5) * 0.30) * size,
        ring.height * (0.80 + variation(index, 6) * 0.40) * size,
        ring.width * (0.70 + variation(index, 7) * 0.25) * size,
        0,
      ));
    }
  }
  return {
    centers,
    scales,
    blockers: centers.map(() => new Vector4(-1, -1, -1, -1)),
    bounds: new Float32Array(CLOUD_GROUP_COUNT),
  };
}

// Select shadow neighbors on the CPU instead of scanning the whole sky for every cloud pixel.
export function updateCloudImpostorShadows(
  layout: CloudImpostorLayout, sun: Vector3, time: number, coverage: number,
): void {
  if (coverage <= 0) return;
  const angle = time * 0.0012;
  const angleCos = Math.cos(angle);
  const angleSin = Math.sin(angle);
  const sunX = angleCos * sun.x + angleSin * sun.z;
  const sunZ = -angleSin * sun.x + angleCos * sun.z;
  const weather = Math.min(1, Math.max(0, (coverage - 0.48) / 0.40));
  const storm = weather * weather * (3 - 2 * weather);
  const cloudCover = Math.min(1, Math.max(0, (coverage - 0.48) / 0.26));
  const calm = 1 - cloudCover * cloudCover * (3 - 2 * cloudCover);
  for (let index = 0; index < CLOUD_GROUP_COUNT; index++) {
    const scale = layout.scales[index]!;
    const presence = Math.min(1, Math.max(0,
      (coverage - 0.20 - layout.centers[index]!.w * 0.48) / 0.14,
    ));
    scale.w = 1 - Math.exp(-presence * presence * (3 - 2 * presence) * 12);
    layout.bounds[index] = Math.max(
      scale.x * (1 + storm * 1.1), scale.y * (1 + storm * 0.4), scale.z * (1 + storm * 1.1),
    ) * 2.1;
    if (calm > 0) {
      const clearance = calmSunClearance(layout.centers[index]!, layout.bounds[index]!, sunX, sun.y, sunZ);
      scale.w *= 1 - calm + calm * clearance;
    }
  }
  for (let index = 0; index < CLOUD_GROUP_COUNT; index++) {
    const blockers = layout.blockers[index]!;
    blockers.set(-1, -1, -1, -1);
    if (layout.scales[index]!.w <= 0) continue;
    let first = Infinity;
    let second = Infinity;
    let third = Infinity;
    let fourth = Infinity;
    for (let other = 0; other < CLOUD_GROUP_COUNT; other++) {
      const score = shadowCandidateScore(layout, index, other, sunX, sun.y, sunZ);
      if (score < first) {
        fourth = third; third = second; second = first; first = score;
        blockers.set(other, blockers.x, blockers.y, blockers.z);
      } else if (score < second) {
        fourth = third; third = second; second = score;
        blockers.set(blockers.x, other, blockers.y, blockers.z);
      } else if (score < third) {
        fourth = third; third = score;
        blockers.set(blockers.x, blockers.y, other, blockers.z);
      } else if (score < fourth) {
        fourth = score;
        blockers.w = other;
      }
    }
  }
}

// Fade entire groups before they cross the sun, keeping their silhouettes intact.
function calmSunClearance(
  center: Vector4, bound: number, sunX: number, sunY: number, sunZ: number,
): number {
  const along = center.x * sunX + center.y * sunY + center.z * sunZ;
  if (along <= 0) return 1;
  const perpendicular = Math.sqrt(Math.max(0,
    center.x * center.x + center.y * center.y + center.z * center.z - along * along,
  ));
  const clearance = Math.min(1, Math.max(0, (perpendicular - bound - along * 0.04) / (along * 0.10)));
  return clearance * clearance * (3 - 2 * clearance);
}

function shadowCandidateScore(
  layout: CloudImpostorLayout, index: number, other: number,
  sunX: number, sunY: number, sunZ: number,
): number {
  const center = layout.centers[index]!;
  const candidate = layout.centers[other]!;
  if (other === index || layout.scales[other]!.w <= 0) return Infinity;
  const dx = candidate.x - center.x;
  const dy = candidate.y - center.y;
  const dz = candidate.z - center.z;
  const along = dx * sunX + dy * sunY + dz * sunZ;
  const perpendicular = Math.max(0, dx * dx + dy * dy + dz * dz - along * along);
  const reach = layout.bounds[index]! + layout.bounds[other]!;
  if (along < -layout.bounds[index]! || perpendicular > reach * reach) return Infinity;
  return perpendicular / (reach * reach) + Math.max(0, along) * 0.002;
}

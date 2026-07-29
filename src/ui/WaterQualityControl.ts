import type { WaterQualityPreference } from '../rendering/waterQuality';
import { BinaryQualityControl } from './BinaryQualityControl';

export class WaterQualityControl extends BinaryQualityControl {
  constructor(preference: WaterQualityPreference) {
    super(preference, {
      kind: 'water',
      label: 'WATER QUALITY',
      note: 'High adds smoother waves and richer surface detail.',
    });
  }
}

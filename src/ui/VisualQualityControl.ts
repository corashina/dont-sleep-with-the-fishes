import type { VisualQualityPreference } from '../rendering/visualQuality';
import { BinaryQualityControl } from './BinaryQualityControl';

export class VisualQualityControl extends BinaryQualityControl {
  constructor(preference: VisualQualityPreference) {
    super(preference, {
      kind: 'ao',
      label: 'AO QUALITY',
      note: 'High sharpens contact depth.',
    });
  }
}

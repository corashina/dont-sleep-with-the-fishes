import {
  type WaterQuality,
  type WaterQualityPreference,
} from '../rendering/waterQuality';
import { QualityControl } from './QualityControl';

export class WaterQualityControl extends QualityControl<WaterQuality> {
  constructor(preference: WaterQualityPreference) {
    super(preference, {
      kind: 'water',
      label: 'WATER QUALITY',
      note: 'High adds smoother waves and richer surface detail.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'high', label: 'HIGH' },
      ],
    });
  }
}

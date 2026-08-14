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
      note: 'Ultra adds a natural ocean surface at high GPU cost.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'high', label: 'HIGH' },
        { value: 'ultra', label: 'ULTRA' },
      ],
    });
  }
}

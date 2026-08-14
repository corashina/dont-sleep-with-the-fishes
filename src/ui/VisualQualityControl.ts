import {
  type VisualQuality,
  type VisualQualityPreference,
} from '../rendering/visualQuality';
import { QualityControl } from './QualityControl';

export class VisualQualityControl extends QualityControl<VisualQuality> {
  constructor(preference: VisualQualityPreference) {
    super(preference, {
      kind: 'ao',
      label: 'AO QUALITY',
      note: 'High sharpens contact depth.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'high', label: 'HIGH' },
      ],
    });
  }
}

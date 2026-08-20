import {
  type VisualQuality,
  type VisualQualityPreference,
} from '../rendering/visualQuality';
import { QualityControl } from './QualityControl';

export class VisualQualityControl extends QualityControl<VisualQuality> {
  constructor(preference: VisualQualityPreference) {
    super(preference, {
      kind: 'visual',
      label: 'VISUAL QUALITY',
      note: 'Medium adds atmosphere. High sharpens all effects.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'medium', label: 'MEDIUM' },
        { value: 'high', label: 'HIGH' },
      ],
    });
  }
}

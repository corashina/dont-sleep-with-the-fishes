import {
  type ShadowQuality,
  type ShadowQualityPreference,
} from '../rendering/shadowQuality';
import { QualityControl } from './QualityControl';

export class ShadowQualityControl extends QualityControl<ShadowQuality> {
  constructor(preference: ShadowQualityPreference) {
    super(preference, {
      kind: 'shadows',
      label: 'SHADOW QUALITY',
      note: 'High adds softer shadow edges at a moderate GPU cost.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'high', label: 'HIGH' },
      ],
    });
  }
}

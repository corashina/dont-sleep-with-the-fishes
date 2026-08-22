import {
  type AntiAliasingQuality,
  type AntiAliasingQualityPreference,
} from '../rendering/antiAliasingQuality';
import { QualityControl } from './QualityControl';

export class AntiAliasingQualityControl
  extends QualityControl<AntiAliasingQuality> {
  constructor(preference: AntiAliasingQualityPreference) {
    super(preference, {
      kind: 'anti-aliasing',
      label: 'ANTI-ALIASING',
      note: 'High smooths edges further at a moderate GPU cost.',
      choices: [
        { value: 'low', label: 'LOW' },
        { value: 'high', label: 'HIGH' },
      ],
    });
  }
}

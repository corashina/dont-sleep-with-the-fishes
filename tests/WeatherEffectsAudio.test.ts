import { describe, expect, it, vi } from 'vitest';
import { Scene, Vector3 } from 'three';
import { WeatherEffects } from '../src/world/WeatherEffects';

describe('WeatherEffects audio hook', () => {
  it('reports each authored lightning strike', () => {
    const effects = new WeatherEffects(new Scene(), () => 0.5);
    const onStrike = vi.fn();
    effects.setLightningStrikeListener(onStrike);
    effects.setWeather('thunderstorm');

    effects.update(1.35, 1.35, new Vector3());

    expect(onStrike).toHaveBeenCalledOnce();
    effects.dispose();
  });
});

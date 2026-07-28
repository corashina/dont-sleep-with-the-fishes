import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_WEATHER_IDS,
  presentationWeatherForEvent,
  presentationWeatherProfile,
  resolvePresentationWeather,
} from '../src/weather/presentationWeather';

describe('presentation weather catalog', () => {
  it('lists the authored presentation choices in menu order', () => {
    expect(PRESENTATION_WEATHER_IDS).toEqual([
      'calm', 'overcast', 'squall', 'rain',
      'wind', 'thunderstorm', 'waves', 'fog',
    ]);
  });

  it('provides frozen profiles with distinct visual signatures and usable waves', () => {
    const profiles = PRESENTATION_WEATHER_IDS.map(presentationWeatherProfile);
    const signatures = profiles.map((profile) => JSON.stringify({
      skyWeather: profile.skyWeather,
      fogDensityScale: profile.fogDensityScale,
      lightIntensityScale: profile.lightIntensityScale,
      waveScale: profile.waveScale,
      rainIntensity: profile.rainIntensity,
      mistIntensity: profile.mistIntensity,
      sprayIntensity: profile.sprayIntensity,
      lightning: profile.lightning,
    }));

    expect(profiles.every(Object.isFrozen)).toBe(true);
    expect(new Set(signatures)).toHaveLength(PRESENTATION_WEATHER_IDS.length);
    expect(profiles.every((profile) => Number.isFinite(profile.waveScale) && profile.waveScale > 0)).toBe(true);
  });

  it('makes rain, wind, and fog severe without blurring their roles', () => {
    const rain = presentationWeatherProfile('rain');
    const wind = presentationWeatherProfile('wind');
    const fog = presentationWeatherProfile('fog');

    expect(rain.rainIntensity).toBe(1);
    expect(rain.lightIntensityScale).toBeLessThan(0.65);
    expect(wind.rainIntensity).toBe(0);
    expect(wind.mistIntensity).toBe(1);
    expect(wind.sprayIntensity).toBe(1);
    expect(wind.waveScale).toBeGreaterThan(rain.waveScale);
    expect(fog.fogDensityScale).toBeGreaterThan(4);
    expect(fog.lightIntensityScale).toBeLessThan(0.45);
    expect(fog.mistIntensity).toBe(1);
    expect(fog.sprayIntensity).toBe(0);
  });

  it('maps only authored survival events to presentation weather', () => {
    expect(presentationWeatherForEvent('shower-night')).toBe('rain');
    expect(presentationWeatherForEvent('windy-night')).toBe('wind');
    expect(presentationWeatherForEvent('thunderstorm')).toBe('thunderstorm');
    expect(presentationWeatherForEvent('restless-waves')).toBe('waves');
    expect(presentationWeatherForEvent('man-in-the-fog')).toBe('fog');
    expect(presentationWeatherForEvent('dangerous-waters')).toBeNull();
  });

  it('prioritizes forced weather over event and normal weather', () => {
    expect(resolvePresentationWeather('rain', 'fog')).toEqual({
      id: 'fog',
      source: 'forced',
    });
    expect(resolvePresentationWeather('rain', null)).toEqual({ id: 'rain', source: 'event' });
    expect(resolvePresentationWeather(null, null)).toEqual({ id: 'calm', source: 'normal' });
  });
});

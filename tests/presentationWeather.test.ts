import { describe, expect, it } from 'vitest';
import { presentationWeatherForEvent } from '../src/weather/presentationWeather';

describe('event presentation weather', () => {
  it.each([
    ['dangerous-waters', 'squall'],
    ['leak', 'rain'],
    ['school-of-fish', null],
    ['snatcher', 'waves'],
    ['death-stare', 'waves'],
    ['swarm-of-anglerfish', 'waves'],
    ['tornado', 'wind'],
    ['shower-night', 'rain'],
    ['windy-night', 'wind'],
    ['bad-sleep', 'overcast'],
    ['thunderstorm', 'thunderstorm'],
    ['restless-waves', 'waves'],
    ['man-in-the-fog', 'fog'],
    ['ghosts', 'fog'],
    ['eerie-melody', 'fog'],
    ['face-on-the-moon', null],
    ['sick-companion', 'overcast'],
    ['shadow-figure', 'fog'],
    ['guarded-sleep', 'overcast'],
    ['check-the-back', 'waves'],
    ['flowers', null],
    ['chest-attack', 'waves'],
    ['midnight-tour', 'fog'],
    ['night-trader', null],
    ['handyman', 'overcast'],
    ['other-people', null],
  ] as const)('maps %s to %s', (eventId, expectedWeather) => {
    expect(presentationWeatherForEvent(eventId)).toBe(expectedWeather);
  });
});

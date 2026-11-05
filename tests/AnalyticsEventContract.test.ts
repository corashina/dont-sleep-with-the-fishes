// Importance: 92/100. Bad rows in the Analytics Engine dataset cannot be removed.
import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/analytics/eventContract';

describe('analytics event contract', () => {
  it.each([
    ['{"event":"visit"}', { event: 'visit' }],
    ['{"event":"game_start"}', { event: 'game_start' }],
    ['{"event":"game_end","ending":"dorothy","day":0}', { event: 'game_end', ending: 'dorothy', day: 0 }],
    ['{"day":999,"event":"game_end","ending":"kraken"}', { event: 'game_end', ending: 'kraken', day: 999 }],
  ])('accepts %s', (text, expected) => {
    expect(parseEvent(text)).toEqual(expected);
  });

  it.each([
    ['bad JSON', '{"event":'],
    ['a non-object', '"visit"'],
    ['an array', '["visit"]'],
    ['an unknown name', '{"event":"page_view"}'],
    ['fields on a visit', '{"event":"visit","day":1}'],
    ['a missing day', '{"event":"game_end","ending":"death"}'],
    ['an unknown ending', '{"event":"game_end","ending":"drowned","day":1}'],
    ['a negative day', '{"event":"game_end","ending":"death","day":-1}'],
    ['a day over the bound', '{"event":"game_end","ending":"death","day":1000}'],
    ['a fractional day', '{"event":"game_end","ending":"death","day":1.5}'],
    ['a text day', '{"event":"game_end","ending":"death","day":"1"}'],
    ['an extra field', '{"event":"game_end","ending":"death","day":1,"x":1}'],
    ['an oversized body', `{"event":"visit","pad":"${'x'.repeat(256)}"}`],
  ])('rejects %s', (_label, text) => {
    expect(parseEvent(text)).toBeNull();
  });
});

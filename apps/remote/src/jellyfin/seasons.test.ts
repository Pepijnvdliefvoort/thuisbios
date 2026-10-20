import { describe, expect, it } from 'vitest';
import { chooseSeasonId } from './seasons';

const seasons = [{ Id: 's1' }, { Id: 's2' }, { Id: 's3' }];

describe('chooseSeasonId', () => {
  it('prefers the season the user tapped', () => {
    expect(chooseSeasonId('s2', 's3', seasons)).toBe('s2');
  });
  it('follows the initial season when nothing was picked', () => {
    expect(chooseSeasonId(null, 's3', seasons)).toBe('s3');
  });
  it('falls back to the first season when the initial one is unknown or missing', () => {
    expect(chooseSeasonId(null, 'nope', seasons)).toBe('s1');
    expect(chooseSeasonId(null, undefined, seasons)).toBe('s1');
  });
  it('returns null while seasons are not loaded or empty', () => {
    expect(chooseSeasonId(null, 's3', null)).toBeNull();
    expect(chooseSeasonId(null, 's3', [])).toBeNull();
  });
});

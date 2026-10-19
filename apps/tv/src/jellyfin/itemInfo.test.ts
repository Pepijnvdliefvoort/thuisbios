import { describe, expect, it } from 'vitest';
import {
  displayTitle,
  episodeLabel,
  episodeSubtitle,
  formatHms,
  formatRuntime,
  hasResume,
  metaParts,
  playerTitle,
  progressFraction,
  resumeSeconds,
} from './itemInfo';
import type { BaseItem } from './types';

const MIN = 600000000;
const episode: BaseItem = {
  Id: 'e',
  Name: 'Pilot',
  Type: 'Episode',
  SeriesName: 'Show',
  ParentIndexNumber: 1,
  IndexNumber: 3,
};

describe('formatRuntime', () => {
  it('formats hours and minutes', () => {
    expect(formatRuntime(112 * MIN)).toBe('1h 52m');
    expect(formatRuntime(45 * MIN)).toBe('45m');
    expect(formatRuntime(120 * MIN)).toBe('2h');
    expect(formatRuntime(undefined)).toBe('');
    expect(formatRuntime(0)).toBe('');
  });
});

describe('formatHms', () => {
  it('always shows hours', () => {
    expect(formatHms(42 * 60 + 10)).toBe('0:42:10');
    expect(formatHms(3725)).toBe('1:02:05');
    expect(formatHms(NaN)).toBe('0:00:00');
  });
});

describe('resume and progress', () => {
  it('reads the saved position', () => {
    const item: BaseItem = { Id: 'a', Name: 'a', UserData: { PlaybackPositionTicks: 30 * 10000000 } };
    expect(resumeSeconds(item)).toBe(30);
    expect(hasResume(item)).toBe(true);
    expect(hasResume({ Id: 'b', Name: 'b' })).toBe(false);
    expect(hasResume({ Id: 'b', Name: 'b', UserData: { PlaybackPositionTicks: 0 } })).toBe(false);
  });

  it('uses PlayedPercentage, else derives it, and hides 0 and 100', () => {
    expect(progressFraction({ Id: 'a', Name: 'a', UserData: { PlayedPercentage: 25 } })).toBe(0.25);
    expect(
      progressFraction({ Id: 'a', Name: 'a', RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 50 } }),
    ).toBe(0.5);
    expect(progressFraction({ Id: 'a', Name: 'a', UserData: { PlayedPercentage: 100 } })).toBe(0);
    expect(progressFraction({ Id: 'a', Name: 'a' })).toBe(0);
  });
});

describe('episode text', () => {
  it('builds labels', () => {
    expect(episodeLabel(episode)).toBe('S1:E3');
    expect(episodeSubtitle(episode)).toBe('S1:E3 · Pilot');
    expect(displayTitle(episode)).toBe('Show');
    expect(playerTitle(episode)).toBe('Show — S1:E3 Pilot');
  });
  it('leaves movies alone', () => {
    const movie: BaseItem = { Id: 'm', Name: 'Movie', Type: 'Movie' };
    expect(episodeLabel(movie)).toBe('');
    expect(episodeSubtitle(movie)).toBe('');
    expect(displayTitle(movie)).toBe('Movie');
    expect(playerTitle(movie)).toBe('Movie');
  });
});

describe('metaParts', () => {
  it('lists the known parts for a movie', () => {
    const movie: BaseItem = {
      Id: 'm',
      Name: 'M',
      Type: 'Movie',
      ProductionYear: 2010,
      OfficialRating: 'PG-13',
      RunTimeTicks: 148 * MIN,
      CommunityRating: 8.77,
    };
    expect(metaParts(movie)).toEqual(['2010', 'PG-13', '2h 28m', '★ 8.8']);
  });
  it('shows seasons for a series and skips unknown parts', () => {
    expect(metaParts({ Id: 's', Name: 'S', Type: 'Series', ProductionYear: 2020, ChildCount: 1 })).toEqual([
      '2020',
      '1 season',
    ]);
    expect(metaParts({ Id: 's', Name: 'S', Type: 'Series', ChildCount: 3 })).toEqual(['3 seasons']);
    expect(metaParts({ Id: 'x', Name: 'x' })).toEqual([]);
  });
});

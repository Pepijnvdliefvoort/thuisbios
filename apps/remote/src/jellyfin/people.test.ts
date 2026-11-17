import { describe, expect, it } from 'vitest';
import { castOf, crewOf, formatBirthDate, hasPeople, initials, MAX_CAST, personImageUrl, personItemImageUrl } from './people';
import type { Person } from './types';

const p = (Id: string, Type: string, extra: Partial<Person> = {}): Person => ({ Id, Name: `Name ${Id}`, Type, ...extra });

describe('castOf', () => {
  it('keeps actors and guest stars in order and drops the crew', () => {
    const people = [p('a', 'Actor'), p('d', 'Director'), p('b', 'GuestStar'), p('w', 'Writer'), p('c', 'Actor')];
    expect(castOf({ People: people }).map((x) => x.Id)).toEqual(['a', 'b', 'c']);
  });
  it('drops repeats and caps the list', () => {
    const many = Array.from({ length: 40 }, (_, i) => p(`x${i}`, 'Actor'));
    expect(castOf({ People: [many[0], ...many] })).toHaveLength(MAX_CAST);
    expect(castOf({ People: many }, 3).map((x) => x.Id)).toEqual(['x0', 'x1', 'x2']);
  });
  it('copes with a missing list', () => {
    expect(castOf({})).toEqual([]);
  });
});

describe('crewOf', () => {
  it('groups directors and writers and pluralises the label', () => {
    const groups = crewOf({ People: [p('d', 'Director'), p('w1', 'Writer'), p('w2', 'Writer'), p('w1', 'Writer'), p('a', 'Actor')] });
    expect(groups.map((g) => [g.label, g.people.map((x) => x.Id)])).toEqual([
      ['Director', ['d']],
      ['Writers', ['w1', 'w2']],
    ]);
  });
  it('leaves out empty groups', () => {
    expect(crewOf({ People: [p('a', 'Actor')] })).toEqual([]);
  });
});

describe('hasPeople', () => {
  it('is true for cast or crew and false otherwise', () => {
    expect(hasPeople({ People: [p('a', 'Actor')] })).toBe(true);
    expect(hasPeople({ People: [p('d', 'Director')] })).toBe(true);
    expect(hasPeople({ People: [p('x', 'Producer')] })).toBe(false);
    expect(hasPeople({})).toBe(false);
  });
});

describe('initials', () => {
  it('takes the first and last initial', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Ada Augusta King Lovelace')).toBe('AL');
    expect(initials('  cher ')).toBe('C');
    expect(initials('')).toBe('?');
  });
});

describe('personImageUrl', () => {
  it('asks for the exact size with the tag', () => {
    expect(personImageUrl('http://s', { Id: 'p 1', PrimaryImageTag: 't' }, 168, 168)).toBe(
      'http://s/Items/p%201/Images/Primary?fillWidth=168&fillHeight=168&quality=80&tag=t',
    );
  });
  it('is empty without a photo', () => {
    expect(personImageUrl('http://s', { Id: 'p' }, 1, 1)).toBe('');
    expect(personItemImageUrl('http://s', { Id: 'p' }, 1, 1)).toBe('');
    expect(personItemImageUrl('http://s', { Id: 'p', ImageTags: { Primary: 't' } }, 2, 3)).toContain('/Items/p/Images/Primary?fillWidth=2&fillHeight=3');
  });
});

describe('formatBirthDate', () => {
  it('formats the UTC day', () => {
    expect(formatBirthDate('1975-03-12T00:00:00.0000000Z', 'en-GB')).toBe('12 Mar 1975');
  });
  it('is empty for nothing or garbage', () => {
    expect(formatBirthDate(undefined)).toBe('');
    expect(formatBirthDate('nope')).toBe('');
  });
});

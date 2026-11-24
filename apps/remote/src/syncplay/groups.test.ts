import { describe, expect, it } from 'vitest';
import { groupCardLabel, joinableGroups, newGroupName } from './groups';
import type { GroupInfo } from './protocol';

const g = (id: string, participants: string[], name = `Group ${id}`): GroupInfo => ({ groupId: id, groupName: name, state: 'Playing', participants, lastUpdatedAt: 0 });

describe('joinableGroups', () => {
  it('leaves out the group we are in and empty groups', () => {
    const list = [g('a', ['x']), g('b', []), g('c', ['y', 'z'])];
    expect(joinableGroups(list, 'a').map((x) => x.groupId)).toEqual(['c']);
    expect(joinableGroups(list, null).map((x) => x.groupId)).toEqual(['c', 'a']);
  });
  it('does not change the list it is given', () => {
    const list = [g('a', ['x']), g('c', ['y', 'z'])];
    joinableGroups(list, null);
    expect(list.map((x) => x.groupId)).toEqual(['a', 'c']);
  });
});

describe('groupCardLabel', () => {
  it('shows the name and how many are watching', () => {
    expect(groupCardLabel(g('a', ['x', 'y'], "Sam's group"))).toBe("Sam's group · 2 watching");
    expect(groupCardLabel(g('a', ['x'], ''))).toBe('Watch together · 1 watching');
  });
});

describe('newGroupName', () => {
  it('uses the user name, with a fallback', () => {
    expect(newGroupName('Sam')).toBe("Sam's group");
    expect(newGroupName('  ')).toBe('Watch together');
    expect(newGroupName(undefined)).toBe('Watch together');
  });
});

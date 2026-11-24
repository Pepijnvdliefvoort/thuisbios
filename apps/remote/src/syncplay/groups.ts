import type { GroupInfo } from './protocol';

/** Groups worth offering on Home: not the one this device is in, and not empty. Busiest first. */
export function joinableGroups(groups: readonly GroupInfo[], currentGroupId: string | null): GroupInfo[] {
  return groups
    .filter((g) => g.groupId !== currentGroupId && g.participants.length > 0)
    .slice()
    .sort((a, b) => b.participants.length - a.participants.length);
}

/** "Name's group · 2 watching" */
export function groupCardLabel(g: Pick<GroupInfo, 'groupName' | 'participants'>): string {
  return `${g.groupName || 'Watch together'} · ${g.participants.length} watching`;
}

/** The name of the group a user starts: "<user>'s group". */
export function newGroupName(userName: string | undefined): string {
  const name = (userName || '').trim();
  return name ? `${name}'s group` : 'Watch together';
}

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSeenRequests, markRequestSeen } from './requestsSeen';

describe('requests seen store', () => {
  beforeEach(() => localStorage.clear());

  it('is empty at first and remembers per user', () => {
    expect(loadSeenRequests('u1')).toEqual([]);
    markRequestSeen('u1', 'a');
    markRequestSeen('u1', 'b');
    markRequestSeen('u1', 'a');
    expect(loadSeenRequests('u1')).toEqual(['b', 'a']);
    expect(loadSeenRequests('u2')).toEqual([]);
  });

  it('keeps the newest 200 ids', () => {
    for (let i = 0; i < 205; i++) markRequestSeen('u', `r${i}`);
    const ids = loadSeenRequests('u');
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('r5');
    expect(ids[199]).toBe('r204');
  });

  it('ignores unreadable data and a failing store', () => {
    localStorage.setItem('thuisbios.requestsSeen.u', '{oops');
    expect(loadSeenRequests('u')).toEqual([]);
    localStorage.setItem('thuisbios.requestsSeen.u', '[1,"a"]');
    expect(loadSeenRequests('u')).toEqual(['a']);
  });
});

import { describe, expect, it } from 'vitest';
import { spotlightItems } from './spotlight';
import type { BaseItem } from './types';

const item = (id: string, backdrop = true): BaseItem => ({ Id: id, Name: id, BackdropImageTags: backdrop ? ['t'] : [] });

describe('spotlightItems', () => {
  it('alternates movies and shows', () => {
    const out = spotlightItems([item('m1'), item('m2')], [item('s1'), item('s2')]);
    expect(out.map((i) => i.Id)).toEqual(['m1', 's1', 'm2', 's2']);
  });

  it('skips items without a backdrop', () => {
    const out = spotlightItems([item('m1', false), item('m2')], [item('s1', false)]);
    expect(out.map((i) => i.Id)).toEqual(['m2']);
  });

  it('caps the list', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id));
    expect(spotlightItems(many, many.map((i) => item('x' + i.Id)), 5)).toHaveLength(5);
    expect(spotlightItems(many, [], 3)).toHaveLength(3);
  });

  it('is empty without art', () => {
    expect(spotlightItems([item('m', false)], [])).toEqual([]);
  });
});

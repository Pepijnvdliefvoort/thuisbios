import { describe, expect, it } from 'vitest';
import type { BaseItem } from '../jellyfin/types';
import { buildSlides, formatClock, nextSlide } from './slides';

const client = {
  imageUrlSized: (id: string, type: string, tag: string, w: number, h: number) => `${id}/${type}/${tag}/${w}x${h}`,
};

describe('buildSlides', () => {
  const items: BaseItem[] = [
    { Id: 'a', Name: 'A', ProductionYear: 2001, Overview: ' Line one.\n\nLine two. ', BackdropImageTags: ['t1'], ImageTags: { Logo: 'l1' } },
    { Id: 'b', Name: 'B', ImageTags: { Thumb: 'x' } },
    { Id: 'c', Name: 'C', BackdropImageTags: ['t3'] },
  ];
  it('keeps only items with a real backdrop and sizes the images exactly', () => {
    const slides = buildSlides(items, client);
    expect(slides.map((s) => s.id)).toEqual(['a', 'c']);
    expect(slides[0].backdrop).toBe('a/Backdrop/t1/1920x1080');
    expect(slides[0].logo).toBe('a/Logo/l1/640x180');
    expect(slides[0].year).toBe('2001');
    expect(slides[0].overview).toBe('Line one. Line two.');
    expect(slides[1].logo).toBe('');
    expect(slides[1].year).toBe('');
  });
});

describe('helpers', () => {
  it('wraps the slide index', () => {
    expect(nextSlide(0, 3)).toBe(1);
    expect(nextSlide(2, 3)).toBe(0);
    expect(nextSlide(0, 0)).toBe(0);
  });
  it('formats a 24 hour clock', () => {
    expect(formatClock(new Date(2026, 0, 1, 7, 5))).toBe('07:05');
    expect(formatClock(new Date(2026, 0, 1, 23, 59))).toBe('23:59');
  });
});

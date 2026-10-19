import { artFor, artUrl } from '../jellyfin/art';
import type { BaseItem } from '../jellyfin/types';

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const LOGO_W = 640;
export const LOGO_H = 180;
/** Time one slide is on screen, including the crossfade into the next. */
export const SLIDE_MS = 12000;
/** The library list is fetched again this often. */
export const REFRESH_MS = 30 * 60 * 1000;

export interface Slide {
  id: string;
  title: string;
  year: string;
  overview: string;
  backdrop: string;
  logo: string;
}

interface UrlMaker {
  imageUrlSized(itemId: string, type: 'Primary' | 'Backdrop' | 'Thumb' | 'Logo', tag: string, w: number, h: number): string;
}

/** Slides for the items that have a real backdrop (a thumb or poster would look wrong full screen). */
export function buildSlides(items: BaseItem[], client: UrlMaker): Slide[] {
  const slides: Slide[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const art = artFor(item, 'backdrop');
    if (!art || art.type !== 'Backdrop') continue;
    slides.push({
      id: item.Id,
      title: item.Name,
      year: item.ProductionYear ? String(item.ProductionYear) : '',
      overview: (item.Overview || '').replace(/\s+/g, ' ').trim(),
      backdrop: artUrl(client, art, SLIDE_W, SLIDE_H),
      logo: artUrl(client, artFor(item, 'logo'), LOGO_W, LOGO_H),
    });
  }
  return slides;
}

/** Next index, wrapping around. */
export const nextSlide = (index: number, count: number): number => (count <= 0 ? 0 : (index + 1) % count);

const pad = (n: number): string => (n < 10 ? '0' : '') + n;

/** 24-hour HH:MM. */
export const formatClock = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
